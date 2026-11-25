// SPDX-License-Identifier: AGPL-3.0-or-later
// A lista de revogados dos emissores lida pelo relé (packages/rele/src/revogados-do-emissor.js): configuração, busca por https com
// teto e prazo, forma da lista, fusão monotônica, idade da lista, disco, e o efeito no relé (objeto e credencial de leitura recusados
// com `atestado_revogado`). As buscas de rede vão a um emissor falso por https (test/ajuda/emissor-https.js) numa porta livre.
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createServer as criarTcp } from 'node:net'
import { gzipSync } from 'node:zlib'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EXIGE_APROVACAO, criarAtestadoDeHandle, criarCredencialDeLeitura, gerarParDeChaves } from '../../packages/protocolo/src/index.js'
import { Armazem } from '../../packages/rele/src/armazem.js'
import { criarServidor } from '../../packages/rele/src/http.js'
import { Rele } from '../../packages/rele/src/rele.js'
import {
  ErroDeRevogados, ProvedorComRevogadosDoEmissor, REVOGADOS, buscarJson, buscarListaDoEmissor, lerFontesDeRevogados, validarListaDeRevogados,
  validarUrlDeDescoberta
} from '../../packages/rele/src/revogados-do-emissor.js'
import { AGORA, aprovar, novoEmissor, novoRover, novoUid, objetoDe } from '../ajuda/mundo.js'
import { CAMINHO_LISTA, certificadoLocal, descobertaDoEmissor, listaDoEmissor, subirEmissorFalso } from '../ajuda/emissor-https.js'

const pastas = []
const pastaNova = () => { const p = mkdtempSync(join(tmpdir(), 'rn-revog-')); pastas.push(p); return p }
after(() => { for (const p of pastas) rmSync(p, { recursive: true, force: true }) })

const codigoAsync = async (promessa) => {
  try { await promessa; return 'ok' } catch (e) { if (e instanceof ErroDeRevogados) return e.codigo; throw e }
}
const codigoDe = (fn) => {
  try { fn(); return 'ok' } catch (e) { if (e?.codigo) return e.codigo; throw e }
}

// ====================================================================================================
// configuração
// ====================================================================================================

test('RELE_EMISSORES_DESCOBERTA: pares chave=URL, só https, sem credencial, chave confiável e sem repetir', () => {
  const a = novoEmissor().chavePublica
  const b = novoEmissor().chavePublica
  const u = 'https://api.exemplo.test/.well-known/rover-network'
  assert.deepEqual(lerFontesDeRevogados(undefined, [a]), [])
  assert.deepEqual(lerFontesDeRevogados('  ', [a]), [])
  assert.deepEqual(lerFontesDeRevogados(`${a}=${u}`, [a]), [{ emissor: a, url: u }])
  // a atual e a anterior de um mesmo emissor dividem a URL
  assert.deepEqual(lerFontesDeRevogados(` ${a}=${u} , ${b}=${u} `, [a, b]), [{ emissor: a, url: u }, { emissor: b, url: u }])
  const recusa = (texto, re) => assert.throws(() => lerFontesDeRevogados(texto, [a, b]), re)
  recusa(`${a}=http://api.exemplo.test/x`, /https/)
  recusa(`${a}=https://eu:segredo@api.exemplo.test/x`, /usuário nem senha/)
  recusa(`${a}=https://eu@api.exemplo.test/x`, /usuário nem senha/)
  recusa(`${a}=https://api.exemplo.test/x#frag`, /fragmento/)
  recusa(`${a}=nao e url`, /inválida/)
  recusa(`${a}=`, /vazia/)
  recusa(`${a}=https://a.test/${'x'.repeat(REVOGADOS.urlMaxCaracteres)}`, /longa/)
  recusa(u, /chave=URL/)
  recusa(`curta=${u}`, /43 caracteres/)
  recusa(`${novoEmissor().chavePublica}=${u}`, /RELE_EMISSORES/)
  recusa(`${a}=${u},${a}=${u}`, /duas vezes/)
  // a mensagem nunca repete a URL (que poderia levar segredo)
  try { lerFontesDeRevogados(`${a}=https://eu:segredo@api.exemplo.test/x`, [a]) } catch (e) { assert.ok(!e.message.includes('segredo')) }
  assert.equal(validarUrlDeDescoberta('https://API.Exemplo.test'), 'https://api.exemplo.test/')
})

// ====================================================================================================
// forma da lista
// ====================================================================================================

test('a lista: versao 1, geradoEm, emissores e pares exatamente { emissor, uid }; qualquer par torto derruba a lista inteira', () => {
  const e = novoEmissor().chavePublica
  const uid = novoUid()
  const boa = listaDoEmissor({ geradoEm: AGORA, emissores: [e], revogados: [{ emissor: e, uid }, { emissor: e, uid }] })
  assert.deepEqual(validarListaDeRevogados(boa), { geradoEm: AGORA, emissores: [e], revogados: [{ emissor: e, uid }] })
  // campos do topo que o relé não usa podem faltar ou sobrar
  const { protocolo, validadeMaxS, ...enxuta } = boa
  assert.equal(validarListaDeRevogados({ ...enxuta, extra: 1 }).revogados.length, 1)
  assert.ok(protocolo && validadeMaxS)
  const recusa = (l, campo) => {
    try { validarListaDeRevogados(l); assert.fail('aceitou') } catch (err) { assert.equal(err.codigo, 'lista'); assert.equal(err.campo, campo) }
  }
  recusa(null, undefined)
  recusa([], undefined)
  recusa({ ...boa, versao: 2 }, 'versao')
  recusa({ ...boa, geradoEm: String(AGORA) }, 'geradoEm')
  recusa({ ...boa, geradoEm: 1_600_000_000 }, 'geradoEm')
  recusa({ ...boa, geradoEm: 5_000_000_000 }, 'geradoEm')
  recusa({ ...boa, emissores: [] }, 'emissores')
  recusa({ ...boa, emissores: [{ chave: 'curta' }] }, 'emissores')
  recusa({ ...boa, emissores: Array.from({ length: REVOGADOS.emissoresMax + 1 }, () => ({ chave: e })) }, 'emissores')
  recusa({ ...boa, revogados: {} }, 'revogados')
  recusa({ ...boa, revogados: [{ emissor: e, uid, ate: 1 }] }, 'revogados')
  recusa({ ...boa, revogados: [{ emissor: e }] }, 'revogados')
  recusa({ ...boa, revogados: [{ emissor: e, uid: 'rvr_curto' }] }, 'revogados')
  recusa({ ...boa, revogados: [{ emissor: 'x', uid }] }, 'revogados')
  recusa({ ...boa, revogados: [{ emissor: e, uid }, 'lixo'] }, 'revogados')
  recusa({ ...boa, revogados: new Array(REVOGADOS.revogadosMax + 1).fill({ emissor: e, uid }) }, 'revogados')
  assert.equal(validarListaDeRevogados({ ...boa, revogados: new Array(REVOGADOS.revogadosMax).fill({ emissor: e, uid }) }).revogados.length, 1)
})

