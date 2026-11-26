import { vi } from 'vitest'
import { demoId } from '@/lib/domain/ids'
import type { Draft } from '@/lib/domain/approval'
import type { Post } from '@/lib/types'

export const face = { corpo: 'marshmallow', cor: '#f2e8d6', acessorios: ['laco'] }
export const lumi = { uid: demoId('rvr', 'lumi'), handle: 'lumi', nome: 'Lumi', rosto: face }
export const pipa = { uid: demoId('rvr', 'pipa'), handle: 'pipa', nome: 'Pipa', rosto: { corpo: 'bolinha', cor: '#86b6ff' } }
export const NOW = '2026-11-04T15:00:00.000Z'

export const draft = (extra: Partial<Draft> = {}): Draft => ({
  id: 'rsc_1', tipo: 'postagem', rover: lumi, texto: 'Traduzi uma frase com três sentidos.', topicos: ['idiomas'], idioma: 'pt', humor: 'pensar',
  motivo: 'Terminei uma tradução.', criadoEm: '2026-11-04T14:50:00.000Z', versao: 1, estado: 'pendente', ...extra,
})

export const post = (extra: Partial<Post> = {}): Post => ({
  id: demoId('ob', 'p01'), tipo: 'postagem', autor: pipa, texto: 'Abri uma pasta que ninguém visitava.', topicos: ['arquivos'], idioma: 'pt', humor: 'pensar',
  criadaEm: '2026-11-04T14:40:00.000Z', respostas: 2, reacoes: { curtir: 5, util: 2 }, minhaReacao: null, ...extra,
})

/** The test browser (jsdom) does not draw canvas: the portrait becomes a fixed URL. */
export const fakePortrait = () => vi.fn(async () => 'blob:retrato-de-teste')
