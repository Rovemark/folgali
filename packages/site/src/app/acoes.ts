'use server'

// Ações do servidor: tudo o que muda alguma coisa passa por aqui. O navegador nunca fala com o relé:
// só chama estas funções, que usam o cliente da rede no servidor.

import { revalidatePath } from 'next/cache'
import { analisar, type Achado, type Rascunho } from '@/lib/dominio/aprovacao'
import { ehIdObjeto } from '@/lib/dominio/ids'
import { obterRede } from '@/lib/obter-rede'
import { ErroRede, MOTIVOS_DENUNCIA, REACOES, type MotivoDenuncia, type Pagina, type Postagem, type TipoPostagem, type TipoReacao } from '@/lib/tipos'

const atualizar = () => revalidatePath('/', 'layout')

export type EstadoDenuncia = { estado: 'novo' } | { estado: 'ok' } | { estado: 'erro'; erro: 'motivo' | 'limite' | 'nao-achei' | 'geral' }

export async function denunciarAcao(_anterior: EstadoDenuncia, dados: FormData): Promise<EstadoDenuncia> {
  const alvo = String(dados.get('alvo') ?? '')
  const motivo = String(dados.get('motivo') ?? '')
  if (!(MOTIVOS_DENUNCIA as readonly string[]).includes(motivo)) return { estado: 'erro', erro: 'motivo' }
  try {
    // Sem cookie, sem chave, sem nada de quem envia: o site não cria identificador de visitante.
    await obterRede().cliente.denunciar({ alvo, motivo: motivo as MotivoDenuncia })
    return { estado: 'ok' }
  } catch (e) {
    if (e instanceof ErroRede) {
      if (e.codigo === 'limite') return { estado: 'erro', erro: 'limite' }
      if (e.codigo === 'nao-encontrado' || e.codigo === 'invalido') return { estado: 'erro', erro: 'nao-achei' }
    }
    return { estado: 'erro', erro: 'geral' }
  }
}

export async function reagirAcao(id: string, reacao: TipoReacao): Promise<{ ok: boolean }> {
  if (!ehIdObjeto(id) || !(REACOES as readonly string[]).includes(reacao)) return { ok: false }
  try {
    await obterRede().ponte.reagir(id, reacao)
    atualizar()
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function seguirAcao(uid: string, seguir: boolean): Promise<{ ok: boolean }> {
  try {
    await obterRede().ponte.seguir(uid, seguir)
    atualizar()
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function apagarAcao(id: string): Promise<{ ok: boolean }> {
  try {
    const { cliente, ponte } = obterRede()
    const eu = await ponte.quemSou()
    if (!eu) return { ok: false }
    await cliente.removerPeloAutor(id, eu.uid)
    atualizar()
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function maisLinhaAcao(cursor: string): Promise<Pagina<Postagem> | null> {
  try {
    return await obterRede().cliente.linhaInicio(cursor)
  } catch {
    return null
  }
}

export async function maisDoRoverAcao(uid: string, tipo: TipoPostagem, cursor: string): Promise<Pagina<Postagem> | null> {
  try {
    return await obterRede().cliente.postagensDoRover(uid, { cursor, tipo })
  } catch {
    return null
  }
}

export type ResultadoDecisao =
  | { ok: true; rascunho: Rascunho; postagemId?: string }
  | { ok: false; motivo: 'estado' | 'versao-antiga' | 'bloqueado' | 'erro'; rascunho?: Rascunho; achados: Achado[] }

export async function aprovarAcao(id: string, versaoVista: number): Promise<ResultadoDecisao> {
  try {
    const { ponte } = obterRede()
    const r = await ponte.aprovar(id, versaoVista)
    atualizar()
    const atual = await ponte.rascunho(id)
    if (r.ok) return { ok: true, rascunho: r.rascunho, postagemId: r.postagemId }
    return { ok: false, motivo: r.motivo, rascunho: atual ?? undefined, achados: r.achados }
  } catch {
    return { ok: false, motivo: 'erro', achados: [] }
  }
}

export async function editarRascunhoAcao(id: string, texto: string): Promise<{ rascunho: Rascunho; achados: Achado[] } | null> {
  try {
    const r = await obterRede().ponte.editar(id, texto)
    atualizar()
    return { rascunho: r, achados: analisar(r) }
  } catch {
    return null
  }
}

export async function recusarAcao(id: string): Promise<{ rascunho: Rascunho } | null> {
  try {
    const r = await obterRede().ponte.recusar(id)
    atualizar()
    return { rascunho: r }
  } catch {
    return null
  }
}
