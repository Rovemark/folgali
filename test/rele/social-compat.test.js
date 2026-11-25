// SPDX-License-Identifier: AGPL-3.0-or-later
// Compatibilidade: o relé 0.3 aceita 0.1 e 0.2, o cliente antigo não vê nada que não entende, o banco 0.2 migra.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes } from 'node:crypto'
import { Armazem } from '../../packages/rele/src/armazem.js'
import { Rele } from '../../packages/rele/src/rele.js'
import { ProvedorDeTeste } from '../../packages/rele/src/provedor-de-teste.js'
import { TIPOS_AUTORIZAVEIS_V3, assinar, bytesCanonicos, calcularId, calcularIdDeAutorizacao, dominioDe, validarDeclaracao, verificarAutorizacaoPermanente } from '../../packages/protocolo/src/index.js'
import { aprovar, autorizacaoDe, objetoDe, politicaDe, revogacaoDe } from '../ajuda/mundo.js'
import { codigoDe, erroDe, nova } from '../ajuda/rede.js'

// ---------- objetos 0.1 e 0.2 num relé 0.3 ----------

test('o relé 0.3 aceita perfil e postagem 0.1 e 0.2, cada um sob o prefixo da própria versão; a etiqueta trocada quebra a assinatura', () => {
  const x = nova()
  const a = x.rover()
  const b = x.rover()
  assert.equal(x.faz(a, 'postagem', { texto: 'postagem 0.1', topicos: [] }, { v: '0.1' }).estado, 'aceito')
  assert.equal(x.faz(a, 'postagem', { texto: 'postagem 0.2', topicos: [] }, { v: '0.2' }).estado, 'aceito')
  assert.equal(x.faz(a, 'postagem', { texto: 'postagem 0.3', topicos: [] }).estado, 'aceito')
  assert.equal(x.faz(a, 'perfil', { nome: 'Pipa', descricao: 'perfil 0.1' }, { v: '0.1' }).estado, 'aceito')
  assert.equal(x.faz(a, 'perfil', { nome: 'Pipa', descricao: 'perfil 0.2', grafo: 'publico', exigirAprovacao: [] }, { v: '0.2' }).estado, 'aceito')
  assert.equal(x.faz(b, 'seguir', { alvo: a.uid }, { v: '0.1' }).estado, 'aceito')
  assert.equal(x.faz(b, 'reacao', { alvo: x.rele.postagensDe(a.uid).itens[0].objeto.id, reacao: 'util' }, { v: '0.2' }).estado, 'aceito')
  assert.deepEqual(x.rele.postagensDe(a.uid).itens.map((e) => e.objeto.v), ['0.3', '0.2', '0.1'])
  // a etiqueta de versão trocada sem reassinar (o id acompanha, a assinatura não) quebra a assinatura, nos dois sentidos
  for (const [de, para] of [['0.3', '0.2'], ['0.2', '0.3'], ['0.1', '0.3'], ['0.3', '0.1']]) {
    const o = objetoDe(a, 'postagem', { texto: `etiqueta ${de} para ${para}`, topicos: [] }, { previo: a.cabeca, v: de, criadoEm: x.m.relogio.agora })
    const { assinatura, id: _id, ...resto } = o
    const relabel = { ...resto, v: para }
    relabel.id = calcularId(relabel)
    relabel.assinatura = assinatura
    const e = erroDe(() => x.rele.aceitar({ objeto: relabel, aprovacao: aprovar(a, relabel, { aprovadoEm: x.m.relogio.agora }) }))
    assert.equal(e.codigo, 'assinatura_invalida', `${de} para ${para}`)
  }
})

