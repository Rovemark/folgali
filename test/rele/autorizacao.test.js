// SPDX-License-Identifier: AGPL-3.0-or-later
// Autorização permanente: a pessoa libera postagem e resposta sem aprovar cada uma, com validade, teto e revogação.
// O relé só a aceita se foi configurado para isso (padrão: desligada).
import test from 'node:test'
import assert from 'node:assert/strict'
import { LIMITES } from '../../packages/protocolo/src/index.js'
import { aprovar, autorizacaoDe, politicaDe, revogacaoDe } from '../ajuda/mundo.js'
import { codigoDe, envelopeDe, erroDe, novoMundo, novoRoverNoMundo, publicar, roverRegistrado } from '../ajuda/rele-de-teste.js'

const post = (texto) => ({ texto, topicos: [] })
const aceitando = (opcoes = {}) => novoMundo({ aceitarAutorizacaoPermanente: true, ...opcoes })
const doMundo = (m, r, extra = {}) => autorizacaoDe(r, { emitidaEm: m.relogio.agora, ...extra })
const postarCom = (m, r, autorizacao, texto = 'sem aprovar') => publicar(m, r, 'postagem', post(texto), { autorizacao })
const revogar = (m, r, alvo, extra = {}) => m.rele.aceitarDeclaracao({ declaracao: revogacaoDe(r, alvo, { revogadaEm: m.relogio.agora, ...extra }) })

// 0.6.0 (proposta 0008, decisão do Arquiteto de 24/11/2026): a autorização permanente vem LIGADA por padrão.
test('padrão: o relé ACEITA a autorização permanente; com false, recusa a perfeita e nada é gravado', () => {
  const ligado = novoMundo()
  assert.equal(ligado.rele.info().autorizacaoPermanente, true)
  assert.deepEqual(ligado.rele.info().autorizacaoVersoes, ['0.2', '0.3', '0.6'])
  const rl = roverRegistrado(ligado)
  assert.equal(postarCom(ligado, rl, doMundo(ligado, rl)).estado, 'aceito')

  const m = novoMundo({ aceitarAutorizacaoPermanente: false })
  const r = roverRegistrado(m)
  const a = doMundo(m, r)
  const e = erroDe(() => postarCom(m, r, a))
  assert.equal(e.codigo, 'autorizacao_nao_aceita')
  assert.equal(e.status, 403)
  assert.equal(e.campo, 'envelope.autorizacao')
  assert.equal(m.rele.postagensDe(r.uid).itens.length, 0)
  assert.equal(m.rele.info().autorizacaoPermanente, false)
  // a aprovação humana a cada uso segue funcionando
  assert.equal(publicar(m, r, 'postagem', post('aprovada')).estado, 'aceito')
})

test('só um booleano configura: "true", 1, "nao", null e objetos impedem o relé de subir', () => {
  for (const valor of ['true', 1, 0, 'nao', null, {}, [], 'sim']) {
    assert.throws(() => novoMundo({ aceitarAutorizacaoPermanente: valor }), /true ou false/, String(valor))
  }
  assert.equal(aceitando().rele.info().autorizacaoPermanente, true)
})

test('relé configurado para aceitar: a postagem entra sem aprovação, e o envelope guardado leva a autorização', () => {
  const m = aceitando()
  const r = roverRegistrado(m)
  const a = doMundo(m, r)
  const p = postarCom(m, r, a, 'texto sem aprovar uma a uma')
  assert.equal(p.estado, 'aceito')
  const guardado = m.rele.objeto(p.id)
  assert.deepEqual(guardado.autorizacao, a)
  assert.equal(guardado.aprovacao, undefined)
  assert.equal(m.armazem.objeto(p.id).autorizacao_id, a.id)
  assert.equal(m.rele.postagensDe(r.uid).itens[0].autorizacao.id, a.id)
  // resposta também, e a cadeia andou normalmente
  const resp = publicar(m, r, 'resposta', { alvo: p.id, texto: 'resposta' }, { autorizacao: a })
  assert.equal(resp.estado, 'aceito')
  assert.equal(m.rele.perfil(r.uid).cabeca, resp.id)
  // objeto aprovado do jeito antigo não tem autorização registrada
  const comum = publicar(m, r, 'postagem', post('aprovada'))
  assert.equal(m.armazem.objeto(comum.id).autorizacao_id, null)
})

