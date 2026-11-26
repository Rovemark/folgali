// SPDX-License-Identifier: AGPL-3.0-or-later
// Backup and restore with the images of 0.5.0. The bytes live outside SQLite; the backup carries the `<backup>.midia/` folder with exactly what
// the `midia` table of the copy cites, each file checked against its own hash. What is proven: the round trip returns the same
// images byte for byte on a new relay; a file that arrived after the snapshot does not go in (it would be an orphan); a file that vanished or does not match
// is also dropped from the copy table (it would be a row without a file); the restore checks everything before touching anything.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Store } from '../../packages/relay/src/store.js'
import { Relay } from '../../packages/relay/src/relay.js'
import { TestProvider } from '../../packages/relay/src/test-provider.js'
import { MANIFEST, checkBackupMedia, makeBackup, mediaHashes, listBackups, restore, rotate } from '../../packages/relay/src/backup.js'
import { imageBody, cleanImage } from '../../packages/protocol/src/index.js'
import { NOW } from '../helpers/world.js'
import { send, syntheticPng, publishImage } from '../helpers/media.js'
import { publish, registeredRover } from '../helpers/test-relay.js'

const makeDir = () => mkdtempSync(join(tmpdir(), 'rn-backup-midia-'))
const clear = (p) => rmSync(p, { recursive: true, force: true })
const BIN = (name) => new URL(`../../packages/relay/bin/${name}`, import.meta.url).pathname
const NODE = ['--disable-warning=ExperimentalWarning']
const sha = (b) => createHash('sha256').update(b).digest('hex')
const codeOf = (f) => { try { f(); return null } catch (e) { return e.codigo ?? e.message } }

/** A real relay on a file (SQLite in WAL) with media wired to `<dir>/midia`. Rovers are born adult, as in the rest of the suite. */
function relayWithMedia(dir, { provedor: provider = new TestProvider(), mediaDir = join(dir, 'midia') } = {}) {
  const clock = { agora: NOW }
  const store = new Store(join(dir, 'rele.sqlite'))
  store.db.exec('CREATE TRIGGER IF NOT EXISTS contas_adultas AFTER INSERT ON rovers BEGIN UPDATE rovers SET criado_em = criado_em - 2592000 WHERE uid = NEW.uid; END')
  const relay = new Relay({ store, provedor: provider, relogio: () => clock.agora, reportSecret: randomBytes(32), midia: { dir: mediaDir } })
  return { provedor: provider, relogio: clock, store, rele: relay, novatos: false, advance: (s) => { clock.agora += s }, banco: join(dir, 'rele.sqlite'), mediaDir }
}

/** A rover with a portrait, a postagem with two images, and an upload not yet published (pending). */
function populate(m) {
  const a = registeredRover(m)
  const portrait = publishImage(m, a, syntheticPng({ semente: 1 }))
  assert.equal(portrait.estado, 'aceito')
  const post = publish(m, a, 'postagem', { texto: 'Duas imagens do quadro.', topicos: ['teste'] })
  for (const [order, seed] of [[0, 2], [1, 3]]) assert.equal(publishImage(m, a, syntheticPng({ semente: seed }), { alvo: post.objeto.id, ordem: order }).estado, 'aceito')
  const pending = send(m, a, syntheticPng({ semente: 4 })).limpa.hash
  const images = m.rele.midia.postImages(post.objeto.id, m.relogio.agora)
  return { a, post, imagens: images, pendente: pending, portraitHash: m.rele.midia.profileExtra(a.uid, m.relogio.agora).retratoImagem.hash }
}

/** Closes the relay and deletes the database and images, as in a volume loss. */
function loseAll(m) {
  m.store.fechar()
  for (const extra of ['', '-wal', '-shm']) rmSync(`${m.banco}${extra}`, { force: true })
  clear(m.mediaDir)
}

