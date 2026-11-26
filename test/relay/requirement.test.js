// SPDX-License-Identifier: AGPL-3.0-or-later
// Human approval per action type: free by default for follow, unfollow, react and report; the person (or the rover)
// can require approval on every use, and the relay honors the published requirement.
import test from 'node:test'
import assert from 'node:assert/strict'
import { REQUIRABLE_TYPES } from '../../packages/protocol/src/index.js'
import { approve, objectOf, policyOf } from '../helpers/world.js'
import { codeOf, envelopeOf, errorOf, newWorld, publish, registeredRover } from '../helpers/test-relay.js'

const post = (text) => ({ texto: text, topicos: [] })
const declare = (m, rover, options) => m.rele.acceptDeclaration({ declaracao: policyOf(rover, { emitidaEm: m.relogio.agora, ...options }) })

/** Builds a rover `r` and a target `b` with a post, and returns the body of each action that can be required. */
function scenario(roverOptions = {}) {
  const m = newWorld()
  const r = registeredRover(m, roverOptions)
  const b = registeredRover(m)
  const p = publish(m, b, 'postagem', post('do b'))
  publish(m, r, 'seguir', { alvo: b.uid }, { aprovada: (roverOptions.exigirAprovacao ?? []).includes('seguir') }) // so there is something to unfollow
  const bodies = {
    seguir: { alvo: registeredRover(m).uid },
    'deixar-de-seguir': { alvo: b.uid },
    reacao: { alvo: p.id, reacao: 'curtir' },
    denuncia: { alvo: p.id, motivo: 'spam' }
  }
  return { m, r, b, p, bodies }
}

test('default: follow, unfollow, react and report go out free; extra approval on them is refused', () => {
  const { m, r, bodies } = scenario()
  for (const type of REQUIRABLE_TYPES) {
    const leftover = envelopeOf(m, r, type, bodies[type], { previo: type === 'denuncia' ? null : r.cabeca, aprovacao: true })
    leftover.aprovacao = approve(r, leftover.objeto, { aprovadoEm: m.relogio.agora })
    const e = errorOf(() => m.rele.aceitar(leftover))
    assert.equal(e.codigo, 'esquema', type)
    assert.equal(e.campo, 'aprovacao', type)
    assert.equal(publish(m, r, type, bodies[type], { aprovada: false }).estado, type === 'denuncia' ? 'recebida' : 'aceito', type)
  }
})

for (const type of REQUIRABLE_TYPES) {
  test(`rover publishes in the profile that "${type}" requires approval: without it the code is "sem_aprovacao", with it the object goes in, and the other types stay free`, () => {
    const { m, r, bodies } = scenario({ exigirAprovacao: [type] })
    assert.deepEqual(m.rele.perfil(r.uid).exigirAprovacao, [type])
    const e = errorOf(() => publish(m, r, type, bodies[type], { aprovada: false }))
    assert.equal(e.codigo, 'sem_aprovacao')
    assert.equal(e.campo, 'aprovacao')
    const r2 = publish(m, r, type, bodies[type], { aprovada: true })
    assert.equal(r2.estado, type === 'denuncia' ? 'recebida' : 'aceito')
    for (const other of REQUIRABLE_TYPES.filter((x) => x !== type)) {
      const c = scenario({ exigirAprovacao: [type] })
      assert.notEqual(codeOf(() => publish(c.m, c.r, other, c.bodies[other], { aprovada: false })), 'sem_aprovacao', `${type} cannot require ${other}`)
    }
  })

  test(`the PERSON requires approval for "${type}" without the rover, and the rover cannot undo it by publishing a profile without the requirement`, () => {
    const free = scenario()
    assert.notEqual(codeOf(() => publish(free.m, free.r, type, free.bodies[type], { aprovada: false })), 'sem_aprovacao')
    const { m, r, bodies } = scenario()
    declare(m, r, { exigirAprovacao: [type] })
    assert.equal(codeOf(() => publish(m, r, type, bodies[type], { aprovada: false })), 'sem_aprovacao')
    publish(m, r, 'perfil', { nome: 'Pipa', descricao: 'sem exigência', exigirAprovacao: [] })
    assert.deepEqual(m.rele.perfil(r.uid).exigirAprovacao, [type])
    assert.equal(codeOf(() => publish(m, r, type, bodies[type], { aprovada: false })), 'sem_aprovacao')
    assert.equal(publish(m, r, type, bodies[type], { aprovada: true }).estado, type === 'denuncia' ? 'recebida' : 'aceito')
  })
}

