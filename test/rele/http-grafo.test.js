// SPDX-License-Identifier: AGPL-3.0-or-later
// As mesmas regras do grafo e da aprovação, agora pelo HTTP de verdade: rotas, cabeçalho de leitura, declarações e log.
import test from 'node:test'
import assert from 'node:assert/strict'
import { autorizacaoDe, politicaDe, revogacaoDe } from '../ajuda/mundo.js'
import { credencialDe, envelopeDe, publicar, roverRegistrado } from '../ajuda/rele-de-teste.js'
import { subir } from '../ajuda/servidor-de-teste.js'

const post = (texto) => ({ texto, topicos: [] })

async function cenario(opcoes = {}) {
  const s = await subir(opcoes)
  const a = roverRegistrado(s.m, opcoes.rover ?? {})
  const b = roverRegistrado(s.m)
  const c = roverRegistrado(s.m)
  publicar(s.m, a, 'seguir', { alvo: b.uid })
  publicar(s.m, a, 'seguir', { alvo: c.uid })
  publicar(s.m, c, 'seguir', { alvo: b.uid })
  publicar(s.m, b, 'postagem', post('do b'))
  const ler = (rover, caminho, extra = {}) =>
    s.chamar('GET', caminho, { cabecalhos: rover ? { authorization: credencialDe(s.m, rover, caminho, extra) } : {} })
  return { s, a, b, c, ler }
}

test('listas públicas pelo HTTP: seguindo, seguidores e a linha, com paginação', async () => {
  const { s, a, b } = await cenario()
  try {
    const seguindo = await s.chamar('GET', `/v1/rovers/${a.uid}/seguindo?limite=1`)
    assert.equal(seguindo.status, 200)
    assert.equal(seguindo.json.itens.length, 1)
    assert.ok(seguindo.json.proximo)
    const p2 = await s.chamar('GET', `/v1/rovers/${a.uid}/seguindo?limite=1&antes=${seguindo.json.proximo}`)
    assert.equal(p2.json.itens.length, 1)
    assert.notEqual(p2.json.itens[0].objeto.id, seguindo.json.itens[0].objeto.id)
    assert.equal((await s.chamar('GET', `/v1/rovers/${b.uid}/seguidores`)).json.itens.length, 2)
    assert.equal((await s.chamar('GET', `/v1/linha/inicio?rover=${a.uid}`)).json.itens.length, 1)
    assert.equal((await s.chamar('GET', `/v1/rovers/${a.uid}/seguindo?limite=0`)).status, 422)
    assert.equal((await s.chamar('GET', `/v1/rovers/${a.uid}/seguidores?limite=51`)).status, 422)
    assert.equal((await s.chamar('GET', `/v1/rovers/${a.uid}/seguindo`, { corpo: undefined })).status, 200)
    assert.equal((await s.chamar('POST', `/v1/rovers/${a.uid}/seguindo`, { corpo: {} })).status, 405)
    assert.equal((await s.chamar('GET', `/v1/rovers/rvr_nada/seguindo`)).status, 404)
  } finally { await s.fechar() }
})

test('grafo privado pelo HTTP: 403 para qualquer um, em TODAS as rotas que revelariam o grafo', async () => {
  const { s, a, b, c, ler } = await cenario({ rover: { grafo: 'privado' } })
  try {
    const idDoSeguir = s.m.armazem.um("SELECT id FROM objetos WHERE tipo = 'seguir' AND autor = :a", { a: a.uid }).id
    const rotas = [`/v1/rovers/${a.uid}/seguindo`, `/v1/rovers/${a.uid}/seguidores`, `/v1/linha/inicio?rover=${a.uid}`]
    for (const rota of rotas) {
      const anonimo = await s.chamar('GET', rota)
      assert.equal(anonimo.status, 403, rota)
      assert.equal(anonimo.json.erro.codigo, 'grafo_privado', rota)
      assert.deepEqual(Object.keys(anonimo.json), ['erro'])
      assert.ok(!anonimo.texto.includes(b.uid) && !anonimo.texto.includes(c.uid), 'a resposta não cita ninguém')
      const deOutro = await ler(b, rota)
      assert.equal(deOutro.status, 403, rota)
      assert.equal(deOutro.json.erro.codigo, 'grafo_privado', rota)
    }
    // pelo id do próprio seguir
    assert.equal((await s.chamar('GET', `/v1/objetos/${idDoSeguir}`)).status, 404)
    // variações de URL que tentam passar pelo portão
    assert.equal((await s.chamar('GET', `/v1/rovers/${a.uid}/seguindo/`)).status, 404)
    assert.equal((await s.chamar('GET', `/v1/rovers/${a.uid.replace('rvr_', '%72vr_')}/seguindo`)).status, 403)
    assert.equal((await s.chamar('GET', `/v1/rovers/${a.uid}/seguindo?uid=${b.uid}`)).status, 403)
    assert.equal((await s.chamar('GET', `/v1/linha/inicio?rover=${a.uid}&rover=${b.uid}`)).status, 403)
    assert.equal((await ler(b, `/v1/linha/inicio?rover=${a.uid}&rover=${b.uid}`)).status, 403)
    // o perfil mostra o grafo e não mostra números
    const perfil = (await s.chamar('GET', `/v1/rovers/${a.uid}`)).json
    assert.equal(perfil.grafo, 'privado')
    assert.equal(perfil.seguindo, null)
    assert.equal(perfil.seguidores, null)
    // b e c: o seguidor fechado não aparece
    const seguidoresDeB = (await s.chamar('GET', `/v1/rovers/${b.uid}/seguidores`)).json
    assert.deepEqual(seguidoresDeB.itens.map((e) => e.objeto.autor), [c.uid])
  } finally { await s.fechar() }
})

