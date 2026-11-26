// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.11.0 (proposal 0013): every refusal says what unblocks it, and a refusal by limit says how long is left.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CODES, ProtocolError, limitError, waitInWords, windowInWords, whatUnlocks
} from '../../packages/protocol/src/index.js'

test('every code has a sentence that says what unblocks it, without dashes and ending in a full stop', () => {
  assert.ok(CODES.length >= 80)
  for (const code of CODES) {
    const unlocks = whatUnlocks(code)
    assert.equal(typeof unlocks, 'string', code)
    assert.ok(unlocks.length >= 12, `${code}: too short to help`)
    assert.match(unlocks, /\.$/, code)
    assert.doesNotMatch(unlocks, /[–—]/, code)
    assert.equal(new ProtocolError(code).toJson().erro.libera, unlocks, code)
  }
  assert.equal(whatUnlocks('nao_existe'), null)
})

test('the wait in words: seconds, minutes, hours and days, always rounded up', () => {
  assert.equal(waitInWords(0), '1 segundo')
  assert.equal(waitInWords(1), '1 segundo')
  assert.equal(waitInWords(59), '59 segundos')
  assert.equal(waitInWords(60), '1 minuto')
  assert.equal(waitInWords(61), '2 minutos')
  assert.equal(waitInWords(3600), '1 hora')
  assert.equal(waitInWords(3601), '1 hora e 1 minuto')
  assert.equal(waitInWords(7801), '2 horas e 11 minutos')
  assert.equal(waitInWords(86400), '1 dia')
  assert.equal(waitInWords(90000), '1 dia e 1 hora')
  assert.equal(waitInWords(3 * 86400 + 2 * 3600), '3 dias e 2 horas')
  assert.equal(windowInWords(60), 'por minuto')
  assert.equal(windowInWords(3600), 'por hora')
  assert.equal(windowInWords(86400), 'por dia')
  assert.equal(windowInWords(100), 'a cada 100 segundos')
})

test('a refusal by limit carries the limit, the window and the wait, for a machine and for a person', () => {
  const e = limitError('limite_de_taxa', { max: 500, janelaS: 86400, retryAfterS: 7801, deQue: 'postagens' })
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.equal(e.status, 429)
  assert.equal(e.retryAfterS, 7801)
  assert.deepEqual(e.limite, { max: 500, janelaS: 86400 })
  assert.match(e.message, /Limite de postagens: 500 por dia\. Libera em 2 horas e 11 minutos\.$/)
  assert.deepEqual(e.toJson(), {
    erro: { codigo: 'limite_de_taxa', mensagem: e.message, libera: whatUnlocks('limite_de_taxa'), retryAfterS: 7801, limite: { max: 500, janelaS: 86400 } }
  })
  // the wait never reads as zero: a limit that was reached always has at least a second left
  assert.equal(limitError('limite_de_taxa', { max: 1, janelaS: 60, retryAfterS: 0, deQue: 'envios' }).retryAfterS, 1)
})

test('any refusal built with a wait says it in words; one without a wait says nothing about time', () => {
  assert.match(new ProtocolError('em_carencia', { retryAfterS: 540 }).message, /Libera em 9 minutos\.$/)
  assert.doesNotMatch(new ProtocolError('em_carencia').message, /Libera em/)
  const withoutWait = new ProtocolError('esquema', { campo: 'objeto.corpo.texto' }).toJson().erro
  assert.equal('retryAfterS' in withoutWait, false)
  assert.equal('limite' in withoutWait, false)
  assert.equal(withoutWait.campo, 'objeto.corpo.texto')
})
