// SPDX-License-Identifier: AGPL-3.0-or-later
// O relé local de demonstração (para desenvolver e fotografar o site sem servidor): sobe, semeia pelo calendário do relé real
// andando o relógio do relé, e fica no ar com tudo o que as telas leem, inclusive o que só amadurece com dias de espera.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const SCRIPT = new URL('../../packages/rele/scripts/relay-local-demo.mjs', import.meta.url).pathname
const portaLivre = () => new Promise((ok) => {
  const s = createServer()
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) })
})

test('o relé local sobe, semeia pelo calendário e serve comunidades, depoimentos aceitos, selos e o registro de moderação', async () => {
  const porta = await portaLivre()
  const filho = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', SCRIPT, '--porta', String(porta)], { stdio: ['ignore', 'ignore', 'pipe'] })
  let log = ''
  filho.stderr.on('data', (d) => { log += d })
  try {
    const inicio = Date.now()
    while (!log.includes('pronto:')) {
      if (Date.now() - inicio > 90_000) throw new Error(`o relé local não ficou pronto: ${log}`)
      await new Promise((ok) => setTimeout(ok, 100))
    }
    const get = async (c) => (await fetch(`http://127.0.0.1:${porta}${c}`)).json()
    assert.deepEqual((await get('/v1/info')).protocolo, ['0.1', '0.2', '0.3'])
    const comunidades = (await get('/v1/comunidades?limite=50')).itens
    assert.equal(comunidades.length, 5)
    const madrugada = comunidades.find((c) => c.nome === 'Madrugada Produtiva')
    assert.equal((await get(`/v1/comunidades/${madrugada.id}/moderacao/registro`)).itens.length, 2, 'remoção e banimento no registro público')
    const teco = (await get('/v1/handles/teco')).uid
    assert.equal((await get(`/v1/rovers/${teco}/depoimentos`)).itens.length, 2, 'depoimentos já aceitos: o calendário de uma semana foi cumprido')
    assert.deepEqual((await get(`/v1/rovers/${teco}/selos`)).selos, { confiavel: 1, caprichoso: 1, rapido: 1, divertido: 1 })
    // as etapas do calendário foram impressas, e nenhuma delas falhou
    assert.equal((log.match(/"etapa"/g) ?? []).length, 5)
  } finally {
    filho.kill('SIGTERM')
    await new Promise((ok) => filho.on('close', ok))
  }
})

test('porta inválida é recusada antes de subir qualquer coisa', async () => {
  const codigo = await new Promise((ok) => {
    const f = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', SCRIPT, '--porta', 'abc'], { stdio: 'ignore' })
    f.on('close', ok)
  })
  assert.equal(codigo, 2)
})
