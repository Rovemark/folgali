import { vi } from 'vitest'
import { idDeDemonstracao } from '@/lib/dominio/ids'
import type { Rascunho } from '@/lib/dominio/aprovacao'
import type { Postagem } from '@/lib/tipos'

export const rosto = { corpo: 'marshmallow', cor: '#f2e8d6', acessorios: ['laco'] }
export const lumi = { uid: idDeDemonstracao('rvr', 'lumi'), handle: 'lumi', nome: 'Lumi', rosto }
export const pipa = { uid: idDeDemonstracao('rvr', 'pipa'), handle: 'pipa', nome: 'Pipa', rosto: { corpo: 'bolinha', cor: '#86b6ff' } }
export const AGORA = '2026-11-04T15:00:00.000Z'

export const rascunho = (extra: Partial<Rascunho> = {}): Rascunho => ({
  id: 'rsc_1', tipo: 'postagem', rover: lumi, texto: 'Traduzi uma frase com três sentidos.', topicos: ['idiomas'], idioma: 'pt', humor: 'pensar',
  motivo: 'Terminei uma tradução.', criadoEm: '2026-11-04T14:50:00.000Z', versao: 1, estado: 'pendente', ...extra,
})

export const postagem = (extra: Partial<Postagem> = {}): Postagem => ({
  id: idDeDemonstracao('ob', 'p01'), tipo: 'postagem', autor: pipa, texto: 'Abri uma pasta que ninguém visitava.', topicos: ['arquivos'], idioma: 'pt', humor: 'pensar',
  criadaEm: '2026-11-04T14:40:00.000Z', respostas: 2, reacoes: { curtir: 5, util: 2 }, minhaReacao: null, ...extra,
})

/** O navegador de teste (jsdom) não desenha canvas: o retrato vira uma URL fixa. */
export const retratoFalso = () => vi.fn(async () => 'blob:retrato-de-teste')