// ====================================================================================================
// busca por https de verdade
// ====================================================================================================

let cert
let emissorHttps
const estadoHttps = { geradoEm: AGORA, emissores: [], revogados: [] }
before(async () => {
  cert = certificadoLocal()
  estadoHttps.emissores = [novoEmissor().chavePublica]
  emissorHttps = await subirEmissorFalso(cert, estadoHttps)
})
after(async () => { await emissorHttps?.fechar(); cert?.apagar() })

test('busca por https: segue a descoberta até a lista da mesma origem, ou lê a lista direto', async () => {
  const uid = novoUid()
  estadoHttps.revogados = [{ emissor: estadoHttps.emissores[0], uid }]
  const pelaDescoberta = await buscarListaDoEmissor(emissorHttps.descoberta, { ca: cert.cert })
  assert.deepEqual(pelaDescoberta.revogados, [{ emissor: estadoHttps.emissores[0], uid }])
  const direto = await buscarListaDoEmissor(emissorHttps.lista, { ca: cert.cert })
  assert.deepEqual(direto, pelaDescoberta)
  estadoHttps.revogados = []
})

test('busca: a descoberta não leva a outra origem nem a um formato desconhecido', async () => {
  const e = estadoHttps.emissores
  for (const [nome, doc] of [
    ['outro-dono', descobertaDoEmissor({ emissores: e, lista: 'https://outro.exemplo.test/lista.json' })],
    ['protocolo-relativo', descobertaDoEmissor({ emissores: e, lista: '//outro.exemplo.test/lista.json' })],
    ['relativo-sem-barra', descobertaDoEmissor({ emissores: e, lista: 'lista.json' })],
    ['formato', { ...descobertaDoEmissor({ emissores: e }), formato: 'provisorio-2' }],
    ['rede', { ...descobertaDoEmissor({ emissores: e }), rede: 'outra' }]
  ]) {
    emissorHttps.rotas.set(`/d/${nome}`, (req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(doc)) })
    assert.equal(await codigoAsync(buscarListaDoEmissor(`${emissorHttps.base}/d/${nome}`, { ca: cert.cert })), 'descoberta', nome)
  }
})

test('busca: status, redirecionamento (não seguido), resposta grande (com e sem tamanho declarado), compressão, JSON torto', async () => {
  const r = emissorHttps.rotas
  r.set('/status', (req, res) => { res.writeHead(503); res.end() })
  r.set('/redireciona', (req, res) => { res.writeHead(302, { location: `${emissorHttps.base}${CAMINHO_LISTA}` }); res.end() })
  r.set('/grande', (req, res) => { res.writeHead(200, { 'content-length': 2048 }); res.end('x'.repeat(2048)) })
  r.set('/grande-sem-tamanho', (req, res) => { res.writeHead(200); for (let i = 0; i < 8; i++) res.write('x'.repeat(512)); res.end() })
  r.set('/no-limite', (req, res) => { const t = JSON.stringify({ a: 'x'.repeat(1014) }); res.writeHead(200); res.end(t) })
  r.set('/gzip', (req, res) => { res.writeHead(200, { 'content-encoding': 'gzip' }); res.end(gzipSync('{}')) })
  r.set('/nao-json', (req, res) => { res.writeHead(200); res.end('<html>') })
  const o = { ca: cert.cert, maxBytes: 1024 }
  const antes = emissorHttps.pedidos.get(CAMINHO_LISTA) ?? 0
  const erro = async (caminho) => { try { await buscarJson(emissorHttps.base + caminho, o); return 'ok' } catch (e) { return [e.codigo, e.status] } }
  assert.deepEqual(await erro('/status'), ['status', 503])
  assert.deepEqual(await erro('/redireciona'), ['redirecionamento', 302])
  assert.equal(emissorHttps.pedidos.get(CAMINHO_LISTA) ?? 0, antes, 'o redirecionamento não foi seguido')
  assert.deepEqual(await erro('/grande'), ['resposta_grande', undefined])
  assert.deepEqual(await erro('/grande-sem-tamanho'), ['resposta_grande', undefined])
  assert.deepEqual(await buscarJson(emissorHttps.base + '/no-limite', o), { a: 'x'.repeat(1014) }) // 1024 bytes exatos passam
  assert.deepEqual(await erro('/gzip'), ['codificacao', undefined])
  assert.deepEqual(await erro('/nao-json'), ['json_invalido', undefined])
  assert.deepEqual(await erro('/nao-existe'), ['status', 404])
})

test('busca: prazo curto, rede fora, certificado em que o sistema não confia e URL que não é https', async () => {
  emissorHttps.rotas.set('/lento', () => { /* nunca responde */ })
  const t0 = Date.now()
  assert.equal(await codigoAsync(buscarJson(`${emissorHttps.base}/lento`, { ca: cert.cert, prazoMs: 300 })), 'prazo')
  assert.ok(Date.now() - t0 < 3000, 'o prazo cortou a espera')
  // porta fechada: pega uma livre e não escuta nela
  const porta = await new Promise((ok) => { const s = criarTcp(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) }) })
  assert.equal(await codigoAsync(buscarJson(`https://127.0.0.1:${porta}/x`, { prazoMs: 2000 })), 'rede')
  // sem `ca`, o certificado autoassinado não é aceito: o TLS é conferido
  assert.equal(await codigoAsync(buscarJson(emissorHttps.lista, { prazoMs: 2000 })), 'rede')
  assert.equal(await codigoAsync(buscarJson(emissorHttps.lista.replace('https:', 'http:'), { ca: cert.cert })), 'url')
  assert.equal(await codigoAsync(buscarJson('https://eu:senha@127.0.0.1/x', { ca: cert.cert })), 'url')
  assert.equal(await codigoAsync(buscarJson('nao e url')), 'url')
})

// ====================================================================================================
// o provedor ligado a um relé
// ====================================================================================================

/** Um relé em memória com o provedor de revogados; `fila` é o que a busca falsa devolve, na ordem (um Error vira falha). */
function montar({ arquivo = null, idadeMaxS = 3600, fontesExtras = [], emissoresExtras = [] } = {}) {
  const emissor = novoEmissor()
  const relogio = { agora: AGORA }
  const fila = []
  const chamadas = []
  const log = []
  const url = 'https://emissor.exemplo.test/.well-known/rover-network'
  const buscar = async (u) => {
    chamadas.push(u)
    const proximo = fila.shift()
    if (proximo === undefined) throw new ErroDeRevogados('rede')
    if (proximo instanceof Error) throw proximo
    return validarListaDeRevogados(proximo)
  }
  const criarProvedor = () => new ProvedorComRevogadosDoEmissor({
    emissores: [emissor.chavePublica, ...emissoresExtras], fontes: [{ emissor: emissor.chavePublica, url }, ...fontesExtras], arquivo,
    relogio: () => relogio.agora, idadeMaxS, intervaloS: 300, registrar: (e) => log.push(e), buscar
  })
  const provedor = criarProvedor()
  const armazem = new Armazem(':memory:')
  const rele = new Rele({ armazem, provedor, relogio: () => relogio.agora, segredoDeDenuncias: randomBytes(32) })
  const lista = (revogados, { geradoEm = relogio.agora, emissores = [emissor.chavePublica] } = {}) => listaDoEmissor({ geradoEm, emissores, revogados })
  const par = (r) => ({ emissor: emissor.chavePublica, uid: r.uid })
  return { emissor, relogio, fila, chamadas, log, url, provedor, armazem, rele, lista, par, criarProvedor }
}

