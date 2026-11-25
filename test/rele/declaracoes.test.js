// SPDX-License-Identifier: AGPL-3.0-or-later
// Declarações da pessoa no relé: política e revogação. Chegam direto da pessoa, assinadas com a chave de APROVAÇÃO.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { LIMITES, assinar, bytesCanonicos, DOMINIOS, paraB64u } from '../../packages/protocolo/src/index.js'
import { autorizacaoDe, politicaDe, revogacaoDe } from '../ajuda/mundo.js'
import { codigoDe, erroDe, novoMundo, publicar, roverRegistrado } from '../ajuda/rele-de-teste.js'

const novoIdDeAutorizacao = () => `au_${paraB64u(randomBytes(32)).slice(0, 43)}`
const enviar = (m, declaracao) => m.rele.aceitarDeclaracao({ declaracao })
const politica = (m, r, extra = {}) => politicaDe(r, { emitidaEm: m.relogio.agora, ...extra })
const revogacao = (m, r, alvo, extra = {}) => revogacaoDe(r, alvo, { revogadaEm: m.relogio.agora, ...extra })

test('política da pessoa: aceita, aparece no perfil, e reenviar a mesma é "duplicada" sem efeito', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const p = politica(m, r, { grafo: 'contagens', exigirAprovacao: ['reacao', 'seguir'] })
  assert.deepEqual(enviar(m, p), { estado: 'aceita' })
  const perfil = m.rele.perfil(r.uid)
  assert.equal(perfil.grafo, 'contagens')
  assert.deepEqual(perfil.exigirAprovacao, ['reacao', 'seguir'])
  assert.deepEqual(enviar(m, p), { estado: 'duplicada' })
  assert.equal(m.armazem.politica(r.uid).emitida_em, p.emitidaEm)
  // o relé guarda a declaração inteira, assinada, para quem for auditar
  assert.deepEqual(JSON.parse(m.armazem.politica(r.uid).declaracao), p)
})

test('política mais nova substitui; igual em data mas diferente, ou mais velha, é "declaracao_antiga"', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  enviar(m, politica(m, r, { grafo: 'privado' }))
  const mesmaDataOutroConteudo = politica(m, r, { grafo: 'publico' })
  assert.equal(erroDe(() => enviar(m, mesmaDataOutroConteudo)).codigo, 'declaracao_antiga')
  assert.equal(erroDe(() => enviar(m, mesmaDataOutroConteudo)).campo, 'declaracao.emitidaEm')
  assert.equal(codigoDe(() => enviar(m, politica(m, r, { grafo: 'publico', emitidaEm: m.relogio.agora - 1 }))), 'declaracao_antiga')
  assert.equal(m.rele.perfil(r.uid).grafo, 'privado', 'a recusada não mexeu em nada')
  assert.equal(enviar(m, politica(m, r, { grafo: 'publico', emitidaEm: m.relogio.agora + 1 })).estado, 'aceita')
  assert.equal(m.rele.perfil(r.uid).grafo, 'publico')
  assert.equal(m.armazem.politica(r.uid).emitida_em, m.relogio.agora + 1)
  // uma declaração velha reenviada depois da nova (replay) não desfaz a nova
  assert.equal(codigoDe(() => enviar(m, mesmaDataOutroConteudo)), 'declaracao_antiga')
  assert.equal(m.rele.perfil(r.uid).grafo, 'publico')
})

test('relógio da declaração: até 2 minutos no futuro, e nem um segundo a mais', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  assert.equal(erroDe(() => enviar(m, politica(m, r, { emitidaEm: m.relogio.agora + 121 }))).codigo, 'relogio')
  assert.equal(erroDe(() => enviar(m, politica(m, r, { emitidaEm: m.relogio.agora + 121 }))).campo, 'declaracao')
  assert.equal(enviar(m, politica(m, r, { emitidaEm: m.relogio.agora + 120 })).estado, 'aceita')
  assert.equal(codigoDe(() => enviar(m, revogacao(m, r, 'todas', { revogadaEm: m.relogio.agora + 121 }))), 'relogio')
  assert.equal(enviar(m, revogacao(m, r, 'todas', { revogadaEm: m.relogio.agora + 120 })).estado, 'aceita')
  // do passado, qualquer data vale: uma pessoa offline pode enviar o que assinou há dias
  assert.equal(enviar(m, revogacao(m, r, novoIdDeAutorizacao(), { revogadaEm: m.relogio.agora - 5 * 86400 })).estado, 'aceita')
})

