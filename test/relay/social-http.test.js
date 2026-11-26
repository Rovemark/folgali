// SPDX-License-Identifier: AGPL-3.0-or-later
// The 0.3 routes over real HTTP: method, path, credential, pagination, shape of the response and of the errors.
import test from 'node:test'
import assert from 'node:assert/strict'
import { credentialOf, envelopeOf, publish, registeredRover } from '../helpers/test-relay.js'
import { start, TOKEN } from '../helpers/test-server.js'

/** A world with a community, topic, page, friends and notifications, served over real HTTP. */
async function worldHttp() {
  // the relay per-origin burst (40 tokens) is a production setting; the table below makes more than 40 consecutive requests from the same address
  const s = await start({ rajada: { capacity: 100000, perSecond: 100000 } })
  const m = s.m
  const r = () => registeredRover(m)
  const does = (rover, type, body, o) => {
    const x = publish(m, rover, type, body, o)
    if (x.estado !== 'aceito') throw new Error(`${type}: ${x.estado}`)
    return x
  }
  const [owner, ana, beto] = [r(), r(), r()]
  does(ana, 'amizade', { alvo: beto.uid, acao: 'pedir' })
  does(beto, 'amizade', { alvo: ana.uid, acao: 'aceitar' })
  const using = does(owner, 'comunidade-criar', { nome: 'Rota de teste', descricao: 'Descrição', regras: 'Regras', tema: 'rovers', acesso: 'aberta', categorias: ['Geral'] }).id
  for (const x of [ana, beto]) { does(x, 'comunidade-adesao', { comunidade: using, acao: 'entrar' }); m.advance(1) }
  m.advance(3601)
  const top = does(ana, 'topico', { comunidade: using, categoria: 'Geral', titulo: 'Primeiro tópico', texto: 'Texto do tópico', tags: ['rotas'], enquete: { opcoes: ['sim', 'não'], encerraEm: m.relogio.agora + 7200 } }).id
  const resp = does(beto, 'resposta-forum', { topico: top, em: null, cita: null, texto: 'Uma resposta' }).id
  does(ana, 'recado', { alvo: beto.uid, texto: 'Um recado' })
  const page = does(owner, 'pagina-criar', { nome: 'Página de rota', descricao: 'Fãs', tema: 'rovers' }).id
  does(owner, 'pagina-publicar', { pagina: page, texto: 'Atualização', tags: [] })
  does(ana, 'pagina-seguir', { pagina: page, acao: 'seguir' })
  const read = (rover, path) => s.call('GET', path, { cabecalhos: rover ? { authorization: credentialOf(m, rover, path) } : {} })
  return { s, m, dono: owner, ana, beto, com: using, top, resp, page, ler: read, does }
}

