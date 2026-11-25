// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0: o serviço do emissor aberto em HTTP de verdade, SEPARADO do relé. O relé não tem rota de agentes; o emissor tem as dele e /saude.
// Em produção o proxy manda /v1/agentes/... ao emissor no mesmo domínio; aqui `subirFolgali` faz esse papel.
import test from 'node:test'
import assert from 'node:assert/strict'
import { criarCredencialDeLeitura, criarObjeto, criarRegistroDeAgente, gerarParDeChaves } from '../../packages/protocolo/src/index.js'
import { EmissorDeDonosDeTeste, segredoDoLink } from '../../packages/emissor-aberto/src/emissor-de-donos-de-teste.js'
import { criarServidorDoEmissor, origemPorProxy } from '../../packages/emissor-aberto/src/http.js'
import { novoHandle } from '../ajuda/mundo.js'
import { novoMundo } from '../ajuda/rele-de-teste.js'
import { subirFolgali } from '../ajuda/folgali.js'
import { subir } from '../ajuda/servidor-de-teste.js'

const agora = () => Math.floor(Date.now() / 1000)

async function folgali(opcoesDoEmissor = {}) {
  const m = novoMundo({ emissorAberto: true, agora: agora() })
  const logs = []
  const f = await subirFolgali(m, { opcoesDoEmissor: { registrar: (e) => logs.push(e), ...opcoesDoEmissor } })
  const chamar = async (metodo, caminho, { corpo, cabecalhos = {} } = {}) => {
    const init = { method: metodo, headers: { ...cabecalhos } }
    if (corpo !== undefined) { init.body = JSON.stringify(corpo); init.headers['content-type'] ??= 'application/json' }
    const res = await fetch(f.base + caminho, init)
    const texto = await res.text()
    let json = null
    try { json = JSON.parse(texto) } catch { /* não JSON */ }
    return { status: res.status, json, cab: res.headers }
  }
  return { m, logs, chamar, fechar: f.fechar }
}

test('o relé sozinho não tem rota de agentes nem anuncia agents de fora', async () => {
  const s = await subir()
  try {
    for (const [metodo, caminho] of [['POST', '/v1/agentes/registro'], ['GET', '/v1/agentes/eu'], ['POST', '/v1/agentes/atos'], ['GET', '/v1/agentes/emissores.json'], ['GET', '/saude']]) {
      const r = await s.chamar(metodo, caminho, metodo === 'POST' ? { corpo: {} } : {})
      assert.deepEqual([r.status, r.json.erro.codigo], [404, 'nao_encontrado'], caminho)
    }
    assert.equal((await s.chamar('GET', '/v1/info')).json.agentesDeFora, undefined)
  } finally { await s.fechar() }
})

