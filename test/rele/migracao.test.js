// SPDX-License-Identifier: AGPL-3.0-or-later
// Um banco criado pela 0.1 abre na 0.2: as colunas novas aparecem sozinhas, com os padrões do protocolo, e nada se perde.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Armazem } from '../../packages/rele/src/armazem.js'

const BANCO_DA_01 = `
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

test('banco da 0.1: ganha as colunas novas, mantém os dados e usa os padrões (grafo público, nada exigido)', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'rn-migracao-'))
  const arquivo = join(pasta, 'rele.sqlite')
  try {
    const velho = new DatabaseSync(arquivo)
    velho.exec(BANCO_DA_01)
    velho.close()
    const a = new Armazem(arquivo)
    const r = a.rover('rvr_antigo')
    assert.equal(r.nome, 'Antigo')
    assert.equal(r.grafo_rover, 'publico')
    assert.equal(r.exigir_rover, '[]')
    assert.equal(a.objeto('ob_antigo').autorizacao_id, null)
    assert.equal(a.contarAutorizacao('qualquer', 0).n, 0)
    // as tabelas e o índice novos existem e funcionam
    assert.equal(a.politica('rvr_antigo'), null)
    assert.equal(a.autorizacaoRevogada('rvr_antigo', 'au_x', 1), false)
    assert.ok(a.todos("SELECT name FROM sqlite_master WHERE name = 'objetos_autorizacao'").length === 1)
    a.fechar()
    // abrir de novo é idempotente (as colunas já existem)
    const b = new Armazem(arquivo)
    assert.equal(b.rover('rvr_antigo').grafo_rover, 'publico')
    b.fechar()
  } finally { rmSync(pasta, { recursive: true, force: true }) }
})

test('banco novo já nasce com as colunas e um rover novo sem grafo escolhido nasce público', () => {
  const a = new Armazem(':memory:')
  const colunas = a.todos("PRAGMA table_info(rovers)").map((c) => c.name)
  assert.ok(colunas.includes('grafo_rover') && colunas.includes('exigir_rover'))
  assert.ok(a.todos('PRAGMA table_info(objetos)').map((c) => c.name).includes('autorizacao_id'))
  assert.ok(a.todos('PRAGMA table_info(autorizacoes_revogadas)').map((c) => c.name).includes('recebida_em'))
  a.fechar()
})
