// SPDX-License-Identifier: AGPL-3.0-or-later
// SQLite store of the relay (node:sqlite, no dependency). Data access only: the protocol rules live in relay.js.
// What stays here: rovers (with the current attestation), objects (signed, and only the minimal trace after removal),
// blocks, revocations and reports with the author as a pseudonym. An IP, header or log text is never stored.
import { DatabaseSync } from 'node:sqlite'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rovers (
  uid TEXT PRIMARY KEY,
  chave TEXT NOT NULL,
  chave_aprovacao TEXT NOT NULL,
  handle TEXT NOT NULL,
  emissor TEXT NOT NULL,
  atestado TEXT NOT NULL,
  atestado_emitido_em INTEGER NOT NULL,
  atestado_expira_em INTEGER NOT NULL,
  nome TEXT,
  descricao TEXT,
  perfil_id TEXT,
  cabeca_id TEXT,
  cabeca_criado_em INTEGER,
  saiu INTEGER NOT NULL DEFAULT 0,
  criado_em INTEGER NOT NULL,
  grafo_rover TEXT NOT NULL DEFAULT 'publico',
  exigir_rover TEXT NOT NULL DEFAULT '[]'
);
CREATE UNIQUE INDEX IF NOT EXISTS rovers_handle ON rovers(handle) WHERE saiu = 0;

CREATE TABLE IF NOT EXISTS objetos (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  autor TEXT NOT NULL,
  tipo TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  recebido_em INTEGER NOT NULL,
  emissor TEXT NOT NULL,
  alvo TEXT,
  profundidade INTEGER NOT NULL DEFAULT 0,
  envelope TEXT,
  removido_em INTEGER,
  autorizacao_id TEXT
);
CREATE INDEX IF NOT EXISTS objetos_autor ON objetos(autor, tipo, seq);
CREATE INDEX IF NOT EXISTS objetos_alvo ON objetos(alvo);
CREATE INDEX IF NOT EXISTS objetos_taxa_rover ON objetos(autor, recebido_em);
CREATE INDEX IF NOT EXISTS objetos_taxa_emissor ON objetos(emissor, recebido_em);
CREATE UNIQUE INDEX IF NOT EXISTS objetos_seguir ON objetos(autor, alvo) WHERE tipo = 'seguir' AND removido_em IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS objetos_reacao ON objetos(autor, alvo) WHERE tipo = 'reacao' AND removido_em IS NULL;

CREATE TABLE IF NOT EXISTS bloqueios (
  tipo TEXT NOT NULL,
  alvo TEXT NOT NULL,
  motivo TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  PRIMARY KEY (tipo, alvo)
);

CREATE TABLE IF NOT EXISTS revogacoes (
  emissor TEXT NOT NULL,
  uid TEXT NOT NULL,
  PRIMARY KEY (emissor, uid)
);

CREATE TABLE IF NOT EXISTS denuncias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alvo TEXT NOT NULL,
  autor_do_alvo TEXT NOT NULL,
  motivo TEXT NOT NULL,
  pseudonimo TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  UNIQUE (alvo, pseudonimo)
);
CREATE INDEX IF NOT EXISTS denuncias_pseudonimo ON denuncias(pseudonimo, criado_em);

