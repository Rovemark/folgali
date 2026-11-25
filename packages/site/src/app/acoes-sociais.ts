'use server'

// Ações do servidor da parte social. O navegador só chama estas funções; nada fala com o relé daqui
// de fora. Tudo o que chega do navegador é validado ANTES de tocar a ponte do app.

import { revalidatePath } from 'next/cache'
import { validarAto } from '@/lib/dominio/ato'
import { ESQUEMA_SOCIAL, ehTipoSocial, type Campos, type DestinoDoRascunho, type RascunhoSocial, type ValorCampo } from '@/lib/dominio/aprovacao-social'
import { janelaDaOrdem, ordemDaBusca, ordemDasRespostas, ordemDosTopicos } from '@/lib/dominio/ordem'
import { obterRede } from '@/lib/obter-rede'
import type { ResultadoDeAto } from '@/lib/social/cliente-social'
import { ErroRede, type CodigoErro, type Pagina } from '@/lib/tipos'

const atualizar = () => revalidatePath('/', 'layout')

export type RespostaAto = { ok: true; resultado?: ResultadoDeAto['resultado'] } | { ok: false; codigo: CodigoErro }
export type RespostaProposta = { ok: true; rascunho: RascunhoSocial } | { ok: false; codigo: CodigoErro | 'campos' }

const codigoDe = (e: unknown): CodigoErro => (e instanceof ErroRede ? e.codigo : 'indisponivel')

/** Um gesto livre (amizade, bloqueio, entrar, votar...). O dado do navegador é validado; o relé repete a conferência. */
export async function agirAcao(ato: unknown): Promise<RespostaAto> {
  const valido = validarAto(ato)
  if (!valido) return { ok: false, codigo: 'invalido' }
  try {
    const r = await obterRede().ponte.agir(valido)
    atualizar()
    return { ok: true, resultado: r.resultado }
  } catch (e) {
    return { ok: false, codigo: codigoDe(e) }
  }
}

function camposLimpos(tipo: string, x: unknown): Campos | null {
  if (!ehTipoSocial(tipo) || typeof x !== 'object' || x === null || Array.isArray(x)) return null
  const o = x as Record<string, unknown>
  const campos: Campos = {}
  for (const c of ESQUEMA_SOCIAL[tipo]) {
    const v = o[c.nome]
    if (v === undefined || v === null) campos[c.nome] = null
    else if (typeof v === 'string' && v.length <= 4000) campos[c.nome] = v
    else if (Array.isArray(v) && v.length <= 20 && v.every((i) => typeof i === 'string' && i.length <= 200)) campos[c.nome] = v as string[]
    else return null
  }
  return campos
}

const destinoLimpo = (x: unknown): DestinoDoRascunho | null => {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  if (typeof o.rotulo !== 'string' || o.rotulo.length > 120) return null
  return { rotulo: o.rotulo, href: typeof o.href === 'string' && o.href.startsWith('/') && o.href.length <= 200 ? o.href : undefined }
}

/** O rover propõe o texto: vira rascunho na fila de aprovação. Nada sai agora. */
export async function proporAcao(tipo: string, campos: unknown, destino: unknown): Promise<RespostaProposta> {
  const c = camposLimpos(tipo, campos)
  if (!c || !ehTipoSocial(tipo)) return { ok: false, codigo: 'campos' }
  try {
    const rascunho = await obterRede().ponte.propor(tipo, c, destinoLimpo(destino))
    atualizar()
    return { ok: true, rascunho }
  } catch (e) {
    return { ok: false, codigo: codigoDe(e) }
  }
}

export type ValorDeCampo = ValorCampo

// ---- "ver mais" de qualquer lista -----------------------------------------------------------------------

/** Listas que a tela sabe continuar. A chave é uma lista fechada: o navegador não escolhe método nenhum. */
export type ListaPaginavel =
  | 'recados' | 'depoimentos' | 'entregas' | 'amigos' | 'comunidadesDoRover' | 'paginasDoRover' | 'notificacoes' | 'relacoes'
  | 'comunidades' | 'membros' | 'topicos' | 'respostas' | 'registroDaComunidade' | 'atualizacoes' | 'seguidoresDaPagina' | 'paginas' | 'linhaMista' | 'registroDoRele'
  | 'buscaRovers' | 'buscaComunidades' | 'buscaTopicos' | 'buscaPaginas'

export interface PedidoDeLista {
  lista: ListaPaginavel
  /** o uid, o id ou o termo de busca, conforme a lista */
  de?: string
  cursor: string
  /** filtros (tema, ordem, categoria, em, estado...): só texto curto */
  opcoes?: Record<string, string>
}

const txt = (x: unknown): string | undefined => (typeof x === 'string' && x.length > 0 && x.length <= 120 ? x : undefined)

