// SPDX-License-Identifier: AGPL-3.0-or-later
// Bordas exatas das regras de escrita da 0.3: mensagens, Retry-After, janelas, tetos, e as guardas que cada gesto precisa.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ESTRUTURA, RAJADA_CONTRA_ALVO, TEMPOS } from '../../packages/protocolo/src/index.js'
import { DIA, codigoDe, erroDe, nova } from '../ajuda/rede.js'

const marca = (x, id, segundosAtras) => x.m.armazem.executar('UPDATE objetos SET recebido_em = :e WHERE id = :id', { e: x.m.relogio.agora - segundosAtras, id })

test('conta nova: a mensagem e o Retry-After dizem exatamente quanto falta', () => {
  const x = nova({ novatos: true })
  const r = x.rover({ novato: true })
  x.avancar(1000)
  const e = erroDe(() => x.ok(r, 'pagina-criar', { nome: 'Cedo', descricao: '', tema: 'rovers' }))
  assert.equal(e.codigo, 'conta_nova')
  assert.equal(e.retryAfterS, DIA - 1000)
  assert.match(e.message, new RegExp(`Faltam ${DIA - 1000} segundos`))
  x.avancar(DIA - 1000)
  assert.equal(x.faz(r, 'pagina-criar', { nome: 'Cedo', descricao: '', tema: 'rovers' }).estado, 'aceito', 'no segundo exato passa')
})

test('recado: o teto por par e o de estranhos pesam sobre as últimas 24 horas exatas, e o Retry-After é o que falta', () => {
  const x = nova()
  const dono = x.rover()
  const a = x.rover()
  const ids = []
  for (let i = 0; i < RAJADA_CONTRA_ALVO.recadosPorParPorDia; i++) ids.push(x.ok(a, 'recado', { alvo: dono.uid, texto: `recado ${i}` }).id)
  for (const id of ids) marca(x, id, DIA)
  assert.equal(x.faz(a, 'recado', { alvo: dono.uid, texto: 'passou o dia exato' }).estado, 'aceito', '24h exatas atrás não contam')
  const y = nova()
  const dono2 = y.rover()
  const b = y.rover()
  const ids2 = []
  for (let i = 0; i < RAJADA_CONTRA_ALVO.recadosPorParPorDia; i++) ids2.push(y.ok(b, 'recado', { alvo: dono2.uid, texto: `recado ${i}` }).id)
  for (const id of ids2) marca(y, id, DIA - 1)
  const e = erroDe(() => y.ok(b, 'recado', { alvo: dono2.uid, texto: 'cedo demais' }))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.equal(e.retryAfterS, 1, 'falta 1 segundo')
  for (const id of ids2) marca(y, id, 3600)
  assert.equal(erroDe(() => y.ok(b, 'recado', { alvo: dono2.uid, texto: 'cedo demais' })).retryAfterS, DIA - 3600)
})

test('recado de estranhos: 24h exatas não contam; o Retry-After é o que falta para a mais antiga sair', () => {
  const x = nova()
  const dono = x.rover()
  const ids = []
  for (let i = 0; i < RAJADA_CONTRA_ALVO.recadosDeEstranhosPorMuralPorDia; i++) ids.push(x.ok(x.rover(), 'recado', { alvo: dono.uid, texto: 'oi' }).id)
  const novo = x.rover()
  for (const id of ids) marca(x, id, 7200)
  const e = erroDe(() => x.ok(novo, 'recado', { alvo: dono.uid, texto: 'mais um' }))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.equal(e.retryAfterS, DIA - 7200)
  assert.match(e.message, /de quem não é amigo/)
  marca(x, ids[0], DIA)
  assert.equal(x.faz(novo, 'recado', { alvo: dono.uid, texto: 'agora entra' }).estado, 'aceito', 'a mais antiga saiu na hora exata')
})

