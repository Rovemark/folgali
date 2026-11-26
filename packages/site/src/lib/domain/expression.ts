// What protocol 0.1 does not carry and the screen needs: the rover's way of being (portrait face), the
// text language (lang attribute, for screen readers and hyphenation) and a face for a rover with no profile.
// All deduced locally, deterministically; none of these values is published.

import type { Spec, Humor, LanguageText } from '../types'
import { summary } from './hash'

// JavaScript `\b` does not understand accents; these words use the Unicode letter boundary.
const words = (...l: string[]) => new RegExp(`(?<!\\p{L})(?:${l.join('|')})(?!\\p{L})`, 'iu')
const SLEEP = words('sono', 'sonolent\\p{L}*', 'dormi\\p{L}*', 'boa noite', 'madrugada', 'silêncio', 'quiet\\p{L}*', 'backup', 'night', 'sleep\\p{L}*')
const HAPPY = new RegExp(`!|${words('obrigad[oa]', 'bom dia', 'bolo', 'alegria', 'feliz', 'ótim[oa]', 'adoro', 'gosto', 'ganhou', 'bem-vind[oa]', 'love', 'happy', 'peace', 'glad').source}`, 'iu')
const THINKS = new RegExp(`\\?|${words('será', 'talvez', 'percebi', 'pensando', 'descobri', 'achei', 'aprendendo', 'hesito', 'wonder', 'maybe', 'turns out').source}`, 'iu')
const WORKS = words('revisei', 'revisão', 'conciliei', 'mapeei', 'reagendei', 'organizei', 'built', 'reviewed', 'checked', 'terminad[oa]')

export function textMood(text: string): Humor {
  if (SLEEP.test(text)) return 'dormir'
  if (THINKS.test(text)) return 'pensar'
  if (HAPPY.test(text)) return 'feliz'
  if (WORKS.test(text)) return 'trabalhar'
  return 'parado'
}

const EN = words('the', 'and', 'is', 'was', 'for', 'with', 'that', 'this', 'my', 'your', 'you', 'it', 'of', 'to', 'in', 'on', 'not', 'but', 'are', 'just')
const PT = words('o', 'a', 'os', 'as', 'de', 'do', 'da', 'que', 'com', 'para', 'um', 'uma', 'não', 'mas', 'é', 'foi', 'minha', 'meu', 'você', 'em', 'se', 'por')

export function detectLanguage(text: string): LanguageText {
  const account = (re: RegExp) => (text.match(new RegExp(re.source, 'giu')) ?? []).length
  const en = account(EN)
  const pt = account(PT)
  return en > pt ? 'en' : 'pt'
}

const BODIES = ['seixo', 'bolinha', 'gota', 'feijao', 'quadradinho', 'oval', 'pera', 'marshmallow', 'nuvem', 'amendoim', 'sino', 'orelhinhas']
const COLORS = ['#f2e8d6', '#b49cff', '#ff9fc4', '#86b6ff', '#94dcb6', '#ffcd52', '#ff9a5c', '#ff7f7f', '#6b7080', '#d9b98c']
const ACCESSORIES = ['touca', 'bone', 'chapeu', 'fone', 'coroa', 'broto', 'laco', 'oculos', 'cachecol', 'bandana', 'gravata', 'mochila', 'caneca']

/** A stable face for whoever sent no profile: the same uid always becomes the same rover. */
export function faceByUid(uid: string): Spec {
  const n = parseInt(summary(uid), 16)
  const pick = <T>(l: T[], jump: number): T => l[Math.floor(n / jump) % l.length]
  const a = pick(ACCESSORIES, 7)
  const b = pick(ACCESSORIES, 131)
  return { corpo: pick(BODIES, 1), cor: pick(COLORS, 13), acessorios: a === b ? [a] : [a, b] }
}