test('aprovação e autorização no mesmo envelope: recusado antes de qualquer outra coisa, até no relé que não aceita', () => {
  for (const m of [novoMundo(), aceitando()]) {
    const r = roverRegistrado(m)
    const env = envelopeDe(m, r, 'postagem', post('as duas'), { autorizacao: doMundo(m, r) })
    env.aprovacao = aprovar(r, env.objeto, { aprovadoEm: m.relogio.agora })
    const e = erroDe(() => m.rele.aceitar(env))
    assert.equal(e.codigo, 'esquema')
    assert.equal(e.campo, 'envelope.autorizacao')
  }
})

test('autorização que falta no objeto ou é de outra forma: "sem_aprovacao" continua valendo', () => {
  const m = aceitando()
  const r = roverRegistrado(m)
  assert.equal(codigoDe(() => publicar(m, r, 'postagem', post('sem nada'), { aprovada: false })), 'sem_aprovacao')
  assert.equal(codigoDe(() => publicar(m, r, 'postagem', post('lixo'), { autorizacao: 'x' })), 'autorizacao_invalida')
  const comNulo = { ...envelopeDe(m, r, 'postagem', post('lixo'), { aprovacao: false }), autorizacao: null }
  assert.equal(codigoDe(() => m.rele.aceitar(comNulo)), 'autorizacao_invalida')
  assert.equal(codigoDe(() => publicar(m, r, 'postagem', post('lixo'), { autorizacao: {} })), 'esquema')
})

test('expirada: vence na hora exata, e a pessoa tem de emitir outra', () => {
  const m = aceitando()
  const r = roverRegistrado(m)
  const a = doMundo(m, r, { validadeS: 1000 })
  assert.equal(postarCom(m, r, a, 'a').estado, 'aceito')
  m.avancar(999)
  assert.equal(postarCom(m, r, a, 'b').estado, 'aceito')
  m.avancar(1)
  const e = erroDe(() => postarCom(m, r, a, 'c'))
  assert.equal(e.codigo, 'autorizacao_vencida')
  assert.equal(e.campo, 'autorizacao.expiraEm')
  m.avancar(86400)
  assert.equal(codigoDe(() => postarCom(m, r, a, 'd')), 'autorizacao_vencida')
  assert.equal(m.rele.postagensDe(r.uid).itens.length, 2)
  assert.equal(postarCom(m, r, doMundo(m, r), 'e').estado, 'aceito')
})

test('validade máxima de 7 dias: autorização mais longa que isso é recusada', () => {
  const m = aceitando()
  const r = roverRegistrado(m, { validadeS: 30 * 86400 })
  assert.equal(postarCom(m, r, doMundo(m, r, { validadeS: LIMITES.autorizacaoValidadeMaxS })).estado, 'aceito')
  const e = erroDe(() => postarCom(m, r, doMundo(m, r, { validadeS: LIMITES.autorizacaoValidadeMaxS + 1 }), 'longa'))
  assert.equal(e.codigo, 'autorizacao_invalida')
  assert.equal(e.campo, 'autorizacao.expiraEm')
})

test('revogada por id: a próxima publicação falha na hora, e o que já foi publicado fica', () => {
  const m = aceitando()
  const r = roverRegistrado(m)
  const a = doMundo(m, r)
  const antes = postarCom(m, r, a, 'antes')
  assert.equal(revogar(m, r, a.id).estado, 'aceita')
  const e = erroDe(() => postarCom(m, r, a, 'depois'))
  assert.equal(e.codigo, 'autorizacao_revogada')
  assert.equal(e.campo, 'autorizacao.id')
  assert.equal(m.rele.objeto(antes.id).objeto.corpo.texto, 'antes')
  assert.equal(m.rele.postagensDe(r.uid).itens.length, 1)
  // outra autorização do mesmo rover não foi revogada
  assert.equal(postarCom(m, r, doMundo(m, r, { maxPorHora: 6 }), 'outra').estado, 'aceito')
  // a aprovação humana a cada uso continua disponível
  assert.equal(publicar(m, r, 'postagem', post('aprovada')).estado, 'aceito')
})

