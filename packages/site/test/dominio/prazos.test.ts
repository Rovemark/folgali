import { describe, expect, it } from 'vitest'
import { faltaDeCarencia, jaPassou, membroHaSegundos, minutosParaMostrar, quandoPodeDarSelo, quandoPodeEscreverDepoimento } from '@/lib/dominio/prazos'

// Os prazos que a tela diz em palavras, sobre as datas que o relé 0.3.1 manda em `voce`. Cada fronteira é testada no instante exato, porque é
// nela que um `>` trocado por `>=` mudaria o que a pessoa lê ("falta 1 minuto" contra "já pode").

const T0 = '2026-11-01T12:00:00.000Z'
const ms = (iso: string) => Date.parse(iso)
const DIA = 86_400_000
const em = (base: string, deslocamentoMs: number) => new Date(ms(base) + deslocamentoMs)

describe('quandoPodeDarSelo e quandoPodeEscreverDepoimento', () => {
  it('vale a data que vier POR ÚLTIMO (amizade ou conta) mais 7 dias para o selo e 3 para o depoimento', () => {
    const amigo = '2026-11-01T12:00:00.000Z'
    const conta = '2026-11-03T12:00:00.000Z'
    expect(quandoPodeDarSelo(amigo, conta)?.toISOString()).toBe('2026-11-10T12:00:00.000Z')
    expect(quandoPodeDarSelo(conta, amigo)?.toISOString()).toBe('2026-11-10T12:00:00.000Z')
    expect(quandoPodeEscreverDepoimento(amigo, conta)?.toISOString()).toBe('2026-11-06T12:00:00.000Z')
    expect(quandoPodeEscreverDepoimento(conta, amigo)?.toISOString()).toBe('2026-11-06T12:00:00.000Z')
  })
  it('com as duas datas iguais é essa data mais o prazo', () => {
    expect(quandoPodeDarSelo(T0, T0)?.getTime()).toBe(ms(T0) + 7 * DIA)
    expect(quandoPodeEscreverDepoimento(T0, T0)?.getTime()).toBe(ms(T0) + 3 * DIA)
  })
  it('sem uma das datas (relé 0.3) ou com data torta não promete data nenhuma', () => {
    expect(quandoPodeDarSelo(undefined, T0)).toBeNull()
    expect(quandoPodeDarSelo(T0, undefined)).toBeNull()
    expect(quandoPodeDarSelo(null, T0)).toBeNull()
    expect(quandoPodeDarSelo(T0, null)).toBeNull()
    expect(quandoPodeDarSelo('ontem', T0)).toBeNull()
    expect(quandoPodeDarSelo(T0, '')).toBeNull()
    expect(quandoPodeEscreverDepoimento(undefined, undefined)).toBeNull()
    expect(quandoPodeEscreverDepoimento(T0, 'ontem')).toBeNull()
  })
})

describe('jaPassou', () => {
  it('no instante exato já passou; um milissegundo antes ainda não; sem data não passou', () => {
    const q = new Date(ms(T0))
    expect(jaPassou(q, em(T0, -1))).toBe(false)
    expect(jaPassou(q, em(T0, 0))).toBe(true)
    expect(jaPassou(q, em(T0, 1))).toBe(true)
    expect(jaPassou(null, em(T0, 99 * DIA))).toBe(false)
  })
})

describe('faltaDeCarencia', () => {
  it('tópico e voto esperam 1 hora, contada da entrada', () => {
    expect(faltaDeCarencia(T0, 'topico', em(T0, 0))).toBe(3600)
    expect(faltaDeCarencia(T0, 'topico', em(T0, 1_000))).toBe(3599)
    expect(faltaDeCarencia(T0, 'topico', em(T0, 3_599_000))).toBe(1)
    expect(faltaDeCarencia(T0, 'topico', em(T0, 3_600_000))).toBe(0)
    expect(faltaDeCarencia(T0, 'topico', em(T0, 7_200_000))).toBe(0)
  })
  it('resposta espera 10 minutos', () => {
    expect(faltaDeCarencia(T0, 'resposta', em(T0, 0))).toBe(600)
    expect(faltaDeCarencia(T0, 'resposta', em(T0, 599_000))).toBe(1)
    expect(faltaDeCarencia(T0, 'resposta', em(T0, 600_000))).toBe(0)
  })
  it('fração de segundo não vira segundo a mais: arredonda para baixo o que passou', () => {
    expect(faltaDeCarencia(T0, 'resposta', em(T0, 599_999))).toBe(1)
    expect(faltaDeCarencia(T0, 'resposta', em(T0, 1_500))).toBe(599)
  })
  it('relógio atrasado (a entrada "no futuro") conta a espera inteira, nunca mais que ela', () => {
    expect(faltaDeCarencia(T0, 'topico', em(T0, -60_000))).toBe(3600)
    expect(faltaDeCarencia(T0, 'resposta', em(T0, -60_000))).toBe(600)
  })
  it('sem data ou com data torta não dá para saber: 0, e quem decide é o relé', () => {
    expect(faltaDeCarencia(undefined, 'topico', em(T0, 0))).toBe(0)
    expect(faltaDeCarencia(null, 'resposta', em(T0, 0))).toBe(0)
    expect(faltaDeCarencia('ontem', 'topico', em(T0, 0))).toBe(0)
  })
})

describe('membroHaSegundos', () => {
  it('segundos inteiros desde a entrada; no futuro vira 0; sem data é indefinido', () => {
    expect(membroHaSegundos(T0, em(T0, 90_999))).toBe(90)
    expect(membroHaSegundos(T0, em(T0, 0))).toBe(0)
    expect(membroHaSegundos(T0, em(T0, -5_000))).toBe(0)
    expect(membroHaSegundos(undefined, em(T0, 5_000))).toBeUndefined()
    expect(membroHaSegundos(null, em(T0, 5_000))).toBeUndefined()
    expect(membroHaSegundos('xx', em(T0, 5_000))).toBeUndefined()
  })
})

describe('minutosParaMostrar', () => {
  it('arredonda para cima e nunca mostra menos de 1 minuto', () => {
    expect(minutosParaMostrar(0)).toBe(1)
    expect(minutosParaMostrar(1)).toBe(1)
    expect(minutosParaMostrar(60)).toBe(1)
    expect(minutosParaMostrar(61)).toBe(2)
    expect(minutosParaMostrar(3600)).toBe(60)
    expect(minutosParaMostrar(3599)).toBe(60)
  })
})