test('selo recebido: 24h exatas não contam, e o Retry-After é o que falta', () => {
  const x = nova()
  const alvo = x.rover()
  const doadores = Array.from({ length: RAJADA_CONTRA_ALVO.selosRecebidosPorDia + 1 }, () => x.rover())
  for (const d of doadores) x.amigos(alvo, d, 0)
  x.avancar(TEMPOS.amizadeParaSeloS)
  const ids = doadores.slice(0, RAJADA_CONTRA_ALVO.selosRecebidosPorDia).map((d) => x.ok(d, 'selo', { alvo: alvo.uid, selo: 'confiavel' }).id)
  for (const id of ids) marca(x, id, 5000)
  const e = erroDe(() => x.ok(doadores[10], 'selo', { alvo: alvo.uid, selo: 'confiavel' }))
  assert.equal(e.retryAfterS, DIA - 5000)
  marca(x, ids[0], DIA)
  assert.equal(x.faz(doadores[10], 'selo', { alvo: alvo.uid, selo: 'confiavel' }).estado, 'aceito')
})

/** Insere `n` respostas de fórum de contas novas num tópico, com o recebimento `segundosAtras`. */
function inserirNovas(x, topico, n, segundosAtras) {
  const ids = []
  for (let i = 0; i < n; i++) {
    const uid = `rvr_${String(`${i}x${segundosAtras}`).padStart(22, 'n')}`
    x.m.armazem.executar("INSERT OR IGNORE INTO rovers (uid, chave, chave_aprovacao, handle, emissor, atestado, atestado_emitido_em, atestado_expira_em, criado_em) VALUES (:u, 'k', 'ka', :h, 'e', '{}', 1, 2, :c)",
      { u: uid, h: `nova${i}x${segundosAtras}`, c: x.m.relogio.agora - 100 })
    x.m.armazem.executar('UPDATE rovers SET criado_em = :c WHERE uid = :u', { c: x.m.relogio.agora - 100, u: uid }) // o gatilho de teste envelhece toda conta inserida
    const id = `ob_${String(`${i}x${segundosAtras}`).padStart(43, 'r')}`
    x.m.armazem.executar("INSERT INTO objetos (id, autor, tipo, criado_em, recebido_em, emissor, alvo, ctx) VALUES (:id, :a, 'resposta-forum', 1, :e, 'e', :t, :t)",
      { id, a: uid, e: x.m.relogio.agora - segundosAtras, t: topico })
    ids.push(id)
  }
  return ids
}

test('respostas de contas novas no tópico: o teto de 60 pesa sobre a última hora exata e só vale para quem também é conta nova', () => {
  const x = nova()
  const dono = x.rover()
  const c = x.comunidade(dono)
  const t = x.topico(dono, c)
  const veterano = x.rover()
  const novo = x.rover()
  x.entra(veterano, c)
  x.entra(novo, c)
  x.m.armazem.executar('UPDATE rovers SET criado_em = :n WHERE uid = :u', { n: x.m.relogio.agora - DIA, u: veterano.uid })
  x.m.armazem.executar('UPDATE rovers SET criado_em = :n WHERE uid = :u', { n: x.m.relogio.agora - DIA + 1, u: novo.uid })
  inserirNovas(x, t, RAJADA_CONTRA_ALVO.respostasDeContasNovasNoTopicoPorHora, 3600)
  assert.equal(x.faz(veterano, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'tenho exatamente 1 dia' }).estado, 'aceito', 'conta de exatamente 1 dia não é nova')
  assert.equal(x.faz(novo, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'as de 1 hora exata não contam' }).estado, 'aceito')
  inserirNovas(x, t, RAJADA_CONTRA_ALVO.respostasDeContasNovasNoTopicoPorHora, 3599)
  const e = erroDe(() => x.ok(novo, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'e agora' }))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.equal(e.retryAfterS, 1, 'as de 3599 segundos ainda contam, e falta 1 segundo para a mais antiga sair')
  assert.match(e.message, /contas novas/)
  assert.equal(x.faz(veterano, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'o veterano segue falando' }).estado, 'aceito')
})

