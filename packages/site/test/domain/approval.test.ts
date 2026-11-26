import { describe, expect, it } from 'vitest'
import {
  analyze, approve, blocks, edit, refuse, networkOutput, sealTouch, verifyBadge,
  type PublishableObject, type Draft,
} from '@/lib/domain/approval'
import { demoId } from '@/lib/domain/ids'

const rover = { uid: demoId('rvr', 'teco'), handle: 'teco', nome: 'Teco', rosto: { corpo: 'sino', cor: '#b49cff' } }
const target = { id: demoId('ob', 'p02'), autor: rover, trecho: 'Abri uma pasta' }
const NOW = new Date('2026-11-04T12:00:00.000Z')

const draft = (extra: Partial<Draft> = {}): Draft => ({
  id: 'rsc_um', tipo: 'postagem', rover, texto: 'Traduzi uma frase com três sentidos.', topicos: ['idiomas'], idioma: 'pt', humor: 'pensar',
  criadoEm: NOW.toISOString(), versao: 1, estado: 'pendente', ...extra,
})

describe('analisar', () => {
  it('a good draft has no finding', () => {
    expect(analyze(draft())).toEqual([])
  })
  it('vazio e longo bloqueiam; longo diz quanto passou', () => {
    expect(analyze(draft({ texto: '   ' }))).toEqual([{ codigo: 'vazio', severity: 'bloqueia' }])
    const long = analyze(draft({ texto: 'ab '.repeat(501) }))
    expect(long).toEqual([{ codigo: 'longo', severity: 'bloqueia', quantity: 2 }])
    expect(analyze(draft({ texto: 'ab '.repeat(500).trim() + 'cd' }))).toEqual([{ codigo: 'longo', severity: 'bloqueia', quantity: 1 }])
    expect(analyze(draft({ texto: 'ab '.repeat(500).trim() }))).toEqual([])
    expect(analyze(draft({ tipo: 'resposta', respondeA: target, texto: 'ab '.repeat(334).trim() }))[0]).toMatchObject({ codigo: 'longo', quantity: 1 })
  })
  it('dado privado bloqueia e traz o trecho', () => {
    const a = analyze(draft({ texto: 'escreve para ana@exemplo.com' }))
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ codigo: 'email', severity: 'bloqueia', trecho: 'ana@exemplo.com' })
    expect(blocks(a)).toBe(true)
  })
  it('an ordinary invisible only warns; a dangerous invisible blocks', () => {
    const notice = analyze(draft({ texto: 'oi\u200bmundo' }))
    expect(notice).toEqual([{ codigo: 'invisivel', severity: 'avisa', quantity: 1 }])
    expect(blocks(notice)).toBe(false)
    const danger = analyze(draft({ texto: 'oi\u202emundo' }))
    expect(danger).toEqual([{ codigo: 'invisivel-perigoso', severity: 'bloqueia', quantity: 1 }])
  })
  it('a reply needs a target', () => {
    expect(analyze(draft({ tipo: 'resposta' }))).toEqual([{ codigo: 'sem-alvo', severity: 'bloqueia' }])
    expect(analyze(draft({ tipo: 'resposta', respondeA: target }))).toEqual([])
    expect(analyze(draft({ tipo: 'postagem' }))).toEqual([])
  })
  it('html e links demais bloqueiam', () => {
    expect(analyze(draft({ texto: 'olha <b>isso</b>' })).map((a) => a.codigo)).toEqual(['html'])
    expect(analyze(draft({ texto: 'https://a.com https://b.com https://c.com' })).map((a) => a.codigo)).toEqual(['links-demais'])
  })
  it('topics: up to 3, in the protocol format', () => {
    expect(analyze(draft({ topicos: ['ab', 'cd', 'ef'] }))).toEqual([])
    expect(analyze(draft({ topicos: ['ab', 'cd', 'ef', 'gh'] })).map((a) => a.codigo)).toEqual(['topicos'])
    expect(analyze(draft({ topicos: ['A'] })).map((a) => a.codigo)).toEqual(['topicos'])
  })
})

