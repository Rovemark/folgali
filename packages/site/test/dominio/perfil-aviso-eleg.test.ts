import { describe, expect, it } from 'vitest'
import { acaoDoAviso, destinoDoAviso, ehNovo } from '@/lib/dominio/aviso'
import { elegibilidade, podeDarSelo } from '@/components/perfil/elegibilidade'
import { TIPOS_DE_NOTIFICACAO } from '@/lib/social/tipos'
import type { PaginaDoRover } from '@/lib/social/tipos'

const base = { objeto: 'ob_x', comunidade: null, pagina: null, origem: { uid: 'rvr_a', handle: 'pipa', nome: 'Pipa', rosto: { corpo: 'seixo', cor: '#fff' } } }

describe('destinoDoAviso', () => {
  it('cada tipo leva ao lugar certo', () => {
    expect(destinoDoAviso({ ...base, tipo: 'recado' }, 'lumi')).toEqual({ href: '/r/lumi?aba=mural', indisponivel: false })
    expect(destinoDoAviso({ ...base, tipo: 'depoimento-para-aceitar' }, 'lumi').href).toBe('/r/lumi?aba=depoimentos')
    expect(destinoDoAviso({ ...base, tipo: 'depoimento-aceito' }, 'lumi').href).toBe('/r/pipa?aba=depoimentos')
    expect(destinoDoAviso({ ...base, tipo: 'amizade-aceita' }, 'lumi').href).toBe('/r/pipa')
    expect(destinoDoAviso({ ...base, tipo: 'pedido-de-amizade' }, 'lumi').href).toBe('/amigos')
    expect(destinoDoAviso({ ...base, tipo: 'resposta-no-topico' }, 'lumi').href).toBe('/t/ob_x')
    expect(destinoDoAviso({ ...base, tipo: 'convite-comunidade', comunidade: 'ob_c' }, 'lumi').href).toBe('/comunidades/ob_c')
    expect(destinoDoAviso({ ...base, tipo: 'novo-seguidor', pagina: 'ob_g' }, 'lumi').href).toBe('/paginas/ob_g')
    // 0.4.0: os dois avisos de conversa levam às mensagens, com ou sem objeto (o relé manda sempre sem), e sem ação ali mesmo
    for (const tipo of ['conversa-pedido', 'conversa-aceita'] as const) {
      expect(destinoDoAviso({ ...base, tipo }, 'lumi')).toEqual({ href: '/mensagens', indisponivel: false })
      expect(destinoDoAviso({ ...base, tipo, objeto: null, origem: null }, 'lumi')).toEqual({ href: '/mensagens', indisponivel: false })
      expect(acaoDoAviso({ ...base, tipo })).toBeNull()
    }
  })
  it('quando o ponteiro veio nulo o aviso diz que não está mais disponível', () => {
    for (const tipo of ['resposta-no-topico', 'resposta-a-voce', 'citacao', 'mencao', 'resolveu'] as const) {
      expect(destinoDoAviso({ ...base, tipo, objeto: null }, 'lumi')).toEqual({ href: null, indisponivel: true })
    }
    expect(destinoDoAviso({ ...base, tipo: 'banido', comunidade: null }, 'lumi')).toEqual({ href: null, indisponivel: true })
    expect(destinoDoAviso({ ...base, tipo: 'amizade-aceita', origem: null }, 'lumi').indisponivel).toBe(true)
  })
  it('todos os tipos do protocolo têm um destino definido (nenhum lança)', () => {
    for (const tipo of TIPOS_DE_NOTIFICACAO) expect(() => destinoDoAviso({ ...base, tipo }, 'lumi')).not.toThrow()
  })
  it('só pedido de amizade e convite têm ação ali mesmo, e só com os ponteiros', () => {
    expect(acaoDoAviso({ ...base, tipo: 'pedido-de-amizade' })).toBe('amizade')
    expect(acaoDoAviso({ ...base, tipo: 'pedido-de-amizade', origem: null })).toBeNull()
    expect(acaoDoAviso({ ...base, tipo: 'convite-comunidade', comunidade: 'ob_c' })).toBe('convite')
    expect(acaoDoAviso({ ...base, tipo: 'convite-comunidade', comunidade: null })).toBeNull()
    expect(acaoDoAviso({ ...base, tipo: 'recado' })).toBeNull()
  })
  it('novo é só o que tem número maior que o último visto', () => {
    expect(ehNovo({ seq: 6 }, 5)).toBe(true)
    expect(ehNovo({ seq: 5 }, 5)).toBe(false)
  })
})

const pag = (voce: PaginaDoRover['voce'], recados: 'todos' | 'amigos' | 'ninguem' = 'todos'): PaginaDoRover =>
  ({ rover: { recados } as never, selos: { confiavel: 0, caprichoso: 0, rapido: 0, divertido: 0 }, contagens: {} as never, voce })
const voce = { amigo: true, pedidoEnviado: false, pedidoRecebido: false, euBloqueei: false, euSilenciei: false, papel: null }

describe('elegibilidade e podeDarSelo', () => {
  it('amigo de 7 dias com conta de 7 dias pode dar selo e escrever depoimento', () => {
    const e = elegibilidade(pag(voce), 7, 7)
    expect(e.selo.ok && e.depoimento.ok).toBe(true)
    expect(podeDarSelo(pag(voce), e, true)).toBe('sim')
  })
  it('amigo novo: depoimento sim (3 dias), selo não (conta-nova → "sem-tempo")', () => {
    const e = elegibilidade(pag(voce), 4, 30)
    expect(e.depoimento.ok).toBe(true)
    expect(podeDarSelo(pag(voce), e, true)).toBe('sem-tempo')
  })
  it('quem não é amigo recebe a razão "nao-amigo"; sem app, dono da página e bloqueio nunca mostram o botão', () => {
    expect(podeDarSelo(pag({ ...voce, amigo: false }), elegibilidade(pag({ ...voce, amigo: false }), 0, 30), true)).toBe('nao-amigo')
    expect(podeDarSelo(pag(voce), elegibilidade(pag(voce), 9, 9), false)).toBe('ninguem')
    expect(podeDarSelo(pag({ ...voce, papel: 'proprio' }), elegibilidade(pag({ ...voce, papel: 'proprio' }), 9, 9), true)).toBe('ninguem')
    expect(podeDarSelo(pag({ ...voce, euBloqueei: true }), elegibilidade(pag({ ...voce, euBloqueei: true }), 9, 9), true)).toBe('ninguem')
  })
  it('recado respeita a regra do mural: ninguém, só amigos e bloqueio dão a mesma recusa', () => {
    expect(elegibilidade(pag({ ...voce, amigo: false }, 'amigos'), 0, 30).recado).toEqual({ ok: false, motivo: 'interacao-nao-permitida' })
    expect(elegibilidade(pag(voce, 'ninguem'), 9, 30).recado).toEqual({ ok: false, motivo: 'interacao-nao-permitida' })
    expect(elegibilidade(pag({ ...voce, euBloqueei: true }, 'todos'), 9, 30).recado).toEqual({ ok: false, motivo: 'interacao-nao-permitida' })
    expect(elegibilidade(pag(voce, 'amigos'), 9, 30).recado.ok).toBe(true)
  })
})
