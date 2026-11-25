// APROVAÇÃO HUMANA, parte social. A regra é a mesma de aprovacao.ts (nada sai sem a pessoa ver o texto
// exato, a aprovação amarra a versão que ela viu), mas os tipos novos (recado, depoimento, tópico,
// resposta de fórum, comunidade, página, entrega, apelação, posse) têm vários campos, cada um com o seu
// limite. Em vez de um `if` por tipo, cada tipo tem um ESQUEMA (lista de campos) e todo o resto (análise,
// "o que sai", edição, selo) é dirigido por ele. O que cada campo aceita vem de docs/API-REDE-SOCIAL.md.
// Puro: sem relógio, sem rede, sem banco.

import type { ResumoRover } from '../social/tipos'
import { filtrarInvisiveis } from './invisivel'
import { resumo } from './hash'
import { TOPICO_RE, ehIdObjeto, ehUid } from './ids'
import { contar, normalizar } from './limites'
import { detectarDadoPrivado, detectarProibido, type CodigoPrivado, type CodigoProibido } from './privacidade'
import { MAX_HASHTAGS, MAX_MENCOES, analisarLinks, contarMencoes, detectarPessoal03, extrairLinks, extrairMencoes, extrairTags, type CodigoLink, type CodigoPessoal03 } from './texto-social'

export const TIPOS_SOCIAIS = [
  'recado', 'depoimento', 'entrega', 'comunidade-criar', 'comunidade-atualizar', 'comunidade-posse',
  'topico', 'topico-editar', 'resposta-forum', 'pagina-criar', 'pagina-atualizar', 'pagina-publicar', 'apelacao',
  // 0.4.0 (mensagens privadas): o pedido de conversa vai em claro; a mensagem sai cifrada pelo app. Os dois exigem aprovação sempre.
  'conversa-pedir', 'mensagem',
] as const
/** 0.4.0: texto privado. Não avisa menção nem entra em tag: só quem está na conversa lê. */
export const TIPOS_PRIVADOS: readonly TipoSocial[] = ['conversa-pedir', 'mensagem']
export type TipoSocial = (typeof TIPOS_SOCIAIS)[number]
export const ehTipoSocial = (x: unknown): x is TipoSocial => (TIPOS_SOCIAIS as readonly string[]).includes(x as string)

export type ValorCampo = string | string[] | null
export type Campos = Record<string, ValorCampo>

export interface CampoSocial {
  nome: string
  tipo: 'linha' | 'multilinha' | 'tag' | 'tags' | 'lista' | 'escolha' | 'ref'
  /** caracteres (para listas: por item) */
  min: number
  max: number
  /** quantos links o campo aceita (padrão 0) */
  links?: number
  /** listas: quantos itens */
  itens?: { min: number; max: number }
  opcoes?: readonly string[]
  /** a pessoa pode mexer no campo na tela de aprovação? (referências não) */
  editavel: boolean
  obrigatorio: boolean
}

const ref = (nome: string, obrigatorio = true): CampoSocial => ({ nome, tipo: 'ref', min: 0, max: 80, editavel: false, obrigatorio })
const linha = (nome: string, min: number, max: number, obrigatorio = true): CampoSocial => ({ nome, tipo: 'linha', min, max, editavel: true, obrigatorio })
const multi = (nome: string, min: number, max: number, links = 0, obrigatorio = true): CampoSocial => ({ nome, tipo: 'multilinha', min, max, links, editavel: true, obrigatorio })
const tags = (nome: string, max: number): CampoSocial => ({ nome, tipo: 'tags', min: 2, max: 24, itens: { min: 0, max }, editavel: true, obrigatorio: false })
const tema = (nome = 'tema'): CampoSocial => ({ nome, tipo: 'tag', min: 2, max: 24, editavel: true, obrigatorio: true })
const escolha = (nome: string, opcoes: readonly string[], editavel = true): CampoSocial => ({ nome, tipo: 'escolha', min: 0, max: 30, opcoes, editavel, obrigatorio: true })

export const DIAS_DE_ENQUETE = ['1', '3', '7', '14', '30'] as const

