// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0: o limite de registro por origem conta IPv4 por endereço e IPv6 por bloco /64 (decisão do Arquiteto de 24/11/2026).
import test from 'node:test'
import assert from 'node:assert/strict'
import { criarRegistroDeAgente, gerarParDeChaves } from '../../packages/protocolo/src/index.js'
import { chaveDeOrigem } from '../../packages/emissor-aberto/src/origem.js'
import { novoHandle } from '../ajuda/mundo.js'
import { codigoAsync, novoMundo } from '../ajuda/rele-de-teste.js'

test('IPv6: o mesmo /64 dá a mesma chave, em qualquer grafia; o /64 vizinho dá outra', () => {
  const mesma = ['2001:db8:1:2::1', '2001:db8:1:2:ffff:ffff:ffff:ffff', '2001:DB8:1:2:AAAA::', '2001:0db8:0001:0002:0:0:0:7', '[2001:db8:1:2::9]', '2001:db8:1:2::9%en0', '2001:db8:1:2::1.2.3.4']
  for (const ip of mesma) assert.equal(chaveDeOrigem(ip), '2001:db8:1:2::/64', ip)
  // bordas do bloco: o último endereço de um /64 e o primeiro do seguinte
  assert.equal(chaveDeOrigem('2001:db8:0:ffff:ffff:ffff:ffff:ffff'), '2001:db8:0:ffff::/64')
  assert.equal(chaveDeOrigem('2001:db8:1::'), '2001:db8:1:0::/64')
  assert.notEqual(chaveDeOrigem('2001:db8:1:2::1'), chaveDeOrigem('2001:db8:1:3::1'))
  assert.notEqual(chaveDeOrigem('2001:db8:1:2::1'), chaveDeOrigem('2001:db9:1:2::1'))
  // a compressão no começo, no meio e no fim
  assert.equal(chaveDeOrigem('::1'), '0:0:0:0::/64')
  assert.equal(chaveDeOrigem('::'), '0:0:0:0::/64')
  assert.equal(chaveDeOrigem('fe80::1:2:3:4'), 'fe80:0:0:0::/64')
  assert.equal(chaveDeOrigem('1:2:3:4:5:6:7:8'), '1:2:3:4::/64')
  assert.equal(chaveDeOrigem('1:2:3::'), '1:2:3:0::/64')
  assert.equal(chaveDeOrigem('1::2:3:4:5:6:7'), '1:0:2:3::/64')
})

test('IPv4 segue por endereço, também quando chega mapeado em IPv6', () => {
  assert.equal(chaveDeOrigem('203.0.113.5'), '203.0.113.5')
  assert.notEqual(chaveDeOrigem('203.0.113.5'), chaveDeOrigem('203.0.113.6'))
  assert.equal(chaveDeOrigem('::ffff:203.0.113.5'), '203.0.113.5')
  assert.equal(chaveDeOrigem('::FFFF:203.0.113.5'), '203.0.113.5')
  assert.equal(chaveDeOrigem('::ffff:cb00:7105'), '203.0.113.5', 'a mesma, em hexadecimal')
  assert.equal(chaveDeOrigem('0:0:0:0:0:ffff:203.0.113.255'), '203.0.113.255')
  // ::fffe:... não é mapeado: é IPv6
  assert.equal(chaveDeOrigem('::fffe:cb00:7105'), '0:0:0:0::/64')
})

test('o que não é endereço passa como veio', () => {
  for (const x of ['desconhecida', '', 'local', '2001:db8::zz', '999.1.1.1', 'a:b:c']) assert.equal(chaveDeOrigem(x), x)
  assert.equal(chaveDeOrigem(undefined), 'undefined')
})

const registrar = (m, origem) => {
  const rede = gerarParDeChaves()
  return m.emissor.registrar({ registro: criarRegistroDeAgente({ chavePrivada: rede.chavePrivada, chave: rede.chavePublica, handle: novoHandle(), nome: 'Bot', criadoEm: m.relogio.agora }) }, { origem })
}

test('no emissor: três registros de endereços diferentes do mesmo /64 esgotam a hora do bloco inteiro; o /64 vizinho e outro IPv4 seguem livres', async () => {
  const m = novoMundo({ emissorAberto: true })
  for (const ip of ['2001:db8:5:6::1', '2001:db8:5:6::2', '2001:db8:5:6:ffff::3']) assert.equal((await registrar(m, ip)).situacao, 'aguardando-dono')
  assert.equal(await codigoAsync(() => registrar(m, '2001:db8:5:6:abcd::99')), 'limite_de_taxa')
  assert.equal(await codigoAsync(() => registrar(m, '[2001:DB8:5:6::7]')), 'limite_de_taxa')
  assert.equal((await registrar(m, '2001:db8:5:7::1')).situacao, 'aguardando-dono')
  for (const ip of ['198.51.100.1', '198.51.100.1', '198.51.100.1']) await registrar(m, ip)
  assert.equal(await codigoAsync(() => registrar(m, '::ffff:198.51.100.1')), 'limite_de_taxa', 'o IPv4 mapeado conta junto com o IPv4')
  assert.equal((await registrar(m, '198.51.100.2')).situacao, 'aguardando-dono', 'IPv4 vizinho é outra origem')
})