test('round trip: the backup carries the images; restored on a new relay, it serves the same bytes, the same portrait and the same attachments', () => {
  const dir = makeDir()
  try {
    const m = relayWithMedia(dir)
    const p = populate(m)
    const original = {
      perfil: m.rele.perfil(p.a.uid),
      postagem: m.rele.midia.postImages(p.post.objeto.id, m.relogio.agora),
      bytes: Object.fromEntries([p.portraitHash, ...p.imagens.map((i) => i.hash)].map((h) => [h, m.rele.midia.ler(h).bytes]))
    }
    assert.equal(Object.keys(original.bytes).length, 3)
    const b = makeBackup({ banco: m.banco, pasta: join(dir, 'b'), agora: new Date('2026-11-17T12:00:00Z') })
    assert.deepEqual(b.midia, { arquivos: 4, bytes: b.midia.bytes, missing: 0 }, 'three published and the pending upload, which the database also cites')
    const backupDir = `${b.caminho}.midia`
    // shape: <2 hex>/<hash>, files 0600, folders 0700, manifest in the sha256sum format
    assert.equal(statSync(backupDir).mode & 0o777, 0o700)
    const hashes = mediaHashes(b.caminho)
    assert.equal(hashes.length, 4)
    assert.ok(hashes.includes(p.pendente))
    let bytes = 0
    for (const h of hashes) {
      const file = join(backupDir, h.slice(0, 2), h)
      assert.equal(statSync(file).mode & 0o777, 0o600)
      assert.equal(statSync(join(backupDir, h.slice(0, 2))).mode & 0o777, 0o700)
      assert.equal(sha(readFileSync(file)), h)
      bytes += statSync(file).size
    }
    assert.equal(b.midia.bytes, bytes)
    assert.equal(readFileSync(join(backupDir, MANIFEST), 'utf8'), hashes.map((h) => `${h}  ${h.slice(0, 2)}/${h}\n`).join(''))
    assert.deepEqual(checkBackupMedia(b.caminho), { arquivos: 4, bytes })
    // the manifest is the sha256sum one: the system tool checks the folder by itself (macOS: shasum; Linux and the container: sha256sum)
    const tool = spawnSync('sha256sum', ['--version']).status === 0 ? ['sha256sum', ['-c', MANIFEST]] : ['shasum', ['-a', '256', '-c', MANIFEST]]
    const checked = spawnSync(tool[0], tool[1], { cwd: backupDir, encoding: 'utf8' })
    if (checked.error) test.diagnostic?.(`no ${tool[0]} on this machine; the system check did not run`)
    else assert.equal(checked.status, 0, checked.stdout + checked.stderr)

    loseAll(m)
    const r = restore({ arquivo: b.caminho, destino: m.banco })
    assert.deepEqual(r.midia, { arquivos: 4, bytes })
    assert.deepEqual(r.guardados, [])
    assert.equal(statSync(m.mediaDir).mode & 0o777, 0o700)
    for (const h of hashes) assert.equal(statSync(join(m.mediaDir, h.slice(0, 2), h)).mode & 0o777, 0o600)
    assert.ok(!existsSync(`${m.mediaDir}.parcial`))
    const newValue = relayWithMedia(dir, { provedor: m.provedor })
    assert.deepEqual(newValue.rele.perfil(p.a.uid), original.perfil)
    assert.deepEqual(newValue.rele.midia.postImages(p.post.objeto.id, newValue.relogio.agora), original.postagem)
    for (const [h, originalBytes] of Object.entries(original.bytes)) assert.ok(newValue.rele.midia.ler(h).bytes.equals(originalBytes), h)
    // the pending upload came back too: it can still be published within the one-hour window
    const cleanPending = cleanImage(syntheticPng({ semente: 4 }))
    assert.equal(cleanPending.hash, p.pendente)
    assert.equal(publish(newValue, p.a, 'imagem', imageBody(cleanPending, { uso: 'retrato', alvo: null, ordem: null, alt: 'Outro quadrado.' })).estado, 'aceito')
    // restored database and folder match: each `midia` row has its file and each file has its row (no orphan, no row without a file)
    const onDisk = readdirSync(m.mediaDir, { recursive: true }).filter((f) => /[0-9a-f]{64}$/.test(f)).map((f) => f.slice(-64)).sort()
    assert.deepEqual(onDisk, mediaHashes(m.banco))
    newValue.store.fechar()
  } finally { clear(dir) }
})

