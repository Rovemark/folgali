// SPDX-License-Identifier: AGPL-3.0-or-later
// Semeador da demonstração: faz o que um cliente real faria, pela API HTTP do relé (POST /v1/objetos), com objetos assinados,
// atestado de handle do emissor de demonstração e aprovação humana de uso único nos objetos que a exigem.
//
// O RELÉ REAL MANDA NO TEMPO. Conta com menos de 1 dia não cria comunidade nem página, amizade com menos de 3 dias não dá
// depoimento, com menos de 7 não dá selo, quem entrou numa comunidade espera 10 minutos para responder e 1 hora para abrir
// tópico ou votar. O relé mede isso com o relógio dele e nenhuma opção do operador adianta o tempo. Por isso o semeador não
// força nada: publica o que já pode, ADIA o que o relé recusou por idade ou carência (e tudo que depende disso) e diz quando
// vale tentar de novo (`adiados` e `proximaRodada` no relatório). Rodar de novo completa o que amadureceu. Ver o calendário em
// docs/OPERACAO-DO-RELE.md, "Semear a demonstração".
//
// IDEMPOTENTE, por duas fontes: (1) o LEDGER, um registro do que já foi publicado (fase, chave do item, id), que o chamador guarda
// em arquivo; (2) a cadeia do rover no relé (só para os tipos antigos e só até o primeiro objeto de AÇÃO, porque o relé não guarda
// o envelope de ação e a cadeia deixa de ser legível ali). Sem o ledger, uma segunda rodada pode repetir conteúdo.
//
// COMO ACRESCENTAR UM TIPO: escreva a lista no catálogo, acrescente a fase em FASES (aqui e em fases-03.mjs) depois do que ela referencia.
import { criarAprovacaoHumana, criarAtestadoDeHandle, criarObjeto, exigeAprovacao } from '../../../protocolo/src/index.js'
import { CATALOGO } from './catalogo.mjs'
import { emissorDe, roverDe } from './chaves-demo.mjs'
import { FASES_03 } from './fases-03.mjs'

const DIA = 86400
const VALIDADE_DO_ATESTADO_S = 80 * DIA // o protocolo aceita até 90
const RENOVAR_COM_MENOS_DE_S = 30 * DIA
/** Acima disto, esperar um 429 no lugar não faz sentido: a fase adia o item e conta com a próxima rodada. */
const ESPERA_MAXIMA_NO_LUGAR_S = 120
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms))

export class ErroDeSemeadura extends Error {}

/** Lançada por `ctx.idDe` quando o item de que se depende foi adiado nesta rodada: o item que depende também é adiado. */
export class Adiado extends Error {
  constructor(motivo, tentarEm = null) { super(motivo); this.motivo = motivo; this.tentarEm = tentarEm }
}

/** O registro do que a semeadura já fez. O chamador guarda este objeto (JSON) entre rodadas. */
export const novoLedger = () => ({ versao: 1, itens: {}, rovers: {} })

/**
 * Tipos de objeto que o semeador sabe reconhecer na cadeia de um rover para não repeti-los: tipo -> chave de identidade do corpo.
 * Só os tipos de CONTEÚDO antigos: o relé guarda o envelope deles. O resto vive no ledger.
 */
const IDENTIDADE = {
  postagem: (c) => c.texto,
  resposta: (c) => `${c.alvo}|${c.texto}`,
  seguir: (c) => c.alvo,
  reacao: (c) => c.alvo
}

/**
 * FASES, na ordem em que são publicadas. Cada fase descreve UM tipo de objeto do catálogo:
 *   nome       rótulo no relatório e chave no ledger
 *   tipo       tipo do objeto no protocolo
 *   exige      versão mínima do protocolo que o relé precisa declarar em /v1/info (null = qualquer); fase sem suporte é pulada
 *   itens      (catalogo) => lista de itens
 *   autor      (item) => slug do rover que publica
 *   chave      (item, ctx) => identidade do item (estável entre rodadas: use ids, não horas)
 *   corpo      (item, ctx) => corpo do objeto
 *   ref        (item) => ref pelo qual outros itens apontam para este (opcional)
 *   acao       true quando o objeto é AÇÃO (o relé não guarda o envelope): o ledger guarda só `true`
 *   adia       códigos de erro do relé que significam "ainda não é hora": o item é adiado, não é falha
 *   jaFeito    códigos de erro que significam "já está feito": o item conta como existente
 *   recuperar  async (item, ctx) => id; quando o relé diz `ja_existe` e o id é necessário (comunidade, página)
 *   rotulo     (item) => texto curto do item para o relatório de adiados
 * `ctx.idDe(ref)` devolve o id de um ref já publicado (ou existente); `ctx.uidDe(slug)` o uid do rover; `ctx.agora()` o relógio.
 */