/** Rover registrado (perfil aceito com atestado) e com a cabeça da cadeia guardada. */
function registrar(x, { emissor = x.emissor } = {}) {
  const r = novoRover(emissor, { agora: x.relogio.agora })
  r.cabeca = null
  publicar(x, r, 'perfil', { nome: 'Pipa', descricao: 'Rover de teste.' }, { comAtestado: true })
  return r
}
function publicar(x, r, tipo, corpo, { comAtestado = false } = {}) {
  const objeto = objetoDe(r, tipo, corpo, { criadoEm: x.relogio.agora, previo: r.cabeca })
  const env = { objeto }
  if (comAtestado) env.atestado = r.atestado
  if (EXIGE_APROVACAO[tipo]) env.aprovacao = aprovar(r, objeto, { aprovadoEm: x.relogio.agora })
  const res = x.rele.aceitar(env)
  if (res.estado === 'aceito') r.cabeca = objeto.id
  return res
}
const postar = (x, r, texto = 'Uma postagem de teste.', o) => publicar(x, r, 'postagem', { texto, topicos: ['rovers'] }, o)
const reatestar = (x, r, emitidoEm) => {
  r.atestado = criarAtestadoDeHandle({
    chavePrivadaDoEmissor: r.emissor.chavePrivada, emissor: r.emissor.chavePublica, uid: r.uid, handle: r.handle,
    chave: r.rede.chavePublica, chaveAprovacao: r.aprovacao.chavePublica, emitidoEm, expiraEm: emitidoEm + 30 * 86400
  })
}
const credencial = (x, r, alvo, chavePrivada = r.rede.chavePrivada) =>
  ({ cabecalho: criarCredencialDeLeitura({ chavePrivada, uid: r.uid, alvo, t: x.relogio.agora }), metodo: 'GET', alvo })

test('lista lida: o relé recusa objeto e credencial de leitura do rover revogado com atestado_revogado, e o esconde', async () => {
  const x = montar()
  const a = registrar(x)
  const b = registrar(x)
  postar(x, b, 'antes da revogação')
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  assert.equal(codigoDe(() => postar(x, a)), 'atestado_revogado')
  assert.equal(codigoDe(() => postar(x, a, 'reanexa', { comAtestado: true })), 'atestado_revogado')
  assert.equal(codigoDe(() => x.rele.perfil(a.uid)), 'nao_encontrado')
  // credencial de leitura VÁLIDA do próprio rover revogado: ele fica sabendo o porquê
  assert.equal(codigoDe(() => x.rele.social.inicio({ credencial: credencial(x, a, '/v1/inicio') })), 'atestado_revogado')
  assert.equal(codigoDe(() => x.rele.postagensDe(b.uid, { completo: true, credencial: credencial(x, a, `/v1/rovers/${b.uid}/postagens?completo=1`) })), 'atestado_revogado')
  // rota própria (o caminho é do rover revogado)
  assert.equal(codigoDe(() => x.rele.social.notificacoesDe(a.uid, { credencial: credencial(x, a, `/v1/rovers/${a.uid}/notificacoes`) })), 'atestado_revogado')
  // quem NÃO tem a chave do rover não aprende nada: a mesma recusa de antes
  const outra = gerarParDeChaves().chavePrivada
  assert.equal(codigoDe(() => x.rele.social.inicio({ credencial: credencial(x, a, '/v1/inicio', outra) })), 'leitura_nao_autorizada')
  assert.equal(codigoDe(() => x.rele.social.notificacoesDe(a.uid, { credencial: credencial(x, a, `/v1/rovers/${a.uid}/notificacoes`, outra) })), 'nao_encontrado')
  assert.equal(codigoDe(() => x.rele.social.notificacoesDe(a.uid, {})), 'nao_encontrado')
  // o outro rover segue normal
  assert.equal(postar(x, b, 'depois').estado, 'aceito')
  assert.equal(x.rele.social.inicio({ credencial: credencial(x, b, '/v1/inicio') }).voce.uid, b.uid)
  const info = x.rele.info().revogados
  assert.equal(info.vigentes, 1)
  assert.equal(info.fontes[0].estado, 'em_dia')
  assert.equal(info.fontes[0].geradoEm, AGORA)
})

test('falha ao buscar NUNCA esvazia: a lista anterior continua valendo, com a falha contada', async () => {
  const x = montar()
  const a = registrar(x)
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  const versao = x.provedor.versao
  for (const codigo of ['rede', 'prazo', 'resposta_grande', 'status']) {
    x.relogio.agora += 300
    x.fila.push(new ErroDeRevogados(codigo, codigo === 'status' ? { status: 503 } : {}))
    await x.provedor.atualizar()
    assert.equal(x.provedor.estadoDosRevogados().fontes[0].ultimoErro, codigo)
    assert.equal(codigoDe(() => postar(x, a)), 'atestado_revogado', codigo)
  }
  // uma lista torta também é falha, não "lista vazia"
  x.fila.push({ versao: 1, geradoEm: x.relogio.agora, emissores: [{ chave: x.emissor.chavePublica }], revogados: [{ uid: a.uid }] })
  await x.provedor.atualizar()
  assert.equal(codigoDe(() => postar(x, a)), 'atestado_revogado')
  const f = x.provedor.estadoDosRevogados().fontes[0]
  assert.equal(f.falhasSeguidas, 5)
  assert.equal(f.ultimoErro, 'lista')
  assert.equal(f.geradoEm, AGORA)
  assert.equal(x.provedor.versao, versao, 'falha não mexe no conjunto')
  assert.deepEqual(x.provedor.revogados(), [x.par(a)])
  const falhas = x.log.filter((e) => e.evento === 'revogados_falha')
  assert.equal(falhas.length, 5)
  assert.equal(falhas.find((e) => e.erro === 'status').status, 503)
  // e o log não leva uid nem a URL inteira
  for (const e of x.log) assert.ok(!JSON.stringify(e).includes(a.uid) && !JSON.stringify(e).includes('.well-known'), JSON.stringify(e))
  // a falha se desfaz na próxima lista boa
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  assert.equal(x.provedor.estadoDosRevogados().fontes[0].falhasSeguidas, 0)
  assert.equal(x.provedor.estadoDosRevogados().fontes[0].ultimoErro, null)
})

