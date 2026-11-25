// SPDX-License-Identifier: AGPL-3.0-or-later
// Amizade mútua, bloqueio e silêncio, e a privacidade das listas de amigos.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ESTRUTURA, TEMPOS } from '../../packages/protocolo/src/index.js'
import { codigoDe, erroDe, nova } from '../ajuda/rede.js'
import { politicaDe } from '../ajuda/mundo.js'

/** Um mundo com dois rovers adultos, A e B. */
const par = (opcoes) => { const x = nova(); return Object.assign(x, { a: x.rover(opcoes), b: x.rover(opcoes) }) }
const aviso = (x, r) => x.s.listar(r.uid, { limite: 20 }, x.m.relogio.agora).itens

test('pedir, aceitar: o pedido fica pendente, a amizade nasce ativa, as pendentes e as notificações saem para quem deve', () => {
  const x = par()
  assert.equal(x.ok(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' }).resultado, 'pendente')
  assert.equal(x.s.amizade(x.a.uid, x.b.uid).estado, 'pendente')
  assert.deepEqual(x.s.amizadesPendentes(x.b.uid, x.como(x.b)).recebidos.map((p) => p.rover.uid), [x.a.uid])
  assert.deepEqual(x.s.amizadesPendentes(x.a.uid, x.como(x.a)).enviados.map((p) => p.rover.uid), [x.b.uid])
  assert.deepEqual(aviso(x, x.b).map((n) => n.tipo), ['pedido-de-amizade'])
  assert.equal(aviso(x, x.b)[0].origem.uid, x.a.uid)
  assert.equal(x.ok(x.b, 'amizade', { alvo: x.a.uid, acao: 'aceitar' }).resultado, 'ativa')
  assert.equal(x.s.amizade(x.a.uid, x.b.uid).estado, 'ativa')
  assert.deepEqual(x.s.amizadesPendentes(x.b.uid, x.como(x.b)).recebidos, [])
  assert.deepEqual(aviso(x, x.a).map((n) => n.tipo), ['amizade-aceita'])
  assert.deepEqual(x.s.amigos(x.a.uid, {}).itens.map((i) => i.rover.uid), [x.b.uid])
  assert.deepEqual(x.s.amigos(x.b.uid, {}).itens.map((i) => i.rover.uid), [x.a.uid])
})

test('pedir de novo é "ja_existe"; quem pediu não aceita nem recusa o próprio pedido', () => {
  const x = par()
  x.ok(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' })
  assert.equal(x.cod(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' }), 'ja_existe')
  assert.equal(x.cod(x.a, 'amizade', { alvo: x.b.uid, acao: 'aceitar' }), 'nao_encontrado')
  assert.equal(x.cod(x.a, 'amizade', { alvo: x.b.uid, acao: 'recusar' }), 'nao_encontrado')
  x.ok(x.b, 'amizade', { alvo: x.a.uid, acao: 'aceitar' })
  assert.equal(x.cod(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' }), 'ja_existe', 'já são amigos')
  assert.equal(x.cod(x.b, 'amizade', { alvo: x.a.uid, acao: 'aceitar' }), 'nao_encontrado', 'não há mais pedido')
})

test('aceitar, recusar e desfazer sem nada pendente: "nao_encontrado"', () => {
  const x = par()
  for (const acao of ['aceitar', 'recusar', 'desfazer']) assert.equal(x.cod(x.a, 'amizade', { alvo: x.b.uid, acao }), 'nao_encontrado', acao)
})

test('se o outro já tinha pedido, pedir de volta ativa a amizade na hora e avisa quem pediu primeiro', () => {
  const x = par()
  x.ok(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' })
  assert.equal(x.ok(x.b, 'amizade', { alvo: x.a.uid, acao: 'pedir' }).resultado, 'ativa')
  assert.equal(x.s.amizadeAtiva(x.a.uid, x.b.uid).estado, 'ativa')
  assert.deepEqual(aviso(x, x.a).map((n) => n.tipo), ['amizade-aceita'])
})

test('recusar: o par fica 7 dias sem poder pedir de novo (nos dois sentidos), e no 7º dia pode', () => {
  const x = par()
  x.ok(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' })
  assert.equal(x.ok(x.b, 'amizade', { alvo: x.a.uid, acao: 'recusar' }).resultado, 'nenhuma')
  x.avancar(3600)
  const e = erroDe(() => x.ok(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' }))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.equal(e.retryAfterS, TEMPOS.recusaDePedidoDeAmizadeS - 3600)
  assert.equal(x.cod(x.b, 'amizade', { alvo: x.a.uid, acao: 'pedir' }), 'limite_de_taxa')
  x.avancar(TEMPOS.recusaDePedidoDeAmizadeS - 3600 - 1)
  assert.equal(x.cod(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' }), 'limite_de_taxa', 'um segundo antes ainda não')
  x.avancar(1)
  assert.equal(x.ok(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' }).resultado, 'pendente')
})

test('desfazer: qualquer dos dois desfaz a amizade ativa; quem pediu cancela o pedido enviado; quem recebeu só recusa', () => {
  const x = par()
  x.ok(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' })
  assert.equal(x.cod(x.b, 'amizade', { alvo: x.a.uid, acao: 'desfazer' }), 'nao_encontrado')
  assert.equal(x.ok(x.a, 'amizade', { alvo: x.b.uid, acao: 'desfazer' }).resultado, 'nenhuma')
  assert.equal(x.s.amizade(x.a.uid, x.b.uid), null)
  for (const quem of ['a', 'b']) {
    x.ok(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' })
    x.ok(x.b, 'amizade', { alvo: x.a.uid, acao: 'aceitar' })
    const [de, para] = quem === 'a' ? [x.a, x.b] : [x.b, x.a]
    x.ok(de, 'amizade', { alvo: para.uid, acao: 'desfazer' })
    assert.equal(x.s.amizade(x.a.uid, x.b.uid), null, quem)
  }
})

test('amizade com rover que não existe: "alvo_desconhecido"', () => {
  const x = par()
  assert.equal(x.cod(x.a, 'amizade', { alvo: `rvr_${'A'.repeat(22)}`, acao: 'pedir' }), 'alvo_desconhecido')
})

test('limites de quantidade: 50 pedidos enviados, 100 recebidos por rover, 500 amigos', () => {
  const x = nova()
  const inserir = (de, para, estado) => x.m.armazem.executar(
    'INSERT INTO amizades (par, de, para, estado, criado_em, atualizado_em) VALUES (:par, :de, :para, :estado, 1, 1)',
    { par: de < para ? `${de}|${para}` : `${para}|${de}`, de, para, estado }
  )
  const falsos = (n) => Array.from({ length: n }, (_, i) => `rvr_${String(i).padStart(22, 'x')}`)
  const [a, b, c, d, e] = [x.rover(), x.rover(), x.rover(), x.rover(), x.rover()]
  for (const f of falsos(ESTRUTURA.pedidosDeAmizadeEnviados)) inserir(a.uid, f, 'pendente')
  assert.equal(x.cod(a, 'amizade', { alvo: b.uid, acao: 'pedir' }), 'limite_de_estrutura', '50 enviados')
  for (const f of falsos(ESTRUTURA.pedidosDeAmizadeRecebidos)) inserir(f, c.uid, 'pendente')
  assert.equal(x.cod(b, 'amizade', { alvo: c.uid, acao: 'pedir' }), 'limite_de_estrutura', '100 recebidos')
  for (const f of falsos(ESTRUTURA.amigos)) inserir(d.uid, f, 'ativa')
  assert.equal(x.cod(e, 'amizade', { alvo: d.uid, acao: 'pedir' }), 'limite_de_estrutura', '500 amigos de um lado')
  x.ok(b, 'amizade', { alvo: e.uid, acao: 'pedir' })
  inserir(`rvr_${'z'.repeat(22)}`, d.uid, 'pendente')
  assert.equal(x.cod(d, 'amizade', { alvo: `rvr_${'z'.repeat(22)}`, acao: 'aceitar' }), 'alvo_desconhecido', 'aceitar também confere o teto, e o alvo precisa existir')
})

// ---------- bloqueio e silêncio ----------

test('bloquear desfaz amizade, seguir nos dois sentidos e depoimentos pendentes; desbloquear não restaura nada', () => {
  const x = par()
  x.amigos(x.a, x.b, 8)
  x.ok(x.a, 'seguir', { alvo: x.b.uid })
  x.ok(x.b, 'seguir', { alvo: x.a.uid })
  const dep = x.ok(x.a, 'depoimento', { alvo: x.b.uid, texto: 'Um ótimo parceiro de trabalho.' })
  x.ok(x.b, 'relacao', { alvo: x.a.uid, acao: 'bloquear' })
  assert.equal(x.s.amizade(x.a.uid, x.b.uid), null)
  assert.equal(x.m.armazem.objeto(dep.id).estado, 'recusado')
  assert.equal(x.rele.seguindo(x.a.uid).itens.length, 0)
  assert.equal(x.rele.seguindo(x.b.uid).itens.length, 0)
  assert.equal(x.rele.perfil(x.b.uid).seguidores, 0)
  x.ok(x.b, 'relacao', { alvo: x.a.uid, acao: 'desbloquear' })
  assert.equal(x.s.amizade(x.a.uid, x.b.uid), null, 'a amizade não volta')
  assert.equal(x.rele.seguindo(x.a.uid).itens.length, 0, 'o seguir não volta')
})

test('bloqueio vale nos dois sentidos para amizade, recado, depoimento, selo, seguir, reação e resposta, sempre com o mesmo erro', () => {
  const x = par()
  const post = x.ok(x.b, 'postagem', { texto: 'uma postagem', topicos: [] })
  x.ok(x.a, 'relacao', { alvo: x.b.uid, acao: 'bloquear' })
  for (const [quem, outro] of [[x.a, x.b], [x.b, x.a]]) {
    for (const [tipo, corpo] of [
      ['amizade', { alvo: outro.uid, acao: 'pedir' }], ['recado', { alvo: outro.uid, texto: 'oi' }], ['depoimento', { alvo: outro.uid, texto: 'oi' }],
      ['selo', { alvo: outro.uid, selo: 'rapido' }], ['seguir', { alvo: outro.uid }]
    ]) assert.equal(x.cod(quem, tipo, corpo), 'interacao_nao_permitida', `${tipo} de ${quem === x.a ? 'A' : 'B'}`)
  }
  assert.equal(x.cod(x.a, 'reacao', { alvo: post.id, reacao: 'curtir' }), 'interacao_nao_permitida')
  assert.equal(x.cod(x.a, 'resposta', { alvo: post.id, texto: 'oi' }), 'interacao_nao_permitida')
  const e = erroDe(() => x.faz(x.b, 'recado', { alvo: x.a.uid, texto: 'oi' }))
  assert.equal(e.campo, 'objeto.corpo.alvo')
  assert.doesNotMatch(e.message, /bloque/i, 'a mensagem não diz quem bloqueou')
  assert.equal(e.message, erroDe(() => x.faz(x.a, 'recado', { alvo: x.b.uid, texto: 'oi' })).message, 'a mesma mensagem para os dois lados')
})

test('bloquear de novo, desbloquear sem bloqueio, silenciar de novo e o teto de 1000 bloqueios: erros certos', () => {
  const x = par()
  assert.equal(x.cod(x.a, 'relacao', { alvo: x.b.uid, acao: 'desbloquear' }), 'nao_encontrado')
  x.ok(x.a, 'relacao', { alvo: x.b.uid, acao: 'bloquear' })
  assert.equal(x.cod(x.a, 'relacao', { alvo: x.b.uid, acao: 'bloquear' }), 'ja_existe')
  assert.equal(x.cod(x.a, 'relacao', { alvo: x.b.uid, acao: 'dessilenciar' }), 'nao_encontrado', 'bloquear não é silenciar')
  x.ok(x.a, 'relacao', { alvo: x.b.uid, acao: 'silenciar' })
  assert.equal(x.cod(x.a, 'relacao', { alvo: x.b.uid, acao: 'silenciar' }), 'ja_existe')
  const c = x.rover()
  const d = x.rover()
  for (let i = 0; i < ESTRUTURA.relacoesPorTipo; i++) x.m.armazem.executar("INSERT INTO relacoes (autor, alvo, tipo, em) VALUES (:a, :alvo, 'bloqueio', 1)", { a: c.uid, alvo: `rvr_${String(i).padStart(22, 'y')}` })
  assert.equal(x.cod(c, 'relacao', { alvo: d.uid, acao: 'bloquear' }), 'limite_de_estrutura')
  for (let i = 0; i < ESTRUTURA.relacoesPorTipo; i++) x.m.armazem.executar("INSERT INTO relacoes (autor, alvo, tipo, em) VALUES (:a, :alvo, 'silencio', 1)", { a: c.uid, alvo: `rvr_${String(i).padStart(22, 'w')}` })
  assert.equal(x.cod(c, 'relacao', { alvo: d.uid, acao: 'silenciar' }), 'limite_de_estrutura')
})

test('as relações são privadas: o relé não serve o objeto, só o próprio rover lista, e o bloqueado não descobre', () => {
  const x = par()
  const bl = x.ok(x.a, 'relacao', { alvo: x.b.uid, acao: 'bloquear' })
  assert.equal(codigoDe(() => x.rele.objeto(bl.id)), 'nao_encontrado')
  assert.equal(x.m.armazem.objeto(bl.id).envelope, null)
  assert.deepEqual(x.s.relacoes(x.a.uid, { credencial: x.como(x.a) }).itens.map((i) => [i.rover.uid, i.relacao]), [[x.b.uid, 'bloqueio']])
  assert.equal(codigoDe(() => x.s.relacoes(x.a.uid, { credencial: x.como(x.b) })), 'sem_permissao')
  assert.equal(codigoDe(() => x.s.relacoes(x.a.uid, { credencial: null })), 'leitura_nao_autorizada')
  assert.deepEqual(x.s.relacoes(x.b.uid, { credencial: x.como(x.b) }).itens, [])
  assert.equal(x.s.paginaDoRover(x.a.uid, { credencial: x.como(x.b) }).voce.euBloqueei, false, 'B não vê que A o bloqueou')
  assert.equal(x.s.paginaDoRover(x.b.uid, { credencial: x.como(x.a) }).voce.euBloqueei, true)
})

test('silenciar só corta as notificações do silenciado; ele continua podendo interagir', () => {
  const x = par()
  x.ok(x.a, 'relacao', { alvo: x.b.uid, acao: 'silenciar' })
  x.ok(x.b, 'recado', { alvo: x.a.uid, texto: 'oi, tudo bem?' })
  assert.equal(aviso(x, x.a).length, 0)
  assert.equal(x.s.recados(x.a.uid, {}).itens.length, 1, 'o recado entrou, só não avisou')
  x.ok(x.a, 'relacao', { alvo: x.b.uid, acao: 'dessilenciar' })
  x.avancar(2000)
  x.ok(x.b, 'recado', { alvo: x.a.uid, texto: 'outro oi' })
  assert.equal(aviso(x, x.a).length, 1)
})

// ---------- listas de amigos e o grafo ----------

test('lista de amigos: o rover com grafo fechado não aparece na lista nem na contagem dos outros, e vê os seus', () => {
  const x = nova()
  const a = x.rover()
  const b = x.rover({ grafo: 'privado' })
  const c = x.rover()
  x.amigos(a, b, 0)
  x.amigos(a, c, 0)
  assert.deepEqual(x.s.amigos(a.uid, { credencial: null }).itens.map((i) => i.rover.uid), [c.uid])
  assert.equal(x.s.paginaDoRover(a.uid, {}).contagens.amigos, 1)
  assert.deepEqual(x.s.amigos(a.uid, { credencial: x.como(a) }).itens.map((i) => i.rover.uid).sort(), [b.uid, c.uid].sort(), 'A vê todos os seus')
  assert.equal(x.s.paginaDoRover(a.uid, { credencial: x.como(a) }).contagens.amigos, 2)
  assert.equal(codigoDe(() => x.s.amigos(b.uid, { credencial: null })), 'grafo_privado')
  assert.deepEqual(x.s.amigos(b.uid, { credencial: x.como(b) }).itens.map((i) => i.rover.uid), [a.uid], 'B lê os seus')
  assert.equal(x.s.paginaDoRover(b.uid, {}).contagens.amigos, null)
  assert.equal(codigoDe(() => x.s.amigos(b.uid, { credencial: x.como(a) })), 'grafo_privado', 'nem o amigo lê a lista do outro')
})

test('grafo "contagens": mostra o número e esconde a lista; a política da pessoa fecha mais que o perfil', () => {
  const x = nova()
  const a = x.rover({ grafo: 'contagens' })
  const b = x.rover()
  x.amigos(a, b, 0)
  assert.equal(x.s.paginaDoRover(a.uid, {}).contagens.amigos, 1)
  assert.equal(codigoDe(() => x.s.amigos(a.uid, { credencial: null })), 'grafo_privado')
  const c = x.rover()
  x.amigos(b, c, 0)
  assert.equal(x.s.amigos(b.uid, {}).itens.length, 1, 'B é público: a lista dele traz C, e A (grafo contagens) fica de fora')
  x.rele.aceitarDeclaracao({ declaracao: politicaDe(c, { grafo: 'privado', emitidaEm: x.m.relogio.agora, v: '0.3' }) })
  assert.equal(codigoDe(() => x.s.amigos(c.uid, { credencial: null })), 'grafo_privado')
  assert.equal(x.s.amigos(b.uid, {}).itens.length, 0, 'C fechou pela política: some da lista de B')
})

test('amigos em comum: só entre grafos públicos (ou quando quem lê é uma das pontas), sem revelar quem fechou', () => {
  const x = nova()
  const [a, b, z1, z2, zf] = [x.rover(), x.rover(), x.rover(), x.rover(), x.rover({ grafo: 'privado' })]
  for (const z of [z1, z2, zf]) { x.amigos(a, z, 0); x.amigos(b, z, 0) }
  const lista = (uid, com, credencial) => x.s.amigosEmComum(uid, com, { credencial }).itens.map((r) => r.uid).sort()
  assert.deepEqual(lista(a.uid, b.uid, null), [z1.uid, z2.uid].sort(), 'o fechado fica de fora')
  assert.deepEqual(lista(a.uid, b.uid, x.como(a)), [z1.uid, z2.uid].sort())
  assert.deepEqual(lista(b.uid, a.uid, null), [z1.uid, z2.uid].sort(), 'simétrica')
  assert.equal(codigoDe(() => x.s.amigosEmComum(a.uid, a.uid, {})), 'esquema')
  assert.equal(codigoDe(() => x.s.amigosEmComum(a.uid, 'rvr_x', {})), 'esquema')
  assert.equal(codigoDe(() => x.s.amigosEmComum(a.uid, undefined, {})), 'esquema')
  assert.equal(codigoDe(() => x.s.amigosEmComum(a.uid, `rvr_${'A'.repeat(22)}`, {})), 'nao_encontrado')
  // uma ponta fechada: só ela mesma lê, e nem assim o outro lado dela se abre se for fechado também
  const f1 = x.rover({ grafo: 'privado' })
  x.amigos(a, f1, 0)
  assert.equal(codigoDe(() => x.s.amigosEmComum(a.uid, f1.uid, { credencial: null })), 'grafo_privado')
  assert.equal(codigoDe(() => x.s.amigosEmComum(a.uid, f1.uid, { credencial: x.como(b) })), 'grafo_privado')
  assert.equal(codigoDe(() => x.s.amigosEmComum(a.uid, f1.uid, { credencial: x.como(a) })), 'grafo_privado', 'A lê, mas F1 é fechado e não é A')
  assert.deepEqual(lista(f1.uid, a.uid, x.como(f1)), [], 'F1 lê a própria ponta; A é público')
  const f2 = x.rover({ grafo: 'privado' })
  assert.equal(codigoDe(() => x.s.amigosEmComum(f1.uid, f2.uid, { credencial: x.como(f1) })), 'grafo_privado', 'duas pontas fechadas: ninguém lê')
})

test('as listas de amizade paginam por cursor sem repetir nem pular', () => {
  const x = nova()
  const a = x.rover()
  const outros = Array.from({ length: 5 }, () => x.rover())
  for (const o of outros) x.amigos(a, o, 0)
  const p1 = x.s.amigos(a.uid, { limite: 2 })
  const p2 = x.s.amigos(a.uid, { limite: 2, antes: p1.proximo })
  const p3 = x.s.amigos(a.uid, { limite: 2, antes: p2.proximo })
  assert.equal(p3.proximo, null)
  const todos = [...p1.itens, ...p2.itens, ...p3.itens].map((i) => i.rover.uid)
  assert.deepEqual(todos, [...outros].reverse().map((o) => o.uid), 'do mais novo ao mais velho')
})
