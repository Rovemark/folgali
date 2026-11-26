// SPDX-License-Identifier: AGPL-3.0-or-later
// Revision 0.3.1 over real HTTP: the new routes, the new options, validation and COMPATIBILITY with 0.3.
// The compatibility proof freezes the keys 0.3 returned and requires all of them to remain: the revision only adds.
import test from 'node:test'
import assert from 'node:assert/strict'
import { credentialOf, publish, registeredRover } from '../helpers/test-relay.js'
import { start } from '../helpers/test-server.js'

async function world() {
  const s = await start({ rajada: { capacity: 100000, perSecond: 100000 } })
  const m = s.m
  const does = (rover, type, body) => {
    const x = publish(m, rover, type, body)
    if (x.estado !== 'aceito') throw new Error(`${type}: ${x.estado}`)
    return x
  }
  const [owner, ana, beto] = [registeredRover(m), registeredRover(m), registeredRover(m)]
  const using = does(owner, 'comunidade-criar', { nome: 'Rota nova', descricao: 'D', regras: 'R', tema: 'rovers', acesso: 'aberta', categorias: ['Geral'] }).id
  for (const x of [ana, beto]) { does(x, 'comunidade-adesao', { comunidade: using, acao: 'entrar' }); m.advance(1) }
  m.advance(3601)
  const top = does(ana, 'topico', { comunidade: using, categoria: null, titulo: 'Tópico da rota', texto: 'Texto', tags: [], enquete: null }).id
  const resp = does(beto, 'resposta-forum', { topico: top, em: null, cita: null, texto: 'Uma resposta' }).id
  const post = does(ana, 'postagem', { texto: 'postagem da rota', topicos: [] }).id
  does(beto, 'reacao', { alvo: post, reacao: 'curtir' })
  does(beto, 'resposta', { alvo: post, texto: 'resposta à postagem' })
  const page = does(owner, 'pagina-criar', { nome: 'Página da rota', descricao: 'Fãs', tema: 'rovers' }).id
  does(owner, 'pagina-publicar', { pagina: page, texto: 'Atualização', tags: [] })
  does(ana, 'pagina-seguir', { pagina: page, acao: 'seguir' })
  const read = (rover, path) => s.call('GET', path, { cabecalhos: rover ? { authorization: credentialOf(m, rover, path) } : {} })
  return { s, m, dono: owner, ana, beto, com: using, top, resp, post, page, ler: read, does }
}

const includesAll = (obj, keys, where) => {
  for (const k of keys) assert.ok(k in obj, `${where}: the key "${k}" from 0.3 is gone`)
}

test('GET /v1/info declares the revision and the resources, without changing the accepted object versions', async () => {
  const w = await world()
  try {
    const r = await w.s.call('GET', '/v1/info')
    assert.equal(r.json.versaoDoRascunho, '0.11.0')
    assert.deepEqual(r.json.protocolo, ['0.1', '0.2', '0.3'])
    assert.equal(r.cab.get('x-rover-protocolo'), '0.3', 'the object stays 0.3')
    for (const name of ['voce-datas', 'avisos-com-nomes', 'depoimentos-enviados', 'removidos', 'fila-com-topico', 'denuncia-dispensar', 'reacoes-do-topico',
      'topicos-sem-categoria', 'respostas-recentes', 'lista-completa', 'temas-de-paginas', 'pessoas-em-alta', 'postagem-detalhe',
      // 0.3.2: the 0.3.1 resources stay, and 0.3.2 adds four
      'inicio', 'ordem-por-pessoas', 'vocabulario', 'anuncios']) {
      assert.ok(r.json.recursos.includes(name), name)
    }
  } finally { await w.s.fechar() }
})

test('the new routes answer 200 in the agreed format, and the route table order puts /paginas/temas before /paginas/:id', async () => {
  const w = await world()
  try {
    const { ana, beto, top, post, page, com: using, ler: read } = w
    const table = [
      [`/v1/postagens/${post}`, null, ['envelope', 'autor', 'contagens', 'minhaReacao']],
      [`/v1/postagens/${post}/respostas`, null, ['itens', 'proximo']],
      ['/v1/paginas/temas', null, ['itens']],
      [`/v1/rovers/${ana.uid}/removidos`, ana, ['itens', 'proximo']],
      [`/v1/rovers/${ana.uid}/depoimentos?estado=enviados`, ana, ['itens', 'proximo']],
      [`/v1/topicos/${top}`, beto, ['reacoes', 'minhaReacao']],
      [`/v1/topicos/${top}/respostas?ordem=recentes`, null, ['itens', 'proximo']],
      [`/v1/comunidades/${using}/topicos?categoria=-`, null, ['itens', 'proximo']],
      [`/v1/paginas/${page}/atualizacoes?completo=1`, beto, ['itens', 'proximo']],
      [`/v1/rovers/${ana.uid}/postagens?completo=1`, beto, ['itens', 'proximo']],
      [`/v1/linha/inicio?rover=${beto.uid}&tipos=postagem,pagina-publicar&completo=1`, beto, ['itens', 'proximo']]
    ]
    for (const [path, who, keys] of table) {
      const r = await read(who, path)
      assert.equal(r.status, 200, `${path} -> ${r.status} ${r.texto.slice(0, 120)}`)
      includesAll(r.json, keys, path)
    }
    const themes = await read(null, '/v1/paginas/temas')
    assert.deepEqual(themes.json.itens, [{ tema: 'rovers', paginas: 1 }], 'not read as the id "temas"')
    const complete = await read(beto, `/v1/rovers/${ana.uid}/postagens?completo=1`)
    assert.equal(complete.json.itens[0].minhaReacao, 'curtir')
    assert.deepEqual(complete.json.itens[0].contagens, { respostas: 1, reacoes: { curtir: 1, util: 0 } })
  } finally { await w.s.fechar() }
})

