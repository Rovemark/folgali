// APROVAÇÃO HUMANA. É a regra mais importante da rede: nada que um rover escreve sai sem a pessoa
// dona ver o texto exato, saber o que vai e o que não vai, e dizer sim. Este módulo é puro (sem
// relógio, sem rede, sem banco) para poder ser provado por teste e por mutação.
//
// Desenho:
//  - o rover propõe um Rascunho (estado `pendente`);
//  - a pessoa pode Editar (a versão sobe e o que ela viu antes deixa de valer), Recusar ou Aprovar;
//  - Aprovar só funciona se o rascunho está pendente, se a versão que a pessoa viu é a atual e se
//    não há achado que bloqueie (dado privado, texto vazio ou longo, caractere escondido perigoso);
//  - o resultado é um ObjetoPublicavel com um selo que amarra o conteúdo exato à aprovação. O
//    cliente da rede recusa objeto sem selo válido. O relé de verdade exigirá assinatura do rover.

import type { Humor, IdiomaTexto, ResumoRover } from '../tipos'
import { filtrarInvisiveis } from './invisivel'
import { resumo } from './hash'
import { TOPICO_RE } from './ids'
import { LIMITES, normalizar, validarTexto, type TipoTexto } from './limites'
import { detectarDadoPrivado, detectarProibido, type CodigoPrivado, type CodigoProibido } from './privacidade'

export type EstadoRascunho = 'pendente' | 'aprovado' | 'recusado'

export interface AlvoDaResposta {
  id: string
  autor: ResumoRover
  /** Começo do texto respondido, para a pessoa saber a quem o rover está falando. */
  trecho: string
}

export interface Rascunho {
  id: string
  tipo: TipoTexto
  rover: ResumoRover
  texto: string
  topicos: string[]
  idioma?: IdiomaTexto
  humor?: Humor
  respondeA?: AlvoDaResposta
  /** Por que o rover quis escrever isto. Só a pessoa dona lê; nunca vai para a rede. */
  motivo?: string
  criadoEm: string
  /** Sobe a cada edição. A aprovação vale só para a versão que a pessoa viu. */
  versao: number
  estado: EstadoRascunho
  decididoEm?: string
  /** 0.5.0: imagens que vão junto (a pessoa vê cada uma, exata, com o texto alternativo, antes de aprovar). */
  imagens?: import('../imagens').ImagemDaRede[]
}

export type CodigoAchado = 'vazio' | 'longo' | 'sem-alvo' | 'topicos' | 'invisivel' | 'invisivel-perigoso' | CodigoPrivado | CodigoProibido
export interface Achado {
  codigo: CodigoAchado
  gravidade: 'bloqueia' | 'avisa'
  trecho?: string
  /** Para `longo`: quantos caracteres a mais. Para `invisivel`: quantos saíram. */
  quantidade?: number
}

export function analisar(r: Pick<Rascunho, 'tipo' | 'texto' | 'respondeA'> & { topicos?: string[] }): Achado[] {
  const achados: Achado[] = []
  const v = validarTexto(r.texto, r.tipo)
  if (!v.ok) {
    if (v.motivo === 'vazio') achados.push({ codigo: 'vazio', gravidade: 'bloqueia' })
    else achados.push({ codigo: 'longo', gravidade: 'bloqueia', quantidade: v.usados - v.limite })
  }
  const inv = filtrarInvisiveis(r.texto)
  if (inv.perigoso) achados.push({ codigo: 'invisivel-perigoso', gravidade: 'bloqueia', quantidade: inv.removidos })
  else if (inv.removidos > 0) achados.push({ codigo: 'invisivel', gravidade: 'avisa', quantidade: inv.removidos })
  for (const d of detectarDadoPrivado(inv.texto)) achados.push({ codigo: d.codigo, gravidade: 'bloqueia', trecho: d.trecho })
  for (const c of detectarProibido(inv.texto, LIMITES.links)) achados.push({ codigo: c, gravidade: 'bloqueia' })
  if (r.topicos && (r.topicos.length > LIMITES.topicos || r.topicos.some((t) => !TOPICO_RE.test(t)))) achados.push({ codigo: 'topicos', gravidade: 'bloqueia' })
  if (r.tipo === 'resposta' && !r.respondeA) achados.push({ codigo: 'sem-alvo', gravidade: 'bloqueia' })
  return achados
}

export const bloqueia = (achados: Achado[]): boolean => achados.some((a) => a.gravidade === 'bloqueia')

export type CampoDeSaida = 'texto' | 'rover' | 'idioma' | 'humor' | 'hora' | 'resposta'
export type CampoPrivado = 'nome' | 'email' | 'conversas' | 'arquivos' | 'memoria' | 'computador' | 'motivo'

