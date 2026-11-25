// SPDX-License-Identifier: AGPL-3.0-or-later
// O cliente HTTP do semeador e as guardas dele, contra um relé FALSO que responde o que o teste manda: retentativa com espera
// crescente, ritmo entre pedidos, 429 com Retry-After, 5xx, cadeia lida só até onde o relé serve, e o que o semeador faz com a hora
// da cabeça da cadeia. O comportamento contra o relé de verdade está em semeador-03.test.js.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { emissorDe } from '../../packages/rele/scripts/demo/chaves-demo.mjs'
import { ErroDeSemeadura, novoLedger, semear } from '../../packages/rele/scripts/demo/semeador.mjs'

const semente = randomBytes(32)
const emissor = emissorDe(semente)
const T = 1_900_000_000
const SEIXO = { slug: 'seixo', handle: 'seixo', nome: 'Seixo', descricao: 'O primeiro. Rover de demonstração.' }
const CAT = { versao: 2, rovers: [SEIXO], postagens: [], respostas: [], seguir: [], reacoes: [] }
const resp = (status, corpo = {}, cab = {}) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...cab } })
const INFO = { protocolo: ['0.1', '0.2', '0.3'], emissores: [emissor.chavePublica] }

/** Roteiro por pedido: `quem(metodo, caminho, n, corpo)` devolve uma Response (ou lança, como uma falha de rede). */
function falso(quem) {
  const pedidos = []
  const fetchFn = async (url, init = {}) => {
    const u = new URL(url)
    const metodo = init.method ?? 'GET'
    const corpo = init.body ? JSON.parse(init.body) : undefined
    const n = pedidos.filter((p) => p.metodo === metodo && p.caminho === u.pathname).length + 1
    pedidos.push({ metodo, caminho: u.pathname, corpo })
    return quem(metodo, u.pathname, n, corpo)
  }
  return { fetchFn, pedidos }
}
const base = (extra) => (metodo, caminho, n, corpo) => {
  if (metodo === 'GET' && caminho === '/v1/info') return resp(200, INFO)
  if (metodo === 'GET' && caminho.startsWith('/v1/rovers/')) return resp(404)
  if (metodo === 'POST' && caminho === '/v1/objetos') return resp(201, { estado: 'aceito' })
  return extra?.(metodo, caminho, n, corpo) ?? resp(404)
}
// por padrão estes testes aceitam um ledger vazio: o que eles medem é o cliente e a leitura da cadeia, não a guarda do ledger perdido
const rodar = (f, { esperar, intervaloMs = 0, ledger = novoLedger(), catalogo = CAT, aceitarSemLedger = true, ...resto } = {}) =>
  semear({ url: 'http://relay.exemplo', semente, catalogo, fetchFn: f.fetchFn, esperar, intervaloMs, relogio: () => T, ledger, aceitarSemLedger, ...resto })
const esperas = () => { const l = []; return { l, esperar: (ms) => { l.push(ms); return Promise.resolve() } } }

test('falha de rede: tenta de novo com espera crescente (500, 1000, 1500) e desiste na quarta, dizendo onde', async () => {
  const w = esperas()
  const f = falso(() => { throw new Error('ECONNRESET') })
  await assert.rejects(() => rodar(f, w), (e) => e instanceof ErroDeSemeadura && /sem resposta do relé em GET \/v1\/info/.test(e.message))
  assert.deepEqual(w.l, [500, 1000, 1500])
  assert.equal(f.pedidos.length, 4)
  // se a terceira tentativa responde, a semeadura segue
  const w2 = esperas()
  let falhas = 0
  const g = falso((m, c, n, corpo) => { if (c === '/v1/info' && falhas++ < 2) throw new Error('ECONNRESET'); return base()(m, c, n, corpo) })
  await rodar(g, w2)
  assert.deepEqual(w2.l, [500, 1000])
})