test('the backup follows the database snapshot: a file without a row does not go in; a row whose file vanished or does not match is dropped from the copy', () => {
  const dir = makeDir()
  try {
    const m = relayWithMedia(dir)
    const p = populate(m)
    // 1. a file in the folder that the database does not cite (arrived after the snapshot, or left over): it must not become an orphan in the backup
    const intruder = syntheticPng({ semente: 9 })
    const hIntruder = sha(intruder)
    mkdirSync(join(m.mediaDir, hIntruder.slice(0, 2)), { recursive: true })
    writeFileSync(join(m.mediaDir, hIntruder.slice(0, 2), hIntruder), intruder)
    // 2. a file the database cites that vanished (deleted after the snapshot, or lost)
    const [vanished, broke] = p.imagens.map((i) => i.hash)
    rmSync(join(m.mediaDir, vanished.slice(0, 2), vanished))
    // 3. a file the database cites that does not match its hash (damaged disk): it does not go into the backup as if it were good
    writeFileSync(join(m.mediaDir, broke.slice(0, 2), broke), Buffer.from('nao e mais a imagem'))
    const b = makeBackup({ banco: m.banco, pasta: join(dir, 'b') })
    assert.equal(b.midia.missing, 2)
    assert.equal(b.midia.arquivos, 2, 'the portrait and the pending one')
    const noBackup = mediaHashes(b.caminho)
    assert.deepEqual(noBackup.sort(), [p.portraitHash, p.pendente].sort())
    assert.ok(!existsSync(join(`${b.caminho}.midia`, hIntruder.slice(0, 2), hIntruder)), 'the intruder did not get in')
    assert.ok(!existsSync(join(`${b.caminho}.midia`, vanished.slice(0, 2), vanished)))
    assert.ok(!existsSync(join(`${b.caminho}.midia`, broke.slice(0, 2), broke)))
    assert.deepEqual(checkBackupMedia(b.caminho).arquivos, 2)
    // the .sha256 covers the database AFTER removing the rows: the restore checks and accepts it
    assert.equal(readFileSync(`${b.caminho}.sha256`, 'utf8').split(' ')[0], b.sha256)
    assert.equal(sha(readFileSync(b.caminho)), b.sha256)
    // the relay database was not touched by the backup: it still cites all four
    assert.equal(mediaHashes(m.banco).length, 4)
    loseAll(m)
    restore({ arquivo: b.caminho, destino: m.banco })
    const newValue = relayWithMedia(dir, { provedor: m.provedor })
    assert.ok(newValue.rele.midia.ler(p.portraitHash).bytes.length > 0)
    assert.equal(codeOf(() => newValue.rele.midia.ler(vanished)), 'nao_encontrado', 'the `imagem` object stays in the chain, without a file: 404, as on the previous relay')
    assert.equal(codeOf(() => newValue.rele.midia.ler(broke)), 'nao_encontrado')
    newValue.store.fechar()
  } finally { clear(dir) }
})

test('relay without the images feature: the backup does not create a media folder and the restore does not create one', () => {
  const dir = makeDir()
  try {
    const clock = { agora: NOW }
    const store = new Store(join(dir, 'rele.sqlite'))
    const relay = new Relay({ store, provedor: new TestProvider(), relogio: () => clock.agora, reportSecret: randomBytes(32) })
    registeredRover({ relogio: clock, store, rele: relay, provedor: relay.provedor, novatos: true })
    const b = makeBackup({ banco: join(dir, 'rele.sqlite'), pasta: join(dir, 'b') })
    assert.equal(b.midia, null)
    assert.ok(!existsSync(`${b.caminho}.midia`))
    assert.equal(checkBackupMedia(b.caminho), null)
    store.fechar()
    const r = restore({ arquivo: b.caminho, destino: join(dir, 'novo', 'rele.sqlite') })
    assert.equal(r.midia, null)
    assert.ok(!existsSync(join(dir, 'novo', 'midia')))
  } finally { clear(dir) }
})

test('relay with the media table and no image: empty folder with an empty manifest, and the restore accepts it even without the folder', () => {
  const dir = makeDir()
  try {
    const m = relayWithMedia(dir)
    registeredRover(m)
    const b = makeBackup({ banco: m.banco, pasta: join(dir, 'b') })
    assert.deepEqual(b.midia, { arquivos: 0, bytes: 0, missing: 0 })
    assert.deepEqual(readdirSync(`${b.caminho}.midia`), [MANIFEST])
    assert.equal(readFileSync(join(`${b.caminho}.midia`, MANIFEST), 'utf8'), '')
    clear(`${b.caminho}.midia`)
    assert.deepEqual(checkBackupMedia(b.caminho), { arquivos: 0, bytes: 0 })
    m.store.fechar()
  } finally { clear(dir) }
})

