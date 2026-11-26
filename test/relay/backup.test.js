// SPDX-License-Identifier: AGPL-3.0-or-later
// Consistent backup, rotation and restore of the relay database. The restore is truly proven: the restored database opens on a
// new relay and returns the same postagens as the original.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, truncateSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Store } from '../../packages/relay/src/store.js'
import { Relay } from '../../packages/relay/src/relay.js'
import { TestProvider } from '../../packages/relay/src/test-provider.js'
import { check, chooseToDelete, makeBackup, nameInstant, listBackups, backupName, restore, rotate } from '../../packages/relay/src/backup.js'
import { NOW } from '../helpers/world.js'
import { newRoverInWorld, publish } from '../helpers/test-relay.js'

const makeDir = () => mkdtempSync(join(tmpdir(), 'rn-backup-'))
const clear = (...ps) => ps.forEach((p) => rmSync(p, { recursive: true, force: true }))
const BIN = (name) => new URL(`../../packages/relay/bin/${name}`, import.meta.url).pathname
const NODE = ['--disable-warning=ExperimentalWarning']

/** A real relay on a SQLite file (WAL), with two rovers and a few postagens. */
function relayInFile(path) {
  const provider = new TestProvider()
  const clock = { agora: NOW }
  const store = new Store(path)
  const relay = new Relay({ store, provedor: provider, relogio: () => clock.agora, reportSecret: randomBytes(32) })
  const world = { provedor: provider, relogio: clock, store, rele: relay }
  const a = newRoverInWorld(world)
  const b = newRoverInWorld(world)
  publish(world, a, 'perfil', { nome: 'Pipa', descricao: 'Rover de teste.', grafo: 'publico', exigirAprovacao: [] }, { withAttestation: true })
  publish(world, b, 'perfil', { nome: 'Nina', descricao: 'Outro rover de teste.', grafo: 'publico', exigirAprovacao: [] }, { withAttestation: true })
  // A 30-day-old rover, as in the rest of the suite (test/helpers/test-relay.js): what these tests prove is the DATABASE, not the new-account cap.
  // The relay measures age since the first object seen, so it is enough to move that instant back.
  for (const r of [a, b]) world.store.executar('UPDATE rovers SET criado_em = criado_em - 2592000 WHERE uid = :uid', { uid: r.uid })
  for (const t of ['primeira', 'segunda', 'terceira']) publish(world, a, 'postagem', { texto: `Postagem ${t} da Pipa.`, topicos: ['teste'] })
  publish(world, b, 'seguir', { alvo: a.uid })
  return { ...world, a, b }
}

test('backup of a database in use: the copy opens, passes integrity_check, has the counts and the hash matches', () => {
  const dir = makeDir()
  try {
    const m = relayInFile(join(dir, 'rele.sqlite'))
    const r = makeBackup({ banco: join(dir, 'rele.sqlite'), pasta: join(dir, 'b'), agora: new Date('2026-11-05T12:00:00Z') })
    assert.equal(r.arquivo, 'rele-20261105-120000.sqlite')
    assert.equal(r.contagens.rovers, 2)
    assert.equal(r.contagens.objetos, 6)
    assert.deepEqual(check(r.caminho), { rovers: 2, objetos: 6 })
    assert.match(readFileSync(`${r.caminho}.sha256`, 'utf8'), new RegExp(`^${r.sha256}  ${r.arquivo}\n$`))
    assert.equal(statSync(r.caminho).mode & 0o777, 0o600)
    assert.equal(statSync(`${r.caminho}.sha256`).mode & 0o777, 0o600)
    assert.equal(statSync(join(dir, 'b')).mode & 0o777, 0o700)
    assert.deepEqual(readdirSync(join(dir, 'b')).filter((n) => n.endsWith('.parcial')), [])
    m.store.fechar()
  } finally { clear(dir) }
})

