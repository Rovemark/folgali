// SPDX-License-Identifier: AGPL-3.0-or-later
// Edges and default values: what only shows up when the number is exactly right.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../../packages/relay/src/store.js'
import { TokenBucket } from '../../packages/relay/src/rate-limit.js'
import { Relay } from '../../packages/relay/src/relay.js'
import { codeOf, newWorld, publish, registeredRover } from '../helpers/test-relay.js'

const free = { porTipo: { perfil: [[3600, 100]], postagem: [[3600, 100]], seguir: [[3600, 100]] } }
const post = (text) => ({ texto: text, topicos: [] })

test('default pagination: 20 items per page in postagens and in the home timeline', () => {
  const m = newWorld({ rates: free })
  const a = registeredRover(m)
  const me = registeredRover(m)
  publish(m, me, 'seguir', { alvo: a.uid })
  for (let i = 0; i < 25; i++) publish(m, a, 'postagem', post(`p${i}`))
  for (const page of [m.rele.postsOf(a.uid), m.rele.homeTimeline(me.uid)]) {
    assert.equal(page.itens.length, 20)
    assert.notEqual(page.proximo, null)
  }
  assert.equal(m.rele.postsOf(a.uid, { antes: m.rele.postsOf(a.uid).proximo }).itens.length, 5)
})

test('block reason: from 1 to 200 characters', () => {
  const m = newWorld()
  const r = registeredRover(m)
  m.rele.bloquear({ tipo: 'rover', alvo: r.uid, motivo: 'x' })
  const from = (n) => `${'abcd '.repeat(Math.ceil(n / 5))}`.slice(0, n - 1) + 'e' // short words: text without long runs of non-space would hit the secret filter
  assert.equal(from(200).length, 200)
  m.rele.bloquear({ tipo: 'rover', alvo: r.uid, motivo: from(200) })
  assert.equal(codeOf(() => m.rele.bloquear({ tipo: 'rover', alvo: r.uid, motivo: from(201) })), 'esquema')
})

test('the report queue returns 50 by default and respects the requested limit', () => {
  const m = newWorld()
  for (let i = 0; i < 60; i++) {
    m.store.executar('INSERT INTO denuncias (alvo, autor_do_alvo, motivo, pseudonimo, criado_em) VALUES (:alvo, :autor, :motivo, :p, :agora)', {
      alvo: `ob_${String(i).padStart(43, 'A')}`, autor: `rvr_${'B'.repeat(22)}`, motivo: 'spam', p: `p${i}`, agora: m.relogio.agora
    })
  }
  assert.equal(m.rele.listReports().length, 50)
  assert.equal(m.rele.listReports({ limite: 60 }).length, 60)
  assert.equal(m.rele.listReports({ limite: 3 }).length, 3)
  assert.equal(m.rele.listReports()[0].alvo, `ob_${'59'.padStart(43, 'A')}`) // the newest first
})

test('report retention: 180 days counted in seconds, at the exact boundary', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const d = registeredRover(m)
  const p = publish(m, a, 'postagem', post('x'))
  publish(m, d, 'denuncia', { alvo: p.id, motivo: 'spam' })
  m.advance(180 * 86400)
  assert.equal(m.rele.limpar(), 0) // exactly 180 days: it still stays
  m.advance(1)
  assert.equal(m.rele.limpar(), 1)
})

test('the retention period can be configured', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const d = registeredRover(m)
  const p = publish(m, a, 'postagem', post('x'))
  publish(m, d, 'denuncia', { alvo: p.id, motivo: 'spam' })
  const short = new Relay({ store: m.store, provedor: m.provedor, relogio: () => m.relogio.agora, reportSecret: Buffer.alloc(32, 1), retencaoDenunciasDias: 1 })
  m.advance(86400 + 1)
  assert.equal(short.limpar(), 1)
})

test('report secret: 31 bytes does not work, 32 does', () => {
  const m = newWorld()
  const newValue = (n) => new Relay({ store: m.store, provedor: m.provedor, reportSecret: Buffer.alloc(n, 7) })
  assert.throws(() => newValue(31), /32 bytes/)
  assert.doesNotThrow(() => newValue(32))
})

test('removing twice does not rewrite the date of the first removal', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const p = publish(m, r, 'postagem', post('x'))
  publish(m, r, 'remocao-pelo-autor', { alvo: p.id })
  const first = m.store.objeto(p.id).removido_em
  assert.equal(first, m.relogio.agora)
  m.advance(100)
  publish(m, r, 'remocao-pelo-autor', { alvo: p.id })
  assert.equal(m.store.objeto(p.id).removido_em, first)
})

test('store: column name is a closed list and the file on disk uses WAL', () => {
  const m = newWorld()
  assert.throws(() => m.store.countSince('autor; DROP TABLE objetos; --', 'x', 0), /coluna inválida/)
  assert.throws(() => m.store.countSince('recebido_em', 'x', 0), /coluna inválida/)
  assert.equal(m.store.countSince('autor', 'ninguém', 0).n, 0)
  assert.equal(m.store.countSince('emissor', 'ninguém', 0, 'postagem').n, 0)
  assert.equal(m.store.um('PRAGMA journal_mode').journal_mode, 'memory')
  const dir = mkdtempSync(join(tmpdir(), 'rn-armazem-'))
  try {
    const onDisk = new Store(join(dir, 'rele.sqlite'))
    assert.equal(onDisk.um('PRAGMA journal_mode').journal_mode, 'wal')
    onDisk.fechar()
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('token bucket: the origins map has a default cap of 10 thousand', () => {
  const b = new TokenBucket({ capacity: 1, perSecond: 1, relogio: () => 0 })
  for (let i = 0; i < 10_500; i++) b.attempt(`origem-${i}`)
  assert.equal(b.tamanho, 10_000)
})

test('rate count per type uses the right type and the right window', () => {
  const m = newWorld({ rates: { porTipo: { perfil: [[3600, 100]], postagem: [[100, 2]], seguir: [[3600, 100]] } } })
  const r = registeredRover(m)
  publish(m, r, 'postagem', post('um'))
  publish(m, r, 'postagem', post('dois'))
  const e = (() => { try { publish(m, r, 'postagem', post('três')) } catch (x) { return x } return null })()
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.equal(e.retryAfterS, 100)
  // 0.11.0: the type, the window (a non-standard one is said in seconds) and the wait in words
  assert.match(e.message, /Limite de objetos do tipo postagem: 2 a cada 100 segundos\. Libera em 2 minutos\.$/)
  assert.deepEqual(e.limite, { max: 2, janelaS: 100 })
  m.advance(101)
  assert.equal(publish(m, r, 'postagem', post('quatro')).estado, 'aceito')
})

test('default clock: whole seconds of the real clock, in the relay and in the bucket', () => {
  const m = newWorld()
  const relay = new Relay({ store: m.store, provedor: m.provedor, reportSecret: Buffer.alloc(32, 3) })
  const now = Date.now() / 1000
  assert.ok(Number.isInteger(relay.relogio()))
  assert.ok(Math.abs(relay.relogio() - now) < 2, `relogio ${relay.relogio()} agora ${now}`)
  const bucket = new TokenBucket({ capacity: 1, perSecond: 1 })
  assert.ok(Math.abs(bucket.relogio() - now) < 2)
})
