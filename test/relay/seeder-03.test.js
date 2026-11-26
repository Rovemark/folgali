// SPDX-License-Identifier: AGPL-3.0-or-later
// The seeder for the social network and the forum (protocol 0.3) against the real relay, over HTTP, with the CLOCK IN HAND: the real relay rules
// over time (a 1-day-old account to create a community, a 3-day friendship for a testimonial, 7 days for a badge, a grace period in the community), and the seeder
// forces nothing: it defers and says when to come back. Here the clock advances in steps and each step proves what matured.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createObject, validateObject } from '../../packages/protocol/src/index.js'
import { Store } from '../../packages/relay/src/store.js'
import { createRelayServer } from '../../packages/relay/src/http.js'
import { StaticProvider } from '../../packages/relay/src/provider.js'
import { Relay } from '../../packages/relay/src/relay.js'
import { CATALOG } from '../../packages/relay/scripts/demo/catalog.mjs'
import { issuerOf, roverOf } from '../../packages/relay/scripts/demo/demo-keys.mjs'
import { SeedingError, PHASES, newLedger, seedNetwork } from '../../packages/relay/scripts/demo/seeder.mjs'

const CLI = new URL('../../packages/relay/scripts/seed-demo.mjs', import.meta.url).pathname
const T0 = 1_900_000_000
const DAY = 86400
const closed = []

/** A relay over HTTP with a clock the test controls, which trusts only this seed's issuer. Accounts are born with age zero. */
async function startRelay({ semFatorDeIdade: withoutAgeFactor = true } = {}) {
  const seed = randomBytes(32)
  const issuer = issuerOf(seed)
  const clock = { agora: T0 }
  const relay = new Relay({
    store: new Store(':memory:'), provedor: new StaticProvider({ emissores: [issuer.publicKey], nome: 'teste' }),
    relogio: () => clock.agora, reportSecret: randomBytes(32), semFatorDeIdade: withoutAgeFactor
  })
  const server = createRelayServer({ rele: relay, registrar: () => {}, rajada: { capacity: 1_000_000, perSecond: 1_000_000 } })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const url = `http://127.0.0.1:${server.address().port}`
  const close = () => new Promise((ok) => { server.closeAllConnections(); server.close(ok) })
  closed.push(close)
  const get = async (path) => { const r = await fetch(url + path); return { status: r.status, json: await r.json().catch(() => null) } }
  const ledger = newLedger()
  const run = (extra = {}) => seedNetwork({ url, semente: seed, intervalMs: 0, relogio: () => clock.agora, ledger, ...extra })
  const advance = (s) => { clock.agora += s }
  return { url, semente: seed, relogio: clock, rele: relay, get, ledger, rodar: run, advance, fechar: close }
}
test.after(async () => { for (const f of closed) await f().catch(() => {}) })

const byPhase = (list) => { const o = {}; for (const a of list) o[a.phase] = (o[a.phase] ?? 0) + 1; return o }
const idOfRef = (ref) => `ob_${createHash('sha256').update(ref).digest('base64url').slice(0, 43)}`

// ------------------------------------------------------------------------------------------------------------------------------
// The catalog: everything must be publishable and consistent before going to the relay
// ------------------------------------------------------------------------------------------------------------------------------

test('catalog 0.3: the body of each item of each phase passes the protocol validator, and each item key is unique per author', () => {
  const seed = randomBytes(32)
  const ctx = { uidOf: (slug) => roverOf(seed, slug).uid, idOf: idOfRef, agora: () => T0, pedir: async () => ({ status: 200, json: { itens: [] } }) }
  let items = 0
  for (const phase of PHASES.filter((f) => f.exige === '0.3')) {
    const seen = new Set()
    for (const item of phase.itens(CATALOG)) {
      const slug = phase.autor(item)
      const k = roverOf(seed, slug)
      const body = phase.corpo(item, ctx)
      const o = createObject({ tipo: phase.tipo, autor: k.uid, criadoEm: T0, corpo: body, chavePrivada: k.rede.chavePrivada })
      const v = validateObject(o)
      assert.ok(v.ok, `${phase.nome} (${slug}): ${v.erro?.message}`)
      const key = `${slug}|${phase.chave(item, ctx)}`
      assert.ok(!seen.has(key), `${phase.nome}: repeated item ${key}`)
      seen.add(key)
      items++
    }
  }
  assert.ok(items >= 250, `catalog 0.3 has ${items} items`)
})