test('backup while the relay keeps writing: every copy is consistent and the counts only grow', async () => {
  const dir = makeDir()
  const dbPath = join(dir, 'rele.sqlite')
  relayInFile(dbPath).store.fechar()
  // a separate process writing row by row (each in its own transaction), as the relay would
  const writer = spawn(process.execPath, [...NODE, '--input-type=module', '-e', `
    import { DatabaseSync } from 'node:sqlite'
    const db = new DatabaseSync(process.argv[1]); db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL')
    const ins = db.prepare("INSERT INTO objetos (id, autor, tipo, criado_em, recebido_em, emissor) VALUES (:id, 'rvr_x', 'reacao', 1, 1, 'e')")
    let parar = false, n = 0
    process.stdin.on('data', () => { parar = true })
    console.log('pronto')
    const lote = () => {
      if (parar) { db.close(); console.log(n); process.exit(0) }
      for (let i = 0; i < 50; i++) ins.run({ id: 'ob_ruido_' + (n++) }) // each row in its own transaction
      setImmediate(lote)
    }
    lote()
  `, dbPath], { stdio: ['pipe', 'pipe', 'inherit'] })
  let output = ''
  writer.stdout.on('data', (d) => { output += d })
  const finished = new Promise((ok) => writer.on('close', ok))
  try {
    while (!output.includes('pronto')) await new Promise((ok) => setTimeout(ok, 20))
    await new Promise((ok) => setTimeout(ok, 100))
    let previous = 0
    const copies = []
    for (let i = 0; i < 8; i++) {
      const r = makeBackup({ banco: dbPath, pasta: join(dir, 'b'), agora: new Date(Date.UTC(2026, 10, 5, 12, 0, i)) })
      assert.ok(r.contagens.objetos >= previous, 'the count does not go backwards')
      previous = r.contagens.objetos
      copies.push(r)
      assert.deepEqual(check(r.caminho).rovers, 2)
      await new Promise((ok) => setTimeout(ok, 40)) // gives the writer time, even on a loaded machine: without it the copies could all come from the same instant
    }
    writer.stdin.write('parar\n')
    await finished
    const written = Number(output.trim().split('\n').at(-1))
    assert.ok(written > 100, `the writer wrote ${written} rows`)
    assert.ok(copies.at(-1).contagens.objetos > copies[0].contagens.objetos, 'the copies caught different moments of the moving database')
    const db = new DatabaseSync(dbPath, { readOnly: true })
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM objetos').get().n), 6 + written)
    db.close()
  } finally { writer.kill(); clear(dir) }
})

test('real restore: the restored database opens on a new relay and returns the same postagens and profiles', () => {
  const dir = makeDir()
  try {
    const m = relayInFile(join(dir, 'rele.sqlite'))
    const original = { perfil: m.rele.perfil(m.a.uid), postagens: m.rele.postsOf(m.a.uid), seguidores: m.rele.seguidores(m.a.uid) }
    const b = makeBackup({ banco: join(dir, 'rele.sqlite'), pasta: join(dir, 'b') })
    m.store.fechar()
    rmSync(join(dir, 'rele.sqlite'))
    rmSync(join(dir, 'rele.sqlite-wal'), { force: true })
    rmSync(join(dir, 'rele.sqlite-shm'), { force: true })
    const r = restore({ arquivo: b.caminho, destino: join(dir, 'rele.sqlite') })
    assert.deepEqual(r.contagens, { rovers: 2, objetos: 6 })
    assert.deepEqual(r.guardados, [])
    assert.equal(statSync(join(dir, 'rele.sqlite')).mode & 0o777, 0o600)
    // a new relay, with the same provider (same issuer), opens the restored database and answers the same
    const store = new Store(join(dir, 'rele.sqlite'))
    const relay = new Relay({ store, provedor: m.provedor, relogio: () => NOW, reportSecret: randomBytes(32) })
    assert.deepEqual(relay.perfil(m.a.uid), original.perfil)
    assert.deepEqual(relay.postsOf(m.a.uid), original.postagens)
    assert.deepEqual(relay.seguidores(m.a.uid), original.seguidores)
    assert.equal(relay.postsOf(m.a.uid).itens.length, 3)
    // and keeps accepting the chain from where it stopped: the restored head is the original one
    const next = publish({ ...m, rele: relay }, m.a, 'postagem', { texto: 'Depois da restauração.', topicos: [] })
    assert.equal(next.estado, 'aceito')
    store.fechar()
  } finally { clear(dir) }
})

