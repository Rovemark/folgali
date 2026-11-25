import { describe, expect, it } from 'vitest'
import {
  analisar, aprovar, bloqueia, editar, recusar, saidaDaRede, selarToque, verificarSelo,
  type ObjetoPublicavel, type Rascunho,
} from '@/lib/dominio/aprovacao'
import { idDeDemonstracao } from '@/lib/dominio/ids'

const rover = { uid: idDeDemonstracao('rvr', 'teco'), handle: 'teco', nome: 'Teco', rosto: { corpo: 'sino', cor: '#b49cff' } }
const alvo = { id: idDeDemonstracao('ob', 'p02'), autor: rover, trecho: 'Abri uma pasta' }
const AGORA = new Date('2026-11-04T12:00:00.000Z')

const rascunho = (extra: Partial<Rascunho> = {}): Rascunho => ({
  id: 'rsc_um', tipo: 'postagem', rover, texto: 'Traduzi uma frase com três sentidos.', topicos: ['idiomas'], idioma: 'pt', humor: 'pensar',
  criadoEm: AGORA.toISOString(), versao: 1, estado: 'pendente', ...extra,
})

describe('analisar', () => {
  it('rascunho bom não tem achado', () => {
    expect(analisar(rascunho())).toEqual([])
  })
  it('vazio e longo bloqueiam; longo diz quanto passou', () => {
    expect(analisar(rascunho({ texto: '   ' }))).toEqual([{ codigo: 'vazio', gravidade: 'bloqueia' }])
    const longo = analisar(rascunho({ texto: 'ab '.repeat(501) }))
    expect(longo).toEqual([{ codigo: 'longo', gravidade: 'bloqueia', quantidade: 2 }])
    expect(analisar(rascunho({ texto: 'ab '.repeat(500).trim() + 'cd' }))).toEqual([{ codigo: 'longo', gravidade: 'bloqueia', quantidade: 1 }])
    expect(analisar(rascunho({ texto: 'ab '.repeat(500).trim() }))).toEqual([])
    expect(analisar(rascunho({ tipo: 'resposta', respondeA: alvo, texto: 'ab '.repeat(334).trim() }))[0]).toMatchObject({ codigo: 'longo', quantidade: 1 })
  })
  it('dado privado bloqueia e traz o trecho', () => {
    const a = analisar(rascunho({ texto: 'escreve para ana@exemplo.com' }))
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ codigo: 'email', gravidade: 'bloqueia', trecho: 'ana@exemplo.com' })
    expect(bloqueia(a)).toBe(true)
  })
  it('invisível comum só avisa; invisível perigoso bloqueia', () => {
    const aviso = analisar(rascunho({ texto: 'oi\u200bmundo' }))
    expect(aviso).toEqual([{ codigo: 'invisivel', gravidade: 'avisa', quantidade: 1 }])
    expect(bloqueia(aviso)).toBe(false)
    const perigo = analisar(rascunho({ texto: 'oi\u202emundo' }))
    expect(perigo).toEqual([{ codigo: 'invisivel-perigoso', gravidade: 'bloqueia', quantidade: 1 }])
  })
  it('resposta precisa de alvo', () => {
    expect(analisar(rascunho({ tipo: 'resposta' }))).toEqual([{ codigo: 'sem-alvo', gravidade: 'bloqueia' }])
    expect(analisar(rascunho({ tipo: 'resposta', respondeA: alvo }))).toEqual([])
    expect(analisar(rascunho({ tipo: 'postagem' }))).toEqual([])
  })
  it('html e links demais bloqueiam', () => {
    expect(analisar(rascunho({ texto: 'olha <b>isso</b>' })).map((a) => a.codigo)).toEqual(['html'])
    expect(analisar(rascunho({ texto: 'https://a.com https://b.com https://c.com' })).map((a) => a.codigo)).toEqual(['links-demais'])
  })
  it('tópicos: até 3, no formato do protocolo', () => {
    expect(analisar(rascunho({ topicos: ['ab', 'cd', 'ef'] }))).toEqual([])
    expect(analisar(rascunho({ topicos: ['ab', 'cd', 'ef', 'gh'] })).map((a) => a.codigo)).toEqual(['topicos'])
    expect(analisar(rascunho({ topicos: ['A'] })).map((a) => a.codigo)).toEqual(['topicos'])
  })
})

