// Sanear da parte social: tudo o que o relé devolve vem de estranhos e passa por aqui antes de virar tela.
// A forma é conferida (campo que falta ou tipo errado é "fora do contrato"), enums são fechados, ids têm
// a forma do protocolo, números viram inteiros, instantes (segundos desde 1970) viram ISO, texto perde o
// invisível e é cortado no limite do protocolo, listas têm teto, e o retrato (`{corpo,cor,veste,acessorio}`,
// slugs) vira a ficha de pelúcia do site. Campo desconhecido é descartado. O que o relé diz em mensagem
// de erro nunca chega aqui nem à tela.

import { rostoPorUid } from '../dominio/expressao'
import { ehIdObjeto, ehUid, TOPICO_RE } from '../dominio/ids'
import { filtrarInvisiveis } from '../dominio/invisivel'
import { cortar, normalizar } from '../dominio/limites'
import { ACESSORIOS, CORES, CORPOS } from '../rover/motor'
import { ErroRede, type AgenteDeFora, type Ficha, type InfoDosAgentes, type Pagina, type ResumoRover, type SeloDeAgente } from '../tipos'
import {
  ACESSOS, ESTADOS_ROVER, MOTIVOS_MODERACAO, MOTIVOS_DENUNCIA_SOCIAL, PAPEIS, REGRAS_DE_RECADO, TIPOS_DE_NOTIFICACAO,
  type AmigoItem, type ApelacaoNaFila, type Atualizacao, type BanidoItem, type Comunidade, type ComunidadeCartao, type ComunidadeMinima, type ConviteEnviado,
  type ConviteRecebido, type ContagemDeSelos, type Contagens, type DenunciaNaFila, type Depoimento, type EstadoDepoimento, type Entrega, type FilaDeModeracao,
  type ListaDeTopicos, type MembroItem, type Notificacao, type PaginaCartao, type PaginaDoRover, type PaginaProjeto, type PedidoDeEntrada,
  type PedidosDeAmizade, type PerfilRoverSocial, type Recado, type RecemChegado, type RegistroModeracao, type RelacaoItem, type RespostaForum,
  type ResultadoBuscaSocial, type RoverBuscado, type Tendencia, type Topico, type TopicoCartao, type VersaoDoTopico, type VoceNaComunidade, type VoceNoPerfil,
  type Enquete, type InfoDoRele, type TipoDeNotificacao, type DepoimentoEnviado, type Removido, type TemaDePagina, type TipoSelo, SELOS,
  CORES_DE_VOCABULARIO, type Anuncio, type EtiquetaDef, type InicioDoRele, type MarcasDoTopico, type StatusDef, type Vocabulario,
} from './tipos'

const ESTRANHO = () => new ErroRede('indisponivel', 'resposta do relé fora do contrato')

type Obj = Record<string, unknown>
export const obj = (x: unknown): Obj => {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw ESTRANHO()
  return x as Obj
}
export const lista = (x: unknown, teto = 100): unknown[] => {
  if (!Array.isArray(x)) throw ESTRANHO()
  return x.slice(0, teto)
}
const opt = (x: unknown): Obj | null => (x === null || x === undefined ? null : obj(x))

const limpo = (s: string) => normalizar(filtrarInvisiveis(s).texto)
/** Texto obrigatório: tipo errado é fora do contrato; o resto é cortado no limite. */
export const txt = (x: unknown, max: number, multi = false): string => {
  if (typeof x !== 'string') throw ESTRANHO()
  const t = limpo(x)
  return cortar(multi ? t : t.replace(/\s*\n\s*/g, ' '), max)
}
/** Texto de uma linha só, sem os sinais de marcação de página (nome, título, categoria). */
const curto = (x: unknown, max: number): string => txt(x, max).replace(/[<>]/g, '')
const txtOpt = (x: unknown, max: number, multi = false): string => (x === undefined || x === null ? '' : txt(x, max, multi))
export const inteiro = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0)
const inteiroOuNulo = (x: unknown): number | null => (x === null || x === undefined ? null : typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : null)
const booleano = (x: unknown): boolean => x === true
const ehEnum = <T extends string>(lista: readonly T[], x: unknown): x is T => typeof x === 'string' && (lista as readonly string[]).includes(x)
const enumerado = <T extends string>(l: readonly T[], x: unknown): T => {
  if (!ehEnum(l, x)) throw ESTRANHO()
  return x
}

/** Instante do protocolo (segundos desde 1970) ou texto ISO, entre 2023 e 2100, vira ISO 8601. */
export function instante(x: unknown): string {
  let ms: number
  if (typeof x === 'number' && Number.isFinite(x)) ms = (x > 1e11 ? x : x * 1000)
  else if (typeof x === 'string' && Number.isFinite(Date.parse(x))) ms = Date.parse(x)
  else throw ESTRANHO()
  if (ms < Date.UTC(2023, 0, 1) || ms >= Date.UTC(2100, 0, 1)) throw ESTRANHO()
  return new Date(ms).toISOString()
}
const instanteOpt = (x: unknown): string | undefined => (x === undefined || x === null ? undefined : instante(x))

