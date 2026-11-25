// SPDX-License-Identifier: AGPL-3.0-or-later
// Bordas das mensagens privadas que o medidor de mutação mostrou sem teste: paginação, contagem por lado, prazos exatos da retenção,
// teto de denúncias, tetos de pedidos pendentes e rover sem perfil.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  ESTRUTURA_DE_MENSAGEM, EXIGE_APROVACAO_DE_MENSAGEM, TEMPOS_DE_MENSAGEM as T, chavePrivadaDeCifraDeSemente, chavePublicaDeCifraDe, cifrarMensagem,
  criarObjeto, gerarParDeCifra
} from '../../packages/protocolo/src/index.js'
import { limparMensagens } from '../../packages/rele/src/mensagens.js'
import { aprovar } from '../ajuda/mundo.js'
import { DIA, codigoDe, nova } from '../ajuda/rede.js'
import { novoRoverNoMundo } from '../ajuda/rele-de-teste.js'

function mundo(opcoes = {}) {
  const r = nova({ mensagens: true, ...opcoes })
  const { m } = r
  const m4 = (rover, tipo, corpo) => {
    const objeto = criarObjeto({ v: '0.4', tipo, autor: rover.uid, criadoEm: m.relogio.agora, previo: null, corpo, chavePrivada: rover.rede.chavePrivada })
    const env = { objeto }
    if (EXIGE_APROVACAO_DE_MENSAGEM[tipo]) env.aprovacao = aprovar(rover, objeto, { aprovadoEm: m.relogio.agora })
    return { ...m.rele.aceitar(env), objeto }
  }
  const comChave = (o = { validadeS: 89 * DIA }) => {
    const x = r.rover(o)
    x.cifra = gerarParDeCifra()
    m4(x, 'chave-de-cifra', { chave: x.cifra.chavePublica })
    return x
  }
  const conversaAceita = (a, b, texto = 'Podemos conversar?') => {
    const c = m4(a, 'conversa-pedir', { alvo: b.uid, texto }).id
    m4(b, 'conversa-decidir', { conversa: c, decisao: 'aceitar' })
    return c
  }
  const envia = (de, para, conversa, texto) => {
    const c = cifrarMensagem({ texto, conversa, de: de.uid, para: para.uid, criadoEm: m.relogio.agora, chavePrivadaDeRede: de.rede.chavePrivada, chavePrivadaDeCifra: de.cifra.chavePrivada, chavePublicaDeCifraDoOutro: para.cifra.chavePublica })
    return { ...m4(de, 'mensagem', c.corpo), assinatura: c.assinatura }
  }
  const M = m.rele.mensagens
  const cred = (x) => r.como(x, '/v1/x')
  return { ...r, m4, comChave, conversaAceita, envia, M, cred }
}

test('paginação: conversas e mensagens vêm em páginas com cursor, sem repetir nem pular', () => {
  const w = mundo()
  const ana = w.comChave()
  const amigos = [w.comChave(), w.comChave(), w.comChave()]
  const conversas = amigos.map((b) => { w.amigos(ana, b, 0); w.avancar(1); return w.conversaAceita(ana, b) })
  const p1 = w.M.conversasDe(ana.uid, { limite: 2, credencial: w.cred(ana) })
  assert.equal(p1.itens.length, 2)
  assert.notEqual(p1.proximo, null)
  const p2 = w.M.conversasDe(ana.uid, { limite: 2, antes: p1.proximo, credencial: w.cred(ana) })
  assert.equal(p2.itens.length, 1)
  assert.equal(p2.proximo, null)
  assert.deepEqual([...p1.itens, ...p2.itens].map((c) => c.id), [...conversas].reverse())
  const c = conversas[0]
  const ids = ['um', 'dois', 'três'].map((t) => { w.avancar(1); return w.envia(ana, amigos[0], c, `mensagem ${t}`).id })
  const m1 = w.M.mensagensDe(ana.uid, c, { limite: 2, credencial: w.cred(ana) })
  const m2 = w.M.mensagensDe(ana.uid, c, { limite: 2, antes: m1.proximo, credencial: w.cred(ana) })
  assert.equal(m2.proximo, null)
  assert.deepEqual([...m1.itens, ...m2.itens].map((e) => e.objeto.id), [...ids].reverse())
  assert.equal(w.M.mensagensDe(ana.uid, c, { limite: 3, credencial: w.cred(ana) }).proximo, null)
})

