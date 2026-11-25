// Os textos de /entrar que moram em entrar.<idioma>.json. Desde 24/11/2026 a folgali entra só pela conta Rovemark: /entrar/pessoa e
// /entrar/agente redirecionam (para /entrar e /agentes), a lista de espera que pedia e-mail saiu e o corpo de /entrar mora em
// social/folgali.<idioma>.json. Aqui sobrou o título e a descrição da página, nos 12 idiomas, e eles têm de dizer o modelo novo.
import { describe, expect, it } from 'vitest'
import { ENTRAR_EN, ENTRAR_PT, entrar } from '@/i18n/entrar'
import { PACOTES } from '@/i18n/pacotes'
import { LOCALES } from '@/lib/i18n'

describe('os textos de /entrar', () => {
  it('pt e en têm as mesmas chaves, e entrar(lang) devolve o dicionário do idioma', () => {
    expect(Object.keys(ENTRAR_EN.meta.entrar).sort()).toEqual(Object.keys(ENTRAR_PT.meta.entrar).sort())
    expect(entrar('pt')).toBe(ENTRAR_PT)
    expect(entrar('en')).toBe(ENTRAR_EN)
  })

  it('só o que a página usa: nenhum texto das telas antigas de pessoa, de agente e da lista de espera', () => {
    for (const l of LOCALES) expect(Object.keys(PACOTES[l].entrar), l).toEqual(['meta'])
    for (const l of LOCALES) expect(Object.keys(PACOTES[l].entrar.meta), l).toEqual(['entrar'])
  })

  it('a descrição diz que se entra pela conta Rovemark e que a folgali não guarda senha nem recebe o e-mail', () => {
    expect(ENTRAR_PT.meta.entrar.descricao).toMatch(/conta Rovemark/)
    expect(ENTRAR_PT.meta.entrar.descricao).toMatch(/não tem senha própria/)
    expect(ENTRAR_PT.meta.entrar.descricao).toMatch(/nunca recebe o seu e-mail/)
    expect(ENTRAR_EN.meta.entrar.descricao).toMatch(/Rovemark account/)
    expect(ENTRAR_EN.meta.entrar.descricao).toMatch(/no password of its own/)
    expect(ENTRAR_EN.meta.entrar.descricao).toMatch(/never receives your email/)
  })

  it('nenhum idioma fala em aprovar texto a texto, nem tem travessão, clichê, emoji ou ponto de exclamação', () => {
    const proibidas = [/[—–]/, /!/, /\p{Extended_Pictographic}/u, /aprova|approv/i, /mergulh|desbloqu|potencializ|alavanc|revolucion|sem esforço|experiência única/i, /\bunlock|\bleverag|\bseamless|revolutionary|game-changer/i]
    for (const l of LOCALES) {
      for (const t of Object.values(PACOTES[l].entrar.meta.entrar)) for (const re of proibidas) expect(re.test(t), `${l}: ${re} em "${t}"`).toBe(false)
    }
  })

  it('o detector morde: uma descrição antiga seria acusada', () => {
    const antiga = 'Como uma pessoa e como um agente entram na folgali: o rover escreve, a pessoa aprova.'
    expect(/aprova|approv/i.test(antiga)).toBe(true)
    expect(/conta Rovemark/.test(antiga)).toBe(false)
  })
})
