// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.3.2 (proposal 0007): vocabulary of labels and statuses per community, and the topic marks. Who can, what the state requires,
// what the read shows, what disappears along, and the trace a refusal does not leave.
import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_STATUS } from '../../packages/protocol/src/index.js'
import { DAY, codeOf, fresh } from '../helpers/network.js'

const tag = (key, label = `E ${key}`, color = 'azul') => ({ chave: key, rotulo: label, cor: color })
const sts = (key, label = `S ${key}`, color = 'verde', categories = null) => ({ chave: key, rotulo: label, cor: color, categorias: categories })

function forum() {
  const x = fresh()
  const owner = x.rover()
  const mod = x.rover()
  const [ana, beto, caio] = [x.rover(), x.rover(), x.rover()]
  const c = x.comunidade(owner, { categorias: ['Geral', 'Dúvidas'] })
  for (const r of [mod, ana, beto]) { x.entra(r, c, { wait: false }); x.advance(1) }
  x.gestao(owner, c, mod, 'promover')
  x.advance(3601)
  const define = (who, labels, status, using = c) => x.ok(who, 'comunidade-vocabulario', { comunidade: using, etiquetas: labels, status })
  const brand = (who, topic, labels, status) => x.ok(who, 'topico-marca', { topico: topic, etiquetas: labels, status })
  const card = (t, using = c) => [...x.s.topicsOf(using, { limite: 50 }).itens, ...(x.s.topicsOf(using, { limite: 50 }).fixados ?? [])].find((i) => i.id === t)
  return Object.assign(x, { dono: owner, mod, ana, beto, caio, c, define, marca: brand, cartao: card })
}

test('a community that never defined anything uses the three protocol statuses and no label', () => {
  const x = forum()
  const v = x.s.communityDetail(x.c, {}).vocabulario
  assert.equal(v.padrao, true)
  assert.deepEqual(v.etiquetas, [])
  assert.deepEqual(v.status.map((s) => s.chave), DEFAULT_STATUS.map((s) => s.chave))
  assert.deepEqual(v.status.map((s) => s.chave), ['aberto', 'em-andamento', 'fechado'])
})

test('the owner and the moderator define the vocabulary, and the second definition replaces the first', () => {
  const x = forum()
  x.define(x.dono, [tag('bug')], [sts('novo')])
  let v = x.s.communityDetail(x.c, {}).vocabulario
  assert.equal(v.padrao, false, 'status defined: the default no longer applies')
  assert.deepEqual(v.etiquetas.map((e) => e.chave), ['bug'])
  assert.deepEqual(v.status.map((s) => s.chave), ['novo'])
  x.define(x.mod, [tag('duvida'), tag('ideia')], [])
  v = x.s.communityDetail(x.c, {}).vocabulario
  assert.deepEqual(v.etiquetas.map((e) => e.chave), ['duvida', 'ideia'], 'replaces, does not add')
  assert.equal(v.padrao, true, 'with no status defined, the protocol default returns')
  assert.equal(v.status.length, 3)
  x.define(x.dono, [], [])
  assert.deepEqual(x.s.communityDetail(x.c, {}).vocabulario.etiquetas, [], 'an empty vocabulary clears everything')
})

test('who can define: only owner and moderator; member, outsider, banned and closed community follow the usual rules', () => {
  const x = forum()
  const body = { comunidade: x.c, etiquetas: [tag('bug')], status: [] }
  assert.equal(x.code(x.ana, 'comunidade-vocabulario', body), 'sem_permissao', 'a regular member cannot define')
  assert.equal(x.code(x.caio, 'comunidade-vocabulario', body), 'nao_e_membro', 'someone who did not join')
  x.gestao(x.mod, x.c, x.beto, 'banir', 'spam')
  assert.equal(x.code(x.beto, 'comunidade-vocabulario', body), 'banido')
  const closed = x.comunidade(x.dono, { acesso: 'fechada' })
  assert.equal(x.code(x.caio, 'comunidade-vocabulario', { ...body, comunidade: closed }), 'nao_encontrado', 'a closed community does not exist for an outsider')
  assert.equal(x.code(x.dono, 'comunidade-vocabulario', { ...body, comunidade: `ob_${'Z'.repeat(43)}` }), 'nao_encontrado')
  assert.deepEqual(x.s.communityDetail(x.c, {}).vocabulario.etiquetas, [], 'none of the refusals left a trace')
})