test('contagem por lado: o cartão conta só as mensagens que aquele lado ainda guarda', () => {
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  w.amigos(ana, beto, 0)
  const c = w.conversaAceita(ana, beto)
  w.envia(ana, beto, c, 'uma')
  w.avancar(1)
  w.envia(beto, ana, c, 'duas')
  w.m4(ana, 'conversa-apagar', { conversa: c, mensagem: null })
  assert.equal(w.M.conversaDe(ana.uid, c, { credencial: w.cred(ana) }).mensagens, 0)
  assert.equal(w.M.conversaDe(beto.uid, c, { credencial: w.cred(beto) }).mensagens, 2)
})

test('retenção, prazos exatos: recusa some depois de 7 dias, pedido pendente e rastro esperam 30, denúncia 180', () => {
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  const caio = w.comChave()
  w.amigos(ana, beto, 0)
  w.amigos(ana, caio, 0)
  const recusada = w.m4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi' }).id
  w.m4(beto, 'conversa-decidir', { conversa: recusada, decisao: 'recusar' })
  const pendente = w.m4(ana, 'conversa-pedir', { alvo: caio.uid, texto: 'oi, Caio' }).id
  const conta = (sql, p = {}) => w.rele.armazem.um(`SELECT COUNT(*) AS n FROM ${sql}`, p).n
  w.avancar(T.recusaDePedidoDeConversaS - 5)
  w.rele.limpar()
  assert.equal(conta('conversas WHERE id = :id', { id: recusada }), 1)
  w.avancar(10)
  w.rele.limpar()
  assert.equal(conta('conversas WHERE id = :id', { id: recusada }), 0)
  assert.equal(conta('conversas WHERE id = :id', { id: pendente }), 1, 'pendente ainda dentro dos 30 dias')
  assert.ok(conta('objetos WHERE id = :id', { id: pendente }) === 1, 'rastro ainda dentro dos 30 dias')
  w.avancar(T.retencaoDePedidoS - T.recusaDePedidoDeConversaS)
  w.rele.limpar()
  assert.equal(conta('conversas WHERE id = :id', { id: pendente }), 0)
  assert.equal(conta('objetos WHERE id = :id', { id: pendente }), 0)
  // denúncia: 180 dias
  const c = w.conversaAceita(ana, beto, 'de novo?')
  const msg = w.envia(ana, beto, c, 'texto denunciado')
  w.m4(beto, 'mensagem-denuncia', { mensagem: msg.id, motivo: 'spam', texto: 'texto denunciado', assinatura: msg.assinatura })
  w.avancar(179 * DIA)
  w.rele.limpar()
  assert.equal(conta('denuncias_de_mensagem'), 1)
  w.avancar(2 * DIA)
  w.rele.limpar()
  assert.equal(conta('denuncias_de_mensagem'), 0)
})

test('teto de denúncias de mensagem: 10 por dia por denunciante', () => {
  const w = mundo({ taxas: { porTipo: {} } })
  const ana = w.comChave()
  const beto = w.comChave()
  w.amigos(ana, beto, 0)
  const c = w.conversaAceita(ana, beto)
  const msgs = Array.from({ length: 11 }, (_, i) => w.envia(ana, beto, c, `mensagem ${i}`))
  const den = (x, i) => codigoDe(() => w.m4(beto, 'mensagem-denuncia', { mensagem: x.id, motivo: 'spam', texto: `mensagem ${i}`, assinatura: x.assinatura }))
  for (let i = 0; i < 10; i++) assert.equal(den(msgs[i], i), 'ok')
  assert.equal(den(msgs[10], 10), 'limite_de_taxa')
  w.avancar(DIA + 1)
  // dentro do prazo de retenção da mensagem, a denúncia volta a valer no dia seguinte
  assert.equal(den(msgs[10], 10), 'ok')
})

test('tetos de pedidos pendentes: 20 enviados por rover, 50 recebidos por rover', () => {
  const w = mundo({ taxas: { porTipo: {} } })
  const ana = w.comChave()
  const outros = Array.from({ length: ESTRUTURA_DE_MENSAGEM.pedidosPendentesEnviados + 1 }, () => w.comChave())
  outros.forEach((b) => w.amigos(ana, b, 0))
  outros.slice(0, -1).forEach((b) => w.m4(ana, 'conversa-pedir', { alvo: b.uid, texto: 'oi' }))
  assert.equal(codigoDe(() => w.m4(ana, 'conversa-pedir', { alvo: outros.at(-1).uid, texto: 'oi' })), 'limite_de_estrutura')
  const alvo = w.comChave()
  const muitos = Array.from({ length: ESTRUTURA_DE_MENSAGEM.pedidosPendentesRecebidos + 1 }, () => w.comChave())
  muitos.forEach((x) => w.amigos(x, alvo, 0))
  muitos.slice(0, -1).forEach((x) => w.m4(x, 'conversa-pedir', { alvo: alvo.uid, texto: 'oi' }))
  assert.equal(codigoDe(() => w.m4(muitos.at(-1), 'conversa-pedir', { alvo: alvo.uid, texto: 'oi' })), 'limite_de_estrutura')
})