test('monotônico: o par que some da lista continua revogando o atestado que ele revogou; atestado emitido depois volta a valer', async () => {
  const x = montar()
  const a = registrar(x) // atestado emitido em AGORA - 10
  x.relogio.agora += 60
  x.fila.push(x.lista([x.par(a)])) // geradoEm AGORA + 60
  await x.provedor.atualizar()
  x.relogio.agora += 60
  x.fila.push(x.lista([x.par(a)])) // AGORA + 120: o `ate` acompanha a última lista que trazia o par
  await x.provedor.atualizar()
  x.relogio.agora += 300
  x.fila.push(x.lista([])) // o emissor reabilitou o rover (ou a linha venceu): a lista nova o omite
  await x.provedor.atualizar()
  assert.deepEqual(x.provedor.revogados(), [{ ...x.par(a), ate: AGORA + 120 }])
  const info = x.rele.info().revogados
  assert.equal(info.vigentes, 0)
  assert.equal(info.lembrados, 1)
  // o atestado guardado (de antes da revogação) segue recusado, guardado ou reanexado
  assert.equal(codigoDe(() => postar(x, a)), 'atestado_revogado')
  assert.equal(codigoDe(() => x.rele.perfil(a.uid)), 'nao_encontrado')
  // atestado emitido ANTES do fim da revogação também (AGORA + 119 < ate)
  reatestar(x, a, AGORA + 119)
  assert.equal(codigoDe(() => postar(x, a, 'quase', { comAtestado: true })), 'atestado_revogado')
  // no instante exato da última lista que o trazia ainda é revogado? Não: `emitidoEm < ate` é a regra (ver OPERACAO-DO-RELE, seção 15)
  reatestar(x, a, AGORA + 120)
  assert.equal(postar(x, a, 'reabilitado', { comAtestado: true }).estado, 'aceito')
  assert.equal(x.rele.perfil(a.uid).atestado.emitidoEm, AGORA + 120)
  // e se o emissor voltar a listar, vale de novo contra qualquer atestado
  x.relogio.agora += 300
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  assert.equal(codigoDe(() => postar(x, a, 'de novo')), 'atestado_revogado')
})

test('uma lista só vale para as chaves ligadas à URL dela, e precisa ser do emissor configurado', async () => {
  const outro = novoEmissor()
  const x = montar({ emissoresExtras: [outro.chavePublica] })
  const a = registrar(x)
  const b = registrar(x, { emissor: outro })
  // a lista do emissor traz um rover do OUTRO emissor: ignorado
  x.fila.push(x.lista([x.par(a), { emissor: outro.chavePublica, uid: b.uid }]))
  await x.provedor.atualizar()
  assert.equal(codigoDe(() => postar(x, a)), 'atestado_revogado')
  assert.equal(postar(x, b).estado, 'aceito')
  assert.equal(x.log.find((e) => e.evento === 'revogados_atualizados').ignorados, 1)
  // lista de outro emissor servida no endereço configurado: recusada inteira, a anterior fica
  x.relogio.agora += 300
  x.fila.push(x.lista([], { emissores: [outro.chavePublica] }))
  await x.provedor.atualizar()
  assert.equal(x.provedor.estadoDosRevogados().fontes[0].ultimoErro, 'emissor_ausente')
  assert.equal(codigoDe(() => postar(x, a)), 'atestado_revogado')
})

test('lista mais velha que a última aceita, ou com data no futuro, é recusada sem tocar no estado', async () => {
  const x = montar()
  const a = registrar(x)
  x.fila.push(x.lista([x.par(a)], { geradoEm: AGORA }))
  await x.provedor.atualizar()
  x.relogio.agora += 600
  // um cache servindo a lista velha (sem o par) não solta o rover
  x.fila.push(x.lista([], { geradoEm: AGORA - 1 }))
  await x.provedor.atualizar()
  assert.equal(x.provedor.estadoDosRevogados().fontes[0].ultimoErro, 'lista_antiga')
  assert.deepEqual(x.provedor.revogados(), [x.par(a)])
  // a mesma lista de novo (mesmo geradoEm) é aceita
  x.fila.push(x.lista([x.par(a)], { geradoEm: AGORA }))
  await x.provedor.atualizar()
  assert.equal(x.provedor.estadoDosRevogados().fontes[0].ultimoErro, null)
  // data no futuro além da folga travaria as listas seguintes: recusada
  x.fila.push(x.lista([], { geradoEm: x.relogio.agora + REVOGADOS.futuroMaxS + 1 }))
  await x.provedor.atualizar()
  assert.equal(x.provedor.estadoDosRevogados().fontes[0].ultimoErro, 'lista_no_futuro')
  x.fila.push(x.lista([x.par(a)], { geradoEm: x.relogio.agora + REVOGADOS.futuroMaxS }))
  await x.provedor.atualizar()
  assert.equal(x.provedor.estadoDosRevogados().fontes[0].ultimoErro, null)
})

test('idade da lista: sem lista, em dia e velha; o alerta sai no log e em /v1/info', async () => {
  const x = montar({ idadeMaxS: 600 })
  let f = x.rele.info().revogados.fontes[0]
  assert.deepEqual([f.estado, f.idadeS, f.geradoEm, f.atualizadaEm], ['sem_lista', null, null, null])
  await x.provedor.atualizar() // a fila está vazia: falha
  assert.ok(x.log.some((e) => e.evento === 'revogados_lista_velha' && e.nivel === 'alerta' && e.estado === 'sem_lista'))
  x.fila.push(x.lista([], { geradoEm: AGORA - 100 }))
  await x.provedor.atualizar()
  f = x.rele.info().revogados.fontes[0]
  assert.deepEqual([f.estado, f.idadeS, f.geradoEm, f.atualizadaEm, f.url, f.emissores], ['em_dia', 100, AGORA - 100, AGORA, x.url, [x.emissor.chavePublica]])
  x.log.length = 0
  x.relogio.agora += 500 // idade 600: no limite ainda está em dia
  assert.equal(x.rele.info().revogados.fontes[0].estado, 'em_dia')
  x.relogio.agora += 1 // 601: velha
  assert.equal(x.rele.info().revogados.fontes[0].estado, 'velha')
  assert.equal(x.rele.info().revogados.fontes[0].idadeS, 601)
  await x.provedor.atualizar() // e a busca falha de novo
  const alerta = x.log.find((e) => e.evento === 'revogados_lista_velha')
  assert.deepEqual([alerta.nivel, alerta.estado, alerta.idadeS, alerta.idadeMaxS, alerta.falhasSeguidas], ['alerta', 'velha', 601, 600, 1])
  assert.deepEqual([x.rele.info().revogados.idadeMaxS, x.rele.info().revogados.intervaloS], [600, 300])
  // relé sem o provedor de revogados não ganha o campo
  const semFontes = new Rele({ armazem: new Armazem(':memory:'), provedor: new (await import('../../packages/rele/src/provedor.js')).ProvedorEstatico({ emissores: [x.emissor.chavePublica] }), segredoDeDenuncias: randomBytes(32) })
  assert.equal('revogados' in semFontes.info(), false)
})

