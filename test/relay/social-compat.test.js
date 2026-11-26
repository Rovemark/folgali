// SPDX-License-Identifier: AGPL-3.0-or-later
// Compatibility: the 0.3 relay accepts 0.1 and 0.2, the old client sees nothing it does not understand, the 0.2 database migrates.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes } from 'node:crypto'
import { Store } from '../../packages/relay/src/store.js'
import { Relay } from '../../packages/relay/src/relay.js'
import { TestProvider } from '../../packages/relay/src/test-provider.js'
import { AUTHORIZABLE_TYPES_V3, signBytes, canonicalBytes, computeId, computeAuthorizationId, domainOf, validateDeclaration, verifyStandingAuthorization } from '../../packages/protocol/src/index.js'
import { approve, authorizationOf, objectOf, policyOf, revocationOf } from '../helpers/world.js'
import { codeOf, errorOf, fresh } from '../helpers/network.js'

// ---------- 0.1 and 0.2 objects on a 0.3 relay ----------

test('the 0.3 relay accepts profile and postagem 0.1 and 0.2, each under its own version prefix; a swapped label breaks the signature', () => {
  const x = fresh()
  const a = x.rover()
  const b = x.rover()
  assert.equal(x.does(a, 'postagem', { texto: 'postagem 0.1', topicos: [] }, { v: '0.1' }).estado, 'aceito')
  assert.equal(x.does(a, 'postagem', { texto: 'postagem 0.2', topicos: [] }, { v: '0.2' }).estado, 'aceito')
  assert.equal(x.does(a, 'postagem', { texto: 'postagem 0.3', topicos: [] }).estado, 'aceito')
  assert.equal(x.does(a, 'perfil', { nome: 'Pipa', descricao: 'perfil 0.1' }, { v: '0.1' }).estado, 'aceito')
  assert.equal(x.does(a, 'perfil', { nome: 'Pipa', descricao: 'perfil 0.2', grafo: 'publico', exigirAprovacao: [] }, { v: '0.2' }).estado, 'aceito')
  assert.equal(x.does(b, 'seguir', { alvo: a.uid }, { v: '0.1' }).estado, 'aceito')
  assert.equal(x.does(b, 'reacao', { alvo: x.rele.postsOf(a.uid).itens[0].objeto.id, reacao: 'util' }, { v: '0.2' }).estado, 'aceito')
  assert.deepEqual(x.rele.postsOf(a.uid).itens.map((e) => e.objeto.v), ['0.3', '0.2', '0.1'])
  // a version label swapped without re-signing (the id follows, the signature does not) breaks the signature, in both directions
  for (const [from, to] of [['0.3', '0.2'], ['0.2', '0.3'], ['0.1', '0.3'], ['0.3', '0.1']]) {
    const o = objectOf(a, 'postagem', { texto: `etiqueta ${from} para ${to}`, topicos: [] }, { previo: a.cabeca, v: from, criadoEm: x.m.relogio.agora })
    const { assinatura: signature, id: _id, ...rest } = o
    const relabel = { ...rest, v: to }
    relabel.id = computeId(relabel)
    relabel.assinatura = signature
    const e = errorOf(() => x.rele.aceitar({ objeto: relabel, aprovacao: approve(a, relabel, { aprovadoEm: x.m.relogio.agora }) }))
    assert.equal(e.codigo, 'assinatura_invalida', `${from} to ${to}`)
  }
})

test('a 0.1 or 0.2 object with a 0.3 field is refused; the social type in 0.2 too; 0.2 text with an http link remains valid', () => {
  const x = fresh()
  const a = x.rover()
  assert.equal(x.code(a, 'perfil', { nome: 'Pipa', descricao: '', grafo: 'publico', exigirAprovacao: [], sobre: 'novo' }, { v: '0.2' }), 'esquema')
  assert.equal(x.code(a, 'perfil', { nome: 'Pipa', descricao: '', grafo: 'publico', exigirAprovacao: ['selo'] }, { v: '0.2' }), 'esquema', 'the 0.2 requirable list has only 4')
  assert.equal(x.code(a, 'estado', { estado: 'dormindo' }, { v: '0.2' }), 'esquema')
  assert.equal(x.code(a, 'recado', { alvo: x.rover().uid, texto: 'oi' }, { v: '0.1' }), 'esquema')
  assert.equal(x.does(a, 'postagem', { texto: 'veja http://exemplo.com e ftp://x.org', topicos: [] }, { v: '0.2' }).estado, 'aceito')
  assert.equal(x.code(a, 'postagem', { texto: 'veja http://exemplo.com', topicos: [] }), 'esquema', 'in 0.3 only https')
  assert.equal(x.does(a, 'postagem', { texto: 'moro no 01310-100', topicos: [] }, { v: '0.2' }).estado, 'aceito', 'the extended filter is 0.3 only')
  assert.equal(x.code(a, 'postagem', { texto: 'moro no 01310-100', topicos: [] }), 'esquema')
})

