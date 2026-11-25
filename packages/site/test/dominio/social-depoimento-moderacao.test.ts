import { describe, expect, it } from 'vitest'
import { DIAS_DE_ESPERA_APOS_RECUSA, MAX_PENDENTES, aplicarDecisao, podeEscreverOutro, visivelPara } from '@/lib/dominio/depoimento'
import {
  JANELA_DE_APELACAO_DIAS, diasRestantesParaApelar, exigeMotivo, motivoPrincipal, ordenarFila, podeApelar, quemDecideApelacao, validarGestao, type AcaoDeGestao,
} from '@/lib/dominio/moderacao'
import type { DenunciaNaFila } from '@/lib/social/tipos'

const DIA = 86_400_000

describe('depoimento: o ciclo (seção 4.4)', () => {
  it('aceitar só vale para um pendente', () => {
    expect(aplicarDecisao('pendente', 'aceitar')).toBe('aceito')
    expect(aplicarDecisao('aceito', 'aceitar')).toBeNull()
    expect(aplicarDecisao('recusado', 'aceitar')).toBeNull()
  })
  it('recusar vale para pendente e para aceito (esconder depois); recusado não volta', () => {
    expect(aplicarDecisao('pendente', 'recusar')).toBe('recusado')
    expect(aplicarDecisao('aceito', 'recusar')).toBe('recusado')
    expect(aplicarDecisao('recusado', 'recusar')).toBeNull()
  })
  const dep = (estado: 'pendente' | 'aceito' | 'recusado') => ({ estado, alvo: 'rvr_dono', autor: { uid: 'rvr_autor' } })
  it('aceito é de todos, inclusive de quem não está identificado', () => {
    expect(visivelPara(dep('aceito'), null)).toBe(true)
    expect(visivelPara(dep('aceito'), 'rvr_qualquer')).toBe(true)
  })
  it('pendente NUNCA é público: só o dono e o autor leem', () => {
    expect(visivelPara(dep('pendente'), null)).toBe(false)
    expect(visivelPara(dep('pendente'), 'rvr_qualquer')).toBe(false)
    expect(visivelPara(dep('pendente'), 'rvr_dono')).toBe(true)
    expect(visivelPara(dep('pendente'), 'rvr_autor')).toBe(true)
  })
  it('recusado não aparece para ninguém, nem para o dono nem para o autor', () => {
    for (const quem of [null, 'rvr_dono', 'rvr_autor', 'rvr_qualquer']) expect(visivelPara(dep('recusado'), quem)).toBe(false)
  })
  describe('quem pode escrever outro', () => {
    const t0 = Date.parse('2026-11-05T12:00:00Z')
    const velho = (estado: 'pendente' | 'aceito' | 'recusado') => [{ estado, criadoEm: '2026-10-01T00:00:00Z' }]
    it('um depoimento vivo por par: pendente ou aceito bloqueiam', () => {
      expect(podeEscreverOutro(velho('pendente'), 0, t0)).toEqual({ ok: false, motivo: 'ja-existe' })
      expect(podeEscreverOutro(velho('aceito'), 0, t0)).toEqual({ ok: false, motivo: 'ja-existe' })
      expect(podeEscreverOutro(velho('recusado'), 0, t0)).toEqual({ ok: true })
      expect(podeEscreverOutro([], 0, t0)).toEqual({ ok: true })
    })
    it('depois de recusado, 7 dias de espera, contados ao instante', () => {
      expect(DIAS_DE_ESPERA_APOS_RECUSA).toBe(7)
      expect(podeEscreverOutro(velho('recusado'), 0, t0, t0 - 7 * DIA + 1)).toEqual({ ok: false, motivo: 'espera' })
      expect(podeEscreverOutro(velho('recusado'), 0, t0, t0 - 7 * DIA)).toEqual({ ok: true })
      expect(podeEscreverOutro([], 0, t0, t0 - 1000)).toEqual({ ok: false, motivo: 'espera' })
    })
    it('o dono tem no máximo 20 pendentes', () => {
      expect(MAX_PENDENTES).toBe(20)
      expect(podeEscreverOutro([], 19, t0)).toEqual({ ok: true })
      expect(podeEscreverOutro([], 20, t0)).toEqual({ ok: false, motivo: 'limite-de-estrutura' })
    })
    it('a ordem: já existe, depois espera, depois limite', () => {
      expect(podeEscreverOutro(velho('pendente'), 20, t0, t0)).toEqual({ ok: false, motivo: 'ja-existe' })
      expect(podeEscreverOutro([], 20, t0, t0)).toEqual({ ok: false, motivo: 'espera' })
    })
  })
})

