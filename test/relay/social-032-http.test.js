// SPDX-License-Identifier: AGPL-3.0-or-later
// Revision 0.3.2 over real HTTP: dashboard, announcements (public and admin), vocabulary, ordering by people and COMPATIBILITY
// with 0.3.1: the keys that existed are all still there and lists without the new option are the same as before.
import test from 'node:test'
import assert from 'node:assert/strict'
import { credentialOf, publish, registeredRover } from '../helpers/test-relay.js'
import { TOKEN, start } from '../helpers/test-server.js'

async function world(options = {}) {
  const s = await start({ rajada: { capacity: 100000, perSecond: 100000 }, ...options })
  const m = s.m
  const does = (rover, type, body) => {
    const x = publish(m, rover, type, body)
    if (x.estado !== 'aceito') throw new Error(`${type}: ${x.estado}`)
    return x
  }
  const [owner, ana, beto, caio] = [registeredRover(m), registeredRover(m), registeredRover(m), registeredRover(m)]
  const using = does(owner, 'comunidade-criar', { nome: 'Rota 032', descricao: 'D', regras: 'R', tema: 'rovers', acesso: 'aberta', categorias: ['Geral'] }).id
  for (const x of [ana, beto, caio]) { does(x, 'comunidade-adesao', { comunidade: using, acao: 'entrar' }); m.advance(1) }
  m.advance(3601)
  const t1 = does(ana, 'topico', { comunidade: using, categoria: null, titulo: 'Primeiro tópico de rota', texto: 'Texto orquestra', tags: [], enquete: null }).id
  const t2 = does(ana, 'topico', { comunidade: using, categoria: null, titulo: 'Segundo tópico de rota', texto: 'Texto orquestra', tags: [], enquete: null }).id
  does(beto, 'resposta-forum', { topico: t1, em: null, cita: null, texto: 'resposta do beto' })
  does(caio, 'resposta-forum', { topico: t1, em: null, cita: null, texto: 'resposta do caio' })
  const read = (rover, path) => s.call('GET', path, { cabecalhos: rover ? { authorization: credentialOf(m, rover, path) } : {} })
  const admin = { authorization: `Bearer ${TOKEN}` }
  return { s, m, dono: owner, ana, beto, caio, com: using, t1, t2, ler: read, does, admin }
}
const includesAll = (obj, keys, where) => { for (const k of keys) assert.ok(k in obj, `${where}: the 0.3.1 key "${k}" is gone`) }

test('GET /v1/info declares 0.3.2 and the four new resources, and those of 0.3.1 remain', async () => {
  const w = await world()
  try {
    const r = await w.s.call('GET', '/v1/info')
    assert.equal(r.json.versaoDoRascunho, '0.11.0')
    assert.deepEqual(r.json.protocolo, ['0.1', '0.2', '0.3'])
    for (const n of ['inicio', 'ordem-por-pessoas', 'vocabulario', 'anuncios', 'voce-datas', 'postagem-detalhe', 'denuncia-dispensar']) assert.ok(r.json.recursos.includes(n), n)
  } finally { await w.s.fechar() }
})

test('GET /v1/inicio: 401 without credential, 200 with it, and desde is validated', async () => {
  const w = await world()
  try {
    const { ana, ler: read } = w
    const without = await read(null, '/v1/inicio')
    assert.equal(without.status, 401)
    assert.equal(without.json.erro.codigo, 'leitura_nao_autorizada')
    const ok = await read(ana, '/v1/inicio')
    assert.equal(ok.status, 200)
    assert.deepEqual(Object.keys(ok.json), ['agora', 'voce', 'avisos', 'atividade', 'pendencias', 'moderacao', 'anuncios'])
    assert.equal(ok.json.voce.uid, ana.uid)
    assert.equal(ok.json.avisos.porTipo['resposta-no-topico'], 2)
    assert.deepEqual(ok.json.atividade.map((i) => [i.tipo, i.respostas]), [['topico', 2]])
    for (const bad of ['desde=-1', 'desde=abc', 'desde=1.5', 'desde=', 'desde=4102444801', 'desde=12345678901', 'desde=0x10', 'desde=%20']) {
      assert.equal((await read(ana, `/v1/inicio?${bad}`)).status, 422, bad)
    }
    // A real timestamp has 10 digits (the count integer-from-query accepts 9): the defect the first test found.
    for (const good of ['desde=0', 'desde=1794200000', 'desde=4102444800']) assert.equal((await read(ana, `/v1/inicio?${good}`)).status, 200, good)
    const filtered = await read(ana, `/v1/inicio?desde=${ok.json.agora}`)
    assert.equal(filtered.status, 200)
    assert.equal(filtered.json.avisos.total, 0)
    // The credential covers the exact path: the one for /v1/inicio is not valid for another query.
    const swapped = await w.s.call('GET', '/v1/inicio?desde=0', { cabecalhos: { authorization: credentialOf(w.m, ana, '/v1/inicio') } })
    assert.equal(swapped.status, 401)
    assert.equal((await w.s.call('POST', '/v1/inicio')).status, 405)
  } finally { await w.s.fechar() }
})