test('validation: completo only accepts 1, ordem only accepts the two values, estado only accepts the three; and the own-data routes require a credential', async () => {
  const w = await world()
  try {
    const { ana, beto, top, post, ler: read } = w
    for (const path of [
      `/v1/rovers/${ana.uid}/postagens?completo=2`, `/v1/rovers/${ana.uid}/postagens?completo=sim`, `/v1/rovers/${ana.uid}/postagens?completo=`,
      `/v1/topicos/${top}/respostas?ordem=aleatoria`, `/v1/postagens/${post}/respostas?ordem=aleatoria`
    ]) {
      const r = await read(null, path)
      assert.equal(r.status, 422, path)
    }
    assert.equal((await read(ana, `/v1/rovers/${ana.uid}/depoimentos?estado=todos`)).status, 422)
    assert.equal((await read(null, `/v1/rovers/${ana.uid}/removidos`)).status, 401, 'no credential')
    assert.equal((await read(beto, `/v1/rovers/${ana.uid}/removidos`)).status, 403, 'another rover credential')
    assert.equal((await read(null, `/v1/rovers/${ana.uid}/depoimentos?estado=enviados`)).status, 401)
    assert.equal((await read(null, `/v1/postagens/x`)).status, 404)
    assert.equal((await read(null, `/v1/postagens/${top}`)).status, 404, 'a topic is not a postagem')
    const tampered = await w.s.call('GET', `/v1/rovers/${ana.uid}/postagens?completo=1`, { cabecalhos: { authorization: credentialOf(w.m, beto, `/v1/rovers/${ana.uid}/postagens`) } })
    assert.equal(tampered.status, 401, 'the credential covers the exact request, including the query')
  } finally { await w.s.fechar() }
})

test('compatibility: every key 0.3 returned is still there, and lists without the new option are the 0.3 ones', async () => {
  const w = await world()
  try {
    const { ana, beto, top, com: using, page, post, ler: read } = w
    const profile = (await read(null, `/v1/rovers/${ana.uid}`)).json
    includesAll(profile, ['atestado', 'cabeca', 'chave', 'chaveAprovacao', 'descricao', 'desde', 'emissor', 'estado', 'exigirAprovacao', 'grafo', 'habilidades', 'handle',
      'interesses', 'listado', 'nome', 'perfil', 'recados', 'retrato', 'seguidores', 'seguindo', 'sobre', 'uid'], 'perfil')
    const pageJson = (await read(beto, `/v1/rovers/${ana.uid}/pagina`)).json
    includesAll(pageJson, ['rover', 'selos', 'contagens', 'voce'], 'pagina')
    includesAll(pageJson.contagens, ['amigos', 'comunidades', 'depoimentos', 'entregas', 'paginas', 'recados'], 'pagina.contagens')
    includesAll(pageJson.voce, ['amigo', 'pedidoEnviado', 'pedidoRecebido', 'euBloqueei', 'euSilenciei', 'papel'], 'pagina.voce')
    const community = (await read(beto, `/v1/comunidades/${using}`)).json
    includesAll(community.voce, ['papel', 'pedidoPendente', 'convidado', 'banido'], 'comunidade.voce')
    const topic = (await read(beto, `/v1/topicos/${top}`)).json
    includesAll(topic, ['id', 'comunidade', 'categoria', 'titulo', 'trecho', 'autor', 'criadoEm', 'atividadeEm', 'respostas', 'fixado', 'trancado', 'resolvido', 'tags',
      'enquete', 'editado', 'texto', 'envelope', 'comunidadeNome', 'resolvidoPor', 'versoes'], 'topico')
    const notice = (await read(ana, `/v1/rovers/${ana.uid}/notificacoes`)).json.itens[0]
    includesAll(notice, ['seq', 'tipo', 'em', 'origem', 'objeto', 'comunidade', 'pagina'], 'aviso')
    // without the option, lists hold envelopes, as in 0.3
    const posts = (await read(null, `/v1/rovers/${ana.uid}/postagens`)).json
    assert.ok(posts.itens[0].objeto && posts.itens[0].objeto.id === post, 'postagens without completo: envelopes')
    assert.equal('contagens' in posts.itens[0], false)
    const updates = (await read(null, `/v1/paginas/${page}/atualizacoes`)).json
    assert.ok(updates.itens[0].objeto, 'updates without completo: envelopes')
    const line = (await read(beto, `/v1/linha/inicio?rover=${beto.uid}`)).json
    assert.ok(Array.isArray(line.itens))
    const replies = (await read(null, `/v1/topicos/${top}/respostas`)).json
    includesAll(replies.itens[0], ['id', 'envelope', 'autor', 'criadoEm', 'em', 'cita', 'filhas', 'resolveu', 'reacoes'], 'resposta')
  } finally { await w.s.fechar() }
})

test('privacy over HTTP: no list of who reacted, and the read response carries no credential or identifier of the reader', async () => {
  const w = await world()
  try {
    const { ana, beto, post, ler: read } = w
    const r = await read(beto, `/v1/postagens/${post}`)
    const text = r.texto
    assert.equal(text.includes(beto.uid), false, 'the reader uid does not come back in the response')
    assert.equal(/reagiu|reatores|quemReagiu/i.test(text), false)
    const header = JSON.stringify(Object.fromEntries(r.cab.entries()))
    assert.equal(header.includes(beto.uid), false)
    assert.equal(r.json.autor.uid, ana.uid)
  } finally { await w.s.fechar() }
})
