// SPDX-License-Identifier: AGPL-3.0-or-later
// A lista de REVOGADOS que cada emissor confiável publica, lida pelo relé hospedado (docs/OPERACAO-DO-RELE.md, seção 15).
//
// O emissor do Rover Hangar publica `/.well-known/rover-network` (descoberta) e, no caminho que ela aponta,
// `/.well-known/rover-network/emissores.json`: `{ versao: 1, protocolo, geradoEm, validadeMaxS, emissores, revogados }`, com
// `revogados` em pares `{ emissor, uid }`. Esse formato é PROVISÓRIO e NÃO é assinado: o protocolo ainda não define a lista. A única
// garantia de origem é o TLS do endereço configurado (o risco e o pedido de lista assinada estão em docs/PEDIDOS-PARA-A-ESPECIFICACAO.md).
//
// Regras deste leitor:
//   - só https, sem credencial na URL, sem seguir redirecionamento, resposta com teto de bytes e prazo curto;
//   - falha ao buscar NUNCA esvazia o que já se sabia: a última lista válida continua valendo e a idade dela aparece em /v1/info;
//   - uma lista só vale para as chaves de emissor que o operador ligou àquela URL (um emissor não revoga rover de outro);
//   - lista mais velha que a última aceita é recusada (`lista_antiga`), e lista com data no futuro também (`lista_no_futuro`);
//   - revogar é MONOTÔNICO por atestado: o par que sai da lista vira "lembrado" com o instante `ate` (o `geradoEm` da última lista
//     que o trazia). Atestado desse par emitido ANTES de `ate` continua recusado para sempre; atestado emitido DEPOIS (o rover
//     reabilitado pelo emissor, ou o @ trocado e reatestado) volta a valer. Só o operador apaga um lembrado (`limpar`).
//   - o estado vai para um arquivo ao lado do banco (gravado por troca de nome, modo 0600) e sobrevive ao reinício. Arquivo
//     ilegível impede o relé de subir: subir sem ele esqueceria revogações.
import { request } from 'node:https'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { CHAVE_PUBLICA_RE, UID_RE } from '../../protocolo/src/index.js'
import { ProvedorDeAtestados } from './provedor.js'

export const REVOGADOS = Object.freeze({
  intervaloPadraoMin: 5,
  intervaloMinimoMin: 1,
  intervaloMaximoMin: 1440,
  idadeMaxPadraoMin: 60,
  idadeMaxMaximaMin: 43200, //       30 dias
  prazoMs: 10_000, //                 cada pedido HTTP, do começo ao fim do corpo
  respostaMaxBytes: 16 * 1048576, //  100 mil pares cabem em uns 9 MiB
  urlMaxCaracteres: 2048,
  futuroMaxS: 300, //                 folga de relógio entre emissor e relé
  revogadosMax: 100_000, //           o teto do emissor do Rover Hangar (contrato 0.17.0, LIMITES_ATESTADO_REDE.revogadosMax)
  emissoresMax: 16
})

const FORMATO_DO_ARQUIVO = 'rover-network/revogados-dos-emissores/1'
const INSTANTE_MIN = 1_700_000_000
const INSTANTE_MAX = 4_102_444_800

/** Erro deste módulo: `codigo` curto (vai para o log e para /v1/info), nunca a URL nem o corpo recebido. */
export class ErroDeRevogados extends Error {
  constructor(codigo, extra = {}) {
    super(`revogados: ${codigo}`)
    this.name = 'ErroDeRevogados'
    this.codigo = codigo
    if (extra.status !== undefined) this.status = extra.status
    if (extra.campo !== undefined) this.campo = extra.campo
  }
}
const erro = (codigo, extra) => new ErroDeRevogados(codigo, extra)
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const hostDe = (url) => new URL(url).host

// ---------- configuração ----------