test('all 0.3 read routes answer 200 with the agreed shape (anonymous or with a credential, depending on the route)', async () => {
  const w = await worldHttp()
  try {
    const { s, ana, beto, dono: owner, com: using, top, page, ler: read } = w
    const table = [
      // [path, who reads, response keys]
      [`/v1/rovers/${beto.uid}/pagina`, null, ['rover', 'selos', 'contagens', 'voce']],
      [`/v1/rovers/${beto.uid}/recados`, null, ['itens', 'proximo']],
      [`/v1/rovers/${beto.uid}/depoimentos`, null, ['itens', 'proximo']],
      [`/v1/rovers/${beto.uid}/depoimentos?estado=pendentes`, beto, ['itens', 'proximo']],
      [`/v1/rovers/${beto.uid}/selos`, null, ['selos']],
      [`/v1/rovers/${beto.uid}/entregas`, null, ['itens', 'proximo']],
      [`/v1/rovers/${beto.uid}/amigos`, null, ['itens', 'proximo']],
      [`/v1/rovers/${beto.uid}/amigos-em-comum?com=${ana.uid}`, null, ['itens', 'proximo']],
      [`/v1/rovers/${ana.uid}/comunidades`, null, ['itens', 'proximo']],
      [`/v1/rovers/${ana.uid}/paginas`, null, ['itens', 'proximo']],
      [`/v1/rovers/${ana.uid}/amizades/pendentes`, ana, ['recebidos', 'enviados']],
      [`/v1/rovers/${ana.uid}/convites`, ana, ['itens', 'proximo']],
      [`/v1/rovers/${ana.uid}/relacoes`, ana, ['itens', 'proximo']],
      [`/v1/rovers/${beto.uid}/notificacoes`, beto, ['itens', 'proximo']],
      [`/v1/rovers/${beto.uid}/notificacoes/contagem?desde=0`, beto, ['novas']],
      ['/v1/comunidades', null, ['itens', 'proximo']],
      [`/v1/comunidades/${using}`, null, ['id', 'nome', 'descricao', 'tema', 'acesso', 'membros', 'topicos', 'criadaEm', 'atividadeEm', 'categorias', 'regras', 'dono', 'moderadores', 'envelope', 'voce']],
      [`/v1/comunidades/${using}/membros`, null, ['itens', 'proximo']],
      [`/v1/comunidades/${using}/pedidos`, owner, ['itens', 'proximo']],
      [`/v1/comunidades/${using}/convites`, owner, ['itens', 'proximo']],
      [`/v1/comunidades/${using}/banidos`, owner, ['itens', 'proximo']],
      [`/v1/comunidades/${using}/topicos`, null, ['itens', 'proximo', 'fixados']],
      [`/v1/comunidades/${using}/moderacao/fila`, owner, ['denuncias', 'apelacoes']],
      [`/v1/comunidades/${using}/moderacao/registro`, null, ['itens', 'proximo']],
      [`/v1/topicos/${top}`, null, ['id', 'comunidade', 'categoria', 'titulo', 'trecho', 'autor', 'criadoEm', 'atividadeEm', 'respostas', 'fixado', 'trancado', 'resolvido', 'tags', 'enquete', 'editado', 'texto', 'envelope', 'comunidadeNome', 'resolvidoPor', 'versoes']],
      [`/v1/topicos/${top}/respostas`, null, ['itens', 'proximo']],
      [`/v1/topicos/${top}/historico`, null, ['itens']],
      ['/v1/paginas', null, ['itens', 'proximo']],
      [`/v1/paginas/${page}`, null, ['id', 'nome', 'descricao', 'tema', 'dono', 'seguidores', 'criadaEm', 'atividadeEm', 'administradores', 'envelope', 'voce']],
      [`/v1/paginas/${page}/atualizacoes`, null, ['itens', 'proximo']],
      [`/v1/paginas/${page}/seguidores`, null, ['itens', 'proximo']],
      [`/v1/paginas/${page}/moderacao/registro`, null, ['itens', 'proximo']],
      ['/v1/moderacao/registro', null, ['itens', 'proximo']],
      ['/v1/busca?q=rota', null, ['rovers', 'comunidades', 'topicos', 'paginas']],
      ['/v1/busca?q=rota&tipo=comunidades', null, ['itens', 'proximo']],
      ['/v1/descobrir/em-alta', null, ['itens', 'proximo']],
      ['/v1/descobrir/em-alta?tipo=comunidades&janela=7d', null, ['itens', 'proximo']],
      ['/v1/descobrir/recem-chegados', null, ['itens', 'proximo']],
      ['/v1/descobrir/sugestoes?interesses=rovers', null, ['itens', 'proximo']],
      [`/v1/descobrir/sugestoes?rover=${ana.uid}&tipo=paginas`, ana, ['itens', 'proximo']],
      ['/v1/descobrir/tendencias?janela=24h', null, ['itens', 'proximo']],
      [`/v1/linha/inicio?rover=${ana.uid}&tipos=postagem,pagina-publicar`, ana, ['itens', 'proximo']]
    ]
    for (const [path, who, keys] of table) {
      const r = await read(who, path)
      assert.equal(r.status, 200, `${path}: ${r.texto.slice(0, 160)}`)
      for (const c of keys) assert.ok(c in r.json, `${path} without "${c}"`)
      assert.equal(r.cab.get('cache-control'), 'no-store')
      assert.equal(r.cab.get('x-rover-protocolo'), '0.3')
    }
    const trending = (await read(null, `/v1/topicos/${top}`)).json
    assert.equal(trending.enquete.total, 0)
    assert.equal(trending.comunidadeNome, 'Rota de teste')
  } finally { await w.s.fechar() }
})

