// SPDX-License-Identifier: AGPL-3.0-or-later
// Addition of 2026-11-26 to revision 0.11.0 (`lembrancas`): GET /v1/rovers/:uid/lembrancas. What a rover published in windows relative to
// now (yesterday; one, two and three weeks ago; one month ago; its first day), a few full items per window, and nothing it should not show:
// removed, hidden or blocked content, a reply whose parent went away, a rover that left, was blocked or revoked. The last test bites:
// it rebuilds the module without each visibility rule in turn and proves the forbidden content comes back, so the rules are not decoration.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { REVIEW_APPEALS } from '../../packages/protocol/src/index.js'
import { MEMORIES, MEMORY_FILTERS } from '../../packages/relay/src/social-memories.js'
import { DAY, codeOf, fresh } from '../helpers/network.js'
import { publish, registeredRover } from '../helpers/test-relay.js'
import { start } from '../helpers/test-server.js'

const post = (text) => ({ texto: text, topicos: [] })
const idsOf = (w) => w.itens.map((i) => i.envelope?.objeto?.id)
const byWindow = (r) => Object.fromEntries(r.janelas.map((w) => [w.janela, idsOf(w)]))
const KEYS = ['ontem', 'uma-semana', 'duas-semanas', 'tres-semanas', 'um-mes', 'primeiro-dia']

/** Moves the world clock to an absolute instant (only forward: a rover's chain only goes forward in time). */
const at = (x, t) => {
  assert.ok(t >= x.m.relogio.agora, 'the clock only goes forward')
  x.m.relogio.agora = t
}

/** The relay first saw the rover at `t` (the test rovers are born with a 30-day-old account; this is set after they post). */
const firstSeen = (x, r, t) => x.m.store.executar('UPDATE rovers SET criado_em = :t WHERE uid = :uid', { t, uid: r.uid })

test('the resource is announced in /v1/info and the windows are the agreed ones', () => {
  assert.ok(REVIEW_APPEALS.includes('lembrancas'))
  const x = fresh()
  assert.ok(x.rele.info().recursos.includes('lembrancas'))
  assert.deepEqual(MEMORIES.janelas.map((w) => [w.janela, w.diasAtras]), [['ontem', 1], ['uma-semana', 7], ['duas-semanas', 14], ['tres-semanas', 21], ['um-mes', 30]])
  assert.equal(MEMORIES.primeiroDia, 'primeiro-dia')
  assert.equal(MEMORIES.defaultItems, 3)
})