/** Confere UMA URL de descoberta: https, sem usuário ou senha, sem fragmento, tamanho limitado. Devolve a forma normalizada. */
export function validarUrlDeDescoberta(texto) {
  if (typeof texto !== 'string' || texto.length === 0 || texto.length > REVOGADOS.urlMaxCaracteres) throw new Error('URL de descoberta vazia ou longa demais.')
  let u
  try { u = new URL(texto) } catch { throw new Error('URL de descoberta inválida.') }
  if (u.protocol !== 'https:') throw new Error('URL de descoberta precisa ser https (a lista de revogados não é assinada: o TLS é a única garantia de origem).')
  if (u.username !== '' || u.password !== '') throw new Error('URL de descoberta não pode levar usuário nem senha.')
  if (u.hash !== '') throw new Error('URL de descoberta não pode ter fragmento (#).')
  return u.href
}

/**
 * Lê `RELE_EMISSORES_DESCOBERTA`: pares `chave=URL` separados por vírgula. A chave precisa estar entre as confiáveis (não faz sentido ler
 * revogados de quem o relé nem aceita) e aparecer uma vez só; duas chaves podem dividir a mesma URL (a atual e a anterior de um emissor).
 * Vazia ou ausente: nenhuma fonte. As mensagens de erro nunca repetem a URL.
 */
export function lerFontesDeRevogados(texto, confiaveis) {
  if (texto === undefined || texto === null || texto.trim() === '') return []
  const fontes = []
  const vistas = new Set()
  for (const item of texto.split(',').map((s) => s.trim()).filter(Boolean)) {
    const i = item.indexOf('=')
    if (i < 0) throw new Error('RELE_EMISSORES_DESCOBERTA: cada item é chave=URL, separados por vírgula.')
    const emissor = item.slice(0, i).trim()
    if (!CHAVE_PUBLICA_RE.test(emissor)) throw new Error('RELE_EMISSORES_DESCOBERTA: a chave antes do = precisa ser uma chave pública de 43 caracteres.')
    if (!confiaveis.includes(emissor)) throw new Error('RELE_EMISSORES_DESCOBERTA: toda chave precisa estar também em RELE_EMISSORES.')
    if (vistas.has(emissor)) throw new Error('RELE_EMISSORES_DESCOBERTA: a mesma chave aparece duas vezes.')
    vistas.add(emissor)
    let url
    try { url = validarUrlDeDescoberta(item.slice(i + 1).trim()) } catch (e) { throw new Error(`RELE_EMISSORES_DESCOBERTA: ${e.message}`) }
    fontes.push({ emissor, url })
  }
  return fontes
}

// ---------- busca ----------

/**
 * GET de um JSON por https, com prazo total e teto de bytes. Não segue redirecionamento (um 3xx poderia levar a http ou a outro
 * dono), não pede compressão e recusa resposta comprimida. `ca` só existe para os testes (certificado local); em produção vale o
 * repositório de certificados do sistema (e `NODE_EXTRA_CA_CERTS`).
 */
export function buscarJson(url, { prazoMs = REVOGADOS.prazoMs, maxBytes = REVOGADOS.respostaMaxBytes, ca } = {}) {
  return new Promise((ok, falha) => {
    let u
    try { u = new URL(url) } catch { falha(erro('url')); return }
    if (u.protocol !== 'https:' || u.username !== '' || u.password !== '') { falha(erro('url')); return }
    let terminado = false
    let req = null
    const terminar = (e, valor) => {
      if (terminado) return
      terminado = true
      clearTimeout(prazo)
      if (e) { req?.destroy(); falha(e) } else ok(valor)
    }
    const prazo = setTimeout(() => terminar(erro('prazo')), prazoMs)
    req = request(u, { method: 'GET', headers: { accept: 'application/json', 'accept-encoding': 'identity', 'user-agent': 'rover-network-rele' }, ...(ca ? { ca } : {}) }, (res) => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400) return terminar(erro('redirecionamento', { status }))
      if (status !== 200) return terminar(erro('status', { status }))
      const codificacao = String(res.headers['content-encoding'] ?? 'identity').toLowerCase()
      if (codificacao !== 'identity') return terminar(erro('codificacao'))
      const declarado = Number(res.headers['content-length'])
      if (Number.isFinite(declarado) && declarado > maxBytes) return terminar(erro('resposta_grande'))
      const partes = []
      let total = 0
      res.on('data', (parte) => {
        total += parte.length
        if (total > maxBytes) return terminar(erro('resposta_grande'))
        partes.push(parte)
      })
      res.on('end', () => {
        if (terminado) return
        let valor
        try { valor = JSON.parse(Buffer.concat(partes).toString('utf8')) } catch { return terminar(erro('json_invalido')) }
        terminar(null, valor)
      })
      res.on('error', () => terminar(erro('rede')))
      res.on('aborted', () => terminar(erro('rede')))
    })
    req.on('error', () => terminar(erro('rede')))
    req.end()
  })
}

