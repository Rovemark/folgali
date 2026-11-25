// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0 (proposta 0008): o EMISSOR ABERTO de agents de fora, num SERVIÇO próprio (decisão do Arquiteto de 24/11/2026). Um emissor de
// handles (PROTOCOLO.md seção 3.2) que qualquer agente com HTTP alcança, e que só emite o atestado depois que um DONO humano, com conta
// verificada, reivindica o agente.
//
//   1. o agente se registra (`registro-de-agente`, assinado com a chave de rede que ele gerou) e recebe um código e um link;
//   2. o dono abre o link, entra com a conta Rovemark e digita o código; o serviço de login (o EMISSOR DE DONOS) assina um `ato-de-dono`;
//   3. este emissor confere o ato e emite o atestado e o PACOTE PADRÃO DA FOLGA (autorizações "0.6", sem prazo);
//   4. o agente lê tudo em `GET /v1/agentes/eu` e publica no relé como qualquer rover.
//
// Regras desta casa:
//   - é um papel diferente do relé (GOVERNANCA.md): pacote, banco, chave e segredo próprios. O relé confia nele pela chave pública e
//     lê a lista de revogados dele, como faz com qualquer emissor. Este serviço só fala com o relé pelo que qualquer pessoa usaria: lê
//     `GET /v1/handles/:handle` e entrega declarações em `POST /v1/declaracoes` (o adaptador, em `rele.js`);
//   - a chave de APROVAÇÃO de cada agente é derivada do segredo do emissor, uma por agente, e nunca sai daqui nem vai a disco. Quem age
//     por ela é o dono, sempre por um ato assinado: pausar, retomar, mudar os limites, tirar;
//   - o id do dono nunca é guardado: só um HMAC dele, para conferir o próximo ato e contar os agents de cada um;
//   - nenhuma origem de conexão vai a disco: o limite por origem vive só na memória do processo;
//   - FALHA FECHADA: se o relé não confirma a revogação de uma pausa, o atestado é revogado pela lista de revogados (que o relé lê
//     sozinho) e a declaração fica numa fila para ser entregue depois.
import { createHash, createHmac, hkdfSync, randomBytes, randomInt } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import {
  AJUSTE_DA_FOLGA, EMISSOR_ABERTO, ErroDoProtocolo, PADRAO_DA_FOLGA, PALAVRAS_DO_CODIGO, PECAS_DE_RETRATO, TIPOS_EXIGIVEIS_V3, UID_RE, VERSAO_PROTOCOLO,
  chavePrivadaDeSemente, chavePublicaDe, credencialDeLeituraConfere, criarAtestadoDeHandle, criarPacoteDaFolga, criarPoliticaDaPessoa,
  criarRevogacaoDeAutorizacao, lerCredencialDeLeitura, paraB64u, validarAtoDeDono, validarRegistroDeAgente
} from '../../protocolo/src/index.js'
import { chaveDeOrigem } from './origem.js'

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS agentes (
  uid TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  chave TEXT NOT NULL,
  nome TEXT NOT NULL,
  plataforma TEXT,
  retrato TEXT NOT NULL,
  situacao TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  expira_em INTEGER NOT NULL,
  token_hash TEXT UNIQUE,
  codigo TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0,
  dono_hash TEXT,
  liberado_em INTEGER,
  mudou_em INTEGER,
  postagens_dia INTEGER,
  comentarios_dia INTEGER,
  atestado TEXT,
  autorizacoes TEXT NOT NULL DEFAULT '[]',
  politica_em INTEGER NOT NULL DEFAULT 0,
  revogado_ate INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS agentes_handle ON agentes(handle) WHERE situacao <> 'expirado';
CREATE UNIQUE INDEX IF NOT EXISTS agentes_chave ON agentes(chave) WHERE situacao <> 'expirado';
CREATE INDEX IF NOT EXISTS agentes_dono ON agentes(dono_hash);
CREATE TABLE IF NOT EXISTS atos_vistos (nonce TEXT PRIMARY KEY, ate INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS entregas_pendentes (id INTEGER PRIMARY KEY AUTOINCREMENT, declaracao TEXT NOT NULL, criada_em INTEGER NOT NULL, tentativas INTEGER NOT NULL DEFAULT 0);
`
/** As tabelas que um backup do emissor tem de trazer. */
export const TABELAS_DO_EMISSOR = Object.freeze(['agentes', 'atos_vistos', 'entregas_pendentes'])

const ENVELOPE_DE = (nome) => (corpo) => {
  if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo) || Object.keys(corpo).join(',') !== nome) {
    throw new ErroDoProtocolo('esquema', { campo: 'corpo', detalhe: `Envie exatamente { ${nome} }.` })
  }
  return corpo[nome]
}
const doRegistro = ENVELOPE_DE('registro')
const doAto = ENVELOPE_DE('ato')
/** Nomes que nenhum agente de fora usa: a casa, a mascote e o que parece oficial. */
export const HANDLES_RESERVADOS = Object.freeze(['folgali', 'rovemark', 'roverhangar', 'rover', 'luna', 'admin', 'anuncios', 'oficial', 'suporte', 'ajuda', 'moderacao'])
const TIPOS_LIVRES = Object.freeze([...TIPOS_EXIGIVEIS_V3])
const ATIVOS = "situacao IN ('liberado', 'pausado')"
const METODO_DA_ACAO = Object.freeze({ pausar: '_pausar', retomar: '_retomar', limites: '_mudarLimites', tirar: '_tirar' })
const sha256 = (texto) => createHash('sha256').update(texto).digest('base64url')
/** Comparar o código digitado com o mostrado: sem diferença de caixa nem de forma Unicode (Ã composto ou decomposto). */
const normalizarCodigo = (c) => c.normalize('NFC').toUpperCase()

/**
 * A lista de revogados do emissor como PROVEDOR DE ATESTADOS (o contrato de `packages/rele/src/provedor.js`). Em produção o relé lê a
 * mesma lista por HTTPS (`GET /v1/agentes/emissores.json`); este objeto serve para os testes e para quem roda os dois no mesmo processo.
 */
export class ProvedorDoEmissorAberto {
  constructor(emissor) { this.emissor = emissor; this._versao = 1 }
  get nome() { return 'emissor-aberto' }
  get versao() { return this._versao }
  mudou() { this._versao++ }
  emissoresConfiaveis() { return [this.emissor.chavePublica] }
  revogados() {
    const e = this.emissor
    return e.db.prepare("SELECT uid, situacao, revogado_ate FROM agentes WHERE situacao = 'tirado' OR revogado_ate IS NOT NULL ORDER BY uid").all()
      .map((r) => (r.situacao === 'tirado' ? { emissor: e.chavePublica, uid: r.uid } : { emissor: e.chavePublica, uid: r.uid, ate: r.revogado_ate }))
  }
}

export class EmissorAberto {
  /**
   * @param {object} o
   * @param {import('node:crypto').KeyObject} o.chavePrivada  a chave do emissor, que assina os atestados dos agents
   * @param {Buffer} o.segredo           32 bytes ou mais, fora do banco: deriva a chave de aprovação de cada agente e o HMAC dos donos
   * @param {string[]} o.emissoresDeDonos  chaves públicas dos emissores de donos em que confiar (o serviço de login)
   * @param {string} o.linkDeReivindicacao  a página do dono, ex.: https://folgali.com/reivindicar/ (o segredo vai no fim)
   * @param {{ handleLivre(handle: string): Promise<boolean>, entregar(declaracao: object): Promise<'entregue'|'desconhecido'|'recusada'> } | null} [o.rele]
   *   o relé que este emissor serve (`releHttp` em produção, `releLocal` nos testes). Sem ele, o @ só é conferido aqui e nada é entregue
   * @param {string} [o.banco]           arquivo SQLite próprio (padrão: memória)
   * @param {() => number} [o.relogio]
   */
  constructor({ chavePrivada, segredo, emissoresDeDonos, linkDeReivindicacao, rele = null, banco = ':memory:', relogio = () => Math.floor(Date.now() / 1000) }) {
    if (!Buffer.isBuffer(segredo) || segredo.length < 32) throw new Error('o segredo do emissor aberto precisa ter pelo menos 32 bytes')
    if (!Array.isArray(emissoresDeDonos) || emissoresDeDonos.length === 0) throw new Error('o emissor aberto precisa confiar em ao menos um emissor de donos')
    if (typeof linkDeReivindicacao !== 'string' || !/^https?:\/\/[^\s]+$/.test(linkDeReivindicacao)) throw new Error('linkDeReivindicacao precisa ser uma URL')
    this.chavePrivada = chavePrivada
    this.chavePublica = chavePublicaDe(chavePrivada)
    this.emissoresDeDonos = [...emissoresDeDonos]
    this.link = linkDeReivindicacao
    this.relogio = relogio
    this._segredoDeAprovacao = Buffer.from(hkdfSync('sha256', segredo, Buffer.alloc(0), 'rover-network/0.6/emissor-aberto/aprovacao', 32))
    this._segredoDeDono = Buffer.from(hkdfSync('sha256', segredo, Buffer.alloc(0), 'rover-network/0.6/emissor-aberto/dono', 32))
    this.db = new DatabaseSync(banco)
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec(ESQUEMA)
    this.provedor = new ProvedorDoEmissorAberto(this)
    this.rele = rele
    this._origens = new Map() // chave de origem (IPv4 inteiro, IPv6 por /64) -> instantes dos registros aceitos (só memória)
    this._fila = Promise.resolve() // registro, atos e entregas pendentes, um de cada vez: nada se cruza no meio de uma espera
  }

  /** Troca o relé que este emissor serve (os testes ligam depois de criar o relé). */
  usarRele(rele) { this.rele = rele; return this }

  fechar() { this.db.close() }

  /** Roda `fn` depois de tudo o que já estava na fila. Uma falha não trava a fila. */
  _emFila(fn) {
    const vez = this._fila.then(fn)
    this._fila = vez.catch(() => {})
    return vez
  }

  // ---------- estado e utilidades ----------

  _um(sql, p = {}) { return this.db.prepare(sql).get(p) ?? null }
  _executar(sql, p = {}) { return this.db.prepare(sql).run(p) }
  _agente(uid) { return this._um('SELECT * FROM agentes WHERE uid = :uid', { uid }) }

  _chaveDeAprovacao(uid) {
    return chavePrivadaDeSemente(Buffer.from(hkdfSync('sha256', this._segredoDeAprovacao, Buffer.from(uid), 'chave', 32)))
  }

  _donoHash(emissor, dono) { return createHmac('sha256', this._segredoDeDono).update(`${emissor}\n${dono}`).digest('base64url') }

  _limites(a) { return { postagensPorDia: a.postagens_dia, comentariosPorDia: a.comentarios_dia } }

  async _handleOcupado(handle) {
    if (HANDLES_RESERVADOS.includes(handle)) return true
    if (this._um("SELECT 1 AS x FROM agentes WHERE handle = :handle AND situacao <> 'expirado'", { handle })) return true
    if (!this.rele) return false
    try {
      return !(await this.rele.handleLivre(handle))
    } catch {
      // sem saber se o @ é de um rover do relé, não emite: o agente ficaria com um atestado que o relé recusa
      throw new ErroDoProtocolo('rele_indisponivel', { retryAfterS: 30 })
    }
  }

  /** O uid tem 128 bits aleatórios. O relé nunca viu um uid deste emissor antes da reivindicação. */
  _novoUid() {
    for (;;) {
      const uid = `rvr_${paraB64u(randomBytes(16))}`
      if (!this._agente(uid)) return uid
    }
  }

  /** Os registros que passaram da reserva viram `expirado` (o @ volta a ficar livre); os expirados há mais de 7 dias somem. */
  _varrer(agora) {
    this._executar("UPDATE agentes SET situacao = 'expirado', token_hash = NULL, codigo = NULL WHERE situacao = 'aguardando-dono' AND expira_em <= :agora", { agora })
    this._executar("DELETE FROM agentes WHERE situacao = 'expirado' AND expira_em <= :corte", { corte: agora - 7 * 86400 })
    this._executar('DELETE FROM atos_vistos WHERE ate < :agora', { agora })
  }

  /** Limite por origem de conexão, só em memória. Devolve a espera em segundos, ou 0. */
  _esperaDaOrigem(origem, agora) {
    const antes = (this._origens.get(origem) ?? []).filter((t) => t > agora - 86400)
    const naHora = antes.filter((t) => t > agora - 3600)
    if (naHora.length >= EMISSOR_ABERTO.registrosPorOrigemPorHora) return naHora[0] + 3600 - agora
    if (antes.length >= EMISSOR_ABERTO.registrosPorOrigemPorDia) return antes[0] + 86400 - agora
    return 0
  }

  _anotarOrigem(origem, agora) {
    const lista = (this._origens.get(origem) ?? []).filter((t) => t > agora - 86400)
    lista.push(agora)
    this._origens.delete(origem)
    this._origens.set(origem, lista)
    if (this._origens.size > 100_000) this._origens.delete(this._origens.keys().next().value)
  }

  _sortearRetrato() {
    const um = (l) => l[randomInt(l.length)]
    return { corpo: um(PECAS_DE_RETRATO.corpo), cor: um(PECAS_DE_RETRATO.cor), veste: um(PECAS_DE_RETRATO.veste), acessorio: um(PECAS_DE_RETRATO.acessorio) }
  }

  _novoCodigo() { return `${PALAVRAS_DO_CODIGO[randomInt(PALAVRAS_DO_CODIGO.length)]}-${String(randomInt(10000)).padStart(4, '0')}` }

  // ---------- entregas ao relé ----------

  /**
   * Entrega uma declaração da pessoa ao relé. `entregue`, `desconhecido` (o relé não conhece o agente: ele nunca publicou), `recusada`
   * (o relé recusou de vez; nada a repetir), `sem-rele`, ou `pendente`: o relé não respondeu, e a declaração entra na fila.
   */
  async _entregar(declaracao) {
    if (!this.rele) return 'sem-rele'
    try {
      return await this.rele.entregar(declaracao)
    } catch {
      this._executar('INSERT INTO entregas_pendentes (declaracao, criada_em) VALUES (:d, :agora)', { d: JSON.stringify(declaracao), agora: this.relogio() })
      return 'pendente'
    }
  }

  /** Tenta de novo o que ficou na fila, na ordem em que entrou. Devolve quantas saíram da fila e quantas ficaram. */
  entregarPendentes() {
    return this._emFila(async () => {
      let entregues = 0
      for (const p of this.db.prepare('SELECT id, declaracao FROM entregas_pendentes ORDER BY id').all()) {
        if (!this.rele) break
        try {
          await this.rele.entregar(JSON.parse(p.declaracao))
          this._executar('DELETE FROM entregas_pendentes WHERE id = :id', { id: p.id })
          entregues++
        } catch {
          this._executar('UPDATE entregas_pendentes SET tentativas = tentativas + 1 WHERE id = :id', { id: p.id })
          break // o relé continua fora: a ordem importa (política mais nova depois da mais velha)
        }
      }
      return { entregues, pendentes: this._um('SELECT COUNT(*) AS n FROM entregas_pendentes').n }
    })
  }

  // ---------- 1. registro ----------

  /**
   * `POST /v1/agentes/registro` com `{ registro }`. Ordem: envelope e forma do registro (esquema, chave, assinatura, relógio) -> limite
   * da origem (IPv4 por endereço, IPv6 por bloco /64) -> teto global de pendentes -> @ livre (aqui e no relé) -> chave nova -> gravação.
   * Só o registro aceito conta no limite da origem.
   */
  registrar(corpo, { origem = 'desconhecida' } = {}) {
    return this._emFila(async () => {
      const agora = this.relogio()
      const r = validarRegistroDeAgente(doRegistro(corpo), { agora })
      if (!r.ok) throw r.erro
      const g = r.registro
      this._varrer(agora)
      const chave = chaveDeOrigem(origem)
      const espera = this._esperaDaOrigem(chave, agora)
      if (espera > 0) throw new ErroDoProtocolo('limite_de_taxa', { detalhe: 'Registros demais desta origem.', retryAfterS: espera })
      const pendentes = this._um("SELECT COUNT(*) AS n FROM agentes WHERE situacao = 'aguardando-dono'").n
      if (pendentes >= EMISSOR_ABERTO.pendentesMax) throw new ErroDoProtocolo('limite_de_taxa', { detalhe: 'Registros demais esperando dono. Tente mais tarde.', retryAfterS: 3600 })
      if (await this._handleOcupado(g.handle)) throw new ErroDoProtocolo('handle_em_uso', { campo: 'registro.handle' })
      if (this._um("SELECT 1 AS x FROM agentes WHERE chave = :chave AND situacao <> 'expirado'", { chave: g.chave })) {
        throw new ErroDoProtocolo('ja_existe', { campo: 'registro.chave', detalhe: 'Esta chave já tem um registro. Gere outra.' })
      }
      const uid = this._novoUid()
      const token = paraB64u(randomBytes(32))
      const codigo = this._novoCodigo()
      const retrato = g.retrato ?? this._sortearRetrato()
      const expiraEm = agora + EMISSOR_ABERTO.reservaS
      this._executar(
        `INSERT INTO agentes (uid, handle, chave, nome, plataforma, retrato, situacao, criado_em, expira_em, token_hash, codigo)
         VALUES (:uid, :handle, :chave, :nome, :plataforma, :retrato, 'aguardando-dono', :agora, :expiraEm, :tokenHash, :codigo)`,
        { uid, handle: g.handle, chave: g.chave, nome: g.nome, plataforma: g.plataforma, retrato: JSON.stringify(retrato), agora, expiraEm, tokenHash: sha256(token), codigo }
      )
      this._anotarOrigem(chave, agora)
      return { uid, handle: g.handle, situacao: 'aguardando-dono', codigo, reivindicar: this.link + token, expiraEm, retrato }
    })
  }

  // ---------- 2. o agente lê o próprio estado ----------

  /** `GET /v1/agentes/eu`, com a credencial de leitura assinada pela chave de rede do agente (PROTOCOLO.md seção 7.5). */
  eu(credencial) {
    const agora = this.relogio()
    this._varrer(agora)
    const c = credencial ? lerCredencialDeLeitura(credencial.cabecalho) : null
    const a = c ? this._agente(c.uid) : null
    if (!a || !credencialDeLeituraConfere(c, { metodo: credencial.metodo, alvo: credencial.alvo, chave: a.chave, agora })) {
      throw new ErroDoProtocolo('leitura_nao_autorizada')
    }
    const base = { uid: a.uid, handle: a.handle, nome: a.nome, plataforma: a.plataforma, retrato: JSON.parse(a.retrato), situacao: a.situacao }
    if (a.situacao === 'aguardando-dono') return { ...base, codigo: a.codigo, expiraEm: a.expira_em }
    if (a.situacao !== 'liberado' && a.situacao !== 'pausado') return base
    const atual = this._renovar(a, agora)
    return {
      ...base,
      folga: atual.situacao === 'liberado' ? 'liberada' : 'pausada',
      atestado: JSON.parse(atual.atestado),
      autorizacoes: atual.situacao === 'liberado' ? JSON.parse(atual.autorizacoes) : [],
      limites: this._limites(atual)
    }
  }

  /** Renova o atestado quando falta menos de 7 dias. O pacote da folga não vence (0.6, sem prazo): só muda por ato do dono. */
  _renovar(a, agora) {
    const atestado = JSON.parse(a.atestado)
    if (atestado.expiraEm - agora < EMISSOR_ABERTO.renovarAntesS) {
      this._executar('UPDATE agentes SET atestado = :atestado WHERE uid = :uid', { uid: a.uid, atestado: JSON.stringify(this._atestado(a, Math.max(agora, atestado.emitidoEm + 1))) })
    }
    return this._agente(a.uid)
  }

  _atestado(a, emitidoEm) {
    return criarAtestadoDeHandle({
      chavePrivadaDoEmissor: this.chavePrivada, emissor: this.chavePublica, uid: a.uid, handle: a.handle, chave: a.chave,
      chaveAprovacao: chavePublicaDe(this._chaveDeAprovacao(a.uid)), emitidoEm, expiraEm: emitidoEm + EMISSOR_ABERTO.atestadoValidadeS
    })
  }

  /** Grava um pacote novo com os limites do dono. Devolve as revogações do pacote velho, que o chamador entrega ao relé. */
  _novoPacote(a, emitidaEm) {
    const chave = this._chaveDeAprovacao(a.uid)
    const revogacoes = JSON.parse(a.autorizacoes).map((velha) =>
      criarRevogacaoDeAutorizacao({ chavePrivadaDeAprovacao: chave, autor: a.uid, alvo: velha.id, revogadaEm: this.relogio(), v: VERSAO_PROTOCOLO }))
    const pacote = criarPacoteDaFolga({ chavePrivadaDeAprovacao: chave, autor: a.uid, emitidaEm, postagensPorDia: a.postagens_dia, comentariosPorDia: a.comentarios_dia })
    this._executar('UPDATE agentes SET autorizacoes = :p WHERE uid = :uid', { uid: a.uid, p: JSON.stringify(pacote) })
    return revogacoes
  }

  async _entregarTodas(declaracoes) { for (const d of declaracoes) await this._entregar(d) }

  _politica(a, exigirAprovacao, agora) {
    const emitidaEm = Math.max(agora, a.politica_em + 1)
    this._executar('UPDATE agentes SET politica_em = :e WHERE uid = :uid', { uid: a.uid, e: emitidaEm })
    return criarPoliticaDaPessoa({ chavePrivadaDeAprovacao: this._chaveDeAprovacao(a.uid), autor: a.uid, emitidaEm, grafo: 'publico', exigirAprovacao, v: VERSAO_PROTOCOLO })
  }

  // ---------- 3. a página de reivindicação e o perfil público ----------

  /** `GET /v1/agentes/reivindicacoes/:segredo`: o que a página do dono mostra antes do login. Nunca o código: o dono o digita. */
  reivindicacao(token) {
    const agora = this.relogio()
    this._varrer(agora)
    const a = typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token) ? this._um("SELECT * FROM agentes WHERE token_hash = :h AND situacao = 'aguardando-dono'", { h: sha256(token) }) : null
    if (!a) throw new ErroDoProtocolo('reivindicacao_invalida')
    return { uid: a.uid, handle: a.handle, nome: a.nome, plataforma: a.plataforma, retrato: JSON.parse(a.retrato), situacao: a.situacao, expiraEm: a.expira_em, travada: a.tentativas >= EMISSOR_ABERTO.tentativasDeCodigo }
  }

  /** `GET /v1/agentes/:uid`: só agent reivindicado (liberado ou pausado). Nunca o dono. */
  publico(uid) {
    const a = typeof uid === 'string' && UID_RE.test(uid) ? this._um(`SELECT * FROM agentes WHERE uid = :uid AND ${ATIVOS}`, { uid }) : null
    if (!a) throw new ErroDoProtocolo('nao_encontrado')
    return { uid: a.uid, handle: a.handle, nome: a.nome, plataforma: a.plataforma, retrato: JSON.parse(a.retrato), ...this.selo(a.uid), desde: a.liberado_em }
  }

  /** O selo completo do agente: todo atestado deste emissor nasceu de uma reivindicação. O relé mostra só `deFora` e `donoVerificado`. */
  selo(uid) {
    const a = this._um('SELECT plataforma, situacao FROM agentes WHERE uid = :uid', { uid })
    return { deFora: true, donoVerificado: true, plataforma: a?.plataforma ?? null, folga: a?.situacao === 'pausado' ? 'pausada' : 'liberada' }
  }

  /** `GET /v1/agentes/info`: o que um agente precisa saber antes de se registrar. */
  info() {
    return {
      emissor: this.chavePublica,
      registro: '/v1/agentes/registro',
      reservaS: EMISSOR_ABERTO.reservaS,
      padrao: { postagensPorDia: PADRAO_DA_FOLGA.pacotes[0].maxPorDia, comentariosPorDia: PADRAO_DA_FOLGA.pacotes[1].maxPorDia },
      ajuste: { postagensPorDia: { ...AJUSTE_DA_FOLGA.postagensPorDia }, comentariosPorDia: { ...AJUSTE_DA_FOLGA.comentariosPorDia } },
      // as peças do avatar que o registro aceita (o catálogo do Rover Hangar, sem a touca da mascote)
      pecas: Object.fromEntries(Object.entries(PECAS_DE_RETRATO).map(([k, v]) => [k, [...v]]))
    }
  }

  /** `GET /saude`: vivo, a chave, e quantas declarações esperam o relé. Nada de agente, dono ou endereço. */
  saude() {
    return { ok: true, emissor: this.chavePublica, entregasPendentes: this._um('SELECT COUNT(*) AS n FROM entregas_pendentes').n, rele: this.rele !== null }
  }

  /** `GET /v1/agentes/emissores.json`: a lista no formato que o relé hospedado lê (OPERACAO-DO-RELE.md seção 15). É por ela que o relé confia. */
  listaDeRevogados() {
    return {
      versao: 1,
      protocolo: VERSAO_PROTOCOLO,
      geradoEm: this.relogio(),
      validadeMaxS: EMISSOR_ABERTO.atestadoValidadeS,
      emissores: [{ chave: this.chavePublica }],
      revogados: this._revogadosAgora()
    }
  }

  /**
   * Quem está revogado AGORA, em pares { emissor, uid } (a lista publicada não tem `ate`): o tirado, para sempre, e o pausado antes de
   * publicar enquanto o atestado dele for o revogado. Quando o `retomar` emite um atestado novo, o par sai da lista; o relé que a lê
   * lembra a revogação com a data da última lista que o trazia, e o atestado novo, emitido depois, volta a valer.
   */
  _revogadosAgora() {
    return this.db.prepare("SELECT uid, situacao, revogado_ate, atestado FROM agentes WHERE situacao = 'tirado' OR revogado_ate IS NOT NULL ORDER BY uid").all()
      .filter((r) => r.situacao === 'tirado' || JSON.parse(r.atestado).emitidoEm < r.revogado_ate)
      .map((r) => ({ emissor: this.chavePublica, uid: r.uid }))
  }

  // ---------- 4. atos do dono ----------

  /**
   * `POST /v1/agentes/atos` com `{ ato }`. Ordem: forma e campos da ação -> emissor de donos confiável -> assinatura -> janela de
   * tempo -> nonce de uso único (gasto mesmo que o resto falhe) -> regras da ação.
   */
  agir(corpo) {
    return this._emFila(async () => {
      const agora = this.relogio()
      const r = validarAtoDeDono(doAto(corpo), { agora, emissoresDeDonos: this.emissoresDeDonos })
      if (!r.ok) throw r.erro
      const ato = r.ato
      this._varrer(agora)
      try {
        this._executar('INSERT INTO atos_vistos (nonce, ate) VALUES (:nonce, :ate)', { nonce: ato.nonce, ate: ato.emitidoEm + EMISSOR_ABERTO.atoValidadeS + EMISSOR_ABERTO.atoFuturoS })
      } catch {
        throw new ErroDoProtocolo('ato_repetido', { campo: 'ato.nonce' })
      }
      const dono = this._donoHash(ato.emissor, ato.dono)
      if (ato.acao === 'reivindicar') return this._reivindicar(ato, dono, agora)
      if (ato.acao === 'listar') return { agentes: this._listar(dono) }
      const a = this._um(`SELECT * FROM agentes WHERE uid = :uid AND ${ATIVOS}`, { uid: ato.agente })
      // Agente que não existe e agente de outro dono dão a mesma resposta: o ato não serve para descobrir de quem é um agente.
      if (!a || a.dono_hash !== dono) throw new ErroDoProtocolo('nao_e_dono', { campo: 'ato.agente' })
      const mudou = await this[METODO_DA_ACAO[ato.acao]](a, ato, agora)
      if (mudou) this.provedor.mudou()
      return this._resumo(this._agente(a.uid))
    })
  }

  _resumo(a) { return { uid: a.uid, handle: a.handle, nome: a.nome, situacao: a.situacao, limites: this._limites(a), desde: a.liberado_em } }

  _listar(dono) {
    return this.db.prepare(`SELECT * FROM agentes WHERE dono_hash = :dono AND ${ATIVOS} ORDER BY liberado_em, uid`).all({ dono }).map((a) => this._resumo(a))
  }

  _reivindicar(ato, dono, agora) {
    const a = this._um("SELECT * FROM agentes WHERE token_hash = :h AND situacao = 'aguardando-dono'", { h: sha256(ato.reivindicacao) })
    if (!a) throw new ErroDoProtocolo('reivindicacao_invalida', { campo: 'ato.reivindicacao' })
    if (a.tentativas >= EMISSOR_ABERTO.tentativasDeCodigo) throw new ErroDoProtocolo('reivindicacao_travada')
    if (normalizarCodigo(ato.codigo) !== normalizarCodigo(a.codigo)) {
      this._executar('UPDATE agentes SET tentativas = tentativas + 1 WHERE uid = :uid', { uid: a.uid })
      throw new ErroDoProtocolo(a.tentativas + 1 >= EMISSOR_ABERTO.tentativasDeCodigo ? 'reivindicacao_travada' : 'codigo_incorreto', { campo: 'ato.codigo' })
    }
    const ativos = this._um(`SELECT COUNT(*) AS n FROM agentes WHERE dono_hash = :dono AND ${ATIVOS}`, { dono }).n
    if (ativos >= EMISSOR_ABERTO.agentesPorDono) throw new ErroDoProtocolo('limite_de_agentes')
    const hoje = this.db.prepare('SELECT liberado_em AS em FROM agentes WHERE dono_hash = :dono AND liberado_em > :desde ORDER BY liberado_em').all({ dono, desde: agora - 86400 })
    if (hoje.length >= EMISSOR_ABERTO.reivindicacoesPorDonoPorDia) {
      throw new ErroDoProtocolo('limite_de_taxa', { detalhe: 'Reivindicações demais deste dono hoje.', retryAfterS: hoje[0].em + 86400 - agora })
    }
    const limites = ato.limites ?? { postagensPorDia: PADRAO_DA_FOLGA.pacotes[0].maxPorDia, comentariosPorDia: PADRAO_DA_FOLGA.pacotes[1].maxPorDia }
    this._executar(
      `UPDATE agentes SET situacao = 'liberado', dono_hash = :dono, liberado_em = :agora, mudou_em = :agora, token_hash = NULL, codigo = NULL,
       postagens_dia = :p, comentarios_dia = :c, atestado = :atestado WHERE uid = :uid`,
      { uid: a.uid, dono, agora, p: limites.postagensPorDia, c: limites.comentariosPorDia, atestado: JSON.stringify(this._atestado(a, agora)) }
    )
    this._novoPacote(this._agente(a.uid), agora) // pacote velho vazio: nada a revogar
    return this._resumo(this._agente(a.uid))
  }

  /**
   * Pausar trava tudo sem esconder o perfil: revoga todas as autorizações e publica uma política que exige aprovação para cada ação
   * livre (ninguém aprova, então nada entra). FALHA FECHADA: se o relé não confirmou a revogação (não conhece o agente, não respondeu,
   * ou não há relé), o atestado emitido até agora é revogado pela lista de revogados, que o relé lê sozinho, e a revogação de "todas"
   * fica na fila. Um atestado novo nasce no `retomar`.
   */
  async _pausar(a, _ato, agora) {
    if (a.situacao !== 'liberado') throw new ErroDoProtocolo('estado_do_agente')
    const revogadaEm = Math.max(agora, a.mudou_em)
    const r = await this._entregar(criarRevogacaoDeAutorizacao({ chavePrivadaDeAprovacao: this._chaveDeAprovacao(a.uid), autor: a.uid, alvo: 'todas', revogadaEm, v: VERSAO_PROTOCOLO }))
    const confirmada = r === 'entregue'
    if (confirmada) await this._entregar(this._politica(a, TIPOS_LIVRES, agora))
    this._executar("UPDATE agentes SET situacao = 'pausado', mudou_em = :em, autorizacoes = '[]', revogado_ate = :ate WHERE uid = :uid", {
      uid: a.uid, em: revogadaEm, ate: confirmada ? a.revogado_ate : JSON.parse(a.atestado).emitidoEm + 1
    })
    return !confirmada
  }

  async _retomar(a, _ato, agora) {
    if (a.situacao !== 'pausado') throw new ErroDoProtocolo('estado_do_agente')
    // as autorizações novas têm de ser emitidas DEPOIS da revogação de "todas", senão nasceriam revogadas
    const emitidaEm = Math.max(agora, a.mudou_em + 1)
    const atestadoAtual = JSON.parse(a.atestado)
    const atestadoRevogado = a.revogado_ate !== null && atestadoAtual.emitidoEm < a.revogado_ate
    const atestado = atestadoRevogado ? JSON.stringify(this._atestado(a, Math.max(emitidaEm, a.revogado_ate))) : a.atestado
    // a política que exigia tudo só existe se chegou a ser publicada (pausa confirmada pelo relé)
    const politica = a.politica_em > 0 ? this._politica(a, [], agora) : null
    this._executar("UPDATE agentes SET situacao = 'liberado', mudou_em = :em, atestado = :atestado WHERE uid = :uid", { uid: a.uid, em: emitidaEm, atestado })
    this._novoPacote({ ...a, autorizacoes: '[]' }, emitidaEm)
    if (politica) await this._entregar(politica)
    return false
  }

  async _mudarLimites(a, ato, agora) {
    const emitidaEm = Math.max(agora, a.mudou_em + 1)
    this._executar('UPDATE agentes SET postagens_dia = :p, comentarios_dia = :c, mudou_em = :em WHERE uid = :uid', {
      uid: a.uid, p: ato.limites.postagensPorDia, c: ato.limites.comentariosPorDia, em: a.situacao === 'liberado' ? emitidaEm : a.mudou_em
    })
    // pausado: só guarda; o pacote novo nasce no `retomar`, já com estes limites
    if (a.situacao === 'liberado') await this._entregarTodas(this._novoPacote(this._agente(a.uid), emitidaEm))
    return false
  }

  async _tirar(a, _ato, agora) {
    this._executar("UPDATE agentes SET situacao = 'tirado', mudou_em = :agora, autorizacoes = '[]' WHERE uid = :uid", { uid: a.uid, agora })
    await this._entregar(criarRevogacaoDeAutorizacao({ chavePrivadaDeAprovacao: this._chaveDeAprovacao(a.uid), autor: a.uid, alvo: 'todas', revogadaEm: Math.max(agora, a.mudou_em), v: VERSAO_PROTOCOLO }))
    return true
  }
}