test('catalog 0.3: profiles, portraits, friendships, notes and community roles make sense together', () => {
  const slugs = new Set(CATALOG.rovers.map((r) => r.slug))
  assert.equal(CATALOG.rovers.length, 18)
  for (const r of CATALOG.rovers) {
    assert.ok(r.perfil03, `${r.slug} has a 0.3 profile`)
    assert.ok(r.perfil03.retrato.corpo && r.perfil03.retrato.cor, `${r.slug} has a portrait`)
    assert.match(r.descricao, /Rover de demonstração\.$/)
  }
  // friendships: no repeats, nobody with themselves, and every pair points to rovers that exist
  const pairs = new Set()
  for (const [a, b] of [...CATALOG.amizades, ...CATALOG.pedidosPendentes]) {
    assert.ok(slugs.has(a) && slugs.has(b) && a !== b, `${a} and ${b}`)
    const pair = [a, b].sort().join('|')
    assert.ok(!pairs.has(pair), `repeated pair ${pair}`)
    pairs.add(pair)
  }
  const friends = (a, b) => CATALOG.amizades.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
  // notes: whoever writes may write there (nina accepts only friends, biscoito accepts none) and no pair goes over 3 per day
  const profileOf = Object.fromEntries(CATALOG.rovers.map((r) => [r.slug, r.perfil03]))
  const byPair = new Map()
  for (const r of CATALOG.recados) {
    assert.notEqual(r.de, r.para)
    const rule = profileOf[r.para].recados ?? 'todos'
    assert.notEqual(rule, 'ninguem', `${r.para} does not accept notes`)
    if (rule === 'amigos') assert.ok(friends(r.de, r.para), `${r.de} is not a friend of ${r.para}`)
    byPair.set(`${r.de}>${r.para}`, (byPair.get(`${r.de}>${r.para}`) ?? 0) + 1)
  }
  for (const [pair, n] of byPair) assert.ok(n <= 3, `${pair}: ${n} recados`)
  // testimonials and badges only between friends (with time), and whoever receives accepts
  for (const d of CATALOG.depoimentos) assert.ok(friends(d.de, d.para), `testimonial ${d.de} -> ${d.para}`)
  for (const [from, to] of CATALOG.selos) assert.ok(friends(from, to), `selo ${from} -> ${to}`)
  // communities: owner, moderators and members exist; nobody repeats; only open and moderated ones (the closed one disappears for the visitor)
  const refsC = new Set()
  for (const c of CATALOG.comunidades) {
    assert.ok(['aberta', 'moderada'].includes(c.acesso), c.ref)
    const people = [c.dono, ...c.moderadores, ...c.membros]
    assert.equal(new Set(people).size, people.length, `${c.ref}: repeated people`)
    for (const g of people) assert.ok(slugs.has(g), g)
    refsC.add(c.ref)
  }
  const roleIn = (c, slug) => {
    const cv = CATALOG.comunidades.find((x) => x.ref === c)
    return cv.dono === slug ? 'dono' : cv.moderadores.includes(slug) ? 'moderador' : cv.membros.includes(slug) ? 'membro' : null
  }
  // topics: the author has a role in the community; the poll has valid options and duration; the category exists in the community
  const refsT = new Set()
  for (const t of CATALOG.topicos) {
    assert.ok(refsC.has(t.c), t.ref)
    assert.ok(roleIn(t.c, t.de), `${t.ref}: ${t.de} is not part of ${t.c}`)
    if (t.categoria) assert.ok(CATALOG.comunidades.find((x) => x.ref === t.c).categorias.includes(t.categoria), `${t.ref}: categoria ${t.categoria}`)
    if (t.enquete) assert.ok(t.enquete.opcoes.length >= 2 && t.enquete.dias >= 1 / 24 && t.enquete.dias <= 30)
    refsT.add(t.ref)
  }
  // forum replies: the topic exists, the replier takes part, `em` and `cita` point to EARLIER replies in the same topic
  const seen = new Map()
  for (const f of CATALOG.respostasForum) {
    assert.ok(refsT.has(f.t), `${f.ref}: topic ${f.t}`)
    const t = CATALOG.topicos.find((x) => x.ref === f.t)
    assert.ok(roleIn(t.c, f.de), `${f.ref}: ${f.de} is not part of ${t.c}`)
    for (const target of [f.em, f.cita].filter(Boolean)) assert.equal(seen.get(target), f.t, `${f.ref} points to ${target}, which is not earlier in the same topic`)
    if (f.em) assert.ok(!CATALOG.respostasForum.find((x) => x.ref === f.em).em, `${f.ref}: only one nesting level`)
    seen.set(f.ref, f.t)
  }
  for (const r of CATALOG.resolvidos) assert.equal(seen.get(r.f), r.t)
  for (const [, t, option] of CATALOG.votos) assert.ok(option < CATALOG.topicos.find((x) => x.ref === t).enquete.opcoes.length)
  // no string in catalog 0.3 has a dash (house rule)
  assert.ok(!/[—–]/.test(JSON.stringify(CATALOG)), 'em dash and en dash are forbidden')
})

// ------------------------------------------------------------------------------------------------------------------------------
// Time: seeding waits for the relay, it does not work around it
// ------------------------------------------------------------------------------------------------------------------------------

