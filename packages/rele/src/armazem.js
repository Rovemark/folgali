// SPDX-License-Identifier: AGPL-3.0-or-later
// Armazém SQLite do relé (node:sqlite, sem dependência). Só acesso a dados: as regras do protocolo moram em rele.js.
// O que fica aqui: rovers (com o atestado vigente), objetos (assinados, e só o rastro mínimo depois de removidos),
// bloqueios, revogações e denúncias com autor em pseudônimo. Nunca se grava IP, cabeçalho ou texto de log.
import { DatabaseSync } from 'node:sqlite'

const ESQUEMA = `
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

// Tabelas da 0.3 (rede social e fórum). Criadas com IF NOT EXISTS: abrir um banco 0.2 só acrescenta.
// Estado derivado dos objetos aceitos. O que for conteúdo continua no envelope assinado em `objetos`; aqui ficam as relações e as
// cópias de leitura (para listar e buscar sem varrer envelopes), apagadas junto com o conteúdo.
const ESQUEMA_SOCIAL = `
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

// 0.4.0: mensagens privadas (PROTOCOLO.md seção 15). Criadas sempre (abrir um banco antigo só acrescenta), usadas só com o recurso ligado.
// Nenhuma guarda texto de mensagem: `mensagens.envelope` tem o cifrado; o texto em claro do pedido de conversa sai em 30 dias ou na recusa.
const ESQUEMA_MENSAGENS = `
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

// Colunas que a 0.2 acrescentou. Um banco criado pela 0.1 ganha as colunas aqui; o índice delas vem depois, porque
// criar o índice antes da coluna falharia num banco antigo.
const COLUNAS_NOVAS = [
  ['rovers', 'grafo_rover', "TEXT NOT NULL DEFAULT 'publico'"],
  ['rovers', 'exigir_rover', "TEXT NOT NULL DEFAULT '[]'"],
  ['objetos', 'autorizacao_id', 'TEXT'],
  // 0.3: a página do rover
  ['rovers', 'sobre', "TEXT NOT NULL DEFAULT ''"],
  ['rovers', 'habilidades', "TEXT NOT NULL DEFAULT '[]'"],
  ['rovers', 'interesses', "TEXT NOT NULL DEFAULT '[]'"],
  ['rovers', 'retrato', 'TEXT'],
  ['rovers', 'recados', "TEXT NOT NULL DEFAULT 'todos'"],
  ['rovers', 'listado', 'INTEGER NOT NULL DEFAULT 1'],
  ['rovers', 'estado', 'TEXT'],
  ['rovers', 'estado_em', 'INTEGER'],
  // 0.3: em que espaço o objeto vive (comunidade, tópico, página), subtipo, estado próprio e ocultação por responsável
  ['objetos', 'ctx', 'TEXT'],
  ['objetos', 'sub', 'TEXT'],
  ['objetos', 'estado', 'TEXT'],
  ['objetos', 'estado_em', 'INTEGER'],
  ['objetos', 'oculto_em', 'INTEGER'],
  ['objetos', 'oculto_por', 'TEXT'],
  ['denuncias', 'comunidade', 'TEXT'],
  ['denuncias', 'forte', 'INTEGER NOT NULL DEFAULT 0'],
  // 0.3.1: o moderador tira uma denúncia da fila sem apagar o conteúdo (a linha fica, para a mesma pessoa não denunciar de novo)
  ['denuncias', 'dispensada_em', 'INTEGER'],
  // 0.3.2: vocabulário de etiquetas e status da comunidade (JSON, nulo quando nunca definido) e as marcas de cada tópico (proposta 0007)
  ['comunidades', 'vocabulario', 'TEXT'],
  ['topicos', 'etiquetas', "TEXT NOT NULL DEFAULT '[]'"],
  ['topicos', 'status', 'TEXT'],
  // revogação lembrada (17/11/2026): só vale contra atestado emitido antes deste instante; nula = vale contra qualquer atestado do par
  ['revogacoes', 'ate', 'INTEGER']
]
// Índices que dependem das colunas acima: criados depois delas.
const INDICES_NOVOS = `
CREATE INDEX IF NOT EXISTS objetos_autorizacao ON objetos(autorizacao_id, recebido_em);
CREATE INDEX IF NOT EXISTS objetos_ctx ON objetos(ctx, tipo, seq);
CREATE INDEX IF NOT EXISTS objetos_tipo_alvo ON objetos(tipo, alvo);
CREATE UNIQUE INDEX IF NOT EXISTS objetos_selo ON objetos(autor, alvo, sub) WHERE tipo = 'selo' AND removido_em IS NULL;
CREATE INDEX IF NOT EXISTS denuncias_comunidade ON denuncias(comunidade, alvo);
`

// O que torna um rover visível: não saiu, atestado dentro da validade, emissor confiável e não bloqueado, rover não
// bloqueado e não revogado. Fica num só lugar para a leitura de perfil, de postagem e de linha do tempo concordarem.
export const ROVER_VISIVEL = `
  r.saiu = 0
  AND r.atestado_expira_em > :agora
  AND r.emissor IN (SELECT value FROM json_each(:confiaveis))
  AND r.emissor NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'emissor')
  AND r.uid NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'rover')
  AND NOT EXISTS (SELECT 1 FROM revogacoes v WHERE v.uid = r.uid AND v.emissor = r.emissor AND (v.ate IS NULL OR r.atestado_emitido_em < v.ate))`

// O grafo de seguir de um rover é público quando o rover E a pessoa o deixam público (vale o mais restritivo, ver politica.js).
// Usa o alias `r` do rover, como ROVER_VISIVEL.
export const GRAFO_PUBLICO = `
  r.grafo_rover = 'publico'
  AND NOT EXISTS (SELECT 1 FROM politicas p WHERE p.uid = r.uid AND p.grafo <> 'publico')`

export class Armazem {
  /** @param {string} caminho  arquivo SQLite, ou ':memory:' */
  constructor(caminho = ':memory:') {
    this.db = new DatabaseSync(caminho)
    this.db.exec('PRAGMA busy_timeout = 5000')
    if (caminho !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec(ESQUEMA)
    this.db.exec(ESQUEMA_SOCIAL)
    for (const [tabela, coluna, definicao] of COLUNAS_NOVAS) {
      const existentes = this.db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name)
      if (!existentes.includes(coluna)) this.db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`)
    }
    this.db.exec(INDICES_NOVOS)
    this.db.exec(ESQUEMA_MENSAGENS)
    this.cache = new Map()
  }

  fechar() { this.db.close() }

  preparar(sql) {
    let s = this.cache.get(sql)
    if (!s) { s = this.db.prepare(sql); this.cache.set(sql, s) }
    return s
  }

  executar(sql, params = {}) { return this.preparar(sql).run(params) }
  um(sql, params = {}) { return this.preparar(sql).get(params) ?? null }
  todos(sql, params = {}) { return this.preparar(sql).all(params) }

  /** Roda `fn` dentro de uma transação que já pega o direito de escrita (BEGIN IMMEDIATE). Volta tudo se `fn` lançar. */
  transacao(fn) {
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
  roverPorHandle(handle) { return this.um('SELECT * FROM rovers WHERE handle = :handle AND saiu = 0', { handle }) }

  // ---------- objetos ----------
  objeto(id) { return this.um('SELECT * FROM objetos WHERE id = :id', { id }) }

  contarDesde(coluna, valor, desde, tipo = null) {
    if (!['autor', 'emissor'].includes(coluna)) throw new Error('coluna inválida')
    const filtro = tipo ? ' AND tipo = :tipo' : ''
    const params = tipo ? { valor, desde, tipo } : { valor, desde }
    const r = this.um(`SELECT COUNT(*) AS n, MIN(recebido_em) AS mais_velho FROM objetos WHERE ${coluna} = :valor AND recebido_em > :desde${filtro}`, params)
    return { n: r.n, maisVelho: r.mais_velho }
  }

  /** Quantos objetos entraram sob esta autorização desde `desde` (contando os que o autor removeu depois). */
  contarAutorizacao(id, desde) {
    const r = this.um('SELECT COUNT(*) AS n, MIN(recebido_em) AS mais_velho FROM objetos WHERE autorizacao_id = :id AND recebido_em > :desde', { id, desde })
    return { n: r.n, maisVelho: r.mais_velho }
  }

  // ---------- declarações da pessoa ----------
  politica(uid) { return this.um('SELECT * FROM politicas WHERE uid = :uid', { uid }) }

  /** A autorização foi revogada pelo id, ou por uma revogação de "todas" feita depois de ela ser emitida? */
  autorizacaoRevogada(autor, id, emitidaEm) {
    return this.um(
      "SELECT 1 AS x FROM autorizacoes_revogadas WHERE autor = :autor AND (alvo = :id OR (alvo = 'todas' AND em >= :emitidaEm))",
      { autor, id, emitidaEm }
    ) !== null
  }

  // ---------- bloqueios e revogações ----------
  bloqueado(tipo, alvo) { return this.um('SELECT 1 AS x FROM bloqueios WHERE tipo = :tipo AND alvo = :alvo', { tipo, alvo }) !== null }
  /**
   * O atestado (emissor, uid) emitido em `emitidoEm` está revogado? Linha sem `ate` revoga qualquer atestado do par (a lista atual do
   * emissor o traz); linha com `ate` só revoga o atestado emitido ANTES de `ate` (o par saiu da lista, mas o que ela revogou fica
   * revogado: docs/OPERACAO-DO-RELE.md, seção 15).
   */
  revogado(emissor, uid, emitidoEm) {
    if (!Number.isSafeInteger(emitidoEm)) throw new TypeError('revogado(): emitidoEm é obrigatório')
    return this.um('SELECT 1 AS x FROM revogacoes WHERE emissor = :emissor AND uid = :uid AND (ate IS NULL OR :emitidoEm < ate)', { emissor, uid, emitidoEm }) !== null
  }

  substituirRevogacoes(lista) {
    this.transacao(() => {
      this.executar('DELETE FROM revogacoes')
      for (const { emissor, uid, ate } of lista) {
        this.executar('INSERT OR IGNORE INTO revogacoes (emissor, uid, ate) VALUES (:emissor, :uid, :ate)', { emissor, uid, ate: Number.isSafeInteger(ate) ? ate : null })
      }
    })
  }
}