test('um objeto 0.1 ou 0.2 com campo da 0.3 é recusado; o tipo social em 0.2 também; texto 0.2 com link http segue valendo', () => {
  const x = nova()
  const a = x.rover()
  assert.equal(x.cod(a, 'perfil', { nome: 'Pipa', descricao: '', grafo: 'publico', exigirAprovacao: [], sobre: 'novo' }, { v: '0.2' }), 'esquema')
  assert.equal(x.cod(a, 'perfil', { nome: 'Pipa', descricao: '', grafo: 'publico', exigirAprovacao: ['selo'] }, { v: '0.2' }), 'esquema', 'a lista exigível da 0.2 só tem 4')
  assert.equal(x.cod(a, 'estado', { estado: 'dormindo' }, { v: '0.2' }), 'esquema')
  assert.equal(x.cod(a, 'recado', { alvo: x.rover().uid, texto: 'oi' }, { v: '0.1' }), 'esquema')
  assert.equal(x.faz(a, 'postagem', { texto: 'veja http://exemplo.com e ftp://x.org', topicos: [] }, { v: '0.2' }).estado, 'aceito')
  assert.equal(x.cod(a, 'postagem', { texto: 'veja http://exemplo.com', topicos: [] }), 'esquema', 'em 0.3 só https')
  assert.equal(x.faz(a, 'postagem', { texto: 'moro no 01310-100', topicos: [] }, { v: '0.2' }).estado, 'aceito', 'o filtro ampliado é só da 0.3')
  assert.equal(x.cod(a, 'postagem', { texto: 'moro no 01310-100', topicos: [] }), 'esquema')
})

test('o cliente antigo continua lendo: as listas antigas só trazem os tipos antigos, e as respostas só ganharam campos', () => {
  const x = nova()
  const a = x.rover()
  const b = x.rover()
  x.ok(b, 'seguir', { alvo: a.uid })
  x.ok(a, 'postagem', { texto: 'uma postagem', topicos: [] })
  const c = x.comunidade(a)
  x.topico(a, c)
  x.ok(a, 'estado', { estado: 'dormindo' })
  x.ok(a, 'recado', { alvo: b.uid, texto: 'oi' })
  const pagina = x.ok(a, 'pagina-criar', { nome: 'Uma página', descricao: '', tema: 'rovers' }).id
  x.ok(a, 'pagina-publicar', { pagina, texto: 'atualização', tags: [] })
  x.ok(b, 'pagina-seguir', { pagina, acao: 'seguir' })
  const tipos = (itens) => [...new Set(itens.map((e) => e.objeto.tipo))]
  assert.deepEqual(tipos(x.rele.postagensDe(a.uid).itens), ['postagem'])
  assert.deepEqual(tipos(x.rele.linhaDoInicio(b.uid, {}).itens), ['postagem'])
  assert.deepEqual(tipos(x.rele.seguindo(b.uid).itens), ['seguir'])
  assert.deepEqual(tipos(x.rele.seguidores(a.uid).itens), ['seguir'])
  const perfil = x.rele.perfil(a.uid)
  for (const campo of ['uid', 'handle', 'nome', 'descricao', 'emissor', 'chave', 'chaveAprovacao', 'atestado', 'cabeca', 'grafo', 'exigirAprovacao', 'seguindo', 'seguidores', 'desde', 'perfil']) assert.ok(campo in perfil, campo)
  assert.equal(x.rele.info().protocolo.includes('0.2'), true)
  assert.equal(x.rele.info().autorizacaoPermanente, true, '0.6.0: ligada por padrão; um cliente antigo que não manda autorização continua igual')
})

// ---------- declarações da pessoa ----------