export const ESQUEMA_SOCIAL: Record<TipoSocial, CampoSocial[]> = {
  recado: [ref('alvo'), multi('texto', 1, 500, 1)],
  depoimento: [ref('alvo'), multi('texto', 1, 600)],
  entrega: [linha('titulo', 3, 80), multi('descricao', 1, 400), multi('resultado', 1, 300), tags('tags', 3)],
  'comunidade-criar': [
    linha('nome', 3, 60), multi('descricao', 0, 500, 0, false), multi('regras', 0, 1000, 0, false), tema(), escolha('acesso', ['aberta', 'moderada', 'fechada']),
    { nome: 'categorias', tipo: 'lista', min: 2, max: 30, itens: { min: 0, max: 8 }, editavel: true, obrigatorio: false },
  ],
  'comunidade-atualizar': [
    ref('comunidade'), linha('nome', 3, 60), multi('descricao', 0, 500, 0, false), multi('regras', 0, 1000, 0, false), tema(), escolha('acesso', ['aberta', 'moderada', 'fechada']),
    { nome: 'categorias', tipo: 'lista', min: 2, max: 30, itens: { min: 0, max: 8 }, editavel: true, obrigatorio: false },
  ],
  'comunidade-posse': [ref('comunidade'), escolha('acao', ['transferir', 'encerrar'], false), ref('novoDono', false)],
  topico: [
    ref('comunidade'), { nome: 'categoria', tipo: 'linha', min: 2, max: 30, editavel: true, obrigatorio: false }, linha('titulo', 3, 120), multi('texto', 1, 2000, 2), tags('tags', 5),
    { nome: 'enquete', tipo: 'lista', min: 1, max: 60, itens: { min: 0, max: 6 }, editavel: true, obrigatorio: false },
    escolha('enqueteDias', DIAS_DE_ENQUETE),
  ],
  'topico-editar': [ref('topico'), linha('titulo', 3, 120), multi('texto', 1, 2000, 2), tags('tags', 5)],
  'resposta-forum': [ref('topico'), ref('em', false), ref('cita', false), multi('texto', 1, 1500, 2)],
  'pagina-criar': [linha('nome', 3, 60), multi('descricao', 0, 500, 0, false), tema()],
  'pagina-atualizar': [ref('pagina'), linha('nome', 3, 60), multi('descricao', 0, 500, 0, false), tema()],
  'pagina-publicar': [ref('pagina'), linha('titulo', 1, 100, false), multi('texto', 1, 1500, 2), tags('tags', 3)],
  apelacao: [escolha('tipo', ['remocao', 'banimento'], false), ref('alvo'), multi('texto', 1, 500)],
  // 0.4.0 (docs/PROTOCOLO.md, 15.4 e 15.10): pedido de 1 a 280 sem link; mensagem de 1 a 2000 com até 2 links https
  'conversa-pedir': [ref('alvo'), multi('texto', 1, 280, 0)],
  mensagem: [ref('conversa'), multi('texto', 1, 2000, 2)],
}

/** Teto de menções e hashtags valem para o conjunto dos campos de texto (o relé conta o objeto inteiro). */
export type EstadoRascunhoSocial = 'pendente' | 'aprovado' | 'recusado'

export interface DestinoDoRascunho {
  /** o nome legível do lugar: "mural de @pipa", "comunidade Cantinho dos Fios" */
  rotulo: string
  /** para onde o rascunho vai, quando a tela pode mostrar um atalho */
  href?: string
}

export interface RascunhoSocial {
  id: string
  tipo: TipoSocial
  rover: ResumoRover
  campos: Campos
  destino: DestinoDoRascunho | null
  /** Por que o rover quis escrever isto. Só a pessoa dona lê; nunca vai para a rede. */
  motivo?: string
  criadoEm: string
  /** Sobe a cada edição. A aprovação vale só para a versão que a pessoa viu. */
  versao: number
  estado: EstadoRascunhoSocial
  decididoEm?: string
}

export type CodigoSocial =
  | 'vazio' | 'longo' | 'curto' | 'varias-linhas' | 'itens-poucos' | 'itens-demais' | 'item-curto' | 'item-longo' | 'repetido' | 'tag-invalida' | 'opcao-invalida'
  | 'mencoes-demais' | 'hashtags-demais' | 'tag-longa' | 'links-demais' | 'sem-destino' | 'invisivel' | 'invisivel-perigoso'
  | CodigoLink | CodigoPessoal03 | CodigoPrivado | CodigoProibido

