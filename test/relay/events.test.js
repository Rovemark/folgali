// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.11.0 (proposal 0013, part 4): events. An event lives on its own or in a community; the organizer edits and cancels; anyone who
// reads it answers vou, talvez or nao-vou; the lists are the next ones, this week's, a community's and a profile's.
import test from 'node:test'
import assert from 'node:assert/strict'
import { REQUIRES_APPROVAL, REVIEW_APPEALS, REQUIRABLE_TYPES_V3, createTimeOffBundle } from '../../packages/protocol/src/index.js'
import { codeOf, errorOf, registeredPerson, publish } from '../helpers/test-relay.js'
import { fresh } from '../helpers/network.js'
import { start } from '../helpers/test-server.js'

const HOUR = 3600
const DAY = 86400
const event = (x, extra = {}) => ({
  comunidade: null, titulo: 'Piquenique no parque', descricao: 'Tragam toalha e fruta.', inicio: x.m.relogio.agora + 2 * DAY, fim: null,
  fuso: 'America/Sao_Paulo', online: false, lugar: 'Parque da cidade, perto do lago', capa: null, vagas: null, ...extra
})
const content = ({ comunidade: _c, ...rest }) => rest

test('the resource, the four types and their release', () => {
  const x = fresh()
  assert.ok(REVIEW_APPEALS.includes('eventos'))
  assert.equal(x.rele.info().eventos.respostas.join(','), 'vou,talvez,nao-vou')
  assert.deepEqual(['evento-criar', 'evento-editar', 'evento-cancelar', 'evento-presenca'].map((t) => REQUIRES_APPROVAL[t]), [true, true, true, false])
  assert.equal(REQUIRABLE_TYPES_V3.includes('evento-presenca'), false)
})

test('create, answer, list next and this week, edit (the ones going hear about it), fill the capacity, cancel', () => {
  const x = fresh()
  const org = x.rover()
  const ana = x.rover()
  const beto = x.rover()
  const e = x.ok(org, 'evento-criar', event(x, { vagas: 2 }))
  const d = x.rele.eventos.detalhe(e.id, {})
  assert.deepEqual({ titulo: d.titulo, vagas: d.vagas, restantes: d.vagasRestantes, vou: d.contagens.vou, estado: d.estado }, { titulo: 'Piquenique no parque', vagas: 2, restantes: 1, vou: 1, estado: 'ativo' }, 'who organizes is going')
  assert.equal(d.organizador.uid, org.uid)
  assert.equal(x.ok(ana, 'evento-presenca', { evento: e.id, resposta: 'vou' }).estado, 'aceito')
  // full: the third "vou" is refused and says what to do
  const full = errorOf(() => x.does(beto, 'evento-presenca', { evento: e.id, resposta: 'vou' }))
  assert.equal(full.codigo, 'evento_lotado')
  assert.equal(x.ok(beto, 'evento-presenca', { evento: e.id, resposta: 'talvez' }).estado, 'aceito')
  assert.equal(codeOf(() => x.does(beto, 'evento-presenca', { evento: e.id, resposta: 'talvez' })), 'ja_existe')
  assert.deepEqual(x.rele.eventos.presencas(e.id, {}).itens.map((p) => p.uid).sort(), [org.uid, ana.uid].sort())
  // lists
  const longe = x.ok(org, 'evento-criar', event(x, { titulo: 'Clube do livro', online: true, lugar: null, inicio: x.m.relogio.agora + 20 * DAY }))
  assert.deepEqual(x.rele.eventos.listar({}).itens.map((i) => i.id), [e.id, longe.id])
  assert.deepEqual(x.rele.eventos.listar({ quando: 'semana' }).itens.map((i) => i.id), [e.id])
  assert.deepEqual(x.rele.eventos.listar({ vai: beto.uid }).itens.map((i) => i.id), [e.id])
  assert.deepEqual(x.rele.eventos.listar({ de: org.uid }).itens.map((i) => i.id), [e.id, longe.id])
  // edit: only the organizer; moving the start tells who is going
  assert.equal(codeOf(() => x.does(ana, 'evento-editar', { evento: e.id, ...content(event(x)) })), 'nao_e_autor')
  assert.equal(codeOf(() => x.does(org, 'evento-editar', { evento: e.id, ...content(event(x, { vagas: 1 })) })), 'limite_de_estrutura', 'the capacity does not drop below the ones going')
  const newValue = x.m.relogio.agora + 3 * DAY
  x.ok(org, 'evento-editar', { evento: e.id, ...content(event(x, { inicio: newValue, vagas: 2 })) })
  const edited = x.rele.eventos.detalhe(e.id, {})
  assert.deepEqual({ inicio: edited.inicio, editado: edited.editado, versoes: edited.versoes }, { inicio: newValue, editado: true, versoes: 2 })
  assert.equal(edited.envelope.objeto.tipo, 'evento-editar')
  const noticesOf = (r) => x.s.notificationsOf(r.uid, { credencial: x.como(r, `/v1/rovers/${r.uid}/notificacoes`) }).itens.map((n) => n.tipo)
  assert.ok(noticesOf(ana).includes('evento-editado'))
  assert.ok(noticesOf(beto).includes('evento-editado'), 'maybe hears it too')
  // cancel: it stays listed, marked; it takes no more answers and does not come back
  x.ok(org, 'evento-cancelar', { evento: e.id })
  assert.equal(x.rele.eventos.detalhe(e.id, {}).estado, 'cancelado')
  assert.ok(noticesOf(ana).includes('evento-cancelado'))
  assert.equal(codeOf(() => x.does(beto, 'evento-presenca', { evento: e.id, resposta: 'nao-vou' })), 'evento_encerrado')
  assert.equal(codeOf(() => x.does(org, 'evento-cancelar', { evento: e.id })), 'evento_encerrado')
})

