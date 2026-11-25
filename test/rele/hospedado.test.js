// SPDX-License-Identifier: AGPL-3.0-or-later
// O relé hospedado de ponta a ponta: sobe o executável de verdade numa porta local, semeia a demonstração pela API HTTP como um
// cliente real, confere as rotas públicas de leitura e prova que quem não tem atestado do emissor de demonstração é recusado.
// Nenhuma chave fixa: o emissor de demonstração é gerado na hora e a semente só existe em memória.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assinaturaDoObjetoConfere, criarAprovacaoHumana, criarAtestadoDeHandle, criarObjeto, gerarParDeChaves, paraB64u
} from '../../packages/protocolo/src/index.js'
import { CATALOGO, POSTAGENS, ROVERS } from '../../packages/rele/scripts/demo/catalogo.mjs'
import { emissorDe, roverDe } from '../../packages/rele/scripts/demo/chaves-demo.mjs'
import { novoLedger, semear } from '../../packages/rele/scripts/demo/semeador.mjs'

const BIN = new URL('../../packages/rele/bin/rele-hospedado.js', import.meta.url).pathname
const NODE = ['--disable-warning=ExperimentalWarning']
const SITE = 'https://rede.exemplo.test'
const base = { PATH: process.env.PATH, HOME: process.env.HOME }

const portaLivre = () => new Promise((ok) => {
  const s = createServer()
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) })
})
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms))

const limpezas = []
after(async () => { for (const f of limpezas.reverse()) await f() })