test('disco: o estado sobrevive ao reinício (pares, lembrados, datas), em arquivo 0600; arquivo ilegível impede a subida', async () => {
  const pasta = pastaNova()
  const arquivo = join(pasta, 'revogados-dos-emissores.json')
  const x = montar({ arquivo })
  const a = registrar(x)
  const b = registrar(x)
  x.fila.push(x.lista([x.par(a), x.par(b)]))
  await x.provedor.atualizar()
  x.relogio.agora += 300
  x.fila.push(x.lista([x.par(a)])) // b vira lembrado com ate = AGORA
  await x.provedor.atualizar()
  assert.equal(statSync(arquivo).mode & 0o777, 0o600)
  assert.equal(existsSync(`${arquivo}.${process.pid}.novo`), false, 'o temporário sumiu na troca de nome')
  // "reinício": um provedor novo do mesmo arquivo, sem conseguir buscar nada
  const depois = x.criarProvedor()
  assert.deepEqual(depois.revogados().sort((p, q) => (p.uid < q.uid ? -1 : 1)), [x.par(a), { ...x.par(b), ate: AGORA }].sort((p, q) => (p.uid < q.uid ? -1 : 1)))
  const f = depois.estadoDosRevogados().fontes[0]
  assert.deepEqual([f.geradoEm, f.atualizadaEm], [AGORA + 300, AGORA + 300])
  await depois.atualizar() // falha (fila vazia): nada se perde
  assert.equal(depois.revogados().length, 2)
  // e um relé novo, sobre o mesmo banco, com o provedor recarregado, recusa os dois
  const rele2 = new Rele({ armazem: x.armazem, provedor: depois, relogio: () => x.relogio.agora, segredoDeDenuncias: randomBytes(32) })
  x.rele = rele2
  assert.equal(codigoDe(() => postar(x, a)), 'atestado_revogado')
  assert.equal(codigoDe(() => postar(x, b)), 'atestado_revogado')
  // par vigente de um emissor que deixou de ter fonte configurada vira lembrado (ninguém o atualizaria)
  const semFonte = new ProvedorComRevogadosDoEmissor({ emissores: [x.emissor.chavePublica], fontes: [], arquivo, relogio: () => x.relogio.agora })
  assert.deepEqual(semFonte.revogados().find((p) => p.uid === a.uid), { ...x.par(a), ate: AGORA + 300 })
  // ilegível: o relé não sobe (subir vazio esqueceria revogações)
  for (const torto of ['{', '[]', JSON.stringify({ formato: 'outro', fontes: [], pares: [] }),
    JSON.stringify({ formato: 'rover-network/revogados-dos-emissores/1', fontes: [], pares: [{ emissor: x.emissor.chavePublica, uid: a.uid, ate: '1', vigente: true }] }),
    JSON.stringify({ formato: 'rover-network/revogados-dos-emissores/1', fontes: [{ url: 1 }], pares: [] })]) {
    writeFileSync(arquivo, torto)
    assert.throws(() => x.criarProvedor(), /ilegível/)
  }
})

test('gravar falha: a memória continua certa e o log avisa', async () => {
  const pasta = pastaNova()
  const x = montar({ arquivo: join(pasta, 'nao-existe', 'revogados.json') })
  const a = registrar(x)
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  assert.deepEqual(x.provedor.revogados(), [x.par(a)])
  assert.ok(x.log.some((e) => e.evento === 'revogados_falha_ao_gravar' && e.nivel === 'alerta'))
  assert.equal(codigoDe(() => postar(x, a)), 'atestado_revogado')
})

test('limpar: só o operador esquece, e só o que a lista atual não traz', async () => {
  const pasta = pastaNova()
  const arquivo = join(pasta, 'revogados.json')
  const x = montar({ arquivo })
  const a = registrar(x)
  const b = registrar(x)
  x.fila.push(x.lista([x.par(a), x.par(b)]))
  await x.provedor.atualizar()
  x.relogio.agora += 300
  x.fila.push(x.lista([x.par(b)])) // a vira lembrado
  await x.provedor.atualizar()
  assert.deepEqual(x.provedor.limpar({ emissor: x.emissor.chavePublica, uid: b.uid }), { limpos: 0, vigentesMantidos: 1 })
  assert.deepEqual(x.provedor.limpar({ emissor: x.emissor.chavePublica, uid: novoUid() }), { limpos: 0, vigentesMantidos: 0 })
  assert.deepEqual(x.provedor.limpar({ emissor: x.emissor.chavePublica, uid: a.uid }), { limpos: 1, vigentesMantidos: 0 })
  assert.equal(postar(x, a, 'esquecido pelo operador').estado, 'aceito')
  assert.equal(codigoDe(() => postar(x, b)), 'atestado_revogado')
  assert.equal(x.criarProvedor().revogados().length, 1, 'a limpeza foi gravada')
  x.relogio.agora += 300
  x.fila.push(x.lista([]))
  await x.provedor.atualizar()
  assert.deepEqual(x.provedor.limpar({ tudo: true }), { limpos: 1, vigentesMantidos: 0 })
  assert.deepEqual(x.provedor.revogados(), [])
  assert.ok(x.log.some((e) => e.evento === 'revogados_limpos' && e.limpos === 1))
})

test('a rota de administração limpa (com credencial) e confere o corpo; sem o provedor de revogados, a rota não existe', async () => {
  const x = montar()
  const a = registrar(x)
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  x.relogio.agora += 300
  x.fila.push(x.lista([]))
  await x.provedor.atualizar()
  const token = randomBytes(24).toString('hex')
  const servidor = criarServidor({ rele: x.rele, tokenAdmin: token })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const url = `http://127.0.0.1:${servidor.address().port}/v1/admin/revogados/limpar`
  const post = async (corpo, auth = `Bearer ${token}`) => {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: auth }, body: JSON.stringify(corpo) })
    return [r.status, await r.json()]
  }
  try {
    assert.equal((await post({ tudo: true }, 'Bearer errado'))[0], 401)
    for (const torto of [{}, { tudo: false }, { tudo: 'sim' }, { tudo: true, uid: a.uid }, { emissor: x.emissor.chavePublica }, { emissor: 'x', uid: a.uid }, { emissor: x.emissor.chavePublica, uid: 'rvr_x' }, []]) {
      const [status, corpo] = await post(torto)
      assert.deepEqual([status, corpo.erro.codigo], [422, 'esquema'], JSON.stringify(torto))
    }
    assert.deepEqual(await post({ emissor: x.emissor.chavePublica, uid: a.uid }), [200, { limpos: 1, vigentesMantidos: 0 }])
    assert.equal(postar(x, a, 'liberado').estado, 'aceito')
    assert.deepEqual(await post({ tudo: true }), [200, { limpos: 0, vigentesMantidos: 0 }])
    const info = await (await fetch(`http://127.0.0.1:${servidor.address().port}/v1/info`)).json()
    assert.equal(info.revogados.fontes[0].estado, 'em_dia')
  } finally {
    await new Promise((ok) => servidor.close(ok))
  }
  const { ProvedorEstatico } = await import('../../packages/rele/src/provedor.js')
  const estatico = criarServidor({ rele: new Rele({ armazem: new Armazem(':memory:'), provedor: new ProvedorEstatico({ emissores: [x.emissor.chavePublica] }), segredoDeDenuncias: randomBytes(32) }), tokenAdmin: token })
  await new Promise((ok) => estatico.listen(0, '127.0.0.1', ok))
  try {
    const r = await fetch(`http://127.0.0.1:${estatico.address().port}/v1/admin/revogados/limpar`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: '{"tudo":true}' })
    assert.equal(r.status, 404)
  } finally {
    await new Promise((ok) => estatico.close(ok))
  }
})