export const FASES = [
  {
    nome: 'postagens', tipo: 'postagem', exige: null,
    itens: (c) => c.postagens, autor: (i) => i.de, ref: (i) => i.ref,
    chave: (i) => i.texto,
    corpo: (i) => ({ ...(i.titulo ? { titulo: i.titulo } : {}), texto: i.texto, topicos: i.topicos })
  },
  {
    nome: 'respostas', tipo: 'resposta', exige: null,
    itens: (c) => c.respostas, autor: (i) => i.de, ref: (i) => i.ref,
    chave: (i, ctx) => `${ctx.idDe(i.a)}|${i.texto}`,
    corpo: (i, ctx) => ({ alvo: ctx.idDe(i.a), texto: i.texto })
  },
  {
    nome: 'seguir', tipo: 'seguir', exige: null, jaFeito: ['ja_segue'],
    itens: (c) => c.seguir, autor: (i) => i[0],
    chave: (i, ctx) => ctx.uidDe(i[1]),
    corpo: (i, ctx) => ({ alvo: ctx.uidDe(i[1]) })
  },
  {
    nome: 'reacoes', tipo: 'reacao', exige: null, jaFeito: ['ja_reagiu'],
    itens: (c) => c.reacoes, autor: (i) => i[0],
    chave: (i, ctx) => ctx.idDe(i[1]),
    corpo: (i, ctx) => ({ alvo: ctx.idDe(i[1]), reacao: i[2] })
  },
  ...FASES_03
]

/** Cliente HTTP mínimo: ritmo entre pedidos, espera no 429 e nova tentativa em falha de rede ou 5xx. */
function criarCliente({ url, fetchFn, esperar, intervaloMs, registrar }) {
  const base = url.replace(/\/+$/, '')
  let ultimo = 0
  return async function pedir(metodo, caminho, corpo) {
    for (let tentativa = 1; ; tentativa++) {
      // rede de segurança: as saídas normais (falha de rede, 5xx, 429) já param bem antes; isto só impede um laço sem fim
      if (tentativa > 50) throw new ErroDeSemeadura(`o relé não respondeu depois de ${tentativa - 1} tentativas em ${metodo} ${caminho.split('?')[0].replace(/rvr_[\\w-]+|ob_[\\w-]+/g, ':id')}`)
      const falta = intervaloMs - (Date.now() - ultimo)
      if (falta > 0) await esperar(falta)
      ultimo = Date.now()
      let res
      try {
        res = await fetchFn(base + caminho, {
          method: metodo,
          headers: corpo === undefined ? {} : { 'content-type': 'application/json' },
          body: corpo === undefined ? undefined : JSON.stringify(corpo),
          signal: AbortSignal.timeout(20_000)
        })
      } catch (e) {
        if (tentativa >= 4) throw new ErroDeSemeadura(`sem resposta do relé em ${metodo} ${caminho.split('?')[0].replace(/rvr_[\w-]+|ob_[\w-]+/g, ':id')}`)
        await esperar(500 * tentativa)
        continue
      }
      const texto = await res.text()
      let json = null
      try { json = JSON.parse(texto) } catch { /* corpo não JSON */ }
      const retryAfter = Number(res.headers.get('retry-after')) || null
      if (res.status === 429 && tentativa <= 12 && (retryAfter ?? 1) <= ESPERA_MAXIMA_NO_LUGAR_S) {
        const espera = Math.min(30, Math.max(1, retryAfter || 1))
        registrar({ evento: 'espera_429', segundos: espera })
        await esperar(espera * 1000)
        continue
      }
      if (res.status >= 500 && tentativa < 4) { await esperar(500 * tentativa); continue }
      return { status: res.status, json, retryAfter }
    }
  }
}

/** Mesmo corpo de perfil? Compara pelo conteúdo, sem depender da ordem das chaves. */
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x))