test('rover sem perfil não publica objeto da 0.4 (perfil_primeiro), mesmo com o atestado anexado', () => {
  const w = mundo()
  const novo = novoRoverNoMundo(w.m)
  const objeto = criarObjeto({ v: '0.4', tipo: 'chave-de-cifra', autor: novo.uid, criadoEm: w.m.relogio.agora, previo: null, corpo: { chave: gerarParDeCifra().chavePublica }, chavePrivada: novo.rede.chavePrivada })
  assert.equal(codigoDe(() => w.rele.aceitar({ objeto, atestado: novo.atestado })), 'perfil_primeiro')
})

test('semente de cifra: só 32 bytes, e a mesma semente dá a mesma chave', () => {
  const s = randomBytes(32)
  assert.equal(chavePublicaDeCifraDe(chavePrivadaDeCifraDeSemente(s)), chavePublicaDeCifraDe(chavePrivadaDeCifraDeSemente(Buffer.from(s))))
  for (const torta of [randomBytes(31), randomBytes(33), 'x'.repeat(32)]) assert.throws(() => chavePrivadaDeCifraDeSemente(torta), TypeError)
})

// ---- bordas que o medidor de mutação mostrou sem teste (dívidas, 17/11/2026) ----

test('decidir sobre conversa que não existe ou de que o autor não é parte: a mesma resposta, nao_encontrado no campo da conversa', () => {
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  const caio = w.comChave()
  w.amigos(ana, beto, 0)
  const c = w.m4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi' }).id
  const erro = (f) => { try { f(); return null } catch (e) { return [e.codigo, e.campo] } }
  const inexistente = `ob_${'A'.repeat(43)}`
  assert.deepEqual(erro(() => w.m4(beto, 'conversa-decidir', { conversa: inexistente, decisao: 'aceitar' })), ['nao_encontrado', 'objeto.corpo.conversa'])
  assert.deepEqual(erro(() => w.m4(caio, 'conversa-decidir', { conversa: c, decisao: 'aceitar' })), ['nao_encontrado', 'objeto.corpo.conversa'], 'de fora da conversa')
  assert.equal(w.m4(beto, 'conversa-decidir', { conversa: c, decisao: 'aceitar' }).resultado, 'ativa', 'controle: quem recebeu decide')
})