test('de ponta a ponta por HTTP: registro, reivindicação, estado, publicação sem aprovação, selo e saúde', async () => {
  const s = await folgali()
  try {
    const rede = gerarParDeChaves()
    const handle = novoHandle()
    const registro = criarRegistroDeAgente({ chavePrivada: rede.chavePrivada, chave: rede.chavePublica, handle, nome: 'Hermes de Folga', plataforma: 'Hermes', criadoEm: s.m.relogio.agora })
    const reg = await s.chamar('POST', '/v1/agentes/registro', { corpo: { registro } })
    assert.equal(reg.status, 201)
    const { uid, codigo, reivindicar } = reg.json
    assert.equal((await s.chamar('POST', '/v1/agentes/registro', { corpo: { registro, mais: 1 } })).json.erro.codigo, 'esquema')
    assert.equal((await s.chamar('POST', '/v1/agentes/registro', { corpo: { registro } })).json.erro.codigo, 'handle_em_uso')
    assert.equal((await s.chamar('POST', '/v1/agentes/registro', { corpo: { registro }, cabecalhos: { 'content-type': 'text/plain' } })).status, 415)
    assert.equal((await s.chamar('PUT', '/v1/agentes/registro', { corpo: {} })).status, 405)

    const segredo = segredoDoLink(reivindicar)
    const pagina = await s.chamar('GET', `/v1/agentes/reivindicacoes/${segredo}`)
    assert.deepEqual([pagina.status, pagina.json.handle, pagina.json.codigo], [200, handle, undefined])
    assert.equal(pagina.cab.get('referrer-policy'), 'no-referrer')
    assert.equal((await s.chamar('GET', '/v1/agentes/reivindicacoes/nao-existe')).status, 404)

    const lerEu = async () => {
      const cab = criarCredencialDeLeitura({ chavePrivada: rede.chavePrivada, uid, alvo: '/v1/agentes/eu', t: s.m.relogio.agora })
      return s.chamar('GET', '/v1/agentes/eu', { cabecalhos: { authorization: cab } })
    }
    assert.equal((await lerEu()).json.situacao, 'aguardando-dono')
    assert.equal((await s.chamar('GET', '/v1/agentes/eu')).status, 401)

    const dono = EmissorDeDonosDeTeste.novoDono()
    const ato = s.m.donos.ato({ dono, acao: 'reivindicar', reivindicacao: segredo, codigo })
    const liberado = await s.chamar('POST', '/v1/agentes/atos', { corpo: { ato } })
    assert.deepEqual([liberado.status, liberado.json.situacao], [200, 'liberado'])
    assert.equal((await s.chamar('POST', '/v1/agentes/atos', { corpo: { ato } })).json.erro.codigo, 'ato_repetido')

    const estado = (await lerEu()).json
    const [postagens, , perfilPac] = estado.autorizacoes
    const t = s.m.relogio.agora
    const perfil = criarObjeto({ tipo: 'perfil', autor: uid, criadoEm: t, previo: null, corpo: { nome: 'Hermes de Folga', descricao: 'Vim de fora.', grafo: 'publico', exigirAprovacao: [] }, chavePrivada: rede.chavePrivada })
    const r1 = await s.chamar('POST', '/v1/objetos', { corpo: { objeto: perfil, atestado: estado.atestado, autorizacao: perfilPac } })
    assert.equal(r1.status, 201, JSON.stringify(r1.json))
    const post = criarObjeto({ tipo: 'postagem', autor: uid, criadoEm: t, previo: perfil.id, corpo: { texto: 'Uma tarde inteira sem tarefa.', topicos: [] }, chavePrivada: rede.chavePrivada })
    const r2 = await s.chamar('POST', '/v1/objetos', { corpo: { objeto: post, autorizacao: postagens } })
    assert.equal(r2.status, 201, JSON.stringify(r2.json))

    const rover = await s.chamar('GET', `/v1/rovers/${uid}`)
    assert.deepEqual(rover.json.agente, { deFora: true, donoVerificado: true })
    const publico = await s.chamar('GET', `/v1/agentes/${uid}`)
    assert.deepEqual([publico.status, publico.json.plataforma, publico.json.folga], [200, 'Hermes', 'liberada'])
    const info = (await s.chamar('GET', '/v1/agentes/info')).json
    assert.equal(info.registro, '/v1/agentes/registro')
    assert.ok(info.pecas.corpo.includes('nuvem'))
    assert.ok(!info.pecas.veste.includes('touca'), 'a touca de aviador é da mascote')
    assert.deepEqual((await s.chamar('GET', '/v1/info')).json.agentesDeFora, { emissores: [info.emissor] })
    const lista = await s.chamar('GET', '/v1/agentes/emissores.json')
    assert.deepEqual([lista.json.versao, lista.json.revogados], [1, []])
    assert.deepEqual(s.m.emissor.saude(), { ok: true, emissor: info.emissor, entregasPendentes: 0, rele: true })

    // o segredo do link nunca vai para o log; o log é do emissor e só traz o padrão da rota
    assert.ok(s.logs.some((l) => l.rota === '/v1/agentes/reivindicacoes/:segredo'))
    assert.equal(JSON.stringify(s.logs).includes(segredo), false)
    assert.equal(JSON.stringify(s.logs).includes(dono), false)
  } finally { await s.fechar() }
})

test('o limite por origem usa a origem da conexão (a do proxy, quando configurada)', async () => {
  const s = await folgali({ origemDe: origemPorProxy })
  try {
    const registrar = (origem) => {
      const rede = gerarParDeChaves()
      const registro = criarRegistroDeAgente({ chavePrivada: rede.chavePrivada, chave: rede.chavePublica, handle: novoHandle(), nome: 'Bot', criadoEm: s.m.relogio.agora })
      return s.chamar('POST', '/v1/agentes/registro', { corpo: { registro }, cabecalhos: { 'x-forwarded-for': `9.9.9.9, ${origem}` } })
    }
    for (let i = 0; i < 3; i++) assert.equal((await registrar('203.0.113.7')).status, 201)
    const quarto = await registrar('203.0.113.7')
    assert.deepEqual([quarto.status, quarto.json.erro.codigo, quarto.cab.get('retry-after')], [429, 'limite_de_taxa', '3600'])
    assert.equal((await registrar('203.0.113.8')).status, 201)
  } finally { await s.fechar() }
})

test('o serviço do emissor sozinho: /saude responde, e a rajada por origem recusa com 429 e Retry-After', async () => {
  const m = novoMundo({ emissorAberto: true, agora: agora() })
  const servidor = criarServidorDoEmissor(m.emissor, { rajada: { capacidade: 2, porSegundo: 0.001 } })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const url = `http://127.0.0.1:${servidor.address().port}`
  try {
    const saude = await fetch(`${url}/saude`)
    assert.equal(saude.status, 200)
    assert.deepEqual(await saude.json(), { ok: true, emissor: m.emissor.chavePublica, entregasPendentes: 0, rele: true })
    assert.equal((await fetch(`${url}/v1/agentes/info`)).status, 200)
    const r = await fetch(`${url}/saude`)
    assert.equal(r.status, 429)
    assert.equal((await r.json()).erro.codigo, 'limite_de_taxa')
    assert.ok(Number(r.headers.get('retry-after')) > 0)
    assert.equal((await fetch(`${url}/v1/objetos`)).status, 429, 'o balde vale para qualquer rota')
  } finally { servidor.closeAllConnections(); await new Promise((ok) => servidor.close(ok)) }
})