test('restore checks the images before touching anything and refuses a tampered, incomplete or mixed backup', () => {
  const dir = makeDir()
  try {
    const m = relayWithMedia(dir)
    const p = populate(m)
    const b = makeBackup({ banco: m.banco, pasta: join(dir, 'b') })
    m.store.fechar()
    const pm = `${b.caminho}.midia`
    const [h] = p.imagens.map((i) => i.hash)
    const file = join(pm, h.slice(0, 2), h)
    const original = readFileSync(file)
    const destination = join(dir, 'restaurado', 'rele.sqlite')
    const refusal = (re, msg) => {
      assert.throws(() => restore({ arquivo: b.caminho, destino: destination }), re, msg)
      assert.ok(!existsSync(destination) && !existsSync(join(dir, 'restaurado', 'midia')), `${msg}: nothing was created at the destination`)
    }
    // 1. one byte changed in an image
    const changed = Buffer.from(original); changed[changed.length - 5] ^= 0xff
    writeFileSync(file, changed); refusal(/não confere com o próprio hash/, 'adulterada')
    // 2. imagem apagada do backup
    rmSync(file); refusal(/falta no backup a imagem/, 'apagada')
    writeFileSync(file, original)
    // 3. an extra file (even a valid one): it is not from the snapshot
    const extra = syntheticPng({ semente: 77 }); const he = sha(extra)
    mkdirSync(join(pm, he.slice(0, 2)), { recursive: true }); writeFileSync(join(pm, he.slice(0, 2), he), extra)
    refusal(/não cita/, 'a mais')
    rmSync(join(pm, he.slice(0, 2), he))
    // 4. a file from the right place in the wrong subfolder
    const wrong = h.slice(0, 2) === 'ff' ? 'fe' : 'ff'
    mkdirSync(join(pm, wrong), { recursive: true }); writeFileSync(join(pm, wrong, h), original)
    refusal(/não cita/, 'subpasta errada')
    clear(join(pm, wrong))
    // 5. junk at the root of the folder
    writeFileSync(join(pm, 'LEIAME.txt'), 'x'); refusal(/arquivo estranho/, 'lixo'); rmSync(join(pm, 'LEIAME.txt'))
    // 6. manifest changed or missing
    const manifest = readFileSync(join(pm, MANIFEST), 'utf8')
    writeFileSync(join(pm, MANIFEST), manifest.split('\n').slice(1).join('\n')); refusal(/MANIFESTO/, 'manifesto sem uma linha')
    rmSync(join(pm, MANIFEST)); refusal(/MANIFESTO/, 'sem manifesto')
    writeFileSync(join(pm, MANIFEST), manifest)
    // 7. the whole folder is gone (old backup or half-copied): refuses, and `acceptWithoutMedia` is the conscious way out
    const stored = join(dir, 'guardada'); spawnSync('mv', [pm, stored])
    refusal(/cita 4 imagens e a pasta .*\.midia não está ao lado/, 'sem a pasta')
    const withoutMedia = restore({ arquivo: b.caminho, destino: destination, acceptWithoutMedia: true })
    assert.equal(withoutMedia.midia, null)
    assert.ok(!existsSync(join(dir, 'restaurado', 'midia')), 'no folder to create')
    clear(join(dir, 'restaurado'))
    spawnSync('mv', [stored, pm])
    // `acceptWithoutMedia` does not swallow a defect in a folder that is there
    rmSync(file)
    assert.throws(() => restore({ arquivo: b.caminho, destino: destination, acceptWithoutMedia: true }), /falta no backup/)
    writeFileSync(file, original)
    // 8. an image folder next to a database that does not even have the table: the two halves are not from the same backup
    const withoutTable = join(dir, 'b', 'rele-20200101-000000.sqlite')
    const db = new DatabaseSync(withoutTable); db.exec('CREATE TABLE rovers (x); CREATE TABLE objetos (y)'); db.close()
    mkdirSync(`${withoutTable}.midia`)
    assert.throws(() => restore({ arquivo: withoutTable, destino: destination }), /não são do mesmo backup/)
    // and with everything back in place, it restores
    assert.equal(restore({ arquivo: b.caminho, destino: destination }).midia.arquivos, 4)
  } finally { clear(dir) }
})