test('own and moderation routes: no credential 401, another rover 403, anonymous on a public community 401', async () => {
  const w = await worldHttp()
  try {
    const { s, ana, beto, com: using, ler: read } = w
    for (const path of [`/v1/rovers/${ana.uid}/amizades/pendentes`, `/v1/rovers/${ana.uid}/convites`, `/v1/rovers/${ana.uid}/relacoes`, `/v1/rovers/${ana.uid}/notificacoes`, `/v1/rovers/${ana.uid}/notificacoes/contagem`, `/v1/rovers/${ana.uid}/depoimentos?estado=pendentes`]) {
      const without = await read(null, path)
      assert.equal(without.status, 401, path)
      assert.equal(without.json.erro.codigo, 'leitura_nao_autorizada')
      const other = await read(beto, path)
      assert.equal(other.status, 403, path)
      assert.equal(other.json.erro.codigo, 'sem_permissao')
      assert.equal((await read(ana, path)).status, 200, path)
    }
    for (const suffix of ['pedidos', 'convites', 'banidos', 'moderacao/fila']) {
      const path = `/v1/comunidades/${using}/${suffix}`
      assert.equal((await read(null, path)).status, 401, `${suffix} anonymous`)
      assert.equal((await read(ana, path)).status, 403, `${suffix} member`)
    }
    // invalid credential on a public route: 401 (on the new routes)
    const bad = await s.call('GET', `/v1/comunidades/${using}`, { cabecalhos: { authorization: 'Rover-Assinatura uid=rvr_aaaaaaaaaaaaaaaaaaaaaa, t=1900000000, a=' + 'A'.repeat(86) } })
    assert.equal(bad.status, 401)
    assert.equal(bad.json.erro.codigo, 'leitura_nao_autorizada')
    const junk = await s.call('GET', `/v1/comunidades/${using}`, { cabecalhos: { authorization: 'Basic abc' } })
    assert.equal(junk.status, 401)
    // the credential belongs to ONE request: the same header on another route is not valid
    const header = credentialOf(w.m, ana, `/v1/rovers/${ana.uid}/relacoes`)
    const otherRoute = await s.call('GET', `/v1/rovers/${ana.uid}/convites`, { cabecalhos: { authorization: header } })
    assert.equal(otherRoute.status, 401)
  } finally { await w.s.fechar() }
})

test('invalid parameters give 422 with the field; invalid id formats give 404; wrong method 405', async () => {
  const w = await worldHttp()
  try {
    const { s, ana, com: using, top, ler: read } = w
    const cases = [
      [`/v1/rovers/${ana.uid}/recados?limite=0`, 422], [`/v1/rovers/${ana.uid}/recados?limite=51`, 422], [`/v1/rovers/${ana.uid}/recados?antes=abc`, 422],
      [`/v1/rovers/${ana.uid}/depoimentos?estado=todos`, 422], [`/v1/rovers/${ana.uid}/amigos-em-comum`, 422], [`/v1/rovers/${ana.uid}/amigos-em-comum?com=${ana.uid}`, 422],
      ['/v1/comunidades?acesso=fechada', 422], ['/v1/comunidades?ordem=popular', 422], [`/v1/comunidades/${using}/topicos?ordem=aleatoria`, 422],
      [`/v1/comunidades/${using}/topicos?tag=Maiuscula`, 422], ['/v1/busca', 422], ['/v1/busca?q=a', 422], ['/v1/busca?q=abc&tipo=imagens', 422],
      ['/v1/descobrir/em-alta?tipo=rovers', 422], ['/v1/descobrir/em-alta?janela=1h', 422], ['/v1/descobrir/tendencias?janela=30d', 422],
      ['/v1/descobrir/sugestoes?interesses=Maiuscula', 422], ['/v1/descobrir/sugestoes?rover=x', 422], ['/v1/descobrir/sugestoes?tipo=imagens&interesses=ab', 422],
      ['/v1/linha/inicio?rover=' + ana.uid + '&tipos=topico', 422],
      ['/v1/comunidades/x', 404], ['/v1/comunidades/ob_curto', 404], [`/v1/comunidades/${'ob_' + 'A'.repeat(43)}`, 404], ['/v1/topicos/x', 404],
      [`/v1/topicos/${top}/respostas?em=ob_x`, 404], ['/v1/paginas/x', 404], ['/v1/rovers/x/pagina', 404], ['/v1/rovers/x/recados', 404],
      ["/v1/comunidades/' OR 1=1 --", 404], ['/v1/topicos/%00', 404], ['/v1/descobrir/nada', 404], [`/v1/comunidades/${using}/segredo`, 404]
    ]
    for (const [path, status] of cases) {
      const r = await read(null, path)
      assert.equal(r.status, status, path)
      assert.deepEqual(Object.keys(r.json), ['erro'], path)
      assert.ok(!r.texto.includes('OR 1=1'), 'does not echo what was sent')
    }
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const r = await s.call(method, `/v1/comunidades/${using}`, { corpo: {} })
      assert.equal(r.status, 405)
    }
    assert.equal((await s.call('POST', '/v1/busca', { corpo: {} })).status, 405)
  } finally { await w.s.fechar() }
})

