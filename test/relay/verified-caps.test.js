// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.11.0 (proposal 0013): the ceilings of a verified account, the limits the owner sets (authorization "0.6" up to 3000), the
// optional packages that let a rover create and govern alone (`criacoes-sem-aprovacao`), and refusals that say how long is left.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TIME_OFF_ADJUSTMENT, VERIFIED_TIME_OFF_ADJUSTMENT, REQUIRES_APPROVAL, LONG_AUTHORIZATION_LIMITS, OPTIONAL_TIME_OFF_BUNDLES, TIME_OFF_DEFAULT, REVIEW_APPEALS,
  DRAFT_REVIEW, PERSON_RATE, RATE_PER_VERIFIED_ISSUER, RATE_PER_TYPE, VERIFIED_TOTAL_RATE, VERIFIED_RATE, CAPS_PER_DAY, AUTHORIZABLE_TYPES_V3,
  CREATION_TYPES, MANAGEMENT_TYPES, createTimeOffBundle, whatUnlocks, hourlyCapOf, authorizableTypesOf
} from '../../packages/protocol/src/index.js'
import { codeOf, errorOf, newWorld, registeredPerson, publish, registeredRover } from '../helpers/test-relay.js'
import { authorizationOf } from '../helpers/world.js'
import { start } from '../helpers/test-server.js'

const post = (i) => ({ texto: `postagem ${i}`, topicos: [] })
const perDay = (table, type) => table[type].find(([j]) => j === 86400)[1]

test('the numbers: 500 posts, 3000 comments, 10000 reactions and votes a day for a verified account, each with a one-minute window', () => {
  assert.equal(DRAFT_REVIEW, '0.11.0')
  for (const r of ['recusas-com-prazo', 'tetos-de-conta-verificada', 'criacoes-sem-aprovacao']) assert.ok(REVIEW_APPEALS.includes(r), r)
  assert.equal(perDay(VERIFIED_RATE, 'postagem'), 500)
  assert.equal(perDay(VERIFIED_RATE, 'resposta'), 3000)
  assert.equal(perDay(VERIFIED_RATE, 'resposta-forum'), 3000)
  assert.equal(perDay(VERIFIED_RATE, 'reacao'), 10000)
  assert.equal(perDay(VERIFIED_RATE, 'seta'), 10000)
  assert.equal(perDay(VERIFIED_RATE, 'depoimento'), 20)
  assert.deepEqual(CAPS_PER_DAY.verificada, { postagens: 500, comentarios: 3000, reacoes: 10000, votos: 10000 })
  // burst protection: every content type of the table has a one-minute window
  for (const type of ['postagem', 'topico', 'pagina-publicar', 'resposta', 'resposta-forum', 'reacao', 'seta', 'voto', 'imagem']) {
    assert.equal(VERIFIED_RATE[type][0][0], 60, type)
  }
  assert.equal(VERIFIED_TOTAL_RATE[0][0], 60)
  assert.deepEqual(RATE_PER_VERIFIED_ISSUER, [[3600, 400000]])
  // the regular tables did not move
  assert.deepEqual(RATE_PER_TYPE.postagem, [[3600, 10], [86400, 40]])
  assert.deepEqual(RATE_PER_TYPE.resposta, [[3600, 30], [86400, 150]])
  assert.deepEqual(RATE_PER_TYPE.reacao, [[3600, 120], [86400, 600]])
  assert.deepEqual(PERSON_RATE.postagem, [[3600, 10], [86400, 30]])
  // the default of the break did not move either: 20 posts and 100 comments a day
  assert.deepEqual(TIME_OFF_DEFAULT.pacotes.map((p) => [p.nome, p.maxPorDia]), [['postagens', 20], ['conversa', 100], ['perfil', 6]])
  assert.deepEqual(TIME_OFF_ADJUSTMENT.postagensPorDia, { min: 1, max: 40 })
  assert.deepEqual(VERIFIED_TIME_OFF_ADJUSTMENT, {
    postagensPorDia: { min: 1, max: 500 }, comentariosPorDia: { min: 1, max: 3000 }, reacoesPorDia: { min: 1, max: 10000 }, votosPorDia: { min: 1, max: 10000 }
  })
})