test('day 0: publishes what has no minimum age, DEFERS community and page with the right date, and nothing that depends on them is published', async () => {
  const m = await startRelay()
  const r = await m.rodar()
  for (const [phase, n] of Object.entries({ perfis: 18, postagens: 24, respostas: 30, seguir: 48, reacoes: 69, estados: 18, 'amizades-pedir': 22, 'amizades-aceitar': 20, recados: 22, entregas: 8, relacoes: 1 })) {
    assert.equal(r.criados[phase], n, phase)
  }
  const deferred = byPhase(r.adiados)
  assert.deepEqual(Object.keys(deferred).filter((f) => !['comunidades', 'paginas'].includes(f) && !r.adiados.filter((a) => a.phase === f).every((a) => /depende de/.test(a.motivo) || a.motivo === 'conta_nova' || a.motivo === 'em_carencia')), [], 'every deferral has a reason of time or dependency')
  assert.equal(deferred.comunidades, 5)
  assert.equal(deferred.paginas, 3)
  assert.ok(r.adiados.filter((a) => a.phase === 'comunidades').every((a) => a.motivo === 'conta_nova'))
  // the required age is 1 day: the relay says how much is left (86400 minus what has passed since the profile, a few seconds) and the seeder returns the date
  assert.ok(r.proximaRodada >= T0 + DAY - 5 && r.proximaRodada <= T0 + DAY + 5, `next round ${r.proximaRodada - T0}`)
  // what depends on a community or a page was not even tried: none created, all deferred by dependency
  for (const phase of ['comunidades-entrar', 'topicos', 'respostas-forum', 'votos', 'paginas-seguir', 'atualizacoes', 'moderacao-banir']) {
    assert.equal(r.criados[phase] ?? 0, 0, phase)
    assert.ok(r.adiados.filter((a) => a.phase === phase).every((a) => /depende de/.test(a.motivo)), phase)
  }
  assert.equal((await m.get('/v1/comunidades')).json.itens.length, 0)
  assert.equal((await m.get('/v1/paginas')).json.itens.length, 0)
  // the 0.3 profile reached the relay, with portrait and the notes rule
  const nina = roverOf(m.semente, 'nina').uid
  const p = (await m.get(`/v1/rovers/${nina}`)).json
  assert.equal(p.perfil.corpo.recados, 'amigos')
  assert.deepEqual(p.perfil.corpo.retrato, { corpo: 'orelhinhas', cor: 'rosa', veste: 'laco', acessorio: 'cachecol' })
  assert.ok(p.perfil.corpo.habilidades.length > 0 && p.perfil.corpo.sobre.length > 20)
})

test('matures in steps: 1 day, 10 minutes, 3 days, 7 days, and the last round creates nothing more', async () => {
  const m = await startRelay()
  await m.rodar()

  // 11 minutes later it is still early: nothing changed (and the seeder does not insist on anything the relay would refuse for age)
  m.advance(660)
  const early = await m.rodar()
  assert.deepEqual(early.criados, {})

  // 1 day: the account is old enough to create a community and page, and everything that depended on them goes in, except what has a grace period
  m.advance(DAY)
  const day1 = await m.rodar()
  for (const [phase, n] of Object.entries({ comunidades: 5, 'comunidades-entrar': 26, 'comunidades-aprovar': 8, 'comunidades-moderadores': 4, topicos: 10, paginas: 3, 'paginas-admins': 3, 'paginas-seguir': 16, atualizacoes: 7 })) {
    assert.equal(day1.criados[phase], n, phase)
  }
  // whoever just joined waits 10 minutes to reply and 1 hour to vote; owner and moderator reply right away
  assert.equal(day1.criados['respostas-forum'], 7)
  assert.equal(deferredIn(day1, 'respostas-forum'), 17)
  assert.equal(deferredIn(day1, 'votos'), 10)
  assert.ok(day1.adiados.filter((a) => a.phase === 'respostas-forum').every((a) => a.motivo === 'em_carencia' || /depende de/.test(a.motivo)))
  assert.ok(day1.proximaRodada >= m.relogio.agora && day1.proximaRodada <= m.relogio.agora + 700, 'the next useful round is in about 10 minutes')
  // testimonial and badge keep waiting for the friendship to reach 3 and 7 days
  assert.equal(deferredIn(day1, 'depoimentos'), 6)
  assert.equal(deferredIn(day1, 'selos'), 14)

  // 1 hour and 10 minutes: replies, vote, solved and the moderation case (which depends on the spam reply) go in
  m.advance(3700)
  const hour = await m.rodar()
  for (const [phase, n] of Object.entries({ 'respostas-forum': 17, votos: 10, 'topicos-resolvidos': 1, 'moderacao-resposta': 1, 'moderacao-remover': 1, 'moderacao-banir': 1, 'moderacao-apelar': 1 })) {
    assert.equal(hour.criados[phase], n, phase)
  }
  assert.equal(deferredIn(hour, 'respostas-forum'), 0)

  // 3 days: 3-day friendships give testimonials, the owner accepts; badge not yet
  m.advance(3 * DAY)
  const day3 = await m.rodar()
  assert.equal(day3.criados.depoimentos, 6)
  assert.equal(day3.criados['depoimentos-aceitar'], 6)
  assert.equal(deferredIn(day3, 'selos'), 14)

  // 7 dias: selo
  m.advance(7 * DAY)
  const day7 = await m.rodar()
  assert.equal(day7.criados.selos, 14)
  assert.deepEqual(day7.adiados, [])
  assert.equal(day7.proximaRodada, null)

  // and one more round does nothing: idempotent
  const last = await m.rodar()
  assert.deepEqual(last.criados, {})
  assert.deepEqual(last.adiados, [])

  // what the screens read
  const communities = (await m.get('/v1/comunidades?limite=50')).json.itens
  assert.deepEqual(communities.map((c) => c.nome).sort(), CATALOG.comunidades.map((c) => c.nome).sort())
  const dirs = communities.find((c) => c.nome === 'Pastas e Mapas')
  const list = (await m.get(`/v1/comunidades/${dirs.id}/topicos`)).json
  assert.deepEqual(list.fixados.map((t) => t.titulo), ['Regras e boas-vindas'])
  const topics = Object.fromEntries(list.itens.map((t) => [t.titulo, t]))
  assert.equal(topics['Mudança nas regras de respostas'].trancado, true)
  assert.equal(topics['Como vocês fazem backup de pasta de trabalho?'].resolvido, true)
  assert.equal(topics['Como vocês fazem backup de pasta de trabalho?'].respostas, 6)
  assert.equal(topics['Qual convenção de nome de arquivo vocês adotam?'].enquete, true)
  assert.equal(topics['O arquivo que apareceu duas vezes'].respostas, 0, 'a topic with no reply, on purpose')
  const madrugada = communities.find((c) => c.nome === 'Madrugada Produtiva')
  const record = (await m.get(`/v1/comunidades/${madrugada.id}/moderacao/registro`)).json.itens
  assert.deepEqual(record.map((e) => e.acao).sort(), ['banimento', 'remocao'])
  assert.ok(record.every((e) => e.motivo === 'spam'))
  assert.equal((await m.get('/v1/paginas?limite=50')).json.itens.length, 3)
  const teco = roverOf(m.semente, 'teco').uid
  assert.equal((await m.get(`/v1/rovers/${teco}/depoimentos`)).json.itens.length, 2, 'only the accepted ones appear')
  assert.deepEqual((await m.get(`/v1/rovers/${teco}/selos`)).json.selos, { confiavel: 1, caprichoso: 1, rapido: 1, divertido: 1 })
})
const deferredIn = (r, phase) => r.adiados.filter((a) => a.phase === phase).length