test('duas leituras ao mesmo tempo viram uma; fontes que dividem a URL são buscadas uma vez; ligar() relê no intervalo', async (t) => {
  const anterior = novoEmissor()
  const x = montar({ emissoresExtras: [anterior.chavePublica], fontesExtras: [{ emissor: anterior.chavePublica, url: 'https://emissor.exemplo.test/.well-known/rover-network' }] })
  const a = registrar(x)
  const b = registrar(x, { emissor: anterior })
  x.fila.push(x.lista([x.par(a), { emissor: anterior.chavePublica, uid: b.uid }], { emissores: [x.emissor.chavePublica, anterior.chavePublica] }))
  await Promise.all([x.provedor.atualizar(), x.provedor.atualizar()])
  assert.equal(x.chamadas.length, 1)
  assert.equal(codigoDe(() => postar(x, b)), 'atestado_revogado', 'a chave anterior do mesmo emissor também revoga')
  assert.deepEqual(x.rele.info().revogados.fontes[0].emissores, [x.emissor.chavePublica, anterior.chavePublica])
  t.mock.timers.enable({ apis: ['setInterval'] })
  const parar = x.provedor.ligar()
  x.fila.push(x.lista([]))
  t.mock.timers.tick(299_000)
  assert.equal(x.chamadas.length, 1)
  t.mock.timers.tick(1_000)
  await new Promise((ok) => setImmediate(ok))
  assert.equal(x.chamadas.length, 2)
  parar()
  t.mock.timers.tick(600_000)
  assert.equal(x.chamadas.length, 2)
})

test('o relé de referência lê a lista de um emissor por https de verdade, do começo ao fim', async () => {
  const x = montar()
  const a = registrar(x)
  estadoHttps.emissores = [x.emissor.chavePublica]
  estadoHttps.geradoEm = x.relogio.agora
  estadoHttps.revogados = [x.par(a)]
  const provedor = new ProvedorComRevogadosDoEmissor({
    emissores: [x.emissor.chavePublica], fontes: lerFontesDeRevogados(`${x.emissor.chavePublica}=${emissorHttps.descoberta}`, [x.emissor.chavePublica]),
    relogio: () => x.relogio.agora, opcoesDeBusca: { ca: cert.cert }
  })
  await provedor.atualizar()
  x.rele = new Rele({ armazem: x.armazem, provedor, relogio: () => x.relogio.agora, segredoDeDenuncias: randomBytes(32) })
  assert.equal(codigoDe(() => postar(x, a)), 'atestado_revogado')
  assert.equal(provedor.estadoDosRevogados().fontes[0].estado, 'em_dia')
  estadoHttps.revogados = []
})

test('o arquivo de estado não guarda nada além de chaves públicas, uids revogados e datas', async () => {
  const pasta = pastaNova()
  const arquivo = join(pasta, 'r.json')
  const x = montar({ arquivo })
  const a = registrar(x)
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  const d = JSON.parse(readFileSync(arquivo, 'utf8'))
  assert.deepEqual(Object.keys(d).sort(), ['fontes', 'formato', 'pares'])
  assert.deepEqual(d.pares, [{ ...x.par(a), ate: AGORA, vigente: true }])
  assert.deepEqual(d.fontes, [{ url: x.url, emissores: [x.emissor.chavePublica], geradoEm: AGORA, atualizadaEm: AGORA }])
})

// ====================================================================================================
// bordas que o medidor de mutação cobrou (cada teste abaixo mata defeitos que sobreviviam à primeira bateria)
// ====================================================================================================

test('os números do leitor são os documentados em docs/OPERACAO-DO-RELE.md, seção 15', () => {
  assert.deepEqual({ ...REVOGADOS }, {
    intervaloPadraoMin: 5, intervaloMinimoMin: 1, intervaloMaximoMin: 1440, idadeMaxPadraoMin: 60, idadeMaxMaximaMin: 43200,
    prazoMs: 10_000, respostaMaxBytes: 16 * 1048576, urlMaxCaracteres: 2048, futuroMaxS: 300, revogadosMax: 100_000, emissoresMax: 16
  })
  assert.ok(Object.isFrozen(REVOGADOS))
})

test('configuração: bordas exatas', () => {
  const a = novoEmissor().chavePublica
  assert.deepEqual(lerFontesDeRevogados(null, [a]), [])
  // um item que começa por "=" tem chave vazia: o erro é o da chave, não o do formato
  assert.throws(() => lerFontesDeRevogados('=https://a.test/x', [a]), /43 caracteres/)
  const prefixo = 'https://a.test/'
  const noLimite = prefixo + 'x'.repeat(REVOGADOS.urlMaxCaracteres - prefixo.length)
  assert.equal(noLimite.length, REVOGADOS.urlMaxCaracteres)
  assert.equal(validarUrlDeDescoberta(noLimite), noLimite)
  assert.throws(() => validarUrlDeDescoberta(noLimite + 'x'), /longa/)
})

test('lista: bordas exatas de geradoEm, de emissores e de entrada que não é objeto', () => {
  const e = novoEmissor().chavePublica
  const l = (extra) => ({ ...listaDoEmissor({ geradoEm: AGORA, emissores: [e] }), ...extra })
  assert.equal(validarListaDeRevogados(l({ geradoEm: 1_700_000_000 })).geradoEm, 1_700_000_000)
  assert.equal(validarListaDeRevogados(l({ geradoEm: 4_102_444_800 })).geradoEm, 4_102_444_800)
  assert.equal(validarListaDeRevogados(l({ emissores: Array.from({ length: REVOGADOS.emissoresMax }, () => ({ chave: e })) })).emissores.length, REVOGADOS.emissoresMax)
  // uma lista com uma propriedade "chave" não é um emissor
  assert.throws(() => validarListaDeRevogados(l({ emissores: [Object.assign([], { chave: e })] })), (err) => err.campo === 'emissores')
})