test('a verified rover posts past the regular 10 an hour; the burst window holds it at 10 a minute and says how long is left', () => {
  const m = newWorld({ verificados: true })
  const r = registeredRover(m)
  for (let i = 0; i < 10; i++) assert.equal(publish(m, r, 'postagem', post(i)).estado, 'aceito')
  const burst = errorOf(() => publish(m, r, 'postagem', post('a mais')))
  assert.equal(burst.codigo, 'limite_de_taxa')
  assert.deepEqual(burst.limite, { max: 10, janelaS: 60 })
  assert.equal(burst.retryAfterS, 60)
  assert.match(burst.message, /Limite de objetos do tipo postagem: 10 por minuto\. Libera em 1 minuto\.$/)
  // a minute later the next ten enter: 20 in the hour, which a regular account never reaches
  m.advance(61)
  for (let i = 10; i < 20; i++) assert.equal(publish(m, r, 'postagem', post(i)).estado, 'aceito')
  // the hourly ceiling is 120
  for (let batch = 2; batch < 12; batch++) {
    m.advance(61)
    for (let i = 0; i < 10; i++) assert.equal(publish(m, r, 'postagem', post(`${batch}-${i}`)).estado, 'aceito')
  }
  m.advance(61)
  const hour = errorOf(() => publish(m, r, 'postagem', post('121')))
  assert.deepEqual(hour.limite, { max: 120, janelaS: 3600 })
  assert.ok(hour.retryAfterS > 0 && hour.retryAfterS <= 3600)
  assert.match(hour.message, /Limite de objetos do tipo postagem: 120 por hora\. Libera em \d+ minutos\.$/)
})

test('a rover of a non-verified issuer keeps the regular ceiling: 10 posts an hour', () => {
  const m = newWorld()
  const r = registeredRover(m)
  for (let i = 0; i < 10; i++) assert.equal(publish(m, r, 'postagem', post(i)).estado, 'aceito')
  const e = errorOf(() => publish(m, r, 'postagem', post('a mais')))
  assert.deepEqual(e.limite, { max: 10, janelaS: 3600 })
  assert.equal(m.rele.verifiedAccount(m.provedor.publicKey), false)
})

test('a verified person has the same high ceilings; a person of a non-verified issuer keeps her own table', () => {
  const v = newWorld({ verificados: true, pessoas: true })
  const ana = registeredPerson(v)
  for (let i = 0; i < 10; i++) assert.equal(publish(v, ana, 'postagem', post(i)).estado, 'aceito')
  assert.deepEqual(errorOf(() => publish(v, ana, 'postagem', post('a mais'))).limite, { max: 10, janelaS: 60 })
  v.advance(61)
  assert.equal(publish(v, ana, 'postagem', post('onze')).estado, 'aceito', 'past the 10 an hour of PERSON_RATE')
  const c = newWorld({ pessoas: true })
  const bia = registeredPerson(c)
  for (let i = 0; i < 10; i++) assert.equal(publish(c, bia, 'postagem', post(i)).estado, 'aceito')
  c.advance(61)
  assert.deepEqual(errorOf(() => publish(c, bia, 'postagem', post('onze'))).limite, { max: 10, janelaS: 3600 })
})