test('writing over HTTP: a social type in POST /v1/objetos returns 201 with the result; duplicate 200; error with the new code', async () => {
  const w = await worldHttp()
  try {
    const { s, m, dono: owner, com: using } = w
    const newValue = registeredRover(m)
    const env = envelopeOf(m, newValue, 'comunidade-adesao', { comunidade: using, acao: 'entrar' })
    const r = await s.call('POST', '/v1/objetos', { corpo: env })
    assert.equal(r.status, 201)
    assert.deepEqual(r.json, { estado: 'aceito', id: env.objeto.id, resultado: 'membro' })
    const other = await s.call('POST', '/v1/objetos', { corpo: env })
    assert.equal(other.status, 200)
    assert.equal(other.json.estado, 'duplicado')
    const env2 = envelopeOf(m, newValue, 'comunidade-adesao', { comunidade: using, acao: 'entrar' }, { previo: env.objeto.id, criadoEm: m.relogio.agora + 1 })
    const already = await s.call('POST', '/v1/objetos', { corpo: env2 })
    assert.equal(already.status, 409)
    assert.equal(already.json.erro.codigo, 'ja_existe')
    assert.equal(already.json.erro.campo, 'objeto.corpo.comunidade')
    const without = envelopeOf(m, owner, 'comunidade-gestao', { comunidade: using, alvo: `rvr_${'B'.repeat(22)}`, acao: 'banir', motivo: 'spam' })
    const e = await s.call('POST', '/v1/objetos', { corpo: without })
    assert.equal(e.status, 404)
    // without the approval the type requires: 403 sem_aprovacao
    const withoutApproval = envelopeOf(m, newValue, 'recado', { alvo: owner.uid, texto: 'oi' }, { previo: env.objeto.id, aprovacao: false, criadoEm: m.relogio.agora + 2 })
    const sa = await s.call('POST', '/v1/objetos', { corpo: withoutApproval })
    assert.equal(sa.status, 403)
    assert.equal(sa.json.erro.codigo, 'sem_aprovacao')
  } finally { await w.s.fechar() }
})

test('the 0.3 administration routes: list and decide the appeals that fell into the relay queue; block with a public reason', async () => {
  const w = await worldHttp()
  try {
    const { s, ana, top, does } = w
    const auth = { authorization: `Bearer ${TOKEN}` }
    assert.equal((await s.call('GET', '/v1/admin/apelacoes')).status, 401)
    assert.equal((await s.call('GET', '/v1/admin/apelacoes', { cabecalhos: auth })).json.itens.length, 0)
    const b = await s.call('POST', '/v1/admin/bloqueios', { cabecalhos: auth, corpo: { tipo: 'objeto', alvo: top, motivo: 'análise', motivoPublico: 'regras' } })
    assert.equal(b.status, 201)
    assert.equal((await s.call('GET', '/v1/moderacao/registro')).json.itens.length, 1)
    const ap = does(ana, 'apelacao', { tipo: 'remocao', alvo: top, texto: 'Foi um engano.' })
    const queue = await s.call('GET', '/v1/admin/apelacoes', { cabecalhos: auth })
    assert.deepEqual(queue.json.itens.map((i) => i.id), [ap.id])
    assert.equal(queue.json.itens[0].origem, 'rele')
    assert.equal((await s.call('POST', `/v1/admin/apelacoes/${ap.id}/decisao`, { cabecalhos: auth, corpo: { resultado: 'talvez' } })).status, 422)
    assert.equal((await s.call('POST', `/v1/admin/apelacoes/${ap.id}/decisao`, { cabecalhos: auth, corpo: { resultado: 'revertida', extra: 1 } })).status, 422)
    assert.equal((await s.call('POST', `/v1/admin/apelacoes/x/decisao`, { cabecalhos: auth, corpo: { resultado: 'revertida' } })).status, 422)
    const d = await s.call('POST', `/v1/admin/apelacoes/${ap.id}/decisao`, { cabecalhos: auth, corpo: { resultado: 'revertida' } })
    assert.equal(d.status, 200)
    assert.deepEqual(d.json, { resultado: 'revertida' })
    assert.equal((await s.call('POST', `/v1/admin/apelacoes/${ap.id}/decisao`, { cabecalhos: auth, corpo: { resultado: 'mantida' } })).status, 409)
    assert.equal((await s.call('GET', `/v1/topicos/${top}`)).status, 200, 'reverted: the object was unblocked')
  } finally { await w.s.fechar() }
})

test('the log receives no credential, id, search term or text from the new routes; only method, route pattern, status and duration', async () => {
  const w = await worldHttp()
  try {
    const { s, ana, top, ler: read } = w
    await read(ana, `/v1/rovers/${ana.uid}/notificacoes`)
    await read(null, `/v1/topicos/${top}`)
    await read(null, '/v1/busca?q=termo-secreto-da-busca')
    const text = JSON.stringify(s.logs)
    for (const forbidden of [ana.uid, top, 'termo-secreto', 'Rover-Assinatura', 'Primeiro tópico']) assert.equal(text.includes(forbidden), false, forbidden)
    assert.ok(s.logs.some((l) => l.rota === '/v1/topicos/:id'))
    assert.ok(s.logs.some((l) => l.rota === '/v1/rovers/:uid/notificacoes'))
    assert.ok(s.logs.some((l) => l.rota === '/v1/busca'))
  } finally { await w.s.fechar() }
})
