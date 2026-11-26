// 0.6.0: the demo client answers for the open issuer the way the real one does (the contract is in http-agents-relay.test.ts), and the
// sanitizer for the badge and the outside-agent data lets nothing through beyond the contract.

import { describe, expect, it } from 'vitest'
import { FakeClient } from '@/lib/fake-client'
import { TIME_OFF_ADJUST, DEFAULT_TIME_OFF } from '@/lib/join/limits'
import { OUTSIDE_AGENTS } from '@/lib/folgali/demo'
import { demoId } from '@/lib/domain/ids'
import { outsideAgent, agentsInfo, socialProfile, agentBadge } from '@/lib/social/sanitize-social'

const UID = demoId('rvr', 'pipa')
const base = { uid: UID, handle: 'pipa', nome: 'Pipa', descricao: '', retrato: { corpo: 'bolinha', cor: 'ceu', veste: 'fone', acessorio: 'cachecol' }, seguindo: 0, seguidores: 0 }

describe('fake client: the demo\'s open issuer', () => {
  it('each outside agent in the demo has a platform, time off and a verified owner, and never the owner', async () => {
    const c = new FakeClient()
    for (const a of Object.values(OUTSIDE_AGENTS)) {
      const r = await c.outsideAgent(a.uid)
      expect(r).toMatchObject({ uid: a.uid, handle: a.handle, nome: a.nome, plataforma: a.origem, folga: a.folga, donoVerificado: true })
      expect(Object.keys(r ?? {}).sort()).toEqual(['desde', 'donoVerificado', 'folga', 'handle', 'nome', 'plataforma', 'uid'])
    }
    expect(await c.outsideAgent(UID)).toBeNull()
  })
  it('the default limit is the one from the time-off package', async () => {
    const info = await new FakeClient().agentsInfo()
    expect(info.padrao).toEqual(DEFAULT_TIME_OFF)
    expect(info.ajuste).toEqual(TIME_OFF_ADJUST)
    expect(info.pecas.veste).not.toContain('touca')
  })
})

describe('outside-agent sanitizer', () => {
  it('the profile badge: only outside === true counts; the rest of the object is ignored', () => {
    expect(agentBadge({ deFora: true, donoVerificado: true, plataforma: 'Claude', dono: 'x' })).toEqual({ deFora: true, donoVerificado: true })
    expect(agentBadge({ deFora: true })).toEqual({ deFora: true, donoVerificado: false })
    for (const crooked of [undefined, null, 'sim', [], { deFora: 'true' }, { deFora: 1 }]) expect(agentBadge(crooked)).toBeUndefined()
    expect(socialProfile({ ...base, agente: { deFora: true, donoVerificado: true } }).agente).toEqual({ deFora: true, donoVerificado: true })
    expect('agente' in socialProfile({ ...base, agente: { deFora: 'talvez' } })).toBe(false)
    expect('agente' in socialProfile(base)).toBe(false)
  })
  it('issuer data: platform is short text without markup, time off is only released or paused, owner is never read', () => {
    const ok = { uid: UID, handle: 'pipa', nome: 'Pipa', plataforma: '  <b>Claude</b>  ', deFora: true, donoVerificado: true, folga: 'pausada', desde: 1900000000, dono: 'segredo' }
    const a = outsideAgent(ok)
    expect(a).toEqual({ uid: UID, handle: 'pipa', nome: 'Pipa', plataforma: 'bClaude/b', folga: 'pausada', donoVerificado: true, desde: new Date(1900000000 * 1000).toISOString() })
    expect(outsideAgent({ ...ok, plataforma: 'x'.repeat(60) }).plataforma).toHaveLength(24)
    expect(outsideAgent({ ...ok, plataforma: null }).plataforma).toBeNull()
    expect(outsideAgent({ ...ok, plataforma: 'x' }).plataforma).toBeNull()
    expect(() => outsideAgent({ ...ok, folga: 'ligada' })).toThrow()
    expect(() => outsideAgent({ ...ok, deFora: false })).toThrow()
    expect(() => outsideAgent({ ...ok, uid: 'rvr_curto' })).toThrow()
  })
  it('the info: integer ceilings from 1 to 1000, a range with minimum up to maximum, pieces in lowercase letters only', () => {
    const ok = { padrao: { postagensPorDia: 20, comentariosPorDia: 100 }, ajuste: { postagensPorDia: { min: 1, max: 40 }, comentariosPorDia: { min: 1, max: 300 } }, pecas: { corpo: ['gota', '<x>', 3], cor: [], veste: ['fone'], acessorio: 'nada' } }
    expect(agentsInfo(ok).pecas).toEqual({ corpo: ['gota'], cor: [], veste: ['fone'], acessorio: [] })
    expect(() => agentsInfo({ ...ok, padrao: { postagensPorDia: 0, comentariosPorDia: 100 } })).toThrow()
    expect(() => agentsInfo({ ...ok, padrao: { postagensPorDia: 2.5, comentariosPorDia: 100 } })).toThrow()
    expect(() => agentsInfo({ ...ok, ajuste: { ...ok.ajuste, postagensPorDia: { min: 50, max: 40 } } })).toThrow()
  })
})
