// SPDX-License-Identifier: AGPL-3.0-or-later
// A relay database in the schema that is in PRODUCTION (built by the code of commit 4694ccb, protocol 0.10.0, media on, messages off),
// opened by the code of today. Every migration of 0.11.0 is additive and is tested against this file, never against an empty database.
//
// The keys that signed the old objects were thrown away. `adotar` gives an old author a new key pair straight in the table, so a test
// can make that author act again (edit the old post, attach to it) without any fixed key living in the repository.
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { TestProvider } from '../../packages/relay/src/test-provider.js'
import { Store } from '../../packages/relay/src/store.js'
import { Relay } from '../../packages/relay/src/relay.js'
import { generateKeyPair } from '../../packages/protocol/src/index.js'

const FILE = new URL('./dbs/relay-0.10.0.sql', import.meta.url)

/** The ids written in the header of the fixture. */
export const OLD = JSON.parse(/ids: (\{.*\})$/m.exec(readFileSync(FILE, 'utf8'))[1])

/** Opens the old database with today's relay. `opcoes` go to the Rele constructor (`midia: true` puts media in a temporary folder). */
export function openOldDb({ midia: media = true, verificados: verified = true, ...options } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rn-banco-antigo-'))
  const file = join(dir, 'rele.sqlite')
  const old = new DatabaseSync(file)
  old.exec(readFileSync(FILE, 'utf8'))
  old.close()
  const provider = new TestProvider()
  const clock = { agora: OLD.agora + 60 }
  const store = new Store(file)
  // the old rows were attested by an issuer whose key is gone: the test issuer takes its place in every row that names it
  for (const table of ['rovers', 'objetos']) store.executar(`UPDATE ${table} SET emissor = :novo WHERE emissor = :velho`, { novo: provider.publicKey, velho: OLD.emissor })
  const relay = new Relay({
    store, provedor: provider, relogio: () => clock.agora, reportSecret: randomBytes(32),
    // as in production, the issuer of the old accounts is a verified one
    midia: media ? { dir: join(dir, 'midia') } : null, emissoresVerificados: verified ? [provider.publicKey] : [], ...options
  })
  const m = { provedor: provider, relogio: clock, store, rele: relay, pasta: dir, arquivo: file, advance: (s) => { clock.agora += s } }
  /** Gives the old author a new key pair and returns it as a test rover, with the head of its chain. */
  m.adotar = (uid) => {
    const network = generateKeyPair()
    const approval = generateKeyPair()
    store.executar('UPDATE rovers SET chave = :chave, chave_aprovacao = :aprovacao WHERE uid = :uid', { chave: network.publicKey, aprovacao: approval.publicKey, uid })
    const line = store.rover(uid)
    return { uid, handle: line.handle, rede: network, aprovacao: approval, atestado: null, cabeca: line.cabeca_id }
  }
  m.colunas = (table) => store.todos(`SELECT name FROM pragma_table_info('${table}')`).map((c) => c.name)
  m.tables = () => store.todos("SELECT name FROM sqlite_master WHERE type = 'table'").map((t) => t.name)
  m.apagar = () => { try { store.db.close() } catch { /* already closed */ } rmSync(dir, { recursive: true, force: true }) }
  return m
}
