// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  DOMINIOS, assinar, dominioDe, chaveDeOrdemPequena, chavePrivadaDeSemente, chavePublicaDe, gerarParDeChaves, importarPublica, paraB64u, verificarAssinatura
} from '../../packages/protocolo/src/index.js'

const msg = Buffer.from('mensagem de teste')

test('par de chaves: pública tem 43 caracteres e assinatura 86', () => {
  const par = gerarParDeChaves()
  assert.match(par.chavePublica, /^[A-Za-z0-9_-]{43}$/)
  const sig = assinar(DOMINIOS.objeto, msg, par.chavePrivada)
  assert.match(sig, /^[A-Za-z0-9_-]{86}$/)
  assert.equal(verificarAssinatura(DOMINIOS.objeto, msg, sig, par.chavePublica), true)
})

test('assinatura não vale com outra mensagem, outra chave ou outro domínio', () => {
  const a = gerarParDeChaves()
  const b = gerarParDeChaves()
  const sig = assinar(DOMINIOS.objeto, msg, a.chavePrivada)
  assert.equal(verificarAssinatura(DOMINIOS.objeto, Buffer.from('outra'), sig, a.chavePublica), false)
  assert.equal(verificarAssinatura(DOMINIOS.objeto, msg, sig, b.chavePublica), false)
  assert.equal(verificarAssinatura(DOMINIOS.aprovacao, msg, sig, a.chavePublica), false)
  assert.equal(verificarAssinatura(DOMINIOS.atestadoHandle, msg, sig, a.chavePublica), false)
})

test('os sete domínios são diferentes entre si, todos da versão corrente e com o prefixo do protocolo', () => {
  const todos = Object.values(DOMINIOS)
  assert.equal(new Set(todos).size, 7)
  assert.deepEqual(Object.keys(DOMINIOS).sort(), ['aprovacao', 'atestadoHandle', 'autorizacao', 'leitura', 'objeto', 'politica', 'revogacao'])
  for (const d of todos) assert.match(d, /^rover-network\/0\.2\/[a-z-]+\n$/)
})

test('dominioDe monta o prefixo pela versão e pelo uso', () => {
  assert.equal(dominioDe('0.1', 'objeto'), 'rover-network/0.1/objeto\n')
  assert.equal(dominioDe('0.2', 'leitura'), 'rover-network/0.2/leitura\n')
  assert.equal(DOMINIOS.objeto, dominioDe('0.2', 'objeto'))
})

test('entradas malformadas dão false, nunca exceção', () => {
  const a = gerarParDeChaves()
  const sig = assinar(DOMINIOS.objeto, msg, a.chavePrivada)
  for (const ruim of [undefined, null, 5, '', 'curta', sig.slice(1), `${sig}A`, `${sig.slice(0, 85)}=`, sig.replace(/^./, '!')]) {
    assert.equal(verificarAssinatura(DOMINIOS.objeto, msg, ruim, a.chavePublica), false)
  }
  for (const ruim of [undefined, null, 5, '', 'curta', `${a.chavePublica}A`, a.chavePublica.slice(1)]) {
    assert.equal(verificarAssinatura(DOMINIOS.objeto, msg, sig, ruim), false)
  }
})

test('assinatura com bit de S adulterado não passa', () => {
  const a = gerarParDeChaves()
  const sig = Buffer.from(assinar(DOMINIOS.objeto, msg, a.chavePrivada), 'base64url')
  sig[40] ^= 1
  assert.equal(verificarAssinatura(DOMINIOS.objeto, msg, paraB64u(sig), a.chavePublica), false)
})

test('importarPublica: só 32 bytes em base64url', () => {
  const a = gerarParDeChaves()
  assert.ok(importarPublica(a.chavePublica))
  assert.equal(importarPublica(a.chavePublica), importarPublica(a.chavePublica)) // cache devolve o mesmo objeto
  assert.equal(importarPublica('A'.repeat(42)), null)
  assert.equal(importarPublica(42), null)
})

test('chave privada de semente é determinística e coerente com a pública', () => {
  const semente = randomBytes(32)
  const p1 = chavePrivadaDeSemente(semente)
  const p2 = chavePrivadaDeSemente(Buffer.from(semente))
  assert.equal(chavePublicaDe(p1), chavePublicaDe(p2))
  const sig = assinar(DOMINIOS.objeto, msg, p1)
  assert.equal(verificarAssinatura(DOMINIOS.objeto, msg, sig, chavePublicaDe(p2)), true)
  assert.throws(() => chavePrivadaDeSemente(Buffer.alloc(31)), /32 bytes/)
  assert.throws(() => chavePrivadaDeSemente('x'.repeat(32)), /32 bytes/)
})

test('chaves de ordem pequena são pegas, chaves comuns não', () => {
  const identidade = Buffer.alloc(32); identidade[0] = 1
  const ordem2 = Buffer.alloc(32, 0xff); ordem2[0] = 0xec; ordem2[31] = 0x7f
  assert.equal(chaveDeOrdemPequena(paraB64u(identidade)), true)
  assert.equal(chaveDeOrdemPequena(paraB64u(ordem2)), true)
  assert.equal(chaveDeOrdemPequena(paraB64u(Buffer.alloc(32))), true)
  assert.equal(chaveDeOrdemPequena('lixo'), true)
  for (let i = 0; i < 25; i++) assert.equal(chaveDeOrdemPequena(gerarParDeChaves().chavePublica), false)
})

test('a assinatura da identidade forjada não passa por verificarAssinatura numa chave comum', () => {
  const forjada = paraB64u(Buffer.concat([Buffer.from([1]), Buffer.alloc(63)]))
  assert.equal(verificarAssinatura(DOMINIOS.objeto, msg, forjada, gerarParDeChaves().chavePublica), false)
})

test('cache de chaves públicas: guarda até o teto e expulsa a mais antiga', () => {
  const nova = () => paraB64u(randomBytes(32))
  for (let i = 0; i < 2000; i++) importarPublica(nova()) // esvazia o que testes anteriores deixaram
  const primeira = nova()
  const objeto = importarPublica(primeira)
  assert.ok(objeto)
  for (let i = 0; i < 1999; i++) importarPublica(nova()) // agora são 2000 no cache: a primeira ainda está lá
  assert.equal(importarPublica(primeira), objeto)
  importarPublica(nova()) // uma entrada a mais já expulsa a mais antiga
  assert.notEqual(importarPublica(primeira), objeto)
})

test('verificarAssinatura: tamanho de assinatura errado e chave que não importa dão false', () => {
  const a = gerarParDeChaves()
  const sig = Buffer.from(assinar(DOMINIOS.objeto, msg, a.chavePrivada), 'base64url')
  assert.equal(verificarAssinatura(DOMINIOS.objeto, msg, paraB64u(sig.subarray(0, 63)), a.chavePublica), false)
  assert.equal(verificarAssinatura(DOMINIOS.objeto, msg, paraB64u(Buffer.concat([sig, Buffer.from([0])])), a.chavePublica), false)
  assert.equal(verificarAssinatura(DOMINIOS.objeto, msg, paraB64u(sig), 'A'.repeat(43)), false)
})