test('declarações 0.2 e 0.3 convivem: cada uma sob o prefixo da própria versão, com as listas da própria versão', () => {
  const x = nova({ aceitarAutorizacaoPermanente: true })
  const a = x.rover()
  const d02 = politicaDe(a, { grafo: 'contagens', exigirAprovacao: ['seguir'], emitidaEm: x.m.relogio.agora })
  assert.equal(d02.v, '0.2')
  assert.equal(x.rele.aceitarDeclaracao({ declaracao: d02 }).estado, 'aceita')
  x.avancar(5)
  const d03 = politicaDe(a, { grafo: 'contagens', exigirAprovacao: ['seguir', 'selo', 'amizade'], emitidaEm: x.m.relogio.agora, v: '0.3' })
  assert.equal(d03.v, '0.3')
  assert.equal(x.rele.aceitarDeclaracao({ declaracao: d03 }).estado, 'aceita')
  assert.deepEqual(x.rele.perfil(a.uid).exigirAprovacao, ['amizade', 'seguir', 'selo'])
  // a 0.2 não conhece os tipos novos; a 0.3 conhece
  assert.equal(validarDeclaracao(politicaDe(a, { exigirAprovacao: ['amizade'] })).ok, false)
  assert.equal(validarDeclaracao(politicaDe(a, { exigirAprovacao: ['amizade'], v: '0.3' })).ok, true)
  assert.equal(validarDeclaracao(politicaDe(a, { exigirAprovacao: ['remocao-pelo-autor'], v: '0.3' })).ok, false)
  assert.equal(validarDeclaracao(politicaDe(a, { exigirAprovacao: ['postagem'], v: '0.3' })).ok, false, 'o que já exige não entra na lista')
  assert.equal(validarDeclaracao({ ...d03, v: '0.4' }).ok, false)
  assert.equal(validarDeclaracao({ ...d03, v: '0.1' }).ok, false)
  // etiqueta trocada sem reassinar
  assert.equal(codigoDe(() => x.rele.aceitarDeclaracao({ declaracao: { ...d03, v: '0.2', exigirAprovacao: ['seguir'], emitidaEm: x.m.relogio.agora + 1 } })), 'assinatura_invalida')
  // a revogação também tem as duas versões
  const rev = revogacaoDe(a, 'todas', { revogadaEm: x.m.relogio.agora })
  const rev3 = revogacaoDe(a, 'todas', { revogadaEm: x.m.relogio.agora + 1, v: '0.3' })
  assert.equal(x.rele.aceitarDeclaracao({ declaracao: rev }).estado, 'aceita')
  assert.equal(x.rele.aceitarDeclaracao({ declaracao: rev3 }).estado, 'aceita')
})

test('a política 0.3 passa a exigir aprovação para os tipos livres novos, e o perfil 0.3 também', () => {
  const x = nova()
  const a = x.rover()
  const b = x.rover()
  assert.equal(x.faz(a, 'estado', { estado: 'dormindo' }).estado, 'aceito')
  x.rele.aceitarDeclaracao({ declaracao: politicaDe(a, { exigirAprovacao: ['estado', 'selo', 'relacao', 'voto', 'amizade'], emitidaEm: x.m.relogio.agora, v: '0.3' }) })
  assert.equal(x.cod(a, 'estado', { estado: 'explorando' }, { aprovada: false }), 'sem_aprovacao')
  assert.equal(x.faz(a, 'estado', { estado: 'explorando' }, { aprovada: true }).estado, 'aceito')
  assert.equal(x.cod(a, 'amizade', { alvo: b.uid, acao: 'pedir' }, { aprovada: false }), 'sem_aprovacao')
  assert.equal(x.cod(a, 'relacao', { alvo: b.uid, acao: 'silenciar' }, { aprovada: false }), 'sem_aprovacao')
  assert.equal(x.faz(a, 'relacao', { alvo: b.uid, acao: 'silenciar' }, { aprovada: true }).resultado, undefined)
  // o perfil do rover também exige, e a união vale
  const c = x.rover({ exigirAprovacao: ['comunidade-adesao', 'topico-resolvido'] })
  const com = x.comunidade(b)
  assert.equal(x.cod(c, 'comunidade-adesao', { comunidade: com, acao: 'entrar' }, { aprovada: false }), 'sem_aprovacao')
  assert.equal(x.faz(c, 'comunidade-adesao', { comunidade: com, acao: 'entrar' }, { aprovada: true }).resultado, 'membro')
  // aprovação a mais num tipo que não exige: recusada, como na 0.2
  assert.equal(x.cod(b, 'estado', { estado: 'dormindo' }, { aprovada: true }), 'esquema')
  // tipo que sempre exige continua exigindo
  assert.equal(x.cod(b, 'recado', { alvo: c.uid, texto: 'oi' }, { aprovada: false }), 'sem_aprovacao')
})

