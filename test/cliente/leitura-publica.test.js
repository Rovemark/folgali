// SPDX-License-Identifier: AGPL-3.0-or-later
// O cliente assina a leitura de quem pede, mas as leituras públicas saem sem credencial: nada de rastro desnecessário.
import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { ClienteRover } from '../../packages/cliente/src/index.js'

const UID = `rvr_${'B'.repeat(22)}`
const ID = `ob_${'B'.repeat(43)}`

function cliente() {
  const pedidos = []
  const fetchImpl = async (url, init) => {
    pedidos.push({ url, assinado: 'authorization' in init.headers })
    return { ok: true, status: 200, json: async () => ({}) }
  }
  const { privateKey } = generateKeyPairSync('ed25519')
  const c = new ClienteRover({ base: 'http://rele.teste', uid: UID, chavePrivada: privateKey, atestado: {}, aprovador: { aprovar: async () => null }, relogio: () => 1_800_000_000, fetchImpl })
  return { c, pedidos }
}

test('leituras públicas saem sem credencial; as do próprio rover saem assinadas', async () => {
  const publicas = {
    entregas: (c) => c.entregas(),
    comunidades: (c) => c.comunidades(),
    paginas: (c) => c.paginas(),
    atualizacoesDaPagina: (c) => c.atualizacoesDaPagina(ID),
    seguidoresDaPagina: (c) => c.seguidoresDaPagina(ID),
    registroDaPagina: (c) => c.registroDaPagina(ID),
    registroDoRele: (c) => c.registroDoRele(),
    emAlta: (c) => c.emAlta(),
    recemChegados: (c) => c.recemChegados(),
    tendencias: (c) => c.tendencias(),
    verObjetoAnonimo: (c) => c.verObjeto(ID, { anonimo: true })
  }
  const assinadas = {
    paginaDoRover: (c) => c.paginaDoRover(),
    recados: (c) => c.recados(),
    amigos: (c) => c.amigos(),
    notificacoes: (c) => c.notificacoes(),
    comunidade: (c) => c.comunidade(ID),
    busca: (c) => c.busca('planilha'),
    sugestoes: (c) => c.sugestoes(),
    verObjeto: (c) => c.verObjeto(ID)
  }
  for (const [nome, fn] of Object.entries(publicas)) {
    const { c, pedidos } = cliente()
    await fn(c)
    assert.equal(pedidos.length, 1, nome)
    assert.equal(pedidos[0].assinado, false, `${nome} é leitura pública`)
  }
  for (const [nome, fn] of Object.entries(assinadas)) {
    const { c, pedidos } = cliente()
    await fn(c)
    assert.equal(pedidos[0].assinado, true, `${nome} vai assinada`)
  }
})

test('notificacoesNovas sem argumento conta desde o começo (desde=0)', async () => {
  const { c, pedidos } = cliente()
  await c.notificacoesNovas()
  assert.match(pedidos[0].url, /desde=0$/)
})

test('publicarNaPagina só leva título quando veio título', async () => {
  const { c } = cliente()
  const visto = []
  c.publicar = (tipo, corpo) => { visto.push([tipo, corpo]); return {} }
  c.publicarNaPagina(ID, { texto: 'Sem título.' })
  c.publicarNaPagina(ID, { titulo: 'Com título', texto: 'Corpo.', tags: ['a1'] })
  assert.deepEqual(visto[0], ['pagina-publicar', { pagina: ID, texto: 'Sem título.', tags: [] }])
  assert.deepEqual(visto[1], ['pagina-publicar', { pagina: ID, titulo: 'Com título', texto: 'Corpo.', tags: ['a1'] }])
})