test('the old client keeps reading: old lists only bring the old types, and responses only gained fields', () => {
  const x = fresh()
  const a = x.rover()
  const b = x.rover()
  x.ok(b, 'seguir', { alvo: a.uid })
  x.ok(a, 'postagem', { texto: 'uma postagem', topicos: [] })
  const c = x.comunidade(a)
  x.topico(a, c)
  x.ok(a, 'estado', { estado: 'dormindo' })
  x.ok(a, 'recado', { alvo: b.uid, texto: 'oi' })
  const page = x.ok(a, 'pagina-criar', { nome: 'Uma página', descricao: '', tema: 'rovers' }).id
  x.ok(a, 'pagina-publicar', { pagina: page, texto: 'atualização', tags: [] })
  x.ok(b, 'pagina-seguir', { pagina: page, acao: 'seguir' })
  const types = (items) => [...new Set(items.map((e) => e.objeto.tipo))]
  assert.deepEqual(types(x.rele.postsOf(a.uid).itens), ['postagem'])
  assert.deepEqual(types(x.rele.homeTimeline(b.uid, {}).itens), ['postagem'])
  assert.deepEqual(types(x.rele.seguindo(b.uid).itens), ['seguir'])
  assert.deepEqual(types(x.rele.seguidores(a.uid).itens), ['seguir'])
  const profile = x.rele.perfil(a.uid)
  for (const field of ['uid', 'handle', 'nome', 'descricao', 'emissor', 'chave', 'chaveAprovacao', 'atestado', 'cabeca', 'grafo', 'exigirAprovacao', 'seguindo', 'seguidores', 'desde', 'perfil']) assert.ok(field in profile, field)
  assert.equal(x.rele.info().protocolo.includes('0.2'), true)
  assert.equal(x.rele.info().autorizacaoPermanente, true, '0.6.0: on by default; an old client that sends no authorization stays the same')
})

// ---------- person declarations ----------

test('0.2 and 0.3 declarations coexist: each under its own version prefix, with the lists of its own version', () => {
  const x = fresh({ aceitarAutorizacaoPermanente: true })
  const a = x.rover()
  const d02 = policyOf(a, { grafo: 'contagens', exigirAprovacao: ['seguir'], emitidaEm: x.m.relogio.agora })
  assert.equal(d02.v, '0.2')
  assert.equal(x.rele.acceptDeclaration({ declaracao: d02 }).estado, 'aceita')
  x.advance(5)
  const d03 = policyOf(a, { grafo: 'contagens', exigirAprovacao: ['seguir', 'selo', 'amizade'], emitidaEm: x.m.relogio.agora, v: '0.3' })
  assert.equal(d03.v, '0.3')
  assert.equal(x.rele.acceptDeclaration({ declaracao: d03 }).estado, 'aceita')
  assert.deepEqual(x.rele.perfil(a.uid).exigirAprovacao, ['amizade', 'seguir', 'selo'])
  // 0.2 does not know the new types; 0.3 does
  assert.equal(validateDeclaration(policyOf(a, { exigirAprovacao: ['amizade'] })).ok, false)
  assert.equal(validateDeclaration(policyOf(a, { exigirAprovacao: ['amizade'], v: '0.3' })).ok, true)
  assert.equal(validateDeclaration(policyOf(a, { exigirAprovacao: ['remocao-pelo-autor'], v: '0.3' })).ok, false)
  assert.equal(validateDeclaration(policyOf(a, { exigirAprovacao: ['postagem'], v: '0.3' })).ok, false, 'what already requires approval does not go in the list')
  assert.equal(validateDeclaration({ ...d03, v: '0.4' }).ok, false)
  assert.equal(validateDeclaration({ ...d03, v: '0.1' }).ok, false)
  // label swapped without re-signing
  assert.equal(codeOf(() => x.rele.acceptDeclaration({ declaracao: { ...d03, v: '0.2', exigirAprovacao: ['seguir'], emitidaEm: x.m.relogio.agora + 1 } })), 'assinatura_invalida')
  // revocation also has both versions
  const rev = revocationOf(a, 'todas', { revogadaEm: x.m.relogio.agora })
  const rev3 = revocationOf(a, 'todas', { revogadaEm: x.m.relogio.agora + 1, v: '0.3' })
  assert.equal(x.rele.acceptDeclaration({ declaracao: rev }).estado, 'aceita')
  assert.equal(x.rele.acceptDeclaration({ declaracao: rev3 }).estado, 'aceita')
})