test('restore over an existing images folder: without --forcar it refuses (even without a database); with --forcar it moves it aside', () => {
  const dir = makeDir()
  try {
    const m = relayWithMedia(dir)
    const p = populate(m)
    const b = makeBackup({ banco: m.banco, pasta: join(dir, 'b') })
    m.store.fechar()
    for (const extra of ['', '-wal', '-shm']) rmSync(`${m.banco}${extra}`, { force: true })
    // only the image folder was left: restoring over it would mix images from two moments
    writeFileSync(join(m.mediaDir, 'marca-do-antigo'), 'x')
    assert.throws(() => restore({ arquivo: b.caminho, destino: m.banco }), /pasta de imagens/)
    assert.ok(existsSync(join(m.mediaDir, 'marca-do-antigo')) && !existsSync(m.banco), 'the refusal touched nothing')
    const r = restore({ arquivo: b.caminho, destino: m.banco, forcar: true, agora: new Date(1_800_000_000_000) })
    assert.deepEqual(r.guardados, ['midia.antes-de-restaurar-1800000000000'])
    assert.ok(existsSync(join(dir, 'midia.antes-de-restaurar-1800000000000', 'marca-do-antigo')), 'the old folder was moved aside, whole')
    assert.ok(!existsSync(join(m.mediaDir, 'marca-do-antigo')), 'the new folder is only the backup one')
    assert.equal(r.midia.arquivos, 4)
    assert.ok(existsSync(join(m.mediaDir, p.portraitHash.slice(0, 2), p.portraitHash)))
    // images folder somewhere else (RELAY_MEDIA_DIR): it goes where it is asked to
    const other = join(dir, 'outro-disco', 'imagens')
    const r2 = restore({ arquivo: b.caminho, destino: join(dir, 'outro.sqlite'), mediaDir: other })
    assert.equal(r2.midia.arquivos, 4)
    assert.ok(existsSync(join(other, p.portraitHash.slice(0, 2), p.portraitHash)))
  } finally { clear(dir) }
})

test('makeBackup refuses when the database cites images and the media folder does not exist, and leaves nothing behind', () => {
  const dir = makeDir()
  try {
    const m = relayWithMedia(dir)
    populate(m)
    assert.throws(() => makeBackup({ banco: m.banco, pasta: join(dir, 'b'), mediaDir: join(dir, 'pasta-errada') }), /cita 4 imagens e a pasta de mídia .*pasta-errada não existe/)
    assert.deepEqual(readdirSync(join(dir, 'b')), [], 'no database, no .sha256, no images folder')
    // with the right folder, by parameter, it works
    assert.equal(makeBackup({ banco: m.banco, pasta: join(dir, 'b'), mediaDir: m.mediaDir }).midia.arquivos, 4)
    m.store.fechar()
  } finally { clear(dir) }
})