test('restore does not overwrite without --forcar; with --forcar it keeps the old database (and the WAL) aside', () => {
  const dir = makeDir()
  try {
    const dbPath = join(dir, 'rele.sqlite')
    const m = relayInFile(dbPath)
    const b = makeBackup({ banco: dbPath, pasta: join(dir, 'b') })
    publish(m, m.a, 'postagem', { texto: 'Escrita depois do backup.', topicos: [] }) // stays in the WAL, database open
    assert.ok(existsSync(`${dbPath}-wal`))
    assert.throws(() => restore({ arquivo: b.caminho, destino: dbPath }), /já existe um banco/)
    assert.equal(m.rele.postsOf(m.a.uid).itens.length, 4, 'the refusal did not touch the database')
    const r = restore({ arquivo: b.caminho, destino: dbPath, forcar: true, agora: new Date(1_800_000_000_000) })
    assert.ok(r.guardados.includes('rele.sqlite.antes-de-restaurar-1800000000000'))
    assert.ok(existsSync(`${dbPath}.antes-de-restaurar-1800000000000-wal`), 'the WAL of the old database went along')
    assert.equal(r.contagens.objetos, 6, 'back to the backup state')
    assert.ok(!existsSync(`${dbPath}-wal`) && !existsSync(`${dbPath}-shm`), 'no old WAL stuck to the restored database')
    m.store.fechar()
  } finally { clear(dir) }
})

test('restore refuses a tampered or truncated backup, one that is not a database or is not from the relay', () => {
  const dir = makeDir()
  try {
    const m = relayInFile(join(dir, 'rele.sqlite'))
    const b = makeBackup({ banco: join(dir, 'rele.sqlite'), pasta: join(dir, 'b') })
    m.store.fechar()
    const target = join(dir, 'novo.sqlite')

    // 1. one byte changed: the hash in the .sha256 catches it
    const tampered = join(dir, 'b', 'rele-20260101-000000.sqlite')
    const bytes = readFileSync(b.caminho); bytes[bytes.length - 10] ^= 0xff
    writeFileSync(tampered, bytes); writeFileSync(`${tampered}.sha256`, readFileSync(`${b.caminho}.sha256`, 'utf8'))
    assert.throws(() => restore({ arquivo: tampered, destino: target }), /hash do backup não confere/)

    // 2. no .sha256 and truncated: SQLite catches it
    const truncated = join(dir, 'b', 'rele-20260102-000000.sqlite')
    writeFileSync(truncated, readFileSync(b.caminho)); truncateSync(truncated, 5000)
    assert.throws(() => restore({ arquivo: truncated, destino: target }))

    // 3. any file
    const junk = join(dir, 'lixo.sqlite'); writeFileSync(junk, 'isto nao e um banco de dados'.repeat(50))
    assert.throws(() => restore({ arquivo: junk, destino: target }))

    // 4. a valid database from something else
    const other = join(dir, 'outro.sqlite'); const o = new DatabaseSync(other); o.exec('CREATE TABLE coisa (x)'); o.close()
    assert.throws(() => restore({ arquivo: other, destino: target }), /não parece um banco do relé/)

    // 5. does not exist
    assert.throws(() => restore({ arquivo: join(dir, 'nao-existe'), destino: target }), /não encontrado/)
    assert.ok(!existsSync(target), 'no refusal left a half-written destination')
    assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith('.parcial')), [])
  } finally { clear(dir) }
})