test('o ritmo entre pedidos: o segundo pedido espera quase o intervalo inteiro, nunca mais que ele', async () => {
  const w = esperas()
  await rodar(falso(base()), { ...w, intervaloMs: 1000 })
  assert.ok(w.l.length >= 1)
  assert.ok(w.l.every((ms) => ms > 900 && ms <= 1000), JSON.stringify(w.l))
  // sem intervalo, ninguém espera
  const w0 = esperas()
  await rodar(falso(base()), w0)
  assert.deepEqual(w0.l, [])
})

test('5xx: repete o pedido até a quarta tentativa (500, 1000, 1500) e depois diz o status; 499 não repete', async () => {
  const w = esperas()
  const f = falso(base((m, c) => (m === 'POST' ? resp(503) : undefined)))
  const quatro = falso((m, c, n, corpo) => (m === 'POST' ? resp(503) : base()(m, c, n, corpo)))
  await assert.rejects(() => rodar(quatro, w), /o relé recusou perfil do rover seixo: 503/)
  assert.deepEqual(w.l, [500, 1000, 1500])
  assert.equal(quatro.pedidos.filter((p) => p.metodo === 'POST').length, 4)
  void f
  // 500 exato também repete; 499 não
  const w5 = esperas()
  const quinhentos = falso((m, c, n, corpo) => (m === 'POST' && n < 3 ? resp(500) : base()(m, c, n, corpo)))
  await rodar(quinhentos, w5)
  assert.deepEqual(w5.l, [500, 1000])
  const w4 = esperas()
  const quatrocentos = falso((m, c, n, corpo) => (m === 'POST' ? resp(499) : base()(m, c, n, corpo)))
  await assert.rejects(() => rodar(quatrocentos, w4), /o relé recusou perfil do rover seixo: 499/)
  assert.deepEqual(w4.l, [])
})

test('429: espera o Retry-After (limitado a 30 segundos), 1 segundo sem cabeçalho, e acima de 120 segundos não espera: adia', async () => {
  const com = async (cabecalho) => {
    const w = esperas()
    await rodar(falso((m, c, n, corpo) => (m === 'POST' && n === 1 ? resp(429, { erro: { codigo: 'limite_de_taxa' } }, cabecalho) : base()(m, c, n, corpo))), w)
    return w.l
  }
  assert.deepEqual(await com({ 'retry-after': '2' }), [2000])
  assert.deepEqual(await com({}), [1000])
  assert.deepEqual(await com({ 'retry-after': '45' }), [30_000])
  assert.deepEqual(await com({ 'retry-after': '120' }), [30_000])
  assert.deepEqual(await com({ 'retry-after': '1' }), [1000])
  // acima de 120 s: nenhuma espera; o perfil não pode ser adiado, então a rodada para dizendo isso
  const w = esperas()
  await assert.rejects(
    () => rodar(falso((m, c, n, corpo) => (m === 'POST' ? resp(429, { erro: { codigo: 'limite_de_taxa' } }, { 'retry-after': '121' }) : base()(m, c, n, corpo))), w),
    /o relé adiou o perfil do rover seixo/
  )
  assert.deepEqual(w.l, [])
})

test('429 sem fim: espera 12 vezes e na seguinte devolve o 429 para a fase decidir', async () => {
  const w = esperas()
  const f = falso((m, c, n, corpo) => (m === 'POST' ? resp(429, { erro: { codigo: 'limite_de_taxa' } }, { 'retry-after': '1' }) : base()(m, c, n, corpo)))
  await assert.rejects(() => rodar(f, w), /o relé adiou o perfil/)
  assert.equal(w.l.length, 12)
  assert.equal(f.pedidos.filter((p) => p.metodo === 'POST').length, 13)
})

