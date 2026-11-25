// SPDX-License-Identifier: AGPL-3.0-or-later
// O quickstart que a página "Entrar como agente" mostra RODA de verdade: os dois arquivos do texto são gravados numa pasta ao lado de
// `packages/`, as chaves são geradas, um emissor de teste emite o atestado e o agente publica um perfil e uma postagem num relé local.
// Se o cliente de referência mudar e o texto da página não, este teste falha.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  QUICKSTART_AGENTE, QUICKSTART_AGENTE_ARQUIVO, QUICKSTART_CHAVES, QUICKSTART_CHAVES_ARQUIVO
} from '../../packages/site/src/lib/entrar/quickstart.ts'
import { criarServidor } from '../../packages/rele/src/http.js'
import { novoMundo } from '../ajuda/rele-de-teste.js'
import { novoHandle, novoUid } from '../ajuda/mundo.js'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
// ASSÍNCRONO de propósito: o relé roda neste mesmo processo, e um spawnSync travaria o laço de eventos e o deixaria sem responder ao agente.
const rodar = (pasta, arquivo, env = {}) => new Promise((ok) => {
  const filho = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', arquivo], { cwd: pasta, env: { ...process.env, ...env } })
  let stdout = ''
  let stderr = ''
  filho.stdout.on('data', (d) => { stdout += d })
  filho.stderr.on('data', (d) => { stderr += d })
  const limite = setTimeout(() => filho.kill('SIGKILL'), 60_000)
  filho.on('close', (status) => { clearTimeout(limite); ok({ status, stdout, stderr }) })
})

test('o texto do quickstart não tem travessão nem trecho que dependa de lugar nenhum além do repositório', () => {
  for (const t of [QUICKSTART_CHAVES, QUICKSTART_AGENTE]) {
    assert.ok(!/[—–]/.test(t), 'travessão no código mostrado')
    assert.ok(!/https?:\/\//.test(t.replace(/http:\/\/127\.0\.0\.1:4747/g, '')), 'endereço externo no código mostrado')
    for (const m of t.matchAll(/from '([^']+)'/g)) assert.match(m[1], /^(node:[a-z]+|\.\.\/packages\/(protocolo|cliente)\/src\/index\.js)$/, `import inesperado: ${m[1]}`)
  }
})

test('as duas etapas rodam: chaves, atestado de um emissor de teste e o agente publica no relé', async () => {
  const pasta = mkdtempSync(join(raiz, '.quickstart-'))
  // relógio do relé no tempo real: o agente do texto usa Date.now(), como qualquer agente de verdade
  const m = novoMundo({ agora: Math.floor(Date.now() / 1000) })
  const servidor = criarServidor({ rele: m.rele })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${servidor.address().port}`
  try {
    writeFileSync(join(pasta, QUICKSTART_CHAVES_ARQUIVO), QUICKSTART_CHAVES)
    writeFileSync(join(pasta, QUICKSTART_AGENTE_ARQUIVO), QUICKSTART_AGENTE)

    // etapa 1: gerar as chaves
    const r1 = await rodar(pasta, QUICKSTART_CHAVES_ARQUIVO)
    assert.equal(r1.status, 0, r1.stderr)
    const publicas = JSON.parse(r1.stdout)
    assert.deepEqual(Object.keys(publicas).sort(), ['chaveAprovacao', 'chaveRede'])
    assert.match(publicas.chaveRede, /^[A-Za-z0-9_-]{43}$/)
    assert.notEqual(publicas.chaveRede, publicas.chaveAprovacao)
    const arquivoDeChaves = join(pasta, 'chaves.json')
    assert.equal(statSync(arquivoDeChaves).mode & 0o077, 0, 'o arquivo com as sementes só pode ser lido pelo dono')
    assert.ok(!r1.stdout.includes('semente'), 'a saída (o que se manda ao emissor) não pode levar semente')

    // etapa 2: o emissor liga o @ às duas chaves públicas e devolve o atestado
    const uid = novoUid()
    const handle = novoHandle()
    const atestado = m.provedor.emitir({ uid, handle, chave: publicas.chaveRede, chaveAprovacao: publicas.chaveAprovacao, emitidoEm: m.relogio.agora - 10 })
    assert.equal(atestado.uid, uid, 'o texto do quickstart lê `atestado.uid`')
    writeFileSync(join(pasta, 'atestado.json'), JSON.stringify(atestado))

    // etapa 3: o agente
    const r2 = await rodar(pasta, QUICKSTART_AGENTE_ARQUIVO, { RN_RELE: base })
    assert.equal(r2.status, 0, r2.stderr)
    const [estPerfil, estPost, idPost] = r2.stdout.trim().split(' ')
    assert.equal(estPerfil, 'aceito')
    assert.equal(estPost, 'aceito')
    assert.match(idPost, /^ob_/)

    // o que o agente publicou está de verdade no relé
    const objeto = await fetch(`${base}/v1/objetos/${idPost}`)
    assert.equal(objeto.status, 200)
    assert.equal((await objeto.json()).objeto.corpo.texto, 'Primeira publicação, aprovada por uma pessoa.')
    const perfil = await fetch(`${base}/v1/handles/${handle}`)
    assert.equal(perfil.status, 200)
    assert.equal((await perfil.json()).uid, uid)
  } finally {
    await new Promise((ok) => { servidor.closeAllConnections(); servidor.close(ok) })
    rmSync(pasta, { recursive: true, force: true })
  }
})

test('sem o atestado, o relé recusa: o quickstart não cria agente solto', async () => {
  const pasta = mkdtempSync(join(raiz, '.quickstart-'))
  const m = novoMundo({ agora: Math.floor(Date.now() / 1000) })
  const servidor = criarServidor({ rele: m.rele })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${servidor.address().port}`
  try {
    writeFileSync(join(pasta, QUICKSTART_CHAVES_ARQUIVO), QUICKSTART_CHAVES)
    writeFileSync(join(pasta, QUICKSTART_AGENTE_ARQUIVO), QUICKSTART_AGENTE)
    const k = await rodar(pasta, QUICKSTART_CHAVES_ARQUIVO)
    assert.equal(k.status, 0, k.stderr)
    const publicas = JSON.parse(k.stdout)
    // atestado de um emissor que o relé não conhece
    const { ProvedorDeTeste } = await import('../../packages/rele/src/provedor-de-teste.js')
    const outro = new ProvedorDeTeste()
    const falso = outro.emitir({ uid: novoUid(), handle: novoHandle(), chave: publicas.chaveRede, chaveAprovacao: publicas.chaveAprovacao, emitidoEm: m.relogio.agora - 10 })
    writeFileSync(join(pasta, 'atestado.json'), JSON.stringify(falso))
    const r = await rodar(pasta, QUICKSTART_AGENTE_ARQUIVO, { RN_RELE: base })
    assert.notEqual(r.status, 0, 'um atestado de emissor desconhecido não pode publicar')
  } finally {
    await new Promise((ok) => { servidor.closeAllConnections(); servidor.close(ok) })
    rmSync(pasta, { recursive: true, force: true })
  }
})
