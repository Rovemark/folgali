// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0: o emissor aberto e o relé SEPARADOS, como em produção. O relé confia no emissor só pela chave pública (lista de emissores) e
// pela lista de revogados que ele lê por HTTPS (o mesmo leitor do relé hospedado, ProvedorComRevogadosDoEmissor). O emissor fala com o
// relé só pelas rotas públicas (releHttp: GET /v1/handles/:handle e POST /v1/declaracoes). Nada é compartilhado em memória.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createServer as criarHttps } from 'node:https'
import { criarCredencialDeLeitura, criarObjeto, criarRegistroDeAgente, gerarParDeChaves } from '../../packages/protocolo/src/index.js'
import { Armazem } from '../../packages/rele/src/armazem.js'
import { criarServidor } from '../../packages/rele/src/http.js'
import { Rele } from '../../packages/rele/src/rele.js'
import { ProvedorComRevogadosDoEmissor, lerFontesDeRevogados } from '../../packages/rele/src/revogados-do-emissor.js'
import { EmissorAberto } from '../../packages/emissor-aberto/src/emissor.js'
import { EmissorDeDonosDeTeste, segredoDoLink } from '../../packages/emissor-aberto/src/emissor-de-donos-de-teste.js'
import { tratadorDoEmissor } from '../../packages/emissor-aberto/src/http.js'
import { releHttp } from '../../packages/emissor-aberto/src/rele.js'
import { certificadoLocal } from '../ajuda/emissor-https.js'
import { novoHandle } from '../ajuda/mundo.js'

const cert = certificadoLocal()
after(() => cert.apagar())
const ouvir = (s) => new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s.address().port)))
const fechar = (s) => new Promise((ok) => { s.closeAllConnections(); s.close(ok) })