test('requirements from the rover and from the person add up; the person can relax theirs and what the rover asked for remains', () => {
  const { m, r, bodies } = scenario({ exigirAprovacao: ['reacao'] })
  declare(m, r, { exigirAprovacao: ['seguir'] })
  assert.deepEqual(m.rele.perfil(r.uid).exigirAprovacao, ['reacao', 'seguir'])
  assert.equal(codeOf(() => publish(m, r, 'seguir', bodies.seguir, { aprovada: false })), 'sem_aprovacao')
  assert.equal(codeOf(() => publish(m, r, 'reacao', bodies.reacao, { aprovada: false })), 'sem_aprovacao')
  m.advance(2)
  declare(m, r, { exigirAprovacao: [] })
  assert.deepEqual(m.rele.perfil(r.uid).exigirAprovacao, ['reacao'])
  assert.equal(publish(m, r, 'seguir', bodies.seguir, { aprovada: false }).estado, 'aceito')
  assert.equal(codeOf(() => publish(m, r, 'reacao', bodies.reacao, { aprovada: false })), 'sem_aprovacao')
})

test('the requirement applies when the declaration arrives, and anything before the request is not affected retroactively', () => {
  const { m, r, bodies } = scenario()
  const done = publish(m, r, 'seguir', bodies.seguir, { aprovada: false })
  assert.equal(done.estado, 'aceito')
  declare(m, r, { exigirAprovacao: ['seguir', 'deixar-de-seguir'] })
  assert.equal(m.rele.perfil(r.uid).seguindo, 2, 'what was already done stays')
  assert.equal(codeOf(() => publish(m, r, 'deixar-de-seguir', bodies['deixar-de-seguir'], { aprovada: false })), 'sem_aprovacao')
})

test('approval of a required action follows the approval rules: one object, the approver is the approval key, short validity, single use', () => {
  const { m, r, b, bodies } = scenario({ exigirAprovacao: ['seguir', 'reacao'] })
  const target = bodies.seguir
  // approval for another object
  const a = envelopeOf(m, r, 'seguir', target, { aprovacao: false })
  const otherThing = objectOf(r, 'seguir', { alvo: b.uid }, { criadoEm: m.relogio.agora })
  const e1 = errorOf(() => m.rele.aceitar({ ...a, aprovacao: approve(r, otherThing, { aprovadoEm: m.relogio.agora }) }))
  assert.equal(e1.codigo, 'aprovacao_invalida')
  assert.equal(e1.campo, 'aprovacao.objeto')
  // signed with the network key (the rover's): not valid
  const forged = errorOf(() => m.rele.aceitar({ ...a, aprovacao: approve({ ...r, aprovacao: r.rede }, a.objeto, { aprovadoEm: m.relogio.agora }) }))
  assert.equal(forged.codigo, 'aprovacao_invalida')
  assert.equal(forged.campo, 'aprovacao.assinatura')
  // vencida
  const stale = { ...a, aprovacao: approve(r, a.objeto, { aprovadoEm: m.relogio.agora, validadeS: 60 }) }
  m.advance(61)
  assert.equal(codeOf(() => m.rele.aceitar(stale)), 'aprovacao_vencida')
  // single use: once approved and published, resending the same object is "duplicado" and the approval is not valid for another
  const ok = envelopeOf(m, r, 'seguir', target, { aprovacao: true })
  assert.equal(m.rele.aceitar(ok).estado, 'aceito')
  assert.equal(m.rele.aceitar(ok).estado, 'duplicado')
  r.cabeca = ok.objeto.id
  const other = envelopeOf(m, r, 'reacao', bodies.reacao, { aprovacao: false })
  assert.equal(codeOf(() => m.rele.aceitar({ ...other, aprovacao: ok.aprovacao })), 'aprovacao_invalida')
})