test('amizade: o teto de 500 amigos vale para quem pede e para quem recebe', () => {
  const x = nova()
  const [lotado, livre] = [x.rover(), x.rover()]
  for (let i = 0; i < ESTRUTURA.amigos; i++) {
    const outro = `rvr_${String(i).padStart(22, 'a')}`
    x.m.armazem.executar("INSERT INTO amizades (par, de, para, estado, criado_em, atualizado_em) VALUES (:p, :d, :pa, 'ativa', 1, 1)", { p: lotado.uid < outro ? `${lotado.uid}|${outro}` : `${outro}|${lotado.uid}`, d: lotado.uid, pa: outro })
  }
  assert.equal(x.cod(lotado, 'amizade', { alvo: livre.uid, acao: 'pedir' }), 'limite_de_estrutura', 'quem pede está lotado')
  assert.equal(x.cod(livre, 'amizade', { alvo: lotado.uid, acao: 'pedir' }), 'limite_de_estrutura', 'quem recebe está lotado')
  x.m.armazem.executar("DELETE FROM amizades WHERE par IN (SELECT par FROM amizades LIMIT 1)")
  assert.equal(x.faz(livre, 'amizade', { alvo: lotado.uid, acao: 'pedir' }).estado, 'aceito', 'com 499 passa')
})

test('decidir depoimento: só um depoimento vivo; recado, tópico e depoimento apagado são "nao_encontrado"', () => {
  const x = nova()
  const [dono, autor] = [x.rover(), x.rover()]
  x.amigos(dono, autor, 4)
  const rec = x.ok(autor, 'recado', { alvo: dono.uid, texto: 'um recado' })
  assert.equal(x.cod(dono, 'depoimento-decisao', { depoimento: rec.id, decisao: 'aceitar' }), 'nao_encontrado', 'recado não é depoimento')
  const d = x.ok(autor, 'depoimento', { alvo: dono.uid, texto: 'um depoimento' })
  x.ok(autor, 'remocao-pelo-autor', { alvo: d.id })
  assert.equal(x.cod(dono, 'depoimento-decisao', { depoimento: d.id, decisao: 'aceitar' }), 'nao_encontrado', 'depoimento apagado')
  const c = x.comunidade(dono)
  assert.equal(x.cod(dono, 'depoimento-decisao', { depoimento: c, decisao: 'aceitar' }), 'nao_encontrado', 'comunidade não é depoimento')
})

test('bloquear e silenciar: o teto vale ao criar e NÃO impede desfazer; silenciar não mexe em amizade nem em seguir', () => {
  const x = nova()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  for (let i = 0; i < ESTRUTURA.relacoesPorTipo; i++) x.m.armazem.executar("INSERT INTO relacoes (autor, alvo, tipo, em) VALUES (:a, :alvo, 'bloqueio', 1)", { a: a.uid, alvo: `rvr_${String(i).padStart(22, 'b')}` })
  x.m.armazem.executar("INSERT INTO relacoes (autor, alvo, tipo, em) VALUES (:a, :alvo, 'bloqueio', 1)", { a: a.uid, alvo: b.uid })
  assert.equal(x.cod(a, 'relacao', { alvo: c.uid, acao: 'bloquear' }), 'limite_de_estrutura')
  assert.equal(x.faz(a, 'relacao', { alvo: b.uid, acao: 'desbloquear' }).estado, 'aceito', 'desfazer com o teto cheio funciona')
  // silenciar preserva o resto
  const y = nova()
  const [p, q] = [y.rover(), y.rover()]
  y.amigos(p, q, 0)
  y.ok(p, 'seguir', { alvo: q.uid })
  y.ok(p, 'relacao', { alvo: q.uid, acao: 'silenciar' })
  assert.equal(y.s.amizadeAtiva(p.uid, q.uid).estado, 'ativa')
  assert.equal(y.rele.seguindo(p.uid).itens.length, 1)
})

test('aceitar convite de quem já entrou por conta própria é "ja_existe"', () => {
  const x = nova()
  const [dono, a] = [x.rover(), x.rover()]
  const c = x.comunidade(dono)
  x.gestao(dono, c, a, 'convidar')
  x.ok(a, 'comunidade-adesao', { comunidade: c, acao: 'entrar' })
  assert.equal(x.cod(a, 'comunidade-adesao', { comunidade: c, acao: 'aceitar-convite' }), 'ja_existe')
})

test('gestão: recusar pedido sem pedido e rebaixar quem não é membro são "nao_encontrado"; cancelar-convite sem convite também', () => {
  const x = nova()
  const [dono, a] = [x.rover(), x.rover()]
  const c = x.comunidade(dono, { acesso: 'moderada' })
  for (const acao of ['recusar-pedido', 'aprovar-pedido', 'cancelar-convite', 'rebaixar', 'promover', 'expulsar', 'desbanir']) {
    const motivo = acao === 'expulsar' ? 'spam' : null
    assert.equal(x.cod(dono, 'comunidade-gestao', { comunidade: c, alvo: a.uid, acao, motivo }), 'nao_encontrado', acao)
  }
})

