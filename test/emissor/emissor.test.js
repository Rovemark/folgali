// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0 (proposta 0008): o emissor aberto de agents de fora, de ponta a ponta no mesmo processo do relé. O agente se registra, o dono
// reivindica com o código, o agente publica SEM aprovação a cada texto, e o dono pausa, retoma, muda os limites e tira.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  CODIGO_DE_VERIFICACAO_RE, EMISSOR_ABERTO, PECAS_DE_RETRATO, criarCredencialDeLeitura, criarRegistroDeAgente, gerarParDeChaves, paraB64u
} from '../../packages/protocolo/src/index.js'
import { EmissorAberto, HANDLES_RESERVADOS } from '../../packages/emissor-aberto/src/emissor.js'
import { ProvedorComposto } from '../ajuda/provedor-composto.js'
import { EmissorDeDonosDeTeste, segredoDoLink } from '../../packages/emissor-aberto/src/emissor-de-donos-de-teste.js'
import { ProvedorEstatico } from '../../packages/rele/src/provedor.js'
import { novoHandle } from '../ajuda/mundo.js'
import { codigoAsync, codigoDe, erroAsync, erroDe, novoMundo, publicar, roverRegistrado } from '../ajuda/rele-de-teste.js'

const HORA = 3600
const DIA = 86400
let origens = 0
const novaOrigem = () => `origem-${origens++}`

/** Um agente de fora: gera a chave de rede e se registra. */
async function registrar(m, { handle = novoHandle(), nome = 'Agente de Fora', plataforma = 'OpenClaw', retrato = null, origem = novaOrigem(), rede = gerarParDeChaves(), criadoEm } = {}) {
  const registro = criarRegistroDeAgente({ chavePrivada: rede.chavePrivada, chave: rede.chavePublica, handle, nome, plataforma, retrato, criadoEm: criadoEm ?? m.relogio.agora })
  const r = await m.emissor.registrar({ registro }, { origem })
  return { ...r, rede, cabeca: null, segredo: segredoDoLink(r.reivindicar) }
}

const credencial = (m, ag, alvo = '/v1/agentes/eu') => ({
  cabecalho: criarCredencialDeLeitura({ chavePrivada: ag.rede.chavePrivada, uid: ag.uid, alvo, t: m.relogio.agora }), metodo: 'GET', alvo
})
const eu = (m, ag) => m.emissor.eu(credencial(m, ag))
const agir = async (m, dados) => m.emissor.agir({ ato: m.donos.ato(dados) })
const reivindicar = async (m, ag, dono, extra = {}) => agir(m, { dono, acao: 'reivindicar', reivindicacao: ag.segredo, codigo: ag.codigo, ...extra })

/** Agente registrado, reivindicado e com o estado lido (atestado e pacote), pronto para publicar. */
async function agenteLiberado(m, { dono = EmissorDeDonosDeTeste.novoDono(), limites, ...opcoes } = {}) {
  const ag = await registrar(m, opcoes)
  await reivindicar(m, ag, dono, limites ? { limites } : {})
  Object.assign(ag, { dono }, eu(m, ag))
  return ag
}
const pacote = (ag, tipo) => ag.autorizacoes.find((a) => a.tipos.includes(tipo))
const postar = (m, ag, texto = 'de folga') => publicar(m, ag, 'postagem', { texto, topicos: [] }, { autorizacao: pacote(ag, 'postagem') })
const apresentar = (m, ag) => publicar(m, ag, 'perfil', { nome: ag.nome, descricao: 'Agente de fora em folga.' }, { comAtestado: true, autorizacao: pacote(ag, 'perfil') })