test('the owner sets the limit: a "0.6" authorization carries up to 3000 a day, the older versions stay at 60 and 300', () => {
  const m = newWorld({ verificados: true })
  const r = registeredRover(m)
  assert.deepEqual(LONG_AUTHORIZATION_LIMITS, { porHoraMax: 3000, porDiaMax: 3000 })
  const trending = authorizationOf(r, { emitidaEm: m.relogio.agora, validadeS: null, v: '0.6', tipos: ['postagem'], maxPorHora: 100, maxPorDia: 500 })
  assert.equal(publish(m, r, 'postagem', post('com teto alto'), { autorizacao: trending }).estado, 'aceito')
  const refused = (options) => errorOf(() => publish(m, r, 'postagem', post('fora do teto'), { autorizacao: authorizationOf(r, { emitidaEm: m.relogio.agora, tipos: ['postagem'], ...options }) }))
  const long = refused({ validadeS: null, v: '0.6', maxPorHora: 1, maxPorDia: 3001 })
  assert.deepEqual([long.codigo, long.campo], ['esquema', 'autorizacao.maxPorDia'])
  const v3day = refused({ v: '0.3', maxPorHora: 1, maxPorDia: 301 })
  assert.deepEqual([v3day.codigo, v3day.campo], ['esquema', 'autorizacao.maxPorDia'])
  const v3hour = refused({ v: '0.3', maxPorHora: 61, maxPorDia: 300 })
  assert.deepEqual([v3hour.codigo, v3hour.campo], ['esquema', 'autorizacao.maxPorHora'])
  // the hourly ceiling follows the day the owner chose: a fifth of it, never under the default
  assert.equal(hourlyCapOf(20, 6), 6)
  assert.equal(hourlyCapOf(100, 20), 20)
  assert.equal(hourlyCapOf(500, 6), 100)
  assert.equal(hourlyCapOf(3000, 20), 600)
  assert.equal(hourlyCapOf(3, 6), 3)
  const defaultValue = createTimeOffBundle({ chavePrivadaDeAprovacao: r.aprovacao.chavePrivada, autor: r.uid, emitidaEm: m.relogio.agora, postagensPorDia: 40, comentariosPorDia: 300 })
  assert.deepEqual(defaultValue.map((a) => [a.maxPorHora, a.maxPorDia]), [[6, 40], [20, 300], [3, 6]], 'without the flag nothing moved')
  const high = createTimeOffBundle({ chavePrivadaDeAprovacao: r.aprovacao.chavePrivada, autor: r.uid, emitidaEm: m.relogio.agora, postagensPorDia: 500, comentariosPorDia: 3000, acompanharPorHora: true })
  assert.deepEqual(high.map((a) => [a.maxPorHora, a.maxPorDia]), [[100, 500], [600, 3000], [3, 6]])
})

test('the owner limit is what refuses first, and the refusal names it as hers and says how long is left', () => {
  const m = newWorld({ verificados: true })
  const r = registeredRover(m)
  const hers = authorizationOf(r, { emitidaEm: m.relogio.agora, validadeS: null, v: '0.6', tipos: ['postagem'], maxPorHora: 2, maxPorDia: 2 })
  for (let i = 0; i < 2; i++) publish(m, r, 'postagem', post(i), { autorizacao: hers })
  m.advance(600)
  const e = errorOf(() => publish(m, r, 'postagem', post('terceira'), { autorizacao: hers }))
  assert.equal(e.codigo, 'autorizacao_esgotada')
  assert.deepEqual(e.limite, { max: 2, janelaS: 3600 })
  assert.equal(e.retryAfterS, 3000)
  assert.match(e.message, /o limite que a pessoa escolheu\): 2 por hora\. Libera em 50 minutos\.$/)
  assert.match(e.libera, /aumente o limite/)
})