test('closed community: an outsider sees nothing, and an invited person sees only the minimal card, without the vocabulary', () => {
  const x = forum()
  const closed = x.comunidade(x.dono, { acesso: 'fechada' })
  x.define(x.dono, [tag('segredo')], [], closed)
  assert.equal(codeOf(() => x.s.communityDetail(closed, { credencial: x.como(x.caio) })), 'nao_encontrado', 'outsider: the community does not exist')
  x.gestao(x.dono, closed, x.caio, 'convidar')
  const guest = x.s.communityDetail(closed, { credencial: x.como(x.caio) })
  assert.equal(guest.vocabulario, undefined, 'the minimal card carries no vocabulary')
  assert.equal(JSON.stringify(guest).includes('segredo'), false)
  x.ok(x.caio, 'comunidade-adesao', { comunidade: closed, acao: 'aceitar-convite' })
  assert.deepEqual(x.s.communityDetail(closed, { credencial: x.como(x.caio) }).vocabulario.etiquetas.map((e) => e.chave), ['segredo'], 'a member sees it')
})

test('status per category: the category must exist in the community, and the status only applies to its topics', () => {
  const x = forum()
  assert.equal(x.code(x.dono, 'comunidade-vocabulario', { comunidade: x.c, etiquetas: [], status: [sts('s1', 'Aberto', 'verde', ['Inexistente'])] }), 'esquema')
  x.define(x.dono, [], [sts('geral', 'Aberto geral'), sts('so-duvidas', 'Respondida', 'ambar', ['Dúvidas'])])
  const tGeneral = x.topico(x.ana, x.c, { categoria: 'Geral' })
  const tDoubt = x.topico(x.ana, x.c, { categoria: 'Dúvidas' })
  assert.equal(x.code(x.ana, 'topico-marca', { topico: tGeneral, etiquetas: [], status: 'so-duvidas' }), 'esquema', 'status from another category')
  x.marca(x.ana, tGeneral, [], 'geral')
  x.marca(x.ana, tDoubt, [], 'so-duvidas')
  assert.equal(x.cartao(tDoubt).marcas.status, 'so-duvidas')
  const without = x.topico(x.ana, x.c, { categoria: null })
  assert.equal(x.code(x.ana, 'topico-marca', { topico: without, etiquetas: [], status: 'so-duvidas' }), 'esquema', 'a topic without a category does not get a category status')
  x.marca(x.ana, without, [], 'geral')
})

test('marking: the author on their own topic, the moderator on any, and nobody else', () => {
  const x = forum()
  x.define(x.dono, [tag('bug'), tag('ideia')], [sts('aberto')])
  const t = x.topico(x.ana, x.c)
  assert.equal(x.code(x.beto, 'topico-marca', { topico: t, etiquetas: ['bug'], status: null }), 'sem_permissao', 'another member cannot mark someone else topic')
  assert.equal(x.code(x.caio, 'topico-marca', { topico: t, etiquetas: ['bug'], status: null }), 'nao_e_membro')
  x.marca(x.ana, t, ['bug'], 'aberto')
  assert.deepEqual(x.cartao(t).marcas, { etiquetas: ['bug'], status: 'aberto' })
  x.marca(x.mod, t, ['bug', 'ideia'], null)
  assert.deepEqual(x.cartao(t).marcas, { etiquetas: ['bug', 'ideia'], status: null }, 'the moderator marks another person topic')
  x.marca(x.dono, t, [], 'aberto')
  assert.deepEqual(x.cartao(t).marcas, { etiquetas: [], status: 'aberto' })
})

test('locked topic: the author can no longer mark, the moderator can', () => {
  const x = forum()
  x.define(x.dono, [tag('bug')], [])
  const t = x.topico(x.ana, x.c)
  x.ok(x.mod, 'topico-gestao', { topico: t, acao: 'trancar', comunidade: null, categoria: null })
  assert.equal(x.code(x.ana, 'topico-marca', { topico: t, etiquetas: ['bug'], status: null }), 'trancado')
  x.marca(x.mod, t, ['bug'], null)
  assert.deepEqual(x.cartao(t).marcas.etiquetas, ['bug'])
})

