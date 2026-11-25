// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LIMITES, criarCredencialDeLeitura, credencialDeLeituraConfere, gerarParDeChaves, lerCredencialDeLeitura
} from '../../packages/protocolo/src/index.js'
import { AGORA, novoUid } from '../ajuda/mundo.js'

const rede = gerarParDeChaves()
const uid = novoUid()
const alvo = `/v1/linha/inicio?rover=${uid}&limite=5`
const credencial = (extra = {}) => criarCredencialDeLeitura({ chavePrivada: rede.chavePrivada, uid, alvo, t: AGORA, ...extra })
const confere = (cab, extra = {}) =>
  credencialDeLeituraConfere(lerCredencialDeLeitura(cab), { metodo: 'GET', alvo, chave: rede.chavePublica, agora: AGORA, ...extra })

test('credencial de leitura: vai e volta, e confere com a chave de REDE do rover', () => {
  const cab = credencial()
  assert.match(cab, /^Rover-Assinatura uid=rvr_[A-Za-z0-9_-]{22}, t=\d{10}, a=[A-Za-z0-9_-]{86}$/)
  const c = lerCredencialDeLeitura(cab)
  assert.equal(c.uid, uid)
  assert.equal(c.t, AGORA)
  assert.equal(typeof c.t, 'number')
  assert.match(c.assinatura, /^[A-Za-z0-9_-]{86}$/)
  assert.equal(confere(cab), true)
})

test('a credencial só vale para o pedido exato: outro caminho, outra consulta, outro método, outro rover, outra chave', () => {
  const cab = credencial()
  assert.equal(confere(cab, { alvo: `/v1/linha/inicio?rover=${uid}&limite=6` }), false)
  assert.equal(confere(cab, { alvo: `/v1/rovers/${uid}/seguindo` }), false)
  assert.equal(confere(cab, { metodo: 'POST' }), false)
  assert.equal(confere(cab, { chave: gerarParDeChaves().chavePublica }), false)
  const outro = novoUid()
  assert.equal(confere(cab.replace(uid, outro)), false)
  assert.equal(confere(cab.replace(`t=${AGORA}`, `t=${AGORA + 1}`)), false)
  assert.equal(confere(credencial({ metodo: 'POST' })), false)
})

test('janela de tempo: 120 segundos para os dois lados, e nem um a mais', () => {
  assert.equal(LIMITES.leituraToleranciaS, 120)
  assert.equal(confere(credencial({ t: AGORA - 120 })), true)
  assert.equal(confere(credencial({ t: AGORA - 121 })), false)
  assert.equal(confere(credencial({ t: AGORA + 120 })), true)
  assert.equal(confere(credencial({ t: AGORA + 121 })), false)
})

test('cabeçalho malformado é lido como nada, nunca como exceção', () => {
  const bom = credencial()
  const ruins = [
    undefined, null, 42, {}, [], '', 'Rover-Assinatura', bom.toLowerCase(), `${bom} `, ` ${bom}`, `${bom}x`, `${bom}\n`,
    bom.replace('Rover-Assinatura', 'Bearer'), bom.replace('uid=rvr_', 'uid=xxx_'), bom.replace(', t=', ',t='),
    bom.replace(`t=${AGORA}`, `t=${String(AGORA).slice(1)}`), bom.replace(`t=${AGORA}`, `t=${AGORA}0`), bom.replace(`t=${AGORA}`, 't=-190000000'),
    bom.replace(`t=${AGORA}`, 't=1900000.00'), bom.slice(0, -1), `${bom}A`, bom.replace(/uid=rvr_[A-Za-z0-9_-]{22}/, `uid=${uid}A`)
  ]
  for (const r of ruins) assert.equal(lerCredencialDeLeitura(r), null, String(r))
})