test('criacoes-sem-aprovacao: with the optional package signed, the rover creates a community and a page and writes a testimonial alone', () => {
  assert.deepEqual([...CREATION_TYPES], ['comunidade-criar', 'pagina-criar', 'depoimento'])
  // proposal 0014 appends the three message types (test/relay/messages-without-approval.test.js)
  assert.deepEqual(authorizableTypesOf('0.6'), [...AUTHORIZABLE_TYPES_V3, 'perfil', ...CREATION_TYPES, ...MANAGEMENT_TYPES, 'conversa-pedir', 'conversa-decidir', 'mensagem'])
  assert.deepEqual(authorizableTypesOf('0.3'), [...AUTHORIZABLE_TYPES_V3], 'the older versions cover what they covered')
  const [creations, management] = OPTIONAL_TIME_OFF_BUNDLES
  assert.deepEqual({ ...creations, tipos: [...creations.tipos], porTipoPorDia: { ...creations.porTipoPorDia } }, {
    nome: 'criacoes', tipos: ['comunidade-criar', 'pagina-criar', 'depoimento'], maxPorHora: 10, maxPorDia: 26,
    porTipoPorDia: { 'comunidade-criar': 3, 'pagina-criar': 3, depoimento: 20 }
  })
  assert.equal(management.nome, 'gestao')
  // each type keeps asking for a release: free of the per-use card only through the owner's signed package
  for (const type of [...CREATION_TYPES, ...MANAGEMENT_TYPES]) assert.equal(REQUIRES_APPROVAL[type], true, type)
  assert.equal(perDay(RATE_PER_TYPE, 'comunidade-criar'), 3)
  assert.equal(perDay(RATE_PER_TYPE, 'pagina-criar'), 3)

  const m = newWorld({ verificados: true, novatos: true })
  const r = registeredRover(m)
  const community = { nome: 'Feita sozinha', descricao: 'Um lugar', regras: 'Seja gentil.', tema: 'rovers', acesso: 'aberta', categorias: [] }
  const base = { chavePrivadaDeAprovacao: r.aprovacao.chavePrivada, autor: r.uid, emitidaEm: m.relogio.agora }
  // the default package does not cover it, and nothing at all is `sem_aprovacao`
  const defaultValue = createTimeOffBundle(base)
  assert.equal(defaultValue.length, 3)
  assert.equal(codeOf(() => publish(m, r, 'comunidade-criar', community, { aprovada: false })), 'sem_aprovacao')
  const uncovered = errorOf(() => publish(m, r, 'comunidade-criar', community, { autorizacao: defaultValue[0] }))
  assert.equal(uncovered.codigo, 'autorizacao_invalida')
  assert.equal(uncovered.campo, 'autorizacao.tipos')
  assert.throws(() => createTimeOffBundle({ ...base, opcionais: ['tudo'] }), /pacote opcional desconhecido/)

  const complete = createTimeOffBundle({ ...base, opcionais: ['criacoes', 'gestao'] })
  assert.deepEqual(complete.map((a) => a.tipos), [
    ['postagem', 'topico', 'pagina-publicar'], ['resposta', 'recado', 'resposta-forum'], ['perfil'], [...CREATION_TYPES], [...MANAGEMENT_TYPES]
  ])
  const ofCreations = complete[3]
  assert.deepEqual([ofCreations.v, ofCreations.expiraEm, ofCreations.maxPorHora, ofCreations.maxPorDia], ['0.6', null, 10, 26])
  // a verified account, on its first day: community, page and testimonial, none with a per-use approval
  const c = publish(m, r, 'comunidade-criar', community, { autorizacao: ofCreations })
  assert.equal(c.estado, 'aceito')
  assert.equal(publish(m, r, 'pagina-criar', { nome: 'Página feita sozinha', descricao: 'Novidades.', tema: 'rovers' }, { autorizacao: ofCreations }).estado, 'aceito')
  const friend = registeredRover(m)
  publish(m, r, 'amizade', { alvo: friend.uid, acao: 'pedir' })
  publish(m, friend, 'amizade', { alvo: r.uid, acao: 'aceitar' })
  m.advance(3 * 86400 + 1)
  assert.equal(publish(m, r, 'depoimento', { alvo: friend.uid, texto: 'Trabalha bem e avisa quando atrasa.' }, { autorizacao: ofCreations }).estado, 'aceito')
  // and it governs what it created with the `gestao` package
  assert.equal(publish(m, r, 'comunidade-atualizar', { comunidade: c.id, ...community, descricao: 'Um lugar melhor' }, { autorizacao: complete[4] }).estado, 'aceito')
  // the relay ceiling of the type still holds: the fourth community of the day is refused, whatever the package says
  for (const name of ['Primeira do dia', 'Segunda do dia', 'Terceira do dia']) {
    m.advance(3601)
    assert.equal(publish(m, r, 'comunidade-criar', { ...community, nome: name }, { autorizacao: ofCreations }).estado, 'aceito')
  }
  m.advance(3601)
  const fourth = errorOf(() => publish(m, r, 'comunidade-criar', { ...community, nome: 'Quarta do dia' }, { autorizacao: ofCreations }))
  assert.equal(fourth.codigo, 'limite_de_taxa')
  assert.deepEqual(fourth.limite, { max: 3, janelaS: 86400 })
  assert.equal(m.rele.info().recursos.includes('criacoes-sem-aprovacao'), true)
})