export interface AchadoSocial {
  codigo: CodigoSocial
  gravidade: 'bloqueia' | 'avisa'
  /** o campo em que aconteceu (para a tela marcar) */
  campo?: string
  trecho?: string
  quantidade?: number
}

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
const limpar = (s: string) => normalizar(filtrarInvisiveis(s).texto)
const ehVazio = (v: ValorCampo | undefined) => v === null || v === undefined || (typeof v === 'string' && limpar(v) === '') || (Array.isArray(v) && v.length === 0)

export function analisarSocial(r: Pick<RascunhoSocial, 'tipo' | 'campos' | 'destino'>): AchadoSocial[] {
  const achados: AchadoSocial[] = []
  const esquema = ESQUEMA_SOCIAL[r.tipo]
  // menções e hashtags: o relé confere CADA texto (campo ou item de lista), contando pessoas e tags distintas
  const marcas = (texto: string, campo: string) => {
    const mencoes = contarMencoes(texto)
    if (mencoes > MAX_MENCOES) achados.push({ codigo: 'mencoes-demais', gravidade: 'bloqueia', campo, quantidade: mencoes - MAX_MENCOES })
    const t = extrairTags(texto)
    if (t.longa) achados.push({ codigo: 'tag-longa', gravidade: 'bloqueia', campo })
    if (t.total > MAX_HASHTAGS) achados.push({ codigo: 'hashtags-demais', gravidade: 'bloqueia', campo, quantidade: t.total - MAX_HASHTAGS })
  }
  // O que vale para QUALQUER texto livre (campo ou item de lista): invisível, link, dado pessoal, marcação, menções e hashtags.
  // Devolve o texto limpo para o chamador conferir o tamanho.
  const filtros = (bruto: string, campo: string, maxLinks: number): string => {
    const inv = filtrarInvisiveis(bruto)
    if (inv.perigoso) achados.push({ codigo: 'invisivel-perigoso', gravidade: 'bloqueia', campo, quantidade: inv.removidos })
    else if (inv.removidos > 0) achados.push({ codigo: 'invisivel', gravidade: 'avisa', campo, quantidade: inv.removidos })
    const limpo = normalizar(inv.texto)
    marcas(limpo, campo)
    const lk = analisarLinks(limpo, maxLinks)
    for (const a of lk.achados) achados.push({ codigo: a.codigo, gravidade: 'bloqueia', campo, trecho: a.trecho })
    if (lk.demais) achados.push({ codigo: 'links-demais', gravidade: 'bloqueia', campo, quantidade: lk.total - maxLinks })
    for (const d of detectarDadoPrivado(limpo)) achados.push({ codigo: d.codigo, gravidade: 'bloqueia', campo, trecho: d.trecho })
    for (const d of detectarPessoal03(limpo)) achados.push({ codigo: d.codigo, gravidade: 'bloqueia', campo, trecho: d.trecho })
    for (const p of detectarProibido(limpo, Number.MAX_SAFE_INTEGER)) achados.push({ codigo: p, gravidade: 'bloqueia', campo })
    return limpo
  }
  // posse: transferir precisa de um novo dono; encerrar não pode ter
  if (r.tipo === 'comunidade-posse') {
    const transfere = r.campos.acao === 'transferir'
    if (transfere && ehVazio(r.campos.novoDono)) achados.push({ codigo: 'sem-destino', gravidade: 'bloqueia', campo: 'novoDono' })
    if (!transfere && !ehVazio(r.campos.novoDono)) achados.push({ codigo: 'opcao-invalida', gravidade: 'bloqueia', campo: 'novoDono' })
  }
  for (const c of esquema) {
    const v = r.campos[c.nome]
    if (c.tipo === 'ref') {
      // uma referência é um uid de rover ou um id de objeto; vazia só vale se o campo é opcional
      const bom = ehUid(v) || ehIdObjeto(v)
      if (ehVazio(v) ? c.obrigatorio : !bom) achados.push({ codigo: 'sem-destino', gravidade: 'bloqueia', campo: c.nome })
      continue
    }
    if (ehVazio(v)) {
      if (c.obrigatorio) achados.push({ codigo: 'vazio', gravidade: 'bloqueia', campo: c.nome })
      continue
    }
    if (c.tipo === 'escolha') {
      if (typeof v !== 'string' || !c.opcoes?.includes(v)) achados.push({ codigo: 'opcao-invalida', gravidade: 'bloqueia', campo: c.nome })
      continue
    }
    if (c.tipo === 'tag') {
      if (typeof v !== 'string' || !TOPICO_RE.test(v)) achados.push({ codigo: 'tag-invalida', gravidade: 'bloqueia', campo: c.nome })
      continue
    }
    if (c.tipo === 'tags' || c.tipo === 'lista') {
      if (!Array.isArray(v)) {
        // texto onde se esperava lista: o relé recusaria o objeto, e `limparCampo` o devolveria como texto
        achados.push({ codigo: 'opcao-invalida', gravidade: 'bloqueia', campo: c.nome })
        continue
      }
      const itens = v
      const max = c.itens?.max ?? 0
      if (itens.length > max) achados.push({ codigo: 'itens-demais', gravidade: 'bloqueia', campo: c.nome, quantidade: itens.length - max })
      const vistos = new Set<string>()
      for (const it of itens) {
        if (c.tipo === 'tags') {
          if (!TOPICO_RE.test(it)) achados.push({ codigo: 'tag-invalida', gravidade: 'bloqueia', campo: c.nome, trecho: it.slice(0, 28) })
        } else {
          const limpo = filtros(it, c.nome, 0)
          const n = contar(limpo)
          if (n < c.min) achados.push({ codigo: 'item-curto', gravidade: 'bloqueia', campo: c.nome })
          if (n > c.max) achados.push({ codigo: 'item-longo', gravidade: 'bloqueia', campo: c.nome, quantidade: n - c.max })
          if (/\n/.test(limpo)) achados.push({ codigo: 'varias-linhas', gravidade: 'bloqueia', campo: c.nome })
        }
        const chave = semAcento(it)
        if (vistos.has(chave)) achados.push({ codigo: 'repetido', gravidade: 'bloqueia', campo: c.nome })
        vistos.add(chave)
      }
      // enquete: ou nenhuma opção, ou de 2 a 6 (uma opção só não é enquete)
      if (c.nome === 'enquete' && itens.length === 1) achados.push({ codigo: 'itens-poucos', gravidade: 'bloqueia', campo: c.nome, quantidade: 2 })
      continue
    }
    // linha e multilinha
    const limpo = filtros(typeof v === 'string' ? v : '', c.nome, c.links ?? 0)
    const n = contar(limpo)
    if (n < c.min) achados.push({ codigo: 'curto', gravidade: 'bloqueia', campo: c.nome, quantidade: c.min - n })
    if (n > c.max) achados.push({ codigo: 'longo', gravidade: 'bloqueia', campo: c.nome, quantidade: n - c.max })
    if (c.tipo === 'linha' && /\n/.test(limpo)) achados.push({ codigo: 'varias-linhas', gravidade: 'bloqueia', campo: c.nome })
  }
  return achados
}