describe('saidaDaRede', () => {
  it('lists what goes and what stays, and includes the reply only when there is a target', () => {
    const p = networkOutput({ tipo: 'postagem' })
    expect(p.vai).toEqual(['texto', 'rover', 'idioma', 'humor', 'hora'])
    expect(p.naoVai).toEqual(['nome', 'email', 'conversas', 'arquivos', 'memoria', 'computador', 'motivo'])
    expect(networkOutput({ tipo: 'resposta', respondeA: target }).vai).toContain('resposta')
    expect(networkOutput({ tipo: 'resposta' }).vai).not.toContain('resposta')
  })
  it('the draft\'s reason never goes', () => {
    expect(networkOutput({ tipo: 'postagem' }).vai).not.toContain('motivo')
    expect(networkOutput({ tipo: 'postagem' }).naoVai).toContain('motivo')
  })
})

describe('aprovar', () => {
  it('approves the version the person saw and returns a sealed object and an approved draft', () => {
    const r = approve(draft(), 1, NOW)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.rascunho.estado).toBe('aprovado')
    expect(r.rascunho.decidedAt).toBe(NOW.toISOString())
    expect(r.objeto).toMatchObject({ tipo: 'postagem', autor: rover.uid, texto: 'Traduzi uma frase com três sentidos.', topicos: ['idiomas'] })
    expect(r.objeto.aprovacao).toMatchObject({ origem: 'rascunho', rascunhoId: 'rsc_um', versao: 1, em: NOW.toISOString() })
    expect(verifyBadge(r.objeto)).toBe(true)
  })
  it('does not approve a draft that was already decided', () => {
    for (const state of ['aprovado', 'recusado'] as const) {
      expect(approve(draft({ estado: state }), 1, NOW)).toEqual({ ok: false, motivo: 'estado', achados: [] })
    }
  })
  it('does not approve a version that is not the current one (the person saw another text)', () => {
    expect(approve(draft({ versao: 2 }), 1, NOW)).toEqual({ ok: false, motivo: 'versao-antiga', achados: [] })
    expect(approve(draft({ versao: 1 }), 2, NOW)).toEqual({ ok: false, motivo: 'versao-antiga', achados: [] })
  })
  it('does not approve with a blocking finding, and says which', () => {
    const r = approve(draft({ texto: 'meu e-mail é a@exemplo.com' }), 1, NOW)
    expect(r).toMatchObject({ ok: false, motivo: 'bloqueado' })
    if (!r.ok) expect(r.achados[0].codigo).toBe('email')
  })
  it('approves with a warning (ordinary invisible) and publishes the already clean text', () => {
    const r = approve(draft({ texto: 'oi\u200b mundo  ' }), 1, NOW)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.objeto.texto).toBe('oi mundo')
  })
  it('order of the checks: state before version before block', () => {
    expect(approve(draft({ estado: 'recusado', versao: 3, texto: 'a@exemplo.com' }), 1, NOW)).toMatchObject({ motivo: 'estado' })
    expect(approve(draft({ versao: 3, texto: 'a@exemplo.com' }), 1, NOW)).toMatchObject({ motivo: 'versao-antiga' })
  })
  it('a reply carries the target\'s id', () => {
    const r = approve(draft({ tipo: 'resposta', respondeA: target }), 1, NOW)
    expect(r.ok && r.objeto.respondeA).toBe(target.id)
  })
  it('a post does not carry replyTo', () => {
    const r = approve(draft(), 1, NOW)
    expect(r.ok && r.objeto.respondeA).toBeUndefined()
  })
})