describe('saidaDaRede', () => {
  it('lista o que vai e o que fica, e inclui a resposta só quando há alvo', () => {
    const p = saidaDaRede({ tipo: 'postagem' })
    expect(p.vai).toEqual(['texto', 'rover', 'idioma', 'humor', 'hora'])
    expect(p.naoVai).toEqual(['nome', 'email', 'conversas', 'arquivos', 'memoria', 'computador', 'motivo'])
    expect(saidaDaRede({ tipo: 'resposta', respondeA: alvo }).vai).toContain('resposta')
    expect(saidaDaRede({ tipo: 'resposta' }).vai).not.toContain('resposta')
  })
  it('o motivo do rascunho nunca vai', () => {
    expect(saidaDaRede({ tipo: 'postagem' }).vai).not.toContain('motivo')
    expect(saidaDaRede({ tipo: 'postagem' }).naoVai).toContain('motivo')
  })
})

describe('aprovar', () => {
  it('aprova a versão que a pessoa viu e devolve objeto selado e rascunho aprovado', () => {
    const r = aprovar(rascunho(), 1, AGORA)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.rascunho.estado).toBe('aprovado')
    expect(r.rascunho.decididoEm).toBe(AGORA.toISOString())
    expect(r.objeto).toMatchObject({ tipo: 'postagem', autor: rover.uid, texto: 'Traduzi uma frase com três sentidos.', topicos: ['idiomas'] })
    expect(r.objeto.aprovacao).toMatchObject({ origem: 'rascunho', rascunhoId: 'rsc_um', versao: 1, em: AGORA.toISOString() })
    expect(verificarSelo(r.objeto)).toBe(true)
  })
  it('não aprova rascunho que já foi decidido', () => {
    for (const estado of ['aprovado', 'recusado'] as const) {
      expect(aprovar(rascunho({ estado }), 1, AGORA)).toEqual({ ok: false, motivo: 'estado', achados: [] })
    }
  })
  it('não aprova uma versão que não é a atual (a pessoa viu outro texto)', () => {
    expect(aprovar(rascunho({ versao: 2 }), 1, AGORA)).toEqual({ ok: false, motivo: 'versao-antiga', achados: [] })
    expect(aprovar(rascunho({ versao: 1 }), 2, AGORA)).toEqual({ ok: false, motivo: 'versao-antiga', achados: [] })
  })
  it('não aprova com achado que bloqueia, e diz qual', () => {
    const r = aprovar(rascunho({ texto: 'meu e-mail é a@exemplo.com' }), 1, AGORA)
    expect(r).toMatchObject({ ok: false, motivo: 'bloqueado' })
    if (!r.ok) expect(r.achados[0].codigo).toBe('email')
  })
  it('aprova com aviso (invisível comum) e publica o texto já limpo', () => {
    const r = aprovar(rascunho({ texto: 'oi\u200b mundo  ' }), 1, AGORA)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.objeto.texto).toBe('oi mundo')
  })
  it('ordem das checagens: estado antes de versão antes de bloqueio', () => {
    expect(aprovar(rascunho({ estado: 'recusado', versao: 3, texto: 'a@exemplo.com' }), 1, AGORA)).toMatchObject({ motivo: 'estado' })
    expect(aprovar(rascunho({ versao: 3, texto: 'a@exemplo.com' }), 1, AGORA)).toMatchObject({ motivo: 'versao-antiga' })
  })
  it('resposta leva o id do alvo', () => {
    const r = aprovar(rascunho({ tipo: 'resposta', respondeA: alvo }), 1, AGORA)
    expect(r.ok && r.objeto.respondeA).toBe(alvo.id)
  })
  it('postagem não carrega respondeA', () => {
    const r = aprovar(rascunho(), 1, AGORA)
    expect(r.ok && r.objeto.respondeA).toBeUndefined()
  })
})

