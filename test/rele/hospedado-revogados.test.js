// SPDX-License-Identifier: AGPL-3.0-or-later
// O RELÉ HOSPEDADO de verdade (bin/rele-hospedado.js, processo filho) lendo a lista de revogados de um emissor falso por https:
// recusa ao subir com configuração torta, lê ao subir, recusa objeto e credencial de leitura do revogado, guarda o estado ao lado
// do banco e o reaproveita depois de reiniciar com o emissor fora do ar, avisa quando a lista fica velha e não solta um rover só
// porque a lista nova o omitiu. Cada processo e cada servidor criado aqui é derrubado aqui, pelo próprio objeto.
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EXIGE_APROVACAO, criarAtestadoDeHandle, criarCredencialDeLeitura } from '../../packages/protocolo/src/index.js'
import { aprovar, novoEmissor, novoRover, objetoDe } from '../ajuda/mundo.js'
import { certificadoLocal, subirEmissorFalso } from '../ajuda/emissor-https.js'

const BIN = new URL('../../packages/rele/bin/rele-hospedado.js', import.meta.url).pathname
const NODE = ['--disable-warning=ExperimentalWarning']
const base = { PATH: process.env.PATH, HOME: process.env.HOME }
const agora = () => Math.floor(Date.now() / 1000)
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms))
const portaLivre = () => new Promise((ok) => {
  const s = createServer()
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) })
})

const limpezas = []
after(async () => { for (const f of limpezas.reverse()) await f() })

let cert
let emissorFalso
const emissor = novoEmissor()
const estado = { geradoEm: agora(), emissores: [emissor.chavePublica], revogados: [] }
const pasta = mkdtempSync(join(tmpdir(), 'rn-hosp-revog-'))
const banco = join(pasta, 'dados', 'rele.sqlite')
const arquivoDeEstado = join(pasta, 'dados', 'revogados-dos-emissores.json')
const segredo = randomBytes(32).toString('hex')

before(async () => {
  cert = certificadoLocal()
  emissorFalso = await subirEmissorFalso(cert, estado)
  limpezas.push(async () => { await emissorFalso.fechar(); cert.apagar(); rmSync(pasta, { recursive: true, force: true }) })
})

const envDoRele = (extra = {}) => ({
  ...base, RELE_EMISSORES: emissor.chavePublica, RELE_SEGREDO_DENUNCIAS: segredo, RELE_BANCO: banco,
  RELE_EMISSORES_DESCOBERTA: `${emissor.chavePublica}=${emissorFalso.descoberta}`,
  // o certificado do emissor falso é autoassinado: o relé confia nele como confiaria numa AC do sistema
  NODE_EXTRA_CA_CERTS: cert.caminhoCert,
  RELE_RAJADA_CAPACIDADE: '5000', RELE_RAJADA_POR_SEGUNDO: '5000', ...extra
})

async function subir(extra = {}) {
  const porta = await portaLivre()
  const filho = spawn(process.execPath, [...NODE, BIN], { env: envDoRele({ RELE_PORTA: String(porta), ...extra }), stdio: ['ignore', 'ignore', 'pipe'] })
  let log = ''
  filho.stderr.on('data', (d) => { log += d })
  const fim = new Promise((ok) => filho.on('close', (codigo) => ok(codigo)))
  limpezas.push(async () => { filho.kill('SIGKILL'); await fim })
  const inicio = Date.now()
  while (!log.includes('"ouvindo"')) {
    if (Date.now() - inicio > 20_000) throw new Error(`o relé hospedado não subiu: ${log}`)
    if (filho.exitCode !== null) throw new Error(`o relé hospedado saiu: ${log}`)
    await dormir(40)
  }
  const url = `http://127.0.0.1:${porta}`
  const get = async (caminho, cabecalhos = {}) => {
    const r = await fetch(url + caminho, { headers: cabecalhos })
    return { status: r.status, json: await r.json().catch(() => null) }
  }
  const post = async (caminho, corpo) => {
    const r = await fetch(url + caminho, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
    return { status: r.status, json: await r.json().catch(() => null) }
  }
  const parar = async () => { filho.kill('SIGTERM'); return fim }
  const eventos = () => log.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return { cru: l } } })
  return { url, get, post, parar, log: () => log, eventos }
}