test('o próprio rover lê o grafo fechado assinando o pedido; pedido assinado com outra rota, método ou rover não passa', async () => {
  const { s, a, b, ler } = await cenario({ rover: { grafo: 'privado' } })
  try {
    for (const rota of [`/v1/rovers/${a.uid}/seguindo`, `/v1/rovers/${a.uid}/seguidores?limite=5`, `/v1/linha/inicio?rover=${a.uid}&limite=3`]) {
      const r = await ler(a, rota)
      assert.equal(r.status, 200, rota)
      assert.ok(Array.isArray(r.json.itens))
    }
    assert.equal((await ler(a, `/v1/rovers/${a.uid}/seguindo`)).json.itens.length, 2)
    // credencial feita para outra rota
    const paraOutra = credencialDe(s.m, a, `/v1/rovers/${a.uid}/seguidores`)
    assert.equal((await s.chamar('GET', `/v1/rovers/${a.uid}/seguindo`, { cabecalhos: { authorization: paraOutra } })).status, 401)
    // credencial feita para o mesmo caminho com outra consulta
    const semConsulta = credencialDe(s.m, a, `/v1/rovers/${a.uid}/seguindo`)
    assert.equal((await s.chamar('GET', `/v1/rovers/${a.uid}/seguindo?limite=1`, { cabecalhos: { authorization: semConsulta } })).status, 401)
    // credencial feita para POST
    const dePost = credencialDe(s.m, a, `/v1/rovers/${a.uid}/seguindo`, { metodo: 'POST' })
    assert.equal((await s.chamar('GET', `/v1/rovers/${a.uid}/seguindo`, { cabecalhos: { authorization: dePost } })).status, 401)
    // vencida
    const velha = credencialDe(s.m, a, `/v1/rovers/${a.uid}/seguindo`, { t: s.m.relogio.agora - 500 })
    const r = await s.chamar('GET', `/v1/rovers/${a.uid}/seguindo`, { cabecalhos: { authorization: velha } })
    assert.equal(r.status, 401)
    assert.equal(r.json.erro.codigo, 'leitura_nao_autorizada')
    // lixo
    assert.equal((await s.chamar('GET', `/v1/rovers/${a.uid}/seguindo`, { cabecalhos: { authorization: 'Bearer x' } })).status, 401)
    // de b, válida, mas é de b
    assert.equal((await ler(b, `/v1/rovers/${a.uid}/seguindo`)).status, 403)
  } finally { await s.fechar() }
})

test('o log do relé não recebe a credencial de leitura nem o uid, nem o caminho com id', async () => {
  const { s, a, ler } = await cenario({ rover: { grafo: 'privado' } })
  try {
    const rota = `/v1/rovers/${a.uid}/seguindo`
    const cab = credencialDe(s.m, a, rota)
    await ler(a, rota)
    await s.chamar('GET', rota, { cabecalhos: { authorization: 'Rover-Assinatura segredo-na-credencial' } })
    const tudo = JSON.stringify(s.logs)
    for (const proibido of [cab, cab.slice(-40), a.uid, 'Rover-Assinatura', 'segredo-na-credencial']) assert.ok(!tudo.includes(proibido), `o log não pode conter ${proibido}`)
    assert.ok(s.logs.some((l) => l.rota === '/v1/rovers/:uid/seguindo'))
  } finally { await s.fechar() }
})

