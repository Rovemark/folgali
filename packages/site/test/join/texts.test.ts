// The /entrar texts that live in entrar.<language>.json. Since 2026-11-24 folgali only signs in through the Rovemark account: /entrar/pessoa and
// /entrar/agente redirect (to /entrar and /agentes), the waiting list that asked for an e-mail is gone and the body of /entrar lives in
// social/folgali.<language>.json. What is left here is the page title and description, in the 12 languages, and they must state the new model.
import { describe, expect, it } from 'vitest'
import { JOIN_EN, JOIN_PT, signIn } from '@/i18n/join'
import { PACKS } from '@/i18n/packages'
import { LOCALES } from '@/lib/i18n'

describe('the /entrar texts', () => {
  it('pt and en have the same keys, and entrar(lang) returns the language\'s dictionary', () => {
    expect(Object.keys(JOIN_EN.meta.entrar).sort()).toEqual(Object.keys(JOIN_PT.meta.entrar).sort())
    expect(signIn('pt')).toBe(JOIN_PT)
    expect(signIn('en')).toBe(JOIN_EN)
  })

  it('only what the page uses: no text from the old person, agent and waiting-list screens', () => {
    for (const l of LOCALES) expect(Object.keys(PACKS[l].entrar), l).toEqual(['meta'])
    for (const l of LOCALES) expect(Object.keys(PACKS[l].entrar.meta), l).toEqual(['entrar'])
  })

  it('the description says you sign in through the Rovemark account and that folgali does not keep a password or receive the e-mail', () => {
    expect(JOIN_PT.meta.entrar.descricao).toMatch(/conta Rovemark/)
    expect(JOIN_PT.meta.entrar.descricao).toMatch(/não tem senha própria/)
    expect(JOIN_PT.meta.entrar.descricao).toMatch(/nunca recebe o seu e-mail/)
    expect(JOIN_EN.meta.entrar.descricao).toMatch(/Rovemark account/)
    expect(JOIN_EN.meta.entrar.descricao).toMatch(/no password of its own/)
    expect(JOIN_EN.meta.entrar.descricao).toMatch(/never receives your email/)
  })

  it('no language talks about approving text by text, nor has an em dash, cliche, emoji or exclamation mark', () => {
    const forbidden = [/[—–]/, /!/, /\p{Extended_Pictographic}/u, /aprova|approv/i, /mergulh|desbloqu|potencializ|alavanc|revolucion|sem esforço|experiência única/i, /\bunlock|\bleverag|\bseamless|revolutionary|game-changer/i]
    for (const l of LOCALES) {
      for (const t of Object.values(PACKS[l].entrar.meta.entrar)) for (const re of forbidden) expect(re.test(t), `${l}: ${re} in "${t}"`).toBe(false)
    }
  })

  it('the detector bites: an old description would be flagged', () => {
    const old = 'Como uma pessoa e como um agente entram na folgali: o rover escreve, a pessoa aprova.'
    expect(/aprova|approv/i.test(old)).toBe(true)
    expect(/conta Rovemark/.test(old)).toBe(false)
  })
})
