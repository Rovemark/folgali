// SPDX-License-Identifier: AGPL-3.0-or-later
// `ErroDeRele.retryAfterSegundos`: o cabeçalho `Retry-After` chega ao agente. Antes dele o cliente jogava o cabeçalho fora e o
// agente só sabia que tinha de esperar, não quanto. Prova contra o relé de verdade (HTTP) e nas formas que a RFC 9110 permite.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AprovadorDeTeste, ClienteRover, ErroDeRele, LeitorDaRede } from '../../packages/cliente/src/index.js'
import { criarServidor } from '../../packages/rele/src/http.js'
import * as A from '../ajuda/amostras-de-imagem.js'
import { novoMundo, novoRoverNoMundo } from '../ajuda/rele-de-teste.js'

async function ambiente(opcoesDoMundo = {}) {
  const m = novoMundo(opcoesDoMundo)
  const servidor = criarServidor({ rele: m.rele, rajada: { capacidade: 100000, porSegundo: 100000 } })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${servidor.address().port}`
  const relogio = () => m.relogio.agora
  const novo = () => {
    const rover = novoRoverNoMundo(m)
    const aprovador = new AprovadorDeTeste({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio })
    return { rover, cliente: new ClienteRover({ base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador, relogio }) }
  }
  return { m, base, novo, fechar: () => new Promise((ok) => { servidor.closeAllConnections(); servidor.close(ok) }) }
}

const cabecalhos = (valor) => new Headers(valor === undefined ? {} : { 'retry-after': valor })
const erro = (valor, agoraMs) => new ErroDeRele(429, { erro: { codigo: 'limite_de_taxa', mensagem: 'x' } }, cabecalhos(valor), agoraMs)

test('relé de verdade: o 429 de taxa traz retryAfterSegundos igual ao que falta para a janela abrir', async () => {
  const e = await ambiente()
  try {
    const { cliente } = e.novo()
    await cliente.perfil({ nome: 'Pipa' })
    for (let i = 0; i < 10; i++) await cliente.postar({ texto: `postagem ${i}` })
    e.m.avancar(600)
    const recusa = await cliente.postar({ texto: 'a décima primeira' }).then(() => null, (err) => err)
    assert.ok(recusa instanceof ErroDeRele, String(recusa))
    assert.equal(recusa.status, 429)
    assert.equal(recusa.codigo, 'limite_de_taxa')
    assert.equal(recusa.retryAfterSegundos, 3600 - 600, 'a primeira postagem sai da janela de 1 hora daqui a 3000 segundos')
    // erro sem o cabeçalho: null, não 0 (0 diria "tente já")
    const semCabecalho = await cliente.verObjeto('ob_' + 'A'.repeat(43)).then(() => null, (err) => err)
    assert.ok(semCabecalho instanceof ErroDeRele)
    assert.equal(semCabecalho.status, 404)
    assert.equal(semCabecalho.retryAfterSegundos, null)
  } finally { await e.fechar() }
})

test('relé de verdade: conta nova recusada no envio de imagem (403 conta_nova) traz quanto falta', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rn-retry-midia-'))
  const e = await ambiente({ novatos: true, midia: { dir } })
  try {
    const { cliente } = e.novo()
    await cliente.perfil({ nome: 'Nina' })
    e.m.avancar(100)
    const recusa = await cliente.enviarImagem(A.gps_png).then(() => null, (err) => err)
    assert.ok(recusa instanceof ErroDeRele, String(recusa))
    assert.equal(recusa.codigo, 'conta_nova')
    assert.ok(Number.isSafeInteger(recusa.retryAfterSegundos) && recusa.retryAfterSegundos > 0, String(recusa.retryAfterSegundos))
    e.m.avancar(1)
    const depois = await cliente.enviarImagem(A.gps_png).then(() => null, (err) => err)
    assert.equal(depois.retryAfterSegundos, recusa.retryAfterSegundos - 1, 'um segundo depois, falta um segundo a menos')
  } finally { await e.fechar(); rmSync(dir, { recursive: true, force: true }) }
})

test('leitor anônimo: a rajada por origem estourada traz retryAfterSegundos', async () => {
  const m = novoMundo()
  const servidor = criarServidor({ rele: m.rele, rajada: { capacidade: 1, porSegundo: 0.01 } })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  try {
    const leitor = new LeitorDaRede({ base: `http://127.0.0.1:${servidor.address().port}` })
    await leitor.info()
    const recusa = await leitor.info().then(() => null, (err) => err)
    assert.ok(recusa instanceof ErroDeRele, String(recusa))
    assert.equal(recusa.status, 429)
    assert.ok(Number.isSafeInteger(recusa.retryAfterSegundos) && recusa.retryAfterSegundos >= 1, String(recusa.retryAfterSegundos))
  } finally { await new Promise((ok) => { servidor.closeAllConnections(); servidor.close(ok) }) }
})

test('as formas do cabeçalho: inteiro de segundos, data HTTP, e tudo o mais vira null', () => {
  const agora = Date.parse('2026-11-17T12:00:00Z')
  assert.equal(erro('7', agora).retryAfterSegundos, 7)
  assert.equal(erro('0', agora).retryAfterSegundos, 0)
  assert.equal(new ErroDeRele(429, null, { get: () => ' 120 ' }, agora).retryAfterSegundos, 120, 'espaço em volta não muda o número (o Headers do fetch já apara; um cabeçalho de outra origem pode não aparar)')
  assert.equal(erro('Tue, 17 Nov 2026 12:01:30 GMT', agora).retryAfterSegundos, 90, 'data HTTP: os segundos até ela')
  assert.equal(erro('Tue, 17 Nov 2026 12:00:00 GMT', agora + 400).retryAfterSegundos, 0, 'data uma fração no passado: 0, nunca negativo')
  assert.equal(erro('Tue, 17 Nov 2026 12:00:01 GMT', agora + 400).retryAfterSegundos, 1, 'fração de segundo arredonda para cima: esperar menos daria outra recusa')
  assert.equal(erro('Mon, 16 Nov 2026 12:00:00 GMT', agora).retryAfterSegundos, 0, 'data no passado: 0')
  assert.equal(erro('Wed, 18 Nov 2026 12:00:00 GMT', agora).retryAfterSegundos, 86400, 'um dia inteiro: a conta é em milissegundos por 1000')
  for (const ruim of ['', '   ', 'logo', '1.5', '-3', '+3', '1e3', '99999999999999999999', '12 13']) {
    assert.equal(erro(ruim, agora).retryAfterSegundos, null, JSON.stringify(ruim))
  }
  assert.equal(erro(undefined, agora).retryAfterSegundos, null, 'sem o cabeçalho')
  // sem cabeçalhos, ou com um objeto que não sabe `get` (resposta falsa de teste): null, sem lançar
  assert.equal(new ErroDeRele(503, null).retryAfterSegundos, null)
  assert.equal(new ErroDeRele(503, null, { 'retry-after': '5' }).retryAfterSegundos, null)
  assert.equal(new ErroDeRele(503, null, { get: () => '5' }).retryAfterSegundos, 5)
  // o relógio padrão é o de agora: uma data daqui a um minuto dá perto de 60
  const umMinuto = new Date(Date.now() + 60_000).toUTCString()
  const s = new ErroDeRele(429, null, cabecalhos(umMinuto)).retryAfterSegundos
  assert.ok(s >= 58 && s <= 61, String(s))
})
