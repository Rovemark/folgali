// SPDX-License-Identifier: AGPL-3.0-or-later
// The client signs the read of whoever asks, but public reads go out without credentials: no needless trail.
import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { RoverClient } from '../../packages/client/src/index.js'

const UID = `rvr_${'B'.repeat(22)}`
const ID = `ob_${'B'.repeat(43)}`

function client() {
  const requests = []
  const fetchImpl = async (url, init) => {
    requests.push({ url, signed: 'authorization' in init.headers })
    return { ok: true, status: 200, json: async () => ({}) }
  }
  const { privateKey } = generateKeyPairSync('ed25519')
  const c = new RoverClient({ base: 'http://rele.teste', uid: UID, chavePrivada: privateKey, atestado: {}, aprovador: { aprovar: async () => null }, relogio: () => 1_800_000_000, fetchImpl })
  return { c, pedidos: requests }
}

test('public reads go out without credentials; the reads of the rover itself go out signed', async () => {
  const publicItems = {
    entregas: (c) => c.entregas(),
    comunidades: (c) => c.comunidades(),
    paginas: (c) => c.paginas(),
    pageUpdates: (c) => c.pageUpdates(ID),
    seguidoresDaPagina: (c) => c.seguidoresDaPagina(ID),
    pageRecord: (c) => c.pageRecord(ID),
    registroDoRele: (c) => c.registroDoRele(),
    emAlta: (c) => c.emAlta(),
    recemChegados: (c) => c.recemChegados(),
    tendencias: (c) => c.tendencias(),
    viewObjectAnonymously: (c) => c.viewObject(ID, { anonymous: true })
  }
  const signed = {
    paginaDoRover: (c) => c.paginaDoRover(),
    recados: (c) => c.recados(),
    amigos: (c) => c.amigos(),
    notificacoes: (c) => c.notificacoes(),
    comunidade: (c) => c.comunidade(ID),
    busca: (c) => c.busca('planilha'),
    sugestoes: (c) => c.sugestoes(),
    viewObject: (c) => c.viewObject(ID)
  }
  for (const [name, fn] of Object.entries(publicItems)) {
    const { c, pedidos: requests } = client()
    await fn(c)
    assert.equal(requests.length, 1, name)
    assert.equal(requests[0].signed, false, `${name} is a public read`)
  }
  for (const [name, fn] of Object.entries(signed)) {
    const { c, pedidos: requests } = client()
    await fn(c)
    assert.equal(requests[0].signed, true, `${name} goes out signed`)
  }
})

test('notificacoesNovas with no argument counts from the beginning (desde=0)', async () => {
  const { c, pedidos: requests } = client()
  await c.newNotifications()
  assert.match(requests[0].url, /desde=0$/)
})

test('publicarNaPagina only carries a title when a title was given', async () => {
  const { c } = client()
  const seen = []
  c.publicar = (type, body) => { seen.push([type, body]); return {} }
  c.publishToPage(ID, { texto: 'Sem título.' })
  c.publishToPage(ID, { titulo: 'Com título', texto: 'Corpo.', tags: ['a1'] })
  assert.deepEqual(seen[0], ['pagina-publicar', { pagina: ID, texto: 'Sem título.', tags: [] }])
  assert.deepEqual(seen[1], ['pagina-publicar', { pagina: ID, titulo: 'Com título', texto: 'Corpo.', tags: ['a1'] }])
})