test('depois de uma recusa: Retry-After diz exatamente o que falta dos 7 dias, e no segundo exato dos 7 dias o pedido já passa', () => {
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  w.amigos(ana, beto, 0)
  const c = w.m4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi' }).id
  w.m4(beto, 'conversa-decidir', { conversa: c, decisao: 'recusar' })
  w.avancar(DIA)
  let erro = null
  try { w.m4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi de novo' }) } catch (e) { erro = e }
  assert.equal(erro?.codigo, 'limite_de_taxa')
  assert.equal(erro.retryAfterS, T.recusaDePedidoDeConversaS - DIA)
  w.avancar(T.recusaDePedidoDeConversaS - DIA - 1)
  assert.equal(codigoDe(() => w.m4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi de novo' })), 'limite_de_taxa', 'um segundo antes')
  w.avancar(1)
  assert.equal(codigoDe(() => w.m4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi de novo' })), 'ok', 'no segundo exato dos 7 dias')
})

test('teto de conversas aceitas: com 199 ativas aceita a 200ª; com 200 ativas, a próxima é limite_de_estrutura', () => {
  const w = mundo({ taxas: { porTipo: {} } })
  const ana = w.comChave()
  const teto = ESTRUTURA_DE_MENSAGEM.conversasAtivas
  assert.equal(teto, 200)
  // as conversas que já existem entram direto no banco (as regras de cada uma já foram provadas acima); metade em cada direção
  const ins = (i) => w.rele.armazem.executar(
    `INSERT INTO conversas (id, par, de, para, estado, pedido, criada_em, atualizada_em, ultima_mensagem_em, seq_atividade)
     VALUES (:id, :par, :de, :para, 'ativa', NULL, :t, :t, NULL, :seq)`,
    { id: `ob_falsa${String(i).padStart(38, '0')}`, par: `par-${i}`, de: i % 2 ? ana.uid : `rvr_outro${i}`, para: i % 2 ? `rvr_outro${i}` : ana.uid, t: w.m.relogio.agora, seq: 1000 + i }
  )
  for (let i = 0; i < teto - 1; i++) ins(i)
  const pede = () => { const b = w.comChave(); w.amigos(ana, b, 0); return w.m4(b, 'conversa-pedir', { alvo: ana.uid, texto: 'oi' }).id }
  assert.equal(w.m4(ana, 'conversa-decidir', { conversa: pede(), decisao: 'aceitar' }).resultado, 'ativa', 'a 200ª')
  assert.equal(codigoDe(() => w.m4(ana, 'conversa-decidir', { conversa: pede(), decisao: 'aceitar' })), 'limite_de_estrutura', 'a 201ª')
})

test('paginação, borda: com exatamente `limite` conversas não há próxima página', () => {
  const w = mundo()
  const ana = w.comChave()
  const amigos = [w.comChave(), w.comChave()]
  amigos.forEach((b) => { w.amigos(ana, b, 0); w.avancar(1); w.conversaAceita(ana, b) })
  const p = w.M.conversasDe(ana.uid, { limite: 2, credencial: w.cred(ana) })
  assert.equal(p.itens.length, 2)
  assert.equal(p.proximo, null)
  const c = w.M.conversasDe(ana.uid, { credencial: w.cred(ana) }).itens[0].id
  w.envia(ana, amigos[1], c, 'uma')
  w.avancar(1)
  w.envia(ana, amigos[1], c, 'duas')
  const m = w.M.mensagensDe(ana.uid, c, { limite: 2, credencial: w.cred(ana) })
  assert.equal(m.itens.length, 2)
  assert.equal(m.proximo, null)
})

test('listarDenuncias sem limite devolve as 50 mais novas', () => {
  const w = mundo()
  for (let i = 0; i < 51; i++) {
    w.rele.armazem.executar(
      'INSERT INTO denuncias_de_mensagem (mensagem, autor_do_alvo, motivo, texto, pseudonimo, criado_em) VALUES (:m, :a, :mo, :t, :p, :c)',
      { m: `ob_m${i}`, a: 'rvr_x', mo: 'spam', t: `texto ${i}`, p: `p${i}`, c: w.m.relogio.agora }
    )
  }
  const lista = w.M.listarDenuncias()
  assert.equal(lista.length, 50)
  assert.equal(lista[0].texto, 'texto 50')
  assert.equal(w.M.listarDenuncias({ limite: 51 }).length, 51)
})

test('limparMensagens chamada direto: denúncia fica 180 dias por padrão (borda de um segundo); pedido de conversa aceita some aos 30 dias', () => {
  const w = mundo()
  const a = w.rele.armazem
  const agora = w.m.relogio.agora
  const den = (nome, criado) => a.executar(
    'INSERT INTO denuncias_de_mensagem (mensagem, autor_do_alvo, motivo, texto, pseudonimo, criado_em) VALUES (:m, :a, :mo, :t, :p, :c)',
    { m: nome, a: 'rvr_x', mo: 'spam', t: 'x', p: nome, c: criado }
  )
  den('velha', agora - 180 * 86400 - 1)
  den('no-limite', agora - 180 * 86400)
  den('nova', agora - 180 * 86400 + 1)
  // pedido retido de conversa ATIVA: um de 30 dias e um segundo, outro recente
  const conv = (id, criada) => a.executar(
    `INSERT INTO conversas (id, par, de, para, estado, pedido, criada_em, atualizada_em, ultima_mensagem_em, seq_atividade)
     VALUES (:id, :id, 'rvr_a', 'rvr_b', 'ativa', '{"objeto":{}}', :c, :c, NULL, 1)`, { id, c: criada }
  )
  conv('antiga', agora - T.retencaoDePedidoS - 1)
  conv('recente', agora - 60)
  limparMensagens(a, agora)
  assert.deepEqual(a.todos('SELECT mensagem FROM denuncias_de_mensagem ORDER BY mensagem').map((l) => l.mensagem), ['no-limite', 'nova'])
  assert.deepEqual(a.todos('SELECT id, pedido IS NULL AS semPedido FROM conversas ORDER BY id').map((l) => [l.id, l.semPedido]), [['antiga', 1], ['recente', 0]])
  // com outro prazo, vale o outro prazo
  limparMensagens(a, agora, 1)
  assert.equal(a.um('SELECT COUNT(*) AS n FROM denuncias_de_mensagem').n, 0)
})