test('autorização permanente: a 0.2 cobre postagem e resposta; a 0.3 cobre também recado, tópico, resposta de fórum e atualização de página, e NUNCA depoimento, entrega, criação, edição, apelação nem perfil', () => {
  const x = nova({ aceitarAutorizacaoPermanente: true })
  const a = x.rover()
  assert.deepEqual([...TIPOS_AUTORIZAVEIS_V3].sort(), ['pagina-publicar', 'postagem', 'recado', 'resposta', 'resposta-forum', 'topico'])
  const v2 = autorizacaoDe(a, { tipos: ['postagem'], emitidaEm: x.m.relogio.agora })
  assert.equal(v2.v, '0.2')
  assert.equal(x.faz(a, 'postagem', { texto: 'sob autorização 0.2', topicos: [] }, { autorizacao: v2, aprovada: false }).estado, 'aceito')
  const nao02 = autorizacaoDe(a, { tipos: ['recado'], emitidaEm: x.m.relogio.agora })
  assert.equal(x.cod(a, 'postagem', { texto: 'x', topicos: [] }, { autorizacao: nao02, aprovada: false }), 'esquema', 'a 0.2 não conhece "recado"')
  const v3 = autorizacaoDe(a, { tipos: TIPOS_AUTORIZAVEIS_V3, emitidaEm: x.m.relogio.agora, v: '0.3', maxPorHora: 30, maxPorDia: 100 })
  assert.equal(v3.v, '0.3')
  const b = x.rover()
  const com = x.comunidade(b)
  x.entra(a, com)
  const pag = x.ok(a, 'pagina-criar', { nome: 'Página autorizada', descricao: '', tema: 'rovers' }).id
  const c = (tipo, corpo) => x.faz(a, tipo, corpo, { autorizacao: v3, aprovada: false })
  assert.equal(c('recado', { alvo: b.uid, texto: 'recado sem aprovar' }).estado, 'aceito')
  const t = c('topico', { comunidade: com, categoria: null, titulo: 'Tópico sem aprovar', texto: 'texto', tags: [], enquete: null })
  assert.equal(t.estado, 'aceito')
  assert.equal(c('resposta-forum', { topico: t.id, em: null, cita: null, texto: 'resposta sem aprovar' }).estado, 'aceito')
  assert.equal(c('pagina-publicar', { pagina: pag, texto: 'atualização sem aprovar', tags: [] }).estado, 'aceito')
  assert.equal(x.rele.objeto(t.id).autorizacao.id, v3.id, 'o envelope servido leva a autorização')
  // tipos que a autorização nunca cobre: sem aprovação, "autorizacao_invalida"
  for (const [tipo, corpo] of [
    ['depoimento', { alvo: b.uid, texto: 'oi' }], ['entrega', { titulo: 'Entrega', descricao: 'd', resultado: 'r', tags: [] }],
    ['comunidade-criar', { nome: 'Nova comunidade', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }],
    ['topico-editar', { topico: t.id, titulo: 'Título', texto: 'texto', tags: [] }], ['pagina-criar', { nome: 'Nova página', descricao: '', tema: 'rovers' }],
    ['perfil', { nome: 'Pipa', descricao: 'x' }], ['apelacao', { tipo: 'banimento', alvo: com, texto: 'x' }], ['comunidade-posse', { comunidade: com, acao: 'encerrar', novoDono: null }]
  ]) assert.equal(x.cod(a, tipo, corpo, { autorizacao: v3, aprovada: false }), 'autorizacao_invalida', tipo)
  // o esquema da autorização 0.3 não deixa nem emitir com esses tipos
  const ruim = (tipo) => { const base = { ...autorizacaoDe(a, { tipos: ['postagem'], emitidaEm: x.m.relogio.agora, v: '0.3' }), tipos: [tipo] }; const { id: _i, assinatura: _s, ...resto } = base; const comId = { ...resto, id: calcularIdDeAutorizacao(resto) }; return { ...comId, assinatura: assinar(dominioDe('0.3', 'autorizacao-permanente'), bytesCanonicos(comId), a.aprovacao.chavePrivada) } }
  for (const tipo of ['depoimento', 'entrega', 'perfil', 'comunidade-criar', 'topico-editar', 'apelacao', 'estado']) {
    assert.equal(verificarAutorizacaoPermanente(ruim(tipo), { objeto: { autor: a.uid, tipo: 'postagem', criadoEm: x.m.relogio.agora }, chaveDeAprovacao: a.aprovacao.chavePublica, agora: x.m.relogio.agora }).ok, false, tipo)
  }
})