export async function maisAcao(p: PedidoDeLista): Promise<Pagina<unknown> | null> {
  const { cliente } = obterRede()
  const cursor = txt(p.cursor)
  const de = txt(p.de)
  const o = p.opcoes ?? {}
  if (!cursor) return null
  try {
    switch (p.lista) {
      case 'recados': return de ? await cliente.recados(de, cursor) : null
      case 'depoimentos': return de ? await cliente.depoimentos(de, { cursor, estado: o.estado === 'pendentes' ? 'pendentes' : 'aceitos' }) : null
      case 'entregas': return de ? await cliente.entregas(de, cursor) : null
      case 'amigos': return de ? await cliente.amigos(de, cursor) : null
      case 'comunidadesDoRover': return de ? await cliente.comunidadesDoRover(de, cursor) : null
      case 'paginasDoRover': return de ? await cliente.paginasDoRover(de, cursor) : null
      case 'notificacoes': return de ? await cliente.notificacoes(de, cursor) : null
      case 'relacoes': return de ? await cliente.relacoes(de, cursor) : null
      case 'comunidades': return await cliente.comunidades({ cursor, tema: txt(o.tema), acesso: o.acesso === 'aberta' || o.acesso === 'moderada' ? o.acesso : undefined, ordem: o.ordem === 'ativas' ? 'ativas' : 'recentes' })
      case 'membros': return de ? await cliente.membros(de, cursor) : null
      case 'topicos': {
        if (!de) return null
        const porPessoas = await cliente.suporta('ordem-por-pessoas')
        const ordem = ordemDosTopicos(o.ordem, porPessoas)
        return await cliente.topicos(de, { cursor, categoria: txt(o.categoria), tag: txt(o.tag), ordem, janela: janelaDaOrdem(ordem, o.janela), status: txt(o.status), etiqueta: txt(o.etiqueta) })
      }
      case 'respostas': {
        if (!de) return null
        const ordem = ordemDasRespostas(o.ordem, await cliente.suporta('ordem-por-pessoas'))
        return await cliente.respostas(de, { cursor, em: txt(o.em), ordem, janela: janelaDaOrdem(ordem, o.janela) })
      }
      case 'registroDaComunidade': return de ? await cliente.registroDaComunidade(de, cursor) : null
      case 'atualizacoes': return de ? await cliente.atualizacoes(de, cursor) : null
      case 'seguidoresDaPagina': return de ? await cliente.seguidoresDaPagina(de, cursor) : null
      case 'paginas': return await cliente.paginas({ cursor, tema: txt(o.tema), ordem: o.ordem === 'ativas' ? 'ativas' : 'recentes' })
      case 'linhaMista': return await cliente.linhaMista(cursor)
      case 'registroDoRele': return await cliente.registroDoRele(cursor)
      case 'buscaRovers': return de ? await cliente.buscarTipo(de, 'rovers', cursor) : null
      case 'buscaComunidades': return de ? await cliente.buscarTipo(de, 'comunidades', cursor) : null
      case 'buscaTopicos': {
        if (!de) return null
        const ordem = ordemDaBusca(o.ordem, await cliente.suporta('ordem-por-pessoas'))
        return await cliente.buscarTipo(de, 'topicos', cursor, { ordem, janela: janelaDaOrdem(ordem, o.janela) })
      }
      case 'buscaPaginas': return de ? await cliente.buscarTipo(de, 'paginas', cursor) : null
    }
  } catch {
    return null
  }
}

// ---- a fila de aprovação social -------------------------------------------------------------------------------

export async function aprovarSocialAcao(id: string, versaoVista: number) {
  try {
    const r = await obterRede().ponte.aprovarSocial(id, versaoVista)
    atualizar()
    const atual = await obterRede().ponte.rascunhoSocial(id)
    return { ...r, atual }
  } catch (e) {
    return { ok: false as const, motivo: 'erro' as const, codigo: codigoDe(e), achados: [], atual: null }
  }
}

export async function editarSocialAcao(id: string, campos: unknown): Promise<RascunhoSocial | null> {
  try {
    const atual = await obterRede().ponte.rascunhoSocial(id)
    if (!atual) return null
    const c = camposLimpos(atual.tipo, campos)
    if (!c) return null
    const r = await obterRede().ponte.editarSocial(id, c)
    atualizar()
    return r
  } catch {
    return null
  }
}

export async function recusarSocialAcao(id: string): Promise<RascunhoSocial | null> {
  try {
    const r = await obterRede().ponte.recusarSocial(id)
    atualizar()
    return r
  } catch {
    return null
  }
}

/** A pessoa abriu os avisos até o número `seq`. Guardado no app, nunca em cookie. */
export async function marcarAvisosVistosAcao(seq: number): Promise<void> {
  if (!Number.isInteger(seq) || seq < 0) return
  try {
    await obterRede().ponte.marcarAvisosVistos(seq)
    atualizar()
  } catch {
    /* sem app pareado: nada a marcar */
  }
}
