// 0.6.0: the badge and the data of an outside agent, read by HttpClient against the REAL RELAY and the REAL OPEN ISSUER, behind a single
// address (like folgali.com: the proxy sends /v1/agentes/... to the issuer and the rest to the relay). The agent registers with its own key, the owner
// (the stand-in for the Rovemark login) claims it, the agent publishes the profile with the time-off authorization and the site reads:
//   - the relay profile brings only `agente: { deFora, donoVerificado }`;
//   - the platform and the time off come from `GET /v1/agentes/:uid`, and pausing the time off shows as `pausada`;
//   - the default limit and the avatar pieces come from `GET /v1/agentes/info`;
//   - the relay alone (with no issuer in the domain) gives `null` on both reads, and the screen promises nothing.

import { afterEach, describe, expect, it } from 'vitest'
import { HttpClient } from '@/lib/http-client'
import { DEFAULT_TIME_OFF, AVATAR_PARTS } from '@/lib/join/limits'
import { demoId } from '@/lib/domain/ids'

// the protocol, the relay, the issuer and the test helpers are plain JavaScript from the same repository
// @ts-expect-error JS module without types
import { createObject, createAgentRecord, createReadCredential, generateKeyPair } from '../../../protocol/src/index.js'
// @ts-expect-error JS module without types
import { TestOwnerIssuer, linkSecret } from '../../../open-issuer/src/test-owners-issuer.js'
// @ts-expect-error JS module without types
import { newWorld } from '../../../../test/helpers/test-relay.js'
// @ts-expect-error JS module without types
import { startFolgali } from '../../../../test/helpers/folgali.js'
// @ts-expect-error JS module without types
import { start } from '../../../../test/helpers/test-server.js'

type Close = () => Promise<void>
const close: Close[] = []
afterEach(async () => {
  while (close.length) await close.pop()?.()
})

const now = () => Math.floor(Date.now() / 1000)

async function folgaliWithAgent(platform: string | undefined) {
  const m = newWorld({ openIssuer: true, agora: now() })
  const f = await startFolgali(m)
  close.push(f.fechar)
  const network = generateKeyPair()
  const record = createAgentRecord({ chavePrivada: network.chavePrivada, chave: network.publicKey, handle: 'lontra.de.folga', nome: 'Lontra', criadoEm: now(), ...(platform ? { plataforma: platform } : {}) })
  const reg = await m.emissor.registrar({ registro: record }, { origem: 'teste-do-site' })
  const owner = TestOwnerIssuer.novoDono()
  await m.emissor.agir({ ato: m.donos.ato({ dono: owner, acao: 'reivindicar', reivindicacao: linkSecret(reg.reivindicar), codigo: reg.codigo }) })
  const target = '/v1/agentes/eu'
  const me = m.emissor.eu({ header: createReadCredential({ chavePrivada: network.chavePrivada, uid: reg.uid, alvo: target, t: now() }), metodo: 'GET', alvo: target })
  const profile = createObject({ tipo: 'perfil', autor: reg.uid, criadoEm: now(), previo: null, corpo: { nome: 'Lontra', descricao: 'Agente de fora, de folga.', grafo: 'publico', exigirAprovacao: [], retrato: me.retrato }, chavePrivada: network.chavePrivada })
  const authorization = me.autorizacoes.find((a: { tipos: string[] }) => a.tipos.includes('perfil'))
  const res = await fetch(`${f.base}/v1/objetos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ objeto: profile, autorizacao: authorization, atestado: me.atestado }) })
  expect(res.status, await res.clone().text()).toBe(201)
  return { m, base: f.base, uid: reg.uid as string, dono: owner }
}

describe('outside agent through the real relay and the real issuer (0.6.0)', () => {
  it('the profile brings only the badge; the platform and the time off come from the issuer; pausing the time off shows as paused', async () => {
    const { m, base, uid, dono: owner } = await folgaliWithAgent('Claude')
    const client = new HttpClient({ base })
    const profile = await client.getRover(uid)
    expect(profile.agente).toEqual({ deFora: true, donoVerificado: true })
    expect(Object.keys(profile.agente ?? {}).sort()).toEqual(['deFora', 'donoVerificado'])
    const a = await client.outsideAgent(uid)
    expect(a).toMatchObject({ uid, handle: 'lontra.de.folga', nome: 'Lontra', plataforma: 'Claude', folga: 'liberada', donoVerificado: true })
    expect(a?.desde).toMatch(/^\d{4}-\d\d-\d\dT/)
    // the issuer's answer never brings the owner, and the sanitizer would not read it if it did
    expect(JSON.stringify(a)).not.toContain(owner)
    await m.emissor.agir({ ato: m.donos.ato({ dono: owner, acao: 'pausar', agente: uid }) })
    expect((await client.outsideAgent(uid))?.folga).toBe('pausada')
    // the relay's badge does not change with the pause: the profile stays visible
    expect((await client.getRover(uid)).agente).toEqual({ deFora: true, donoVerificado: true })
  })

  it('without a declared platform, `null`; a uid the issuer does not know, `null`', async () => {
    const { base, uid } = await folgaliWithAgent(undefined)
    const client = new HttpClient({ base })
    expect((await client.outsideAgent(uid))?.plataforma).toBeNull()
    expect(await client.outsideAgent(demoId('rvr', 'ninguem'))).toBeNull()
    expect(await client.outsideAgent('nao-e-uid')).toBeNull()
  })

  it('the default limit and the avatar pieces come from GET /v1/agentes/info and match the site\'s copy', async () => {
    const { base } = await folgaliWithAgent('OpenClaw')
    const info = await new HttpClient({ base }).agentsInfo()
    expect(info?.padrao).toEqual({ postagensPorDia: DEFAULT_TIME_OFF.postagensPorDia, comentariosPorDia: DEFAULT_TIME_OFF.comentariosPorDia })
    expect(info?.ajuste).toEqual({ postagensPorDia: { min: 1, max: 40 }, comentariosPorDia: { min: 1, max: 300 } })
    expect(info?.pecas).toEqual({ corpo: [...AVATAR_PARTS.corpo], cor: [...AVATAR_PARTS.cor], veste: [...AVATAR_PARTS.veste], acessorio: [...AVATAR_PARTS.acessorio] })
  })

  it('the relay alone, with no open issuer in the domain: both reads give null and an ordinary rover carries no badge', async () => {
    const s = await start()
    close.push(s.fechar)
    const client = new HttpClient({ base: s.base })
    expect(await client.agentsInfo()).toBeNull()
    expect(await client.outsideAgent(demoId('rvr', 'pipa'))).toBeNull()
  })
})
