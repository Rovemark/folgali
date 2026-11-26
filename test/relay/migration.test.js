// SPDX-License-Identifier: AGPL-3.0-or-later
// A database created by 0.1 opens in 0.2: the new columns appear on their own, with the protocol defaults, and nothing is lost.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Store } from '../../packages/relay/src/store.js'

const DB_OF_01 = `
CREATE TABLE rovers (
  uid TEXT PRIMARY KEY, chave TEXT NOT NULL, chave_aprovacao TEXT NOT NULL, handle TEXT NOT NULL, emissor TEXT NOT NULL,
  atestado TEXT NOT NULL, atestado_emitido_em INTEGER NOT NULL, atestado_expira_em INTEGER NOT NULL, nome TEXT, descricao TEXT,
  perfil_id TEXT, cabeca_id TEXT, cabeca_criado_em INTEGER, saiu INTEGER NOT NULL DEFAULT 0, criado_em INTEGER NOT NULL
);
CREATE TABLE objetos (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, autor TEXT NOT NULL, tipo TEXT NOT NULL, criado_em INTEGER NOT NULL,
  recebido_em INTEGER NOT NULL, emissor TEXT NOT NULL, alvo TEXT, profundidade INTEGER NOT NULL DEFAULT 0, envelope TEXT, removido_em INTEGER
);
INSERT INTO rovers (uid, chave, chave_aprovacao, handle, emissor, atestado, atestado_emitido_em, atestado_expira_em, nome, criado_em)
VALUES ('rvr_antigo', 'k', 'ka', 'antigo.rover', 'e', '{}', 1, 2, 'Antigo', 3);
INSERT INTO objetos (id, autor, tipo, criado_em, recebido_em, emissor) VALUES ('ob_antigo', 'rvr_antigo', 'perfil', 1, 2, 'e');
`

test('0.1 database: gets the new columns, keeps the data and uses the defaults (public graph, nothing required)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rn-migracao-'))
  const file = join(dir, 'rele.sqlite')
  try {
    const old = new DatabaseSync(file)
    old.exec(DB_OF_01)
    old.close()
    const a = new Store(file)
    const r = a.rover('rvr_antigo')
    assert.equal(r.nome, 'Antigo')
    assert.equal(r.grafo_rover, 'publico')
    assert.equal(r.exigir_rover, '[]')
    assert.equal(a.objeto('ob_antigo').autorizacao_id, null)
    assert.equal(a.countAuthorization('qualquer', 0).n, 0)
    // the new tables and index exist and work
    assert.equal(a.politica('rvr_antigo'), null)
    assert.equal(a.revokedAuthorization('rvr_antigo', 'au_x', 1), false)
    assert.ok(a.todos("SELECT name FROM sqlite_master WHERE name = 'objetos_autorizacao'").length === 1)
    a.fechar()
    // opening again is idempotent (the columns already exist)
    const b = new Store(file)
    assert.equal(b.rover('rvr_antigo').grafo_rover, 'publico')
    b.fechar()
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a new database is born with the columns, and a new rover with no graph chosen is born public', () => {
  const a = new Store(':memory:')
  const columns = a.todos("PRAGMA table_info(rovers)").map((c) => c.name)
  assert.ok(columns.includes('grafo_rover') && columns.includes('exigir_rover'))
  assert.ok(a.todos('PRAGMA table_info(objetos)').map((c) => c.name).includes('autorizacao_id'))
  assert.ok(a.todos('PRAGMA table_info(autorizacoes_revogadas)').map((c) => c.name).includes('recebida_em'))
  a.fechar()
})
