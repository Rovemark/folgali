// SPDX-License-Identifier: AGPL-3.0-or-later
// F-03 of the security review: uploads that no object cites (pending) used to count only against the relay's GLOBAL media quota, and
// resending the same bytes renewed their one-hour life. Two accounts filled the quota with orphans and kept it full, and nobody else could
// send a photo. Now each account holds at most `pendingCap` pending bytes, a re-upload never keeps a file past `pendenteMaxS` from its
// first upload, and an upload runs the orphan collection (at most every `collectEveryS`) before checking the quota.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { MEDIA_LIMITS, imageBody } from '../../packages/protocol/src/index.js'
import { worldWithMedia, send, syntheticPng, chunkPng } from '../helpers/media.js'
import { publish, codeOf } from '../helpers/test-relay.js'

const MiB = 1048576

/** A valid PNG of about `size` bytes (the cleaner does not decode the compressed stream). */
const big = (seed, size = 900_000) => {
  const png = syntheticPng({ largura: 64, altura: 64, semente: seed })
  return Buffer.concat([png.subarray(0, 33), chunkPng('IDAT', randomBytes(size)), chunkPng('IEND')])
}
const upload = (m, r, bytes) => codeOf(() => send(m, r, bytes))

// The PoC of the review, with its 5 MiB quota: the attacker sends orphans until refused, and the victim still sends its photo.
test('F-03: one account cannot fill the global media quota with uploads nobody publishes', () => {
  const m = worldWithMedia({ cotaBytes: 5 * MiB })
  try {
    assert.equal(m.rele.midia.pendingCap, MEDIA_LIMITS.anexosPorPostagem * MEDIA_LIMITS.bytesMax)
    const attacker = m.rover()
    const victim = m.rover()
    let ok = 0
    let refusal
    for (let i = 0; i < 6; i++) {
      const code = upload(m, attacker, big(i))
      if (code !== 'ok') { refusal = code; break }
      ok++
    }
    assert.equal(ok, 4)
    assert.equal(refusal, 'limite_de_taxa')
    assert.equal(upload(m, victim, big(99)), 'ok')
  } finally { m.apagar() }
})

test('F-03: the refusal waits for the oldest pending upload, and publishing frees the account at once', () => {
  const m = worldWithMedia({ cotaBytes: 5 * MiB })
  try {
    const r = m.rover()
    const files = [0, 1, 2, 3].map((i) => big(i))
    const sent = files.map((b) => send(m, r, b).limpa)
    let e
    try { send(m, r, big(10)) } catch (x) { e = x }
    assert.equal(e?.codigo, 'limite_de_taxa')
    assert.ok(e.retryAfterS > 0 && e.retryAfterS <= MEDIA_LIMITS.pendenteS)
    // sending again a file that is already pending for this account holds nothing new
    assert.equal(upload(m, r, files[0]), 'ok')
    // the portrait cites one of the files: it is no longer pending, and there is room for one more
    assert.equal(publish(m, r, 'imagem', imageBody(sent[0], { uso: 'retrato', alvo: null, ordem: null, alt: '' })).estado, 'aceito')
    assert.equal(upload(m, r, big(11)), 'ok')
  } finally { m.apagar() }
})

test('F-03: at the default quota an account holds at most 16 MiB pending', () => {
  const m = worldWithMedia({ verificados: true })
  try {
    assert.equal(m.rele.midia.pendingCap, 16 * MiB)
    const r = m.rover()
    let ok = 0
    for (let i = 0; i < 20; i++) {
      if (upload(m, r, big(i)) !== 'ok') break
      ok++
    }
    assert.equal(ok, Math.floor((16 * MiB) / (900_000 + 74)))
  } finally { m.apagar() }
})

test('F-03: re-sending the same bytes does not keep an orphan alive forever', () => {
  const m = worldWithMedia({ cotaBytes: 5 * MiB })
  try {
    const r = m.rover()
    const bytes = big(1)
    send(m, r, bytes)
    // a re-upload every 50 minutes: until pendenteMaxS from the first upload it keeps the file, and then the file goes, although the
    // last re-upload is only 50 minutes old
    for (let elapsed = 50 * 60; ; elapsed += 50 * 60) {
      m.relogio.agora += 50 * 60
      m.rele.midia.collect(m.relogio.agora)
      if (elapsed >= MEDIA_LIMITS.pendenteMaxS) {
        assert.equal(m.arquivos().length, 0, `after ${elapsed / 60} min`)
        break
      }
      assert.equal(m.arquivos().length, 1, `after ${elapsed / 60} min`)
      send(m, r, bytes)
    }
  } finally { m.apagar() }
})

test('F-03: an upload collects the orphans of others before checking the quota (no wait for the six-hour cleanup)', () => {
  const m = worldWithMedia({ cotaBytes: 5 * MiB })
  try {
    const a = m.rover()
    const b = m.rover()
    const victim = m.rover()
    for (let i = 0; i < 4; i++) send(m, a, big(i))
    send(m, b, big(10))
    m.relogio.agora += MEDIA_LIMITS.pendenteS + 1
    assert.equal(m.arquivos().length, 5)
    assert.equal(upload(m, victim, big(99)), 'ok')
    assert.equal(m.arquivos().length, 1)
  } finally { m.apagar() }
})

test('F-03: a file re-sent long after its first upload starts a new pending life (re-attaching an old photo still works)', () => {
  const m = worldWithMedia({ cotaBytes: 64 * MiB })
  try {
    const r = m.rover()
    const p1 = publish(m, r, 'postagem', { texto: 'Primeira.', topicos: ['rovers'] }).objeto
    const p2 = publish(m, r, 'postagem', { texto: 'Segunda.', topicos: ['rovers'] }).objeto
    const bytes = big(5, 20_000)
    const { limpa } = send(m, r, bytes)
    assert.equal(publish(m, r, 'imagem', imageBody(limpa, { uso: 'anexo', alvo: p1.id, ordem: 0, alt: '' })).estado, 'aceito')
    m.relogio.agora += 3 * 3600
    // the same photo, again, for the second post; meanwhile the first post (the only one citing it) is removed
    send(m, r, bytes)
    assert.equal(publish(m, r, 'remocao-pelo-autor', { alvo: p1.id }).estado, 'aceito')
    assert.equal(m.arquivos().length, 1)
    assert.equal(publish(m, r, 'imagem', imageBody(limpa, { uso: 'anexo', alvo: p2.id, ordem: 0, alt: '' })).estado, 'aceito')
  } finally { m.apagar() }
})