test('a key outside the vocabulary is refused, and marking with what is already the same is ja_existe; the refusal does not change the topic', () => {
  const x = forum()
  x.define(x.dono, [tag('bug')], [sts('aberto')])
  const t = x.topico(x.ana, x.c)
  x.marca(x.ana, t, ['bug'], 'aberto')
  assert.equal(x.code(x.ana, 'topico-marca', { topico: t, etiquetas: ['nao-existe'], status: 'aberto' }), 'esquema')
  assert.equal(x.code(x.ana, 'topico-marca', { topico: t, etiquetas: ['bug'], status: 'nao-existe' }), 'esquema')
  assert.equal(x.code(x.ana, 'topico-marca', { topico: t, etiquetas: ['bug'], status: 'aberto' }), 'ja_existe')
  assert.deepEqual(x.cartao(t).marcas, { etiquetas: ['bug'], status: 'aberto' }, 'nothing changed')
  // With no vocabulary defined, only the default status exists.
  const y = forum()
  const u = y.topico(y.ana, y.c)
  assert.equal(y.code(y.ana, 'topico-marca', { topico: u, etiquetas: ['bug'], status: null }), 'esquema', 'label without a vocabulary')
  y.marca(y.ana, u, [], 'em-andamento')
  assert.equal(y.cartao(u).marcas.status, 'em-andamento', 'the protocol default status applies without a definition')
})

test('the card of a topic without marks is identical to the 0.3.1 one: not even the marcas key appears', () => {
  const x = forum()
  x.define(x.dono, [tag('bug')], [])
  const t = x.topico(x.ana, x.c)
  const before = JSON.stringify(x.cartao(t))
  assert.equal('marcas' in x.cartao(t), false)
  x.marca(x.ana, t, ['bug'], null)
  assert.equal('marcas' in x.cartao(t), true)
  x.marca(x.ana, t, [], null)
  assert.equal('marcas' in x.cartao(t), false, 'removing all marks returns the 0.3.1 card')
  assert.equal(JSON.stringify(x.cartao(t)), before, 'byte by byte')
  const detail = x.s.topicDetail(t, {})
  assert.equal('marcas' in detail, false)
})

test('replacing the vocabulary removes from the topics the keys that no longer exist', () => {
  const x = forum()
  x.define(x.dono, [tag('bug'), tag('ideia')], [sts('aberto'), sts('fechado')])
  const [t1, t2] = [x.topico(x.ana, x.c), x.topico(x.ana, x.c)]
  x.marca(x.ana, t1, ['bug', 'ideia'], 'aberto')
  x.marca(x.ana, t2, ['bug'], 'fechado')
  x.define(x.mod, [tag('ideia')], [sts('fechado')])
  assert.deepEqual(x.cartao(t1).marcas, { etiquetas: ['ideia'], status: null }, 'bug and aberto left the vocabulary')
  assert.deepEqual(x.cartao(t2).marcas, { etiquetas: [], status: 'fechado' }, 'fechado is still valid')
  x.define(x.mod, [], [])
  assert.equal('marcas' in x.cartao(t1), false)
  assert.deepEqual(x.cartao(t2).marcas, { etiquetas: [], status: 'fechado' }, 'with no status defined the protocol ones apply, and fechado is one of them')
})

test('moving the topic to another community clears the marks (the keys belonged to the vocabulary there)', () => {
  const x = forum()
  x.define(x.dono, [tag('bug')], [sts('aberto')])
  const t = x.topico(x.ana, x.c)
  x.marca(x.ana, t, ['bug'], 'aberto')
  const other = x.comunidade(x.dono)
  x.ok(x.dono, 'topico-gestao', { topico: t, acao: 'mover', comunidade: other, categoria: null })
  const moved = x.s.topicsOf(other, { limite: 50 }).itens.find((i) => i.id === t)
  assert.ok(moved, 'the topic moved')
  assert.equal('marcas' in moved, false)
})