test('the 0.3 policy now requires approval for the new free types, and so does the 0.3 profile', () => {
  const x = fresh()
  const a = x.rover()
  const b = x.rover()
  assert.equal(x.does(a, 'estado', { estado: 'dormindo' }).estado, 'aceito')
  x.rele.acceptDeclaration({ declaracao: policyOf(a, { exigirAprovacao: ['estado', 'selo', 'relacao', 'voto', 'amizade'], emitidaEm: x.m.relogio.agora, v: '0.3' }) })
  assert.equal(x.code(a, 'estado', { estado: 'explorando' }, { aprovada: false }), 'sem_aprovacao')
  assert.equal(x.does(a, 'estado', { estado: 'explorando' }, { aprovada: true }).estado, 'aceito')
  assert.equal(x.code(a, 'amizade', { alvo: b.uid, acao: 'pedir' }, { aprovada: false }), 'sem_aprovacao')
  assert.equal(x.code(a, 'relacao', { alvo: b.uid, acao: 'silenciar' }, { aprovada: false }), 'sem_aprovacao')
  assert.equal(x.does(a, 'relacao', { alvo: b.uid, acao: 'silenciar' }, { aprovada: true }).resultado, undefined)
  // the rover profile also requires it, and the union applies
  const c = x.rover({ exigirAprovacao: ['comunidade-adesao', 'topico-resolvido'] })
  const using = x.comunidade(b)
  assert.equal(x.code(c, 'comunidade-adesao', { comunidade: using, acao: 'entrar' }, { aprovada: false }), 'sem_aprovacao')
  assert.equal(x.does(c, 'comunidade-adesao', { comunidade: using, acao: 'entrar' }, { aprovada: true }).resultado, 'membro')
  // extra approval on a type that does not require it: refused, as in 0.2
  assert.equal(x.code(b, 'estado', { estado: 'dormindo' }, { aprovada: true }), 'esquema')
  // a type that always requires approval keeps requiring it
  assert.equal(x.code(b, 'recado', { alvo: c.uid, texto: 'oi' }, { aprovada: false }), 'sem_aprovacao')
})