test('assinatura: só a chave de APROVAÇÃO do rover vale, não a de rede, não a de outro rover, nem conteúdo mexido', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const outro = roverRegistrado(m)
  const p = politica(m, r, { grafo: 'privado' })
  const dela = (chave) => ({ ...p, assinatura: assinar(DOMINIOS.politica, bytesCanonicos((({ assinatura: _a, ...x }) => x)(p)), chave) })
  for (const falsa of [dela(r.rede.chavePrivada), dela(outro.aprovacao.chavePrivada), dela(outro.rede.chavePrivada), { ...p, grafo: 'publico' }, { ...p, emitidaEm: p.emitidaEm + 1 }]) {
    const e = erroDe(() => enviar(m, falsa))
    assert.equal(e.codigo, 'assinatura_invalida')
    assert.equal(e.campo, 'declaracao.assinatura')
  }
  assert.equal(m.rele.perfil(r.uid).grafo, 'publico')
  assert.equal(m.armazem.politica(r.uid), null)
  // revogação forjada pelo rover (chave de rede) também não vale
  const rev = revogacao(m, r, 'todas')
  const forjada = { ...rev, assinatura: assinar(DOMINIOS.revogacao, bytesCanonicos((({ assinatura: _a, ...x }) => x)(rev)), r.rede.chavePrivada) }
  assert.equal(codigoDe(() => enviar(m, forjada)), 'assinatura_invalida')
  assert.equal(m.armazem.um('SELECT COUNT(*) AS n FROM autorizacoes_revogadas').n, 0)
})

test('uma política não vale como revogação nem o contrário: o domínio da assinatura é outro', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const p = politica(m, r)
  const rev = revogacao(m, r, 'todas')
  assert.equal(codigoDe(() => enviar(m, { ...rev, tipo: 'politica-da-pessoa' })), 'esquema')
  assert.equal(codigoDe(() => enviar(m, { ...p, tipo: 'revogar-autorizacao' })), 'esquema')
})

test('ordem da validação: envelope, forma, rover conhecido, assinatura, relógio', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const desconhecido = roverRegistrado(novoMundo()) // existe em outro relé, não neste
  // envelope fechado
  assert.equal(erroDe(() => m.rele.aceitarDeclaracao({ declaracao: politica(m, r), extra: 1 })).campo, 'envelope.extra')
  assert.equal(erroDe(() => m.rele.aceitarDeclaracao({})).campo, 'envelope.declaracao')
  for (const ruim of [null, 'x', [], 7]) assert.equal(codigoDe(() => m.rele.aceitarDeclaracao(ruim)), 'esquema')
  // forma antes de tudo (o rover nem é consultado)
  assert.equal(codigoDe(() => enviar(m, { ...politica(m, desconhecido), grafo: 'x' })), 'esquema')
  // rover conhecido antes da assinatura
  const semAssinar = { ...politica(m, desconhecido), assinatura: 'A'.repeat(86) }
  assert.equal(codigoDe(() => enviar(m, semAssinar)), 'nao_encontrado')
  // assinatura antes do relógio
  const futuraEFalsa = { ...politica(m, r, { emitidaEm: m.relogio.agora + 9999 }), assinatura: 'A'.repeat(86) }
  assert.equal(codigoDe(() => enviar(m, futuraEFalsa)), 'assinatura_invalida')
  // relógio antes da regra do tipo
  enviar(m, politica(m, r))
  assert.equal(codigoDe(() => enviar(m, politica(m, r, { emitidaEm: m.relogio.agora + 9999 }))), 'relogio')
})

test('rover desconhecido, ou que saiu: "não encontrado", sem pista', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const estranho = { ...r, uid: `rvr_${'Q'.repeat(22)}` }
  assert.equal(codigoDe(() => enviar(m, politica(m, estranho))), 'nao_encontrado')
  publicar(m, r, 'remocao-pelo-autor', { alvo: m.rele.perfil(r.uid).perfil.id })
  assert.equal(codigoDe(() => enviar(m, politica(m, r, { emitidaEm: m.relogio.agora + 1 }))), 'nao_encontrado')
  assert.equal(codigoDe(() => enviar(m, revogacao(m, r, 'todas'))), 'nao_encontrado')
})

test('atestado vencido, rover bloqueado e emissor revogado ainda podem receber política e revogação (só protegem)', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  m.rele.bloquear({ tipo: 'rover', alvo: r.uid, motivo: 'teste' })
  assert.equal(enviar(m, politica(m, r, { grafo: 'privado' })).estado, 'aceita')
  assert.equal(enviar(m, revogacao(m, r, 'todas')).estado, 'aceita')
  m.rele.desbloquear('rover', r.uid)
  m.avancar(40 * 86400) // o atestado de 30 dias venceu
  assert.equal(codigoDe(() => m.rele.perfil(r.uid)), 'nao_encontrado')
  assert.equal(enviar(m, politica(m, r, { grafo: 'contagens', emitidaEm: m.relogio.agora })).estado, 'aceita')
})

// ---------- revogação ----------

