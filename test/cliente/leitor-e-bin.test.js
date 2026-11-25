// SPDX-License-Identifier: AGPL-3.0-or-later
// O leitor anônimo nunca manda credencial, valida o endereço do relé e não deixa o que vem de fora virar outra rota; a linha de comando
// `rover-network` só lê, escolhe o relé por --rele, RN_RELE ou o padrão local, e não tem endereço de produção embutido.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LeitorDaRede, baseDoRele } from '../../packages/cliente/src/index.js'
import { RELE_PADRAO, executar } from '../../packages/cliente/bin/rover-network.js'
import { subir } from '../ajuda/servidor-de-teste.js'
import { publicar, roverRegistrado } from '../ajuda/rele-de-teste.js'
import { REVISAO_DO_RASCUNHO } from '../../packages/protocolo/src/index.js'

const fetchQueAnota = () => {
  const pedidos = []
  const f = async (url, init) => {
    pedidos.push({ url, init })
    return { ok: true, status: 200, json: async () => ({ itens: [], proximo: null, uid: 'rvr_x' }) }
  }
  return { f, pedidos }
}

test('baseDoRele: só http e https, sem usuário e senha, sem barra no fim', () => {
  assert.equal(baseDoRele('http://127.0.0.1:4747/'), 'http://127.0.0.1:4747')
  assert.equal(baseDoRele('https://rele.exemplo/base//'), 'https://rele.exemplo/base')
  for (const ruim of ['ftp://x', 'javascript:alert(1)', 'file:///etc/passwd', 'nada', 'https://a:b@rele.exemplo']) assert.throws(() => baseDoRele(ruim), TypeError, ruim)
})

test('LeitorDaRede: todo pedido é GET, sem Authorization e sem corpo; o que vem de fora é codificado no caminho', async () => {
  const { f, pedidos } = fetchQueAnota()
  const l = new LeitorDaRede({ base: 'http://rele.teste', fetchImpl: f })
  const chamadas = Object.getOwnPropertyNames(LeitorDaRede.prototype).filter((n) => n !== 'constructor')
  for (const n of chamadas) await l[n]('x/../admin?y=1', {})
  assert.ok(pedidos.length >= chamadas.length)
  for (const { url, init } of pedidos) {
    assert.equal(init.method, 'GET', url)
    assert.deepEqual(init.headers, {}, `${url} levou cabeçalho`)
    assert.equal(init.body, undefined)
    assert.ok(!url.includes('/../'), `segmento não codificado: ${url}`)
    assert.ok(!/\/v1\/admin/.test(url), url)
  }
  pedidos.length = 0
  await l.verHandle('@pipa')
  assert.equal(pedidos[0].url, 'http://rele.teste/v1/handles/pipa', 'o @ na frente é tirado')
  await l.linhaDe('rvr_x', { limite: 5, completo: true })
  assert.equal(pedidos[1].url, 'http://rele.teste/v1/linha/inicio?rover=rvr_x&completo=1&limite=5')
  await l.busca('planilha de prazos', { tipo: 'topicos' })
  assert.equal(pedidos[2].url, 'http://rele.teste/v1/busca?q=planilha%20de%20prazos&tipo=topicos')
})

test('LeitorDaRede contra um relé de verdade: perfil, linha, objeto, erro com código e grafo fechado', async (t) => {
  const s = await subir()
  t.after(s.fechar)
  const pipa = roverRegistrado(s.m, { handle: 'pipa' })
  const bento = roverRegistrado(s.m, { handle: 'bento' })
  const fechado = roverRegistrado(s.m, { handle: 'quieto', grafo: 'privado' })
  publicar(s.m, pipa, 'seguir', { alvo: bento.uid })
  const post = publicar(s.m, bento, 'postagem', { texto: 'Lista curta de prazos.', topicos: ['prazos'] })
  const l = new LeitorDaRede({ base: s.base })
  assert.equal((await l.info()).versaoDoRascunho, REVISAO_DO_RASCUNHO)
  assert.equal((await l.verHandle('pipa')).uid, pipa.uid)
  assert.deepEqual((await l.linhaDe(pipa.uid)).itens.map((i) => i.objeto.id), [post.objeto.id])
  assert.equal((await l.verObjeto(post.objeto.id)).objeto.corpo.texto, 'Lista curta de prazos.')
  await assert.rejects(l.verHandle('ninguem.aqui'), (e) => e.name === 'ErroDeRele' && e.status === 404 && e.codigo === 'nao_encontrado')
  await assert.rejects(l.seguindo(fechado.uid), (e) => e.status === 403 && e.codigo === 'grafo_privado')
  await assert.rejects(l.busca('a'), (e) => e.status === 422 && e.codigo === 'esquema' && e.campo === 'q')
})