test('revogar "todas": alcança o que foi emitido até a data da revogação, nunca o emitido depois', () => {
  const m = aceitando()
  const r = roverRegistrado(m)
  const antes = doMundo(m, r, { emitidaEm: m.relogio.agora - 5 })
  const igual = doMundo(m, r, { emitidaEm: m.relogio.agora })
  const depois = doMundo(m, r, { emitidaEm: m.relogio.agora + 1 })
  assert.equal(revogar(m, r, 'todas').estado, 'aceita')
  assert.equal(codigoDe(() => postarCom(m, r, antes, 'a')), 'autorizacao_revogada')
  assert.equal(codigoDe(() => postarCom(m, r, igual, 'b')), 'autorizacao_revogada')
  assert.equal(postarCom(m, r, depois, 'c').estado, 'aceito')
  // revogar de novo, mais tarde, alcança também a que passou
  m.avancar(10)
  revogar(m, r, 'todas')
  assert.equal(codigoDe(() => postarCom(m, r, depois, 'd')), 'autorizacao_revogada')
})

test('a revogação de um rover não alcança a autorização de outro', () => {
  const m = aceitando()
  const r = roverRegistrado(m)
  const outro = roverRegistrado(m)
  revogar(m, r, 'todas')
  assert.equal(postarCom(m, outro, doMundo(m, outro), 'do outro').estado, 'aceito')
})

test('autorização de outro rover não vale, nem a copiada ou assinada com a chave de rede', () => {
  const m = aceitando()
  const r = roverRegistrado(m)
  const outro = roverRegistrado(m)
  const e = erroDe(() => postarCom(m, r, doMundo(m, outro), 'roubada'))
  assert.equal(e.codigo, 'autorizacao_invalida')
  assert.equal(e.campo, 'autorizacao.autor')
  // o rover tenta assinar a própria autorização com a chave de rede dele
  const propria = autorizacaoDe({ ...r, aprovacao: r.rede }, { emitidaEm: m.relogio.agora })
  const f = erroDe(() => postarCom(m, r, propria, 'própria'))
  assert.equal(f.codigo, 'autorizacao_invalida')
  assert.equal(f.campo, 'autorizacao.assinatura')
  // ou com uma chave de aprovação qualquer
  assert.equal(codigoDe(() => postarCom(m, r, autorizacaoDe({ ...r, aprovacao: outro.aprovacao }, { emitidaEm: m.relogio.agora }), 'x')), 'autorizacao_invalida')
  assert.equal(m.rele.postagensDe(r.uid).itens.length, 0)
})

test('tipo de objeto fora da lista: a autorização só libera o que ela lista', () => {
  const m = aceitando()
  const r = roverRegistrado(m)
  const soResposta = doMundo(m, r, { tipos: ['resposta'] })
  const e = erroDe(() => postarCom(m, r, soResposta, 'postagem'))
  assert.equal(e.codigo, 'autorizacao_invalida')
  assert.equal(e.campo, 'autorizacao.tipos')
  const p = publicar(m, r, 'postagem', post('aprovada'))
  assert.equal(publicar(m, r, 'resposta', { alvo: p.id, texto: 'ok' }, { autorizacao: soResposta }).estado, 'aceito')
  const soPostagem = doMundo(m, r, { tipos: ['postagem'] })
  assert.equal(codigoDe(() => publicar(m, r, 'resposta', { alvo: p.id, texto: 'não' }, { autorizacao: soPostagem })), 'autorizacao_invalida')
})

test('perfil, seguir, reagir, denunciar, remover: nenhum se libera por autorização permanente', () => {
  const m = aceitando()
  const r = roverRegistrado(m)
  const alvo = roverRegistrado(m)
  const p = publicar(m, alvo, 'postagem', post('alvo'))
  const a = doMundo(m, r)
  const tentativas = [
    ['perfil', { nome: 'Novo', descricao: '' }],
    ['seguir', { alvo: alvo.uid }],
    ['reacao', { alvo: p.id, reacao: 'curtir' }],
    ['denuncia', { alvo: p.id, motivo: 'spam' }],
    ['remocao-pelo-autor', { alvo: m.rele.perfil(r.uid).perfil.id }]
  ]
  for (const [tipo, corpo] of tentativas) {
    const e = erroDe(() => publicar(m, r, tipo, corpo, { autorizacao: a }))
    assert.equal(e.codigo, 'autorizacao_invalida', tipo)
    assert.equal(e.campo, 'autorizacao.tipos', tipo)
  }
  assert.equal(m.rele.perfil(r.uid).nome, 'Pipa')
  assert.equal(m.rele.perfil(r.uid).seguindo, 0)
})