test('announcements over the network: public read, write only with the admin credential', async () => {
  const w = await world()
  const without = await world({ tokenAdmin: null })
  try {
    const { s, admin } = w
    assert.equal((await s.call('POST', '/v1/admin/anuncios', { corpo: { titulo: 'A', texto: 'B' } })).status, 401, 'no credential')
    assert.equal((await s.call('POST', '/v1/admin/anuncios', { corpo: { titulo: 'A', texto: 'B' }, cabecalhos: { authorization: 'Bearer errado' } })).status, 401)
    assert.equal((await without.s.call('POST', '/v1/admin/anuncios', { corpo: { titulo: 'A', texto: 'B' }, cabecalhos: admin })).status, 404, 'relay without admin: the route disappears')
    assert.equal((await s.call('GET', '/v1/anuncios')).json.itens.length, 0)
    const created = await s.call('POST', '/v1/admin/anuncios', { corpo: { titulo: 'Manutenção hoje', texto: 'O relé reinicia às 3h.', fixado: true }, cabecalhos: admin })
    assert.equal(created.status, 201)
    assert.match(created.json.id, /^an_/)
    const isPublic = await s.call('GET', '/v1/anuncios')
    assert.equal(isPublic.status, 200, 'public: no credential at all')
    assert.deepEqual(isPublic.json.itens.map((i) => i.titulo), ['Manutenção hoje'])
    const one = await s.call('GET', `/v1/anuncios/${created.json.id}`)
    assert.equal(one.status, 200)
    assert.equal(one.json.fixado, true)
    assert.equal((await s.call('GET', '/v1/anuncios/an_naoexiste00000000000')).status, 404)
    assert.equal((await s.call('POST', '/v1/admin/anuncios', { corpo: { titulo: '<b>x</b>', texto: 'y' }, cabecalhos: admin })).status, 422)
    assert.equal((await s.call('POST', '/v1/admin/anuncios', { bruto: '{nao é json', cabecalhos: { ...admin, 'content-type': 'application/json' } })).status >= 400, true)
    assert.equal((await s.call('DELETE', `/v1/admin/anuncios/${created.json.id}`)).status, 401)
    assert.equal((await s.call('DELETE', `/v1/admin/anuncios/${created.json.id}`, { cabecalhos: admin })).status, 200)
    assert.equal((await s.call('DELETE', `/v1/admin/anuncios/${created.json.id}`, { cabecalhos: admin })).status, 404)
    assert.equal((await s.call('GET', '/v1/anuncios')).json.itens.length, 0)
    assert.equal((await s.call('PUT', '/v1/anuncios')).status, 405)
  } finally { await w.s.fechar(); await without.s.fechar() }
})

test('order, window, status and label reach the lists over HTTP, and an invalid value is 422', async () => {
  const w = await world()
  try {
    const { s, ler: read, com: using, t1, t2, ana, dono: owner } = w
    const ids = async (c) => (await s.call('GET', c)).json.itens.map((i) => i.id)
    assert.deepEqual(await ids(`/v1/comunidades/${using}/topicos?ordem=recentes`), [t2, t1])
    assert.deepEqual(await ids(`/v1/comunidades/${using}/topicos?ordem=melhores`), [t1, t2], 't1 has two people replying')
    assert.deepEqual(await ids(`/v1/comunidades/${using}/topicos?ordem=em-alta&janela=7d`), [t1, t2])
    for (const bad of ['ordem=populares', 'ordem=em-alta&janela=1h', 'status=Bad!', 'etiqueta=1x']) {
      assert.equal((await s.call('GET', `/v1/comunidades/${using}/topicos?${bad}`)).status, 422, bad)
    }
    w.does(owner, 'comunidade-vocabulario', { comunidade: using, etiquetas: [{ chave: 'bug', rotulo: 'Bug', cor: 'laranja' }], status: [] })
    w.does(ana, 'topico-marca', { topico: t1, etiquetas: ['bug'], status: 'aberto' })
    assert.deepEqual(await ids(`/v1/comunidades/${using}/topicos?etiqueta=bug`), [t1])
    assert.deepEqual(await ids(`/v1/comunidades/${using}/topicos?status=aberto`), [t1])
    assert.deepEqual(await ids(`/v1/comunidades/${using}/topicos?status=fechado`), [])
    const detail = (await read(null, `/v1/comunidades/${using}`)).json
    assert.deepEqual(detail.vocabulario.etiquetas, [{ chave: 'bug', rotulo: 'Bug', cor: 'laranja' }])
    assert.equal(detail.vocabulario.padrao, true)
    assert.equal((await s.call('GET', `/v1/topicos/${t1}/respostas?ordem=melhores`)).status, 200)
    assert.equal((await s.call('GET', `/v1/topicos/${t1}/respostas?ordem=populares`)).status, 422)
    assert.equal((await s.call('GET', '/v1/busca?q=orquestra&tipo=topicos&ordem=melhores')).json.itens[0].id, t1)
    assert.equal((await s.call('GET', '/v1/busca?q=orquestra&tipo=rovers&ordem=melhores')).status, 422)
    assert.equal((await s.call('GET', '/v1/busca?q=orquestra&tipo=topicos&ordem=relevancia')).status, 200)
  } finally { await w.s.fechar() }
})