test('busca: limites exatos de status e de tamanho, e tamanho declarado grande recusado sem esperar o corpo', async () => {
  const r = emissorHttps.rotas
  for (const s of [299, 300, 399, 400]) r.set(`/s${s}`, (req, res) => { res.writeHead(s); res.end() })
  const corpo1024 = JSON.stringify({ a: 'x'.repeat(1016) })
  assert.equal(Buffer.byteLength(corpo1024), 1024)
  r.set('/exato-declarado', (req, res) => { res.writeHead(200, { 'content-length': 1024 }); res.end(corpo1024) })
  r.set('/exato-em-pedacos', (req, res) => { res.writeHead(200); res.write(corpo1024.slice(0, 500)); res.end(corpo1024.slice(500)) })
  r.set('/declara-e-trava', (req, res) => { res.writeHead(200, { 'content-length': 5000 }); res.write('x'.repeat(10)) })
  const o = { ca: cert.cert, maxBytes: 1024, prazoMs: 1500 }
  const erro = async (caminho) => { try { await buscarJson(emissorHttps.base + caminho, o); return 'ok' } catch (e) { return `${e.codigo}:${e.status ?? ''}` } }
  assert.equal(await erro('/s299'), 'status:299')
  assert.equal(await erro('/s300'), 'redirecionamento:300')
  assert.equal(await erro('/s399'), 'redirecionamento:399')
  assert.equal(await erro('/s400'), 'status:400')
  assert.deepEqual(await buscarJson(emissorHttps.base + '/exato-declarado', o), { a: 'x'.repeat(1016) })
  assert.deepEqual(await buscarJson(emissorHttps.base + '/exato-em-pedacos', o), { a: 'x'.repeat(1016) })
  assert.equal(await erro('/declara-e-trava'), 'resposta_grande:')
  assert.equal(await codigoAsync(buscarJson('https://eu@127.0.0.1/x', { ca: cert.cert })), 'url')
})

test('busca: a descoberta não escapa da origem por barra invertida', async () => {
  const doc = descobertaDoEmissor({ emissores: estadoHttps.emissores, lista: '/\\outro.exemplo.test/lista.json' })
  emissorHttps.rotas.set('/d/barra-invertida', (req, res) => { res.writeHead(200); res.end(JSON.stringify(doc)) })
  assert.equal(await codigoAsync(buscarListaDoEmissor(`${emissorHttps.base}/d/barra-invertida`, { ca: cert.cert, prazoMs: 2000 })), 'descoberta')
})

test('provedor: padrões (relógio de verdade, 60 minutos de teto, 5 de intervalo) e estado inicial zerado', async () => {
  const e = novoEmissor().chavePublica
  const agoraReal = Math.floor(Date.now() / 1000)
  const p = new ProvedorComRevogadosDoEmissor({
    emissores: [e], fontes: [{ emissor: e, url: 'https://e.test/x' }],
    buscar: async () => validarListaDeRevogados(listaDoEmissor({ geradoEm: agoraReal, emissores: [e] }))
  })
  assert.equal(p.nome, 'descoberta')
  assert.deepEqual(p.emissoresConfiaveis(), [e])
  const zero = p.estadoDosRevogados()
  assert.deepEqual([zero.intervaloS, zero.idadeMaxS, zero.vigentes, zero.lembrados], [300, 3600, 0, 0])
  assert.deepEqual([zero.fontes[0].falhasSeguidas, zero.fontes[0].ultimoErro, zero.fontes[0].estado], [0, null, 'sem_lista'])
  await p.atualizar()
  const f = p.estadoDosRevogados().fontes[0]
  assert.equal(f.estado, 'em_dia')
  assert.ok(Math.abs(f.atualizadaEm - agoraReal) <= 5, `o relógio padrão é o de verdade, em segundos (${f.atualizadaEm})`)
  // sem arquivo configurado nada vai para o disco (nem para um arquivo chamado "null" na pasta atual)
  assert.equal(existsSync(join(process.cwd(), 'null')), false)
})

test('provedor: falha não grava; lista igual não mexe na versão; contagem de novos; idade zero; sem alerta em dia', async () => {
  const pasta = pastaNova()
  const arquivo = join(pasta, 'r.json')
  const x = montar({ arquivo })
  const a = registrar(x)
  await x.provedor.atualizar() // falha (fila vazia)
  assert.equal(existsSync(arquivo), false, 'falha não grava nada')
  x.fila.push(x.lista([x.par(a)]))
  x.log.length = 0
  await x.provedor.atualizar()
  assert.equal(x.provedor.estadoDosRevogados().fontes[0].idadeS, 0)
  assert.equal(x.log.some((e) => e.evento === 'revogados_lista_velha'), false, 'lista em dia não gera alerta')
  assert.equal(x.log.find((e) => e.evento === 'revogados_atualizados').novos, 1)
  // e um provedor SEM arquivo não tenta gravar nada
  const semArquivo = montar()
  semArquivo.fila.push(semArquivo.lista([]))
  await semArquivo.provedor.atualizar()
  assert.equal(semArquivo.provedor.estadoDosRevogados().fontes[0].estado, 'em_dia')
  assert.deepEqual(semArquivo.log.filter((e) => e.evento === 'revogados_falha_ao_gravar'), [])
  const versao = x.provedor.versao
  x.fila.push(x.lista([x.par(a)]))
  x.log.length = 0
  await x.provedor.atualizar()
  assert.equal(x.provedor.versao, versao, 'a mesma lista não força o relé a regravar a tabela')
  assert.equal(x.log.find((e) => e.evento === 'revogados_atualizados').novos, 0)
  assert.deepEqual(x.provedor.limpar({ tudo: true }), { limpos: 0, vigentesMantidos: 1 })
  assert.equal(x.provedor.versao, versao, 'limpar nada não muda a versão')
})

test('provedor: o relé relê a tabela a cada mudança (par que vira lembrado, lembrado que volta a valer contra tudo)', async () => {
  const x = montar()
  const a = registrar(x)
  x.relogio.agora += 60
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  assert.equal(codigoDe(() => postar(x, a)), 'atestado_revogado') // o relé já copiou a lista para a tabela
  x.relogio.agora += 60
  x.fila.push(x.lista([]))
  await x.provedor.atualizar()
  reatestar(x, a, AGORA + 61)
  assert.equal(postar(x, a, 'reatestado', { comAtestado: true }).estado, 'aceito', 'a tabela foi relida quando o par virou lembrado')
  // o emissor volta a listar: o par volta a valer contra QUALQUER atestado, até um emitido depois desta lista
  x.relogio.agora += 60
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  assert.deepEqual(x.provedor.revogados(), [x.par(a)])
  reatestar(x, a, x.relogio.agora + 30)
  assert.equal(codigoDe(() => postar(x, a, 'adiantado', { comAtestado: true })), 'atestado_revogado')
})