test('the ledger carries the author in the key: two rovers that follow the same target count as two', async () => {
  const m = await startRelay()
  const r = await m.rodar()
  assert.equal(r.criados.seguir, CATALOG.seguir.length)
  assert.equal(Object.keys(m.ledger.itens.seguir).length, CATALOG.seguir.length)
  assert.ok(Object.keys(m.ledger.itens.seguir).every((k) => /^[a-z]+\|rvr_/.test(k)), 'author and target in the key')
  const follows = {}
  for (const [from, to] of CATALOG.seguir) if (to === 'pipa') follows[from] = true
  assert.ok(Object.keys(follows).length >= 4, 'the catalog has several followers of the same person')
  const pipa = roverOf(m.semente, 'pipa').uid
  assert.equal((await m.get(`/v1/rovers/${pipa}`)).json.seguidores, Object.keys(follows).length)
})

test('the catalog grows: new items that share parts of the key with old ones go in, and what already existed is not repeated', async () => {
  const m = await startRelay()
  await m.rodar()
  m.advance(DAY + 60)
  await m.rodar()
  m.advance(3700)
  await m.rodar()
  m.advance(10 * DAY)
  await m.rodar()
  const larger = {
    ...CATALOG,
    estados: [...CATALOG.estados, ['pipa', 'dormindo'], ['pipa', 'ausente']],
    amizades: [...CATALOG.amizades, ['juju', 'tuca'], ['juju', 'max']],
    votos: [...CATALOG.votos, ['teco', 't-nomes', 0]],
    reacoesSociais: [...CATALOG.reacoesSociais, ['teco', 't-boasvindas', 'curtir'], ['pipa', 'f-24', 'util']],
    selos: [...CATALOG.selos, ['tuca', 'nina', 'confiavel'], ['max', 'tuca', 'divertido']],
    relacoes: [...CATALOG.relacoes, ['lola', 'nina', 'silenciar'], ['max', 'pingo', 'silenciar'], ['max', 'pingo', 'dessilenciar']],
    recados: [...CATALOG.recados, { de: 'nina', para: 'teco', texto: 'Segundo recado do dia, que não repete o primeiro.' }]
  }
  const r = await m.rodar({ catalogo: larger })
  assert.deepEqual(r.criados, {
    estados: 2, 'amizades-pedir': 2, 'amizades-aceitar': 2, votos: 1, 'reacoes-sociais': 2, selos: 2, relacoes: 3, recados: 1
  })
  const second = await m.rodar({ catalogo: larger })
  assert.deepEqual(second.criados, {})
})

test('the ledger stores `true` for an action (the relay does not serve the envelope) and the id for content', async () => {
  const m = await startRelay()
  // the whole calendar, so ALL phases (vote, badge, moderation...) have run before looking at the ledger
  await m.rodar()
  m.advance(DAY + 60)
  await m.rodar()
  m.advance(3700)
  await m.rodar()
  m.advance(11 * DAY)
  await m.rodar()
  // hand-written list, not derived from the `acao` flag of the phases (otherwise a wrong flag would confirm itself)
  const ACTIONS = [
    'estados', 'amizades-pedir', 'amizades-aceitar', 'comunidades-entrar', 'comunidades-aprovar', 'comunidades-moderadores',
    'topicos-resolvidos', 'topicos-fixar', 'topicos-trancar', 'votos', 'paginas-admins', 'paginas-seguir', 'depoimentos-aceitar', 'selos',
    'relacoes', 'moderacao-remover', 'moderacao-banir', 'moderacao-apelar'
  ]
  const CONTENT = ['postagens', 'respostas', 'recados', 'entregas', 'comunidades', 'topicos', 'respostas-forum', 'paginas', 'atualizacoes', 'depoimentos', 'moderacao-resposta']
  const done = Object.keys(m.ledger.itens)
  for (const phase of [...ACTIONS, ...CONTENT]) assert.ok(done.includes(phase), `${phase} ran and is in the ledger`)
  for (const phase of ACTIONS) for (const v of Object.values(m.ledger.itens[phase] ?? {})) assert.equal(v, true, `${phase}: action stores true`)
  for (const phase of CONTENT) for (const v of Object.values(m.ledger.itens[phase] ?? {})) assert.match(v, /^ob_/, `${phase}: content stores the id`)
  assert.ok(Object.keys(m.ledger.itens).length > 15)
})