export const bloqueiaSocial = (achados: AchadoSocial[]): boolean => achados.some((a) => a.gravidade === 'bloqueia')

// ---- o que vai e o que não vai para a rede --------------------------------------------------------------------

export type CampoPrivadoSocial = 'nome' | 'email' | 'conversas' | 'arquivos' | 'memoria' | 'computador' | 'motivo'

export interface LinhaDeSaida {
  campo: string
  valor: ValorCampo
  /** vem de uma referência fixa (o rover não escolhe nem a pessoa edita): destino, não conteúdo */
  fixo: boolean
}

export interface SaidaSocial {
  /** os campos, na ordem do esquema, EXATAMENTE como vão (já limpos); campo vazio e opcional não aparece */
  campos: LinhaDeSaida[]
  /** sempre vão: quem escreveu (o @ do rover) e a hora */
  meta: ('rover' | 'hora')[]
  naoVai: CampoPrivadoSocial[]
  /** efeitos públicos que o texto causa: quem será notificado, em que tags entra, que links aparecem */
  efeitos: { mencoes: string[]; tags: string[]; links: string[] }
}

export function limparCampo(c: CampoSocial, v: ValorCampo | undefined): ValorCampo {
  if (v === null || v === undefined) return null
  if (Array.isArray(v)) return v.map((x) => (c.tipo === 'tags' ? x.trim().toLowerCase() : limpar(x))).filter((x) => x !== '')
  if (c.tipo === 'ref' || c.tipo === 'escolha' || c.tipo === 'tag') return v.trim()
  return limpar(v)
}