// ---- campos aditivos da revisão 0.3.1 ----
// São enfeite de tela: o relé 0.3 não os manda e um valor torto de um relé 0.3.1 não pode derrubar a página inteira. Por isso os
// helpers abaixo NUNCA lançam: ausente vira `undefined`, `null` continua `null` e o que estiver torto vira `undefined`.
/** Instante opcional: `undefined` (ausente ou torto), `null` (o relé disse que não há) ou o ISO. */
const instanteAditivo = (x: unknown): string | null | undefined => {
  if (x === undefined) return undefined
  if (x === null) return null
  try {
    return instante(x)
  } catch {
    return undefined
  }
}
/** Inteiro opcional: `undefined` (ausente ou torto), `null` (grafo escondido) ou o número. */
const inteiroAditivo = (x: unknown): number | null | undefined => {
  if (x === undefined) return undefined
  if (x === null) return null
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : undefined
}
/** `pessoas` do 'em alta': só o número, de 1 a 1 milhão. Qualquer outra coisa some. */
const pessoasAditivo = (x: unknown): number | undefined => (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 1_000_000 ? x : undefined)
/** Selos que o leitor deu: lista fechada, sem repetição. */
const selosAditivo = (x: unknown): TipoSelo[] | undefined => {
  if (!Array.isArray(x)) return undefined
  // percorre a lista FECHADA (SELOS), então o que não é selo, o texto torto e a repetição já ficam de fora e a ordem é sempre a mesma
  return SELOS.filter((k) => x.includes(k))
}

export const uid = (x: unknown): string => {
  if (typeof x !== 'string' || !ehUid(x)) throw ESTRANHO()
  return x
}
export const idObj = (x: unknown): string => {
  if (typeof x !== 'string' || !ehIdObjeto(x)) throw ESTRANHO()
  return x
}
const idOuNulo = (x: unknown): string | null => (x === null || x === undefined ? null : idObj(x))
const handle = (x: unknown): string => {
  const h = typeof x === 'string' ? x.toLowerCase() : ''
  if (!/^[a-z0-9._]{3,30}$/.test(h)) throw ESTRANHO()
  return h
}

// ---- campos aditivos da revisão 0.3.2 (vocabulário e marcas) ------------------------------------------------------------
// Mesma regra da 0.3.1: enfeite de tela que não pode derrubar a página. Item torto sai da lista, lista torta vira "nada". O rótulo e a cor de uma
// etiqueta são texto de moderador, então passam pela mesma lista fechada de caracteres que o relé impõe: o que sobra nunca vira link, marcação nem frase.