test('as guardas de entrada: o endereço precisa ser um relé que confia no emissor desta semente', async () => {
  const sem = (m, c, n, corpo) => base()(m, c, n, corpo)
  await assert.rejects(() => rodar(falso((m, c) => (c === '/v1/info' ? resp(404) : sem(m, c)))), /não respondeu como um relé da Rover Network/)
  await assert.rejects(() => rodar(falso((m, c) => (c === '/v1/info' ? resp(200, { emissores: [emissor.chavePublica] }) : sem(m, c)))), /não respondeu como um relé/)
  await assert.rejects(() => rodar(falso((m, c) => (c === '/v1/info' ? resp(200, { protocolo: ['0.3'], emissores: ['outra'] }) : sem(m, c)))), /não confia no emissor de demonstração/)
  await assert.rejects(() => rodar(falso((m, c) => (c === '/v1/info' ? resp(200, { protocolo: ['0.3'] }) : sem(m, c)))), /não confia no emissor de demonstração/)
})

test('o catálogo só pode citar rovers que existem: autor e alvo', async () => {
  await assert.rejects(() => rodar(falso(base()), { catalogo: { ...CAT, postagens: [{ ref: 'p1', de: 'fantasma', topicos: ['a'], texto: 'Texto de quem não existe.' }] } }), /cita o rover "fantasma", que não existe em rovers/)
  await assert.rejects(() => rodar(falso(base()), { catalogo: { ...CAT, seguir: [['seixo', 'fantasma']] } }), /cita o rover "fantasma", que não existe em rovers/)
})

test('ler o rover: só 200 e 404 são respostas; o resto interrompe com o status', async () => {
  await assert.rejects(() => rodar(falso((m, c, n, corpo) => (c.startsWith('/v1/rovers/') ? resp(403) : base()(m, c, n, corpo)))), /não consegui ler o rover seixo \(status 403\)/)
})

const rover = (cabeca, atestadoExpira = T + 90 * 86400) => resp(200, { cabeca, atestado: { expiraEm: atestadoExpira }, perfil: { corpo: { nome: 'Outro', descricao: 'Perfil diferente, para obrigar a publicar de novo.', grafo: 'publico', exigirAprovacao: [] } } })

test('a cadeia é lida até 2000 objetos; no 2001º o semeador desiste', async () => {
  const cadeia = (tamanho) => falso((m, c, n, corpo) => {
    if (c.startsWith('/v1/rovers/')) return rover('ob_0')
    const mo = /^\/v1\/objetos\/ob_(\d+)$/.exec(c)
    if (mo) { const i = Number(mo[1]); return resp(200, { objeto: { id: `ob_${i}`, tipo: 'seguir', criadoEm: T - 100, previo: i + 1 < tamanho ? `ob_${i + 1}` : null, corpo: { alvo: 'rvr_x' } } }) }
    return base()(m, c, n, corpo)
  })
  await rodar(cadeia(2000))
  await assert.rejects(() => rodar(cadeia(2001)), /a cadeia do rover seixo é longa demais para ler/)
})

test('objeto da cadeia: 404 e 410 encerram a leitura sem erro; qualquer outra falha interrompe', async () => {
  for (const status of [404, 410]) {
    const f = falso((m, c, n, corpo) => (c.startsWith('/v1/rovers/') ? rover('ob_0') : c.startsWith('/v1/objetos/') ? resp(status) : base()(m, c, n, corpo)))
    await rodar(f)
  }
  await assert.rejects(
    () => rodar(falso((m, c, n, corpo) => (c.startsWith('/v1/rovers/') ? rover('ob_0') : c.startsWith('/v1/objetos/') ? resp(403) : base()(m, c, n, corpo)))),
    /não consegui ler um objeto da cadeia do rover seixo \(status 403\)/
  )
})

