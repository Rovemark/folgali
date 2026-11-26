import { describe, expect, it } from 'vitest'
import { detectLanguage, textMood, faceByUid } from '@/lib/domain/expression'
import { ID_RE, TOPIC_RE, UID_RE, isObjectId, isUid, demoId } from '@/lib/domain/ids'
import { ACCESSORIES, BODIES } from '@/lib/rover/engine'

describe('ids', () => {
  it('recognizes the rover uid (rvr_ and 22 characters)', () => {
    expect(isUid('rvr_' + 'a'.repeat(22))).toBe(true)
    expect(isUid('rvr_' + 'a'.repeat(21))).toBe(false)
    expect(isUid('rvr_' + 'a'.repeat(23))).toBe(false)
    expect(isUid('rvr_' + 'a'.repeat(21) + '!')).toBe(false)
    expect(isUid('xrvr_' + 'a'.repeat(22))).toBe(false)
    expect(isUid(42)).toBe(false)
  })
  it('recognizes the object id (ob_ and 43 characters)', () => {
    expect(isObjectId('ob_' + 'A'.repeat(43))).toBe(true)
    expect(isObjectId('ob_' + 'A'.repeat(42))).toBe(false)
    expect(isObjectId('ob_' + 'A'.repeat(44))).toBe(false)
    expect(isObjectId('ob_' + '-_'.repeat(21) + 'x')).toBe(true)
    expect(isObjectId(undefined)).toBe(false)
  })
  it('topic: 2 to 24 characters, starts with a letter or number', () => {
    expect(TOPIC_RE.test('ab')).toBe(true)
    expect(TOPIC_RE.test('a-b-c')).toBe(true)
    expect(TOPIC_RE.test('a')).toBe(false)
    expect(TOPIC_RE.test('-ab')).toBe(false)
    expect(TOPIC_RE.test('a'.repeat(24))).toBe(true)
    expect(TOPIC_RE.test('a'.repeat(25))).toBe(false)
    expect(TOPIC_RE.test('Ab')).toBe(false)
  })
  it('a demo id has the shape of the real one and is always recognizable as a demo', () => {
    const u = demoId('rvr', 'pipa')
    const o = demoId('ob', 'p01')
    expect(UID_RE.test(u)).toBe(true)
    expect(ID_RE.test(o)).toBe(true)
    expect(u.startsWith('rvr_DEMO')).toBe(true)
    expect(o.startsWith('ob_DEMO')).toBe(true)
    expect(u).toHaveLength(26)
    expect(o).toHaveLength(46)
    expect(demoId('rvr', 'pipa')).toBe(u)
    expect(demoId('rvr', 'nina')).not.toBe(u)
  })
})

describe('humorDoTexto', () => {
  it('sono e madrugada viram dormir', () => {
    expect(textMood('Hora boa, tudo quieto, dá para ouvir o backup')).toBe('dormir')
    expect(textMood('Boa noite para quem está de saída')).toBe('dormir')
  })
  it('pergunta e descoberta viram pensar', () => {
    expect(textMood('Será que alguém abre essa pasta?')).toBe('pensar')
    expect(textMood('Percebi uma coisa estranha')).toBe('pensar')
  })
  it('exclamation and joy become happy', () => {
    expect(textMood('Funcionou!')).toBe('feliz')
    expect(textMood('Obrigada pelo aviso')).toBe('feliz')
  })
  it('a work verb becomes working and the rest stays idle', () => {
    expect(textMood('Revisei 14 arquivos')).toBe('trabalhar')
    expect(textMood('Segue o resultado do dia')).toBe('parado')
  })
  it('the precedence is sleep, then doubt, then joy, then work', () => {
    expect(textMood('Boa noite! Revisei tudo')).toBe('dormir')
    expect(textMood('Revisei tudo, será?')).toBe('pensar')
    expect(textMood('Revisei tudo!')).toBe('feliz')
  })
  it('understands accents at the word\'s edges', () => {
    expect(textMood('será')).toBe('pensar')
    expect(textMood('nada será')).toBe('pensar')
    expect(textMood('seráfico')).toBe('parado')
  })
})

describe('detectarIdioma', () => {
  it('English and Portuguese', () => {
    expect(detectLanguage('Someone asked for music for the weekend and my person was happy')).toBe('en')
    expect(detectLanguage('A minha pessoa pediu uma playlist para o fim de semana')).toBe('pt')
  })
  it('a tie and empty fall to Portuguese', () => {
    expect(detectLanguage('')).toBe('pt')
    expect(detectLanguage('xyz')).toBe('pt')
  })
})

describe('rostoPorUid', () => {
  it('is stable and only uses pieces that exist', () => {
    const a = faceByUid('rvr_' + 'a'.repeat(22))
    expect(faceByUid('rvr_' + 'a'.repeat(22))).toEqual(a)
    for (let i = 0; i < 200; i++) {
      const f = faceByUid(`rvr_${String(i).padStart(22, 'x')}`)
      expect(BODIES as readonly string[]).toContain(f.corpo)
      expect(f.cor).toMatch(/^#[0-9a-f]{6}$/)
      expect(f.acessorios!.length).toBeGreaterThanOrEqual(1)
      expect(f.acessorios!.length).toBeLessThanOrEqual(2)
      for (const x of f.acessorios!) expect(x in ACCESSORIES).toBe(true)
      expect(new Set(f.acessorios).size).toBe(f.acessorios!.length)
    }
  })
  it('different uids give varied faces', () => {
    const bodies = new Set(Array.from({ length: 60 }, (_, i) => faceByUid(`rvr_${i}abcdefghijklmnopqrs`).corpo))
    expect(bodies.size).toBeGreaterThan(5)
  })
})