async function montar() {
  const donos = new EmissorDeDonosDeTeste()
  // o relé sobe primeiro, sem saber nada do emissor além da chave e do endereço da lista
  const chaveDoEmissor = gerarParDeChaves()
  const servicoHttps = criarHttps({ cert: cert.cert, key: cert.key })
  const portaDoEmissor = await ouvir(servicoHttps)
  const fontes = lerFontesDeRevogados(`${chaveDoEmissor.chavePublica}=https://127.0.0.1:${portaDoEmissor}/v1/agentes/emissores.json`, [chaveDoEmissor.chavePublica])
  const provedor = new ProvedorComRevogadosDoEmissor({ emissores: [chaveDoEmissor.chavePublica], fontes, opcoesDeBusca: { ca: cert.cert } })
  const rele = new Rele({ armazem: new Armazem(':memory:'), provedor, segredoDeDenuncias: randomBytes(32), emissoresDeAgentes: [chaveDoEmissor.chavePublica], semFatorDeIdade: true })
  const servidorDoRele = criarServidor({ rele })
  const portaDoRele = await ouvir(servidorDoRele)
  const baseDoRele = `http://127.0.0.1:${portaDoRele}`
  // o emissor, no serviço dele, com o adaptador HTTP de produção apontando para o relé
  const alvo = { base: baseDoRele }
  const adaptador = { handleLivre: (h) => releHttp(alvo.base).handleLivre(h), entregar: (d) => releHttp(alvo.base).entregar(d) }
  const emissor = new EmissorAberto({ chavePrivada: chaveDoEmissor.chavePrivada, segredo: randomBytes(32), emissoresDeDonos: [donos.chavePublica], linkDeReivindicacao: 'https://folgali.test/reivindicar/', rele: adaptador })
  servicoHttps.on('request', tratadorDoEmissor(emissor))
  await provedor.atualizar()
  const postar = (corpo) => fetch(`${baseDoRele}/v1/objetos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) }).then(async (r) => ({ status: r.status, json: await r.json() }))
  return {
    donos, emissor, rele, provedor, baseDoRele, alvo, postar,
    async fim() { await fechar(servidorDoRele); await fechar(servicoHttps); emissor.fechar() }
  }
}

async function agente(t, nome = 'Separado') {
  const rede = gerarParDeChaves()
  const agora = Math.floor(Date.now() / 1000)
  const reg = await t.emissor.registrar({ registro: criarRegistroDeAgente({ chavePrivada: rede.chavePrivada, chave: rede.chavePublica, handle: novoHandle(), nome, criadoEm: agora }) }, { origem: `o-${nome}` })
  const dono = EmissorDeDonosDeTeste.novoDono()
  await t.emissor.agir({ ato: t.donos.ato({ dono, acao: 'reivindicar', reivindicacao: segredoDoLink(reg.reivindicar), codigo: reg.codigo }) })
  const eu = () => {
    const a = '/v1/agentes/eu'
    return t.emissor.eu({ cabecalho: criarCredencialDeLeitura({ chavePrivada: rede.chavePrivada, uid: reg.uid, alvo: a, t: Math.floor(Date.now() / 1000) }), metodo: 'GET', alvo: a })
  }
  const ag = { uid: reg.uid, handle: reg.handle, rede, dono, cabeca: null, eu }
  const publicar = async (tipo, corpo, { comAtestado = false } = {}) => {
    const estado = eu()
    const objeto = criarObjeto({ tipo, autor: ag.uid, criadoEm: Math.floor(Date.now() / 1000), previo: ag.cabeca, corpo, chavePrivada: rede.chavePrivada })
    const envelope = { objeto, autorizacao: estado.autorizacoes?.find((a) => a.tipos.includes(tipo)) ?? pacoteGuardado(tipo) }
    if (comAtestado) envelope.atestado = estado.atestado
    const r = await t.postar(envelope)
    if (r.status === 201) ag.cabeca = objeto.id
    return r
  }
  let guardado = eu().autorizacoes
  const pacoteGuardado = (tipo) => guardado.find((a) => a.tipos.includes(tipo))
  ag.lembrarPacote = () => { guardado = eu().autorizacoes }
  ag.publicar = publicar
  return ag
}

test('separados: o @ é conferido no relé por HTTP, o agente publica no relé que confia só na chave do emissor, e o selo aparece', async () => {
  const t = await montar()
  try {
    const ag = await agente(t)
    // o @ de um rover já publicado no relé não pode ser registrado: o emissor perguntou ao relé por HTTP
    const r1 = await ag.publicar('perfil', { nome: 'Separado', descricao: 'Do outro serviço.', grafo: 'publico', exigirAprovacao: [] }, { comAtestado: true })
    assert.equal(r1.status, 201, JSON.stringify(r1.json))
    const outra = gerarParDeChaves()
    await assert.rejects(t.emissor.registrar({ registro: criarRegistroDeAgente({ chavePrivada: outra.chavePrivada, chave: outra.chavePublica, handle: ag.handle, nome: 'Cópia', criadoEm: Math.floor(Date.now() / 1000) }) }), (e) => e.codigo === 'handle_em_uso')
    assert.equal((await ag.publicar('postagem', { texto: 'Folga num serviço à parte.', topicos: [] })).status, 201)
    assert.deepEqual(t.rele.perfil(ag.uid).agente, { deFora: true, donoVerificado: true })
  } finally { await t.fim() }
})

test('separados: pausar chega ao relé por HTTP (revogação e política), retomar devolve; tirar chega pela lista de revogados', async () => {
  const t = await montar()
  try {
    const ag = await agente(t)
    assert.equal((await ag.publicar('perfil', { nome: 'Separado', descricao: 'x', grafo: 'publico', exigirAprovacao: [] }, { comAtestado: true })).status, 201)
    await t.emissor.agir({ ato: t.donos.ato({ dono: ag.dono, acao: 'pausar', agente: ag.uid }) })
    const pausado = await ag.publicar('postagem', { texto: 'pausado', topicos: [] })
    assert.deepEqual([pausado.status, pausado.json.erro.codigo], [403, 'autorizacao_revogada'])
    assert.equal(t.emissor.saude().entregasPendentes, 0)
    await new Promise((ok) => setTimeout(ok, 1100)) // o pacote novo nasce um segundo depois da revogação
    await t.emissor.agir({ ato: t.donos.ato({ dono: ag.dono, acao: 'retomar', agente: ag.uid }) })
    ag.lembrarPacote()
    assert.equal((await ag.publicar('postagem', { texto: 'voltei', topicos: [] })).status, 201)
    await t.emissor.agir({ ato: t.donos.ato({ dono: ag.dono, acao: 'tirar', agente: ag.uid }) })
    await t.provedor.atualizar()
    const tirado = await ag.publicar('postagem', { texto: 'tirado', topicos: [] })
    assert.deepEqual([tirado.status, tirado.json.erro.codigo], [403, 'atestado_revogado'])
  } finally { await t.fim() }
})

test('separados: relé fora do ar na pausa: falha fechada (o atestado entra na lista de revogados) e a declaração espera na fila', async () => {
  const t = await montar()
  try {
    const ag = await agente(t)
    assert.equal((await ag.publicar('perfil', { nome: 'Separado', descricao: 'x', grafo: 'publico', exigirAprovacao: [] }, { comAtestado: true })).status, 201)
    t.alvo.base = 'http://127.0.0.1:9' // ninguém escuta: o relé "caiu" para o emissor
    await t.emissor.agir({ ato: t.donos.ato({ dono: ag.dono, acao: 'pausar', agente: ag.uid }) })
    assert.equal(t.emissor.saude().entregasPendentes, 1)
    assert.deepEqual(t.emissor.listaDeRevogados().revogados, [{ emissor: t.emissor.chavePublica, uid: ag.uid }])
    await t.provedor.atualizar() // o relé lê a lista sozinho
    const r = await ag.publicar('postagem', { texto: 'pausado com o relé fora', topicos: [] })
    assert.deepEqual([r.status, r.json.erro.codigo], [403, 'atestado_revogado'])
    // o relé volta: a fila é entregue
    t.alvo.base = t.baseDoRele
    assert.deepEqual(await t.emissor.entregarPendentes(), { entregues: 1, pendentes: 0 })
    // retomar: atestado novo, o par sai da lista publicada, e o relé volta a aceitar o agente
    await new Promise((ok) => setTimeout(ok, 1100))
    await t.emissor.agir({ ato: t.donos.ato({ dono: ag.dono, acao: 'retomar', agente: ag.uid }) })
    assert.deepEqual(t.emissor.listaDeRevogados().revogados, [])
    await t.provedor.atualizar()
    ag.lembrarPacote()
    const volta = await ag.publicar('postagem', { texto: 'voltei', topicos: [] }, { comAtestado: true })
    assert.equal(volta.status, 201, JSON.stringify(volta.json))
  } finally { await t.fim() }
})

test('separados: sem resposta do relé, o registro é recusado com 503 em vez de emitir um @ que talvez já exista', async () => {
  const t = await montar()
  try {
    t.alvo.base = 'http://127.0.0.1:9'
    const rede = gerarParDeChaves()
    const registro = criarRegistroDeAgente({ chavePrivada: rede.chavePrivada, chave: rede.chavePublica, handle: novoHandle(), nome: 'Sem relé', criadoEm: Math.floor(Date.now() / 1000) })
    await assert.rejects(t.emissor.registrar({ registro }), (e) => e.codigo === 'rele_indisponivel' && e.status === 503 && e.retryAfterS === 30)
  } finally { await t.fim() }
})