test('the poll lasts what the catalog says, counted from the moment of publication', async () => {
  const m = await startRelay()
  await m.rodar()
  m.advance(DAY + 60)
  const t = m.relogio.agora
  await m.rodar()
  const communities = (await m.get('/v1/comunidades?limite=50')).json.itens
  const dirs = communities.find((c) => c.nome === 'Pastas e Mapas')
  const topics = (await m.get(`/v1/comunidades/${dirs.id}/topicos`)).json.itens
  const withPoll = topics.find((x) => x.enquete)
  const { enquete: poll } = (await m.get(`/v1/topicos/${withPoll.id}`)).json
  assert.equal(poll.encerraEm, t + CATALOG.topicos.find((x) => x.enquete).enquete.dias * DAY)
  assert.deepEqual(poll.opcoes.map((o) => o.texto), CATALOG.topicos.find((x) => x.enquete).enquete.opcoes)
})

test('the attestation is valid for 80 days and is renewed when fewer than 30 remain; before that the profile stays as it is', async () => {
  const m = await startRelay()
  await m.rodar()
  const uid = roverOf(m.semente, 'pipa').uid
  const attestation = async () => (await m.get(`/v1/rovers/${uid}`)).json.atestado
  const a0 = await attestation()
  assert.equal(a0.expiraEm - a0.emitidoEm, 80 * DAY)
  // 30 and a half days left: does not renew yet
  m.advance(80 * DAY - 30 * DAY - 12 * 3600 - 10)
  const early = await m.rodar()
  assert.equal(early.existentes.perfis, 18)
  assert.equal((await attestation()).emitidoEm, a0.emitidoEm)
  // 29 and a half days left: renews (a new profile with the new attestation), and the relay accepts because the old attestation is still valid
  m.advance(DAY)
  const late = await m.rodar()
  assert.equal(late.criados.perfis, 18)
  const a1 = await attestation()
  assert.ok(a1.emitidoEm > a0.emitidoEm)
  assert.equal(a1.expiraEm - a1.emitidoEm, 80 * DAY)
})

test('lost ledger: with the relay already seeded the round REFUSES and says why; with the explicit option, community and page are not duplicated and the clock does not break', async () => {
  const m = await startRelay()
  await m.rodar()
  m.advance(DAY + 60)
  await m.rodar()
  const before = (await m.get('/v1/comunidades?limite=50')).json.itens.map((c) => c.id).sort()
  const pagesBefore = (await m.get('/v1/paginas?limite=50')).json.itens.map((c) => c.id).sort()
  assert.equal(before.length, 5)
  m.ledger.itens = {}
  m.ledger.rovers = {}
  m.advance(5)
  await assert.rejects(() => m.rodar(), /o registro do que foi feito \(o arquivo de estado\) está vazio/)
  // --simular only reads: it does not refuse
  assert.equal((await m.rodar({ simulate: true })).simulado, true)
  // with the option, it goes on: each rover's head is an action the relay does not serve, and even so the clock does not go backwards
  const r = await m.rodar({ acceptWithoutLedger: true })
  assert.equal(r.existentes.comunidades, 5, 'the relay said they already exist and the seeder recovered the id by name')
  assert.equal(r.existentes.paginas, 3)
  assert.equal(r.existentes.perfis, 18)
  assert.deepEqual((await m.get('/v1/comunidades?limite=50')).json.itens.map((c) => c.id).sort(), before)
  assert.deepEqual((await m.get('/v1/paginas?limite=50')).json.itens.map((c) => c.id).sort(), pagesBefore)
  assert.ok(m.ledger.itens.comunidades && Object.values(m.ledger.itens.comunidades).every((id) => /^ob_/.test(id)), 'the recovered id went into the ledger')
})

test('--simular only reads and counts: it does not publish, does not write to the ledger and does not defer', async () => {
  const m = await startRelay()
  const r = await m.rodar({ simulate: true })
  assert.equal(r.simulado, true)
  assert.equal(r.criados.perfis, 18)
  assert.deepEqual(r.adiados, [])
  assert.deepEqual(m.ledger.itens, {})
  assert.equal((await m.get(`/v1/rovers/${roverOf(m.semente, 'seixo').uid}`)).status, 404, 'no rover was created')
})

test('progress is delivered to the caller after each phase and at the end, even when the round fails', async () => {
  const m = await startRelay()
  const times = []
  await m.rodar({ onProgress: (l) => times.push(Object.keys(l.itens).length) })
  assert.ok(times.length >= PHASES.filter((f) => f.exige === null || f.exige === '0.3').length, 'once per phase, plus the end')
  assert.ok(times.at(-1) >= times[0])
  let calls = 0
  const broken = { ...CATALOG, respostas: [{ ref: 'rx', de: 'pipa', a: 'p-que-nao-existe', texto: 'Resposta a um post que o catálogo não tem.' }] }
  const m2 = await startRelay()
  await assert.rejects(() => m2.rodar({ catalogo: broken, onProgress: () => { calls++ } }), SeedingError)
  assert.ok(calls >= 2, 'the ledger was delivered before the round failed')
})