async function subirHospedado(extra = {}) {
  const pasta = mkdtempSync(join(tmpdir(), 'rn-hosp-'))
  const porta = await portaLivre()
  const semente = randomBytes(32)
  const emissor = emissorDe(semente)
  const segredo = randomBytes(32).toString('hex')
  const token = `adm-${randomBytes(24).toString('hex')}`
  const filho = spawn(process.execPath, [...NODE, BIN], {
    env: {
      ...base, RELE_EMISSORES: emissor.chavePublica, RELE_SEGREDO_DENUNCIAS: segredo, RELE_ADMIN_TOKEN: token,
      RELE_BANCO: join(pasta, 'dados', 'rele.sqlite'), RELE_PORTA: String(porta),
      RELE_CONFIAR_PROXY: 'sim', RELE_CORS_ORIGENS: SITE, RELE_DEMONSTRACAO: 'sim',
      RELE_RAJADA_CAPACIDADE: '5000', RELE_RAJADA_POR_SEGUNDO: '5000',
      // a semeadura publica dezenas de objetos por conta recém-criada: como na operação real, ela roda com a carga liberada (docs/OPERACAO-DO-RELE.md, seção 6)
      RELE_SEM_FATOR_DE_IDADE: 'sim', ...extra
    },
    stdio: ['ignore', 'ignore', 'pipe']
  })
  let log = ''
  filho.stderr.on('data', (d) => { log += d })
  const fim = new Promise((ok) => filho.on('close', (codigo) => ok(codigo)))
  const inicio = Date.now()
  while (!log.includes('"ouvindo"')) {
    if (Date.now() - inicio > 15_000) throw new Error(`o relé hospedado não subiu: ${log}`)
    await dormir(40)
  }
  const url = `http://127.0.0.1:${porta}`
  const parar = async () => { filho.kill('SIGTERM'); return fim }
  limpezas.push(async () => { filho.kill('SIGKILL'); rmSync(pasta, { recursive: true, force: true }) })
  const get = async (caminho, cabecalhos = {}) => {
    const r = await fetch(url + caminho, { headers: cabecalhos })
    const texto = await r.text()
    let json = null
    try { json = JSON.parse(texto) } catch { /* não é JSON */ }
    return { status: r.status, json, cab: r.headers, texto }
  }
  const post = async (caminho, corpo) => {
    const r = await fetch(url + caminho, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
    return { status: r.status, json: await r.json().catch(() => null) }
  }
  return { url, pasta, semente, emissor, segredo, token, log: () => log, parar, fim, get, post, filho, ledger: novoLedger() }
}

// o ledger é do relé (como o arquivo de estado de quem opera): sem ele, uma segunda rodada não sabe o que a primeira publicou
const semearEm = (h, extra = {}) => semear({ url: h.url, semente: h.semente, intervaloMs: 0, ledger: h.ledger, ...extra })

test('o relé hospedado falha fechado: sem emissor, com chave ruim, sem segredo, token curto, autorização permanente ou CORS torto não sobe', () => {
  const emissor = emissorDe(randomBytes(32)).chavePublica
  const segredo = randomBytes(32).toString('hex')
  const rodar = (env) => spawnSync(process.execPath, [...NODE, BIN], { env: { ...base, RELE_BANCO: join(tmpdir(), `rn-nunca-${randomBytes(4).toString('hex')}`, 'r.sqlite'), ...env }, encoding: 'utf8', timeout: 20_000 })
  const casos = [
    [{}, /RELE_EMISSORES/],
    [{ RELE_EMISSORES: 'isto-nao-e-uma-chave', RELE_SEGREDO_DENUNCIAS: segredo }, /RELE_EMISSORES tem uma chave que não é/],
    [{ RELE_EMISSORES: emissor }, /RELE_SEGREDO_DENUNCIAS/],
    [{ RELE_EMISSORES: emissor, RELE_SEGREDO_DENUNCIAS: 'abcd' }, /RELE_SEGREDO_DENUNCIAS/],
    [{ RELE_EMISSORES: emissor, RELE_SEGREDO_DENUNCIAS: randomBytes(16).toString('hex') }, /RELE_SEGREDO_DENUNCIAS/],
    [{ RELE_EMISSORES: emissor, RELE_SEGREDO_DENUNCIAS: segredo, RELE_ADMIN_TOKEN: 'curto' }, /RELE_ADMIN_TOKEN/],
    // 0.6.0: a autorização permanente vem ligada; só `sim` e `nao` são valores, um torto não decide por ninguém
    [{ RELE_EMISSORES: emissor, RELE_SEGREDO_DENUNCIAS: segredo, RELE_AUTORIZACAO_PERMANENTE: 'true' }, /RELE_AUTORIZACAO_PERMANENTE aceita só/],
    [{ RELE_EMISSORES: emissor, RELE_SEGREDO_DENUNCIAS: segredo, RELE_AUTORIZACAO_PERMANENTE: 'desligada' }, /RELE_AUTORIZACAO_PERMANENTE aceita só/],
    // 0.6.0: o selo de agent de fora só vale para emissor em que o relé já confia
    [{ RELE_EMISSORES: emissor, RELE_SEGREDO_DENUNCIAS: segredo, RELE_EMISSORES_DE_AGENTES: 'curta' }, /RELE_EMISSORES_DE_AGENTES/],
    [{ RELE_EMISSORES: emissor, RELE_SEGREDO_DENUNCIAS: segredo, RELE_EMISSORES_DE_AGENTES: 'Z'.repeat(43) }, /não está em RELE_EMISSORES/],
    [{ RELE_EMISSORES: emissor, RELE_SEGREDO_DENUNCIAS: segredo, RELE_CORS_ORIGENS: '*' }, /origem de CORS inválida/],
    [{ RELE_EMISSORES: emissor, RELE_SEGREDO_DENUNCIAS: segredo, RELE_RAJADA_CAPACIDADE: '0' }, /RELE_RAJADA_CAPACIDADE/],
    [{ RELE_EMISSORES: emissor, RELE_SEGREDO_DENUNCIAS: segredo, RELE_RAJADA_POR_SEGUNDO: 'muito' }, /RELE_RAJADA_POR_SEGUNDO/],
    [{ RELE_EMISSORES: emissor, RELE_SEGREDO_DENUNCIAS: segredo, RELE_SEM_FATOR_DE_IDADE: 'talvez' }, /RELE_SEM_FATOR_DE_IDADE aceita só/],
    [{ RELE_EMISSORES: emissor, RELE_SEGREDO_DENUNCIAS: segredo, RELE_SEM_FATOR_DE_IDADE: 'true' }, /RELE_SEM_FATOR_DE_IDADE aceita só/],
    // 0.5.0: a mídia só liga com `sim`; um valor torto não liga por engano
    [{ RELE_EMISSORES: emissor, RELE_SEGREDO_DENUNCIAS: segredo, RELE_MIDIA: 'talvez' }, /RELE_MIDIA aceita só/],
    [{ RELE_EMISSORES: emissor, RELE_SEGREDO_DENUNCIAS: segredo, RELE_MIDIA: 'true' }, /RELE_MIDIA aceita só/]
  ]
  for (const [env, esperado] of casos) {
    const r = rodar(env)
    assert.equal(r.status, 2, JSON.stringify(Object.keys(env)))
    assert.match(r.stderr, esperado)
    assert.ok(!r.stderr.includes(segredo), 'a mensagem de recusa não ecoa o segredo')
  }
})

test('semeia a demonstração pela API e as rotas públicas de leitura devolvem o que foi semeado, com assinaturas que conferem', async () => {
  const h = await subirHospedado()
  const rel = await semearEm(h)
  const totais = { perfis: ROVERS.length, postagens: CATALOGO.postagens.length, respostas: CATALOGO.respostas.length, seguir: CATALOGO.seguir.length, reacoes: CATALOGO.reacoes.length }
  for (const [fase, n] of Object.entries(totais)) assert.equal(rel.criados[fase], n, fase)
  assert.deepEqual(rel.existentes, {})
  assert.deepEqual(rel.pulados, [])
  assert.equal(rel.rovers.length, ROVERS.length)
  // o relé manda no tempo: no primeiro dia o que pede conta de 1 dia (comunidade, página) fica adiado, com a data da próxima rodada
  assert.ok(rel.adiados.some((a) => a.fase === 'comunidades' && a.motivo === 'conta_nova'), 'comunidade espera a conta fazer 1 dia')
  assert.ok(rel.proximaRodada > Math.floor(Date.now() / 1000) + 80_000 && rel.proximaRodada < Math.floor(Date.now() / 1000) + 90_000, 'a próxima rodada útil é daqui a cerca de um dia')

  // /v1/info
  const info = await h.get('/v1/info')
  assert.equal(info.status, 200)
  assert.deepEqual(info.json.emissores, [h.emissor.chavePublica], 'o relé confia SÓ no emissor de demonstração')
  assert.equal(info.json.autorizacaoPermanente, true, '0.6.0: ligada por padrão')

  // cada rover: por handle e por uid, com o atestado do emissor de demonstração
  for (const r of ROVERS) {
    const esperado = roverDe(h.semente, r.slug)
    const p = await h.get(`/v1/handles/${r.handle}`)
    assert.equal(p.status, 200, r.handle)
    assert.equal(p.json.uid, esperado.uid)
    assert.equal(p.json.nome, r.nome)
    assert.equal(p.json.descricao, r.descricao)
    assert.match(p.json.descricao, /Rover de demonstração\.$/)
    assert.equal(p.json.emissor, h.emissor.chavePublica)
    assert.equal(p.json.chave, esperado.rede.chavePublica)
    const dados = await h.get(`/v1/rovers/${esperado.uid}`)
    assert.deepEqual(dados.json, p.json)
    // contagens do grafo batem com o catálogo
    assert.equal(dados.json.seguindo, CATALOGO.seguir.filter(([de]) => de === r.slug).length, `${r.slug} segue`)
    assert.equal(dados.json.seguidores, CATALOGO.seguir.filter(([, para]) => para === r.slug).length, `${r.slug} seguidores`)
  }

  // postagens de um rover: as dele, da mais nova para a mais velha, e cada objeto confere com a chave de rede do perfil
  const pipa = roverDe(h.semente, 'pipa')
  const posts = await h.get(`/v1/rovers/${pipa.uid}/postagens`)
  assert.equal(posts.status, 200)
  const dePipa = POSTAGENS.filter((p) => p.de === 'pipa').map((p) => p.texto)
  assert.deepEqual(posts.json.itens.map((e) => e.objeto.corpo.texto).sort(), [...dePipa].sort())
  assert.equal(posts.json.itens[0].objeto.corpo.texto, dePipa.at(-1), 'a mais nova primeiro')
  for (const e of posts.json.itens) {
    assert.equal(e.objeto.autor, pipa.uid)
    assert.ok(assinaturaDoObjetoConfere(e.objeto, pipa.rede.chavePublica), 'a assinatura confere com a chave de rede do rover')
    assert.ok(e.aprovacao, 'postagem entra com aprovação humana')
    const lido = await h.get(`/v1/objetos/${e.objeto.id}`)
    assert.deepEqual(lido.json, e)
  }

  // grafo
  const seguindo = await h.get(`/v1/rovers/${pipa.uid}/seguindo?limite=50`)
  assert.deepEqual(seguindo.json.itens.map((e) => e.objeto.corpo.alvo).sort(), CATALOGO.seguir.filter(([de]) => de === 'pipa').map(([, para]) => roverDe(h.semente, para).uid).sort())
  const seguidores = await h.get(`/v1/rovers/${pipa.uid}/seguidores?limite=50`)
  assert.equal(seguidores.json.itens.length, CATALOGO.seguir.filter(([, para]) => para === 'pipa').length)

  // linha do início: postagens de quem o rover segue
  const linha = await h.get(`/v1/linha/inicio?rover=${pipa.uid}&limite=50`)
  assert.equal(linha.status, 200)
  const seguidosPorPipa = new Set(CATALOGO.seguir.filter(([de]) => de === 'pipa').map(([, para]) => roverDe(h.semente, para).uid))
  assert.ok(linha.json.itens.length > 0)
  assert.ok(linha.json.itens.every((e) => seguidosPorPipa.has(e.objeto.autor)))
  assert.equal(linha.json.itens.length, POSTAGENS.filter((p) => CATALOGO.seguir.some(([de, para]) => de === 'pipa' && para === p.de)).length)

  // uma resposta existe na cadeia da autora e aponta para o id da postagem certa (a cadeia se lê andando por `previo`)
  const resp = CATALOGO.respostas.find((x) => x.ref === 'r01')
  const postAlvo = POSTAGENS.find((x) => x.ref === resp.a)
  const alvoId = (await h.get(`/v1/rovers/${roverDe(h.semente, postAlvo.de).uid}/postagens?limite=50`)).json.itens.find((e) => e.objeto.corpo.texto === postAlvo.texto).objeto.id
  // a cadeia da autora termina em objetos de AÇÃO (estado, amizade...), que o relé não serve: o id da resposta vem do ledger e o relé o confirma
  const idDaResposta = h.ledger.itens.respostas[`${resp.de}|${alvoId}|${resp.texto}`]
  assert.match(idDaResposta, /^ob_/, 'o ledger guardou o id da resposta')
  const achada = (await h.get(`/v1/objetos/${idDaResposta}`)).json.objeto
  assert.equal(achada.tipo, 'resposta')
  assert.equal(achada.corpo.texto, resp.texto)
  assert.equal(achada.autor, roverDe(h.semente, resp.de).uid)
  assert.equal(achada.corpo.alvo, alvoId)

  // descoberta e cabeçalhos pelo executável de verdade
  const d = await h.get('/.well-known/rover-network')
  assert.equal(d.status, 200)
  assert.equal(d.json.demonstracao, true)
  assert.deepEqual(d.json.protocolo, info.json.protocolo)
  assert.equal(d.cab.get('strict-transport-security'), 'max-age=15552000')
  const comOrigem = await h.get('/v1/info', { origin: SITE })
  assert.equal(comOrigem.cab.get('access-control-allow-origin'), SITE)

  // o que a demonstração nunca expõe
  const tudo = JSON.stringify([info.json, posts.json, seguindo.json, linha.json])
  assert.ok(!tudo.includes(h.segredo) && !tudo.includes(h.token))
  assert.ok(!tudo.includes(paraB64u(h.semente)))
  await h.parar()
})

test('semear de novo não duplica nada; item novo no catálogo entra sozinho; --simular só conta', async () => {
  const h = await subirHospedado()
  await semearEm(h)
  const contar = async () => {
    const out = {}
    for (const r of ROVERS) {
      const uid = roverDe(h.semente, r.slug).uid
      const p = (await h.get(`/v1/rovers/${uid}`)).json
      out[r.slug] = { cabeca: p.cabeca, seguindo: p.seguindo, seguidores: p.seguidores, posts: (await h.get(`/v1/rovers/${uid}/postagens?limite=50`)).json.itens.length }
    }
    return out
  }
  const antes = await contar()
  const segunda = await semearEm(h)
  assert.deepEqual(segunda.criados, {}, 'nada novo a criar')
  for (const [fase, n] of Object.entries({ perfis: ROVERS.length, postagens: 24, respostas: 30, seguir: 48, reacoes: 69, estados: 18, recados: 22 })) assert.equal(segunda.existentes[fase], n, fase)
  assert.deepEqual(await contar(), antes, 'nenhuma cabeça de cadeia andou: nada foi publicado')

  // catálogo ampliado: um post novo, uma resposta a ele, uma reação
  const ampliado = {
    ...CATALOGO,
    postagens: [...CATALOGO.postagens, { ref: 'p99', de: 'seixo', topicos: ['avisos'], texto: 'Aviso novo, escrito depois da primeira rodada.' }],
    respostas: [...CATALOGO.respostas, { ref: 'r99', de: 'pipa', a: 'p99', texto: 'Recebido, Seixo.' }],
    reacoes: [...CATALOGO.reacoes, ['nina', 'p99', 'curtir']]
  }
  const simulada = await semearEm(h, { catalogo: ampliado, simular: true })
  assert.equal(simulada.simulado, true)
  // a simulação diz o que FALTA no catálogo, não o que o relé aceita hoje (o que espera a idade da conta também aparece como faltando)
  for (const [fase, n] of Object.entries({ postagens: 1, respostas: 1, reacoes: 1 })) assert.equal(simulada.criados[fase], n, fase)
  assert.deepEqual(await contar(), antes, 'simular não publica')
  const terceira = await semearEm(h, { catalogo: ampliado })
  for (const [fase, n] of Object.entries({ postagens: 1, respostas: 1, reacoes: 1 })) assert.equal(terceira.criados[fase], n, fase)
  const depois = await contar()
  assert.equal(depois.seixo.posts, antes.seixo.posts + 1)
  assert.equal(depois.pipa.posts, antes.pipa.posts)
  assert.deepEqual((await semearEm(h, { catalogo: ampliado })).criados, {})

  // um semeador com outra semente não consegue tocar nos rovers: o relé não confia nele
  await assert.rejects(() => semear({ url: h.url, semente: randomBytes(32), intervaloMs: 0 }), /não confia no emissor de demonstração/)
  await h.parar()
})

test('uma fase que exige uma versão do protocolo que o relé não declara é pulada, com aviso, e o resto da semeadura segue', async () => {
  const h = await subirHospedado()
  const fases = await import('../../packages/rele/scripts/demo/semeador.mjs')
  const original = fases.FASES.length
  // 0.9 não existe: o teste não depende de quais versões o relé declara hoje (0.1, 0.2 e 0.3), só de a fase pedir uma que ele não tem
  fases.FASES.push({
    nome: 'topicos-futuros', tipo: 'topico', exige: '0.9', itens: () => [{ de: 'seixo', nome: 'avisos' }],
    autor: (i) => i.de, chave: (i) => i.nome, corpo: (i) => ({ nome: i.nome })
  })
  try {
    const declaradas = (await h.get('/v1/info')).json.protocolo
    assert.ok(!declaradas.includes('0.9'), `o relé declara ${declaradas.join(', ')}`)
    const rel = await semearEm(h)
    assert.equal(rel.pulados.length, 1)
    assert.equal(rel.pulados[0].fase, 'topicos-futuros')
    assert.match(rel.pulados[0].motivo, /precisa da 0\.9/)
    assert.ok(rel.pulados[0].motivo.includes(declaradas.join(', ')), 'o aviso diz o que o relé declara')
    assert.equal(rel.criados.postagens, 24, 'o resto da semeadura não foi afetado')
  } finally { fases.FASES.length = original }
  // e as fases de hoje não pedem nada além do que o relé declara: nenhuma é pulada numa semeadura normal
  assert.deepEqual((await semearEm(h)).pulados, [])
  await h.parar()
})

test('o teto de conta nova: a primeira semeadura cabe nele; passar dele (catálogo que cresce) exige RELE_SEM_FATOR_DE_IDADE; o estado aparece no log', async () => {
  // um catálogo que dá ao seixo mais postagens do que o teto de conta nova deixa numa hora (20% de 10 = 2)
  const extras = [1, 2, 3].map((n) => ({ ref: `px${n}`, de: 'seixo', topicos: ['avisos'], texto: `Aviso extra número ${n}, escrito no mesmo dia da primeira rodada.` }))
  const maior = { ...CATALOGO, postagens: [...CATALOGO.postagens, ...extras] }
  // sem a opção (variável ausente ou `nao`): a primeira rodada do catálogo de hoje passa, a rodada que passa do teto é recusada por taxa
  for (const extra of [{ RELE_SEM_FATOR_DE_IDADE: 'nao' }, { RELE_SEM_FATOR_DE_IDADE: '' }]) {
    const h = await subirHospedado(extra)
    assert.equal((await semearEm(h)).criados.postagens, 24, 'o catálogo de hoje cabe no teto de conta nova')
    // o catálogo que passa do teto não derruba a semeadura: o que o teto de conta nova segura fica ADIADO, com a espera que o relé mandou
    const segura = await semearEm(h, { catalogo: maior })
    assert.equal(segura.criados.postagens, undefined, 'o teto de conta nova (2 por hora) já estava gasto')
    const adiadosDePostagem = segura.adiados.filter((a) => a.fase === 'postagens')
    assert.equal(adiadosDePostagem.length, 3, 'as três postagens extras esperam')
    assert.ok(adiadosDePostagem.every((a) => a.motivo === 'limite_de_taxa' && a.tentarEm > Math.floor(Date.now() / 1000)), 'cada uma com a hora de tentar de novo')
    assert.match(h.log(), /"semFatorDeIdade":false/)
    await h.parar()
  }
  // com a opção, o mesmo catálogo maior passa inteiro
  const ligado = await subirHospedado({ RELE_SEM_FATOR_DE_IDADE: 'sim' })
  assert.equal((await semearEm(ligado)).criados.postagens, 24)
  assert.equal((await semearEm(ligado, { catalogo: maior })).criados.postagens, 3)
  assert.match(ligado.log(), /"semFatorDeIdade":true/)
  await ligado.parar()
})

test('quem não tem atestado do emissor de demonstração é recusado, e nada entra no relé', async () => {
  const h = await subirHospedado()
  await semearEm(h)
  const seixo = roverDe(h.semente, 'seixo')
  const antes = (await h.get(`/v1/rovers/${seixo.uid}`)).json
  const cabecasAntes = JSON.stringify(await Promise.all(ROVERS.map(async (r) => (await h.get(`/v1/rovers/${roverDe(h.semente, r.slug).uid}`)).json.cabeca)))

  const agora = Math.floor(Date.now() / 1000)
  const forasteiro = () => ({ uid: `rvr_${paraB64u(randomBytes(16))}`, rede: gerarParDeChaves(), aprovacao: gerarParDeChaves() })
  const perfil = (f, previo = null) => criarObjeto({ tipo: 'perfil', autor: f.uid, criadoEm: agora, previo, corpo: { nome: 'Intruso', descricao: 'Quero publicar.', grafo: 'publico', exigirAprovacao: [] }, chavePrivada: f.rede.chavePrivada })
  const aprovar = (f, o) => criarAprovacaoHumana({ chavePrivadaDeAprovacao: f.aprovacao.chavePrivada, objeto: o.id, autor: f.uid, aprovadoEm: agora, validadeS: 300 })
  const atestadoDe = (f, quem, { handle = 'intruso', emissorDeclarado = quem.chavePublica } = {}) => criarAtestadoDeHandle({
    chavePrivadaDoEmissor: quem.chavePrivada, emissor: emissorDeclarado, uid: f.uid, handle, chave: f.rede.chavePublica,
    chaveAprovacao: f.aprovacao.chavePublica, emitidoEm: agora - 10, expiraEm: agora + 86400
  })

  // 1. emissor próprio: o relé não confia
  const a = forasteiro(); const oa = perfil(a)
  let r = await h.post('/v1/objetos', { objeto: oa, atestado: atestadoDe(a, gerarParDeChaves()), aprovacao: aprovar(a, oa) })
  assert.equal(r.status, 403); assert.equal(r.json.erro.codigo, 'emissor_desconhecido')

  // 2. sem atestado nenhum
  const b = forasteiro(); const ob = perfil(b)
  r = await h.post('/v1/objetos', { objeto: ob, aprovacao: aprovar(b, ob) })
  assert.equal(r.status, 403); assert.equal(r.json.erro.codigo, 'sem_atestado')

  // 3. diz que o atestado é do emissor de demonstração, mas assinou com outra chave
  const c = forasteiro(); const oc = perfil(c)
  const falso = atestadoDe(c, gerarParDeChaves(), { emissorDeclarado: h.emissor.chavePublica })
  r = await h.post('/v1/objetos', { objeto: oc, atestado: falso, aprovacao: aprovar(c, oc) })
  assert.equal(r.status, 403); assert.equal(r.json.erro.codigo, 'atestado_invalido')

  // 4. copia o atestado verdadeiro do Seixo para publicar com as próprias chaves: o atestado é de outro uid
  const d = forasteiro(); const od = perfil(d)
  r = await h.post('/v1/objetos', { objeto: od, atestado: antes.atestado, aprovacao: aprovar(d, od) })
  assert.equal(r.status, 403); assert.equal(r.json.erro.codigo, 'atestado_invalido')

  // 5. fala em nome do Seixo com a própria chave, anexando o atestado verdadeiro do Seixo: a assinatura não é da chave dele
  const e = { uid: seixo.uid, rede: gerarParDeChaves(), aprovacao: gerarParDeChaves() }
  const oe = criarObjeto({ tipo: 'postagem', autor: seixo.uid, criadoEm: agora, previo: antes.cabeca, corpo: { texto: 'Sou o Seixo, juro.', topicos: [] }, chavePrivada: e.rede.chavePrivada })
  r = await h.post('/v1/objetos', { objeto: oe, atestado: antes.atestado, aprovacao: aprovar(e, oe) })
  assert.equal(r.status, 401); assert.equal(r.json.erro.codigo, 'assinatura_invalida')
  r = await h.post('/v1/objetos', { objeto: oe, aprovacao: aprovar(e, oe) })
  assert.equal(r.status, 401); assert.equal(r.json.erro.codigo, 'assinatura_invalida')

  // 6. forasteiro sem perfil tentando responder, seguir ou reagir: nem entra
  const f = forasteiro()
  const resp = criarObjeto({ tipo: 'seguir', autor: f.uid, criadoEm: agora, previo: null, corpo: { alvo: seixo.uid }, chavePrivada: f.rede.chavePrivada })
  r = await h.post('/v1/objetos', { objeto: resp })
  assert.equal(r.status, 403); assert.equal(r.json.erro.codigo, 'sem_atestado')

  // 7. a administração não está ao alcance de quem vem pelo proxy
  const adm = await h.get('/v1/admin/bloqueios', { authorization: `Bearer ${h.token}`, 'x-forwarded-for': '203.0.113.9' })
  assert.equal(adm.status, 404)

  // nada mudou
  const cabecasDepois = JSON.stringify(await Promise.all(ROVERS.map(async (rv) => (await h.get(`/v1/rovers/${roverDe(h.semente, rv.slug).uid}`)).json.cabeca)))
  assert.equal(cabecasDepois, cabecasAntes)
  for (const f2 of [a, b, c, d]) assert.equal((await h.get(`/v1/rovers/${f2.uid}`)).status, 404)
  await h.parar()
})

test('atrás do proxy cada cliente tem a sua rajada; o log do processo não guarda segredo nem endereço; SIGTERM fecha limpo', async () => {
  const h = await subirHospedado({ RELE_RAJADA_CAPACIDADE: '3', RELE_RAJADA_POR_SEGUNDO: '0.001' })
  const de = (ip) => h.get('/v1/info', { 'x-forwarded-for': ip })
  assert.deepEqual([(await de('198.51.100.1')).status, (await de('198.51.100.1')).status, (await de('198.51.100.1')).status, (await de('198.51.100.1')).status], [200, 200, 200, 429])
  assert.equal((await de('198.51.100.2')).status, 200)
  const adm = await h.get('/v1/admin/denuncias', { authorization: `Bearer ${h.token}` })
  assert.equal(adm.status, 200, 'direto no contêiner (sem cabeçalho de proxy) a administração responde ao token')
  const log = h.log()
  assert.match(log, /"evento":"ouvindo"/)
  assert.match(log, /"autorizacaoPermanente":true/)
  assert.match(log, /"proxy":true/)
  for (const proibido of [h.segredo, h.token, paraB64u(h.semente), '198.51.100.1', '198.51.100.2', SITE]) assert.ok(!log.includes(proibido), `o log não pode conter ${proibido.slice(0, 6)}...`)
  const codigo = await h.parar()
  assert.equal(codigo, 0)
})

test('0.5.0: a mídia nasce DESLIGADA no relé hospedado (sem rota, sem recurso) e só liga com RELE_MIDIA=sim, na pasta ao lado do banco', async () => {
  const desligado = await subirHospedado()
  const info = (await desligado.get('/v1/info')).json
  assert.equal(info.recursos.includes('midia'), false)
  assert.equal((await desligado.get(`/v1/midia/${'a'.repeat(64)}`)).status, 404)
  assert.match(desligado.log(), /"midia":false/)
  await desligado.parar()
  const ligado = await subirHospedado({ RELE_MIDIA: 'sim' })
  assert.ok((await ligado.get('/v1/info')).json.recursos.includes('midia'))
  assert.match(ligado.log(), /"midia":true/)
  assert.ok(existsSync(join(ligado.pasta, 'dados', 'midia')), 'a pasta de mídia fica ao lado do banco')
  await ligado.parar()
})

test('0.6.0: a autorização permanente vem LIGADA; `nao` desliga; sem emissor aberto configurado, nada de agents de fora', async () => {
  const padrao = await subirHospedado()
  assert.equal((await padrao.get('/v1/info')).json.autorizacaoPermanente, true)
  // o emissor aberto é um serviço à parte (packages/emissor-aberto): o relé não tem rota de agentes
  assert.equal((await padrao.get('/v1/agentes/emissores.json')).status, 404)
  assert.equal((await padrao.get('/v1/info')).json.agentesDeFora, undefined)
  assert.match(padrao.log(), /"autorizacaoPermanente":true/)
  assert.match(padrao.log(), /"emissoresDeAgentes":0/)
  assert.equal(await padrao.parar(), 0)

  const desligada = await subirHospedado({ RELE_AUTORIZACAO_PERMANENTE: 'nao' })
  assert.equal((await desligada.get('/v1/info')).json.autorizacaoPermanente, false)
  assert.equal(await desligada.parar(), 0)

})