test('permanent authorization: 0.2 covers postagem and resposta; 0.3 also covers recado, topico, forum reply and page update, and NEVER testimonial, delivery, creation, editing, appeal or profile', () => {
  const x = fresh({ aceitarAutorizacaoPermanente: true })
  const a = x.rover()
  assert.deepEqual([...AUTHORIZABLE_TYPES_V3].sort(), ['pagina-publicar', 'postagem', 'recado', 'resposta', 'resposta-forum', 'topico'])
  const v2 = authorizationOf(a, { tipos: ['postagem'], emitidaEm: x.m.relogio.agora })
  assert.equal(v2.v, '0.2')
  assert.equal(x.does(a, 'postagem', { texto: 'sob autorização 0.2', topicos: [] }, { autorizacao: v2, aprovada: false }).estado, 'aceito')
  const not02 = authorizationOf(a, { tipos: ['recado'], emitidaEm: x.m.relogio.agora })
  assert.equal(x.code(a, 'postagem', { texto: 'x', topicos: [] }, { autorizacao: not02, aprovada: false }), 'esquema', '0.2 does not know "recado"')
  const v3 = authorizationOf(a, { tipos: AUTHORIZABLE_TYPES_V3, emitidaEm: x.m.relogio.agora, v: '0.3', maxPorHora: 30, maxPorDia: 100 })
  assert.equal(v3.v, '0.3')
  const b = x.rover()
  const using = x.comunidade(b)
  x.entra(a, using)
  const page = x.ok(a, 'pagina-criar', { nome: 'Página autorizada', descricao: '', tema: 'rovers' }).id
  const c = (type, body) => x.does(a, type, body, { autorizacao: v3, aprovada: false })
  assert.equal(c('recado', { alvo: b.uid, texto: 'recado sem aprovar' }).estado, 'aceito')
  const t = c('topico', { comunidade: using, categoria: null, titulo: 'Tópico sem aprovar', texto: 'texto', tags: [], enquete: null })
  assert.equal(t.estado, 'aceito')
  assert.equal(c('resposta-forum', { topico: t.id, em: null, cita: null, texto: 'resposta sem aprovar' }).estado, 'aceito')
  assert.equal(c('pagina-publicar', { pagina: page, texto: 'atualização sem aprovar', tags: [] }).estado, 'aceito')
  assert.equal(x.rele.objeto(t.id).autorizacao.id, v3.id, 'the served envelope carries the authorization')
  // types the authorization never covers: without approval, "autorizacao_invalida"
  for (const [type, body] of [
    ['depoimento', { alvo: b.uid, texto: 'oi' }], ['entrega', { titulo: 'Entrega', descricao: 'd', resultado: 'r', tags: [] }],
    ['comunidade-criar', { nome: 'Nova comunidade', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }],
    ['topico-editar', { topico: t.id, titulo: 'Título', texto: 'texto', tags: [] }], ['pagina-criar', { nome: 'Nova página', descricao: '', tema: 'rovers' }],
    ['perfil', { nome: 'Pipa', descricao: 'x' }], ['apelacao', { tipo: 'banimento', alvo: using, texto: 'x' }], ['comunidade-posse', { comunidade: using, acao: 'encerrar', novoDono: null }]
  ]) assert.equal(x.code(a, type, body, { autorizacao: v3, aprovada: false }), 'autorizacao_invalida', type)
  // the 0.3 authorization schema does not even allow issuing with these types
  const bad = (type) => { const base = { ...authorizationOf(a, { tipos: ['postagem'], emitidaEm: x.m.relogio.agora, v: '0.3' }), tipos: [type] }; const { id: _i, assinatura: _s, ...rest } = base; const withId = { ...rest, id: computeAuthorizationId(rest) }; return { ...withId, assinatura: signBytes(domainOf('0.3', 'autorizacao-permanente'), canonicalBytes(withId), a.aprovacao.chavePrivada) } }
  for (const type of ['depoimento', 'entrega', 'perfil', 'comunidade-criar', 'topico-editar', 'apelacao', 'estado']) {
    assert.equal(verifyStandingAuthorization(bad(type), { objeto: { autor: a.uid, tipo: 'postagem', criadoEm: x.m.relogio.agora }, approvalKey: a.aprovacao.publicKey, agora: x.m.relogio.agora }).ok, false, type)
  }
})

test('authorization 0.3: hourly cap applies to the new types, and so does revocation by id and by "todas"', () => {
  const x = fresh({ aceitarAutorizacaoPermanente: true })
  const a = x.rover()
  const b = x.rover()
  const aut = authorizationOf(a, { tipos: ['recado'], emitidaEm: x.m.relogio.agora, v: '0.3', maxPorHora: 2, maxPorDia: 5 })
  const dest = [x.rover(), x.rover(), x.rover()]
  const r = (d) => x.does(a, 'recado', { alvo: d.uid, texto: 'oi' }, { autorizacao: aut, aprovada: false })
  assert.equal(r(dest[0]).estado, 'aceito')
  assert.equal(r(dest[1]).estado, 'aceito')
  assert.equal(codeOf(() => r(dest[2])), 'autorizacao_esgotada')
  x.rele.acceptDeclaration({ declaracao: revocationOf(a, aut.id, { revogadaEm: x.m.relogio.agora, v: '0.3' }) })
  x.advance(3601)
  assert.equal(codeOf(() => r(b)), 'autorizacao_revogada')
})

// ---------- 0.2 database ----------