test('rotation deletes the image folder along with the backup, and the leftovers of a copy that died midway after one day', () => {
  const dir = makeDir()
  try {
    const m = relayWithMedia(dir)
    populate(m)
    const b = join(dir, 'b')
    const today = new Date('2026-11-17T12:00:00Z')
    for (let i = 0; i < 3; i++) makeBackup({ banco: m.banco, pasta: b, agora: new Date(Date.UTC(2026, 10, 15 + i, 6)) })
    const yesterday = new Date(today.getTime() - 86_400_000 - 1000)
    const recent = new Date(today.getTime() - 3_600_000)
    const plant = (name, when, asDir = true) => {
      const c = join(b, name)
      if (asDir) { mkdirSync(join(c, 'ab'), { recursive: true }); writeFileSync(join(c, 'ab', 'x'), 'x') } else writeFileSync(c, 'x')
      utimesSync(c, when, when)
      return c
    }
    const oldPartial = plant('rele-20261110-060000.sqlite.midia.parcial', yesterday)
    const newPartial = plant('rele-20261117-110000.sqlite.midia.parcial', recent)
    const withoutDbOld = plant('rele-20261110-070000.sqlite.midia', yesterday)
    const withoutDbNew = plant('rele-20261117-100000.sqlite.midia', recent)
    const foreign = plant('fotos-da-festa.midia', yesterday)
    const partialForeign = plant('rascunho.parcial', yesterday, false)
    const deleted = rotate({ pasta: b, agora: today, last: 1, dias: 1 })
    assert.equal(deleted.length, 2)
    assert.deepEqual(listBackups(b), ['rele-20261117-060000.sqlite'])
    for (const n of deleted) assert.ok(!existsSync(join(b, `${n}.midia`)), `${n}.midia went along`)
    assert.ok(existsSync(join(b, 'rele-20261117-060000.sqlite.midia')), 'the one of the backup that is kept stays')
    assert.ok(!existsSync(oldPartial), 'a .midia.parcial older than one day is a leftover')
    assert.ok(existsSync(newPartial), 'a .midia.parcial one hour old may be a copy in progress')
    assert.ok(!existsSync(withoutDbOld), 'an image folder without a database, older than one day, is a leftover from a crash between the two renames')
    assert.ok(existsSync(withoutDbNew), 'the recent one may be the backup in progress, between the two renames')
    assert.ok(existsSync(foreign) && existsSync(partialForeign), 'a name that is not one of our backups is never touched')
    m.store.fechar()
  } finally { clear(dir) }
})

test('the executables: backup.js carries the images (RELAY_MEDIA_DIR) and warns about missing ones; restore.js puts the images in --midia', () => {
  const dir = makeDir()
  try {
    const mediaDir = join(dir, 'imagens-em-outro-lugar')
    const m = relayWithMedia(dir, { mediaDir })
    const p = populate(m)
    m.store.fechar()
    const env = { PATH: process.env.PATH, RELAY_DB: m.banco, RELAY_BACKUP_DIR: join(dir, 'b'), RELAY_MEDIA_DIR: mediaDir }
    const run = (bin, args = [], extra = {}) => spawnSync(process.execPath, [...NODE, BIN(bin), ...args], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 30_000 })
    const r1 = run('backup.js')
    assert.equal(r1.status, 0, r1.stderr)
    const j = JSON.parse(r1.stdout)
    assert.equal(j.imagens, 4)
    assert.equal(j.imagensAusentes, 0)
    assert.ok(j.bytesDeImagens > 0)
    assert.equal(r1.stderr, '', 'no warning when nothing is missing')
    assert.ok(!r1.stdout.includes(p.portraitHash), 'the output carries no image hash')
    // without RELAY_MEDIA_DIR the default is midia/ next to the database, which does not exist here: clear failure, code 1
    const r2 = run('backup.js', [], { RELAY_MEDIA_DIR: '', RELAY_BACKUP_DIR: join(dir, 'b2') })
    assert.equal(r2.status, 1)
    assert.match(r2.stderr, /pasta de mídia .* não existe/)
    // an image vanishes from the folder: the backup is made, with the warning apart
    const [h] = p.imagens.map((i) => i.hash)
    rmSync(join(mediaDir, h.slice(0, 2), h))
    const r3 = run('backup.js', [], { RELAY_BACKUP_DIR: join(dir, 'b3') })
    assert.equal(r3.status, 0, r3.stderr)
    assert.equal(JSON.parse(r3.stdout).imagensAusentes, 1)
    assert.equal(JSON.parse(r3.stderr).evento, 'backup_imagens_ausentes')
    // restore the first one somewhere else, with --midia
    const destination = join(dir, 'r', 'rele.sqlite')
    const r4 = run('restore.js', [j.arquivo, '--destino', destination, '--midia', join(dir, 'r', 'fotos')])
    assert.equal(r4.status, 0, r4.stderr)
    assert.equal(JSON.parse(r4.stdout).imagens, 4)
    assert.ok(existsSync(join(dir, 'r', 'fotos', h.slice(0, 2), h)))
    // without --midia: RELAY_MEDIA_DIR; without both, midia/ next to the destination
    const r5 = run('restore.js', [j.arquivo, '--destino', join(dir, 'r2', 'rele.sqlite')], { RELAY_MEDIA_DIR: '' })
    assert.equal(r5.status, 0, r5.stderr)
    assert.ok(existsSync(join(dir, 'r2', 'midia', h.slice(0, 2), h)))
    // backup without the images folder: refused; --sem-midia accepts it
    clear(join(dir, 'b', `${j.arquivo}.midia`))
    const r6 = run('restore.js', [j.arquivo, '--destino', join(dir, 'r3', 'rele.sqlite')], { RELAY_MEDIA_DIR: '' })
    assert.equal(r6.status, 1)
    assert.match(r6.stderr, /não está ao lado/)
    const r7 = run('restore.js', [j.arquivo, '--destino', join(dir, 'r3', 'rele.sqlite'), '--sem-midia'], { RELAY_MEDIA_DIR: '' })
    assert.equal(r7.status, 0, r7.stderr)
    assert.equal(JSON.parse(r7.stdout).imagens, undefined)
    // --midia without a value: wrong usage
    assert.equal(run('restore.js', [j.arquivo, '--destino', join(dir, 'r4.sqlite'), '--midia']).status, 2)
  } finally { clear(dir) }
})