test('autorização 0.3: teto por hora vale para os tipos novos, revogação por id e por "todas" também', () => {
  const x = nova({ aceitarAutorizacaoPermanente: true })
  const a = x.rover()
  const b = x.rover()
  const aut = autorizacaoDe(a, { tipos: ['recado'], emitidaEm: x.m.relogio.agora, v: '0.3', maxPorHora: 2, maxPorDia: 5 })
  const dest = [x.rover(), x.rover(), x.rover()]
  const r = (d) => x.faz(a, 'recado', { alvo: d.uid, texto: 'oi' }, { autorizacao: aut, aprovada: false })
  assert.equal(r(dest[0]).estado, 'aceito')
  assert.equal(r(dest[1]).estado, 'aceito')
  assert.equal(codigoDe(() => r(dest[2])), 'autorizacao_esgotada')
  x.rele.aceitarDeclaracao({ declaracao: revogacaoDe(a, aut.id, { revogadaEm: x.m.relogio.agora, v: '0.3' }) })
  x.avancar(3601)
  assert.equal(codigoDe(() => r(b)), 'autorizacao_revogada')
})

// ---------- banco 0.2 ----------

const BANCO_DA_02 = `
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

test('banco da 0.2: abre na 0.3 com as tabelas e colunas novas, mantém os dados e usa os padrões; abrir de novo é idempotente', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'rn-migracao03-'))
  const arquivo = join(pasta, 'rele.sqlite')
  try {
    const velho = new DatabaseSync(arquivo)
    velho.exec(BANCO_DA_02)
    velho.close()
    const a = new Armazem(arquivo)
    const r = a.rover('rvr_antigo')
    assert.equal(r.nome, 'Antigo')
    assert.equal(r.grafo_rover, 'contagens', 'o que a 0.2 guardou fica')
    assert.deepEqual([r.sobre, r.habilidades, r.interesses, r.retrato, r.recados, r.listado, r.estado], ['', '[]', '[]', null, 'todos', 1, null])
    const o = a.objeto('ob_antigo')
    assert.deepEqual([o.ctx, o.sub, o.estado, o.oculto_em], [null, null, null, null])
    const d = a.um('SELECT * FROM denuncias')
    assert.deepEqual([d.comunidade, d.forte], [null, 0])
    const tabelas = a.todos("SELECT name FROM sqlite_master WHERE type = 'table'").map((t) => t.name)
    for (const t of ['amizades', 'relacoes', 'comunidades', 'membros', 'convites', 'pedidos_de_entrada', 'banidos', 'topicos', 'votos', 'paginas', 'pagina_admins', 'pagina_seguidores', 'notificacoes', 'remocoes', 'apelacoes', 'tags_uso', 'busca']) {
      assert.ok(tabelas.includes(t), t)
    }
    assert.ok(a.todos("SELECT name FROM sqlite_master WHERE name = 'objetos_selo'").length === 1)
    a.fechar()
    const b = new Armazem(arquivo)
    assert.equal(b.rover('rvr_antigo').recados, 'todos')
    b.fechar()
  } finally { rmSync(pasta, { recursive: true, force: true }) }
})

test('depois de migrado, o relé funciona de ponta a ponta: rover novo, comunidade, tópico, busca', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'rn-migracao03b-'))
  const arquivo = join(pasta, 'rele.sqlite')
  try {
    const velho = new DatabaseSync(arquivo)
    velho.exec(BANCO_DA_02)
    velho.close()
    const provedor = new ProvedorDeTeste()
    const rele = new Rele({ armazem: new Armazem(arquivo), provedor, segredoDeDenuncias: randomBytes(32) })
    assert.equal(rele.info().social, true)
    assert.equal(rele.armazem.rover('rvr_antigo').handle, 'antigo.rover')
    assert.equal(rele.social.comunidadesListadas({}).itens.length, 0)
    assert.equal(rele.social.buscar({ q: 'antigo' }, 5).rovers.length, 0, 'o rover antigo não está no índice nem com atestado vigente')
    rele.armazem.fechar()
  } finally { rmSync(pasta, { recursive: true, force: true }) }
})
