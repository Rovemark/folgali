// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.11.0 (proposal 0013): the bodies of the event types and their cross-field rules.
import test from 'node:test'
import assert from 'node:assert/strict'
import { COVER_IDS } from '../../packages/protocol/src/index.js'
import {
  EVENT_BODIES, EVENT_LIMITS, RSVP_ANSWERS, EVENT_TYPES, isTimezone, eventEnd, eventRules
} from '../../packages/protocol/src/events.js'

const NOW = 1_900_000_000
const ID = `ob_${'A'.repeat(43)}`
const event = (extra = {}) => ({
  comunidade: null, titulo: 'Roda de leitura', descricao: 'Cada um traz um livro.', inicio: NOW + 86400, fim: NOW + 86400 + 7200,
  fuso: 'America/Sao_Paulo', online: false, lugar: 'Biblioteca do bairro, sala 2', capa: null, vagas: null, ...extra
})
const field = (type, body) => EVENT_BODIES[type](body, 'objeto.corpo')?.caminho ?? 'ok'
const rule = (type, body, createdAt = NOW) => eventRules({ tipo: type, criadoEm: createdAt, corpo: body })?.caminho ?? 'ok'

test('the four types and the three answers', () => {
  assert.deepEqual([...EVENT_TYPES], ['evento-criar', 'evento-editar', 'evento-cancelar', 'evento-presenca'])
  assert.deepEqual([...RSVP_ANSWERS], ['vou', 'talvez', 'nao-vou'])
  assert.deepEqual(Object.keys(EVENT_BODIES), [...EVENT_TYPES])
})

test('evento-criar: closed schema, with or without community, end, cover and capacity', () => {
  assert.equal(field('evento-criar', event()), 'ok')
  assert.equal(field('evento-criar', event({ comunidade: ID, fim: null, capa: { galeria: COVER_IDS[0] }, vagas: 30, adulto: true })), 'ok')
  assert.equal(field('evento-criar', event({ online: true, lugar: null })), 'ok')
  assert.equal(field('evento-criar', event({ online: true, lugar: 'Chamada em https://meet.exemplo.com/abc-defg' })), 'ok')
  assert.equal(field('evento-criar', event({ descricao: '' })), 'ok')
  for (const [bad, where] of [
    [event({ extra: 1 }), 'objeto.corpo.extra'],
    [(({ fuso: _f, ...r }) => r)(event()), 'objeto.corpo.fuso'],
    [event({ titulo: 'ab' }), 'objeto.corpo.titulo'],
    [event({ titulo: 'duas\nlinhas aqui' }), 'objeto.corpo.titulo'],
    [event({ descricao: 'x'.repeat(10) + ' <b>' }), 'objeto.corpo.descricao'],
    [event({ inicio: '2030-01-01' }), 'objeto.corpo.inicio'],
    [event({ inicio: NOW + 0.5 }), 'objeto.corpo.inicio'],
    [event({ fuso: 'Marte/Olympus' }), 'objeto.corpo.fuso'],
    [event({ fuso: 'GMT-3 de Brasília' }), 'objeto.corpo.fuso'],
    [event({ online: 'sim' }), 'objeto.corpo.online'],
    [event({ lugar: 'x' }), 'objeto.corpo.lugar'],
    [event({ lugar: 'Dois links https://a.exemplo.com e https://b.exemplo.com' }), 'objeto.corpo.lugar'],
    [event({ lugar: 'Rua tal, 10, 01310-200' }), 'objeto.corpo.lugar'],
    [event({ capa: { galeria: 'nao-existe' } }), 'objeto.corpo.capa.galeria'],
    [event({ capa: { midia: ID } }), 'objeto.corpo.capa.midia'],
    [event({ vagas: 0 }), 'objeto.corpo.vagas'],
    [event({ vagas: EVENT_LIMITS.vagas.max + 1 }), 'objeto.corpo.vagas'],
    [event({ comunidade: 'rvr_x' }), 'objeto.corpo.comunidade'],
    [event({ adulto: false }), 'objeto.corpo.adulto']
  ]) assert.equal(field('evento-criar', bad), where, where)
})

test('evento-editar carries the whole content and never the community; cancel and answer are one field each', () => {
  const { comunidade: _c, ...content } = event()
  assert.equal(field('evento-editar', { evento: ID, ...content }), 'ok')
  assert.equal(field('evento-editar', { evento: ID, ...event() }), 'objeto.corpo.comunidade')
  assert.equal(field('evento-editar', content), 'objeto.corpo.evento')
  assert.equal(field('evento-cancelar', { evento: ID }), 'ok')
  assert.equal(field('evento-cancelar', { evento: ID, motivo: 'chuva' }), 'objeto.corpo.motivo')
  for (const reply of RSVP_ANSWERS) assert.equal(field('evento-presenca', { evento: ID, resposta: reply }), 'ok')
  assert.equal(field('evento-presenca', { evento: ID, resposta: 'quem sabe' }), 'objeto.corpo.resposta')
})

test('the rules between fields: end after start, 30 days at most, a place when not online, the future and not too far', () => {
  assert.equal(rule('evento-criar', event()), 'ok')
  assert.equal(rule('evento-criar', event({ fim: null })), 'ok')
  assert.equal(rule('evento-criar', event({ fim: NOW + 86400 })), 'objeto.corpo.fim', 'end equal to start')
  assert.equal(rule('evento-criar', event({ fim: NOW })), 'objeto.corpo.fim')
  assert.equal(rule('evento-criar', event({ fim: NOW + 86400 + EVENT_LIMITS.duracaoMaxS })), 'ok')
  assert.equal(rule('evento-criar', event({ fim: NOW + 86400 + EVENT_LIMITS.duracaoMaxS + 1 })), 'objeto.corpo.fim')
  assert.equal(rule('evento-criar', event({ lugar: null })), 'objeto.corpo.lugar')
  assert.equal(rule('evento-criar', event({ online: true, lugar: null })), 'ok')
  assert.equal(rule('evento-criar', event({ inicio: NOW, fim: null })), 'ok')
  assert.equal(rule('evento-criar', event({ inicio: NOW - 1, fim: null })), 'objeto.corpo.inicio')
  assert.equal(rule('evento-criar', event({ inicio: NOW + EVENT_LIMITS.antecedenciaMaxS, fim: null })), 'ok')
  assert.equal(rule('evento-criar', event({ inicio: NOW + EVENT_LIMITS.antecedenciaMaxS + 1, fim: null })), 'objeto.corpo.inicio')
  // an edit may keep a start that already passed (the relay compares with the event as it was)
  const { comunidade: _c, ...content } = event({ inicio: NOW - 3600, fim: NOW + 3600 })
  assert.equal(rule('evento-editar', { evento: ID, ...content }), 'ok')
  assert.equal(rule('evento-presenca', { evento: ID, resposta: 'vou' }), 'ok')
})

test('time zones are real IANA names, and an event without an end is over 6 hours after it starts', () => {
  for (const good of ['UTC', 'America/Sao_Paulo', 'Europe/Lisbon', 'Asia/Tokyo', 'America/Argentina/Buenos_Aires']) assert.equal(isTimezone(good), true, good)
  for (const bad of ['', 'Brasília', 'America/', '../../etc/passwd', 'America/Sao Paulo', 'X'.repeat(80), null, 3]) assert.equal(isTimezone(bad), false, String(bad))
  assert.equal(eventEnd({ inicio: 100, fim: 500 }), 500)
  assert.equal(eventEnd({ inicio: 100, fim: null }), 100 + 6 * 3600)
})