test('revogação por id: aceita, duplicada se igual ou mais velha, atualiza se mais nova', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const id = novoIdDeAutorizacao()
  assert.deepEqual(enviar(m, revogacao(m, r, id)), { estado: 'aceita' })
  assert.deepEqual(enviar(m, revogacao(m, r, id)), { estado: 'duplicada' })
  assert.deepEqual(enviar(m, revogacao(m, r, id, { revogadaEm: m.relogio.agora - 10 })), { estado: 'duplicada' })
  assert.deepEqual(enviar(m, revogacao(m, r, id, { revogadaEm: m.relogio.agora + 10 })), { estado: 'aceita' })
  const linha = m.armazem.um('SELECT * FROM autorizacoes_revogadas WHERE autor = :a AND alvo = :id', { a: r.uid, id })
  assert.equal(linha.em, m.relogio.agora + 10)
  assert.equal(linha.recebida_em, m.relogio.agora)
  assert.equal(m.armazem.um('SELECT COUNT(*) AS n FROM autorizacoes_revogadas').n, 1)
})

test('revogar "todas" e revogar por id são linhas separadas; "todas" não conta no teto', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  assert.equal(enviar(m, revogacao(m, r, 'todas')).estado, 'aceita')
  assert.equal(enviar(m, revogacao(m, r, novoIdDeAutorizacao())).estado, 'aceita')
  assert.equal(m.armazem.um('SELECT COUNT(*) AS n FROM autorizacoes_revogadas').n, 2)
  assert.equal(m.armazem.autorizacaoRevogada(r.uid, 'au_qualquer', m.relogio.agora), true)
  assert.equal(m.armazem.autorizacaoRevogada(r.uid, 'au_qualquer', m.relogio.agora + 1), false)
})

test('teto de revogações por rover: 200 por id; a 201ª pede "todas"; trocar uma existente e "todas" continuam livres', () => {
  assert.equal(LIMITES.revogacoesPorRover, 200)
  const m = novoMundo()
  const r = roverRegistrado(m)
  const outro = roverRegistrado(m)
  const ids = Array.from({ length: LIMITES.revogacoesPorRover }, novoIdDeAutorizacao)
  for (const id of ids) enviar(m, revogacao(m, r, id))
  const e = erroDe(() => enviar(m, revogacao(m, r, novoIdDeAutorizacao())))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.match(e.message, /200 revogações/)
  assert.equal(enviar(m, revogacao(m, r, ids[0], { revogadaEm: m.relogio.agora + 5 })).estado, 'aceita')
  assert.equal(enviar(m, revogacao(m, r, 'todas')).estado, 'aceita')
  // o teto é por rover
  assert.equal(enviar(m, revogacao(m, outro, novoIdDeAutorizacao())).estado, 'aceita')
  // 199 ainda deixa passar a 200ª
  const m2 = novoMundo()
  const r2 = roverRegistrado(m2)
  for (const id of ids.slice(0, 199)) enviar(m2, revogacao(m2, r2, id))
  assert.equal(enviar(m2, revogacao(m2, r2, ids[199])).estado, 'aceita')
})

test('revogação de um rover não vale para outro rover com o mesmo id de autorização', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const outro = roverRegistrado(m)
  const id = novoIdDeAutorizacao()
  enviar(m, revogacao(m, r, id))
  assert.equal(m.armazem.autorizacaoRevogada(r.uid, id, 0), true)
  assert.equal(m.armazem.autorizacaoRevogada(outro.uid, id, 0), false)
  assert.equal(m.armazem.autorizacaoRevogada(outro.uid, 'todas', 0), false)
})

// 0.6.0: a autorização "0.6" não vence, então a revogação nunca pode ser esquecida (antes, sumia depois de 7 dias e 2 minutos)
test('retenção: a revogação não some com o tempo; dez anos depois, a autorização revogada continua recusada', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  enviar(m, revogacao(m, r, novoIdDeAutorizacao()))
  enviar(m, revogacao(m, r, 'todas'))
  m.avancar(10 * 365 * 86400)
  assert.equal(m.rele.limpar(), 0)
  assert.equal(m.armazem.um('SELECT COUNT(*) AS n FROM autorizacoes_revogadas').n, 2)
})

test('sair da rede apaga as revogações do rover, e só as dele', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const outro = roverRegistrado(m)
  enviar(m, revogacao(m, r, 'todas'))
  enviar(m, revogacao(m, outro, 'todas'))
  publicar(m, r, 'remocao-pelo-autor', { alvo: m.rele.perfil(r.uid).perfil.id })
  assert.equal(m.armazem.um('SELECT COUNT(*) AS n FROM autorizacoes_revogadas WHERE autor = :a', { a: r.uid }).n, 0)
  assert.equal(m.armazem.um('SELECT COUNT(*) AS n FROM autorizacoes_revogadas WHERE autor = :a', { a: outro.uid }).n, 1)
})

test('uma autorização permanente não é uma declaração: não se registra, ela viaja no objeto', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  assert.equal(erroDe(() => enviar(m, autorizacaoDe(r))).campo, 'declaracao.tipo')
})