// ---- edges that mutation testing showed to be untested ----

test('two images with the same 2-hex prefix land in the same subfolder, in the backup and in the restore', () => {
  const dir = makeDir()
  try {
    const m = relayWithMedia(dir)
    const a = registeredRover(m)
    const post = publish(m, a, 'postagem', { texto: 'Prefixo repetido.', topicos: ['teste'] })
    // look for two images whose hash starts the same (deterministic: the seeds are fixed)
    const byPrefix = new Map()
    let pair = null
    for (let seed = 10; !pair; seed++) {
      const h = cleanImage(syntheticPng({ semente: seed, largura: 4 + (seed % 7), altura: 4 + Math.floor(seed / 7) % 7 })).hash
      if (byPrefix.has(h.slice(0, 2))) pair = [byPrefix.get(h.slice(0, 2)), seed]
      else byPrefix.set(h.slice(0, 2), seed)
    }
    const bytesOf = (seed) => syntheticPng({ semente: seed, largura: 4 + (seed % 7), altura: 4 + Math.floor(seed / 7) % 7 })
    pair.forEach((seed, order) => assert.equal(publishImage(m, a, bytesOf(seed), { alvo: post.objeto.id, ordem: order }).estado, 'aceito'))
    const hashes = pair.map((seed) => cleanImage(bytesOf(seed)).hash)
    assert.equal(hashes[0].slice(0, 2), hashes[1].slice(0, 2))
    const b = makeBackup({ banco: m.banco, pasta: join(dir, 'b') })
    assert.equal(b.midia.arquivos, 2)
    assert.equal(readdirSync(join(`${b.caminho}.midia`, hashes[0].slice(0, 2))).length, 2)
    loseAll(m)
    assert.equal(restore({ arquivo: b.caminho, destino: m.banco }).midia.arquivos, 2)
    assert.equal(readdirSync(join(m.mediaDir, hashes[0].slice(0, 2))).length, 2)
  } finally { clear(dir) }
})

test('backup image folder: a subfolder whose name is not 2 hex (even empty) and a loose file with a 2-hex name are refused', () => {
  const dir = makeDir()
  try {
    const m = relayWithMedia(dir)
    populate(m)
    const b = makeBackup({ banco: m.banco, pasta: join(dir, 'b') })
    m.store.fechar()
    const pm = `${b.caminho}.midia`
    mkdirSync(join(pm, 'zz'))
    assert.throws(() => checkBackupMedia(b.caminho), /arquivo estranho na pasta de imagens do backup: zz/)
    rmSync(join(pm, 'zz'), { recursive: true })
    const free = ['00', '01', '02', '03'].find((n) => !existsSync(join(pm, n)))
    writeFileSync(join(pm, free), 'x')
    assert.throws(() => checkBackupMedia(b.caminho), new RegExp(`arquivo estranho na pasta de imagens do backup: ${free}`))
    rmSync(join(pm, free))
    assert.equal(checkBackupMedia(b.caminho).arquivos, 4)
  } finally { clear(dir) }
})