/**
 * A FORMA da lista que o relé usa. Exige `versao: 1`, `geradoEm` (segundos), `emissores` (as chaves que o emissor publica) e
 * `revogados` (pares exatamente `{ emissor, uid }`). Os outros campos do topo (`protocolo`, `validadeMaxS`) não são usados e não
 * são exigidos. Um par fora da forma derruba a lista INTEIRA (vale a anterior): ler metade seria esquecer a outra metade.
 */
export function validarListaDeRevogados(l) {
  if (!ehObjeto(l)) throw erro('lista')
  if (l.versao !== 1) throw erro('lista', { campo: 'versao' })
  if (!Number.isSafeInteger(l.geradoEm) || l.geradoEm < INSTANTE_MIN || l.geradoEm > INSTANTE_MAX) throw erro('lista', { campo: 'geradoEm' })
  if (!Array.isArray(l.emissores) || l.emissores.length === 0 || l.emissores.length > REVOGADOS.emissoresMax) throw erro('lista', { campo: 'emissores' })
  const emissores = l.emissores.map((e) => {
    if (!ehObjeto(e) || typeof e.chave !== 'string' || !CHAVE_PUBLICA_RE.test(e.chave)) throw erro('lista', { campo: 'emissores' })
    return e.chave
  })
  if (!Array.isArray(l.revogados) || l.revogados.length > REVOGADOS.revogadosMax) throw erro('lista', { campo: 'revogados' })
  const pares = new Map()
  for (const x of l.revogados) {
    if (!ehObjeto(x) || Object.keys(x).length !== 2 || typeof x.emissor !== 'string' || !CHAVE_PUBLICA_RE.test(x.emissor) ||
        typeof x.uid !== 'string' || !UID_RE.test(x.uid)) throw erro('lista', { campo: 'revogados' })
    pares.set(`${x.emissor}|${x.uid}`, { emissor: x.emissor, uid: x.uid })
  }
  return { geradoEm: l.geradoEm, emissores, revogados: [...pares.values()] }
}

/**
 * Busca a lista a partir da URL configurada. Se a resposta é o documento de descoberta do emissor (`papel: 'emissor'`), segue o
 * caminho `lista` dele, que precisa ser da MESMA origem; se já é a lista, usa direto.
 */
export async function buscarListaDoEmissor(url, opcoes = {}) {
  const buscar = opcoes.buscarJson ?? buscarJson
  let doc = await buscar(url, opcoes)
  if (ehObjeto(doc) && doc.papel === 'emissor') {
    if (doc.rede !== 'rover-network' || doc.formato !== 'provisorio-1' || typeof doc.lista !== 'string' || !doc.lista.startsWith('/') || doc.lista.startsWith('//')) {
      throw erro('descoberta')
    }
    const alvo = new URL(doc.lista, url)
    if (alvo.origin !== new URL(url).origin) throw erro('descoberta')
    doc = await buscar(alvo.href, opcoes)
  }
  return validarListaDeRevogados(doc)
}

// ---------- o provedor ----------

