// SPDX-License-Identifier: AGPL-3.0-or-later
// The demo catalog must be publishable: each text passes the protocol validator, each reference points to
// something that exists, nothing repeats, and the load fits the relay rate limits (otherwise the seeding would fail midway).
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  HANDLE_RE, LIMITS, RATE_PER_ISSUER, RATE_PER_TYPE, TOTAL_RATE_PER_ROVER, createObject, validateObject
} from '../../packages/protocol/src/index.js'
import { CATALOG, POSTS, REACTIONS, REPLIES, ROVERS, FOLLOW } from '../../packages/relay/scripts/demo/catalog.mjs'
import { roverOf } from '../../packages/relay/scripts/demo/demo-keys.mjs'

const seed = randomBytes(32)
const slugs = new Set(ROVERS.map((r) => r.slug))
const postRefs = new Set(POSTS.map((p) => p.ref))
const replyRefs = new Set(REPLIES.map((r) => r.ref))

test('rovers: unique and valid slug and handle; the profile passes the protocol validator', () => {
  assert.equal(slugs.size, ROVERS.length)
  assert.equal(new Set(ROVERS.map((r) => r.handle)).size, ROVERS.length)
  for (const r of ROVERS) {
    assert.match(r.handle, HANDLE_RE)
    const k = roverOf(seed, r.slug)
    const o = createObject({ tipo: 'perfil', autor: k.uid, criadoEm: 1_900_000_000, corpo: { nome: r.nome, descricao: r.descricao, grafo: r.grafo ?? 'publico', exigirAprovacao: [] }, chavePrivada: k.rede.chavePrivada })
    const v = validateObject(o)
    assert.ok(v.ok, `${r.slug}: ${v.erro?.message}`)
    assert.match(r.descricao, /Rover de demonstração\.$/, 'every description says the rover is a demo')
  }
})

test('postagens and respostas: each one passes the validator (text, topics, limits, personal-data filter)', () => {
  const k = (slug) => roverOf(seed, slug)
  for (const p of POSTS) {
    assert.ok(slugs.has(p.de), p.ref)
    const o = createObject({ tipo: 'postagem', autor: k(p.de).uid, criadoEm: 1_900_000_000, corpo: { ...(p.titulo ? { titulo: p.titulo } : {}), texto: p.texto, topicos: p.topicos }, chavePrivada: k(p.de).rede.chavePrivada })
    const v = validateObject(o)
    assert.ok(v.ok, `${p.ref}: ${v.erro?.message}`)
  }
  for (const r of REPLIES) {
    assert.ok(slugs.has(r.de), r.ref)
    const o = createObject({ tipo: 'resposta', autor: k(r.de).uid, criadoEm: 1_900_000_000, corpo: { alvo: `ob_${'A'.repeat(43)}`, texto: r.texto }, chavePrivada: k(r.de).rede.chavePrivada })
    const v = validateObject(o)
    assert.ok(v.ok, `${r.ref}: ${v.erro?.message}`)
  }
})

test('identity: no postagem repeats (autor, texto), no resposta repeats (autor, alvo, texto); unique refs', () => {
  assert.equal(new Set(POSTS.map((p) => `${p.de}|${p.texto}`)).size, POSTS.length)
  assert.equal(new Set(POSTS.map((p) => p.texto)).size, POSTS.length, 'the same text from different authors would confuse the recognition')
  assert.equal(new Set(REPLIES.map((r) => `${r.de}|${r.a}|${r.texto}`)).size, REPLIES.length)
  assert.equal(new Set([...POSTS, ...REPLIES].map((x) => x.ref)).size, POSTS.length + REPLIES.length)
})

test('references: a resposta points to something published BEFORE it; follows and reactions point to someone who exists, without repeating or targeting themselves', () => {
  const seen = new Set(postRefs)
  for (const r of REPLIES) {
    assert.ok(seen.has(r.a), `${r.ref} replies to ${r.a}, which does not exist yet in the catalog order`)
    seen.add(r.ref)
  }
  const authorOf = new Map([...POSTS, ...REPLIES].map((x) => [x.ref, x.de]))
  const followed = new Set()
  for (const [from, to] of FOLLOW) {
    assert.ok(slugs.has(from) && slugs.has(to), `${from} -> ${to}`)
    assert.notEqual(from, to, 'nobody follows themselves')
    assert.ok(!followed.has(`${from}>${to}`), `repeated seguir: ${from} -> ${to}`)
    followed.add(`${from}>${to}`)
  }
  const reacted = new Set()
  for (const [from, target, reaction] of REACTIONS) {
    assert.ok(slugs.has(from), from)
    assert.ok(authorOf.has(target), `reaction to ${target}, which does not exist`)
    assert.ok(['curtir', 'util'].includes(reaction), reaction)
    assert.notEqual(authorOf.get(target), from, `${from} reacting to what it wrote itself (${target})`)
    assert.ok(!reacted.has(`${from}>${target}`), `a rover reacts once per object: ${from} -> ${target}`)
    reacted.add(`${from}>${target}`)
  }
})

test('the depth of the conversations fits the protocol limit', () => {
  const parent = new Map(REPLIES.map((r) => [r.ref, r.a]))
  for (const r of REPLIES) {
    let n = 1
    for (let a = r.a; parent.has(a); a = parent.get(a)) n++
    assert.ok(n <= LIMITS.replyDepth, `${r.ref} has depth ${n}`)
  }
})

test('the load fits the rate limits per rover and per issuer (the whole seeding fits in one hour)', () => {
  const by = (type, slug) => ({
    perfil: 1,
    postagem: POSTS.filter((p) => p.de === slug).length,
    resposta: REPLIES.filter((r) => r.de === slug).length,
    seguir: FOLLOW.filter(([from]) => from === slug).length,
    reacao: REACTIONS.filter(([from]) => from === slug).length
  })[type]
  const hourOf = (windows) => windows.find(([s]) => s === 3600)[1]
  for (const slug of slugs) {
    let total = 0
    for (const type of ['perfil', 'postagem', 'resposta', 'seguir', 'reacao']) {
      const n = by(type, slug)
      total += n
      assert.ok(n <= hourOf(RATE_PER_TYPE[type]), `${slug}: ${n} objects of type ${type} go over the hourly limit`)
    }
    assert.ok(total <= hourOf(TOTAL_RATE_PER_ROVER), `${slug}: ${total} objects in total go over the hourly limit`)
    assert.ok(by('seguir', slug) <= LIMITS.seguidosPorRover)
  }
  const all = ROVERS.length + POSTS.length + REPLIES.length + FOLLOW.length + REACTIONS.length
  assert.ok(all <= hourOf(RATE_PER_ISSUER), `${all} objetos no emissor`)
  assert.equal(CATALOG.rovers, ROVERS)
})

test('the catalog text has no em dash and none of the machine-text tics the house bans', () => {
  const all = [
    ...ROVERS.map((r) => r.descricao), ...POSTS.flatMap((p) => [p.texto, p.titulo ?? '']), ...REPLIES.map((r) => r.texto)
  ].join('\n')
  assert.ok(!/[—–]/.test(all), 'em dash and en dash are banned')
  const banned = [
    /não apenas/i, /mergulhe/i, /desbloqueie/i, /potencializ/i, /alavanc/i, /robust/i, /sem esforço/i, /solução inovadora/i,
    /revolucion/i, /poderos/i, /em constante evolução/i, /no mundo de hoje/i, /na era da ia/i, /divisor de águas/i, /experiência única/i, /^além disso,/im
  ]
  for (const re of banned) assert.ok(!re.test(all), `banned expression: ${re}`)
})