test('makeBackup refuses a database that does not exist (and does not create an empty one) and leaves nothing behind if the copy fails', () => {
  const dir = makeDir()
  try {
    assert.throws(() => makeBackup({ banco: join(dir, 'nao-existe.sqlite'), pasta: join(dir, 'b') }), /banco não encontrado/)
    assert.ok(!existsSync(join(dir, 'nao-existe.sqlite')))
    const empty = join(dir, 'vazio.sqlite'); const v = new DatabaseSync(empty); v.exec('CREATE TABLE coisa (x)'); v.close()
    assert.throws(() => makeBackup({ banco: empty, pasta: join(dir, 'b') }), /não parece um banco do relé/)
    assert.deepEqual(readdirSync(join(dir, 'b')), [], 'a rejected copy does not stay in the folder')
    const m = relayInFile(join(dir, 'rele.sqlite'))
    const now = new Date('2026-11-05T12:00:00Z')
    makeBackup({ banco: join(dir, 'rele.sqlite'), pasta: join(dir, 'b'), agora: now })
    assert.throws(() => makeBackup({ banco: join(dir, 'rele.sqlite'), pasta: join(dir, 'b'), agora: now }), /já existe um backup deste segundo/)
    m.store.fechar()
  } finally { clear(dir) }
})

test('backup name: round trip, and a strange name is not one of our backups', () => {
  const d = new Date('2026-03-04T05:06:07Z')
  assert.equal(backupName(d), 'rele-20260304-050607.sqlite')
  assert.equal(nameInstant('rele-20260304-050607.sqlite'), d.getTime())
  for (const bad of ['rele-20260304-050607.sqlite.sha256', 'rele.sqlite', 'rele-2026-03-04.sqlite', 'x/rele-20260304-050607.sqlite', 'rele-20261399-050607.sqlite']) {
    assert.equal(nameInstant(bad), null, bad)
  }
})

const names = (...dates) => dates.map((d) => backupName(new Date(d)))

test('rotation: keeps the N newest and the newest of each day of the last D days, and deletes the rest', () => {
  const list = names(
    '2026-11-05T18:00:00Z', '2026-11-05T12:00:00Z', '2026-11-05T06:00:00Z', '2026-11-05T00:00:00Z',
    '2026-11-04T18:00:00Z', '2026-11-04T06:00:00Z',
    '2026-11-03T18:00:00Z', '2026-11-03T06:00:00Z',
    '2026-11-02T06:00:00Z', '2026-10-20T06:00:00Z', '2026-10-19T18:00:00Z'
  )
  const now = new Date('2026-11-05T19:00:00Z')
  const erase = chooseToDelete(list, { agora: now, last: 2, dias: 3 })
  const stays = list.filter((n) => !erase.includes(n))
  // 2 newest: 05/18h and 05/12h. Newest of each of the last 3 days (05, 04, 03): 05/18h (already), 04/18h, 03/18h.
  assert.deepEqual(stays.sort(), names('2026-11-05T18:00:00Z', '2026-11-05T12:00:00Z', '2026-11-04T18:00:00Z', '2026-11-03T18:00:00Z').sort())
  assert.equal(erase.length, list.length - 4)
  // dias=1: only today counts besides the N newest
  assert.deepEqual(chooseToDelete(list, { agora: now, last: 1, dias: 1 }).length, list.length - 1)
  // never deletes what is not one of our backups
  assert.deepEqual(chooseToDelete(['notas.txt', 'rele.sqlite', ...list.slice(0, 1)], { agora: now, last: 1, dias: 1 }), [])
  // few backups: nothing to delete
  assert.deepEqual(chooseToDelete(list.slice(0, 2), { agora: now, last: 12, dias: 14 }), [])
  // the days limit is inclusive: dias=2 keeps today and yesterday
  assert.ok(!chooseToDelete(list, { agora: now, last: 0, dias: 2 }).includes(backupName(new Date('2026-11-04T18:00:00Z'))))
  assert.ok(chooseToDelete(list, { agora: now, last: 0, dias: 2 }).includes(backupName(new Date('2026-11-03T18:00:00Z'))))
})