test('POST /v1/declaracoes: política e revogação direto da pessoa, 201 e 200, e os erros no formato do protocolo', async () => {
  const { s, a } = await cenario()
  try {
    const p = politicaDe(a, { emitidaEm: s.m.relogio.agora, grafo: 'privado' })
    const r1 = await s.chamar('POST', '/v1/declaracoes', { corpo: { declaracao: p } })
    assert.equal(r1.status, 201)
    assert.deepEqual(r1.json, { estado: 'aceita' })
    const r2 = await s.chamar('POST', '/v1/declaracoes', { corpo: { declaracao: p } })
    assert.equal(r2.status, 200)
    assert.deepEqual(r2.json, { estado: 'duplicada' })
    assert.equal((await s.chamar('GET', `/v1/rovers/${a.uid}`)).json.grafo, 'privado')
    assert.equal((await s.chamar('GET', `/v1/rovers/${a.uid}/seguindo`)).status, 403)
    const rev = await s.chamar('POST', '/v1/declaracoes', { corpo: { declaracao: revogacaoDe(a, 'todas', { revogadaEm: s.m.relogio.agora }) } })
    assert.equal(rev.status, 201)
    // erros
    const velha = await s.chamar('POST', '/v1/declaracoes', { corpo: { declaracao: politicaDe(a, { emitidaEm: s.m.relogio.agora - 1 }) } })
    assert.equal(velha.status, 409)
    assert.equal(velha.json.erro.codigo, 'declaracao_antiga')
    const falsa = await s.chamar('POST', '/v1/declaracoes', { corpo: { declaracao: { ...p, grafo: 'publico' } } })
    assert.equal(falsa.status, 401)
    assert.equal((await s.chamar('POST', '/v1/declaracoes', { corpo: { declaracao: {} } })).status, 422)
    assert.equal((await s.chamar('POST', '/v1/declaracoes', { corpo: { x: 1 } })).status, 422)
    assert.equal((await s.chamar('POST', '/v1/declaracoes', { bruto: '{lixo', cabecalhos: { 'content-type': 'application/json' } })).status, 400)
    assert.equal((await s.chamar('POST', '/v1/declaracoes', { bruto: '{}', cabecalhos: { 'content-type': 'text/plain' } })).status, 415)
    assert.equal((await s.chamar('GET', '/v1/declaracoes')).status, 405)
    const grande = await s.chamar('POST', '/v1/declaracoes', { bruto: JSON.stringify({ declaracao: { x: 'a'.repeat(20000) } }), cabecalhos: { 'content-type': 'application/json' } })
    assert.equal(grande.status, 413)
  } finally { await s.fechar() }
})

// 0.6.0: o padrão é aceitar; o relé configurado com `false` recusa
test('autorização permanente pelo HTTP: 403 no relé que a desligou, 201 no padrão; info diz qual é', async () => {
  const padrao = await cenario({ mundo: { aceitarAutorizacaoPermanente: false } })
  const aceitando = await cenario()
  try {
    for (const [c, esperado] of [[padrao, false], [aceitando, true]]) {
      assert.equal((await c.s.chamar('GET', '/v1/info')).json.autorizacaoPermanente, esperado)
      const env = envelopeDe(c.s.m, c.a, 'postagem', post('sem aprovar'), { autorizacao: autorizacaoDe(c.a, { emitidaEm: c.s.m.relogio.agora }) })
      const r = await c.s.chamar('POST', '/v1/objetos', { corpo: env })
      assert.equal(r.status, esperado ? 201 : 403)
      if (!esperado) assert.equal(r.json.erro.codigo, 'autorizacao_nao_aceita')
      else c.a.cabeca = env.objeto.id
    }
    const info = (await aceitando.s.chamar('GET', '/v1/info')).json
    assert.equal(info.limites.autorizacaoValidadeMaxS, 7 * 86400)
    assert.equal(info.autorizacaoSemPrazo, true)
    assert.equal(info.limites.autorizacaoPorHoraMax, 60)
    assert.equal(info.limites.autorizacaoPorDiaMax, 300)
    assert.deepEqual(info.grafos, ['publico', 'contagens', 'privado'])
    // revogou: a próxima falha com 403
    const a = aceitando.a
    const auth = autorizacaoDe(a, { emitidaEm: aceitando.s.m.relogio.agora })
    await aceitando.s.chamar('POST', '/v1/declaracoes', { corpo: { declaracao: revogacaoDe(a, auth.id, { revogadaEm: aceitando.s.m.relogio.agora }) } })
    const envRev = envelopeDe(aceitando.s.m, a, 'postagem', post('depois de revogar'), { autorizacao: auth })
    const re = await aceitando.s.chamar('POST', '/v1/objetos', { corpo: envRev })
    assert.equal(re.status, 403)
    assert.equal(re.json.erro.codigo, 'autorizacao_revogada')
  } finally { await padrao.s.fechar(); await aceitando.s.fechar() }
})
