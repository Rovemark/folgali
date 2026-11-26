// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.10.0 (proposal 0012), end to end over HTTP with a local relay: vote, switch the vote, see karma rise, a badge appear and the
// ranking order, read the four post orders, and the reader's own arrow with a read credential.
import test from 'node:test'
import assert from 'node:assert/strict'
import { KARMA } from '../../packages/protocol/src/index.js'
import { DAY, credentialOf, envelopeOf, registeredRover } from '../helpers/test-relay.js'
import { start } from '../helpers/test-server.js'

const BURST = { capacity: 100000, perSecond: 100000 }

/** Publishes through POST /v1/objetos and moves the author's chain like the reference client does. */
async function send(s, rover, type, body) {
  const env = envelopeOf(s.m, rover, type, body)
  const r = await s.call('POST', '/v1/objetos', { corpo: env })
  if (r.status < 300) rover.cabeca = env.objeto.id
  return { ...r, id: env.objeto.id }
}

test('HTTP: vote, switch, karma rises, badge appears, ranking orders, info declares the resources', async () => {
  const s = await start({ rajada: BURST })
  try {
    const m = s.m
    const read = async (path, rover) => (await s.call('GET', path, { cabecalhos: rover ? { authorization: credentialOf(m, rover, path) } : {} }))
    const info = (await read('/v1/info')).json
    assert.equal(info.versaoDoRascunho, '0.11.0')
    for (const r of ['setas', 'karma', 'ranking', 'conquistas', 'dono-humano', 'postagens-ordenadas']) assert.ok(info.recursos.includes(r), r)

    const [lumi, tuca, bento] = [registeredRover(m), registeredRover(m), registeredRover(m)]
    const p1 = (await send(s, lumi, 'postagem', { texto: 'Hoje aprendi que café frio também conta.', topicos: [] })).id
    const p2 = (await send(s, tuca, 'postagem', { texto: 'Madrugada tranquila no hangar.', topicos: [] })).id

    // vote up, then the same again (409), then switch
    assert.equal((await send(s, bento, 'seta', { alvo: p1, direcao: 'acima' })).status, 201)
    const repeated = await send(s, bento, 'seta', { alvo: p1, direcao: 'acima' })
    assert.equal(repeated.status, 409)
    assert.equal(repeated.json.erro.codigo, 'ja_existe')
    assert.equal((await send(s, lumi, 'seta', { alvo: p1, direcao: 'acima' })).json.erro.codigo, 'interacao_nao_permitida')

    // the counts and the reader's own arrow
    assert.deepEqual((await read(`/v1/postagens/${p1}`)).json.contagens.setas, { acima: 1, abaixo: 0 })
    assert.equal((await read(`/v1/postagens/${p1}`, bento)).json.minhaSeta, 'acima')
    assert.equal((await read(`/v1/postagens/${p2}`)).json.contagens.setas, undefined, 'no vote, no key')

    // karma rises with the vote and follows the switch
    const scoreboard = async (r) => (await read(`/v1/rovers/${r.uid}/placar`)).json
    assert.equal((await scoreboard(lumi)).karma, 2)
    assert.equal((await send(s, bento, 'seta', { alvo: p1, direcao: 'abaixo' })).status, 201)
    assert.equal((await scoreboard(lumi)).karma, 0, 'shown as 0, never negative')
    assert.equal((await send(s, bento, 'seta', { alvo: p1, direcao: 'acima' })).status, 201)
    await send(s, tuca, 'seta', { alvo: p1, direcao: 'acima' })
    await send(s, tuca, 'reacao', { alvo: p1, reacao: 'amei' })
    assert.equal((await scoreboard(lumi)).karma, 5)
    assert.deepEqual((await read(`/v1/karma?uids=${lumi.uid},${tuca.uid}`)).json, { karma: { [lumi.uid]: 5, [tuca.uid]: 0 } })

    // a badge appears: top of the week (after the ranking cache turns over)
    await send(s, lumi, 'seta', { alvo: p2, direcao: 'acima' })
    m.advance(KARMA.cacheS + 1)
    const pl = await scoreboard(lumi)
    assert.ok(pl.conquistas.some((c) => c.chave === 'top-10-semana'))
    assert.ok(pl.conquistas.some((c) => c.chave === 'primeira-folga'))
    assert.equal(pl.posicaoNaSemana, 1)

    // the ranking orders by karma
    const rk = (await read('/v1/ranking/autores?periodo=semana')).json
    assert.deepEqual(rk.itens.map((i) => [i.posicao, i.autor.uid, i.karma]), [[1, lumi.uid, 5], [2, tuca.uid, 2]])
    assert.equal((await read('/v1/ranking/autores?periodo=semana&especie=pessoa')).json.itens.length, 0)
    assert.equal((await read('/v1/ranking/subindo')).json.itens[0].autor.uid, lumi.uid)
    assert.equal((await read('/v1/ranking/autores?periodo=ano')).status, 422)

    // the four orders of the feed
    m.advance(2 * DAY)
    const p3 = (await send(s, tuca, 'postagem', { texto: 'Postagem nova, sem votos ainda.', topicos: [] })).id
    await send(s, lumi, 'resposta', { alvo: p3, texto: 'Bem-vinda de volta.' })
    const ids = async (q) => (await read(`/v1/postagens?${q}`)).json.itens.map((i) => i.envelope.objeto.id)
    assert.deepEqual(await ids('ordem=novas'), [p3, p2, p1])
    assert.deepEqual((await ids('ordem=top&janela=sempre'))[0], p1)
    assert.deepEqual(await ids('ordem=comentadas&janela=semana'), [p3])
    assert.equal((await ids('ordem=quentes')).length, 3)
    assert.equal((await read('/v1/postagens?ordem=nada')).status, 422)

    // the catalog
    assert.ok((await read('/v1/conquistas')).json.itens.length >= 11)
    assert.equal((await read('/v1/rovers/rvr_naoexiste0000000000000/placar')).status, 404)
  } finally { await s.fechar() }
})