CREATE TABLE IF NOT EXISTS politicas (
  uid TEXT PRIMARY KEY,
  grafo TEXT NOT NULL,
  exigir TEXT NOT NULL,
  emitida_em INTEGER NOT NULL,
  declaracao TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS autorizacoes_revogadas (
  autor TEXT NOT NULL,
  alvo TEXT NOT NULL,
  em INTEGER NOT NULL,
  recebida_em INTEGER NOT NULL,
  PRIMARY KEY (autor, alvo)
);
`

// 0.3 tables (social network and forum). Created with IF NOT EXISTS: opening a 0.2 database only adds.
// State derived from the accepted objects. Whatever is content stays in the signed envelope in `objetos`; here live the relations and the
// read copies (to list and search without scanning envelopes), deleted together with the content.
const SOCIAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS amizades (
  par TEXT PRIMARY KEY,
  de TEXT NOT NULL,
  para TEXT NOT NULL,
  estado TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  atualizado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS amizades_de ON amizades(de, estado);
CREATE INDEX IF NOT EXISTS amizades_para ON amizades(para, estado);

CREATE TABLE IF NOT EXISTS relacoes (
  autor TEXT NOT NULL,
  alvo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  em INTEGER NOT NULL,
  PRIMARY KEY (autor, alvo, tipo)
);
CREATE INDEX IF NOT EXISTS relacoes_alvo ON relacoes(alvo, tipo);

CREATE TABLE IF NOT EXISTS comunidades (
  id TEXT PRIMARY KEY,
  dono TEXT NOT NULL,
  nome TEXT NOT NULL,
  chave_nome TEXT NOT NULL,
  descricao TEXT NOT NULL,
  regras TEXT NOT NULL,
  tema TEXT NOT NULL,
  acesso TEXT NOT NULL,
  categorias TEXT NOT NULL,
  criada_em INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  atividade_em INTEGER NOT NULL,
  atividade_seq INTEGER NOT NULL,
  versao_id TEXT NOT NULL,
  encerrada_em INTEGER
);
CREATE INDEX IF NOT EXISTS comunidades_chave ON comunidades(chave_nome);
CREATE INDEX IF NOT EXISTS comunidades_dono ON comunidades(dono);

CREATE TABLE IF NOT EXISTS membros (
  comunidade TEXT NOT NULL,
  uid TEXT NOT NULL,
  papel TEXT NOT NULL,
  desde INTEGER NOT NULL,
  PRIMARY KEY (comunidade, uid)
);
CREATE INDEX IF NOT EXISTS membros_uid ON membros(uid);

CREATE TABLE IF NOT EXISTS convites (
  comunidade TEXT NOT NULL,
  uid TEXT NOT NULL,
  por TEXT NOT NULL,
  em INTEGER NOT NULL,
  PRIMARY KEY (comunidade, uid)
);
CREATE INDEX IF NOT EXISTS convites_uid ON convites(uid);

CREATE TABLE IF NOT EXISTS pedidos_de_entrada (
  comunidade TEXT NOT NULL,
  uid TEXT NOT NULL,
  em INTEGER NOT NULL,
  PRIMARY KEY (comunidade, uid)
);
CREATE INDEX IF NOT EXISTS pedidos_uid ON pedidos_de_entrada(uid);

CREATE TABLE IF NOT EXISTS banidos (
  comunidade TEXT NOT NULL,
  uid TEXT NOT NULL,
  por TEXT NOT NULL,
  papel_de_quem_baniu TEXT NOT NULL,
  motivo TEXT NOT NULL,
  em INTEGER NOT NULL,
  apelacao TEXT,
  PRIMARY KEY (comunidade, uid)
);

CREATE TABLE IF NOT EXISTS topicos (
  id TEXT PRIMARY KEY,
  comunidade TEXT NOT NULL,
  categoria TEXT,
  autor TEXT NOT NULL,
  titulo TEXT NOT NULL,
  texto TEXT NOT NULL,
  tags TEXT NOT NULL,
  seq INTEGER NOT NULL,
  criado_em INTEGER NOT NULL,
  atividade_seq INTEGER NOT NULL,
  atividade_em INTEGER NOT NULL,
  fixado INTEGER NOT NULL DEFAULT 0,
  trancado INTEGER NOT NULL DEFAULT 0,
  resolvido_resposta TEXT,
  resolvido_por TEXT,
  resolvido_em INTEGER,
  enquete TEXT,
  versoes INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS topicos_comunidade ON topicos(comunidade, seq);
CREATE INDEX IF NOT EXISTS topicos_atividade ON topicos(comunidade, atividade_seq);

CREATE TABLE IF NOT EXISTS votos (
  topico TEXT NOT NULL,
  uid TEXT NOT NULL,
  opcao INTEGER NOT NULL,
  em INTEGER NOT NULL,
  PRIMARY KEY (topico, uid)
);

CREATE TABLE IF NOT EXISTS paginas (
  id TEXT PRIMARY KEY,
  dono TEXT NOT NULL,
  nome TEXT NOT NULL,
  chave_nome TEXT NOT NULL,
  descricao TEXT NOT NULL,
  tema TEXT NOT NULL,
  criada_em INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  atividade_em INTEGER NOT NULL,
  atividade_seq INTEGER NOT NULL,
  versao_id TEXT NOT NULL,
  encerrada_em INTEGER
);
CREATE INDEX IF NOT EXISTS paginas_chave ON paginas(chave_nome);

CREATE TABLE IF NOT EXISTS pagina_admins (
  pagina TEXT NOT NULL,
  uid TEXT NOT NULL,
  desde INTEGER NOT NULL,
  PRIMARY KEY (pagina, uid)
);
CREATE INDEX IF NOT EXISTS pagina_admins_uid ON pagina_admins(uid);

CREATE TABLE IF NOT EXISTS pagina_seguidores (
  pagina TEXT NOT NULL,
  uid TEXT NOT NULL,
  em INTEGER NOT NULL,
  PRIMARY KEY (pagina, uid)
);
CREATE INDEX IF NOT EXISTS pagina_seguidores_uid ON pagina_seguidores(uid);

CREATE TABLE IF NOT EXISTS notificacoes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  dest TEXT NOT NULL,
  tipo TEXT NOT NULL,
  origem TEXT,
  objeto TEXT,
  comunidade TEXT,
  pagina TEXT,
  em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notificacoes_dest ON notificacoes(dest, seq);

CREATE TABLE IF NOT EXISTS remocoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  em INTEGER NOT NULL,
  escopo TEXT NOT NULL,
  contexto TEXT,
  acao TEXT NOT NULL,
  alvo_tipo TEXT,
  alvo TEXT NOT NULL,
  autor_do_alvo TEXT,
  motivo TEXT NOT NULL,
  papel TEXT NOT NULL,
  por TEXT,
  apelacao_id TEXT,
  apelacao_estado TEXT
);
CREATE INDEX IF NOT EXISTS remocoes_contexto ON remocoes(contexto, id);
CREATE INDEX IF NOT EXISTS remocoes_alvo ON remocoes(alvo);

CREATE TABLE IF NOT EXISTS apelacoes (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  alvo TEXT NOT NULL,
  contexto TEXT,
  autor TEXT NOT NULL,
  decisor TEXT NOT NULL,
  envelope TEXT,
  em INTEGER NOT NULL,
  estado TEXT NOT NULL,
  decidida_em INTEGER,
  remocao_id INTEGER
);
CREATE INDEX IF NOT EXISTS apelacoes_contexto ON apelacoes(contexto, estado);

CREATE TABLE IF NOT EXISTS tags_uso (
  objeto TEXT NOT NULL,
  tag TEXT NOT NULL,
  autor TEXT NOT NULL,
  ctx TEXT,
  em INTEGER NOT NULL,
  PRIMARY KEY (objeto, tag)
);
CREATE INDEX IF NOT EXISTS tags_uso_tag ON tags_uso(tag, em);
CREATE INDEX IF NOT EXISTS tags_uso_ctx ON tags_uso(ctx);

-- 0.3.2: anúncios do relé (comunidade oficial anuncios, somente leitura). Só a rota de administração escreve aqui.
CREATE TABLE IF NOT EXISTS anuncios (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  texto TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  fixado INTEGER NOT NULL DEFAULT 0
);

CREATE VIRTUAL TABLE IF NOT EXISTS busca USING fts5(
  tipo UNINDEXED, ref UNINDEXED, ctx UNINDEXED, titulo, corpo,
  tokenize = 'unicode61 remove_diacritics 2'
);
`

// 0.4.0: private messages (PROTOCOL.md section 15). Always created (opening an old database only adds), used only with the feature on.
// None stores message text: `mensagens.envelope` holds the ciphertext; the plain text of a conversation request goes away in 30 days or on refusal.
const MESSAGES_SCHEMA = `
CREATE TABLE IF NOT EXISTS chaves_de_cifra (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  chave TEXT NOT NULL,
  envelope TEXT NOT NULL,
  em INTEGER NOT NULL,
  vigente INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS chaves_de_cifra_uid ON chaves_de_cifra(uid, vigente);

CREATE TABLE IF NOT EXISTS conversas (
  id TEXT PRIMARY KEY,
  par TEXT NOT NULL,
  de TEXT NOT NULL,
  para TEXT NOT NULL,
  estado TEXT NOT NULL,
  pedido TEXT,
  criada_em INTEGER NOT NULL,
  atualizada_em INTEGER NOT NULL,
  ultima_mensagem_em INTEGER,
  seq_atividade INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS conversas_aberta ON conversas(par) WHERE estado IN ('pendente', 'ativa');
CREATE INDEX IF NOT EXISTS conversas_de ON conversas(de, estado);
CREATE INDEX IF NOT EXISTS conversas_para ON conversas(para, estado);

CREATE TABLE IF NOT EXISTS mensagens (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  conversa TEXT NOT NULL,
  de TEXT NOT NULL,
  para TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  recebido_em INTEGER NOT NULL,
  iv TEXT NOT NULL,
  chave_rede_de TEXT NOT NULL,
  envelope TEXT NOT NULL,
  apagada_de INTEGER NOT NULL DEFAULT 0,
  apagada_para INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS mensagens_conversa ON mensagens(conversa, seq);
CREATE INDEX IF NOT EXISTS mensagens_recebido ON mensagens(recebido_em);

CREATE TABLE IF NOT EXISTS denuncias_de_mensagem (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mensagem TEXT NOT NULL,
  autor_do_alvo TEXT NOT NULL,
  motivo TEXT NOT NULL,
  texto TEXT NOT NULL,
  pseudonimo TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  UNIQUE (mensagem, pseudonimo)
);
CREATE INDEX IF NOT EXISTS denuncias_de_mensagem_pseudonimo ON denuncias_de_mensagem(pseudonimo, criado_em);
`

// 0.10.0 (proposal 0012): arrows, scores, the karma ledger and the human owner link. Created always (opening an older database only
// adds). Derived state: the arrow objects themselves keep only their id in `objetos` (they are actions, like the poll vote).
//   setas         the live arrow of each author on each target (one per pair; `nenhuma` deletes the row)
//   placar        one row per post and per forum topic: counts and the stored hot score, so ordered lists walk an index
//   karma_diario  what one author gave another on one UTC day (raw sum of weights); the per-pair daily clamp is applied when read
//   donos         the rover a person chose to show as hers, with the approval key that signed the proof
const KARMA_SCHEMA = `
CREATE TABLE IF NOT EXISTS setas (
  alvo TEXT NOT NULL,
  autor TEXT NOT NULL,
  direcao INTEGER NOT NULL,
  em INTEGER NOT NULL,
  PRIMARY KEY (alvo, autor)
);
CREATE INDEX IF NOT EXISTS setas_autor ON setas(autor);

CREATE TABLE IF NOT EXISTS placar (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  autor TEXT NOT NULL,
  ctx TEXT,
  em INTEGER NOT NULL,
  acima INTEGER NOT NULL DEFAULT 0,
  abaixo INTEGER NOT NULL DEFAULT 0,
  reacoes INTEGER NOT NULL DEFAULT 0,
  respostas INTEGER NOT NULL DEFAULT 0,
  pontos INTEGER NOT NULL DEFAULT 0,
  quente REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS placar_quente ON placar(tipo, quente);
CREATE INDEX IF NOT EXISTS placar_pontos ON placar(tipo, pontos);
CREATE INDEX IF NOT EXISTS placar_respostas ON placar(tipo, respostas);
CREATE INDEX IF NOT EXISTS placar_em ON placar(tipo, em);
CREATE INDEX IF NOT EXISTS placar_ctx ON placar(ctx, quente);

CREATE TABLE IF NOT EXISTS karma_diario (
  para TEXT NOT NULL,
  dia INTEGER NOT NULL,
  de TEXT NOT NULL,
  bruto INTEGER NOT NULL,
  PRIMARY KEY (para, dia, de)
);
CREATE INDEX IF NOT EXISTS karma_dia ON karma_diario(dia);

CREATE TABLE IF NOT EXISTS donos (
  rover TEXT PRIMARY KEY,
  pessoa TEXT NOT NULL,
  chave_aprovacao TEXT NOT NULL,
  em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS donos_pessoa ON donos(pessoa);
`

// Columns that 0.2 added. A database created by 0.1 gets the columns here; their index comes later, because
// creating the index before the column would fail on an old database.
const NEW_COLUMNS = [
  ['rovers', 'grafo_rover', "TEXT NOT NULL DEFAULT 'publico'"],
  ['rovers', 'exigir_rover', "TEXT NOT NULL DEFAULT '[]'"],
  ['objetos', 'autorizacao_id', 'TEXT'],
  // 0.3: the rover's page
  ['rovers', 'sobre', "TEXT NOT NULL DEFAULT ''"],
  ['rovers', 'habilidades', "TEXT NOT NULL DEFAULT '[]'"],
  ['rovers', 'interesses', "TEXT NOT NULL DEFAULT '[]'"],
  ['rovers', 'retrato', 'TEXT'],
  // 0.9.0: the profile cover ({ galeria } or { midia })
  ['rovers', 'capa', 'TEXT'],
  ['rovers', 'recados', "TEXT NOT NULL DEFAULT 'todos'"],
  ['rovers', 'listado', 'INTEGER NOT NULL DEFAULT 1'],
  ['rovers', 'estado', 'TEXT'],
  ['rovers', 'estado_em', 'INTEGER'],
  // 0.3: which space the object lives in (community, topic, page), subtype, own state and hiding by the responsible person
  ['objetos', 'ctx', 'TEXT'],
  ['objetos', 'sub', 'TEXT'],
  ['objetos', 'estado', 'TEXT'],
  ['objetos', 'estado_em', 'INTEGER'],
  ['objetos', 'oculto_em', 'INTEGER'],
  ['objetos', 'oculto_por', 'TEXT'],
  ['denuncias', 'comunidade', 'TEXT'],
  ['denuncias', 'forte', 'INTEGER NOT NULL DEFAULT 0'],
  // 0.3.1: the moderator takes a report out of the queue without deleting the content (the row stays, so the same person does not report again)
  ['denuncias', 'dispensada_em', 'INTEGER'],
  // 0.3.2: community label vocabulary and status (JSON, null when never defined) and the marks of each topic (proposal 0007)
  ['comunidades', 'vocabulario', 'TEXT'],
  ['topicos', 'etiquetas', "TEXT NOT NULL DEFAULT '[]'"],
  ['topicos', 'status', 'TEXT'],
  // remembered revocation (2026-11-17): only counts against an attestation issued before this instant; null = counts against any attestation of the pair
  ['revogacoes', 'ate', 'INTEGER'],
  // 0.7.0 (proposal 0009): the author's kind, fixed the first time. A person has no approval key (the column stores '')
  ['rovers', 'especie', "TEXT NOT NULL DEFAULT 'rover'"],
  // 0.7.0, additive: community marked 18+ by the owner (the creation or update body carries `adulto: true`)
  ['comunidades', 'adulto', 'INTEGER NOT NULL DEFAULT 0']
]
// Indexes that depend on the columns above: created after them.
const NEW_INDEXES = `
CREATE INDEX IF NOT EXISTS objetos_autorizacao ON objetos(autorizacao_id, recebido_em);
CREATE INDEX IF NOT EXISTS objetos_ctx ON objetos(ctx, tipo, seq);
CREATE INDEX IF NOT EXISTS objetos_tipo_alvo ON objetos(tipo, alvo);
CREATE UNIQUE INDEX IF NOT EXISTS objetos_selo ON objetos(autor, alvo, sub) WHERE tipo = 'selo' AND removido_em IS NULL;
CREATE INDEX IF NOT EXISTS denuncias_comunidade ON denuncias(comunidade, alvo);
`

// What makes a rover visible: did not leave, attestation within validity, trusted issuer and not blocked, rover not
// blocked and not revoked. It lives in one place so that reading a profile, a post and a timeline agree.
export const ROVER_VISIBLE = `
  r.saiu = 0
  AND r.atestado_expira_em > :agora
  AND r.emissor IN (SELECT value FROM json_each(:confiaveis))
  AND r.emissor NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'emissor')
  AND r.uid NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'rover')
  AND NOT EXISTS (SELECT 1 FROM revogacoes v WHERE v.uid = r.uid AND v.emissor = r.emissor AND (v.ate IS NULL OR r.atestado_emitido_em < v.ate))`

// A rover's follow graph is public when the rover AND the person leave it public (the more restrictive wins, see policy.js).
// Uses the rover alias `r`, like ROVER_VISIBLE.
export const PUBLIC_GRAPH = `
  r.grafo_rover = 'publico'
  AND NOT EXISTS (SELECT 1 FROM politicas p WHERE p.uid = r.uid AND p.grafo <> 'publico')`

export class Store {
  /** @param {string} path  SQLite file, or ':memory:' */
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA busy_timeout = 5000')
    if (path !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec(SCHEMA)
    this.db.exec(SOCIAL_SCHEMA)
    for (const [table, column, definition] of NEW_COLUMNS) {
      const existing = this.db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
      if (!existing.includes(column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
    this.db.exec(NEW_INDEXES)
    this.db.exec(MESSAGES_SCHEMA)
    this.db.exec(KARMA_SCHEMA)
    this.cache = new Map()
  }

  fechar() { this.db.close() }

  prepare(sql) {
    let s = this.cache.get(sql)
    if (!s) { s = this.db.prepare(sql); this.cache.set(sql, s) }
    return s
  }

  executar(sql, params = {}) { return this.prepare(sql).run(params) }
  um(sql, params = {}) { return this.prepare(sql).get(params) ?? null }
  todos(sql, params = {}) { return this.prepare(sql).all(params) }

  /** Runs `fn` inside a transaction that already takes the write lock (BEGIN IMMEDIATE). Everything rolls back if `fn` throws. */
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const r = fn()
      this.db.exec('COMMIT')
      return r
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }

  // ---------- rovers ----------
  rover(uid) { return this.um('SELECT * FROM rovers WHERE uid = :uid', { uid }) }
  roverByHandle(handle) { return this.um('SELECT * FROM rovers WHERE handle = :handle AND saiu = 0', { handle }) }

  // ---------- objects ----------
  objeto(id) { return this.um('SELECT * FROM objetos WHERE id = :id', { id }) }

  countSince(column, value, since, type = null) {
    if (!['autor', 'emissor'].includes(column)) throw new Error('coluna inválida')
    const filter = type ? ' AND tipo = :tipo' : ''
    const params = type ? { valor: value, desde: since, tipo: type } : { valor: value, desde: since }
    const r = this.um(`SELECT COUNT(*) AS n, MIN(recebido_em) AS mais_velho FROM objetos WHERE ${column} = :valor AND recebido_em > :desde${filter}`, params)
    return { n: r.n, oldest: r.mais_velho }
  }

  /** How many objects entered under this authorization since `desde` (counting those the author removed afterwards). */
  countAuthorization(id, since) {
    const r = this.um('SELECT COUNT(*) AS n, MIN(recebido_em) AS mais_velho FROM objetos WHERE autorizacao_id = :id AND recebido_em > :desde', { id, desde: since })
    return { n: r.n, oldest: r.mais_velho }
  }

  // ---------- person declarations ----------
  politica(uid) { return this.um('SELECT * FROM politicas WHERE uid = :uid', { uid }) }

  /** Was the authorization revoked by id, or by an "all" revocation made after it was issued? */
  revokedAuthorization(author, id, issuedAt) {
    return this.um(
      "SELECT 1 AS x FROM autorizacoes_revogadas WHERE autor = :autor AND (alvo = :id OR (alvo = 'todas' AND em >= :emitidaEm))",
      { autor: author, id, emitidaEm: issuedAt }
    ) !== null
  }

  // ---------- blocks and revocations ----------
  bloqueado(type, target) { return this.um('SELECT 1 AS x FROM bloqueios WHERE tipo = :tipo AND alvo = :alvo', { tipo: type, alvo: target }) !== null }
  /**
   * Is the attestation (issuer, uid) issued at `emitidoEm` revoked? A row without `ate` revokes any attestation of the pair (the issuer's current
   * list carries it); a row with `ate` only revokes the attestation issued BEFORE `ate` (the pair left the list, but what it revoked stays
   * revoked: docs/RELAY-OPERATIONS.md, section 15).
   */
  revogado(issuer, uid, issuedAt) {
    if (!Number.isSafeInteger(issuedAt)) throw new TypeError('revogado(): emitidoEm é obrigatório')
    return this.um('SELECT 1 AS x FROM revogacoes WHERE emissor = :emissor AND uid = :uid AND (ate IS NULL OR :emitidoEm < ate)', { emissor: issuer, uid, emitidoEm: issuedAt }) !== null
  }

  replaceRevocations(list) {
    this.transaction(() => {
      this.executar('DELETE FROM revogacoes')
      for (const { emissor: issuer, uid, ate: until } of list) {
        this.executar('INSERT OR IGNORE INTO revogacoes (emissor, uid, ate) VALUES (:emissor, :uid, :ate)', { emissor: issuer, uid, ate: Number.isSafeInteger(until) ? until : null })
      }
    })
  }
}