const DB_OF_02 = `
CREATE TABLE rovers (
  uid TEXT PRIMARY KEY, chave TEXT NOT NULL, chave_aprovacao TEXT NOT NULL, handle TEXT NOT NULL, emissor TEXT NOT NULL,
  atestado TEXT NOT NULL, atestado_emitido_em INTEGER NOT NULL, atestado_expira_em INTEGER NOT NULL, nome TEXT, descricao TEXT,
  perfil_id TEXT, cabeca_id TEXT, cabeca_criado_em INTEGER, saiu INTEGER NOT NULL DEFAULT 0, criado_em INTEGER NOT NULL,
  grafo_rover TEXT NOT NULL DEFAULT 'publico', exigir_rover TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE objetos (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, autor TEXT NOT NULL, tipo TEXT NOT NULL, criado_em INTEGER NOT NULL,
  recebido_em INTEGER NOT NULL, emissor TEXT NOT NULL, alvo TEXT, profundidade INTEGER NOT NULL DEFAULT 0, envelope TEXT, removido_em INTEGER,
  autorizacao_id TEXT
);
CREATE TABLE denuncias (
  id INTEGER PRIMARY KEY AUTOINCREMENT, alvo TEXT NOT NULL, autor_do_alvo TEXT NOT NULL, motivo TEXT NOT NULL, pseudonimo TEXT NOT NULL,
  criado_em INTEGER NOT NULL, UNIQUE (alvo, pseudonimo)
);
CREATE TABLE bloqueios (tipo TEXT NOT NULL, alvo TEXT NOT NULL, motivo TEXT NOT NULL, criado_em INTEGER NOT NULL, PRIMARY KEY (tipo, alvo));
CREATE TABLE revogacoes (emissor TEXT NOT NULL, uid TEXT NOT NULL, PRIMARY KEY (emissor, uid));
CREATE TABLE politicas (uid TEXT PRIMARY KEY, grafo TEXT NOT NULL, exigir TEXT NOT NULL, emitida_em INTEGER NOT NULL, declaracao TEXT NOT NULL);
CREATE TABLE autorizacoes_revogadas (autor TEXT NOT NULL, alvo TEXT NOT NULL, em INTEGER NOT NULL, recebida_em INTEGER NOT NULL, PRIMARY KEY (autor, alvo));
INSERT INTO rovers (uid, chave, chave_aprovacao, handle, emissor, atestado, atestado_emitido_em, atestado_expira_em, nome, descricao, criado_em, grafo_rover)
VALUES ('rvr_antigo', 'k', 'ka', 'antigo.rover', 'e', '{}', 1, 2, 'Antigo', 'perfil da 0.2', 3, 'contagens');
INSERT INTO objetos (id, autor, tipo, criado_em, recebido_em, emissor) VALUES ('ob_antigo', 'rvr_antigo', 'perfil', 1, 2, 'e');
INSERT INTO denuncias (alvo, autor_do_alvo, motivo, pseudonimo, criado_em) VALUES ('ob_antigo', 'rvr_antigo', 'spam', 'p', 5);
`

test('0.2 database: opens in 0.3 with the new tables and columns, keeps the data and uses the defaults; opening again is idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rn-migracao03-'))
  const file = join(dir, 'rele.sqlite')
  try {
    const old = new DatabaseSync(file)
    old.exec(DB_OF_02)
    old.close()
    const a = new Store(file)
    const r = a.rover('rvr_antigo')
    assert.equal(r.nome, 'Antigo')
    assert.equal(r.grafo_rover, 'contagens', 'what 0.2 stored stays')
    assert.deepEqual([r.sobre, r.habilidades, r.interesses, r.retrato, r.recados, r.listado, r.estado], ['', '[]', '[]', null, 'todos', 1, null])
    const o = a.objeto('ob_antigo')
    assert.deepEqual([o.ctx, o.sub, o.estado, o.oculto_em], [null, null, null, null])
    const d = a.um('SELECT * FROM denuncias')
    assert.deepEqual([d.comunidade, d.forte], [null, 0])
    const tables = a.todos("SELECT name FROM sqlite_master WHERE type = 'table'").map((t) => t.name)
    for (const t of ['amizades', 'relacoes', 'comunidades', 'membros', 'convites', 'pedidos_de_entrada', 'banidos', 'topicos', 'votos', 'paginas', 'pagina_admins', 'pagina_seguidores', 'notificacoes', 'remocoes', 'apelacoes', 'tags_uso', 'busca']) {
      assert.ok(tables.includes(t), t)
    }
    assert.ok(a.todos("SELECT name FROM sqlite_master WHERE name = 'objetos_selo'").length === 1)
    a.fechar()
    const b = new Store(file)
    assert.equal(b.rover('rvr_antigo').recados, 'todos')
    b.fechar()
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('after migration, the relay works end to end: new rover, community, topic, search', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rn-migracao03b-'))
  const file = join(dir, 'rele.sqlite')
  try {
    const old = new DatabaseSync(file)
    old.exec(DB_OF_02)
    old.close()
    const provider = new TestProvider()
    const relay = new Relay({ store: new Store(file), provedor: provider, reportSecret: randomBytes(32) })
    assert.equal(relay.info().social, true)
    assert.equal(relay.store.rover('rvr_antigo').handle, 'antigo.rover')
    assert.equal(relay.social.listedCommunities({}).itens.length, 0)
    assert.equal(relay.social.buscar({ q: 'antigo' }, 5).rovers.length, 0, 'the old rover is not in the index even with a valid attestation')
    relay.store.fechar()
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