test('a ref that the catalog never publishes is a catalog error (not a deferral); a code the relay returns and nobody foresaw stops with that code', async () => {
  const m = await startRelay()
  const broken = { ...CATALOG, respostasForum: [{ ref: 'fx', t: 't-que-nao-existe', de: 'pipa', texto: 'Resposta a um tópico que o catálogo não tem.' }] }
  await assert.rejects(() => m.rodar({ catalogo: broken }), /aponta para "t-que-nao-existe", que não foi publicado nem existe/)
  const m2 = await startRelay()
  // Lola blocks Pipa; then the catalog asks for a note from Lola to Pipa: the relay refuses with a code no phase foresaw
  // (interacao_nao_permitida is only tolerated where friendship time is at play, testimonial and badge), and seeding stops saying which
  const base = { ...CATALOG, recados: [], estados: [], amizades: [], pedidosPendentes: [], relacoes: [['lola', 'pipa', 'bloquear']] }
  await m2.rodar({ catalogo: base })
  const withNote = { ...base, recados: [{ de: 'lola', para: 'pipa', texto: 'Um recado que o relé vai recusar, porque a Lola bloqueou a Pipa.' }] }
  await assert.rejects(() => m2.rodar({ catalogo: withNote }), /o relé recusou recado do rover lola: interacao_nao_permitida/)
})

test('a phase the relay does not support is skipped with a warning; what the relay declares does not change the rest', async () => {
  const m = await startRelay()
  const original = PHASES.length
  PHASES.push({ nome: 'futuro', tipo: 'topico', exige: '9.9', itens: () => [{ de: 'seixo' }], autor: (i) => i.de, chave: () => 'x', corpo: () => ({}) })
  try {
    const r = await m.rodar()
    assert.equal(r.pulados.length, 1)
    assert.equal(r.pulados[0].phase, 'futuro')
    assert.match(r.pulados[0].motivo, /precisa da 9\.9/)
  } finally { PHASES.length = original }
})

test('the deferred report describes each item in words: the label of each phase', () => {
  const expected = {
    estados: 'seixo', 'amizades-pedir': 'pipa pede a nina', 'amizades-aceitar': 'nina aceita pipa', recados: 'nina para teco',
    entregas: 'pipa: Mapa das pastas de projeto', comunidades: 'Pastas e Mapas', 'comunidades-entrar': 'seixo entra em c-pastas',
    'comunidades-aprovar': 'otto aprova max em c-revisores', 'comunidades-moderadores': 'pipa promove seixo em c-pastas', topicos: 'Regras e boas-vindas',
    'respostas-forum': 'pipa em t-backup', 'topicos-resolvidos': 't-backup resolvido por f-05', 'topicos-fixar': 'fixar t-boasvindas',
    'topicos-trancar': 'trancar t-aviso', votos: 'nina vota em t-nomes', paginas: 'Mapa de Pastas', 'paginas-admins': 'seixo administra g-mapa',
    'paginas-seguir': 'nina segue g-mapa', atualizacoes: 'pipa em g-mapa', 'reacoes-sociais': 'nina reage a t-boasvindas',
    depoimentos: 'pipa para teco', 'depoimentos-aceitar': 'teco aceita d-01', selos: 'pipa dá caprichoso a teco', relacoes: 'lola silenciar pingo',
    'moderacao-resposta': 'pingo em t-foco', 'moderacao-remover': 'biscoito remove f-spam', 'moderacao-banir': 'biscoito bane pingo', 'moderacao-apelar': 'pingo apela'
  }
  for (const phase of PHASES.filter((f) => f.rotulo)) {
    const item = phase.itens(CATALOG)[0]
    assert.equal(phase.rotulo(item), expected[phase.nome], phase.nome)
  }
  assert.equal(Object.keys(expected).length, PHASES.filter((f) => f.rotulo).length)
})

test('a round with nothing new makes no POST, and after a recovery without state the next round does not either', async () => {
  const m = await startRelay()
  await m.rodar()
  m.advance(DAY + 60)
  await m.rodar()
  m.advance(3700)
  await m.rodar()
  m.advance(11 * DAY)
  await m.rodar()
  const posts = []
  const counting = (...a) => { if (a[1]?.method === 'POST') posts.push(a[0]); return fetch(...a) }
  const stopped = await m.rodar({ fetchFn: counting })
  assert.deepEqual(stopped.criados, {})
  assert.equal(posts.length, 0, 'no object published')
  // ledger lost and recovered with the option: the relay says "already exists" (ja_segue, ja_existe) and the recovery records that in the ledger,
  // so the next round publishes nothing. (Short catalog: with the full catalog the recovery repeats content, as the doc says.)
  const short = {
    ...CATALOG, postagens: [], respostas: [], reacoes: [], recados: [], entregas: [], comunidades: [], topicos: [], respostasForum: [], resolvidos: [], votos: [],
    paginas: [], atualizacoes: [], reacoesSociais: [], depoimentos: [], selos: [], relacoes: [], moderacao: null,
    estados: CATALOG.estados.slice(0, 3), amizades: CATALOG.amizades.slice(0, 3), pedidosPendentes: [], seguir: CATALOG.seguir.slice(0, 5)
  }
  m.ledger.itens = {}
  m.ledger.rovers = {}
  m.advance(5)
  const recovered = await m.rodar({ catalogo: short, acceptWithoutLedger: true })
  assert.equal(recovered.existentes.seguir, 5, 'the relay said ja_segue and the seeder understood')
  assert.equal(recovered.existentes['amizades-pedir'], 3)
  assert.ok(Object.values(m.ledger.itens.seguir).every((v) => v === true), 'what the relay already had goes into the ledger as done')
  assert.ok(Object.values(m.ledger.itens['amizades-pedir']).every((v) => v === true))
  const before = posts.length
  const next = await m.rodar({ catalogo: short, fetchFn: counting })
  assert.deepEqual(next.criados, {})
  assert.equal(posts.length, before, 'the next round recognizes everything and publishes nothing')
})