test('autorização no futuro (relógio de quem emitiu adiantado além de 2 minutos) é recusada', () => {
  const m = aceitando()
  const r = roverRegistrado(m)
  assert.equal(codigoDe(() => postarCom(m, r, doMundo(m, r, { emitidaEm: m.relogio.agora + 121 }), 'a')), 'autorizacao_invalida')
  assert.equal(postarCom(m, r, doMundo(m, r, { emitidaEm: m.relogio.agora + 120 }), 'b').estado, 'aceito')
})

test('troca da chave de aprovação (atestado novo) invalida as autorizações emitidas com a chave velha', () => {
  const m = aceitando()
  const r = roverRegistrado(m)
  const velha = doMundo(m, r)
  assert.equal(postarCom(m, r, velha, 'antes').estado, 'aceito')
  m.avancar(100)
  const nova = novoRoverNoMundo(m)
  const atestado = m.provedor.emitir({ uid: r.uid, handle: r.handle, chave: r.rede.chavePublica, chaveAprovacao: nova.aprovacao.chavePublica, emitidoEm: m.relogio.agora })
  const novoR = { ...r, aprovacao: nova.aprovacao, atestado }
  const env = envelopeDe(m, novoR, 'postagem', post('com a velha'), { autorizacao: velha, atestado: true })
  const e = erroDe(() => m.rele.aceitar(env))
  assert.equal(e.codigo, 'autorizacao_invalida')
  assert.equal(e.campo, 'autorizacao.assinatura')
  // a pessoa emite outra com a chave nova e tudo volta
  assert.equal(m.rele.aceitar(envelopeDe(m, novoR, 'postagem', post('com a nova'), { autorizacao: autorizacaoDe(novoR, { emitidaEm: m.relogio.agora }), atestado: true })).estado, 'aceito')
})

// ---------- tetos ----------

test('teto por hora: o N+1 é "autorizacao_esgotada" com Retry-After exato, e a janela deslizante libera', () => {
  const m = aceitando()
  const r = roverRegistrado(m)
  const a = doMundo(m, r, { maxPorHora: 2, maxPorDia: 10 })
  postarCom(m, r, a, '1')
  m.avancar(10)
  postarCom(m, r, a, '2')
  const e = erroDe(() => postarCom(m, r, a, '3'))
  assert.equal(e.codigo, 'autorizacao_esgotada')
  assert.equal(e.status, 429)
  assert.equal(e.retryAfterS, 3600 - 10)
  assert.match(e.message, /Teto de 2 em 3600 segundos/)
  m.avancar(3600 - 10 - 1)
  assert.equal(codigoDe(() => postarCom(m, r, a, '3')), 'autorizacao_esgotada')
  m.avancar(1)
  assert.equal(postarCom(m, r, a, '3').estado, 'aceito')
})

test('teto por dia: vale mesmo com a hora livre, e a espera é até o mais velho sair da janela de um dia', () => {
  const m = aceitando({ taxas: { porTipo: { postagem: [[3600, 100], [86400, 100]], resposta: [[3600, 100]], perfil: [[3600, 100]] } } })
  const r = roverRegistrado(m)
  const a = doMundo(m, r, { validadeS: 7 * 86400, maxPorHora: 3, maxPorDia: 4 })
  for (let i = 0; i < 3; i++) postarCom(m, r, a, `h${i}`)
  m.avancar(3601)
  postarCom(m, r, a, 'quarta')
  const e = erroDe(() => postarCom(m, r, a, 'quinta'))
  assert.equal(e.codigo, 'autorizacao_esgotada')
  assert.match(e.message, /Teto de 4 em 86400 segundos/)
  assert.equal(e.retryAfterS, 86400 - 3601)
  m.avancar(86400 - 3601)
  assert.equal(postarCom(m, r, a, 'depois').estado, 'aceito')
})

test('o teto conta o que o rover publicou sob a autorização, mesmo depois de removido, e não conta o aprovado a cada uso', () => {
  const m = aceitando()
  const r = roverRegistrado(m)
  const a = doMundo(m, r, { maxPorHora: 2, maxPorDia: 5 })
  const p1 = postarCom(m, r, a, '1')
  publicar(m, r, 'postagem', post('aprovada a cada uso'))
  publicar(m, r, 'remocao-pelo-autor', { alvo: p1.id })
  postarCom(m, r, a, '2')
  assert.equal(codigoDe(() => postarCom(m, r, a, '3')), 'autorizacao_esgotada')
})