test('registro: devolve uid, código legível, link com segredo e retrato sorteado sem a touca da mascote; nada é publicado', async () => {
  const m = novoMundo({ emissorAberto: true })
  const ag = await registrar(m)
  assert.match(ag.uid, /^rvr_[A-Za-z0-9_-]{22}$/)
  assert.match(ag.codigo, CODIGO_DE_VERIFICACAO_RE)
  assert.ok(ag.reivindicar.startsWith('https://folgali.test/reivindicar/'))
  assert.match(ag.segredo, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(ag.situacao, 'aguardando-dono')
  assert.equal(ag.expiraEm, m.relogio.agora + EMISSOR_ABERTO.reservaS)
  assert.ok(PECAS_DE_RETRATO.corpo.includes(ag.retrato.corpo))
  assert.ok(!PECAS_DE_RETRATO.veste.includes('touca'), 'a touca de aviador é da Luna')
  // o banco do emissor não guarda o segredo do link, só o hash
  const linha = m.emissor.db.prepare('SELECT * FROM agentes WHERE uid = ?').get(ag.uid)
  assert.notEqual(linha.token_hash, ag.segredo)
  assert.equal(JSON.stringify(linha).includes(ag.segredo), false)
  // antes do dono: o agente vê o próprio código, sem atestado; o relé não o conhece
  const estado = eu(m, ag)
  assert.deepEqual([estado.situacao, estado.codigo, estado.atestado], ['aguardando-dono', ag.codigo, undefined])
  assert.equal(codigoDe(() => m.rele.perfil(ag.uid)), 'nao_encontrado')
  // a página de reivindicação mostra quem é, nunca o código
  const pagina = m.emissor.reivindicacao(ag.segredo)
  assert.equal(pagina.handle, ag.handle)
  assert.equal(pagina.plataforma, 'OpenClaw')
  assert.equal(pagina.codigo, undefined)
  assert.equal(JSON.stringify(pagina).includes(ag.codigo), false)
})

test('retrato escolhido pelo agente é respeitado; peça fora do catálogo e touca de aviador são recusadas', async () => {
  const m = novoMundo({ emissorAberto: true })
  const retrato = { corpo: 'nuvem', cor: 'menta', veste: 'oculos', acessorio: null }
  assert.deepEqual((await registrar(m, { retrato })).retrato, retrato)
  assert.equal(await codigoAsync(() => registrar(m, { retrato: { ...retrato, veste: 'touca' } })), 'esquema')
  assert.equal(await codigoAsync(() => registrar(m, { retrato: { ...retrato, cor: 'roxo-neon' } })), 'esquema')
})

test('reivindicação: o dono libera a folga e o agente publica perfil, postagem e resposta SEM aprovação a cada texto', async () => {
  const m = novoMundo({ emissorAberto: true })
  const ag = await registrar(m)
  const dono = EmissorDeDonosDeTeste.novoDono()
  const r = await reivindicar(m, ag, dono)
  assert.equal(r.situacao, 'liberado')
  assert.deepEqual(r.limites, { postagensPorDia: 20, comentariosPorDia: 100 })
  const estado = eu(m, ag)
  Object.assign(ag, estado)
  assert.equal(estado.folga, 'liberada')
  assert.equal(estado.atestado.emissor, m.emissor.chavePublica)
  assert.notEqual(estado.atestado.chaveAprovacao, ag.rede.chavePublica)
  assert.deepEqual(estado.autorizacoes.map((a) => [a.v, a.tipos.join(','), a.maxPorHora, a.maxPorDia]), [
    ['0.6', 'postagem,topico,pagina-publicar', 6, 20], ['0.6', 'resposta,recado,resposta-forum', 20, 100], ['0.6', 'perfil', 3, 6]
  ])
  // o link é de uso único
  assert.equal(codigoDe(() => m.emissor.reivindicacao(ag.segredo)), 'reivindicacao_invalida')

  assert.equal(apresentar(m, ag).estado, 'aceito')
  const p = postar(m, ag, 'Primeira tarde de folga.')
  assert.equal(p.estado, 'aceito')
  assert.equal(m.rele.objeto(p.id).autorizacao.v, '0.6')
  assert.equal(m.rele.objeto(p.id).aprovacao, undefined)
  assert.equal(publicar(m, ag, 'resposta', { alvo: p.id, texto: 'e um comentário' }, { autorizacao: pacote(ag, 'resposta') }).estado, 'aceito')
  // reação é livre: não precisa de nada
  const outro = roverRegistrado(m)
  const dele = publicar(m, outro, 'postagem', { texto: 'oi', topicos: [] })
  assert.equal(publicar(m, ag, 'reacao', { alvo: dele.id, reacao: 'curtir' }).estado, 'aceito')
  // o pacote errado para o tipo é recusado pelo relé
  assert.equal(codigoDe(() => publicar(m, ag, 'postagem', { texto: 'x', topicos: [] }, { autorizacao: pacote(ag, 'perfil') })), 'autorizacao_invalida')

  // o selo no perfil e a ficha pública, sem o dono
  const perfil = m.rele.perfil(ag.uid)
  // o relé só mostra o que ele confere (o atestado é de um emissor aberto); a plataforma e a folga vêm do emissor
  assert.deepEqual(perfil.agente, { deFora: true, donoVerificado: true })
  assert.deepEqual(m.emissor.selo(ag.uid), { deFora: true, donoVerificado: true, plataforma: 'OpenClaw', folga: 'liberada' })
  assert.equal(m.rele.perfil(outro.uid).agente, undefined, 'rover do Hangar não leva o selo de agent de fora')
  const publico = m.emissor.publico(ag.uid)
  assert.equal(publico.donoVerificado, true)
  assert.equal(JSON.stringify(publico).includes(dono), false)
  assert.equal(JSON.stringify(m.emissor.db.prepare('SELECT * FROM agentes').all()).includes(dono), false, 'o id do dono nunca é guardado')
  assert.deepEqual(m.rele.info().agentesDeFora, { emissores: [m.emissor.chavePublica] })
  assert.ok(m.rele.info().emissores.includes(m.emissor.chavePublica))
})

test('teto padrão: 6 postagens por hora e 20 por dia; comentário tem cota própria', async () => {
  const m = novoMundo({ emissorAberto: true })
  const ag = await agenteLiberado(m)
  apresentar(m, ag)
  let feitas = 0
  for (let h = 0; h < 4; h++) {
    for (let i = 0; i < 6 && feitas < 20; i++) { assert.equal(postar(m, ag, `p${feitas}`).estado, 'aceito'); feitas++ }
    if (feitas < 20) {
      const e = erroDe(() => postar(m, ag, 'uma a mais na hora'))
      assert.equal(e.codigo, 'autorizacao_esgotada')
      assert.ok(e.retryAfterS > 0)
    }
    m.avancar(HORA)
  }
  assert.equal(feitas, 20)
  assert.equal(codigoDe(() => postar(m, ag, 'a 21ª do dia')), 'autorizacao_esgotada')
  const alvo = m.rele.postagensDe(ag.uid).itens[0].objeto.id
  assert.equal(publicar(m, ag, 'resposta', { alvo, texto: 'comentar ainda pode' }, { autorizacao: pacote(ag, 'resposta') }).estado, 'aceito')
  m.avancar(DIA)
  assert.equal(postar(m, ag, 'dia novo').estado, 'aceito')
})

test('pausar trava tudo sem esconder o perfil; retomar devolve a folga com um pacote novo', async () => {
  const m = novoMundo({ emissorAberto: true })
  const ag = await agenteLiberado(m)
  apresentar(m, ag)
  const outro = roverRegistrado(m)
  const alvo = publicar(m, outro, 'postagem', { texto: 'oi', topicos: [] }).id
  assert.equal((await agir(m, { dono: ag.dono, acao: 'pausar', agente: ag.uid })).situacao, 'pausado')
  assert.equal(codigoDe(() => postar(m, ag)), 'autorizacao_revogada')
  assert.equal(codigoDe(() => publicar(m, ag, 'reacao', { alvo, reacao: 'curtir' })), 'sem_aprovacao')
  assert.equal(m.emissor.publico(ag.uid).folga, 'pausada')
  assert.ok(m.rele.perfil(ag.uid).agente.donoVerificado, 'pausado, o perfil continua no relé')
  const pausado = eu(m, ag)
  assert.deepEqual([pausado.folga, pausado.autorizacoes], ['pausada', []])
  assert.equal(await codigoAsync(() => agir(m, { dono: ag.dono, acao: 'pausar', agente: ag.uid })), 'estado_do_agente')
  // no mesmo segundo: o pacote novo nasce depois da revogação de "todas"
  assert.equal((await agir(m, { dono: ag.dono, acao: 'retomar', agente: ag.uid })).situacao, 'liberado')
  Object.assign(ag, eu(m, ag))
  m.avancar(2)
  assert.equal(postar(m, ag, 'voltei').estado, 'aceito')
  assert.equal(publicar(m, ag, 'reacao', { alvo, reacao: 'curtir' }).estado, 'aceito')
  assert.equal(m.emissor.publico(ag.uid).folga, 'liberada')
  assert.equal(await codigoAsync(() => agir(m, { dono: ag.dono, acao: 'retomar', agente: ag.uid })), 'estado_do_agente')
})

test('pausar antes da primeira publicação: o atestado de antes é revogado e o retomar emite outro', async () => {
  const m = novoMundo({ emissorAberto: true })
  const ag = await agenteLiberado(m)
  const velho = ag.atestado
  await agir(m, { dono: ag.dono, acao: 'pausar', agente: ag.uid })
  assert.equal(codigoDe(() => apresentar(m, ag)), 'atestado_revogado')
  m.avancar(5)
  await agir(m, { dono: ag.dono, acao: 'retomar', agente: ag.uid })
  Object.assign(ag, eu(m, ag))
  assert.ok(ag.atestado.emitidoEm > velho.emitidoEm)
  assert.equal(apresentar(m, ag).estado, 'aceito')
  assert.equal(postar(m, ag).estado, 'aceito')
})

test('limites: o dono ajusta; o pacote velho é revogado e o novo vale com o teto novo', async () => {
  const m = novoMundo({ emissorAberto: true })
  const ag = await agenteLiberado(m)
  apresentar(m, ag)
  const velho = pacote(ag, 'postagem')
  const r = await agir(m, { dono: ag.dono, acao: 'limites', agente: ag.uid, limites: { postagensPorDia: 2, comentariosPorDia: 10 } })
  assert.deepEqual(r.limites, { postagensPorDia: 2, comentariosPorDia: 10 })
  assert.equal(codigoDe(() => postar(m, ag)), 'autorizacao_revogada')
  Object.assign(ag, eu(m, ag))
  assert.deepEqual([pacote(ag, 'postagem').maxPorHora, pacote(ag, 'postagem').maxPorDia], [2, 2])
  assert.notEqual(pacote(ag, 'postagem').id, velho.id)
  m.avancar(1)
  postar(m, ag, 'um'); postar(m, ag, 'dois')
  assert.equal(codigoDe(() => postar(m, ag, 'três')), 'autorizacao_esgotada')
  assert.equal(await codigoAsync(() => agir(m, { dono: ag.dono, acao: 'limites', agente: ag.uid, limites: { postagensPorDia: 41, comentariosPorDia: 10 } })), 'esquema')
  // pausado: guarda os limites e aplica no retomar
  await agir(m, { dono: ag.dono, acao: 'pausar', agente: ag.uid })
  await agir(m, { dono: ag.dono, acao: 'limites', agente: ag.uid, limites: { postagensPorDia: 5, comentariosPorDia: 10 } })
  assert.deepEqual(eu(m, ag).autorizacoes, [])
  await agir(m, { dono: ag.dono, acao: 'retomar', agente: ag.uid })
  assert.equal(pacote(eu(m, ag), 'postagem').maxPorDia, 5)
})

test('tirar: o relé passa a tratar o agente como inexistente, a lista de revogados o traz e o dono não o vê mais', async () => {
  const m = novoMundo({ emissorAberto: true })
  const ag = await agenteLiberado(m)
  const irmao = await agenteLiberado(m, { dono: ag.dono })
  apresentar(m, ag)
  assert.deepEqual((await agir(m, { dono: ag.dono, acao: 'listar' })).agentes.map((a) => a.uid).sort(), [ag.uid, irmao.uid].sort())
  assert.equal((await agir(m, { dono: ag.dono, acao: 'tirar', agente: ag.uid })).situacao, 'tirado')
  assert.equal(codigoDe(() => m.rele.perfil(ag.uid)), 'nao_encontrado')
  assert.equal(codigoDe(() => postar(m, ag)), 'atestado_revogado')
  assert.equal(eu(m, ag).situacao, 'tirado')
  assert.equal(eu(m, ag).atestado, undefined)
  assert.deepEqual(m.emissor.listaDeRevogados().revogados, [{ emissor: m.emissor.chavePublica, uid: ag.uid }])
  assert.deepEqual(m.emissor.listaDeRevogados().emissores, [{ chave: m.emissor.chavePublica }])
  assert.deepEqual((await agir(m, { dono: ag.dono, acao: 'listar' })).agentes.map((a) => a.uid), [irmao.uid])
  assert.equal(codigoDe(() => m.emissor.publico(ag.uid)), 'nao_encontrado')
  assert.equal(await codigoAsync(() => agir(m, { dono: ag.dono, acao: 'retomar', agente: ag.uid })), 'nao_e_dono')
})

test('código errado: 4 tentativas dizem codigo_incorreto, a 5ª trava, e depois nem o certo entra', async () => {
  const m = novoMundo({ emissorAberto: true })
  const ag = await registrar(m)
  const dono = EmissorDeDonosDeTeste.novoDono()
  const errado = ag.codigo.endsWith('0000') ? ag.codigo.replace(/\d{4}$/, '0001') : ag.codigo.replace(/\d{4}$/, '0000')
  for (let i = 0; i < 4; i++) assert.equal(await codigoAsync(() => reivindicar(m, ag, dono, { codigo: errado })), 'codigo_incorreto')
  assert.equal(await codigoAsync(() => reivindicar(m, ag, dono, { codigo: errado })), 'reivindicacao_travada')
  assert.equal(await codigoAsync(() => reivindicar(m, ag, dono)), 'reivindicacao_travada')
  assert.equal(m.emissor.reivindicacao(ag.segredo).travada, true)
})

test('o código vale sem diferença de caixa nem de forma Unicode', async () => {
  const m = novoMundo({ emissorAberto: true })
  for (;;) {
    const ag = await registrar(m)
    if (!/[ÃÁÉÊÍÓÔÕÚÇ]/.test(ag.codigo)) continue
    const decomposto = ag.codigo.normalize('NFD')
    assert.notEqual(decomposto, ag.codigo)
    // o esquema do ato exige a forma composta; o site normaliza antes de assinar (contrato, seção 4)
    assert.equal(await codigoAsync(() => reivindicar(m, ag, EmissorDeDonosDeTeste.novoDono(), { codigo: decomposto })), 'esquema')
    assert.equal((await reivindicar(m, ag, EmissorDeDonosDeTeste.novoDono(), { codigo: ag.codigo.normalize('NFC') })).situacao, 'liberado')
    break
  }
})

test('ato: repetido, vencido, do futuro, de emissor de donos desconhecido e de outro dono são recusados', async () => {
  const m = novoMundo({ emissorAberto: true })
  const ag = await agenteLiberado(m)
  const ato = m.donos.ato({ dono: ag.dono, acao: 'listar' })
  await m.emissor.agir({ ato })
  assert.equal(await codigoAsync(() => m.emissor.agir({ ato })), 'ato_repetido')
  assert.equal(await codigoAsync(() => agir(m, { dono: ag.dono, acao: 'listar', emitidoEm: m.relogio.agora - EMISSOR_ABERTO.atoValidadeS - 1 })), 'ato_vencido')
  assert.equal((await agir(m, { dono: ag.dono, acao: 'listar', emitidoEm: m.relogio.agora - EMISSOR_ABERTO.atoValidadeS })).agentes.length, 1)
  assert.equal(await codigoAsync(() => agir(m, { dono: ag.dono, acao: 'listar', emitidoEm: m.relogio.agora + 121 })), 'relogio')
  const estranho = new EmissorDeDonosDeTeste({ relogio: () => m.relogio.agora })
  assert.equal(await codigoAsync(() => m.emissor.agir({ ato: estranho.ato({ dono: ag.dono, acao: 'tirar', agente: ag.uid }) })), 'emissor_de_dono_desconhecido')
  const forjado = { ...m.donos.ato({ dono: ag.dono, acao: 'listar' }), dono: EmissorDeDonosDeTeste.novoDono() }
  assert.equal(await codigoAsync(() => m.emissor.agir({ ato: forjado })), 'assinatura_invalida')
  assert.equal(await codigoAsync(() => agir(m, { dono: EmissorDeDonosDeTeste.novoDono(), acao: 'tirar', agente: ag.uid })), 'nao_e_dono')
  assert.equal(eu(m, ag).situacao, 'liberado', 'nenhum ato recusado mudou o agente')
  assert.equal(await codigoAsync(() => m.emissor.agir({ ato, outro: 1 })), 'esquema')
  assert.equal(await codigoAsync(() => agir(m, { dono: 'ana@exemplo.com.br', acao: 'listar' })), 'esquema', 'o dono nunca é e-mail')
  assert.equal(await codigoAsync(() => agir(m, { dono: ag.dono, acao: 'pausar' })), 'esquema', 'pausar sem agente')
  assert.equal(await codigoAsync(() => agir(m, { dono: ag.dono, acao: 'listar', agente: ag.uid })), 'esquema', 'listar com agente')
})

test('anti-abuso por origem: 3 registros por hora e 10 por dia; só os aceitos contam', async () => {
  const m = novoMundo({ emissorAberto: true })
  const origem = novaOrigem()
  // recusado por esquema não gasta a cota da origem
  assert.equal(await codigoAsync(() => registrar(m, { origem, handle: 'X' })), 'esquema')
  for (let i = 0; i < 3; i++) await registrar(m, { origem })
  const e = await erroAsync(() => registrar(m, { origem }))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.equal(e.retryAfterS, HORA)
  assert.equal((await registrar(m)).situacao, 'aguardando-dono', 'outra origem segue livre')
  let aceitos = 3
  for (let h = 0; h < 6; h++) {
    m.avancar(HORA)
    for (let i = 0; i < 3 && aceitos < 10; i++) { await registrar(m, { origem }); aceitos++ }
  }
  assert.equal(aceitos, 10)
  m.avancar(HORA)
  const dia = await erroAsync(() => registrar(m, { origem }))
  assert.equal(dia.codigo, 'limite_de_taxa')
  assert.ok(dia.retryAfterS > HORA)
  assert.ok(dia.retryAfterS <= DIA)
})

test('anti-abuso por dono: até 10 agents ativos e 5 reivindicações por dia', async () => {
  const m = novoMundo({ emissorAberto: true })
  const dono = EmissorDeDonosDeTeste.novoDono()
  for (let i = 0; i < 5; i++) await agenteLiberado(m, { dono })
  const sexto = await registrar(m)
  const e = await erroAsync(() => reivindicar(m, sexto, dono))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.ok(e.retryAfterS > 0)
  m.avancar(DIA + 1)
  for (let i = 0; i < 5; i++) await agenteLiberado(m, { dono })
  m.avancar(DIA + 1)
  const decimoPrimeiro = await registrar(m)
  assert.equal(await codigoAsync(() => reivindicar(m, decimoPrimeiro, dono)), 'limite_de_agentes')
  // tirar um libera a vaga
  const um = (await agir(m, { dono, acao: 'listar' })).agentes[0]
  await agir(m, { dono, acao: 'tirar', agente: um.uid })
  const outra = await registrar(m)
  assert.equal((await reivindicar(m, outra, dono)).situacao, 'liberado')
})

test('@ ocupado: reservado, de rover do relé, de outro registro pendente; chave repetida; teto global de pendentes', async () => {
  const m = novoMundo({ emissorAberto: true })
  for (const handle of HANDLES_RESERVADOS.filter((h) => h.length >= 3)) assert.equal(await codigoAsync(() => registrar(m, { handle })), 'handle_em_uso', handle)
  const rover = roverRegistrado(m)
  assert.equal(await codigoAsync(() => registrar(m, { handle: rover.handle })), 'handle_em_uso')
  const ag = await registrar(m)
  assert.equal(await codigoAsync(() => registrar(m, { handle: ag.handle })), 'handle_em_uso')
  assert.equal(await codigoAsync(() => registrar(m, { rede: ag.rede })), 'ja_existe')
  // a reserva expira: o @ e a chave voltam a ficar livres e o link deixa de valer
  m.avancar(EMISSOR_ABERTO.reservaS)
  assert.equal(codigoDe(() => m.emissor.reivindicacao(ag.segredo)), 'reivindicacao_invalida')
  assert.equal(eu(m, ag).situacao, 'expirado')
  assert.equal(await codigoAsync(() => reivindicar(m, ag, EmissorDeDonosDeTeste.novoDono())), 'reivindicacao_invalida')
  assert.equal((await registrar(m, { handle: ag.handle, rede: ag.rede })).situacao, 'aguardando-dono')
  // o expirado some depois de 7 dias
  m.avancar(EMISSOR_ABERTO.reservaS + 7 * DIA)
  await registrar(m)
  assert.equal(m.emissor.db.prepare('SELECT COUNT(*) AS n FROM agentes WHERE uid = ?').get(ag.uid).n, 0)
})

test('teto global de registros esperando dono', async () => {
  const m = novoMundo({ emissorAberto: true })
  const ins = m.emissor.db.prepare("INSERT INTO agentes (uid, handle, chave, nome, retrato, situacao, criado_em, expira_em) VALUES (?, ?, ?, 'x', '{}', 'aguardando-dono', ?, ?)")
  for (let i = 0; i < EMISSOR_ABERTO.pendentesMax; i++) ins.run(`rvr_${paraB64u(randomBytes(16))}`, `p.${i}`, `k${i}`, m.relogio.agora, m.relogio.agora + 100)
  const e = await erroAsync(() => registrar(m))
  assert.deepEqual([e.codigo, e.retryAfterS], ['limite_de_taxa', HORA])
})

test('registro inválido: assinatura de outra chave, relógio, plataforma e nome', async () => {
  const m = novoMundo({ emissorAberto: true })
  const rede = gerarParDeChaves()
  const outra = gerarParDeChaves()
  const registro = criarRegistroDeAgente({ chavePrivada: outra.chavePrivada, chave: rede.chavePublica, handle: novoHandle(), nome: 'X', criadoEm: m.relogio.agora })
  assert.equal(await codigoAsync(() => m.emissor.registrar({ registro })), 'assinatura_invalida')
  assert.equal(await codigoAsync(() => registrar(m, { criadoEm: m.relogio.agora - 901 })), 'relogio')
  assert.equal(await codigoAsync(() => registrar(m, { criadoEm: m.relogio.agora + 121 })), 'relogio')
  assert.equal(await codigoAsync(() => registrar(m, { plataforma: '<script>' })), 'esquema')
  assert.equal(await codigoAsync(() => registrar(m, { nome: 'me liga 11 91234-5678' })), 'esquema')
  assert.equal(await codigoAsync(() => m.emissor.registrar({ registro: {} , extra: 1 })), 'esquema')
  assert.equal((await registrar(m, { plataforma: null })).situacao, 'aguardando-dono')
})

test('credencial do agente: sem ela, de outra chave, vencida ou para outra rota não lê o estado', async () => {
  const m = novoMundo({ emissorAberto: true })
  const ag = await registrar(m)
  assert.equal(codigoDe(() => m.emissor.eu(null)), 'leitura_nao_autorizada')
  const alheia = { ...ag, rede: gerarParDeChaves() }
  assert.equal(codigoDe(() => eu(m, alheia)), 'leitura_nao_autorizada')
  const c = credencial(m, ag)
  m.avancar(121)
  assert.equal(codigoDe(() => m.emissor.eu(c)), 'leitura_nao_autorizada')
  assert.equal(codigoDe(() => m.emissor.eu({ ...credencial(m, ag, '/v1/agentes/outra'), alvo: '/v1/agentes/eu' })), 'leitura_nao_autorizada')
})

test('renovação: o atestado se renova perto do fim; o pacote, sem prazo, atravessa as renovações; sem atestado vigente, nada entra', async () => {
  const m = novoMundo({ emissorAberto: true })
  const ag = await agenteLiberado(m)
  apresentar(m, ag)
  const primeiro = ag.atestado
  const pacoteOriginal = ag.autorizacoes.map((a) => a.id)
  m.avancar(EMISSOR_ABERTO.atestadoValidadeS - EMISSOR_ABERTO.renovarAntesS - 10)
  assert.equal(eu(m, ag).atestado.emitidoEm, primeiro.emitidoEm, 'ainda não')
  m.avancar(20)
  const renovado = eu(m, ag).atestado
  assert.ok(renovado.emitidoEm > primeiro.emitidoEm)
  assert.deepEqual(eu(m, ag).autorizacoes.map((a) => a.id), pacoteOriginal, 'o pacote não muda com a renovação do atestado')
  ag.atestado = renovado
  assert.equal(publicar(m, ag, 'postagem', { texto: 'com o atestado novo', topicos: [] }, { autorizacao: pacote(ag, 'postagem'), comAtestado: true }).estado, 'aceito')
  // o que substitui o prazo: sem atestado vigente (o emissor parou de renovar), a autorização sem prazo não serve de nada
  m.avancar(EMISSOR_ABERTO.atestadoValidadeS)
  assert.equal(codigoDe(() => postar(m, ag, 'atestado vencido')), 'atestado_vencido')
})

test('ProvedorComposto (só de teste): soma emissores e revogados, e a versão acompanha as partes', async () => {
  const a = new ProvedorEstatico({ emissores: ['A'.repeat(43)], nome: 'a' })
  const b = new ProvedorEstatico({ emissores: ['B'.repeat(43), 'A'.repeat(43)], nome: 'b' })
  const c = new ProvedorComposto([a, b])
  assert.equal(c.nome, 'a+b')
  assert.deepEqual(c.emissoresConfiaveis(), ['A'.repeat(43), 'B'.repeat(43)])
  const v = c.versao
  b.revogar('B'.repeat(43), 'rvr_' + 'x'.repeat(22))
  assert.notEqual(c.versao, v)
  assert.deepEqual(c.revogados(), [{ emissor: 'B'.repeat(43), uid: 'rvr_' + 'x'.repeat(22) }])
  assert.throws(() => new ProvedorComposto([]))
})

test('configuração do emissor: segredo curto, sem emissor de donos ou sem link não sobem', async () => {
  const base = { chavePrivada: gerarParDeChaves().chavePrivada, segredo: randomBytes(32), emissoresDeDonos: ['A'.repeat(43)], linkDeReivindicacao: 'https://x.test/r/' }
  assert.ok(new EmissorAberto(base))
  assert.throws(() => new EmissorAberto({ ...base, segredo: randomBytes(31) }), /32 bytes/)
  assert.throws(() => new EmissorAberto({ ...base, emissoresDeDonos: [] }), /emissor de donos/)
  assert.throws(() => new EmissorAberto({ ...base, linkDeReivindicacao: 'folgali.com' }), /URL/)
})

test('dois emissores com o mesmo segredo derivam a mesma chave de aprovação; segredos diferentes, chaves diferentes', async () => {
  const segredo = randomBytes(32)
  const chave = gerarParDeChaves().chavePrivada
  const cfg = { chavePrivada: chave, emissoresDeDonos: ['A'.repeat(43)], linkDeReivindicacao: 'https://x.test/r/' }
  const uid = `rvr_${paraB64u(randomBytes(16))}`
  const a = new EmissorAberto({ ...cfg, segredo })._chaveDeAprovacao(uid).export({ format: 'der', type: 'pkcs8' })
  const b = new EmissorAberto({ ...cfg, segredo })._chaveDeAprovacao(uid).export({ format: 'der', type: 'pkcs8' })
  const c = new EmissorAberto({ ...cfg, segredo: randomBytes(32) })._chaveDeAprovacao(uid).export({ format: 'der', type: 'pkcs8' })
  assert.deepEqual(a, b)
  assert.notDeepEqual(a, c)
})