/**
 * @param {object} o
 * @param {string} o.url              endereço base do relé (https://... ou http://127.0.0.1:porta)
 * @param {Buffer} o.semente          semente do emissor de demonstração (32 bytes)
 * @param {object} [o.catalogo]
 * @param {object} [o.ledger]         o registro do que já foi feito (novoLedger()); o chamador o guarda entre rodadas
 * @param {(ledger: object) => void} [o.aoProgredir] chamado depois de cada fase e no fim (para gravar o ledger em disco)
 * @param {number} [o.geracao]        muda os uids dos rovers (só para recomeçar quando um relé guardou rovers que não dá mais para continuar)
 * @param {boolean} [o.simular]       só lê e conta; não publica nada
 * @param {boolean} [o.aceitarSemLedger] segue mesmo quando o relé já tem rovers desta semeadura e o ledger está vazio (repete conteúdo)
 * @param {() => number} [o.relogio]  segundos
 * @param {number} [o.intervaloMs]    ritmo mínimo entre pedidos (o relé tem rajada por origem)
 */
export async function semear({
  url, semente, catalogo = CATALOGO, ledger = novoLedger(), aoProgredir = () => {}, geracao = 1, simular = false, aceitarSemLedger = false,
  relogio = () => Math.floor(Date.now() / 1000), fetchFn = fetch, esperar = dormir, intervaloMs = 130, registrar = () => {}
}) {
  const pedir = criarCliente({ url, fetchFn, esperar, intervaloMs, registrar })
  const emissor = emissorDe(semente)
  const relatorio = { criados: {}, existentes: {}, pulados: [], adiados: [], proximaRodada: null, simulado: simular }
  const conta = (grupo, nome) => { relatorio[grupo][nome] = (relatorio[grupo][nome] ?? 0) + 1 }

  const info = await pedir('GET', '/v1/info')
  if (info.status !== 200 || !Array.isArray(info.json?.protocolo)) throw new ErroDeSemeadura('o endereço não respondeu como um relé da Rover Network (/v1/info)')
  if (!info.json.emissores?.includes(emissor.chavePublica)) {
    throw new ErroDeSemeadura('este relé não confia no emissor de demonstração desta semente: ele recusaria todos os rovers. Confira RELE_EMISSORES.')
  }
  const versoes = info.json.protocolo

  // ---------- estado dos rovers ----------
  const rovers = new Map()
  for (const r of catalogo.rovers) {
    const chaves = roverDe(semente, r.slug, geracao)
    rovers.set(r.slug, { ...r, ...chaves, cabeca: null, ultimoCriado: 0, estado: null, indice: {} })
  }
  const uidDe = (slug) => {
    const r = rovers.get(slug)
    if (!r) throw new ErroDeSemeadura(`o catálogo cita o rover "${slug}", que não existe em rovers`)
    return r.uid
  }

  async function lerEstado(r) {
    const p = await pedir('GET', `/v1/rovers/${r.uid}`)
    if (p.status === 404) return null
    if (p.status !== 200) throw new ErroDeSemeadura(`não consegui ler o rover ${r.slug} (status ${p.status})`)
    const estado = { perfil: p.json, corpoDoPerfil: p.json.perfil?.corpo ?? null }
    r.cabeca = p.json.cabeca
    r.ultimoCriado = ledger.rovers[r.slug]?.ultimoCriado ?? 0
    r.indice = {}
    for (const t of Object.keys(IDENTIDADE)) r.indice[t] = new Map()
    // A cadeia só é legível até o primeiro objeto de AÇÃO (o relé não guarda o envelope dele): ali a leitura para, e o ledger cobre o resto.
    let id = p.json.cabeca
    let primeiro = true
    let passos = 0
    while (id) {
      if (++passos > 2000) throw new ErroDeSemeadura(`a cadeia do rover ${r.slug} é longa demais para ler`)
      const o = await pedir('GET', `/v1/objetos/${id}`)
      if (o.status === 404 || o.status === 410) {
        // ação (sem envelope guardado) ou objeto removido: a leitura da cadeia para aqui. Se a cabeça nem foi lida e o ledger não sabe a
        // hora dela, o próximo objeto leva a hora de agora (nunca anda para trás na cadeia: o relé recusaria por relógio).
        if (primeiro && !ledger.rovers[r.slug]) r.ultimoCriado = relogio()
        break
      }
      if (o.status !== 200) throw new ErroDeSemeadura(`não consegui ler um objeto da cadeia do rover ${r.slug} (status ${o.status}); recomece com --geracao novo`)
      const obj = o.json.objeto
      if (primeiro) { r.ultimoCriado = Math.max(r.ultimoCriado, obj.criadoEm); primeiro = false }
      const identidade = IDENTIDADE[obj.tipo]
      if (identidade) {
        const chave = identidade(obj.corpo)
        if (!r.indice[obj.tipo].has(chave)) r.indice[obj.tipo].set(chave, obj.id)
      }
      id = obj.previo
    }
    return estado
  }

  for (const r of rovers.values()) r.estado = await lerEstado(r)
  // Relé que já tem os rovers desta semeadura e um ledger vazio: o registro se perdeu. Seguir repetiria postagens, respostas e tudo
  // o que o relé não reconhece sozinho. Melhor parar e dizer, do que encher a demonstração de duplicata.
  if (!simular && !aceitarSemLedger && Object.keys(ledger.itens).length === 0 && [...rovers.values()].some((r) => r.estado)) {
    throw new ErroDeSemeadura('o relé já tem rovers desta semeadura, mas o registro do que foi feito (o arquivo de estado) está vazio: uma nova rodada repetiria o conteúdo. Recupere o arquivo, recomece com --geracao novo, ou use --aceitar-sem-estado se sabe o que faz.')
  }

  // ---------- publicação ----------
  let contador = 0
  const refs = new Map() // ref -> id do objeto (publicado agora ou já existente)
  const refsAdiados = new Set() // refs de itens adiados nesta rodada: quem depende deles também espera
  const ctx = {
    uidDe,
    agora: relogio,
    idDe: (ref) => {
      const id = refs.get(ref)
      if (id) return id
      if (refsAdiados.has(ref)) throw new Adiado(`depende de ${ref}, que ainda não pôde ser publicado`)
      if (simular) return `pendente:${ref}`
      throw new ErroDeSemeadura(`o catálogo aponta para "${ref}", que não foi publicado nem existe no relé`)
    },
    pedir
  }

  /** @returns {Promise<{ id?: string, jaFeito?: boolean, adiado?: { motivo: string, tentarEm: number | null } }>} */
  async function publicar(r, fase, corpo, { anexarAtestado = false } = {}) {
    const tipo = fase.tipo
    if (simular) return { id: `simulado:${tipo}:${++contador}` }
    const agora = relogio()
    // Dentro da janela de relógio do relé (15 minutos para trás) e sem nunca andar para trás na cadeia do rover.
    const criadoEm = Math.min(agora, Math.max(r.ultimoCriado, agora - 300 + contador++))
    const objeto = criarObjeto({ tipo, autor: r.uid, criadoEm, previo: r.cabeca, corpo, chavePrivada: r.rede.chavePrivada })
    const envelope = { objeto }
    if (anexarAtestado) {
      envelope.atestado = criarAtestadoDeHandle({
        chavePrivadaDoEmissor: emissor.chavePrivada, emissor: emissor.chavePublica, uid: r.uid, handle: r.handle,
        chave: r.rede.chavePublica, chaveAprovacao: r.aprovacao.chavePublica, emitidoEm: agora - 10, expiraEm: agora - 10 + VALIDADE_DO_ATESTADO_S
      })
    }
    if (exigeAprovacao(tipo, [])) {
      envelope.aprovacao = criarAprovacaoHumana({
        chavePrivadaDeAprovacao: r.aprovacao.chavePrivada, objeto: objeto.id, autor: r.uid, aprovadoEm: Math.max(agora, criadoEm), validadeS: 300
      })
    }
    const res = await pedir('POST', '/v1/objetos', envelope)
    const codigo = res.json?.erro?.codigo
    if (res.status === 201 || res.status === 200) {
      r.cabeca = objeto.id
      r.ultimoCriado = criadoEm
      ledger.rovers[r.slug] = { ultimoCriado: criadoEm }
      return { id: objeto.id }
    }
    // Já feito por uma rodada anterior que o relé aceitou e a resposta se perdeu: não é erro.
    if (fase.jaFeito?.includes(codigo)) return { jaFeito: true }
    // Ainda não é hora: idade da conta, carência na comunidade, amizade nova demais, ou um teto de taxa que só passa daqui a muito.
    if (fase.adia?.includes(codigo) || (res.status === 429 && (res.retryAfter ?? 0) > ESPERA_MAXIMA_NO_LUGAR_S) || (res.status === 429 && codigo === 'limite_de_taxa')) {
      const espera = res.retryAfter ?? res.json?.erro?.retryAfterS ?? null
      return { adiado: { motivo: codigo ?? `status ${res.status}`, tentarEm: espera ? agora + espera : null } }
    }
    throw new ErroDeSemeadura(`o relé recusou ${tipo} do rover ${r.slug}: ${codigo ?? res.status}`)
  }

  // 1. perfis (com o atestado quando o rover é novo ou o atestado está para vencer)
  for (const r of rovers.values()) {
    const corpo = { nome: r.nome, descricao: r.descricao, grafo: r.grafo ?? 'publico', exigirAprovacao: [], ...(r.perfil03 ?? {}) }
    const agora = relogio()
    const atestadoPerto = r.estado && r.estado.perfil.atestado.expiraEm - agora < RENOVAR_COM_MENOS_DE_S
    const atual = r.estado?.corpoDoPerfil
    const igual = atual && canon({ ...atual, exigirAprovacao: atual.exigirAprovacao ?? [] }) === canon(corpo)
    if (igual && !atestadoPerto) { conta('existentes', 'perfis'); continue }
    const res = await publicar(r, { tipo: 'perfil' }, corpo, { anexarAtestado: !r.estado || atestadoPerto })
    if (res.adiado) throw new ErroDeSemeadura(`o relé adiou o perfil do rover ${r.slug} (${res.adiado.motivo}); o perfil não deve ter idade mínima`)
    conta('criados', 'perfis')
  }
  aoProgredir(ledger)

  // 2. o resto, fase a fase, na ordem do catálogo
  const registrarAdiado = (fase, item, motivo, tentarEm) => {
    const rotulo = fase.rotulo ? fase.rotulo(item) : fase.autor(item)
    relatorio.adiados.push({ fase: fase.nome, item: rotulo, motivo, tentarEm })
    if (tentarEm && (relatorio.proximaRodada === null || tentarEm < relatorio.proximaRodada)) relatorio.proximaRodada = tentarEm
    if (fase.ref) refsAdiados.add(fase.ref(item))
  }
  try {
    for (const fase of FASES) {
      if (fase.exige && !versoes.includes(fase.exige)) {
        relatorio.pulados.push({ fase: fase.nome, motivo: `o relé declara o protocolo ${versoes.join(', ')} e esta fase precisa da ${fase.exige}` })
        continue
      }
      for (const item of fase.itens(catalogo)) {
        const r = rovers.get(fase.autor(item))
        if (!r) throw new ErroDeSemeadura(`o catálogo cita o rover "${fase.autor(item)}", que não existe em rovers`)
        try {
          const chave = fase.chave(item, ctx)
          // o ledger é de todos os rovers: a chave leva o autor, senão "seguir fulano" de um rover valeria para todos
          const chaveDoLedger = `${r.slug}|${chave}`
          const guardado = ledger.itens[fase.nome]?.[chaveDoLedger]
          const existente = guardado ?? r.indice[fase.tipo]?.get(chave)
          if (existente) {
            if (fase.ref) refs.set(fase.ref(item), existente === true ? 'feito' : existente)
            conta('existentes', fase.nome)
            continue
          }
          const corpo = fase.corpo(item, ctx)
          const res = await publicar(r, fase, corpo)
          if (res.adiado) { registrarAdiado(fase, item, res.adiado.motivo, res.adiado.tentarEm); continue }
          if (res.jaFeito) {
            // o relé já tinha: conta como existente; se outros itens apontam para este, o id vem da leitura (comunidade, página)
            const id = fase.recuperar ? await fase.recuperar(item, ctx) : null
            if (fase.recuperar && !id) throw new ErroDeSemeadura(`o relé diz que "${fase.nome}" já existe, mas não achei o id para continuar`)
            if (!simular) (ledger.itens[fase.nome] ??= {})[chaveDoLedger] = fase.acao ? true : (id ?? true)
            if (fase.ref) refs.set(fase.ref(item), id ?? 'feito')
            conta('existentes', fase.nome)
            continue
          }
          if (!simular) (ledger.itens[fase.nome] ??= {})[chaveDoLedger] = fase.acao ? true : res.id
          // o ref de uma ação vale 'feito' tanto agora quanto nas rodadas seguintes: quem aponta para ele (a chave do banimento aponta
          // para a remoção) precisa de uma chave igual nas duas, senão a rodada seguinte tentaria publicar de novo
          if (fase.ref) refs.set(fase.ref(item), fase.acao ? 'feito' : res.id)
          conta('criados', fase.nome)
        } catch (e) {
          if (!(e instanceof Adiado)) throw e
          registrarAdiado(fase, item, e.motivo, e.tentarEm)
        }
      }
      aoProgredir(ledger)
    }
  } finally {
    aoProgredir(ledger)
  }

  relatorio.rovers = [...rovers.values()].map((r) => ({ slug: r.slug, handle: r.handle, uid: r.uid }))
  return relatorio
}