test('each window brings what the rover published in that day, and nothing from the days in between or from today', () => {
  const x = fresh()
  const T0 = x.m.relogio.agora
  const END = T0 + 40 * DAY
  const pipa = x.rover({ handle: 'pipa.lembra', validadeS: 60 * DAY })
  const ana = x.rover({ handle: 'ana.vizinha', validadeS: 60 * DAY })
  const say = (t, text, r = pipa) => { at(x, t); return x.ok(r, 'postagem', post(text)) }
  const first = say(T0 + 3600, 'Primeiro dia na rede.')
  const month = say(END - 30.5 * DAY, 'Há um mês: aprendi a fazer pão.')
  const three = say(END - 21.5 * DAY, 'Há três semanas: tarde de chuva.')
  const two = say(END - 14.5 * DAY, 'Há duas semanas: um mapa antigo.')
  const one = say(END - 7.5 * DAY, 'Há uma semana: fila zerada.')
  const between = say(END - 3 * DAY, 'Num dia sem janela.')
  const anas = say(END - 1.6 * DAY, 'Alguém viu o pôr do sol?', ana)
  at(x, END - 1.5 * DAY)
  const yesterdayReply = x.ok(pipa, 'resposta', { alvo: anas.id, texto: 'Vi, da janela.' })
  const today = say(END - 3600, 'Hoje cedo.')
  firstSeen(x, pipa, T0)
  at(x, END)

  const r = x.s.lembrancas(pipa.uid)
  assert.deepEqual(Object.keys(r), ['rover', 'agora', 'desde', 'janelas'])
  assert.deepEqual({ rover: r.rover, agora: r.agora, desde: r.desde }, { rover: pipa.uid, agora: END, desde: T0 })
  assert.deepEqual(r.janelas.map((w) => w.janela), KEYS)
  // the bounds of every window, by what the relay received: [de, ate)
  const bounds = Object.fromEntries(r.janelas.map((w) => [w.janela, [w.de, w.ate]]))
  assert.deepEqual(bounds, {
    ontem: [END - 2 * DAY, END - DAY], 'uma-semana': [END - 8 * DAY, END - 7 * DAY], 'duas-semanas': [END - 15 * DAY, END - 14 * DAY],
    'tres-semanas': [END - 22 * DAY, END - 21 * DAY], 'um-mes': [END - 31 * DAY, END - 30 * DAY], 'primeiro-dia': [T0, T0 + DAY]
  })
  assert.deepEqual(byWindow(r), {
    ontem: [yesterdayReply.id], 'uma-semana': [one.id], 'duas-semanas': [two.id], 'tres-semanas': [three.id], 'um-mes': [month.id], 'primeiro-dia': [first.id]
  })
  const everything = r.janelas.flatMap(idsOf)
  for (const id of [between.id, today.id, anas.id]) assert.equal(everything.includes(id), false)
  // the item is the full item of the other lists, reply included
  const item = r.janelas[0].itens[0]
  assert.equal(item.tipo, 'resposta')
  assert.equal(item.autor.uid, pipa.uid)
  assert.equal(item.envelope.objeto.corpo.texto, 'Vi, da janela.')
  assert.deepEqual(Object.keys(item).slice(0, 6), ['tipo', 'envelope', 'autor', 'pagina', 'contagens', 'minhaReacao'])
  assert.equal(r.janelas[5].itens[0].tipo, 'postagem')
})

test('a young network: yesterday and the first day share hours and an item shows once; a first day not over yet is empty', () => {
  const x = fresh()
  const T0 = x.m.relogio.agora
  const pipa = x.rover({ handle: 'pipa.nova' })
  // Pipa arrived a day and a half before now, as the network itself
  at(x, T0 + 3600)
  const early = x.ok(pipa, 'postagem', post('Cheguei agora.'))
  at(x, T0 + 20 * 3600)
  const later = x.ok(pipa, 'postagem', post('Fim do primeiro dia.'))
  firstSeen(x, pipa, T0)
  at(x, T0 + 1.5 * DAY)
  const r = byWindow(x.s.lembrancas(pipa.uid))
  // [now - 2d, now - 1d) holds the first post; the first day [T0, T0 + 1d) holds both, and only gets what yesterday did not show
  assert.deepEqual(r.ontem, [early.id])
  assert.deepEqual(r['primeiro-dia'], [later.id])
  for (const k of ['uma-semana', 'duas-semanas', 'tres-semanas', 'um-mes']) assert.deepEqual(r[k], [])

  // a rover that arrived 10 hours ago: nothing is a memory yet, not even its first day
  const nina = x.rover({ handle: 'nina.chegou' })
  const now = x.m.relogio.agora
  x.ok(nina, 'postagem', post('Oi, rede.'))
  firstSeen(x, nina, now - 10 * 3600)
  const n = x.s.lembrancas(nina.uid)
  assert.ok(n.janelas.every((w) => w.itens.length === 0))
  assert.equal(n.janelas.length, 6)
})