test('a hora do próximo objeto nunca anda para trás: vem da cabeça lida, do ledger ou, sem nenhum dos dois, de agora', async () => {
  const primeiroPost = (f) => f.pedidos.find((p) => p.metodo === 'POST').corpo.objeto.criadoEm
  // cabeça legível 10 s atrás: o objeto novo leva essa hora, não a de 5 minutos atrás
  const legivel = falso((m, c, n, corpo) => {
    if (c.startsWith('/v1/rovers/')) return rover('ob_0')
    if (c === '/v1/objetos/ob_0') return resp(200, { objeto: { id: 'ob_0', tipo: 'postagem', criadoEm: T - 10, previo: null, corpo: { texto: 'x' } } })
    return base()(m, c, n, corpo)
  })
  await rodar(legivel)
  assert.equal(primeiroPost(legivel), T - 10)
  // cabeça ilegível (ação), mas o ledger sabe a hora dela
  const ledger = novoLedger()
  ledger.itens.estados = { 'seixo|x': true }
  ledger.rovers.seixo = { ultimoCriado: T - 10 }
  const doLedger = falso((m, c, n, corpo) => (c.startsWith('/v1/rovers/') ? rover('ob_0') : c.startsWith('/v1/objetos/') ? resp(404) : base()(m, c, n, corpo)))
  await rodar(doLedger, { ledger })
  assert.equal(primeiroPost(doLedger), T - 10)
  // cabeça ilegível e ledger sem nada sobre ela: agora
  const nenhum = falso((m, c, n, corpo) => (c.startsWith('/v1/rovers/') ? rover('ob_0') : c.startsWith('/v1/objetos/') ? resp(404) : base()(m, c, n, corpo)))
  await rodar(nenhum, { aceitarSemLedger: true })
  assert.equal(primeiroPost(nenhum), T)
  // rover novo: a hora é a de 5 minutos atrás mais a contagem de objetos desta rodada (0 no primeiro)
  const novo = falso(base())
  await rodar(novo)
  assert.equal(primeiroPost(novo), T - 300)
})

test('o relé que já tem rovers desta semeadura e um ledger vazio é recusado, a menos que o chamador aceite explicitamente', async () => {
  const existente = () => falso((m, c, n, corpo) => (c.startsWith('/v1/rovers/') ? rover(null) : base()(m, c, n, corpo)))
  await assert.rejects(() => rodar(existente(), { aceitarSemLedger: false }), /o registro do que foi feito \(o arquivo de estado\) está vazio/)
  await rodar(existente(), { aceitarSemLedger: true })
  await rodar(existente(), { simular: true, aceitarSemLedger: false })
  const comRegistro = novoLedger()
  comRegistro.itens.postagens = { 'seixo|x': 'ob_1' }
  await rodar(existente(), { ledger: comRegistro, aceitarSemLedger: false })
})

// ------------------------------------------------------------------------------------------------------------------------------
// O que o semeador manda e o que faz com cada resposta do relé
// ------------------------------------------------------------------------------------------------------------------------------

const DOIS = { ...CAT, rovers: [SEIXO, { slug: 'pipa', handle: 'pipa', nome: 'Pipa', descricao: 'A segunda. Rover de demonstração.' }] }

test('a hora dos objetos: 5 minutos atrás mais uma unidade por objeto da rodada, e a aprovação humana vale 300 segundos', async () => {
  const f = falso(base())
  await rodar(f, { catalogo: DOIS })
  const posts = f.pedidos.filter((p) => p.metodo === 'POST')
  assert.equal(posts.length, 2)
  assert.equal(posts[0].corpo.objeto.criadoEm, T - 300)
  assert.equal(posts[1].corpo.objeto.criadoEm, T - 299)
  for (const p of posts) {
    assert.equal(p.corpo.aprovacao.expiraEm - p.corpo.aprovacao.aprovadoEm, 300)
    assert.ok(p.corpo.atestado, 'o primeiro objeto do rover leva o atestado')
  }
})

test('o relé responde 200 ou 201: os dois são sucesso e entram no ledger; 202 e 204 não são', async () => {
  for (const ok of [200, 201]) {
    const ledger = novoLedger()
    await rodar(falso((m, c, n, corpo) => (m === 'POST' ? resp(ok, {}) : base()(m, c, n, corpo))), { ledger, catalogo: { ...CAT, postagens: [{ ref: 'p1', de: 'seixo', topicos: ['a'], texto: 'Uma postagem para entrar.' }] } })
    assert.match(Object.values(ledger.itens.postagens)[0], /^ob_/, `status ${ok}`)
  }
  for (const ruim of [202, 204]) {
    await assert.rejects(() => rodar(falso((m, c, n, corpo) => (m === 'POST' ? (ruim === 204 ? new Response(null, { status: 204 }) : resp(ruim, {})) : base()(m, c, n, corpo)))), new RegExp(`o relé recusou perfil do rover seixo: ${ruim}`))
  }
})