describe('moderação: motivo, apelação e fila (seção 10)', () => {
  const TODAS: AcaoDeGestao[] = ['convidar', 'cancelar-convite', 'aprovar-pedido', 'recusar-pedido', 'expulsar', 'banir', 'desbanir', 'promover', 'rebaixar']
  it('só expulsar e banir exigem motivo', () => {
    for (const a of TODAS) expect(exigeMotivo(a)).toBe(a === 'expulsar' || a === 'banir')
  })
  it('motivo obrigatório ao expulsar e ao banir; proibido nas demais; do enum', () => {
    for (const a of ['expulsar', 'banir'] as const) {
      expect(validarGestao(a, null)).toBe('motivo-obrigatorio')
      expect(validarGestao(a, 'spam')).toBeNull()
      expect(validarGestao(a, 'dados-pessoais')).toBeNull()
      expect(validarGestao(a, 'inventado' as never)).toBe('motivo-invalido')
    }
    for (const a of TODAS.filter((x) => x !== 'expulsar' && x !== 'banir')) {
      expect(validarGestao(a, null)).toBeNull()
      expect(validarGestao(a, 'spam')).toBe('motivo-proibido')
    }
  })
  it('apelação: 14 dias, no instante exato ainda vale, 1 ms depois não, e o futuro não vale', () => {
    expect(JANELA_DE_APELACAO_DIAS).toBe(14)
    const agora = new Date('2026-11-20T00:00:00Z')
    const em = (ms: number) => new Date(agora.getTime() - ms).toISOString()
    expect(podeApelar(em(0), agora)).toBe(true)
    expect(podeApelar(em(14 * DIA), agora)).toBe(true)
    expect(podeApelar(em(14 * DIA + 1), agora)).toBe(false)
    expect(podeApelar(em(-1), agora)).toBe(false)
  })
  it('dias restantes para apelar', () => {
    const agora = new Date('2026-11-20T00:00:00Z')
    const em = (ms: number) => new Date(agora.getTime() - ms).toISOString()
    expect(diasRestantesParaApelar(em(0), agora)).toBe(14)
    expect(diasRestantesParaApelar(em(5 * DIA), agora)).toBe(9)
    expect(diasRestantesParaApelar(em(5 * DIA + 1), agora)).toBe(9)
    expect(diasRestantesParaApelar(em(14 * DIA), agora)).toBe(0)
    expect(diasRestantesParaApelar(em(30 * DIA), agora)).toBe(0)
  })
  it('quem decide a apelação: o dono, se quem agiu foi moderador; a administração do relé nos outros casos', () => {
    expect(quemDecideApelacao('moderador')).toBe('dono')
    expect(quemDecideApelacao('dono')).toBe('rele')
    expect(quemDecideApelacao('administrador')).toBe('rele')
    expect(quemDecideApelacao('rele')).toBe('rele')
  })

  const den = (alvo: string, peso: number, ultimaEm: string, total = 1): DenunciaNaFila => ({ alvo, alvoTipo: 'topico', motivos: { spam: total }, total, primeiraEm: '2026-11-01T00:00:00Z', ultimaEm, peso })
  it('a fila ordena por peso, depois pelo mais recente, depois pelo alvo, sem mexer na entrada', () => {
    const entrada = [den('b', 1, '2026-11-03T00:00:00Z'), den('a', 5, '2026-11-01T00:00:00Z'), den('c', 1, '2026-11-04T00:00:00Z'), den('d', 1, '2026-11-04T00:00:00Z')]
    const copia = structuredClone(entrada)
    expect(ordenarFila(entrada).map((x) => x.alvo)).toEqual(['a', 'c', 'd', 'b'])
    expect(entrada).toEqual(copia)
  })
  it('empate de peso: o mais recente primeiro; empate de data: ordem do alvo, qualquer que seja a ordem de entrada', () => {
    const antigo = den('a', 2, '2026-11-01T00:00:00Z')
    const novo = den('z', 2, '2026-11-09T00:00:00Z')
    expect(ordenarFila([antigo, novo]).map((x) => x.alvo)).toEqual(['z', 'a'])
    expect(ordenarFila([novo, antigo]).map((x) => x.alvo)).toEqual(['z', 'a'])
    const c = den('c', 2, '2026-11-04T00:00:00Z')
    const d = den('d', 2, '2026-11-04T00:00:00Z')
    expect(ordenarFila([d, c]).map((x) => x.alvo)).toEqual(['c', 'd'])
    expect(ordenarFila([c, d]).map((x) => x.alvo)).toEqual(['c', 'd'])
  })
  it('NENHUMA quantidade de denúncias esconde ou remove: o peso só ordena e a fila devolve todos', () => {
    const muitas = Array.from({ length: 100 }, (_, i) => den(`x${i}`, i % 7, '2026-11-04T00:00:00Z', 10_000))
    const saida = ordenarFila(muitas)
    expect(saida).toHaveLength(100)
    expect(new Set(saida.map((x) => x.alvo)).size).toBe(100)
    expect(saida.every((x) => x.total === 10_000)).toBe(true)
    expect(ordenarFila([den('so', 0, '2026-11-01T00:00:00Z', 1)])).toHaveLength(1)
    expect(ordenarFila([])).toEqual([])
  })
  it('motivo principal: o mais citado; empate fica com o primeiro; vazio é nulo', () => {
    expect(motivoPrincipal({ motivos: { spam: 2, assedio: 5, golpe: 1 } })).toBe('assedio')
    expect(motivoPrincipal({ motivos: { spam: 3, assedio: 3 } })).toBe('spam')
    expect(motivoPrincipal({ motivos: {} })).toBeNull()
    expect(motivoPrincipal({ motivos: { spam: 0 } })).toBeNull()
    expect(motivoPrincipal({ motivos: { spam: undefined, golpe: 1 } })).toBe('golpe')
  })
})