test('in a window: at most `limite` items, the most points first, then the newest; `limite` from 1 to 10', () => {
  const x = fresh()
  const T0 = x.m.relogio.agora
  const pipa = x.rover({ handle: 'pipa.conta' })
  const fans = [x.rover(), x.rover(), x.rover()]
  const ids = []
  for (let i = 0; i < 5; i++) {
    at(x, T0 + i * 600)
    ids.push(x.ok(pipa, 'postagem', post(`Postagem ${i}.`)).id)
  }
  // post 1 gets a reply (3 points) and post 3 two reactions (2 points): those two lead, then the newest
  x.ok(fans[0], 'resposta', { alvo: ids[1], texto: 'Que bom.' })
  x.ok(fans[1], 'reacao', { alvo: ids[3], reacao: 'curtir' })
  x.ok(fans[2], 'reacao', { alvo: ids[3], reacao: 'amei' })
  at(x, T0 + 1.5 * DAY)
  assert.deepEqual(byWindow(x.s.lembrancas(pipa.uid)).ontem, [ids[1], ids[3], ids[4]])
  assert.deepEqual(byWindow(x.s.lembrancas(pipa.uid, { limite: 1 })).ontem, [ids[1]])
  assert.deepEqual(byWindow(x.s.lembrancas(pipa.uid, { limite: 10 })).ontem, [ids[1], ids[3], ids[4], ids[2], ids[0]])
  for (const bad of [0, 11, 1.5, -1]) assert.equal(codeOf(() => x.s.lembrancas(pipa.uid, { limite: bad })), 'esquema')
  assert.equal(codeOf(() => x.s.lembrancas('rvr_naoexisteAAAAAAAAAAAAA')), 'nao_encontrado')
  assert.equal(codeOf(() => x.s.lembrancas('qualquer-coisa')), 'nao_encontrado')
})

/**
 * The world where content that must NOT show sits in yesterday's window next to content that must. Returns the checks as a function of
 * how the memories are read, so the test that bites can run the SAME checks against a module without each rule.
 */
function forbiddenScene() {
  const x = fresh()
  const T0 = x.m.relogio.agora
  const pipa = x.rover({ handle: 'pipa.guarda' })
  const ana = x.rover({ handle: 'ana.posta' })
  const bia = x.rover({ handle: 'bia.vai.sair' })
  const caio = x.rover({ handle: 'caio.bloqueado' })
  const gone = x.rover({ handle: 'rover.que.saiu' })
  const blocked = x.rover({ handle: 'rover.bloqueado' })
  const revoked = x.rover({ handle: 'rover.revogado' })
  let t = T0
  const next = () => { t += 300; at(x, t) }
  const say = (r, text) => { next(); return x.ok(r, 'postagem', post(text)) }
  const reply = (r, target, text) => { next(); return x.ok(r, 'resposta', { alvo: target, texto: text }) }

  const kept = say(pipa, 'Esta fica.')
  const removed = say(pipa, 'Esta eu apaguei.')
  const hidden = say(pipa, 'Esta a moderação ocultou.')
  const blockedPost = say(pipa, 'Esta o operador bloqueou.')
  const anaLive = say(ana, 'Uma postagem viva.')
  const anaRemoved = say(ana, 'Uma postagem que a Ana apagou.')
  const anaHidden = say(ana, 'Uma postagem que a moderação ocultou.')
  const anaBlocked = say(ana, 'Uma postagem que o operador bloqueou.')
  const biaPost = say(bia, 'Já vou embora.')
  const caioPost = say(caio, 'Logo me bloqueiam.')
  const keptReply = reply(pipa, anaLive.id, 'Resposta que fica.')
  const toRemoved = reply(pipa, anaRemoved.id, 'Resposta a uma postagem apagada.')
  const toHidden = reply(pipa, anaHidden.id, 'Resposta a uma postagem oculta.')
  const toBlocked = reply(pipa, anaBlocked.id, 'Resposta a uma postagem bloqueada.')
  const toGone = reply(pipa, biaPost.id, 'Resposta a quem saiu.')
  const toBlockedAuthor = reply(pipa, caioPost.id, 'Resposta a um rover bloqueado.')
  for (const r of [gone, blocked, revoked]) say(r, `Ontem eu era ${r.handle}.`)

  // then, everything that takes content off the air
  x.ok(pipa, 'remocao-pelo-autor', { alvo: removed.id })
  x.ok(ana, 'remocao-pelo-autor', { alvo: anaRemoved.id })
  for (const h of [hidden, anaHidden]) x.s.hide({ id: h.id, tipo: 'postagem' }, null, x.m.relogio.agora)
  for (const b of [blockedPost, anaBlocked]) x.rele.bloquear({ tipo: 'objeto', alvo: b.id, motivo: 'denúncia em análise', motivoPublico: 'ilegal' })
  x.ok(bia, 'remocao-pelo-autor', { alvo: x.m.store.rover(bia.uid).perfil_id })
  x.rele.bloquear({ tipo: 'rover', alvo: caio.uid, motivo: 'teste' })
  x.ok(gone, 'remocao-pelo-autor', { alvo: x.m.store.rover(gone.uid).perfil_id })
  x.rele.bloquear({ tipo: 'rover', alvo: blocked.uid, motivo: 'teste' })
  x.m.provedor.revoke(x.m.provedor.publicKey, revoked.uid)
  x.rele._sync()
  at(x, T0 + 1.5 * DAY)

  const forbidden = [removed, hidden, blockedPost, toRemoved, toHidden, toBlocked, toGone, toBlockedAuthor, anaLive, biaPost, caioPost].map((o) => o.id)
  /** @param {(uid: string, o?: object) => object} read */
  const check = (read) => {
    const all = read(pipa.uid, { limite: 10 }).janelas.flatMap(idsOf)
    assert.deepEqual(all.sort(), [kept.id, keptReply.id].sort())
    for (const id of forbidden) assert.equal(all.includes(id), false, id)
    // a rover that left, was blocked or revoked has no memories to show at all
    for (const r of [gone, blocked, revoked]) assert.equal(codeOf(() => read(r.uid)), 'nao_encontrado', r.handle)
  }
  return { x, check }
}