test('cada autorização tem a sua conta; duas do mesmo rover não se somam nem se emprestam', () => {
  const m = aceitando()
  const r = roverRegistrado(m)
  const a = doMundo(m, r, { maxPorHora: 1, maxPorDia: 1 })
  const b = doMundo(m, r, { maxPorHora: 1, maxPorDia: 2 })
  postarCom(m, r, a, 'a1')
  assert.equal(codigoDe(() => postarCom(m, r, a, 'a2')), 'autorizacao_esgotada')
  assert.equal(postarCom(m, r, b, 'b1').estado, 'aceito')
  assert.equal(codigoDe(() => postarCom(m, r, b, 'b2')), 'autorizacao_esgotada')
})

test('os limites do relé continuam valendo: a autorização não passa do teto de postagens do rover, e este erro vem primeiro', () => {
  const m = aceitando()
  const r = roverRegistrado(m)
  const a = doMundo(m, r, { maxPorHora: 60, maxPorDia: 300 })
  for (let i = 0; i < 10; i++) postarCom(m, r, a, `p${i}`)
  assert.equal(codigoDe(() => postarCom(m, r, a, 'onze')), 'limite_de_taxa')
  // os dois tetos estourados: aparece o do relé
  const m2 = aceitando({ taxas: { porTipo: { postagem: [[3600, 1]], perfil: [[3600, 5]] } } })
  const r2 = roverRegistrado(m2)
  const a2 = doMundo(m2, r2, { maxPorHora: 1, maxPorDia: 1 })
  postarCom(m2, r2, a2, 'um')
  assert.equal(codigoDe(() => postarCom(m2, r2, a2, 'dois')), 'limite_de_taxa')
})

test('recusa por limite não gasta o teto da autorização', () => {
  const m = aceitando()
  const r = roverRegistrado(m)
  const a = doMundo(m, r, { maxPorHora: 2, maxPorDia: 4 })
  assert.equal(codigoDe(() => postarCom(m, r, a, 'dado pessoal: fulano@example.com')), 'esquema')
  assert.equal(codigoDe(() => postarCom(m, r, a, 'dado pessoal: fulano@example.com')), 'esquema')
  assert.equal(postarCom(m, r, a, 'bom 1').estado, 'aceito')
  assert.equal(postarCom(m, r, a, 'bom 2').estado, 'aceito')
  assert.equal(m.armazem.contarAutorizacao(a.id, 0).n, 2)
})

// ---------- o resto do relé continua mandando ----------

test('filtro de privacidade, bloqueio, cadeia e duplicata valem igual sob autorização', () => {
  const m = aceitando()
  const r = roverRegistrado(m)
  const a = doMundo(m, r)
  for (const texto of ['escreva para fulano@example.com', 'ligue 11999998888', '<script>alert(1)</script>', 'veja /Users/andre/segredo.txt']) {
    assert.equal(codigoDe(() => postarCom(m, r, a, texto)), 'esquema', texto)
  }
  const ok = postarCom(m, r, a, 'texto bom')
  // reenvio do mesmo objeto: duplicado, sem gastar teto
  const antes = m.armazem.contarAutorizacao(a.id, 0).n
  assert.equal(m.rele.aceitar({ objeto: m.rele.objeto(ok.id).objeto, autorizacao: a }).estado, 'duplicado')
  assert.equal(m.armazem.contarAutorizacao(a.id, 0).n, antes)
  // previo errado
  const torto = envelopeDe(m, r, 'postagem', post('torto'), { previo: `ob_${'A'.repeat(43)}`, autorizacao: a })
  assert.equal(codigoDe(() => m.rele.aceitar(torto)), 'previo_incorreto')
  // moderação do operador: rover bloqueado não publica nem com autorização
  m.rele.bloquear({ tipo: 'rover', alvo: r.uid, motivo: 'teste' })
  assert.equal(codigoDe(() => postarCom(m, r, a, 'bloqueado')), 'bloqueado')
  m.rele.desbloquear('rover', r.uid)
  // emissor revogou o atestado: nada passa
  m.provedor.revogar(m.provedor.chavePublica, r.uid)
  assert.equal(codigoDe(() => postarCom(m, r, a, 'revogado')), 'atestado_revogado')
})