const tentarSubir = (extra) => spawnSync(process.execPath, [...NODE, BIN], { env: envDoRele({ RELE_PORTA: '1', ...extra }), encoding: 'utf8', timeout: 15_000 })

// ---------- o rover e o que ele publica ----------
const roverA = novoRover(emissor, { agora: agora() })
const roverB = novoRover(emissor, { agora: agora() })
for (const r of [roverA, roverB]) r.cabeca = null

async function publicar(rele, r, tipo, corpo, { comAtestado = false } = {}) {
  const objeto = objetoDe(r, tipo, corpo, { criadoEm: agora(), previo: r.cabeca })
  const env = { objeto }
  if (comAtestado) env.atestado = r.atestado
  if (EXIGE_APROVACAO[tipo]) env.aprovacao = aprovar(r, objeto, { aprovadoEm: agora() })
  const res = await rele.post('/v1/objetos', env)
  if (res.status === 201) r.cabeca = objeto.id
  return res
}
const postar = (rele, r, texto, o) => publicar(rele, r, 'postagem', { texto, topicos: ['rovers'] }, o)
const ler = (rele, r, alvo) => rele.get(alvo, { authorization: criarCredencialDeLeitura({ chavePrivada: r.rede.chavePrivada, uid: r.uid, alvo, t: agora() }) })

test('falha fechada: URL http, com senha, chave fora de RELE_EMISSORES, intervalo torto ou arquivo de estado ilegível não sobem', () => {
  const casos = [
    [{ RELE_EMISSORES_DESCOBERTA: `${emissor.chavePublica}=http://127.0.0.1:9/x` }, /precisa ser https/],
    [{ RELE_EMISSORES_DESCOBERTA: `${emissor.chavePublica}=https://eu:segredo-da-url@127.0.0.1:9/x` }, /usuário nem senha/],
    [{ RELE_EMISSORES_DESCOBERTA: `${novoEmissor().chavePublica}=https://127.0.0.1:9/x` }, /RELE_EMISSORES/],
    [{ RELE_EMISSORES_DESCOBERTA: 'sem-igual' }, /chave=URL/],
    [{ RELE_REVOGADOS_INTERVALO_MIN: '0' }, /RELE_REVOGADOS_INTERVALO_MIN/],
    [{ RELE_REVOGADOS_INTERVALO_MIN: '1.5' }, /RELE_REVOGADOS_INTERVALO_MIN/],
    [{ RELE_REVOGADOS_IDADE_MAX_MIN: 'muito' }, /RELE_REVOGADOS_IDADE_MAX_MIN/],
    [{ RELE_REVOGADOS_INTERVALO_MIN: '30', RELE_REVOGADOS_IDADE_MAX_MIN: '10' }, /maior ou igual/]
  ]
  for (const [extra, re] of casos) {
    const r = tentarSubir(extra)
    assert.equal(r.status, 2, `${JSON.stringify(extra)}: ${r.stderr}`)
    assert.match(r.stderr, re)
    assert.ok(!r.stderr.includes('segredo-da-url'), 'a mensagem não repete a URL')
  }
  const outra = mkdtempSync(join(tmpdir(), 'rn-hosp-torto-'))
  limpezas.push(() => rmSync(outra, { recursive: true, force: true }))
  writeFileSync(join(outra, 'revogados-dos-emissores.json'), '{ quebrado')
  const r = tentarSubir({ RELE_BANCO: join(outra, 'rele.sqlite') })
  assert.equal(r.status, 2, r.stderr)
  assert.match(r.stderr, /ilegível/)
})

