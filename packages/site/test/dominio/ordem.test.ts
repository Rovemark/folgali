import { describe, expect, it } from 'vitest'
import { janelaDaOrdem, ordemDaBusca, ordemDasRespostas, ordemDosTopicos } from '@/lib/dominio/ordem'

// A ordem vem da barra de endereço: lista fechada. O que não está na lista cai na ordem de sempre, e as ordens por pessoas só valem se o relé as declara.

describe('ordem dos tópicos', () => {
  it('as três de antes valem com ou sem o recurso', () => {
    for (const por of [true, false]) {
      expect(ordemDosTopicos('ativos', por)).toBe('ativos')
      expect(ordemDosTopicos('sem-resposta', por)).toBe('sem-resposta')
      expect(ordemDosTopicos('recentes', por)).toBe('recentes')
    }
  })
  it('melhores e em-alta só valem com o recurso; sem ele caem em recentes', () => {
    expect(ordemDosTopicos('melhores', true)).toBe('melhores')
    expect(ordemDosTopicos('em-alta', true)).toBe('em-alta')
    expect(ordemDosTopicos('melhores', false)).toBe('recentes')
    expect(ordemDosTopicos('em-alta', false)).toBe('recentes')
  })
  it('lixo, vazio e ausente caem em recentes', () => {
    for (const x of [undefined, '', 'MELHORES', 'melhores ', "'; drop", '__proto__', 'constructor', 'antigas', 'relevancia']) {
      expect(ordemDosTopicos(x, true)).toBe('recentes')
    }
  })
})

describe('ordem das respostas', () => {
  it('cronológica é o padrão; as por pessoas pedem o recurso', () => {
    expect(ordemDasRespostas(undefined, true)).toBe('antigas')
    expect(ordemDasRespostas('melhores', true)).toBe('melhores')
    expect(ordemDasRespostas('em-alta', true)).toBe('em-alta')
    expect(ordemDasRespostas('melhores', false)).toBe('antigas')
    expect(ordemDasRespostas('em-alta', false)).toBe('antigas')
  })
  it('só as duas por pessoas: recentes e ativos não são ofertas da tela de respostas', () => {
    for (const x of ['recentes', 'ativos', 'antigas', 'x', '']) expect(ordemDasRespostas(x, true)).toBe('antigas')
  })
})

describe('ordem da busca de tópicos', () => {
  it('relevância é o padrão; recentes, melhores e em-alta pedem o recurso', () => {
    expect(ordemDaBusca(undefined, true)).toBe('relevancia')
    expect(ordemDaBusca('relevancia', true)).toBe('relevancia')
    for (const o of ['recentes', 'melhores', 'em-alta'] as const) {
      expect(ordemDaBusca(o, true)).toBe(o)
      expect(ordemDaBusca(o, false)).toBe('relevancia')
    }
  })
  it('lixo cai em relevância', () => {
    for (const x of ['', 'ativos', 'sem-resposta', 'antigas', 'RECENTES']) expect(ordemDaBusca(x, true)).toBe('relevancia')
  })
})

describe('janela do em-alta', () => {
  it('só existe no em-alta, e só 7d vai para o endereço (24h é o padrão do relé)', () => {
    expect(janelaDaOrdem('em-alta', '7d')).toBe('7d')
    expect(janelaDaOrdem('em-alta', '24h')).toBeUndefined()
    expect(janelaDaOrdem('em-alta', undefined)).toBeUndefined()
    expect(janelaDaOrdem('em-alta', '30d')).toBeUndefined()
    for (const o of ['melhores', 'recentes', 'ativos', 'antigas', 'relevancia', 'sem-resposta']) expect(janelaDaOrdem(o, '7d')).toBeUndefined()
  })
})
