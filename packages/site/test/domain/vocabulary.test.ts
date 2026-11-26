import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { chipColor, resolveMarks, DEFAULT_STATUS, statusForFilter, statusFitsCategory } from '@/lib/domain/vocabulary'
import { VOCABULARY_COLORS, type Vocabulary } from '@/lib/social/types'
import { additiveMarks, additiveVocabulary } from '@/lib/social/sanitize-social'

const vocab: Vocabulary = {
  etiquetas: [{ chave: 'bug', rotulo: 'Bug', cor: 'vermelho' }, { chave: 'ideia', rotulo: 'Ideia', cor: 'azul' }],
  status: [
    { chave: 'aberto', rotulo: 'Aberto', cor: 'verde', categorias: null },
    { chave: 'respondido', rotulo: 'Respondido', cor: 'azul', categorias: ['Dúvidas'] },
  ],
  padrao: false,
}

describe('status by category', () => {
  it('without a list it counts in every category, including the absent one; with a list only in its own', () => {
    expect(statusFitsCategory({ categorias: null }, null)).toBe(true)
    expect(statusFitsCategory({ categorias: null }, 'Dúvidas')).toBe(true)
    expect(statusFitsCategory({ categorias: ['Dúvidas'] }, 'Dúvidas')).toBe(true)
    expect(statusFitsCategory({ categorias: ['Dúvidas'] }, 'Dicas')).toBe(false)
    expect(statusFitsCategory({ categorias: ['Dúvidas'] }, null)).toBe(false)
  })
  it('the filter offers all statuses when no category is chosen and only those that apply with one', () => {
    expect(statusForFilter(vocab, undefined).map((s) => s.chave)).toEqual(['aberto', 'respondido'])
    expect(statusForFilter(vocab, 'Dúvidas').map((s) => s.chave)).toEqual(['aberto', 'respondido'])
    expect(statusForFilter(vocab, 'Dicas').map((s) => s.chave)).toEqual(['aberto'])
  })
})

describe('resolve a topic\'s keys through the vocabulary', () => {
  it('swaps the key for the label and the color, in the topic\'s order', () => {
    const r = resolveMarks({ etiquetas: ['ideia', 'bug'], status: 'respondido' }, vocab)!
    expect(r.etiquetas.map((e) => e.rotulo)).toEqual(['Ideia', 'Bug'])
    expect(r.status).toMatchObject({ chave: 'respondido', rotulo: 'Respondido', cor: 'azul' })
  })
  it('a key the vocabulary does not know disappears (never appears as a code)', () => {
    const r = resolveMarks({ etiquetas: ['bug', 'apagada'], status: 'sumiu' }, vocab)!
    expect(r.etiquetas.map((e) => e.chave)).toEqual(['bug'])
    expect(r.status).toBeNull()
    expect(resolveMarks({ etiquetas: ['apagada'], status: 'sumiu' }, vocab)).toBeNull()
  })
  it('status only, label only, no mark and no vocabulary', () => {
    expect(resolveMarks({ etiquetas: [], status: 'aberto' }, vocab)).toMatchObject({ etiquetas: [], status: { chave: 'aberto' } })
    expect(resolveMarks({ etiquetas: ['bug'], status: null }, vocab)).toMatchObject({ status: null, etiquetas: [{ chave: 'bug' }] })
    expect(resolveMarks({ etiquetas: [], status: null }, vocab)).toBeNull()
    expect(resolveMarks(undefined, vocab)).toBeNull()
    expect(resolveMarks({ etiquetas: ['bug'], status: null }, undefined)).toBeNull()
  })
})

describe('chip color', () => {
  it('the protocol\'s eight pass; any other becomes gray (never becomes a style written by a stranger)', () => {
    for (const c of VOCABULARY_COLORS) expect(chipColor(c)).toBe(c)
    for (const c of ['red', '#f00', 'Azul', '', 'azul; background:url(x)', 'constructor']) expect(chipColor(c)).toBe('cinza')
  })
})

// ---- parity with the protocol (packages/protocol, same tree) -----------------------------------------------------------------
const path = [process.env.ROVER_PROTOCOLO_03, fileURLToPath(new URL('../../../protocol/src/index.js', import.meta.url))].filter((x): x is string => !!x).find((c) => existsSync(c))
type Protocol = { VOCABULARY_COLORS?: readonly string[]; DEFAULT_STATUS?: readonly Record<string, unknown>[]; VOCABULARY_KEY_RE?: RegExp; VOCABULARY_LABEL_RE?: RegExp }
const P = path ? ((await import(/* @vite-ignore */ path)) as Protocol) : null
const has032 = !!P && Array.isArray(P.VOCABULARY_COLORS) && !!P.VOCABULARY_KEY_RE && !!P.VOCABULARY_LABEL_RE

describe.skipIf(!has032)(`vocabulary parity with protocol 0.3.2${has032 ? '' : ' (off: the protocol next to the site is older than 0.3.2)'}`, () => {
  it('the eight colors and the default status are the same', () => {
    expect([...VOCABULARY_COLORS]).toEqual([...P!.VOCABULARY_COLORS!])
    expect(DEFAULT_STATUS.map((s) => ({ ...s }))).toEqual(P!.DEFAULT_STATUS!.map((s) => ({ ...s })))
  })
  const vocab = (label: string, key = 'bug') => ({ etiquetas: [{ chave: key, rotulo: label, cor: 'azul' }], status: [], padrao: false })
  it('what the site accepts as a label and as a key the protocol also accepts (and what the protocol refuses the site discards)', () => {
    const labels = ['Bug', 'Dúvida', 'Em andamento', "D'água", 'Pré-venda', 'Sprint 2', '日本語', 'Ab', 'a'.repeat(24), 'a'.repeat(25), 'B', ' Bug', 'Bug-', 'Em  andamento', '**Bug**', 'http://x.com', 'Bug\nurgente', 'Bug!', '#bug', 'bug_x', 'Bug 🐛', 'Dúvida'.normalize('NFD')]
    for (const r of labels) {
      const site = additiveVocabulary(vocab(r))?.etiquetas.length === 1
      const protocol = P!.VOCABULARY_LABEL_RE!.test(r) && !r.includes('  ') && r === r.normalize('NFC')
      expect(site, JSON.stringify(r)).toBe(protocol)
    }
    for (const c of ['bug', 'em-andamento', 'a1', 'a'.repeat(20), 'a'.repeat(21), 'a', '1abc', '-abc', 'Bug', 'dúvida', 'bug bug', '']) {
      expect(additiveVocabulary(vocab('Bug', c))?.etiquetas.length === 1, JSON.stringify(c)).toBe(P!.VOCABULARY_KEY_RE!.test(c))
      expect(additiveMarks({ etiquetas: [c], status: null }) !== undefined, JSON.stringify(c)).toBe(P!.VOCABULARY_KEY_RE!.test(c))
    }
  })
})