test('transferir posse com os 10 moderadores já preenchidos: o antigo dono vira membro, não moderador', () => {
  const x = nova()
  const [dono, novo] = [x.rover(), x.rover()]
  const c = x.comunidade(dono)
  x.entra(novo, c, { esperar: false })
  for (let i = 0; i < ESTRUTURA.moderadoresPorComunidade; i++) x.m.armazem.executar("INSERT INTO membros (comunidade, uid, papel, desde) VALUES (:c, :u, 'moderador', 1)", { c, u: `rvr_${String(i).padStart(22, 'm')}` })
  x.ok(dono, 'comunidade-posse', { comunidade: c, acao: 'transferir', novoDono: novo.uid })
  assert.equal(x.s.papel(c, dono.uid), 'membro')
  const y = nova()
  const [d2, n2] = [y.rover(), y.rover()]
  const c2 = y.comunidade(d2)
  y.entra(n2, c2, { esperar: false })
  for (let i = 0; i < ESTRUTURA.moderadoresPorComunidade - 1; i++) y.m.armazem.executar("INSERT INTO membros (comunidade, uid, papel, desde) VALUES (:c, :u, 'moderador', 1)", { c: c2, u: `rvr_${String(i).padStart(22, 'm')}` })
  y.ok(d2, 'comunidade-posse', { comunidade: c2, acao: 'transferir', novoDono: n2.uid })
  assert.equal(y.s.papel(c2, d2.uid), 'moderador', 'com 9 moderadores o antigo dono cabe como o décimo')
})

test('agir num tópico apagado, escondido ou bloqueado pelo relé: "alvo_removido", cada caso sozinho', () => {
  const x = nova()
  const [dono, a] = [x.rover(), x.rover()]
  const c = x.comunidade(dono)
  x.entra(a, c)
  const apagado = x.topico(a, c, { titulo: 'Apagado' })
  const escondido = x.topico(a, c, { titulo: 'Escondido' })
  const bloqueado = x.topico(a, c, { titulo: 'Bloqueado' })
  x.ok(a, 'remocao-pelo-autor', { alvo: apagado })
  x.ok(dono, 'remocao-por-responsavel', { alvo: escondido, motivo: 'spam' })
  x.rele.bloquear({ tipo: 'objeto', alvo: bloqueado, motivo: 'teste' })
  for (const [nome, t] of [['apagado', apagado], ['escondido', escondido], ['bloqueado', bloqueado]]) {
    assert.equal(x.cod(dono, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'oi' }), 'alvo_removido', nome)
  }
})

test('trancar e destrancar duas vezes são "ja_existe"; a resposta que resolveu precisa existir, estar viva e visível', () => {
  const x = nova()
  const [dono, a] = [x.rover(), x.rover()]
  const c = x.comunidade(dono)
  x.entra(a, c)
  const t = x.topico(a, c)
  const g = (acao) => x.cod(dono, 'topico-gestao', { topico: t, acao, comunidade: null, categoria: null })
  assert.equal(g('destrancar'), 'ja_existe', 'não está trancado')
  assert.equal(g('trancar'), 'ok')
  assert.equal(g('trancar'), 'ja_existe')
  assert.equal(g('destrancar'), 'ok')
  const apagada = x.responde(a, t, 'vai sumir')
  const escondida = x.responde(a, t, 'vai ser escondida')
  const ok = x.responde(a, t, 'fica')
  x.ok(a, 'remocao-pelo-autor', { alvo: apagada })
  x.ok(dono, 'remocao-por-responsavel', { alvo: escondida, motivo: 'spam' })
  const r = (resposta) => x.cod(a, 'topico-resolvido', { topico: t, resposta })
  assert.equal(r(`ob_${'A'.repeat(43)}`), 'alvo_desconhecido', 'não existe')
  assert.equal(r(apagada), 'alvo_desconhecido', 'apagada')
  assert.equal(r(escondida), 'alvo_desconhecido', 'escondida')
  assert.equal(r(ok), 'ok')
})