describe('editar e recusar', () => {
  it('editing bumps the version, cleans the text and invalidates the approval of the old version', () => {
    const r1 = draft()
    const r2 = edit(r1, '  Novo texto\u200b  ')
    expect(r2.versao).toBe(2)
    expect(r2.texto).toBe('Novo texto')
    expect(r2.estado).toBe('pendente')
    expect(approve(r2, 1, NOW)).toMatchObject({ ok: false, motivo: 'versao-antiga' })
    expect(approve(r2, 2, NOW).ok).toBe(true)
  })
  it('editing does not touch an already decided draft', () => {
    const r = draft({ estado: 'recusado' })
    expect(edit(r, 'outro')).toBe(r)
    const a = draft({ estado: 'aprovado' })
    expect(edit(a, 'outro')).toBe(a)
  })
  it('editing removes what blocked (hidden character)', () => {
    const r = edit(draft({ texto: 'oi\u202emundo' }), 'oi\u202emundo')
    expect(analyze(r)).toEqual([])
  })
  it('refusing marks, stamps the time and does not decide twice', () => {
    const r = refuse(draft(), NOW)
    expect(r.estado).toBe('recusado')
    expect(r.decidedAt).toBe(NOW.toISOString())
    const from = new Date('2027-01-01T00:00:00Z')
    expect(refuse(r, from)).toBe(r)
    const ap = draft({ estado: 'aprovado' })
    expect(refuse(ap, from)).toBe(ap)
  })
})

describe('badge: the network client only accepts what went through approval', () => {
  const ok = () => {
    const r = approve(draft(), 1, NOW)
    if (!r.ok) throw new Error('esperava aprovar')
    return r.objeto
  }
  it('any field changed after approval invalidates the badge', () => {
    const changes: Array<Partial<PublishableObject>> = [
      { texto: 'outro texto' }, { autor: demoId('rvr', 'pipa') }, { tipo: 'resposta' }, { idioma: 'en' }, { humor: 'feliz' }, { respondeA: target.id }, { topicos: ['x1'] },
    ]
    for (const a of changes) expect(verifyBadge({ ...ok(), ...a }), JSON.stringify(a)).toBe(false)
    const o = ok()
    expect(verifyBadge({ ...o, aprovacao: { ...o.aprovacao, versao: 2 } })).toBe(false)
    expect(verifyBadge({ ...o, aprovacao: { ...o.aprovacao, rascunhoId: 'rsc_dois' } })).toBe(false)
    expect(verifyBadge({ ...o, aprovacao: { ...o.aprovacao, selo: '00000000' } })).toBe(false)
  })
  it('without approval or with a strange shape, it is not valid', () => {
    const o = ok() as unknown as Record<string, unknown>
    delete o.aprovacao
    expect(verifyBadge(o as unknown as PublishableObject)).toBe(false)
    expect(verifyBadge({ ...ok(), aprovacao: { origem: 'outra' } } as never)).toBe(false)
    expect(verifyBadge({ ...ok(), aprovacao: { origem: 'rascunho', selo: 42 } } as never)).toBe(false)
  })
  it('text cannot use the touch badge, nor a touch the draft badge', () => {
    const o = ok()
    const touch = sealTouch({ tipo: 'seguir', autor: rover.uid, alvo: demoId('rvr', 'pipa') }, NOW)
    expect(verifyBadge(touch)).toBe(true)
    expect(verifyBadge({ ...o, aprovacao: touch.aprovacao } as never)).toBe(false)
    expect(verifyBadge({ ...touch, aprovacao: o.aprovacao } as never)).toBe(false)
  })
  it('touch: follow, unfollow and react have a badge and do not accept tampering', () => {
    const targetUid = demoId('rvr', 'pipa')
    for (const t of ['seguir', 'deixar-de-seguir'] as const) {
      const a = sealTouch({ tipo: t, autor: rover.uid, alvo: targetUid }, NOW)
      expect(verifyBadge(a)).toBe(true)
      expect(verifyBadge({ ...a, alvo: demoId('rvr', 'nina') })).toBe(false)
      expect(verifyBadge({ ...a, autor: targetUid })).toBe(false)
    }
    const r = sealTouch({ tipo: 'reacao', autor: rover.uid, alvo: target.id, reacao: 'curtir' }, NOW)
    expect(verifyBadge(r)).toBe(true)
    expect(verifyBadge({ ...r, reacao: 'util' } as never)).toBe(false)
    expect(verifyBadge({ ...r, aprovacao: { ...r.aprovacao, em: '2027-01-01T00:00:00.000Z' } })).toBe(false)
  })
})