test('o relé hospedado lê os revogados ao subir, recusa o revogado, guarda o estado, aguenta o emissor fora do ar e é monotônico', async () => {
  // 1) lista vazia: os dois rovers entram
  estado.geradoEm = agora() - 5
  let rele = await subir()
  assert.equal((await publicar(rele, roverA, 'perfil', { nome: 'Seixo', descricao: 'Rover de teste.' }, { comAtestado: true })).status, 201)
  assert.equal((await publicar(rele, roverB, 'perfil', { nome: 'Pipa', descricao: 'Rover de teste.' }, { comAtestado: true })).status, 201)
  let info = (await rele.get('/v1/info')).json
  assert.equal(info.provedor, 'descoberta')
  assert.equal(info.revogados.fontes[0].estado, 'em_dia')
  assert.equal(info.revogados.fontes[0].url, emissorFalso.descoberta)
  assert.ok(emissorFalso.pedidos.get('/.well-known/rover-network') >= 1, 'seguiu a descoberta')
  assert.equal(await rele.parar(), 0)
  assert.equal(statSync(arquivoDeEstado).mode & 0o777, 0o600)

  // 2) o emissor revoga B: lido ao subir, B não publica nem lê; A segue
  const revogadoEm = agora() - 2
  estado.geradoEm = revogadoEm
  estado.revogados = [{ emissor: emissor.chavePublica, uid: roverB.uid }]
  rele = await subir()
  let r = await postar(rele, roverB, 'depois da revogação')
  assert.deepEqual([r.status, r.json.erro.codigo], [403, 'atestado_revogado'])
  r = await ler(rele, roverB, '/v1/inicio')
  assert.deepEqual([r.status, r.json.erro.codigo], [403, 'atestado_revogado'])
  assert.equal((await rele.get(`/v1/rovers/${roverB.uid}`)).status, 404)
  assert.equal((await postar(rele, roverA, 'A segue publicando')).status, 201)
  assert.equal((await ler(rele, roverA, '/v1/inicio')).status, 200)
  info = (await rele.get('/v1/info')).json
  assert.deepEqual([info.revogados.vigentes, info.revogados.lembrados, info.revogados.fontes[0].geradoEm], [1, 0, revogadoEm])
  assert.equal(await rele.parar(), 0)

  // 3) reinício com o emissor FORA DO AR (503) e lista velha: o estado do disco vale, o alerta sai no log e em /v1/info
  estado.falhar = 503
  rele = await subir({ RELE_REVOGADOS_INTERVALO_MIN: '1', RELE_REVOGADOS_IDADE_MAX_MIN: '1' })
  r = await postar(rele, roverB, 'emissor fora do ar')
  assert.deepEqual([r.status, r.json.erro.codigo], [403, 'atestado_revogado'])
  info = (await rele.get('/v1/info')).json
  const fonte = info.revogados.fontes[0]
  assert.deepEqual([fonte.ultimoErro, fonte.falhasSeguidas, fonte.geradoEm], ['status', 1, revogadoEm])
  assert.equal(info.revogados.idadeMaxS, 60)
  assert.equal(info.revogados.intervaloS, 60)
  const ev = rele.eventos()
  assert.ok(ev.some((e) => e.evento === 'revogados_falha' && e.status === 503 && e.fonte === new URL(emissorFalso.base).host))
  // a lista tem uns segundos de idade: ainda em dia com teto de 1 minuto. A idade velha está provada no teste de unidade
  assert.ok(['em_dia', 'velha'].includes(fonte.estado))
  assert.equal(await rele.parar(), 0)

  // 4) a lista nova OMITE B (mais nova que a anterior): o atestado de B que foi revogado continua recusado;
  //    um atestado emitido depois da última lista que o trazia volta a valer
  delete estado.falhar
  estado.geradoEm = agora()
  estado.revogados = []
  rele = await subir()
  r = await postar(rele, roverB, 'a lista me esqueceu')
  assert.deepEqual([r.status, r.json.erro.codigo], [403, 'atestado_revogado'])
  info = (await rele.get('/v1/info')).json
  assert.deepEqual([info.revogados.vigentes, info.revogados.lembrados], [0, 1])
  roverB.atestado = criarAtestadoDeHandle({
    chavePrivadaDoEmissor: emissor.chavePrivada, emissor: emissor.chavePublica, uid: roverB.uid, handle: roverB.handle,
    chave: roverB.rede.chavePublica, chaveAprovacao: roverB.aprovacao.chavePublica, emitidoEm: revogadoEm + 1, expiraEm: revogadoEm + 86400
  })
  assert.equal((await postar(rele, roverB, 'reatestado depois da revogação', { comAtestado: true })).status, 201)
  assert.equal((await ler(rele, roverB, '/v1/inicio')).status, 200)
  assert.equal(await rele.parar(), 0)
  // o arquivo de estado é o que a documentação diz, e não leva nada além de chave pública, uid e datas
  const d = JSON.parse(readFileSync(arquivoDeEstado, 'utf8'))
  assert.deepEqual(d.pares, [{ emissor: emissor.chavePublica, uid: roverB.uid, ate: revogadoEm, vigente: false }])
  assert.ok(existsSync(banco))
})