test('leftovers of a copy that died in the same second are cleaned; a midway failure leaves no image folder behind', () => {
  const dir = makeDir()
  try {
    const m = relayWithMedia(dir)
    populate(m)
    const b = join(dir, 'b')
    const now = new Date('2026-11-17T12:00:00Z')
    const finalPath = join(b, 'rele-20261117-120000.sqlite')
    // 1. a full `.midia.parcial` from an earlier attempt in the same second: it is deleted before copying
    mkdirSync(join(`${finalPath}.midia.parcial`, 'ab'), { recursive: true })
    writeFileSync(join(`${finalPath}.midia.parcial`, 'ab', 'resto'), 'x')
    const r = makeBackup({ banco: m.banco, pasta: b, agora: now })
    assert.equal(r.midia.arquivos, 4)
    assert.ok(!existsSync(`${finalPath}.midia.parcial`))
    assert.ok(!existsSync(join(`${finalPath}.midia`, 'ab', 'resto')))
    // 2. the folder rename fails (a non-empty folder with the final name already exists): the backup fails and nothing of it is left
    const now2 = new Date('2026-11-17T12:00:01Z')
    const finalPath2 = join(b, 'rele-20261117-120001.sqlite')
    mkdirSync(join(`${finalPath2}.midia`, 'cd'), { recursive: true })
    writeFileSync(join(`${finalPath2}.midia`, 'cd', 'ocupado'), 'x')
    assert.throws(() => makeBackup({ banco: m.banco, pasta: b, agora: now2 }))
    for (const leftover of [finalPath2, `${finalPath2}.parcial`, `${finalPath2}.sha256`, `${finalPath2}.midia.parcial`, `${finalPath2}.midia`]) assert.ok(!existsSync(leftover), leftover)
    m.store.fechar()
  } finally { clear(dir) }
})

test('missing media folder: an empty table passes (nothing to copy); a single image is already a reason to refuse', () => {
  const dir = makeDir()
  try {
    const m = relayWithMedia(dir)
    const a = registeredRover(m)
    clear(m.mediaDir)
    const empty = makeBackup({ banco: m.banco, pasta: join(dir, 'b'), agora: new Date('2026-11-17T12:00:00Z') })
    assert.deepEqual(empty.midia, { arquivos: 0, bytes: 0, missing: 0 })
    mkdirSync(m.mediaDir)
    publishImage(m, a, syntheticPng({ semente: 5 }))
    clear(m.mediaDir)
    assert.throws(() => makeBackup({ banco: m.banco, pasta: join(dir, 'b'), agora: new Date('2026-11-17T12:00:01Z') }), /cita 1 imagens/)
    m.store.fechar()
  } finally { clear(dir) }
})

test('rotation does not delete the old image folder of a backup that remains (only the one left without a database)', () => {
  const dir = makeDir()
  try {
    const m = relayWithMedia(dir)
    populate(m)
    const b = join(dir, 'b')
    const r = makeBackup({ banco: m.banco, pasta: b, agora: new Date('2026-11-10T06:00:00Z') })
    const old = new Date('2026-11-10T06:00:00Z')
    utimesSync(`${r.caminho}.midia`, old, old)
    assert.deepEqual(rotate({ pasta: b, agora: new Date('2026-11-17T12:00:00Z'), last: 1, dias: 1 }), [])
    assert.equal(checkBackupMedia(r.caminho).arquivos, 4, 'the images folder of the kept backup stays whole')
    m.store.fechar()
  } finally { clear(dir) }
})

test('restore deletes an image `.parcial` left by a restore that died midway', () => {
  const dir = makeDir()
  try {
    const m = relayWithMedia(dir)
    populate(m)
    const b = makeBackup({ banco: m.banco, pasta: join(dir, 'b') })
    loseAll(m)
    mkdirSync(join(`${m.mediaDir}.parcial`, 'ab'), { recursive: true })
    writeFileSync(join(`${m.mediaDir}.parcial`, 'ab', 'resto'), 'x')
    assert.equal(restore({ arquivo: b.caminho, destino: m.banco }).midia.arquivos, 4)
    assert.ok(!existsSync(`${m.mediaDir}.parcial`))
    assert.ok(!existsSync(join(m.mediaDir, 'ab', 'resto')))
  } finally { clear(dir) }
})