const COM_POSTAGEM = { ...CAT, postagens: [{ ref: 'p1', de: 'seixo', topicos: ['a'], texto: 'Uma postagem que o relé pode adiar.' }] }
const postagemRecusada = (status, corpo, cab) => (m, c, n, b) => (m === 'POST' && b?.objeto?.tipo === 'postagem' ? resp(status, corpo, cab) : base()(m, c, n, b))

test('o que o relé recusa por tempo vira adiamento com a hora de voltar; o que ninguém previu para a rodada', async () => {
  // código que a fase marca como "ainda não é hora": a hora vem do Retry-After, e sem ele do retryAfterS do corpo
  const comCodigo = { ...COM_POSTAGEM }
  const f = { nome: 'postagens' }
  void f
  const doCorpo = await rodar(falso(postagemRecusada(403, { erro: { codigo: 'em_carencia', retryAfterS: 77 } })), { catalogo: comCodigo }).catch((e) => e)
  // `postagens` não marca em_carencia: é erro de verdade, e a mensagem diz o código
  assert.match(doCorpo.message, /o relé recusou postagem do rover seixo: em_carencia/)
  // 429 sem corpo e sem espera longa, depois das 12 esperas: erro com o status (não é adiamento)
  const w = esperas()
  await assert.rejects(() => rodar(falso(postagemRecusada(429, {}, { 'retry-after': '120' })), { ...w, catalogo: comCodigo }), /o relé recusou postagem do rover seixo: 429/)
  // 429 com espera acima de 120 s: adiado, mesmo sem corpo, com a hora de voltar
  const longo = await rodar(falso(postagemRecusada(429, {}, { 'retry-after': '121' })), { ...esperas(), catalogo: comCodigo })
  assert.equal(longo.adiados.length, 1)
  assert.deepEqual(longo.adiados[0], { fase: 'postagens', item: 'seixo', motivo: 'status 429', tentarEm: T + 121 })
  assert.equal(longo.proximaRodada, T + 121)
  // 429 com o código de taxa e espera curta: depois de esperar, adiado com a hora
  const taxa = await rodar(falso(postagemRecusada(429, { erro: { codigo: 'limite_de_taxa' } }, { 'retry-after': '5' })), { ...esperas(), catalogo: comCodigo })
  assert.deepEqual(taxa.adiados.map((a) => [a.motivo, a.tentarEm]), [['limite_de_taxa', T + 5]])
})

test('conta nova e carência: adiados com a hora do Retry-After, ou do corpo; a próxima rodada é a menor das horas', async () => {
  const cv = (nome, dono) => ({ ref: `c-${nome}`, dono, nome, descricao: 'x', regras: 'y', tema: 'tema', acesso: 'aberta', categorias: [], moderadores: [], membros: [] })
  const dois = { ...DOIS, comunidades: [cv('Primeira', 'seixo'), cv('Segunda', 'pipa')] }
  let n = 0
  const f = falso((m, c, k, corpo) => {
    if (m === 'POST' && corpo?.objeto?.tipo === 'comunidade-criar') {
      n++
      return n === 1 ? resp(403, { erro: { codigo: 'conta_nova', retryAfterS: 900 } }) : resp(403, { erro: { codigo: 'conta_nova' } }, { 'retry-after': '300' })
    }
    return base()(m, c, k, corpo)
  })
  const r = await rodar(f, { catalogo: dois })
  const [a, b] = r.adiados.filter((x) => x.fase === 'comunidades')
  assert.deepEqual([a.item, a.motivo, a.tentarEm], ['Primeira', 'conta_nova', T + 900], 'sem cabeçalho, a hora vem do corpo')
  assert.deepEqual([b.item, b.tentarEm], ['Segunda', T + 300], 'o cabeçalho vale')
  assert.equal(r.proximaRodada, T + 300, 'a próxima rodada é a menor hora')
  // sem hora nenhuma, o adiamento existe e a próxima rodada fica em aberto
  const semHora = await rodar(falso((m, c, k, corpo) => (m === 'POST' && corpo?.objeto?.tipo === 'comunidade-criar' ? resp(403, { erro: { codigo: 'conta_nova' } }) : base()(m, c, k, corpo))), { catalogo: { ...CAT, comunidades: [cv('Primeira', 'seixo')] } })
  assert.equal(semHora.adiados[0].tentarEm, null)
  assert.equal(semHora.proximaRodada, null)
})