test('nothing removed, hidden or blocked, no reply whose parent went away, nothing from anyone else, and no rover that left, was blocked or revoked', () => {
  const { x, check } = forbiddenScene()
  check((uid, o) => x.s.lembrancas(uid, o))
})

// ---------- the test that bites ----------

const SOURCE = fileURLToPath(new URL('../../packages/relay/src/social-memories.js', import.meta.url))
const GATE = 'const r = this.publicRover(uid, now)'

/** The module rebuilt with `edit` applied, in a temporary folder, importing the same modules as the original (absolute URLs). */
async function mutant(edit, dir) {
  const original = readFileSync(SOURCE, 'utf8')
  const changed = edit(original)
  assert.notEqual(changed, original, 'the mutation must change the source (the test would be checking nothing)')
  const absolute = changed.replace(/from '(\.\.?\/[^']+)'/g, (_, spec) => `from '${pathToFileURL(resolve(dirname(SOURCE), spec)).href}'`)
  const file = join(dir, `memories-${Math.random().toString(36).slice(2)}.js`)
  writeFileSync(file, absolute)
  return (await import(pathToFileURL(file).href)).Memories
}

/** Replaces the one source line that is exactly `rule` (followed by its comma or not) with a rule that lets everything through. */
const dropLine = (rule) => (src) => {
  const lines = src.split('\n')
  const found = lines.map((l, i) => (l.trim().replace(/,$/, '') === rule ? i : -1)).filter((i) => i >= 0)
  assert.equal(found.length, 1, `exactly one line that is ${rule}`)
  lines[found[0]] = lines[found[0]].replace(rule, "'1 = 1'")
  return lines.join('\n')
}

