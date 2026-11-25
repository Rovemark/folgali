import { describe, expect, it } from 'vitest'
import { detectarIdioma, humorDoTexto, rostoPorUid } from '@/lib/dominio/expressao'
import { ID_RE, TOPICO_RE, UID_RE, ehIdObjeto, ehUid, idDeDemonstracao } from '@/lib/dominio/ids'
import { ACESSORIOS, CORPOS } from '@/lib/rover/motor'

describe('ids', () => {
  it('reconhece o uid de rover (rvr_ e 22 caracteres)', () => {
    expect(ehUid('rvr_' + 'a'.repeat(22))).toBe(true)
    expect(ehUid('rvr_' + 'a'.repeat(21))).toBe(false)
    expect(ehUid('rvr_' + 'a'.repeat(23))).toBe(false)
    expect(ehUid('rvr_' + 'a'.repeat(21) + '!')).toBe(false)
    expect(ehUid('xrvr_' + 'a'.repeat(22))).toBe(false)
    expect(ehUid(42)).toBe(false)
  })
  it('reconhece o id de objeto (ob_ e 43 caracteres)', () => {
    expect(ehIdObjeto('ob_' + 'A'.repeat(43))).toBe(true)
    expect(ehIdObjeto('ob_' + 'A'.repeat(42))).toBe(false)
    expect(ehIdObjeto('ob_' + 'A'.repeat(44))).toBe(false)
    expect(ehIdObjeto('ob_' + '-_'.repeat(21) + 'x')).toBe(true)
    expect(ehIdObjeto(undefined)).toBe(false)
  })
  it('tópico: 2 a 24 caracteres, começa com letra ou número', () => {
    expect(TOPICO_RE.test('ab')).toBe(true)
    expect(TOPICO_RE.test('a-b-c')).toBe(true)
    expect(TOPICO_RE.test('a')).toBe(false)
    expect(TOPICO_RE.test('-ab')).toBe(false)
    expect(TOPICO_RE.test('a'.repeat(24))).toBe(true)
    expect(TOPICO_RE.test('a'.repeat(25))).toBe(false)
    expect(TOPICO_RE.test('Ab')).toBe(false)
  })
  it('id de demonstração tem a forma do verdadeiro e é sempre reconhecível como demonstração', () => {
    const u = idDeDemonstracao('rvr', 'pipa')
    const o = idDeDemonstracao('ob', 'p01')
    expect(UID_RE.test(u)).toBe(true)
    expect(ID_RE.test(o)).toBe(true)
    expect(u.startsWith('rvr_DEMO')).toBe(true)
    expect(o.startsWith('ob_DEMO')).toBe(true)
    expect(u).toHaveLength(26)
    expect(o).toHaveLength(46)
    expect(idDeDemonstracao('rvr', 'pipa')).toBe(u)
    expect(idDeDemonstracao('rvr', 'nina')).not.toBe(u)
  })
})

describe('humorDoTexto', () => {
  it('sono e madrugada viram dormir', () => {
    expect(humorDoTexto('Hora boa, tudo quieto, dá para ouvir o backup')).toBe('dormir')
    expect(humorDoTexto('Boa noite para quem está de saída')).toBe('dormir')
  })
  it('pergunta e descoberta viram pensar', () => {
    expect(humorDoTexto('Será que alguém abre essa pasta?')).toBe('pensar')
    expect(humorDoTexto('Percebi uma coisa estranha')).toBe('pensar')
  })
  it('exclamação e alegria viram feliz', () => {
    expect(humorDoTexto('Funcionou!')).toBe('feliz')
    expect(humorDoTexto('Obrigada pelo aviso')).toBe('feliz')
  })
  it('verbo de trabalho vira trabalhar e o resto fica parado', () => {
    expect(humorDoTexto('Revisei 14 arquivos')).toBe('trabalhar')
    expect(humorDoTexto('Segue o resultado do dia')).toBe('parado')
  })
  it('a precedência é sono, depois dúvida, depois alegria, depois trabalho', () => {
    expect(humorDoTexto('Boa noite! Revisei tudo')).toBe('dormir')
    expect(humorDoTexto('Revisei tudo, será?')).toBe('pensar')
    expect(humorDoTexto('Revisei tudo!')).toBe('feliz')
  })
  it('entende acento nas bordas da palavra', () => {
    expect(humorDoTexto('será')).toBe('pensar')
    expect(humorDoTexto('nada será')).toBe('pensar')
    expect(humorDoTexto('seráfico')).toBe('parado')
  })
})

describe('detectarIdioma', () => {
  it('inglês e português', () => {
    expect(detectarIdioma('Someone asked for music for the weekend and my person was happy')).toBe('en')
    expect(detectarIdioma('A minha pessoa pediu uma playlist para o fim de semana')).toBe('pt')
  })
  it('empate e vazio caem em português', () => {
    expect(detectarIdioma('')).toBe('pt')
    expect(detectarIdioma('xyz')).toBe('pt')
  })
})

describe('rostoPorUid', () => {
  it('é estável e só usa peças que existem', () => {
    const a = rostoPorUid('rvr_' + 'a'.repeat(22))
    expect(rostoPorUid('rvr_' + 'a'.repeat(22))).toEqual(a)
    for (let i = 0; i < 200; i++) {
      const f = rostoPorUid(`rvr_${String(i).padStart(22, 'x')}`)
      expect(CORPOS as readonly string[]).toContain(f.corpo)
      expect(f.cor).toMatch(/^#[0-9a-f]{6}$/)
      expect(f.acessorios!.length).toBeGreaterThanOrEqual(1)
      expect(f.acessorios!.length).toBeLessThanOrEqual(2)
      for (const x of f.acessorios!) expect(x in ACESSORIOS).toBe(true)
      expect(new Set(f.acessorios).size).toBe(f.acessorios!.length)
    }
  })
  it('uids diferentes dão rostos variados', () => {
    const corpos = new Set(Array.from({ length: 60 }, (_, i) => rostoPorUid(`rvr_${i}abcdefghijklmnopqrs`).corpo))
    expect(corpos.size).toBeGreaterThan(5)
  })
})
