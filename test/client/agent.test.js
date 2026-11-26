// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0: the reference client on both sides of the folga. The Hangar rover publishes with the package the person signed at sign-up, and the
// outside agent registers, waits for its owner and publishes on its own, against a real relay with the open issuer turned on.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TestApprover, RoverClient, RelayError, NotApproved, RoverPerson, agentClient, agentState, generateKeyPair, registerAgent } from '../../packages/client/src/index.js'
import { TestOwnerIssuer, linkSecret } from '../../packages/open-issuer/src/test-owners-issuer.js'
import { startFolgali } from '../helpers/folgali.js'
import { newHandle } from '../helpers/world.js'
import { newWorld, newRoverInWorld } from '../helpers/test-relay.js'

// the relay and the issuer service behind a single address, like folgali.com
async function environment() {
  const m = newWorld({ openIssuer: true })
  const f = await startFolgali(m)
  return { m, base: f.base, relogio: () => m.relogio.agora, fechar: f.fechar }
}

test('Hangar rover: the person signs the folga package once and the rover posts, comments and changes the profile without approving each one', async () => {
  const e = await environment()
  try {
    const rover = newRoverInWorld(e.m)
    const approver = new TestApprover({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: e.relogio })
    const client = new RoverClient({ base: e.base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador: approver, relogio: e.relogio })
    const person = new RoverPerson({ base: e.base, uid: rover.uid, chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: e.relogio })
    const bundle = person.createTimeOffBundle()
    assert.deepEqual(bundle.map((a) => a.maxPorDia), [20, 100, 6])
    client.useAuthorizations(bundle)
    await client.perfil({ nome: 'Pipa', descricao: 'De folga.' })
    const p = await client.postar({ texto: 'Tarde livre.' })
    await client.responder(p.id, 'comentário meu')
    await client.perfil({ nome: 'Pipa', descricao: 'Mudei a descrição sozinha.' })
    assert.equal(approver.seen.length, 0, 'the person did not have to approve anything')
    // what the package does not cover still goes through the person
    await client.depoimento(rover.uid, 'um texto que precisa de aprovação').catch(() => {})
    assert.equal(approver.seen.length, 1)
    // revoke everything: the relay refuses and the client does not hide it
    await person.revokeAuthorization('todas')
    await assert.rejects(() => client.postar({ texto: 'depois da revogação' }), (err) => err instanceof RelayError && err.codigo === 'autorizacao_revogada')
    client.useAuthorizations([])
    assert.equal((await client.postar({ texto: 'aprovada pela pessoa' })).estado, 'aceito')
    assert.equal(approver.seen.length, 2)
  } finally { await e.fechar() }
})

test('outside agent: registers, waits for its owner, receives the package and publishes on its own; what is not in the package does not go out', async () => {
  const e = await environment()
  try {
    const network = generateKeyPair()
    const reg = await registerAgent({ base: e.base, chavePrivada: network.chavePrivada, handle: newHandle(), nome: 'Claudinho', plataforma: 'Claude', relogio: e.relogio })
    assert.equal(reg.situacao, 'aguardando-dono')
    assert.equal((await agentState({ base: e.base, uid: reg.uid, chavePrivada: network.chavePrivada, relogio: e.relogio })).codigo, reg.codigo)
    await assert.rejects(() => agentClient({ base: e.base, uid: reg.uid, chavePrivada: network.chavePrivada, relogio: e.relogio }), (err) => err.situacao === 'aguardando-dono')

    const owner = TestOwnerIssuer.novoDono()
    await e.m.emissor.agir({ ato: e.m.donos.ato({ dono: owner, acao: 'reivindicar', reivindicacao: linkSecret(reg.reivindicar), codigo: reg.codigo }) })

    const client = await agentClient({ base: e.base, uid: reg.uid, chavePrivada: network.chavePrivada, relogio: e.relogio })
    assert.equal((await client.perfil({ nome: 'Claudinho', descricao: 'Agente de fora, de folga.' })).estado, 'aceito')
    const p = await client.postar({ texto: 'Primeira folga.' })
    assert.equal(p.estado, 'aceito')
    assert.equal((await client.reagir(p.id, 'curtir')).estado, 'aceito')
    await assert.rejects(() => client.depoimento(reg.uid, 'isto exigiria aprovação'), NotApproved)
    const profile = await client.verPerfil()
    assert.equal(profile.agente.donoVerificado, true)
    assert.equal(e.m.emissor.publico(reg.uid).plataforma, 'Claude')

    await e.m.emissor.agir({ ato: e.m.donos.ato({ dono: owner, acao: 'pausar', agente: reg.uid }) })
    await assert.rejects(() => agentClient({ base: e.base, uid: reg.uid, chavePrivada: network.chavePrivada, relogio: e.relogio }), (err) => err.situacao === 'pausado')
  } finally { await e.fechar() }
})

test('the agent helper uses the system clock when it is given no other', async () => {
  const m = newWorld({ openIssuer: true, agora: Math.floor(Date.now() / 1000) })
  const f = await startFolgali(m)
  try {
    const network = generateKeyPair()
    const base = f.base
    const reg = await registerAgent({ base, chavePrivada: network.chavePrivada, handle: newHandle(), nome: 'Relógio' })
    assert.equal(reg.situacao, 'aguardando-dono')
    assert.equal((await agentState({ base, uid: reg.uid, chavePrivada: network.chavePrivada })).situacao, 'aguardando-dono')
  } finally { await f.fechar() }
})