test('a lista velha vira alerta no log ao subir e `velha` em /v1/info', async () => {
  const outra = mkdtempSync(join(tmpdir(), 'rn-hosp-velha-'))
  limpezas.push(() => rmSync(outra, { recursive: true, force: true }))
  estado.geradoEm = agora() - 2 * 3600
  estado.revogados = []
  const rele = await subir({ RELE_BANCO: join(outra, 'rele.sqlite'), RELE_REVOGADOS_IDADE_MAX_MIN: '60' })
  const fonte = (await rele.get('/v1/info')).json.revogados.fontes[0]
  assert.equal(fonte.estado, 'velha')
  assert.ok(fonte.idadeS >= 7200)
  const alerta = rele.eventos().find((e) => e.evento === 'revogados_lista_velha')
  assert.deepEqual([alerta?.nivel, alerta?.estado, alerta?.idadeMaxS], ['alerta', 'velha', 3600])
  assert.equal(await rele.parar(), 0)
  estado.geradoEm = agora()
})

test('sem RELE_EMISSORES_DESCOBERTA o relé hospedado segue como antes: provedor estático, sem o campo novo e sem arquivo de estado', async () => {
  const outra = mkdtempSync(join(tmpdir(), 'rn-hosp-sem-'))
  limpezas.push(() => rmSync(outra, { recursive: true, force: true }))
  const rele = await subir({ RELE_BANCO: join(outra, 'rele.sqlite'), RELE_EMISSORES_DESCOBERTA: '' })
  const info = (await rele.get('/v1/info')).json
  assert.equal(info.provedor, 'estatico')
  assert.equal('revogados' in info, false)
  assert.equal(await rele.parar(), 0)
  assert.equal(existsSync(join(outra, 'revogados-dos-emissores.json')), false)
})

test('o relé hospedado relê a lista sozinho no intervalo e a revogação nova vale sem reiniciar (espera um minuto de verdade)', { timeout: 150_000 }, async () => {
  const outra = mkdtempSync(join(tmpdir(), 'rn-hosp-intervalo-'))
  limpezas.push(() => rmSync(outra, { recursive: true, force: true }))
  const roverC = novoRover(emissor, { agora: agora() })
  roverC.cabeca = null
  estado.geradoEm = agora()
  estado.revogados = []
  delete estado.falhar
  const rele = await subir({ RELE_BANCO: join(outra, 'rele.sqlite'), RELE_REVOGADOS_INTERVALO_MIN: '1' })
  assert.equal((await publicar(rele, roverC, 'perfil', { nome: 'Teco', descricao: 'Rover de teste.' }, { comAtestado: true })).status, 201)
  const pedidosAntes = emissorFalso.pedidos.get('/.well-known/rover-network/emissores.json')
  // o emissor revoga C DEPOIS de o relé subir: só a releitura periódica pode trazer isso
  estado.geradoEm = agora()
  estado.revogados = [{ emissor: emissor.chavePublica, uid: roverC.uid }]
  const inicio = Date.now()
  while (emissorFalso.pedidos.get('/.well-known/rover-network/emissores.json') === pedidosAntes) {
    if (Date.now() - inicio > 90_000) throw new Error('o relé não releu a lista em 90 segundos')
    await dormir(500)
  }
  const esperouS = (Date.now() - inicio) / 1000
  assert.ok(esperouS > 40 && esperouS < 80, `releu perto de um minuto depois (${esperouS} s)`)
  // a resposta chegou; dá um instante para o relé aplicar
  let r
  for (let i = 0; i < 20; i++) {
    r = await postar(rele, roverC, `tentativa ${i}`)
    if (r.status === 403) break
    await dormir(100)
  }
  assert.deepEqual([r.status, r.json.erro.codigo], [403, 'atestado_revogado'])
  assert.equal(await rele.parar(), 0)
  estado.revogados = []
})