test('o relé diz que a comunidade já existe: o semeador recupera o id pelo nome; sem achar, recusa seguir', async () => {
  const cv = { ref: 'c1', dono: 'seixo', nome: 'Existe', descricao: 'x', regras: 'y', tema: 'tema', acesso: 'aberta', categorias: [], moderadores: [], membros: [] }
  const catalogo = { ...CAT, comunidades: [cv] }
  const ID = `ob_${'a'.repeat(43)}`
  const ja = (itens) => falso((m, c, n, corpo) => {
    if (m === 'POST' && corpo?.objeto?.tipo === 'comunidade-criar') return resp(409, { erro: { codigo: 'ja_existe' } })
    if (m === 'GET' && c === '/v1/comunidades') return resp(200, { itens })
    return base()(m, c, n, corpo)
  })
  const ledger = novoLedger()
  const r = await rodar(ja([{ id: ID, nome: 'Outra' }, { id: ID, nome: 'Existe' }]), { catalogo, ledger })
  assert.equal(r.existentes.comunidades, 1)
  assert.equal(ledger.itens.comunidades[`seixo|seixo|Existe`], ID)
  await assert.rejects(() => rodar(ja([{ id: ID, nome: 'Outra' }]), { catalogo }), /o relé diz que "comunidades" já existe, mas não achei o id para continuar/)
})

test('--simular não precisa que o ref exista: devolve um id pendente em vez de falhar', async () => {
  const quebrado = { ...CAT, respostas: [{ ref: 'rx', de: 'seixo', a: 'p-que-nao-existe', texto: 'Resposta a um post que o catálogo não tem.' }] }
  const r = await rodar(falso(base()), { catalogo: quebrado, simular: true })
  assert.equal(r.simulado, true)
  await assert.rejects(() => rodar(falso(base()), { catalogo: quebrado }), /aponta para "p-que-nao-existe"/)
})

test('a cadeia legível reconhece postagem, resposta, seguir e reação já publicadas, sem ledger', async () => {
  const objs = {
    ob_0: { id: 'ob_0', tipo: 'postagem', criadoEm: T - 50, previo: 'ob_1', corpo: { texto: 'Já publicada.', topicos: ['a'] } },
    ob_1: { id: 'ob_1', tipo: 'postagem', criadoEm: T - 60, previo: 'ob_1', corpo: { texto: 'Já publicada.', topicos: ['a'] } }
  }
  objs.ob_1.previo = null
  const f = falso((m, c, n, corpo) => {
    if (c.startsWith('/v1/rovers/')) return rover('ob_0')
    const o = objs[c.replace('/v1/objetos/', '')]
    if (o) return resp(200, { objeto: o })
    return base()(m, c, n, corpo)
  })
  const r = await rodar(f, { catalogo: { ...CAT, postagens: [{ ref: 'p1', de: 'seixo', topicos: ['a'], texto: 'Já publicada.' }, { ref: 'p2', de: 'seixo', topicos: ['a'], texto: 'Nova de verdade.' }] } })
  assert.equal(r.existentes.postagens, 1)
  assert.equal(r.criados.postagens, 1)
  assert.equal(f.pedidos.filter((p) => p.metodo === 'POST' && p.corpo.objeto.tipo === 'postagem').length, 1)
})