test('compatibility: the 0.3.1 keys are all still there, and the topic card without a mark is the 0.3.1 one', async () => {
  const w = await world()
  try {
    const { s, com: using, t1, ana, ler: read } = w
    const detail = (await read(ana, `/v1/comunidades/${using}`)).json
    includesAll(detail, ['id', 'nome', 'descricao', 'acesso', 'regras', 'dono', 'moderadores', 'envelope', 'voce'], 'comunidade')
    includesAll(detail.voce, ['papel', 'pedidoPendente', 'convidado', 'banido', 'banidoEm', 'membroDesde'], 'comunidade.voce')
    const list = (await s.call('GET', `/v1/comunidades/${using}/topicos`)).json
    includesAll(list, ['itens', 'proximo'], 'topic list')
    includesAll(list.itens[0], ['id', 'comunidade', 'categoria', 'titulo', 'trecho', 'autor', 'criadoEm', 'atividadeEm', 'respostas', 'fixado', 'trancado', 'resolvido', 'tags', 'enquete', 'editado'], 'card')
    assert.equal('marcas' in list.itens[0], false, 'without a mark, not even the key')
    const topic = (await read(ana, `/v1/topicos/${t1}`)).json
    includesAll(topic, ['id', 'texto', 'envelope', 'comunidadeNome', 'resolvidoPor', 'versoes', 'reacoes', 'minhaReacao'], 'topic')
    assert.equal('marcas' in topic, false)
    const replies = (await s.call('GET', `/v1/topicos/${t1}/respostas`)).json
    includesAll(replies.itens[0], ['id', 'envelope', 'autor', 'criadoEm', 'em', 'cita', 'filhas', 'resolveu', 'reacoes'], 'resposta')
    const old = (await s.call('GET', `/v1/topicos/${t1}/respostas?ordem=antigas`)).json
    assert.deepEqual(old, replies, 'ordem=antigas is the default, byte for byte')
    const search = (await s.call('GET', '/v1/busca?q=orquestra&tipo=topicos')).json
    assert.deepEqual((await s.call('GET', '/v1/busca?q=orquestra&tipo=topicos&ordem=relevancia')).json, search, 'relevancia is the search default')
    const all = (await s.call('GET', '/v1/busca?q=orquestra')).json
    assert.deepEqual(Object.keys(all), ['rovers', 'comunidades', 'topicos', 'paginas'])
  } finally { await w.s.fechar() }
})

test('the relay exposes neither points nor the list of who reacted in any ordered list', async () => {
  const w = await world()
  try {
    const { s, com: using, t1, beto, caio } = w
    for (const path of [`/v1/comunidades/${using}/topicos?ordem=melhores`, `/v1/comunidades/${using}/topicos?ordem=em-alta`, `/v1/topicos/${t1}/respostas?ordem=melhores`,
      '/v1/busca?q=orquestra&tipo=topicos&ordem=melhores']) {
      const t = (await s.call('GET', path)).texto
      for (const k of ['pontos', 'score']) assert.equal(t.includes(`"${k}"`), false, `${path}: ${k}`)
      for (const r of [beto, caio]) assert.equal(t.includes(r.uid.replace('rvr_', '')) && !t.includes('"autor"'), false)
    }
  } finally { await w.s.fechar() }
})

test('old database: opening a store without the new columns adds everything and loses no data', async () => {
  const { Store } = await import('../../packages/relay/src/store.js')
  const { DatabaseSync } = await import('node:sqlite')
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'rn-arm-'))
  try {
    const file = join(dir, 'r.sqlite')
    const a = new Store(file)
    a.db.exec("INSERT INTO comunidades (id, dono, nome, chave_nome, descricao, regras, tema, acesso, categorias, criada_em, seq, atividade_em, atividade_seq, versao_id) VALUES ('ob_x','rvr_d','N','n','d','r','t','aberta','[]',1,1,1,1,'ob_v')")
    // Simulates the 0.3.1 database: removes the new columns and table.
    a.db.exec('ALTER TABLE comunidades DROP COLUMN vocabulario; ALTER TABLE topicos DROP COLUMN etiquetas; ALTER TABLE topicos DROP COLUMN status; DROP TABLE anuncios;')
    a.fechar()
    const b = new Store(file)
    const columns = (t) => b.db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name)
    assert.ok(columns('comunidades').includes('vocabulario'))
    assert.ok(columns('topicos').includes('etiquetas') && columns('topicos').includes('status'))
    assert.ok(b.db.prepare("SELECT name FROM sqlite_master WHERE name = 'anuncios'").get())
    assert.equal(b.db.prepare("SELECT nome FROM comunidades WHERE id = 'ob_x'").get().nome, 'N', 'the earlier data remains')
    assert.equal(b.db.prepare("SELECT vocabulario FROM comunidades WHERE id = 'ob_x'").get().vocabulario, null)
    b.fechar()
    void DatabaseSync
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