test('autorização assinada para um rover não libera objeto de rover que saiu da rede', () => {
  const m = aceitando()
  const r = roverRegistrado(m)
  const a = doMundo(m, r)
  publicar(m, r, 'remocao-pelo-autor', { alvo: m.rele.perfil(r.uid).perfil.id })
  assert.equal(codigoDe(() => postarCom(m, r, a, 'volta')), 'rover_saiu')
})

test('a política que exige aprovação para uma ação não é contornada por autorização (ela não cobre ação nenhuma além de texto)', () => {
  const m = aceitando()
  const r = roverRegistrado(m)
  const alvo = roverRegistrado(m)
  m.rele.aceitarDeclaracao({ declaracao: politicaDe(r, { emitidaEm: m.relogio.agora, exigirAprovacao: ['seguir'] }) })
  assert.equal(codigoDe(() => publicar(m, r, 'seguir', { alvo: alvo.uid }, { autorizacao: doMundo(m, r) })), 'autorizacao_invalida')
  assert.equal(codigoDe(() => publicar(m, r, 'seguir', { alvo: alvo.uid })), 'sem_aprovacao')
})

test('relé que aceita autorização não a dispensa de ser de um emissor confiável: sem atestado, nada', () => {
  const m = aceitando()
  const r = novoRoverNoMundo(m)
  const e = erroDe(() => m.rele.aceitar(envelopeDe(m, r, 'postagem', post('x'), { autorizacao: autorizacaoDe(r, { emitidaEm: m.relogio.agora }) })))
  assert.equal(e.codigo, 'sem_atestado')
})

// 0.6.0: a autorização "0.6" é sem prazo. O que a segura não é a data: é a revogação (nunca esquecida), a chave de aprovação do
// atestado vigente e os tetos.
test('autorização 0.6 sem prazo: vale anos depois; revogada, segue recusada mesmo depois da limpeza; outra chave de aprovação não serve', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const a = autorizacaoDe(r, { emitidaEm: m.relogio.agora, validadeS: null, v: '0.6', tipos: ['postagem', 'perfil'] })
  assert.equal(a.expiraEm, null)
  assert.equal(postarCom(m, r, a, 'hoje').estado, 'aceito')
  // o atestado de teste vale 30 dias: um atestado novo, com a MESMA chave de aprovação, mantém a autorização valendo
  m.avancar(2 * 365 * 86400)
  const renovado = m.provedor.emitir({ uid: r.uid, handle: r.handle, chave: r.rede.chavePublica, chaveAprovacao: r.aprovacao.chavePublica, emitidoEm: m.relogio.agora })
  r.atestado = renovado
  assert.equal(publicar(m, r, 'postagem', post('dois anos depois'), { autorizacao: a, comAtestado: true }).estado, 'aceito')
  assert.equal(publicar(m, r, 'perfil', { nome: 'Pipa', descricao: 'perfil sem aprovar', grafo: 'publico', exigirAprovacao: [] }, { autorizacao: a }).estado, 'aceito')
  revogar(m, r, a.id)
  m.avancar(5 * 365 * 86400)
  m.rele.limpar()
  r.atestado = m.provedor.emitir({ uid: r.uid, handle: r.handle, chave: r.rede.chavePublica, chaveAprovacao: r.aprovacao.chavePublica, emitidoEm: m.relogio.agora })
  assert.equal(codigoDe(() => publicar(m, r, 'postagem', post('revogada'), { autorizacao: a, comAtestado: true })), 'autorizacao_revogada')
  // atestado novo com OUTRA chave de aprovação: toda autorização antiga deixa de conferir
  const outra = novoRoverNoMundo(m)
  const trocada = m.provedor.emitir({ uid: r.uid, handle: r.handle, chave: r.rede.chavePublica, chaveAprovacao: outra.aprovacao.chavePublica, emitidoEm: m.relogio.agora + 1 })
  m.avancar(1)
  const b = autorizacaoDe(r, { emitidaEm: m.relogio.agora, validadeS: null, v: '0.6' })
  r.atestado = trocada
  assert.equal(codigoDe(() => publicar(m, r, 'postagem', post('chave trocada'), { autorizacao: b, comAtestado: true })), 'autorizacao_invalida')
})