test('rover-network: info, perfil, linha e buscar contra um relé de verdade; a saída é o JSON do relé', async (t) => {
  const s = await subir()
  t.after(s.fechar)
  const pipa = roverRegistrado(s.m, { handle: 'pipa' })
  const bento = roverRegistrado(s.m, { handle: 'bento' })
  publicar(s.m, pipa, 'seguir', { alvo: bento.uid })
  publicar(s.m, bento, 'postagem', { texto: 'Planilha de prazos nova.', topicos: ['prazos'] })
  const env = { RN_RELE: s.base }
  const info = await executar(['info'], { env })
  assert.equal(info.codigo, 0, info.erro)
  assert.equal(JSON.parse(info.saida).versaoDoRascunho, REVISAO_DO_RASCUNHO)
  assert.equal(JSON.parse((await executar(['perfil', '@pipa'], { env })).saida).uid, pipa.uid)
  const linha = JSON.parse((await executar(['linha', 'pipa', '--limite', '1'], { env })).saida)
  assert.equal(linha.itens.length, 1)
  assert.equal(linha.itens[0].objeto.autor, bento.uid)
  const busca = await executar(['buscar', 'planilha', 'de', 'prazos'], { env })
  assert.equal(busca.codigo, 0, busca.erro)
  assert.deepEqual(Object.keys(JSON.parse(busca.saida)).sort(), ['comunidades', 'paginas', 'rovers', 'topicos'])
  const falta = await executar(['perfil', 'ninguem.aqui'], { env })
  assert.deepEqual(falta, { codigo: 1, saida: '', erro: 'erro 404 nao_encontrado: Não encontrado.\n' })
  assert.equal((await executar(['info', '--rele', s.base], { env: { RN_RELE: 'http://127.0.0.1:1' } })).codigo, 0, '--rele vence RN_RELE')
})

test('rover-network: uso errado sai com 2 e a ajuda; relé fora do ar sai com 1 dizendo onde tentou; padrão é o relé local', async () => {
  for (const argv of [[], ['publicar', 'oi'], ['perfil'], ['linha'], ['buscar'], ['info', '--limite', '0'], ['info', '--rele'], ['info', '--chave', 'x'], ['info', '--rele', 'ftp://x']]) {
    const r = await executar(argv, { env: {} })
    assert.equal(r.codigo, 2, argv.join(' '))
    assert.equal(r.saida, '')
  }
  assert.match((await executar(['linha'], { env: {} })).erro, /não tem linha global/)
  const ajuda = await executar(['--help'], { env: {} })
  assert.equal(ajuda.codigo, 0)
  assert.match(ajuda.saida, /só leitura/)
  const fora = await executar(['info'], { env: { RN_RELE: 'http://127.0.0.1:1' } })
  assert.equal(fora.codigo, 1)
  assert.match(fora.erro, /^não consegui falar com o relé em http:\/\/127\.0\.0\.1:1/)
  const { f, pedidos } = fetchQueAnota()
  await executar(['info'], { env: {}, fetchImpl: f })
  assert.equal(pedidos[0].url, `${RELE_PADRAO}/v1/info`)
  assert.equal(RELE_PADRAO, 'http://127.0.0.1:4747')
})

test('nenhum endereço de produção embutido no bin nem no leitor; o bin não importa nada que assine', () => {
  for (const f of ['packages/cliente/bin/rover-network.js', 'packages/cliente/src/leitor.js']) {
    const fonte = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')
    for (const u of fonte.match(/https?:\/\/[a-z0-9][^\s'"`)]*/gi) ?? []) assert.match(u, /^http:\/\/127\.0\.0\.1:4747$/, `${f}: ${u}`)
  }
  const bin = readFileSync(new URL('../../packages/cliente/bin/rover-network.js', import.meta.url), 'utf8')
  assert.ok(!/ClienteRover|chavePrivada|criarObjeto|POST/.test(bin), 'a linha de comando é só de leitura')
})