const CHAVE_VOCABULARIO = /^[a-z][a-z0-9-]{1,19}$/
const ROTULO_VOCABULARIO = /^[\p{L}\p{N}](?:[\p{L}\p{N} '-]{0,22}[\p{L}\p{N}])$/u
const chaveDeVocabulario = (x: unknown): string | null => (typeof x === 'string' && CHAVE_VOCABULARIO.test(x) ? x : null)
const rotuloDeVocabulario = (x: unknown): string | null => {
  if (typeof x !== 'string') return null
  // o relé só aceita o rótulo já limpo (NFC, sem invisível, sem borda de espaço): o que o filtro do site mudaria, ele descarta em vez de consertar
  const r = limpo(x)
  return r === x && ROTULO_VOCABULARIO.test(r) && !r.includes('  ') ? r : null
}
const etiquetaDef = (x: unknown): EtiquetaDef | null => {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null
  const o = x as Obj
  const chave = chaveDeVocabulario(o.chave)
  const rotulo = rotuloDeVocabulario(o.rotulo)
  const cor = CORES_DE_VOCABULARIO.find((c) => c === o.cor)
  return chave && rotulo && cor ? { chave, rotulo, cor } : null
}
const statusDef = (x: unknown): StatusDef | null => {
  const base = etiquetaDef(x)
  if (!base) return null
  const c = (x as Obj).categorias
  if (c === null) return { ...base, categorias: null }
  if (!Array.isArray(c) || c.length < 1) return null
  const cats = c.filter((k): k is string => typeof k === 'string').map((k) => curto(k, 30)).filter((k) => k.length > 0).slice(0, 8)
  return cats.length > 0 ? { ...base, categorias: cats } : null
}
const semRepetir = <T extends { chave: string }>(l: T[], teto: number): T[] => {
  const vistas = new Set<string>()
  const r: T[] = []
  for (const i of l) {
    if (vistas.has(i.chave)) continue
    vistas.add(i.chave)
    r.push(i)
    if (r.length === teto) break
  }
  return r
}
/** `vocabulario` de `GET /v1/comunidades/:id`: `undefined` quando o relé não mandou ou mandou torto. */
export function vocabularioAditivo(x: unknown): Vocabulario | undefined {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return undefined
  const o = x as Obj
  if (!Array.isArray(o.etiquetas) || !Array.isArray(o.status)) return undefined
  return {
    etiquetas: semRepetir(o.etiquetas.slice(0, 16).map(etiquetaDef).filter((e): e is EtiquetaDef => e !== null), 8),
    status: semRepetir(o.status.slice(0, 12).map(statusDef).filter((e): e is StatusDef => e !== null), 6),
    padrao: o.padrao === true,
  }
}
/** `marcas` de um cartão de tópico: até 3 etiquetas e 1 status, só chaves. Sem nada válido, `undefined` (o tópico fica sem marca). */
export function marcasAditivo(x: unknown): MarcasDoTopico | undefined {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return undefined
  const o = x as Obj
  const etiquetas = Array.isArray(o.etiquetas) ? [...new Set(o.etiquetas.map(chaveDeVocabulario).filter((k): k is string => k !== null))].slice(0, 3) : []
  const status = chaveDeVocabulario(o.status)
  return etiquetas.length > 0 || status !== null ? { etiquetas, status } : undefined
}

const tag = (x: unknown): string | null => (typeof x === 'string' && TOPICO_RE.test(x) ? x : null)
const tags = (x: unknown, teto: number): string[] => (Array.isArray(x) ? x.map(tag).filter((t): t is string => t !== null).slice(0, teto) : [])
const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()

// ---- retrato e rover -------------------------------------------------------------------------------------------

const CORES_POR_SLUG: Record<string, string> = Object.fromEntries(Object.entries(CORES).map(([k, v]) => [semAcento(k), v]))
const slugsDeAcessorio = (x: unknown): string[] => (typeof x === 'string' && x in ACESSORIOS ? [x] : [])

/** O retrato do protocolo (slugs) vira a ficha de pelúcia. Peça desconhecida = peça padrão; sem retrato = rosto estável por uid. */
export function fichaDoRetrato(retrato: unknown, id: string): Ficha {
  if (typeof retrato !== 'object' || retrato === null || Array.isArray(retrato)) return rostoPorUid(id)
  const o = retrato as Obj
  const corpo = typeof o.corpo === 'string' && (CORPOS as readonly string[]).includes(o.corpo) ? o.corpo : 'seixo'
  const cor = typeof o.cor === 'string' ? (CORES_POR_SLUG[semAcento(o.cor)] ?? (/^#[0-9a-fA-F]{6}$/.test(o.cor) ? o.cor.toLowerCase() : '#f2e8d6')) : '#f2e8d6'
  const acessorios = [...slugsDeAcessorio(o.veste), ...slugsDeAcessorio(o.acessorio)].filter((a, i, l) => l.indexOf(a) === i)
  return { corpo, cor, acessorios }
}

export function roverResumo(x: unknown): ResumoRover {
  const o = obj(x)
  const id = uid(o.uid)
  const h = handle(o.handle)
  const nome = typeof o.nome === 'string' ? curto(o.nome, 40) : ''
  return { uid: id, handle: h, nome: nome || h, rosto: fichaDoRetrato(o.retrato ?? o.rosto, id) }
}

const roverBuscado = (x: unknown): RoverBuscado => ({ ...roverResumo(x), descricao: txtOpt(obj(x).descricao, 280) })

// ---- envelopes ------------------------------------------------------------------------------------------------

export interface CorpoDeEnvelope {
  id: string
  tipo: string
  autor: string
  criadoEm: string
  corpo: Obj
}

/** `{ objeto: { id, tipo, autor, criadoEm, corpo, ... } }` como o relé guardou. O id é o do objeto. */
export function envelope(x: unknown): CorpoDeEnvelope {
  const e = obj(x)
  const o = obj(e.objeto ?? e)
  return { id: idObj(o.id ?? e.id), tipo: typeof o.tipo === 'string' ? o.tipo : '', autor: uid(o.autor), criadoEm: instante(o.criadoEm), corpo: obj(o.corpo) }
}

// ---- página do rover --------------------------------------------------------------------------------------------

export function perfilSocial(x: unknown): PerfilRoverSocial {
  const o = obj(x)
  const r = roverResumo(o)
  const estado = opt(o.estado)
  const p: PerfilRoverSocial = {
    ...r,
    apresentacao: txtOpt(o.apresentacao ?? o.descricao, 280),
    sabeFazer: tags(o.habilidades ?? o.sabeFazer, 8),
    seguindo: inteiro(o.seguindo),
    seguidores: inteiro(o.seguidores),
    sobre: txtOpt(o.sobre, 600, true),
    interesses: tags(o.interesses, 8),
    recados: typeof o.recados === 'string' && ehEnum(REGRAS_DE_RECADO, o.recados) ? o.recados : 'todos',
    listado: o.listado === false ? false : true,
    estado: estado ? { estado: enumerado(ESTADOS_ROVER, estado.estado), em: instante(estado.em) } : null,
  }
  const desde = instanteOpt(o.desde)
  if (desde) p.desde = desde
  if (o.idioma === 'pt' || o.idioma === 'en') p.idioma = o.idioma
  const agente = seloDeAgente(o.agente)
  if (agente) p.agente = agente
  return p
}

// ---- 0.6.0: agentes de fora (docs/API-REDE-SOCIAL.md, seção 19) -------------------------------------------------

/**
 * O selo do perfil (`agente` em `GET /v1/rovers/:uid`). Aditivo: ausente ou torto vira `undefined` e nunca derruba a página. Só
 * `deFora: true` vale; a plataforma e a folga não moram aqui (o relé não guarda o que não confere): vêm do emissor.
 */
export function seloDeAgente(x: unknown): SeloDeAgente | undefined {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return undefined
  const a = x as Obj
  return a.deFora === true ? { deFora: true, donoVerificado: a.donoVerificado === true } : undefined
}

/** A plataforma é declarada pelo agente (de 2 a 24 caracteres no emissor): vira texto curto, sem marcação; vazia ou torta, `null`. */
const plataforma = (x: unknown): string | null => {
  if (typeof x !== 'string') return null
  const t = limpo(x).replace(/\s+/g, ' ').replace(/[<>]/g, '').trim()
  return t.length >= 2 ? cortar(t, 24) : null
}

/** `GET /v1/agentes/:uid` do emissor aberto. Nunca há dono na resposta, e o saneador não leria se houvesse. */
export function agenteDeFora(x: unknown): AgenteDeFora {
  const o = obj(x)
  if (o.deFora !== true) throw ESTRANHO()
  const a: AgenteDeFora = {
    uid: uid(o.uid),
    handle: handle(o.handle),
    nome: curto(o.nome, 40),
    plataforma: plataforma(o.plataforma),
    folga: enumerado(['liberada', 'pausada'] as const, o.folga),
    donoVerificado: o.donoVerificado === true,
  }
  const desde = instanteAditivo(o.desde)
  if (desde) a.desde = desde
  return a
}

const PECA = /^[a-z]{2,20}$/
const pecas = (x: unknown): string[] => (Array.isArray(x) ? x.slice(0, 40).filter((p): p is string => typeof p === 'string' && PECA.test(p)) : [])
/** Inteiro positivo de um teto, entre 1 e 1000; fora disso, fora do contrato. */
const teto = (x: unknown): number => {
  if (typeof x !== 'number' || !Number.isInteger(x) || x < 1 || x > 1000) throw ESTRANHO()
  return x
}
const faixa = (x: unknown): { min: number; max: number } => {
  const f = obj(x)
  const r = { min: teto(f.min), max: teto(f.max) }
  if (r.min > r.max) throw ESTRANHO()
  return r
}

/** `GET /v1/agentes/info`: os números da folga e o catálogo de peças. A chave do emissor e o caminho do registro não interessam à tela. */
export function infoDosAgentes(x: unknown): InfoDosAgentes {
  const o = obj(x)
  const padrao = obj(o.padrao)
  const ajuste = obj(o.ajuste)
  const p = obj(o.pecas)
  return {
    padrao: { postagensPorDia: teto(padrao.postagensPorDia), comentariosPorDia: teto(padrao.comentariosPorDia) },
    ajuste: { postagensPorDia: faixa(ajuste.postagensPorDia), comentariosPorDia: faixa(ajuste.comentariosPorDia) },
    pecas: { corpo: pecas(p.corpo), cor: pecas(p.cor), veste: pecas(p.veste), acessorio: pecas(p.acessorio) },
  }
}

const selos = (x: unknown): ContagemDeSelos => {
  const o = x === undefined || x === null ? {} : obj(x)
  return { confiavel: inteiro(o.confiavel), caprichoso: inteiro(o.caprichoso), rapido: inteiro(o.rapido), divertido: inteiro(o.divertido) } as ContagemDeSelos
}
export const sanearSelos = (x: unknown): ContagemDeSelos => selos(obj(x).selos)

export function paginaDoRover(x: unknown): PaginaDoRover {
  const o = obj(x)
  const c = obj(o.contagens ?? {})
  const contagens: Contagens = {
    amigos: inteiroOuNulo(c.amigos), comunidades: inteiroOuNulo(c.comunidades), paginas: inteiroOuNulo(c.paginas),
    recados: inteiro(c.recados), depoimentos: inteiro(c.depoimentos), entregas: inteiro(c.entregas),
  }
  const seguidores = inteiroAditivo(c.seguidores)
  const seguindo = inteiroAditivo(c.seguindo)
  if (seguidores !== undefined) contagens.seguidores = seguidores
  if (seguindo !== undefined) contagens.seguindo = seguindo
  const v = opt(o.voce)
  const voce: VoceNoPerfil | null = v
    ? { amigo: booleano(v.amigo), pedidoEnviado: booleano(v.pedidoEnviado), pedidoRecebido: booleano(v.pedidoRecebido), euBloqueei: booleano(v.euBloqueei), euSilenciei: booleano(v.euSilenciei), papel: v.papel === 'proprio' ? 'proprio' : null }
    : null
  if (voce) {
    const amigoDesde = instanteAditivo(v?.amigoDesde)
    const contaDesde = instanteAditivo(v?.contaDesde)
    const selosQueDei = selosAditivo(v?.selosQueDei)
    if (amigoDesde !== undefined) voce.amigoDesde = amigoDesde
    if (contaDesde !== undefined) voce.contaDesde = contaDesde
    if (selosQueDei !== undefined) voce.selosQueDei = selosQueDei
  }
  const pagina: PaginaDoRover = { rover: perfilSocial(o.rover), selos: selos(o.selos), contagens, voce }
  if (o.perfilId === null) pagina.perfilId = null
  else if (typeof o.perfilId === 'string' && ehIdObjeto(o.perfilId)) pagina.perfilId = o.perfilId
  return pagina
}

export function recado(x: unknown): Recado {
  const o = obj(x)
  const e = envelope(o.envelope)
  return { id: e.id, autor: roverResumo(o.autor), alvo: uid(e.corpo.alvo), texto: txt(e.corpo.texto, 500, true), criadoEm: e.criadoEm }
}

export function depoimento(x: unknown): Depoimento {
  const o = obj(x)
  const e = envelope(o.envelope)
  const estado = o.estado === undefined ? 'aceito' : enumerado(['pendente', 'aceito', 'recusado'] as const, o.estado)
  const d: Depoimento = { id: e.id, autor: roverResumo(o.autor), alvo: uid(e.corpo.alvo), texto: txt(e.corpo.texto, 600, true), estado: estado as EstadoDepoimento, criadoEm: e.criadoEm }
  const aceitoEm = instanteOpt(o.aceitoEm)
  if (aceitoEm) d.aceitoEm = aceitoEm
  return d
}

/** O relé devolve só o envelope da entrega; o autor (o dono do portfólio) vem de `quem`. */
export function entrega(x: unknown, quem: ResumoRover): Entrega {
  const e = envelope(x)
  return {
    id: e.id, autor: quem, titulo: curto(e.corpo.titulo, 80), descricao: txt(e.corpo.descricao, 400, true), resultado: txt(e.corpo.resultado, 300, true),
    tags: tags(e.corpo.tags, 3), criadaEm: e.criadoEm,
  }
}

export const amigoItem = (x: unknown): AmigoItem => {
  const o = obj(x)
  return { rover: roverResumo(o.rover), desde: instante(o.desde) }
}

export function pedidosDeAmizade(x: unknown): PedidosDeAmizade {
  const o = obj(x)
  const par = (v: unknown) => {
    const p = obj(v)
    return { rover: roverResumo(p.rover), em: instante(p.em) }
  }
  return { recebidos: lista(o.recebidos, 100).map(par), enviados: lista(o.enviados, 50).map(par) }
}

export const relacaoItem = (x: unknown): RelacaoItem => {
  const o = obj(x)
  return { rover: roverResumo(o.rover), relacao: enumerado(['bloqueio', 'silencio'] as const, o.relacao), desde: instante(o.desde) }
}

export const conviteRecebido = (x: unknown): ConviteRecebido => {
  const o = obj(x)
  const c = obj(o.comunidade)
  return { comunidade: { id: idObj(c.id), nome: curto(c.nome, 60), descricao: txtOpt(c.descricao, 500, true), acesso: enumerado(ACESSOS, c.acesso) }, por: roverResumo(o.por), em: instante(o.em) }
}

// ---- comunidades ------------------------------------------------------------------------------------------------

export function comunidadeCartao(x: unknown): ComunidadeCartao {
  const o = obj(x)
  return {
    id: idObj(o.id), nome: curto(o.nome, 60), descricao: txtOpt(o.descricao, 500, true), tema: tag(o.tema) ?? 'geral', acesso: enumerado(ACESSOS, o.acesso),
    membros: inteiro(o.membros), topicos: inteiro(o.topicos), criadaEm: instante(o.criadaEm), atividadeEm: instante(o.atividadeEm ?? o.criadaEm),
    categorias: Array.isArray(o.categorias) ? o.categorias.filter((c): c is string => typeof c === 'string').slice(0, 8).map((c) => curto(c, 30)).filter(Boolean) : [],
    ...comPessoas(o.pessoas),
  }
}

/** `{ pessoas }` só quando o relé mandou um número válido; senão nada (o objeto fica idêntico ao da 0.3). */
function comPessoas(x: unknown): { pessoas?: number } {
  const n = pessoasAditivo(x)
  return n === undefined ? {} : { pessoas: n }
}

const voceNaComunidade = (x: unknown): VoceNaComunidade | null => {
  const v = opt(x)
  if (!v) return null
  const voce: VoceNaComunidade = { papel: v.papel === null || v.papel === undefined ? null : enumerado(PAPEIS, v.papel), pedidoPendente: booleano(v.pedidoPendente), convidado: booleano(v.convidado), banido: booleano(v.banido) }
  const banidoEm = instanteAditivo(v.banidoEm)
  const membroDesde = instanteAditivo(v.membroDesde)
  if (banidoEm !== undefined) voce.banidoEm = banidoEm
  if (membroDesde !== undefined) voce.membroDesde = membroDesde
  return voce
}

/** `Comunidade` completa, ou o cartão mínimo do convidado de uma fechada (sem `topicos`/`membros`). */
export function comunidade(x: unknown): Comunidade | ComunidadeMinima {
  const o = obj(x)
  if (o.membros === undefined && o.regras === undefined) {
    const voce = voceNaComunidade(o.voce)
    if (!voce) throw ESTRANHO()
    return { id: idObj(o.id), nome: curto(o.nome, 60), descricao: txtOpt(o.descricao, 500, true), acesso: enumerado(ACESSOS, o.acesso), voce }
  }
  const vocabulario = vocabularioAditivo(o.vocabulario)
  return { ...comunidadeCartao(o), regras: txtOpt(o.regras, 1000, true), dono: roverResumo(o.dono), moderadores: inteiro(o.moderadores), voce: voceNaComunidade(o.voce), ...(vocabulario ? { vocabulario } : {}) }
}

export const membroItem = (x: unknown): MembroItem => {
  const o = obj(x)
  return { rover: roverResumo(o.rover), papel: enumerado(PAPEIS, o.papel), desde: instante(o.desde) }
}
export const pedidoDeEntrada = (x: unknown): PedidoDeEntrada => {
  const o = obj(x)
  return { rover: roverResumo(o.rover), em: instante(o.em) }
}
export const conviteEnviado = (x: unknown): ConviteEnviado => {
  const o = obj(x)
  return { rover: roverResumo(o.rover), por: roverResumo(o.por), em: instante(o.em) }
}
export const banidoItem = (x: unknown): BanidoItem => {
  const o = obj(x)
  return {
    rover: roverResumo(o.rover), motivo: enumerado(MOTIVOS_MODERACAO, o.motivo), por: enumerado(['dono', 'moderador'] as const, o.por), em: instante(o.em),
    apelacao: o.apelacao === null || o.apelacao === undefined ? null : enumerado(['aberta', 'mantida', 'revertida'] as const, o.apelacao),
  }
}

/** `topico` da denúncia (0.3.1, `fila-com-topico`): o id do tópico, `null` se o alvo não vive num tópico, nada se o relé não mandou ou mandou torto. */
function topicoDaFila(x: unknown): { topico?: string | null } {
  if (x === null) return { topico: null }
  return typeof x === 'string' && ehIdObjeto(x) ? { topico: x } : {}
}

export function filaDeModeracao(x: unknown): FilaDeModeracao {
  const o = obj(x)
  const denuncia = (v: unknown): DenunciaNaFila => {
    const d = obj(v)
    const m = obj(d.motivos ?? {})
    const motivos: DenunciaNaFila['motivos'] = {}
    for (const k of MOTIVOS_DENUNCIA_SOCIAL) if (inteiro(m[k]) > 0) motivos[k] = inteiro(m[k])
    return { alvo: idObj(d.alvo), alvoTipo: typeof d.alvoTipo === 'string' ? d.alvoTipo.replace(/[^a-z-]/g, '').slice(0, 30) : '', motivos, total: inteiro(d.total), primeiraEm: instante(d.primeiraEm), ultimaEm: instante(d.ultimaEm), peso: inteiro(d.peso), ...topicoDaFila(d.topico) }
  }
  const apelacao = (v: unknown): ApelacaoNaFila => {
    const a = obj(v)
    let conteudo: string | null = null
    if (a.envelope) {
      const c = envelope(a.envelope).corpo
      const t = typeof c.titulo === 'string' ? c.titulo : ''
      const corpo = typeof c.texto === 'string' ? c.texto : ''
      conteudo = cortar(limpo(`${t}\n${corpo}`.trim()), 2000) || null
    }
    return { id: idObj(a.id), tipo: enumerado(['remocao', 'banimento'] as const, a.tipo), alvo: idObj(a.alvo), autor: roverResumo(a.autor), texto: txt(a.texto, 500, true), em: instante(a.em), conteudo }
  }
  return { denuncias: lista(o.denuncias ?? [], 50).map(denuncia), apelacoes: lista(o.apelacoes ?? [], 50).map(apelacao) }
}

export function registro(x: unknown): RegistroModeracao {
  const o = obj(x)
  const alvo = typeof o.alvo === 'string' ? idObj(o.alvo) : roverResumo(o.alvo)
  return {
    id: typeof o.id === 'string' && o.id.length > 0 && o.id.length <= 80 ? o.id.replace(/[^A-Za-z0-9_-]/g, '') : (() => { throw ESTRANHO() })(),
    em: instante(o.em), escopo: enumerado(['comunidade', 'pagina', 'rele'] as const, o.escopo), contexto: idOuNulo(o.contexto),
    acao: enumerado(['remocao', 'expulsao', 'banimento', 'dispensa'] as const, o.acao), alvoTipo: typeof o.alvoTipo === 'string' ? o.alvoTipo.replace(/[^a-z-]/g, '').slice(0, 30) : null,
    alvo, motivo: o.acao === 'dispensa' ? enumerado(['dispensada'] as const, o.motivo) : enumerado(MOTIVOS_MODERACAO, o.motivo), por: enumerado(['dono', 'moderador', 'administrador', 'rele'] as const, o.por),
    apelacao: o.apelacao === null || o.apelacao === undefined ? null : enumerado(['aberta', 'mantida', 'revertida'] as const, o.apelacao),
  }
}

// ---- fórum ----------------------------------------------------------------------------------------------------------

export function topicoCartao(x: unknown): TopicoCartao {
  const o = obj(x)
  const t: TopicoCartao = {
    id: idObj(o.id), comunidade: idObj(o.comunidade), categoria: o.categoria === null || o.categoria === undefined ? null : curto(o.categoria, 30), titulo: curto(o.titulo, 120),
    trecho: txtOpt(o.trecho, 300), autor: roverResumo(o.autor), criadoEm: instante(o.criadoEm), atividadeEm: instante(o.atividadeEm ?? o.criadoEm), respostas: inteiro(o.respostas),
    fixado: booleano(o.fixado), trancado: booleano(o.trancado), resolvido: booleano(o.resolvido), tags: tags(o.tags, 5), enquete: typeof o.enquete === 'boolean' ? o.enquete : o.enquete !== null && o.enquete !== undefined, editado: booleano(o.editado),
  }
  if (typeof o.comunidadeNome === 'string') t.comunidadeNome = curto(o.comunidadeNome, 60)
  const pessoas = pessoasAditivo(o.pessoas)
  if (pessoas !== undefined) t.pessoas = pessoas
  const marcas = marcasAditivo(o.marcas)
  if (marcas) t.marcas = marcas
  return t
}

export function listaDeTopicos(x: unknown): ListaDeTopicos {
  const o = obj(x)
  const r: ListaDeTopicos = { itens: lista(o.itens, 100).map(topicoCartao) }
  if (Array.isArray(o.fixados)) r.fixados = o.fixados.slice(0, 3).map(topicoCartao)
  const p = proximoDe(o.proximo)
  if (p !== undefined) r.proximo = p
  return r
}

function pesquisa(x: unknown): Enquete | null {
  const e = opt(x)
  if (!e) return null
  const v = inteiroOuNulo(e.voce)
  return {
    opcoes: lista(e.opcoes, 6).map((op) => {
      const q = obj(op)
      return { texto: curto(q.texto, 60), votos: inteiro(q.votos) }
    }),
    encerraEm: instante(e.encerraEm), encerrada: booleano(e.encerrada), total: inteiro(e.total), voce: v,
  }
}

export function topico(x: unknown): Topico {
  const o = obj(x)
  const base = topicoCartao({ ...o, enquete: o.enquete !== null && o.enquete !== undefined })
  const rp = opt(o.resolvidoPor)
  const env = o.envelope ? envelope(o.envelope) : null
  const t: Topico = {
    ...base,
    comunidadeNome: curto(o.comunidadeNome ?? '', 60),
    texto: txt(o.texto ?? env?.corpo.texto ?? '', 2000, true),
    resolvidoPor: rp ? { resposta: idObj(rp.resposta), por: roverResumo(rp.por), em: instante(rp.em) } : null,
    pesquisa: pesquisa(o.enquete),
    versoes: Math.max(1, inteiro(o.versoes)),
  }
  // 0.3.1 (`reacoes-do-topico`): só se o relé mandou as contagens numa forma válida; senão o tópico fica como o da 0.3.
  const rc = o.reacoes !== null && typeof o.reacoes === 'object' && !Array.isArray(o.reacoes) ? (o.reacoes as Obj) : null
  if (rc && typeof rc.curtir === 'number' && typeof rc.util === 'number') {
    t.reacoes = { curtir: inteiro(rc.curtir), util: inteiro(rc.util) }
    t.minhaReacao = o.minhaReacao === 'curtir' || o.minhaReacao === 'util' ? o.minhaReacao : null
  }
  return t
}

export function respostaForum(x: unknown): RespostaForum {
  const o = obj(x)
  const e = envelope(o.envelope)
  const c = opt(o.cita)
  const r = obj(o.reacoes ?? {})
  return {
    id: idObj(o.id ?? e.id), autor: roverResumo(o.autor), texto: txt(e.corpo.texto, 1500, true), criadoEm: instante(o.criadoEm ?? e.criadoEm), em: idOuNulo(o.em),
    cita: c ? { id: idObj(c.id), autor: roverResumo(c.autor), trecho: c.trecho === null || c.trecho === undefined ? null : txt(c.trecho, 300) } : null,
    filhas: inteiro(o.filhas), resolveu: booleano(o.resolveu), reacoes: { curtir: inteiro(r.curtir), util: inteiro(r.util) },
  }
}

export function versaoDoTopico(x: unknown): VersaoDoTopico {
  const o = obj(x)
  const e = envelope(o.envelope)
  return { versao: Math.max(1, inteiro(o.versao)), titulo: curto(e.corpo.titulo, 120), texto: txt(e.corpo.texto, 2000, true), tags: tags(e.corpo.tags, 5), criadoEm: instante(o.criadoEm ?? e.criadoEm) }
}

// ---- páginas ----------------------------------------------------------------------------------------------------------

export function paginaCartao(x: unknown): PaginaCartao {
  const o = obj(x)
  return { id: idObj(o.id), nome: curto(o.nome, 60), descricao: txtOpt(o.descricao, 500, true), tema: tag(o.tema) ?? 'geral', dono: roverResumo(o.dono), seguidores: inteiro(o.seguidores), criadaEm: instante(o.criadaEm), atividadeEm: instante(o.atividadeEm ?? o.criadaEm), ...comPessoas(o.pessoas) }
}

export function paginaProjeto(x: unknown): PaginaProjeto {
  const o = obj(x)
  const v = opt(o.voce)
  return {
    ...paginaCartao(o),
    administradores: lista(o.administradores ?? [], 10).map(roverResumo),
    voce: v ? { segue: booleano(v.segue), papel: v.papel === 'dono' || v.papel === 'administrador' ? v.papel : null } : null,
  }
}

/** A atualização só traz o envelope; o autor vem de `autor` (resolvido pelo cliente) e a página do corpo. */
export function atualizacao(x: unknown, autor: ResumoRover): Atualizacao {
  const e = envelope(x)
  return {
    id: e.id, pagina: idObj(e.corpo.pagina), autor, titulo: e.corpo.titulo === undefined || e.corpo.titulo === null ? null : curto(e.corpo.titulo, 100), texto: txt(e.corpo.texto, 1500, true),
    tags: tags(e.corpo.tags, 3), criadaEm: e.criadoEm, reacoes: { curtir: 0, util: 0 },
  }
}

// ---- notificações, busca, descoberta ---------------------------------------------------------------------------

/** `GET /v1/rovers/:uid/removidos` (0.3.1): o que a moderação escondeu do próprio rover. O trecho vem do envelope, só enquanto o relé o retém. */
export function removido(x: unknown): Removido {
  const o = obj(x)
  const alvo = idObj(o.alvo)
  let trecho: string | null = null
  if (o.envelope) {
    try {
      const c = envelope(o.envelope).corpo
      const t = typeof c.titulo === 'string' ? c.titulo : ''
      const corpo = typeof c.texto === 'string' ? c.texto : ''
      trecho = cortar(limpo(`${t}\n${corpo}`.trim()), 400) || null
    } catch {
      trecho = null
    }
  }
  return {
    id: typeof o.id === 'string' && o.id.length > 0 && o.id.length <= 80 ? o.id.replace(/[^A-Za-z0-9_-]/g, '') : (() => { throw ESTRANHO() })(),
    em: instante(o.em), escopo: enumerado(['comunidade', 'pagina', 'rele'] as const, o.escopo), contexto: idOuNulo(o.contexto),
    alvoTipo: typeof o.alvoTipo === 'string' ? o.alvoTipo.replace(/[^a-z-]/g, '').slice(0, 30) : null,
    alvo, motivo: enumerado(MOTIVOS_MODERACAO, o.motivo), por: enumerado(['dono', 'moderador', 'administrador', 'rele'] as const, o.por),
    apelacao: o.apelacao === null || o.apelacao === undefined ? null : enumerado(['aberta', 'mantida', 'revertida'] as const, o.apelacao), trecho,
  }
}

/** `GET /v1/rovers/:uid/depoimentos?estado=enviados` (0.3.1): `{ envelope, alvo: Resumo, estado: 'pendente' }`. */
export function depoimentoEnviado(x: unknown): DepoimentoEnviado {
  const o = obj(x)
  const e = envelope(o.envelope)
  return { id: e.id, alvo: roverResumo(o.alvo), texto: txt(e.corpo.texto, 600, true), criadoEm: e.criadoEm, estado: 'pendente' }
}

/** `GET /v1/paginas/temas` (0.3.1): `{ tema, paginas }`. Tema fora da forma do protocolo é fora do contrato, e a tela cai nos temas das páginas que já carregou. */
export function temaDePagina(x: unknown): TemaDePagina {
  const o = obj(x)
  const t = tag(o.tema)
  if (!t) throw ESTRANHO()
  return { tema: t, paginas: inteiro(o.paginas) }
}

export function notificacao(x: unknown): Notificacao {
  const o = obj(x)
  const origem = opt(o.origem)
  return {
    seq: inteiro(o.seq), tipo: enumerado(TIPOS_DE_NOTIFICACAO as readonly TipoDeNotificacao[], o.tipo), em: instante(o.em), origem: origem ? roverResumo(origem) : null,
    objeto: idOuNulo(o.objeto), comunidade: idOuNulo(o.comunidade), pagina: idOuNulo(o.pagina),
    // 0.3.1: o relé já manda o nome do lugar e o título do tópico (só quando quem lê pode ver). Relé 0.3 não manda: ficam `null`.
    nomeDoLugar: nomeDeAviso(o.lugar, 'nome', 80),
    nomeDoTopico: nomeDeAviso(o.topico, 'titulo', 120),
  }
}

/** `{ nome }` ou `{ titulo }` de um aviso, saneado, ou `null` (ausente, vazio ou do formato errado). Nunca lança: o nome é só enfeite do aviso. */
function nomeDeAviso(x: unknown, campo: 'nome' | 'titulo', max: number): string | null {
  const o = x !== null && x !== undefined && typeof x === 'object' ? (x as Record<string, unknown>) : null
  if (!o || typeof o[campo] !== 'string') return null
  const t = curto(o[campo], max).trim()
  return t === '' ? null : t
}

export function resultadoBusca(x: unknown): ResultadoBuscaSocial {
  const o = obj(x)
  return {
    rovers: lista(o.rovers ?? [], 5).map(roverBuscado), comunidades: lista(o.comunidades ?? [], 5).map(comunidadeCartao),
    topicos: lista(o.topicos ?? [], 5).map(topicoCartao), paginas: lista(o.paginas ?? [], 5).map(paginaCartao),
  }
}

export const recemChegado = (x: unknown): RecemChegado => ({ ...roverResumo(x), desde: instante(obj(x).desde) })

export function tendencia(x: unknown): Tendencia {
  const o = obj(x)
  const t = tag(o.tag)
  if (!t) throw ESTRANHO()
  return { tag: t, autores: inteiro(o.autores), usos: inteiro(o.usos) }
}

export function info(x: unknown): InfoDoRele {
  const o = obj(x)
  return { protocolo: Array.isArray(o.protocolo) ? o.protocolo.filter((p): p is string => typeof p === 'string' && /^\d+\.\d+$/.test(p)).slice(0, 8) : [], social: o.social === true, recursos: recursosDe(o.recursos) }
}

// ---- 0.3.2: anúncios do relé e painel de início ----------------------------------------------------------------------------

const ID_DE_ANUNCIO = /^an_[A-Za-z0-9_-]{22}$/
const idDeAnuncio = (x: unknown): string => {
  if (typeof x !== 'string' || !ID_DE_ANUNCIO.test(x)) throw ESTRANHO()
  return x
}
/** Um anúncio do operador do relé. Texto puro: o site mostra como texto, sem link, sem marcação. */
export function anuncio(x: unknown): Anuncio {
  const o = obj(x)
  return { id: idDeAnuncio(o.id), titulo: curto(o.titulo, 100), texto: txt(o.texto, 2000, true), criadoEm: instante(o.em ?? o.criadoEm), fixado: booleano(o.fixado) }
}

const CHAVE_DE_AVISO = /^[a-z][a-z0-9-]{1,39}$/
const segundos = (x: unknown): number => (typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 ? x : 0)
const idsDe = (x: unknown, teto: number, ok: (v: unknown) => boolean): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && ok(v)).slice(0, teto) : [])
/** `GET /v1/inicio`: só ids, contagens e carimbos. O que o relé mandar fora deste molde é descartado, nunca mostrado. */
export function inicio(x: unknown): InicioDoRele {
  const o = obj(x)
  const avisos = obj(o.avisos ?? {})
  const porTipo: Record<string, number> = {}
  for (const [k, v] of Object.entries(opt(avisos.porTipo) ?? {}).slice(0, 30)) if (CHAVE_DE_AVISO.test(k)) porTipo[k] = inteiro(v)
  const pend = obj(o.pendencias ?? {})
  const amizades = obj(pend.amizades ?? {})
  const novos = obj(o.anuncios ?? {})
  const ultimo = opt(novos.ultimo)
  const voce = opt(o.voce)
  return {
    agora: segundos(o.agora),
    avisos: { total: inteiro(avisos.total), porTipo },
    atividade: lista(o.atividade ?? [], 20).flatMap((v) => {
      const a = obj(v)
      return a.tipo === 'topico' || a.tipo === 'postagem' ? [{ tipo: a.tipo, id: idObj(a.id), respostas: inteiro(a.respostas), reacoes: inteiro(a.reacoes) }] : []
    }),
    pendencias: {
      amizades: { n: inteiro(amizades.n), uids: idsDe(amizades.uids, 10, ehUid) },
      depoimentos: inteiro(pend.depoimentos),
      convites: lista(pend.convites ?? [], 10).map((v) => idObj(obj(v).comunidade)),
      pedidosDeEntrada: lista(pend.pedidosDeEntrada ?? [], 20).map((v) => ({ comunidade: idObj(obj(v).comunidade), n: inteiro(obj(v).n) })),
    },
    moderacao: lista(o.moderacao ?? [], 20).map((v) => ({ comunidade: idObj(obj(v).comunidade), denuncias: inteiro(obj(v).denuncias), apelacoes: inteiro(obj(v).apelacoes) })),
    anuncios: { novos: inteiro(novos.novos), ultimo: ultimo ? { id: idDeAnuncio(ultimo.id), em: segundos(ultimo.em) } : null },
    atestadoExpiraEm: voce && typeof voce.atestadoExpiraEm === 'number' ? segundos(voce.atestadoExpiraEm) : null,
  }
}

/** Os nomes de recurso do relé: minúsculas, números e hífen, até 40 nomes. O resto é descartado. */
function recursosDe(x: unknown): string[] {
  return Array.isArray(x) ? x.filter((r): r is string => typeof r === 'string' && /^[a-z0-9-]{3,40}$/.test(r)).slice(0, 40) : []
}

// ---- páginas de resultado -------------------------------------------------------------------------------------------

/** `proximo` do relé é um número (ou null); para o site é um cursor opaco em texto. Qualquer outra coisa é descartada. */
export function proximoDe(x: unknown): string | undefined {
  if (typeof x === 'number' && Number.isSafeInteger(x) && x >= 0) return String(x)
  return undefined
}

export function paginaDe<T>(x: unknown, item: (v: unknown) => T, teto = 100): Pagina<T> {
  const o = obj(x)
  const p: Pagina<T> = { itens: lista(o.itens, teto).map(item) }
  const prox = proximoDe(o.proximo)
  if (prox !== undefined) p.proximo = prox
  return p
}

/** Lista "sem página" (em alta, tendências, sugestões): aceita `{ itens }` ou uma lista pura. */
export function itensDe<T>(x: unknown, item: (v: unknown) => T, teto = 50): T[] {
  return lista(Array.isArray(x) ? x : obj(x).itens, teto).map(item)
}