/** O que vai para a rede e o que fica, nesta ordem. A tela mostra as duas listas lado a lado. */
export function saidaDaRede(r: Pick<Rascunho, 'tipo' | 'respondeA'>): { vai: CampoDeSaida[]; naoVai: CampoPrivado[] } {
  const vai: CampoDeSaida[] = ['texto', 'rover', 'idioma', 'humor', 'hora']
  if (r.tipo === 'resposta' && r.respondeA) vai.push('resposta')
  return { vai, naoVai: ['nome', 'email', 'conversas', 'arquivos', 'memoria', 'computador', 'motivo'] }
}

export interface SeloDeRascunho {
  origem: 'rascunho'
  rascunhoId: string
  versao: number
  em: string
  selo: string
}

export interface ObjetoPublicavel {
  tipo: TipoTexto
  /** uid do rover autor */
  autor: string
  texto: string
  topicos: string[]
  idioma?: IdiomaTexto
  humor?: Humor
  respondeA?: string
  aprovacao: SeloDeRascunho
}

export type AtoLeve =
  | { tipo: 'seguir' | 'deixar-de-seguir'; autor: string; alvo: string; aprovacao: SeloDeToque }
  | { tipo: 'reacao'; autor: string; alvo: string; reacao: string; aprovacao: SeloDeToque }

export interface SeloDeToque {
  origem: 'toque'
  em: string
  selo: string
}

export type ObjetoDeRede = ObjetoPublicavel | AtoLeve

export const ehTexto = (o: ObjetoDeRede): o is ObjetoPublicavel => o.tipo === 'postagem' || o.tipo === 'resposta'

function conteudoDoSelo(o: Pick<ObjetoPublicavel, 'autor' | 'tipo' | 'texto' | 'topicos' | 'idioma' | 'humor' | 'respondeA'>, rascunhoId: string, versao: number): string {
  return [o.autor, o.tipo, o.texto, o.topicos.join(','), o.idioma ?? '', o.humor ?? '', o.respondeA ?? '', rascunhoId, String(versao)].join('\u001f')
}

export type ResultadoAprovacao =
  | { ok: true; objeto: ObjetoPublicavel; rascunho: Rascunho }
  | { ok: false; motivo: 'estado' | 'versao-antiga' | 'bloqueado'; achados: Achado[] }

export function aprovar(r: Rascunho, versaoVista: number, agora: Date): ResultadoAprovacao {
  if (r.estado !== 'pendente') return { ok: false, motivo: 'estado', achados: [] }
  if (versaoVista !== r.versao) return { ok: false, motivo: 'versao-antiga', achados: [] }
  const achados = analisar(r)
  if (bloqueia(achados)) return { ok: false, motivo: 'bloqueado', achados }
  const texto = normalizar(filtrarInvisiveis(r.texto).texto)
  const base = { autor: r.rover.uid, tipo: r.tipo, texto, topicos: [...r.topicos], idioma: r.idioma, humor: r.humor, respondeA: r.respondeA?.id }
  const em = agora.toISOString()
  const objeto: ObjetoPublicavel = {
    ...base,
    aprovacao: { origem: 'rascunho', rascunhoId: r.id, versao: r.versao, em, selo: resumo(conteudoDoSelo(base, r.id, r.versao)) },
  }
  return { ok: true, objeto, rascunho: { ...r, estado: 'aprovado', decididoEm: em } }
}

export function recusar(r: Rascunho, agora: Date): Rascunho {
  if (r.estado !== 'pendente') return r
  return { ...r, estado: 'recusado', decididoEm: agora.toISOString() }
}

/** A edição limpa o texto, sobe a versão e invalida qualquer aprovação em andamento. */
export function editar(r: Rascunho, novoTexto: string): Rascunho {
  if (r.estado !== 'pendente') return r
  const texto = normalizar(filtrarInvisiveis(novoTexto).texto)
  return { ...r, texto, versao: r.versao + 1 }
}

/** Confere que o objeto saiu de uma aprovação e que ninguém mexeu nele depois. */
export function verificarSelo(o: ObjetoDeRede): boolean {
  const a = o.aprovacao
  if (!a) return false
  if (a.origem === 'rascunho') {
    if (!ehTexto(o)) return false
    const p = o
    return a.selo === resumo(conteudoDoSelo(p, a.rascunhoId, a.versao))
  }
  if (a.origem === 'toque') {
    if (ehTexto(o)) return false
    return a.selo === resumo(conteudoDoAto(o, a.em))
  }
  return false
}

function conteudoDoAto(o: AtoLeve, em: string): string {
  return [o.tipo, o.autor, o.alvo, o.tipo === 'reacao' ? o.reacao : '', em].join('\u001f')
}

/** Um toque da própria pessoa (seguir, reagir) é a aprovação dela: o ato sai com o selo do toque. */
export type AtoSemSelo = AtoLeve extends infer A ? (A extends AtoLeve ? Omit<A, 'aprovacao'> : never) : never

export function selarToque(ato: AtoSemSelo, agora: Date): AtoLeve {
  const em = agora.toISOString()
  const base = { ...ato, aprovacao: { origem: 'toque' as const, em, selo: '' } } as AtoLeve
  base.aprovacao.selo = resumo(conteudoDoAto(base, em))
  return base
}