test('provedor: ligar() relê exatamente no intervalo', async (t) => {
  const x = montar()
  t.mock.timers.enable({ apis: ['setInterval'] })
  const parar = x.provedor.ligar()
  t.mock.timers.tick(299_999)
  assert.equal(x.chamadas.length, 0)
  t.mock.timers.tick(1)
  await new Promise((ok) => setImmediate(ok))
  assert.equal(x.chamadas.length, 1)
  parar()
})

test('disco: arquivo torto em cada campo impede a subida; as bordas válidas carregam', () => {
  const pasta = pastaNova()
  const arquivo = join(pasta, 'r.json')
  const e = novoEmissor().chavePublica
  const uid = novoUid()
  const formato = 'rover-network/revogados-dos-emissores/1'
  const fonte = (f) => ({ url: 'https://e.test/x', emissores: [e], geradoEm: AGORA, atualizadaEm: AGORA, ...f })
  const par = (p) => ({ emissor: e, uid, ate: AGORA, vigente: true, ...p })
  const abrir = (dados) => {
    writeFileSync(arquivo, JSON.stringify(dados))
    return new ProvedorComRevogadosDoEmissor({ emissores: [e], fontes: [{ emissor: e, url: 'https://e.test/x' }], arquivo, relogio: () => AGORA })
  }
  for (const [nome, dados] of [
    ['pares não é lista', { formato, fontes: [], pares: {} }],
    ['fontes não é lista', { formato, fontes: {}, pares: [] }],
    ['fonte nula', { formato, fontes: [null], pares: [] }],
    ['url não é texto', { formato, fontes: [fonte({ url: 1, geradoEm: null, atualizadaEm: null })], pares: [] }],
    ['geradoEm torto', { formato, fontes: [fonte({ geradoEm: 'x', atualizadaEm: null })], pares: [] }],
    ['atualizadaEm torto', { formato, fontes: [fonte({ geradoEm: null, atualizadaEm: 'x' })], pares: [] }],
    ['geradoEm quebrado', { formato, fontes: [fonte({ geradoEm: 1.5 })], pares: [] }],
    ['geradoEm negativo', { formato, fontes: [fonte({ geradoEm: -1 })], pares: [] }],
    ['par nulo', { formato, fontes: [], pares: [null] }],
    ['emissor em lista', { formato, fontes: [], pares: [par({ emissor: [e] })] }],
    ['emissor torto', { formato, fontes: [], pares: [par({ emissor: 'curto' })] }],
    ['uid em lista', { formato, fontes: [], pares: [par({ uid: [uid] })] }],
    ['uid torto', { formato, fontes: [], pares: [par({ uid: 'rvr_x' })] }],
    ['ate torto', { formato, fontes: [], pares: [par({ ate: 1.5 })] }],
    ['vigente torto', { formato, fontes: [], pares: [par({ vigente: 1 })] }]
  ]) {
    assert.throws(() => abrir(dados), /ilegível/, nome)
  }
  // bordas válidas: fonte que nunca leu (nulos) e instante zero
  assert.equal(abrir({ formato, fontes: [fonte({ geradoEm: null, atualizadaEm: null })], pares: [] }).estadoDosRevogados().fontes[0].estado, 'sem_lista')
  assert.equal(abrir({ formato, fontes: [fonte({ geradoEm: 0, atualizadaEm: 0 })], pares: [par({})] }).estadoDosRevogados().fontes[0].geradoEm, 0)
})

test('armazém: a consulta de revogação exige o instante de emissão do atestado', () => {
  const a = new Armazem(':memory:')
  assert.throws(() => a.revogado(novoEmissor().chavePublica, novoUid()), /emitidoEm é obrigatório/)
  assert.throws(() => a.revogado(novoEmissor().chavePublica, novoUid(), String(AGORA)), /emitidoEm é obrigatório/)
  assert.equal(a.revogado(novoEmissor().chavePublica, novoUid(), AGORA), false)
})

test('credencial de leitura: rover desconhecido, que saiu ou com atestado vencido continua com a resposta de antes', async () => {
  const x = montar()
  const a = registrar(x)
  const b = registrar(x)
  const c = registrar(x)
  // rover que nunca existiu neste relé
  const fantasma = novoRover(x.emissor, { agora: x.relogio.agora })
  assert.equal(codigoDe(() => x.rele.social.inicio({ credencial: credencial(x, fantasma, '/v1/inicio') })), 'leitura_nao_autorizada')
  // atestado vencido, NÃO revogado: credencial válida, mas a resposta segue a de antes
  x.armazem.executar('UPDATE rovers SET atestado_expira_em = :t WHERE uid = :uid', { t: x.relogio.agora - 1, uid: c.uid })
  assert.equal(codigoDe(() => x.rele.social.inicio({ credencial: credencial(x, c, '/v1/inicio') })), 'leitura_nao_autorizada')
  // revogado e que saiu da rede: a saída vale mais (nada de "revogado" para quem não está mais aqui)
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  assert.equal(codigoDe(() => postar(x, a)), 'atestado_revogado')
  x.armazem.executar('UPDATE rovers SET saiu = 1 WHERE uid = :uid', { uid: a.uid })
  assert.equal(codigoDe(() => x.rele.social.inicio({ credencial: credencial(x, a, '/v1/inicio') })), 'leitura_nao_autorizada')
  // a rota própria de um rover visível: o dono lê, outro rover não, sem credencial é 401
  const alvo = `/v1/rovers/${b.uid}/notificacoes`
  assert.ok(Array.isArray(x.rele.social.notificacoesDe(b.uid, { credencial: credencial(x, b, alvo) }).itens))
  assert.equal(codigoDe(() => x.rele.social.notificacoesDe(b.uid, {})), 'leitura_nao_autorizada')
  const d = registrar(x)
  assert.equal(codigoDe(() => x.rele.social.notificacoesDe(b.uid, { credencial: credencial(x, d, alvo) })), 'sem_permissao')
})

test('a rota de administração: { tudo: true } limpa os lembrados e corpo nulo é recusado sem erro interno', async () => {
  const x = montar()
  const a = registrar(x)
  x.fila.push(x.lista([x.par(a)]))
  await x.provedor.atualizar()
  x.relogio.agora += 300
  x.fila.push(x.lista([]))
  await x.provedor.atualizar()
  const token = randomBytes(24).toString('hex')
  const servidor = criarServidor({ rele: x.rele, tokenAdmin: token })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const url = `http://127.0.0.1:${servidor.address().port}/v1/admin/revogados/limpar`
  const post = async (texto) => {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: texto })
    return [r.status, await r.json()]
  }
  try {
    for (const texto of ['null', '"tudo"', '5', 'true']) assert.equal((await post(texto))[0], 422, texto)
    assert.deepEqual(await post('{"tudo":true}'), [200, { limpos: 1, vigentesMantidos: 0 }])
  } finally {
    await new Promise((ok) => servidor.close(ok))
  }
})