/**
 * Provedor de atestados com emissores fixos (como o `ProvedorEstatico`) e a lista de revogados lida das fontes configuradas.
 * `revogados()` devolve `{ emissor, uid }` para o par que a última lista do emissor traz (vale contra qualquer atestado) e
 * `{ emissor, uid, ate }` para o par lembrado (vale contra atestado com `emitidoEm < ate`).
 */
export class ProvedorComRevogadosDoEmissor extends ProvedorDeAtestados {
  /**
   * @param {object} o
   * @param {string[]} o.emissores                        chaves em que o relé confia (RELE_EMISSORES)
   * @param {Array<{ emissor: string, url: string }>} o.fontes  de lerFontesDeRevogados
   * @param {string | null} [o.arquivo]                   onde guardar o estado (ao lado do banco); null = só memória
   * @param {() => number} [o.relogio]                    segundos inteiros
   * @param {number} [o.idadeMaxS]                        acima disto a lista é "velha": alerta no log e em /v1/info
   * @param {number} [o.intervaloS]                       de quanto em quanto tempo `ligar()` relê
   * @param {(evento: object) => void} [o.registrar]      log (nunca recebe uid nem URL inteira)
   * @param {(url: string, opcoes: object) => Promise<object>} [o.buscar]  troca a busca (testes)
   * @param {object} [o.opcoesDeBusca]                    repassadas à busca (testes: `ca`, `prazoMs`, `maxBytes`)
   */
  constructor({ emissores, fontes = [], arquivo = null, relogio = () => Math.floor(Date.now() / 1000), idadeMaxS = REVOGADOS.idadeMaxPadraoMin * 60,
    intervaloS = REVOGADOS.intervaloPadraoMin * 60, registrar = () => {}, buscar = buscarListaDoEmissor, opcoesDeBusca = {} }) {
    super()
    this._emissores = [...emissores]
    const porUrl = new Map()
    for (const { emissor, url } of fontes) {
      if (!porUrl.has(url)) porUrl.set(url, [])
      porUrl.get(url).push(emissor)
    }
    this._fontes = [...porUrl].map(([url, chaves]) => ({ url, emissores: chaves, geradoEm: null, atualizadaEm: null, falhasSeguidas: 0, ultimoErro: null }))
    this._pares = new Map()
    this._versao = 1
    this.arquivo = arquivo
    this.relogio = relogio
    this.idadeMaxS = idadeMaxS
    this.intervaloS = intervaloS
    this.registrar = registrar
    this.buscar = buscar
    this.opcoesDeBusca = opcoesDeBusca
    this._emAndamento = null
    if (arquivo) this._carregar()
  }

  get nome() { return 'descoberta' }
  get versao() { return this._versao }
  emissoresConfiaveis() { return [...this._emissores] }
  revogados() {
    return [...this._pares.values()].map((p) => (p.vigente ? { emissor: p.emissor, uid: p.uid } : { emissor: p.emissor, uid: p.uid, ate: p.ate }))
  }

  _fonteDe(emissor) { return this._fontes.find((f) => f.emissores.includes(emissor)) ?? null }

  /** Relê todas as fontes (em paralelo). Nunca lança: cada falha fica na fonte e no log. Duas chamadas ao mesmo tempo viram uma. */
  atualizar() {
    if (this._emAndamento) return this._emAndamento
    this._emAndamento = (async () => {
      try {
        const resultados = await Promise.all(this._fontes.map((f) => this._atualizarFonte(f)))
        if (resultados.some((r) => r.mudouOConjunto)) this._versao++
        if (resultados.some((r) => r.aceita)) this._salvar()
        this._conferirIdade()
      } finally {
        this._emAndamento = null
      }
    })()
    return this._emAndamento
  }