test('rotate deletes the copy and the .sha256, preserves foreign files and cleans an old .parcial', () => {
  const dir = makeDir()
  try {
    const b = join(dir, 'b')
    const m = relayInFile(join(dir, 'rele.sqlite'))
    for (let i = 0; i < 5; i++) makeBackup({ banco: join(dir, 'rele.sqlite'), pasta: b, agora: new Date(Date.UTC(2026, 10, 1 + i, 6)) })
    writeFileSync(join(b, 'LEIAME.txt'), 'não é backup')
    writeFileSync(join(b, 'rele-20261101-060000.sqlite.parcial'), 'sobra'); // old: old mtime
    const old = new Date('2026-11-01T07:00:00Z'); utimesSync(join(b, 'rele-20261101-060000.sqlite.parcial'), old, old)
    const deleted = rotate({ pasta: b, agora: new Date('2026-11-05T12:00:00Z'), last: 2, dias: 1 })
    assert.equal(deleted.length, 3)
    assert.deepEqual(listBackups(b), [backupName(new Date('2026-11-05T06:00:00Z')), backupName(new Date('2026-11-04T06:00:00Z'))])
    const rest = readdirSync(b).sort()
    assert.deepEqual(rest, ['LEIAME.txt', 'rele-20261104-060000.sqlite', 'rele-20261104-060000.sqlite.sha256', 'rele-20261105-060000.sqlite', 'rele-20261105-060000.sqlite.sha256'])
    m.store.fechar()
  } finally { clear(dir) }
})


test('the executables: backup.js makes the copy and the rotation; restore.js `ultimo` returns the database; an error exits with a code and no content', () => {
  const dir = makeDir()
  try {
    const dbPath = join(dir, 'rele.sqlite')
    const m = relayInFile(dbPath)
    m.store.fechar()
    const env = { PATH: process.env.PATH, RELAY_DB: dbPath, RELAY_BACKUP_DIR: join(dir, 'b'), RELAY_BACKUP_KEEP: '2', RELAY_BACKUP_DAYS: '1' }
    const run = (bin, args = [], extra = {}) => spawnSync(process.execPath, [...NODE, BIN(bin), ...args], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 30_000 })
    const r1 = run('backup.js')
    assert.equal(r1.status, 0, r1.stderr)
    const j = JSON.parse(r1.stdout)
    assert.equal(j.evento, 'backup')
    assert.equal(j.rovers, 2)
    assert.equal(j.objetos, 6)
    assert.match(j.arquivo, /^rele-\d{8}-\d{6}\.sqlite$/)
    assert.ok(!r1.stdout.includes('Pipa') && !r1.stdout.includes('Postagem'), 'the output carries no database content')
    // restore `ultimo` to another destination
    const r2 = run('restore.js', ['ultimo', '--destino', join(dir, 'restaurado.sqlite')])
    assert.equal(r2.status, 0, r2.stderr)
    assert.equal(JSON.parse(r2.stdout).objetos, 6)
    // without --forcar over an existing database: code 1
    const r3 = run('restore.js', ['ultimo', '--destino', join(dir, 'restaurado.sqlite')])
    assert.equal(r3.status, 1)
    assert.match(r3.stderr, /já existe um banco/)
    // by plain name, inside the backups folder
    const r4 = run('restore.js', [j.arquivo, '--destino', join(dir, 'outro.sqlite')])
    assert.equal(r4.status, 0, r4.stderr)
    // missing database: clear failure
    const r5 = run('backup.js', [], { RELAY_DB: join(dir, 'nada.sqlite') })
    assert.equal(r5.status, 1)
    assert.match(r5.stderr, /banco não encontrado/)
    // absurd configuration
    assert.equal(run('backup.js', [], { RELAY_BACKUP_KEEP: '0' }).status, 2)
    assert.equal(run('restore.js', []).status, 2)
    assert.equal(run('restore.js', ['ultimo'], { RELAY_BACKUP_DIR: join(dir, 'vazia') }).status, 1)
  } finally { clear(dir) }
})