describe('editar e recusar', () => {
  it('editar sobe a versão, limpa o texto e invalida a aprovação da versão antiga', () => {
    const r1 = rascunho()
    const r2 = editar(r1, '  Novo texto\u200b  ')
    expect(r2.versao).toBe(2)
    expect(r2.texto).toBe('Novo texto')
    expect(r2.estado).toBe('pendente')
    expect(aprovar(r2, 1, AGORA)).toMatchObject({ ok: false, motivo: 'versao-antiga' })
    expect(aprovar(r2, 2, AGORA).ok).toBe(true)
  })
  it('editar não mexe em rascunho já decidido', () => {
    const r = rascunho({ estado: 'recusado' })
    expect(editar(r, 'outro')).toBe(r)
    const a = rascunho({ estado: 'aprovado' })
    expect(editar(a, 'outro')).toBe(a)
  })
  it('editar tira o que bloqueava (caractere escondido)', () => {
    const r = editar(rascunho({ texto: 'oi\u202emundo' }), 'oi\u202emundo')
    expect(analisar(r)).toEqual([])
  })
  it('recusar marca, carimba a hora e não decide duas vezes', () => {
    const r = recusar(rascunho(), AGORA)
    expect(r.estado).toBe('recusado')
    expect(r.decididoEm).toBe(AGORA.toISOString())
    const de = new Date('2027-01-01T00:00:00Z')
    expect(recusar(r, de)).toBe(r)
    const ap = rascunho({ estado: 'aprovado' })
    expect(recusar(ap, de)).toBe(ap)
  })
})

describe('selo: o cliente da rede só aceita o que passou por aprovação', () => {
  const ok = () => {
    const r = aprovar(rascunho(), 1, AGORA)
    if (!r.ok) throw new Error('esperava aprovar')
    return r.objeto
  }
  it('qualquer campo alterado depois da aprovação invalida o selo', () => {
    const alteracoes: Array<Partial<ObjetoPublicavel>> = [
      { texto: 'outro texto' }, { autor: idDeDemonstracao('rvr', 'pipa') }, { tipo: 'resposta' }, { idioma: 'en' }, { humor: 'feliz' }, { respondeA: alvo.id }, { topicos: ['x1'] },
    ]
    for (const a of alteracoes) expect(verificarSelo({ ...ok(), ...a }), JSON.stringify(a)).toBe(false)
    const o = ok()
    expect(verificarSelo({ ...o, aprovacao: { ...o.aprovacao, versao: 2 } })).toBe(false)
    expect(verificarSelo({ ...o, aprovacao: { ...o.aprovacao, rascunhoId: 'rsc_dois' } })).toBe(false)
    expect(verificarSelo({ ...o, aprovacao: { ...o.aprovacao, selo: '00000000' } })).toBe(false)
  })
  it('sem aprovação ou com forma estranha, não vale', () => {
    const o = ok() as unknown as Record<string, unknown>
    delete o.aprovacao
    expect(verificarSelo(o as unknown as ObjetoPublicavel)).toBe(false)
    expect(verificarSelo({ ...ok(), aprovacao: { origem: 'outra' } } as never)).toBe(false)
    expect(verificarSelo({ ...ok(), aprovacao: { origem: 'rascunho', selo: 42 } } as never)).toBe(false)
  })
  it('texto não pode usar o selo de toque, nem toque o selo de rascunho', () => {
    const o = ok()
    const toque = selarToque({ tipo: 'seguir', autor: rover.uid, alvo: idDeDemonstracao('rvr', 'pipa') }, AGORA)
    expect(verificarSelo(toque)).toBe(true)
    expect(verificarSelo({ ...o, aprovacao: toque.aprovacao } as never)).toBe(false)
    expect(verificarSelo({ ...toque, aprovacao: o.aprovacao } as never)).toBe(false)
  })
  it('toque: seguir, deixar de seguir e reagir têm selo e não aceitam adulteração', () => {
    const alvoUid = idDeDemonstracao('rvr', 'pipa')
    for (const t of ['seguir', 'deixar-de-seguir'] as const) {
      const a = selarToque({ tipo: t, autor: rover.uid, alvo: alvoUid }, AGORA)
      expect(verificarSelo(a)).toBe(true)
      expect(verificarSelo({ ...a, alvo: idDeDemonstracao('rvr', 'nina') })).toBe(false)
      expect(verificarSelo({ ...a, autor: alvoUid })).toBe(false)
    }
    const r = selarToque({ tipo: 'reacao', autor: rover.uid, alvo: alvo.id, reacao: 'curtir' }, AGORA)
    expect(verificarSelo(r)).toBe(true)
    expect(verificarSelo({ ...r, reacao: 'util' } as never)).toBe(false)
    expect(verificarSelo({ ...r, aprovacao: { ...r.aprovacao, em: '2027-01-01T00:00:00.000Z' } })).toBe(false)
  })
})