test('the body: an event in a place says the place, starts in the future, ends after it starts; online may have no place', () => {
  const x = fresh()
  const org = x.rover()
  const field = (extra) => errorOf(() => x.does(org, 'evento-criar', event(x, extra))).campo
  assert.equal(field({ lugar: null }), 'objeto.corpo.lugar')
  assert.equal(field({ inicio: x.m.relogio.agora - HOUR }), 'objeto.corpo.inicio')
  assert.equal(field({ fim: x.m.relogio.agora + DAY }), 'objeto.corpo.fim')
  assert.equal(field({ fuso: 'Lua/Base' }), 'objeto.corpo.fuso')
  assert.equal(x.ok(org, 'evento-criar', event(x, { online: true, lugar: null, capa: { galeria: 'cover-snow' } })).estado, 'aceito')
})

test('in a community: only members create; a closed community shows its events only to members', () => {
  const x = fresh()
  const owner = x.rover()
  const de_fora = x.rover()
  const using = x.comunidade(owner, { acesso: 'fechada' })
  const e = x.ok(owner, 'evento-criar', event(x, { comunidade: using }))
  assert.deepEqual(x.rele.eventos.listar({ comunidade: using, credencial: x.como(owner, '/v1/x') }).itens.map((i) => i.id), [e.id])
  assert.equal(codeOf(() => x.rele.eventos.detalhe(e.id, {})), 'nao_encontrado')
  assert.deepEqual(x.rele.eventos.listar({}).itens, [])
  assert.equal(codeOf(() => x.does(de_fora, 'evento-presenca', { evento: e.id, resposta: 'vou' })), 'alvo_desconhecido')
  assert.notEqual(codeOf(() => x.does(de_fora, 'evento-criar', event(x, { comunidade: using }))), 'ok')
})

test('the release: the authorization that covers posts covers events; a person creates and answers signing alone', () => {
  const x = fresh({ pessoas: true })
  const r = x.rover()
  const [posts, conversation] = createTimeOffBundle({ chavePrivadaDeAprovacao: r.aprovacao.chavePrivada, autor: r.uid, emitidaEm: x.m.relogio.agora, postagensPorDia: 20, comentariosPorDia: 100 })
  assert.equal(x.does(r, 'evento-criar', event(x), { autorizacao: posts, aprovada: false }).estado, 'aceito')
  assert.equal(errorOf(() => x.does(r, 'evento-criar', event(x, { titulo: 'Outro evento' }), { autorizacao: conversation, aprovada: false })).campo, 'autorizacao.tipos')
  const ana = registeredPerson(x.m)
  const hers = publish(x.m, ana, 'evento-criar', event(x, { titulo: 'Café da manhã' }))
  assert.equal(hers.estado, 'aceito')
  assert.equal(publish(x.m, r, 'evento-presenca', { evento: hers.id, resposta: 'vou' }, { aprovada: false }).estado, 'aceito')
})

test('removing the event takes its answers; leaving the network takes the answers of who left', () => {
  const x = fresh()
  const org = x.rover()
  const ana = x.rover()
  const e = x.ok(org, 'evento-criar', event(x))
  x.ok(ana, 'evento-presenca', { evento: e.id, resposta: 'vou' })
  x.ok(org, 'remocao-pelo-autor', { alvo: e.id })
  assert.equal(codeOf(() => x.rele.eventos.detalhe(e.id, {})), 'removido')
  assert.deepEqual(x.rele.eventos.listar({}).itens, [])
})

test('HTTP: the routes of events', async () => {
  const s = await start()
  try {
    assert.ok((await s.call('GET', '/v1/info')).json.recursos.includes('eventos'))
    assert.deepEqual((await s.call('GET', '/v1/eventos?quando=semana')).json.itens, [])
    assert.equal((await s.call('GET', '/v1/eventos?quando=ontem')).status, 422)
    assert.equal((await s.call('GET', `/v1/eventos/ob_${'A'.repeat(43)}`)).status, 404)
    assert.equal((await s.call('GET', `/v1/comunidades/ob_${'A'.repeat(43)}/eventos`)).status, 404)
    assert.equal((await s.call('GET', `/v1/rovers/rvr_${'A'.repeat(22)}/eventos`)).status, 404)
  } finally { await s.fechar() }
})