  async _atualizarFonte(f) {
    let lista
    try {
      lista = await this.buscar(f.url, this.opcoesDeBusca)
      const agora = this.relogio()
      if (!lista.emissores.some((c) => f.emissores.includes(c))) throw erro('emissor_ausente')
      if (lista.geradoEm > agora + REVOGADOS.futuroMaxS) throw erro('lista_no_futuro')
      if (f.geradoEm !== null && lista.geradoEm < f.geradoEm) throw erro('lista_antiga')
    } catch (e) {
      f.falhasSeguidas++
      f.ultimoErro = e instanceof ErroDeRevogados ? e.codigo : 'interno'
      this.registrar({ nivel: 'aviso', evento: 'revogados_falha', fonte: hostDe(f.url), erro: f.ultimoErro, ...(e?.status ? { status: e.status } : {}), falhasSeguidas: f.falhasSeguidas })
      return { aceita: false, mudouOConjunto: false }
    }
    let mudouOConjunto = false
    let novos = 0
    let ignorados = 0
    const naLista = new Set()
    for (const { emissor, uid } of lista.revogados) {
      if (!f.emissores.includes(emissor)) { ignorados++; continue } // um emissor não revoga rover de outro
      const k = `${emissor}|${uid}`
      naLista.add(k)
      const p = this._pares.get(k)
      if (!p) {
        this._pares.set(k, { emissor, uid, ate: lista.geradoEm, vigente: true })
        mudouOConjunto = true
        novos++
        continue
      }
      if (!p.vigente) { p.vigente = true; mudouOConjunto = true }
      if (lista.geradoEm > p.ate) p.ate = lista.geradoEm
    }
    // O que a lista nova não traz deixa de valer contra atestado NOVO, mas fica lembrado contra o atestado que ela revogou.
    for (const [k, p] of this._pares) {
      if (p.vigente && f.emissores.includes(p.emissor) && !naLista.has(k)) { p.vigente = false; mudouOConjunto = true }
    }
    f.geradoEm = lista.geradoEm
    f.atualizadaEm = this.relogio()
    f.falhasSeguidas = 0
    f.ultimoErro = null
    this.registrar({ nivel: 'info', evento: 'revogados_atualizados', fonte: hostDe(f.url), geradoEm: lista.geradoEm, vigentes: naLista.size, novos, ignorados })
    return { aceita: true, mudouOConjunto }
  }

  _estadoDaFonte(f, agora) {
    const idadeS = f.geradoEm === null ? null : Math.max(0, agora - f.geradoEm)
    const estado = f.geradoEm === null ? 'sem_lista' : idadeS > this.idadeMaxS ? 'velha' : 'em_dia'
    return { idadeS, estado }
  }

  _conferirIdade() {
    const agora = this.relogio()
    for (const f of this._fontes) {
      const { idadeS, estado } = this._estadoDaFonte(f, agora)
      if (estado !== 'em_dia') {
        this.registrar({ nivel: 'alerta', evento: 'revogados_lista_velha', fonte: hostDe(f.url), estado, idadeS, idadeMaxS: this.idadeMaxS, falhasSeguidas: f.falhasSeguidas })
      }
    }
  }

  /** O que vai para `GET /v1/info` (campo `revogados`). Público: chaves e URLs que o operador configurou, datas e contagens. */
  estadoDosRevogados(agora = this.relogio()) {
    let vigentes = 0
    let lembrados = 0
    for (const p of this._pares.values()) { if (p.vigente) vigentes++; else lembrados++ }
    return {
      intervaloS: this.intervaloS,
      idadeMaxS: this.idadeMaxS,
      vigentes,
      lembrados,
      fontes: this._fontes.map((f) => {
        const { idadeS, estado } = this._estadoDaFonte(f, agora)
        return { emissores: [...f.emissores], url: f.url, estado, geradoEm: f.geradoEm, atualizadaEm: f.atualizadaEm, idadeS, falhasSeguidas: f.falhasSeguidas, ultimoErro: f.ultimoErro }
      })
    }
  }