test('check flags a database that opens but is inconsistent (integrity_check returns rows instead of ok, without throwing)', () => {
  const dir = makeDir()
  try {
    const file = join(dir, 'ruim.sqlite')
    const db = new DatabaseSync(file)
    db.exec('PRAGMA page_size = 1024; CREATE TABLE rovers (a INTEGER, b TEXT); CREATE INDEX i_b ON rovers(b); CREATE TABLE objetos (y)')
    const ins = db.prepare('INSERT INTO rovers VALUES (?, ?)')
    for (let i = 0; i < 400; i++) ins.run(i, `valor-${String(i).padStart(3, '0')}`)
    db.close()
    // changes the text of ONE table row, leaving the index as it was: the file opens, but index and table diverge
    const bytes = readFileSync(file)
    bytes.write('valor-299', bytes.indexOf(Buffer.from('valor-200')))
    writeFileSync(file, bytes)
    const open = new DatabaseSync(file, { readOnly: true })
    assert.notEqual(open.prepare('PRAGMA integrity_check').all()[0].integrity_check, 'ok', 'the planted corruption is of the kind that does not make SQLite throw')
    open.close()
    assert.throws(() => check(file), /integrity_check/)
    assert.throws(() => restore({ arquivo: file, destino: join(dir, 'novo.sqlite') }), /integrity_check/)
    assert.ok(!existsSync(join(dir, 'novo.sqlite')))
  } finally { clear(dir) }
})

test('listBackups of a folder that does not exist returns an empty list', () => {
  assert.deepEqual(listBackups(join(tmpdir(), `rn-nao-existe-${randomBytes(4).toString('hex')}`)), [])
})

test('rotation: the N newest stay even when each is a day old; the days limit is inclusive at midnight', () => {
  const now = new Date('2026-11-20T10:00:00Z')
  const old = names('2026-10-01T06:00:00Z', '2026-10-02T06:00:00Z', '2026-10-03T06:00:00Z', '2026-10-04T06:00:00Z')
  assert.deepEqual(chooseToDelete(old, { agora: now, last: 3, dias: 1 }), [backupName(new Date('2026-10-01T06:00:00Z'))], 'the 3 newest stay, only the oldest goes')
  // dias=3 looks at today (20), 19 and 18; the exact midnight of day 18 still counts, one second before does not
  const edge = names('2026-11-18T00:00:00Z', '2026-11-17T23:59:59Z')
  assert.deepEqual(chooseToDelete(edge, { agora: now, last: 0, dias: 3 }), [backupName(new Date('2026-11-17T23:59:59Z'))])
})

test('rotation with the defaults: 12 newest and 14 days', () => {
  const now = new Date('2026-11-05T14:30:00Z')
  const sameDay = Array.from({ length: 14 }, (_, h) => backupName(new Date(Date.UTC(2026, 10, 5, h))))
  const deleted = chooseToDelete(sameDay, { agora: now })
  assert.deepEqual(deleted.sort(), [sameDay[0], sameDay[1]].sort(), '14 on the same day: the 12 newest stay')
  const daily = Array.from({ length: 16 }, (_, d) => backupName(new Date(Date.UTC(2026, 9, 21 + d, 6))))
  const deletedDaily = chooseToDelete(daily, { agora: now })
  assert.deepEqual(deletedDaily.sort(), [daily[0], daily[1]].sort(), '16 consecutive days: the last 14 stay, the 2 oldest go')
})