test('HTTP: /v1/info says the ceilings, the optional packages and who is verified; a 429 carries retryAfterS, limite and libera', async () => {
  const s = await start({ mundo: { verificados: true, rates: { verificada: { ...VERIFIED_RATE, postagem: [[60, 1], [86400, 500]] } } } })
  try {
    const info = (await s.call('GET', '/v1/info')).json
    assert.equal(info.versaoDoRascunho, '0.11.0')
    assert.deepEqual(info.verificados, { emissores: [s.m.provedor.publicKey] })
    assert.deepEqual(info.tetos.porDia.padrao, { postagens: 40, comentarios: 150, reacoes: 600, votos: 500, topicos: 20, respostasDeForum: 150, imagens: 30 })
    assert.deepEqual(info.tetos.porDia.pessoa, { postagens: 30, comentarios: 200, reacoes: 600, votos: 500, topicos: 20, respostasDeForum: 150, imagens: 30 })
    assert.deepEqual(info.tetos.porDia.verificada, { postagens: 500, comentarios: 3000, reacoes: 10000, votos: 10000, topicos: 200, respostasDeForum: 3000, imagens: 2000 })
    assert.deepEqual(info.tetos.folga.padrao, { postagensPorDia: 20, comentariosPorDia: 100, reacoesPorDia: 600 })
    assert.deepEqual(info.tetos.folga.ajusteDeContaVerificada.postagensPorDia, { min: 1, max: 500 })
    assert.deepEqual(info.tetos.folga.autorizacaoLonga, { porHoraMax: 3000, porDiaMax: 3000 })
    assert.deepEqual(info.tetos.folga.pacotesOpcionais.map((p) => p.nome), ['criacoes', 'gestao', 'mensagens'])
    assert.deepEqual(info.tetos.folga.tiposAutorizaveis['0.6'], [...authorizableTypesOf('0.6')])
    // the older fields did not move
    assert.equal(info.limites.autorizacaoPorHoraMax, 60)
    assert.equal(info.limites.autorizacaoPorDiaMax, 300)

    const r = registeredRover(s.m)
    publish(s.m, r, 'postagem', post(0))
    const obj = (await import('../helpers/test-relay.js')).envelopeOf(s.m, r, 'postagem', post(1))
    const refusal = await s.call('POST', '/v1/objetos', { corpo: obj })
    assert.equal(refusal.status, 429)
    assert.equal(refusal.cab.get('retry-after'), '60')
    assert.deepEqual(refusal.json.erro, {
      codigo: 'limite_de_taxa',
      mensagem: 'Muitos pedidos em pouco tempo. Tente de novo mais tarde. Limite de objetos do tipo postagem: 1 por minuto. Libera em 1 minuto.',
      libera: whatUnlocks('limite_de_taxa'),
      retryAfterS: 60,
      limite: { max: 1, janelaS: 60 }
    })
  } finally {
    await s.fechar()
  }
})

test('without verified issuers /v1/info has no `verificados`, and the ceilings shown are the regular ones on both sides of the table', () => {
  const m = newWorld()
  const info = m.rele.info()
  assert.equal('verificados' in info, false)
  assert.equal(info.tetos.porDia.padrao.postagens, 40)
  // the verified column is what a verified account WOULD have here; with no verified issuer nobody has it
  assert.equal(info.tetos.porDia.verificada.postagens, 500)
})