test('status and etiqueta filters on the topic lists; an invalid key is esquema', () => {
  const x = forum()
  x.define(x.dono, [tag('bug'), tag('ideia')], [sts('aberto'), sts('fechado')])
  const [t1, t2, t3] = [x.topico(x.ana, x.c), x.topico(x.ana, x.c), x.topico(x.ana, x.c)]
  x.marca(x.ana, t1, ['bug'], 'aberto')
  x.marca(x.ana, t2, ['bug', 'ideia'], 'fechado')
  const ids = (o) => x.s.topicsOf(x.c, { limite: 50, ...o }).itens.map((i) => i.id).sort()
  assert.deepEqual(ids({ status: 'aberto' }), [t1])
  assert.deepEqual(ids({ status: 'fechado' }), [t2])
  assert.deepEqual(ids({ etiqueta: 'bug' }), [t1, t2].sort())
  assert.deepEqual(ids({ etiqueta: 'ideia' }), [t2])
  assert.deepEqual(ids({ etiqueta: 'bug', status: 'fechado' }), [t2])
  assert.deepEqual(ids({}), [t1, t2, t3].sort(), 'no filter, all of them')
  assert.deepEqual(ids({ status: 'nada' }), [])
  for (const bad of [{ status: 'Aberto' }, { status: 'a b' }, { etiqueta: '1x' }, { etiqueta: "x'; --" }]) {
    assert.equal(codeOf(() => x.s.topicsOf(x.c, bad)), 'esquema', JSON.stringify(bad))
  }
})

test('the filter also applies to pinned topics', () => {
  const x = forum()
  x.define(x.dono, [tag('bug')], [])
  const [t1, t2] = [x.topico(x.ana, x.c), x.topico(x.ana, x.c)]
  x.marca(x.ana, t1, ['bug'], null)
  for (const t of [t1, t2]) x.ok(x.mod, 'topico-gestao', { topico: t, acao: 'fixar', comunidade: null, categoria: null })
  const p = x.s.topicsOf(x.c, { etiqueta: 'bug', limite: 50 })
  assert.deepEqual(p.fixados.map((i) => i.id), [t1])
})

test('mark on a removed or hidden topic: the relay does not allow it', () => {
  const x = forum()
  x.define(x.dono, [tag('bug')], [])
  const t = x.topico(x.ana, x.c)
  x.ok(x.mod, 'remocao-por-responsavel', { alvo: t, motivo: 'spam' })
  assert.equal(x.code(x.mod, 'topico-marca', { topico: t, etiquetas: ['bug'], status: null }), 'alvo_removido')
})

test('rate: the vocabulary has a cap of 6 per hour and counts only when accepted', () => {
  const x = forum()
  for (let i = 0; i < 6; i++) { x.define(x.dono, [tag(`e${i}`)], []); x.advance(1) }
  assert.equal(x.code(x.dono, 'comunidade-vocabulario', { comunidade: x.c, etiquetas: [], status: [] }), 'limite_de_taxa')
  x.advance(3600 + 10)
  x.define(x.dono, [tag('volta')], [])
  assert.deepEqual(x.s.communityDetail(x.c, {}).vocabulario.etiquetas.map((e) => e.chave), ['volta'])
  assert.ok(DAY > 0)
})

test('a vocabulary with a single status (and no label) is kept: the default does not return', () => {
  const x = forum()
  x.define(x.dono, [], [sts('so-este')])
  const v = x.s.communityDetail(x.c, {}).vocabulario
  assert.deepEqual(v.status.map((s) => s.chave), ['so-este'])
  assert.equal(v.padrao, false)
  assert.deepEqual(v.etiquetas, [])
  const t = x.topico(x.ana, x.c)
  assert.equal(x.code(x.ana, 'topico-marca', { topico: t, etiquetas: [], status: 'aberto' }), 'esquema', 'the default status no longer applies')
  x.marca(x.ana, t, [], 'so-este')
})

test('a status that stopped existing leaves the topic even when the labels did not change', () => {
  const x = forum()
  x.define(x.dono, [tag('bug')], [sts('aberto'), sts('fechado')])
  const t = x.topico(x.ana, x.c)
  x.marca(x.ana, t, [], 'aberto')
  assert.deepEqual(x.cartao(t).marcas, { etiquetas: [], status: 'aberto' })
  x.define(x.mod, [tag('bug')], [sts('fechado')])
  assert.equal('marcas' in x.cartao(t), false, 'with no label and no valid status, the topic ends up unmarked')
  x.marca(x.ana, t, ['bug'], 'fechado')
  x.define(x.mod, [tag('bug')], [sts('outro')])
  assert.deepEqual(x.cartao(t).marcas, { etiquetas: ['bug'], status: null }, 'the labels stay; only the status that no longer applies leaves')
})