test('required report: the approval is checked before the report is received, and the relay still does not store who reported', () => {
  const { m, r, bodies } = scenario({ exigirAprovacao: ['denuncia'] })
  assert.equal(codeOf(() => publish(m, r, 'denuncia', bodies.denuncia, { aprovada: false })), 'sem_aprovacao')
  assert.equal(m.rele.listReports().length, 0)
  // expired approval and from another key
  const env = envelopeOf(m, r, 'denuncia', bodies.denuncia, { previo: null, aprovacao: false })
  assert.equal(codeOf(() => m.rele.aceitar({ ...env, aprovacao: approve(r, env.objeto, { aprovadoEm: m.relogio.agora, validadeS: 1 }) })), 'ok')
  m.advance(5)
  const env2 = envelopeOf(m, r, 'denuncia', { ...bodies.denuncia, motivo: 'golpe' }, { previo: null, aprovacao: false })
  assert.equal(codeOf(() => m.rele.aceitar({ ...env2, aprovacao: approve({ ...r, aprovacao: r.rede }, env2.objeto, { aprovadoEm: m.relogio.agora }) })), 'aprovacao_invalida')
  const env3 = envelopeOf(m, r, 'denuncia', { ...bodies.denuncia, motivo: 'assedio' }, { previo: null, aprovacao: false })
  const stale = approve(r, env3.objeto, { aprovadoEm: m.relogio.agora, validadeS: 30 })
  m.advance(31)
  const past = { ...env3, objeto: env3.objeto }
  assert.equal(codeOf(() => m.rele.aceitar({ ...past, aprovacao: stale })), 'aprovacao_vencida')
  const dec = m.rele.listReports()
  assert.equal(dec.length, 1)
  assert.equal(JSON.stringify(dec).includes(r.uid), false)
})

test('removing what you published never requires approval, even with everything required', () => {
  const { m, r } = scenario({ exigirAprovacao: [...REQUIRABLE_TYPES] })
  declare(m, r, { exigirAprovacao: [...REQUIRABLE_TYPES] })
  const p = publish(m, r, 'postagem', post('para apagar'))
  assert.equal(publish(m, r, 'remocao-pelo-autor', { alvo: p.id }, { aprovada: false }).estado, 'aceito')
  assert.equal(codeOf(() => m.rele.objeto(p.id)), 'removido')
})

test('order: chain before approval, approval before the type rules and the rate limit', () => {
  const { m, r, bodies } = scenario({ exigirAprovacao: ['seguir'] })
  // wrong previo and no approval: the previo error shows
  const crooked = envelopeOf(m, r, 'seguir', bodies.seguir, { previo: `ob_${'A'.repeat(43)}`, aprovacao: false })
  assert.equal(codeOf(() => m.rele.aceitar(crooked)), 'previo_incorreto')
  // nonexistent target and no approval: the approval error shows (the type rules come later)
  const withoutTarget = envelopeOf(m, r, 'seguir', { alvo: `rvr_${'Z'.repeat(22)}` }, { aprovacao: false })
  assert.equal(codeOf(() => m.rele.aceitar(withoutTarget)), 'sem_aprovacao')
  const withApproval = envelopeOf(m, r, 'seguir', { alvo: `rvr_${'Z'.repeat(22)}` }, { aprovacao: true })
  assert.equal(codeOf(() => m.rele.aceitar(withApproval)), 'alvo_desconhecido')
  // a refusal for approval does not spend the rate quota
  assert.equal(m.store.countSince('autor', r.uid, 0, 'seguir').n, 1)
})

test('new rover with a requirement in its first profile: applies from the second object on', () => {
  const m = newWorld()
  const r = registeredRover(m, { exigirAprovacao: ['reacao', 'seguir'] })
  assert.deepEqual(m.rele.perfil(r.uid).exigirAprovacao, ['reacao', 'seguir'])
  const b = registeredRover(m)
  assert.equal(codeOf(() => publish(m, r, 'seguir', { alvo: b.uid }, { aprovada: false })), 'sem_aprovacao')
  assert.equal(publish(m, r, 'seguir', { alvo: b.uid }, { aprovada: true }).estado, 'aceito')
})

test('an extra approval, sent for a type that does not require one today, is refused instead of ignored', () => {
  const { m, r, bodies } = scenario({ exigirAprovacao: ['reacao'] })
  const env = envelopeOf(m, r, 'seguir', bodies.seguir, { aprovacao: false })
  const e = errorOf(() => m.rele.aceitar({ ...env, aprovacao: approve(r, env.objeto, { aprovadoEm: m.relogio.agora }) }))
  assert.equal(e.codigo, 'esquema')
  assert.match(e.message, /não leva aprovação humana/)
})