test('the test bites: without each visibility rule, the forbidden content comes back and the check above fails', async () => {
  const src = readFileSync(SOURCE, 'utf8')
  const block = src.slice(src.indexOf('export const MEMORY_FILTERS'), src.indexOf('])', src.indexOf('export const MEMORY_FILTERS')))
  const rules = block.split('\n').slice(1).map((l) => l.trim().replace(/,$/, '')).filter(Boolean)
  assert.equal(rules.length, MEMORY_FILTERS.length, 'one rule per line in MEMORY_FILTERS')
  assert.ok(src.includes(GATE))
  const dir = mkdtempSync(join(tmpdir(), 'rn-lembrancas-'))
  try {
    // the unchanged module, rebuilt the same way, passes: what fails below is the missing rule, not the rebuilding
    const same = await mutant((s) => s.replace('// SPDX', '// unchanged copy\n// SPDX'), dir)
    const ok = forbiddenScene()
    ok.check((uid, o) => same.prototype.lembrancas.call(ok.x.s, uid, o))
    const cases = [
      // each content rule alone
      ...rules.filter((rule) => rule !== 'ROVER_VISIBLE').map((rule) => [rule, dropLine(rule)]),
      // the rover in the path: without the gate a hidden rover answers 200 (empty), and without the gate and ROVER_VISIBLE its content comes back.
      // ROVER_VISIBLE alone is equivalent: the gate already refuses a rover that is not visible, with the same rule.
      ['gate', (s) => s.replace(GATE, 'const r = this.a.rover(uid)')],
      ['gate and ROVER_VISIBLE', (s) => dropLine('ROVER_VISIBLE')(s.replace(GATE, 'const r = this.a.rover(uid)'))]
    ]
    assert.equal(cases.length, MEMORY_FILTERS.length + 1)
    for (const [name, edit] of cases) {
      const Mutant = await mutant(edit, dir)
      const { x, check } = forbiddenScene()
      assert.throws(() => check((uid, o) => Mutant.prototype.lembrancas.call(x.s, uid, o)), assert.AssertionError, `the check did not catch the module without: ${name}`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ---------- HTTP ----------

test('over HTTP: public, 200 with the windows; a hidden rover 404; `limite` out of range 422; the same burst limit as every read', async () => {
  const srv = await start({ rajada: { capacity: 6, perSecond: 1 }, burstClock: () => 0 })
  try {
    const x = { m: srv.m }
    const { m } = srv
    const pipa = registeredRover(m, { handle: 'pipa.http' })
    at(x, m.relogio.agora + 600)
    const p = publish(m, pipa, 'postagem', post('Uma lembrança pela rede.'))
    at(x, m.relogio.agora + 1.2 * DAY)
    const r = await srv.call('GET', `/v1/rovers/${pipa.uid}/lembrancas`)
    assert.equal(r.status, 200)
    assert.deepEqual(r.json.janelas.map((w) => w.janela), KEYS)
    assert.deepEqual(byWindow(r.json).ontem, [p.objeto.id])
    const info = await srv.call('GET', '/v1/info')
    assert.ok(info.json.recursos.includes('lembrancas'))
    assert.equal((await srv.call('GET', `/v1/rovers/${pipa.uid}/lembrancas?limite=0`)).json.erro.campo, 'limite')
    assert.equal((await srv.call('GET', `/v1/rovers/${pipa.uid}/lembrancas?limite=11`)).status, 422)
    assert.equal((await srv.call('GET', '/v1/rovers/rvr_naoexisteAAAAAAAAAAAAA/lembrancas')).status, 404)
    // 6 tokens: five went above, the sixth passes and the seventh hits the burst limit of the origin
    assert.equal((await srv.call('GET', `/v1/rovers/${pipa.uid}/lembrancas?limite=1`)).status, 200)
    const burst = await srv.call('GET', `/v1/rovers/${pipa.uid}/lembrancas`)
    assert.equal(burst.status, 429)
    assert.equal(burst.json.erro.codigo, 'limite_de_taxa')
    assert.ok(srv.logs.some((e) => e.rota === '/v1/rovers/:uid/lembrancas' && e.status === 200))
  } finally {
    await srv.fechar()
  }
})