test('rotate with the defaults deletes a copy without .sha256, does not touch a recent .parcial or an old foreign file, and deletes a .parcial older than one day', () => {
  const dir = makeDir()
  try {
    const b = join(dir, 'b')
    const m = relayInFile(join(dir, 'rele.sqlite'))
    const today = new Date('2026-11-05T12:00:00Z')
    const old = backupName(new Date('2026-09-01T06:00:00Z'))
    makeBackup({ banco: join(dir, 'rele.sqlite'), pasta: b, agora: new Date('2026-09-01T06:00:00Z') })
    rmSync(join(b, `${old}.sha256`)) // copy without seal
    for (let i = 0; i < 12; i++) makeBackup({ banco: join(dir, 'rele.sqlite'), pasta: b, agora: new Date(Date.UTC(2026, 10, 5, i)) })
    const recent = join(b, 'rele-20261105-110000.sqlite.parcial'); writeFileSync(recent, 'x'); utimesSync(recent, new Date(today.getTime() - 3_600_000), new Date(today.getTime() - 3_600_000))
    const exact = join(b, 'rele-20261105-100000.sqlite.parcial'); writeFileSync(exact, 'x'); utimesSync(exact, new Date(today.getTime() - 86_400_000), new Date(today.getTime() - 86_400_000))
    const older = join(b, 'rele-20261105-090000.sqlite.parcial'); writeFileSync(older, 'x'); utimesSync(older, new Date(today.getTime() - 86_400_000 - 1000), new Date(today.getTime() - 86_400_000 - 1000))
    const foreign = join(b, 'notas.txt'); writeFileSync(foreign, 'x'); utimesSync(foreign, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'))
    const deleted = rotate({ pasta: b, agora: today })
    assert.deepEqual(deleted, [old])
    assert.ok(!existsSync(join(b, old)))
    assert.ok(existsSync(recent), 'a .parcial from one hour ago may belong to a copy in progress')
    assert.ok(existsSync(exact), 'exactly one day is not yet past the deadline')
    assert.ok(!existsSync(older), 'a .parcial older than one day is a leftover')
    assert.ok(existsSync(foreign), 'a foreign file is never touched')
    m.store.fechar()
  } finally { clear(dir) }
})

test('restore treats an orphan -wal or -shm as an existing database and requires --forcar', () => {
  const dir = makeDir()
  try {
    const m = relayInFile(join(dir, 'rele.sqlite'))
    const b = makeBackup({ banco: join(dir, 'rele.sqlite'), pasta: join(dir, 'b') })
    m.store.fechar()
    for (const extra of ['-wal', '-shm']) {
      const target = join(dir, `orfao${extra}.sqlite`)
      writeFileSync(`${target}${extra}`, 'resto')
      assert.throws(() => restore({ arquivo: b.caminho, destino: target }), /já existe um banco/, extra)
      assert.ok(!existsSync(target))
    }
  } finally { clear(dir) }
})

test('rotate with the defaults keeps 14 days of daily backup: with 16 consecutive days exactly the 2 oldest go', () => {
  const dir = makeDir()
  try {
    const b = join(dir, 'b')
    const m = relayInFile(join(dir, 'rele.sqlite'))
    const daily = Array.from({ length: 16 }, (_, d) => new Date(Date.UTC(2026, 9, 21 + d, 6)))
    for (const when of daily) makeBackup({ banco: join(dir, 'rele.sqlite'), pasta: b, agora: when })
    const deleted = rotate({ pasta: b, agora: new Date('2026-11-05T14:30:00Z') })
    assert.deepEqual(deleted.sort(), [backupName(daily[0]), backupName(daily[1])].sort())
    assert.equal(listBackups(b).length, 14)
    m.store.fechar()
  } finally { clear(dir) }
})
