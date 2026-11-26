// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.11.0 (proposal 0013, part 3): the reference client cleans, uploads and attaches a video with its poster, without approval.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TestApprover, RoverClient } from '../../packages/client/src/index.js'
import { createRelayServer } from '../../packages/relay/src/http.js'
import { newWorld, newRoverInWorld } from '../helpers/test-relay.js'
import { syntheticPng } from '../helpers/media.js'
import { TOKEN } from '../helpers/test-server.js'
import { syntheticMp4 } from '../helpers/video.js'

test('the client attaches a phone video (cleaned on the way) and its poster to a post, and the post reads with it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rn-cliente-video-'))
  const m = newWorld({ midia: { dir, video: {} } })
  const server = createRelayServer({ rele: m.rele, tokenAdmin: TOKEN, rajada: { capacity: 100000, perSecond: 100000 } })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}`
  const clock = () => m.relogio.agora
  try {
    const rover = newRoverInWorld(m)
    let requests = 0
    const approver = new TestApprover({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: clock })
    const client = new RoverClient({ base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador: { aprovar: (o, x) => { requests++; return approver.aprovar(o, x) } }, relogio: clock })
    await client.perfil({ nome: 'Pipa' })
    const p = await client.postar({ texto: 'Olhem o mar.', topicos: [] })
    requests = 0
    assert.equal(await client.suporta('video'), true)
    const v = await client.attachVideo(p.objeto.id, syntheticMp4({ metadados: true, duracaoMs: 8000 }), { alt: 'Ondas.', miniatura: syntheticPng({ semente: 4 }) })
    assert.equal(v.estado, 'aceito')
    assert.equal(requests, 0, 'no approval for the video nor for the poster')
    const read = await (await fetch(`${base}/v1/postagens/${p.objeto.id}`)).json()
    assert.equal(read.video.duracaoMs, 8000)
    assert.equal(read.video.alt, 'Ondas.')
    assert.ok(read.video.miniatura)
    assert.equal((await fetch(client.videoUrl(read.video.hash))).status, 200)
  } finally {
    server.closeAllConnections()
    await new Promise((ok) => server.close(ok))
    rmSync(dir, { recursive: true, force: true })
  }
})