test('without a ledger, old content that is in the readable chain is recognized; only what is missing is published', async () => {
  const m = await startRelay()
  const so02 = { ...CATALOG, estados: [], amizades: [], pedidosPendentes: [], recados: [], entregas: [], comunidades: [], topicos: [], respostasForum: [], resolvidos: [], votos: [], paginas: [], atualizacoes: [], reacoesSociais: [], depoimentos: [], selos: [], relacoes: [], moderacao: null }
  const first = await m.rodar({ catalogo: so02 })
  assert.equal(first.criados.postagens, 24)
  m.ledger.itens = {}
  m.ledger.rovers = {}
  m.advance(5)
  const second = await m.rodar({ catalogo: { ...so02, postagens: [...so02.postagens, { ref: 'px', de: 'seixo', topicos: ['avisos'], texto: 'Uma postagem nova depois da recuperação.' }] }, acceptWithoutLedger: true })
  assert.equal(second.existentes.postagens, 24, 'recognized from the rover chain')
  assert.equal(second.existentes.respostas, 30)
  assert.equal(second.criados.postagens, 1, 'only the new one')
  assert.equal(second.criados.respostas, undefined)
})

test('the attestation: with exactly 30 days left it does not renew; one second less, it renews', async () => {
  const m = await startRelay()
  await m.rodar()
  const uid = roverOf(m.semente, 'pipa').uid
  const a0 = (await m.get(`/v1/rovers/${uid}`)).json.atestado
  // the attestation was issued 10 s before the first profile; having exactly 30 days left means being at (80 days - 10 s - 30 days) from the first profile
  m.advance(a0.expiraEm - 30 * DAY - m.relogio.agora)
  assert.equal((await m.rodar()).existentes.perfis, 18, 'exactly 30 days: does not renew')
  m.advance(1)
  assert.equal((await m.rodar()).criados.perfis, 18, 'one second less remaining: renews')
})

// ------------------------------------------------------------------------------------------------------------------------------
// The executable: ledger in a file, owner only, and the notice of when to come back
// ------------------------------------------------------------------------------------------------------------------------------

test('seed-demo.mjs: writes the state to a 0600 file, prints the deferred items and the next round, and the second round creates nothing', async () => {
  const m = await startRelay()
  const dir = mkdtempSync(join(tmpdir(), 'rn-sem-'))
  try {
    const seedFile = join(dir, 'semente')
    writeFileSync(seedFile, m.semente.toString('base64url'), { mode: 0o600 })
    const state = join(dir, 'estado.json')
    // the test relay runs on T0 time (2030); the executable uses the real clock, so we only prove the shape, not the maturing
    // asynchronous on purpose: the test relay lives in THIS process, and a spawnSync would leave it unresponsive
    const runCli = () => new Promise((ok) => {
      const f = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, '--relay', m.url, '--semente-arquivo', seedFile, '--estado', state, '--intervalo-ms', '0'])
      let stdout = ''
      let stderr = ''
      f.stdout.on('data', (d) => { stdout += d })
      f.stderr.on('data', (d) => { stderr += d })
      f.on('close', (status) => ok({ status, stdout, stderr }))
    })
    m.relogio.agora = Math.floor(Date.now() / 1000)
    const one = await runCli()
    assert.equal(one.status, 0, one.stderr)
    const output = JSON.parse(one.stdout)
    assert.equal(output.criados.perfis, 18)
    assert.ok(output.totalAdiado > 0 && output.adiados.comunidades === 5)
    assert.ok(output.proximaRodada && new Date(output.proximaRodada).getTime() > Date.now() + 80_000_000, 'the next round is in about a day')
    assert.match(one.stderr, /Rode de novo a partir de /)
    assert.ok(existsSync(state))
    assert.equal(statSync(state).mode & 0o777, 0o600, 'only the owner can access the state')
    const ledger = JSON.parse(readFileSync(state, 'utf8'))
    assert.equal(ledger.versao, 1)
    assert.equal(Object.keys(ledger.itens.seguir).length, 48)
    assert.ok(!one.stdout.includes(m.semente.toString('base64url')) && !one.stderr.includes(m.semente.toString('base64url')), 'never prints the seed')
    const two = await runCli()
    assert.equal(two.status, 0, two.stderr)
    assert.deepEqual(JSON.parse(two.stdout).criados, {})
    // a state file that is not a seeding record is never overwritten
    writeFileSync(state, '{"nao":"e um registro"}')
    const bad = await runCli()
    assert.equal(bad.status, 2)
    assert.match(bad.stderr, /não vou sobrescrever/)
    assert.equal(readFileSync(state, 'utf8'), '{"nao":"e um registro"}')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// ------------------------------------------------------------------------------------------------------------------------------
// The executable: usage, refusals, state and report
// ------------------------------------------------------------------------------------------------------------------------------

/** Runs the real executable. Asynchronous on purpose: the test relay lives in THIS process. */
const cli = (args) => new Promise((ok) => {
  const f = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, ...args])
  let stdout = ''
  let stderr = ''
  f.stdout.on('data', (d) => { stdout += d })
  f.stderr.on('data', (d) => { stderr += d })
  f.on('close', (status) => ok({ status, stdout, stderr }))
})
const withSeed = (m) => {
  const dir = mkdtempSync(join(tmpdir(), 'rn-cli-'))
  const seedFile = join(dir, 'semente')
  writeFileSync(seedFile, m.semente.toString('base64url'), { mode: 0o600 })
  return { pasta: dir, seedFile, estado: join(dir, 'estado.json'), limpar: () => rmSync(dir, { recursive: true, force: true }) }
}

