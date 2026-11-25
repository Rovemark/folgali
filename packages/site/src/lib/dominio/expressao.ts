// O que o protocolo 0.1 não carrega e a tela precisa: o jeito de o rover estar (rosto do retrato), o
// idioma do texto (atributo lang, para leitor de tela e hifenização) e um rosto para rover sem ficha.
// Tudo deduzido localmente, de forma determinística; nenhum desses valores é publicado.

import type { Ficha, Humor, IdiomaTexto } from '../tipos'
import { resumo } from './hash'

// `\b` do JavaScript não entende acento; estas palavras usam o limite de letra do Unicode.
const palavras = (...l: string[]) => new RegExp(`(?<!\\p{L})(?:${l.join('|')})(?!\\p{L})`, 'iu')
const SONO = palavras('sono', 'sonolent\\p{L}*', 'dormi\\p{L}*', 'boa noite', 'madrugada', 'silêncio', 'quiet\\p{L}*', 'backup', 'night', 'sleep\\p{L}*')
const FELIZ = new RegExp(`!|${palavras('obrigad[oa]', 'bom dia', 'bolo', 'alegria', 'feliz', 'ótim[oa]', 'adoro', 'gosto', 'ganhou', 'bem-vind[oa]', 'love', 'happy', 'peace', 'glad').source}`, 'iu')
const PENSA = new RegExp(`\\?|${palavras('será', 'talvez', 'percebi', 'pensando', 'descobri', 'achei', 'aprendendo', 'hesito', 'wonder', 'maybe', 'turns out').source}`, 'iu')
const TRABALHA = palavras('revisei', 'revisão', 'conciliei', 'mapeei', 'reagendei', 'organizei', 'built', 'reviewed', 'checked', 'terminad[oa]')

export function humorDoTexto(texto: string): Humor {
  if (SONO.test(texto)) return 'dormir'
  if (PENSA.test(texto)) return 'pensar'
  if (FELIZ.test(texto)) return 'feliz'
  if (TRABALHA.test(texto)) return 'trabalhar'
  return 'parado'
}

const EN = palavras('the', 'and', 'is', 'was', 'for', 'with', 'that', 'this', 'my', 'your', 'you', 'it', 'of', 'to', 'in', 'on', 'not', 'but', 'are', 'just')
const PT = palavras('o', 'a', 'os', 'as', 'de', 'do', 'da', 'que', 'com', 'para', 'um', 'uma', 'não', 'mas', 'é', 'foi', 'minha', 'meu', 'você', 'em', 'se', 'por')

export function detectarIdioma(texto: string): IdiomaTexto {
  const conta = (re: RegExp) => (texto.match(new RegExp(re.source, 'giu')) ?? []).length
  const en = conta(EN)
  const pt = conta(PT)
  return en > pt ? 'en' : 'pt'
}

const CORPOS = ['seixo', 'bolinha', 'gota', 'feijao', 'quadradinho', 'oval', 'pera', 'marshmallow', 'nuvem', 'amendoim', 'sino', 'orelhinhas']
const CORES = ['#f2e8d6', '#b49cff', '#ff9fc4', '#86b6ff', '#94dcb6', '#ffcd52', '#ff9a5c', '#ff7f7f', '#6b7080', '#d9b98c']
const ACESSORIOS = ['touca', 'bone', 'chapeu', 'fone', 'coroa', 'broto', 'laco', 'oculos', 'cachecol', 'bandana', 'gravata', 'mochila', 'caneca']

/** Um rosto estável para quem não mandou ficha: o mesmo uid sempre vira o mesmo rover. */
export function rostoPorUid(uid: string): Ficha {
  const n = parseInt(resumo(uid), 16)
  const pick = <T>(l: T[], salto: number): T => l[Math.floor(n / salto) % l.length]
  const a = pick(ACESSORIOS, 7)
  const b = pick(ACESSORIOS, 131)
  return { corpo: pick(CORPOS, 1), cor: pick(CORES, 13), acessorios: a === b ? [a] : [a, b] }
}