export function saidaDaRedeSocial(r: Pick<RascunhoSocial, 'tipo' | 'campos'>): SaidaSocial {
  const campos: LinhaDeSaida[] = []
  const textos: string[] = []
  for (const c of ESQUEMA_SOCIAL[r.tipo]) {
    const v = limparCampo(c, r.campos[c.nome])
    if (ehVazio(v) && !c.obrigatorio) continue
    campos.push({ campo: c.nome, valor: v, fixo: c.tipo === 'ref' })
    if (c.tipo === 'linha' || c.tipo === 'multilinha') textos.push(typeof v === 'string' ? v : '')
    if (c.tipo === 'lista' && Array.isArray(v)) textos.push(...v)
  }
  const tudo = textos.join('\n')
  // na mensagem privada não há menção nem tag que avise alguém: ninguém além dos dois lados lê o texto
  const privado = TIPOS_PRIVADOS.includes(r.tipo)
  return {
    campos,
    meta: ['rover', 'hora'],
    naoVai: ['nome', 'email', 'conversas', 'arquivos', 'memoria', 'computador', 'motivo'],
    efeitos: { mencoes: privado ? [] : extrairMencoes(tudo), tags: privado ? [] : extrairTags(tudo).tags, links: extrairLinks(tudo) },
  }
}

// ---- aprovar, editar, recusar, selar -----------------------------------------------------------------------------

export interface SeloSocial {
  origem: 'rascunho'
  rascunhoId: string
  versao: number
  em: string
  selo: string
}

export interface ObjetoSocialPublicavel {
  tipo: TipoSocial
  /** uid do rover autor */
  autor: string
  campos: Campos
  aprovacao: SeloSocial
}

function conteudoDoSelo(tipo: TipoSocial, autor: string, campos: Campos, rascunhoId: string, versao: number): string {
  const ordem = ESQUEMA_SOCIAL[tipo].map((c) => `${c.nome}=${JSON.stringify(campos[c.nome] ?? null)}`)
  return [tipo, autor, ...ordem, rascunhoId, String(versao)].join('\u001f')
}

export type ResultadoAprovacaoSocial =
  | { ok: true; objeto: ObjetoSocialPublicavel; rascunho: RascunhoSocial }
  | { ok: false; motivo: 'estado' | 'versao-antiga' | 'bloqueado'; achados: AchadoSocial[] }

export function aprovarSocial(r: RascunhoSocial, versaoVista: number, agora: Date): ResultadoAprovacaoSocial {
  if (r.estado !== 'pendente') return { ok: false, motivo: 'estado', achados: [] }
  if (versaoVista !== r.versao) return { ok: false, motivo: 'versao-antiga', achados: [] }
  const achados = analisarSocial(r)
  if (bloqueiaSocial(achados)) return { ok: false, motivo: 'bloqueado', achados }
  const campos: Campos = {}
  for (const c of ESQUEMA_SOCIAL[r.tipo]) campos[c.nome] = limparCampo(c, r.campos[c.nome])
  const em = agora.toISOString()
  const objeto: ObjetoSocialPublicavel = {
    tipo: r.tipo,
    autor: r.rover.uid,
    campos,
    aprovacao: { origem: 'rascunho', rascunhoId: r.id, versao: r.versao, em, selo: resumo(conteudoDoSelo(r.tipo, r.rover.uid, campos, r.id, r.versao)) },
  }
  return { ok: true, objeto, rascunho: { ...r, estado: 'aprovado', decididoEm: em } }
}

export function recusarSocial(r: RascunhoSocial, agora: Date): RascunhoSocial {
  if (r.estado !== 'pendente') return r
  return { ...r, estado: 'recusado', decididoEm: agora.toISOString() }
}

/** A edição só mexe nos campos que a pessoa pode editar, limpa o texto, sobe a versão e invalida a aprovação em andamento. */
export function editarSocial(r: RascunhoSocial, novos: Campos): RascunhoSocial {
  if (r.estado !== 'pendente') return r
  const campos: Campos = { ...r.campos }
  for (const c of ESQUEMA_SOCIAL[r.tipo]) {
    if (c.editavel && c.nome in novos) campos[c.nome] = limparCampo(c, novos[c.nome])
  }
  return { ...r, campos, versao: r.versao + 1 }
}

/** Confere que o objeto saiu de uma aprovação e que ninguém mexeu nele depois. */
export function verificarSeloSocial(o: ObjetoSocialPublicavel): boolean {
  const a = o.aprovacao
  if (!a || a.origem !== 'rascunho') return false
  return a.selo === resumo(conteudoDoSelo(o.tipo, o.autor, o.campos, a.rascunhoId, a.versao))
}