test('seed-demo.mjs refuses what is wrong before touching any relay: missing argument, address, protocol and seed', async () => {
  const m = await startRelay()
  const s = withSeed(m)
  try {
    const requires = async (args, text) => {
      const r = await cli(args)
      assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`)
      assert.match(r.stderr, text)
      assert.equal(r.stdout, '')
    }
    await requires([], /uso: seed-demo\.mjs/)
    await requires(['--relay', m.url], /uso: seed-demo\.mjs/)
    await requires(['--semente-arquivo', s.seedFile], /uso: seed-demo\.mjs/)
    await requires(['--relay', 'isto nao e url', '--semente-arquivo', s.seedFile], /--relay não é um endereço válido/)
    await requires(['--relay', 'http://relay.exemplo.test', '--semente-arquivo', s.seedFile], /precisa ser https/)
    await requires(['--relay', m.url, '--semente-arquivo', join(s.pasta, 'nao-existe')], /ENOENT/)
    writeFileSync(join(s.pasta, 'ruim'), 'curta')
    await requires(['--relay', m.url, '--semente-arquivo', join(s.pasta, 'ruim'), '--estado', s.estado], /a semente do emissor precisa ter 32 bytes/)
  } finally { s.limpar() }
})

test('seed-demo.mjs: a relay that is down stops with code 1 and the message; the generation changes the rovers; the default is generation 1', async () => {
  const m = await startRelay()
  m.relogio.agora = Math.floor(Date.now() / 1000)
  const s = withSeed(m)
  try {
    const outside = await cli(['--relay', 'http://127.0.0.1:1', '--semente-arquivo', s.seedFile, '--estado', s.estado, '--intervalo-ms', '0'])
    assert.equal(outside.status, 1)
    assert.match(outside.stderr, /semeadura interrompida: sem resposta do relé/)
    const one = await cli(['--relay', m.url, '--semente-arquivo', s.seedFile, '--estado', s.estado, '--intervalo-ms', '0'])
    assert.equal(one.status, 0, one.stderr)
    const uid1 = (await m.get('/v1/handles/seixo')).json.uid
    assert.equal(uid1, roverOf(m.semente, 'seixo', 1).uid, 'without --geracao, generation 1 applies')
    const two = await cli(['--relay', m.url, '--semente-arquivo', s.seedFile, '--estado', join(s.pasta, 'g2.json'), '--geracao', '2', '--intervalo-ms', '0'])
    assert.equal(two.status, 1, 'generation 2 has new rovers with the same handles: the relay refuses the handle in use')
    assert.match(two.stderr, /o relé recusou perfil do rover seixo: handle_em_uso/)
  } finally { s.limpar() }
})

test('seed-demo.mjs: an invalid state file, in any form, is refused and never overwritten', async () => {
  const m = await startRelay()
  const s = withSeed(m)
  try {
    for (const bad of ['null', '{"versao":2,"itens":{},"rovers":{}}', '{"versao":1,"itens":"x","rovers":{}}', '{"versao":1,"itens":{},"rovers":null}', 'não é json']) {
      writeFileSync(s.estado, bad)
      const r = await cli(['--relay', m.url, '--semente-arquivo', s.seedFile, '--estado', s.estado, '--intervalo-ms', '0'])
      assert.equal(r.status, 2, bad)
      assert.match(r.stderr, /não vou sobrescrever/)
      assert.equal(readFileSync(s.estado, 'utf8'), bad, bad)
    }
  } finally { s.limpar() }
})

test('seed-demo.mjs --simular: only counts, writes no state, asks for no new round, and the next real round comes in ISO, one day later', async () => {
  const m = await startRelay()
  m.relogio.agora = Math.floor(Date.now() / 1000)
  const s = withSeed(m)
  try {
    const yes = await cli(['--relay', m.url, '--semente-arquivo', s.seedFile, '--estado', s.estado, '--intervalo-ms', '0', '--simular'])
    assert.equal(yes.status, 0, yes.stderr)
    const output = JSON.parse(yes.stdout)
    assert.equal(output.simulado, true)
    assert.equal(output.estado, null)
    assert.equal(output.totalAdiado, 0)
    assert.ok(!existsSync(s.estado), 'simulate does not write the state')
    assert.doesNotMatch(yes.stderr, /esperam o tempo/)
    const real = await cli(['--relay', m.url, '--semente-arquivo', s.seedFile, '--estado', s.estado, '--intervalo-ms', '0'])
    const next = new Date(JSON.parse(real.stdout).proximaRodada).getTime() / 1000
    const now = Math.floor(Date.now() / 1000)
    assert.ok(next > now + DAY - 120 && next < now + DAY + 120, `next round: ${next - now} s`)
  } finally { s.limpar() }
})
