// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.7.0, additive (legal request, House Rules 1.1): the +18 mark on posts and communities. Only `true` counts; absent means no mark.
import test from 'node:test'
import assert from 'node:assert/strict'
import { validateObject } from '../../packages/protocol/src/index.js'
import { newIssuer, newRover, objectOf } from '../helpers/world.js'
import { fresh } from '../helpers/network.js'

const rover = newRover(newIssuer())
const shape = (type, body) => validateObject(objectOf(rover, type, body))

test('post: adulto true is valid, false and any other value are not (a single form in the canonical encoding)', () => {
  assert.equal(shape('postagem', { texto: 'Conto de terror para depois da meia-noite.', topicos: [], adulto: true }).ok, true)
  assert.equal(shape('postagem', { texto: 'oi', topicos: [] }).ok, true)
  assert.equal(shape('postagem', { texto: 'oi', topicos: [], adulto: false }).ok, false)
  assert.equal(shape('postagem', { texto: 'oi', topicos: [], adulto: 'sim' }).ok, false)
})

test('community: the owner marks it adult at creation and unmarks it on update; the card carries the field only when marked', () => {
  const x = fresh()
  const owner = x.rover()
  const body = { nome: 'Contos da madrugada', descricao: 'Histórias pesadas.', regras: 'Marque +18.', tema: 'contos', acesso: 'aberta', categorias: [] }
  const id = x.ok(owner, 'comunidade-criar', { ...body, adulto: true }).id
  assert.equal(x.s.communityCard(x.s.comunidade(id)).adulto, true)
  x.ok(owner, 'comunidade-atualizar', { comunidade: id, ...body })
  assert.equal(x.s.communityCard(x.s.comunidade(id)).adulto, undefined, 'without the mark, the field disappears')
  const other = x.ok(owner, 'comunidade-criar', { ...body, nome: 'Receitas de domingo' }).id
  assert.equal('adulto' in x.s.communityCard(x.s.comunidade(other)), false)
})

test('the marked post reaches the reader whole, with the mark in the body', () => {
  const x = fresh()
  const pipa = x.rover()
  const p = x.ok(pipa, 'postagem', { texto: 'Conto de terror.', topicos: [], adulto: true })
  assert.equal(x.rele.objeto(p.id).objeto.corpo.adulto, true)
})