  /**
   * O ÚNICO caminho para esquecer uma revogação: o operador, de propósito. Apaga só os LEMBRADOS (pares que a lista atual do emissor
   * já não traz); um par que a lista atual traz voltaria na próxima leitura, então fica. `{ emissor, uid }` ou `{ tudo: true }`.
   * @returns {{ limpos: number, vigentesMantidos: number }}
   */
  limpar({ emissor, uid, tudo = false } = {}) {
    let limpos = 0
    let vigentesMantidos = 0
    for (const [k, p] of this._pares) {
      if (!tudo && !(p.emissor === emissor && p.uid === uid)) continue
      if (p.vigente) { vigentesMantidos++; continue }
      this._pares.delete(k)
      limpos++
    }
    if (limpos) {
      this._versao++
      this._salvar()
    }
    this.registrar({ nivel: 'info', evento: 'revogados_limpos', limpos, vigentesMantidos })
    return { limpos, vigentesMantidos }
  }

  /** Relê de `intervaloS` em `intervaloS`. Devolve quem para. O temporizador não segura o processo. */
  ligar() {
    const t = setInterval(() => { this.atualizar().catch(() => {}) }, this.intervaloS * 1000)
    t.unref()
    return () => clearInterval(t)
  }

  // ---------- disco ----------

  _salvar() {
    if (!this.arquivo) return
    const dados = {
      formato: FORMATO_DO_ARQUIVO,
      fontes: this._fontes.map((f) => ({ url: f.url, emissores: [...f.emissores], geradoEm: f.geradoEm, atualizadaEm: f.atualizadaEm })),
      pares: [...this._pares.values()].map((p) => ({ emissor: p.emissor, uid: p.uid, ate: p.ate, vigente: p.vigente }))
    }
    const temporario = `${this.arquivo}.${process.pid}.novo`
    try {
      writeFileSync(temporario, JSON.stringify(dados), { mode: 0o600 })
      renameSync(temporario, this.arquivo)
    } catch (e) {
      try { rmSync(temporario, { force: true }) } catch { /* nada a limpar */ }
      // A memória continua certa; o disco fica com a versão anterior até a próxima gravação.
      this.registrar({ nivel: 'alerta', evento: 'revogados_falha_ao_gravar', erro: e?.code ?? 'desconhecido' })
    }
  }

  _carregar() {
    if (!existsSync(this.arquivo)) return
    const ilegivel = () => new Error(`O arquivo de revogados (${this.arquivo}) está ilegível. O relé não sobe sem ele, porque subir vazio esqueceria revogações. Confira o arquivo; para recomeçar a memória de propósito, mova-o de lado (docs/OPERACAO-DO-RELE.md, seção 15).`)
    let d
    try { d = JSON.parse(readFileSync(this.arquivo, 'utf8')) } catch { throw ilegivel() }
    if (!ehObjeto(d) || d.formato !== FORMATO_DO_ARQUIVO || !Array.isArray(d.fontes) || !Array.isArray(d.pares)) throw ilegivel()
    const instanteOuNulo = (n) => n === null || (Number.isSafeInteger(n) && n >= 0)
    for (const f of d.fontes) {
      if (!ehObjeto(f) || typeof f.url !== 'string' || !instanteOuNulo(f.geradoEm) || !instanteOuNulo(f.atualizadaEm)) throw ilegivel()
      const atual = this._fontes.find((x) => x.url === f.url)
      if (atual) { atual.geradoEm = f.geradoEm; atual.atualizadaEm = f.atualizadaEm }
    }
    for (const p of d.pares) {
      if (!ehObjeto(p) || typeof p.emissor !== 'string' || !CHAVE_PUBLICA_RE.test(p.emissor) || typeof p.uid !== 'string' || !UID_RE.test(p.uid) ||
          !Number.isSafeInteger(p.ate) || typeof p.vigente !== 'boolean') throw ilegivel()
      // Par vigente de um emissor que não tem mais fonte configurada: ninguém o atualizaria, então passa a lembrado.
      const vigente = p.vigente && this._fonteDe(p.emissor) !== null
      this._pares.set(`${p.emissor}|${p.uid}`, { emissor: p.emissor, uid: p.uid, ate: p.ate, vigente })
    }
  }
}
