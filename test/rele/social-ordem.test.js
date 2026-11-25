// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.3.2 (proposta 0007): ordem `melhores` e `em-alta`, por PESSOAS DISTINTAS. A regra que importa: quem responde 25 vezes ou reage 500
// vezes vale uma pessoa, o autor não pontua no que escreveu, conta nova e rover escondido não pontuam, e nada expõe `pontos`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { DIA, codigoDe, nova } from '../ajuda/rede.js'

function mundo(opcoes) {
  const x = nova(opcoes)
  const dono = x.rover()
  const [ana, beto, caio, duda, eli] = [x.rover(), x.rover(), x.rover(), x.rover(), x.rover()]
  const c = x.comunidade(dono, { categorias: [] })
  for (const r of [ana, beto, caio, duda, eli]) { x.entra(r, c, { esperar: false }); x.avancar(1) }
  x.gestao(dono, c, ana, 'promover')
  x.avancar(3601)
  return Object.assign(x, { dono, ana, beto, caio, duda, eli, c })
}
const ids = (l) => l.itens.map((i) => i.id)
const curtir = (x, quem, alvo) => x.ok(quem, 'reacao', { alvo, reacao: 'curtir' })

test('melhores conta PESSOAS: três pessoas respondendo uma vez valem mais do que uma pessoa respondendo 25 vezes e reagindo', () => {
  const x = mundo()
  const t1 = x.topico(x.dono, x.c, { titulo: 'Tópico das três pessoas' })
  const t2 = x.topico(x.dono, x.c, { titulo: 'Tópico de uma pessoa só' })
  const t3 = x.topico(x.dono, x.c, { titulo: 'Tópico do próprio autor' })
  for (const r of [x.beto, x.caio, x.duda]) x.responde(r, t1, 'uma resposta de cada uma')
  for (let i = 0; i < 25; i++) { x.responde(x.beto, t2, `resposta número ${i + 1} da mesma pessoa`); x.avancar(1) }
  curtir(x, x.beto, t2)
  for (let i = 0; i < 10; i++) { x.responde(x.dono, t3, `o autor falando sozinho ${i + 1}`); x.avancar(1) }
  curtir(x, x.eli, t3)
  assert.deepEqual(ids(x.s.topicosDa(x.c, { ordem: 'recentes', limite: 50 })), [t3, t2, t1], 'por tempo: o mais novo primeiro')
  assert.deepEqual(ids(x.s.topicosDa(x.c, { ordem: 'melhores', limite: 50 })), [t1, t2, t3], 't1 tem 3 pessoas (9), t2 uma pessoa (3+1=4), t3 só uma reação de fora (1)')
})

test('500 reações da mesma pessoa contam 1: reagir e tirar a reação em ciclo não infla o tópico', () => {
  const x = mundo()
  const t4 = x.topico(x.dono, x.c, { titulo: 'Tópico do giro' })
  const t5 = x.topico(x.dono, x.c, { titulo: 'Tópico de duas pessoas' })
  curtir(x, x.caio, t5)
  curtir(x, x.duda, t5)
  let viva = null
  for (let i = 0; i < 500; i++) {
    if (viva) x.ok(x.beto, 'remocao-pelo-autor', { alvo: viva })
    viva = x.ok(x.beto, 'reacao', { alvo: t4, reacao: i % 2 === 0 ? 'curtir' : 'util' }).id
    x.avancar(80)
  }
  assert.equal(x.s.reacoesDe(t4, x.m.relogio.agora).curtir + x.s.reacoesDe(t4, x.m.relogio.agora).util, 1, 'só a última reação está viva')
  assert.deepEqual(ids(x.s.topicosDa(x.c, { ordem: 'melhores', limite: 50 })), [t5, t4], '2 pessoas (2 pontos) passam 500 reações de 1 pessoa (1 ponto)')
})

test('o autor não pontua no que escreveu, e nenhuma resposta da fila nova faz o tópico subir sozinho', () => {
  const x = mundo()
  const proprio = x.topico(x.dono, x.c, { titulo: 'Proprio' })
  const alheio = x.topico(x.dono, x.c, { titulo: 'Alheio' })
  for (let i = 0; i < 12; i++) { x.responde(x.dono, proprio, `eu de novo ${i}`); x.avancar(1) }
  x.responde(x.eli, alheio, 'uma resposta de fora')
  assert.deepEqual(ids(x.s.topicosDa(x.c, { ordem: 'melhores', limite: 50 })), [alheio, proprio])
})

test('conta nova (menos de 1 dia) não pontua: uma rajada de contas novas não sobe o tópico', () => {
  const x = nova({ novatos: true })
  const [dono, ana, beto] = [x.rover(), x.rover(), x.rover()]
  x.avancar(2 * DIA)
  const c = x.comunidade(dono)
  for (const r of [ana, beto]) { x.entra(r, c, { esperar: false }); x.avancar(1) }
  x.avancar(3601)
  const velho = x.topico(ana, c, { titulo: 'Com uma pessoa antiga' })
  x.responde(beto, velho, 'uma pessoa com conta de dois dias')
  const novos = [x.rover(), x.rover(), x.rover()]
  for (const r of novos) { x.entra(r, c, { esperar: false }); x.avancar(1) }
  x.avancar(3601)
  const rajada = x.topico(ana, c, { titulo: 'Com uma rajada de contas novas' })
  for (const r of novos) x.responde(r, rajada, 'conta nova respondendo')
  assert.deepEqual(ids(x.s.topicosDa(c, { ordem: 'recentes', limite: 50 })), [rajada, velho])
  assert.deepEqual(ids(x.s.topicosDa(c, { ordem: 'melhores', limite: 50 })), [velho, rajada], '1 pessoa antiga (3) passa 3 contas novas (0)')
})

test('rover bloqueado pelo operador não pontua', () => {
  const x = mundo()
  const ta = x.topico(x.dono, x.c, { titulo: 'Ta com duas pessoas' })
  const tb = x.topico(x.dono, x.c, { titulo: 'Tb com uma pessoa' })
  x.responde(x.beto, ta, 'beto')
  x.responde(x.eli, ta, 'eli')
  x.responde(x.caio, tb, 'caio')
  assert.deepEqual(ids(x.s.topicosDa(x.c, { ordem: 'melhores', limite: 50 })), [ta, tb])
  x.rele.bloquear({ tipo: 'rover', alvo: x.beto.uid, motivo: 'x' })
  assert.deepEqual(ids(x.s.topicosDa(x.c, { ordem: 'melhores', limite: 50 })), [tb, ta], 'sem o beto, ta tem 3 pontos e tb tem 3: empata e o mais novo vem primeiro')
})

test('em-alta conta só a janela; melhores conta todo o tempo; janela inválida é esquema', () => {
  const x = mundo()
  const velho = x.topico(x.dono, x.c, { titulo: 'Velho' })
  x.responde(x.beto, velho, 'antiga')
  x.responde(x.caio, velho, 'antiga')
  x.avancar(2 * DIA)
  const novo = x.topico(x.dono, x.c, { titulo: 'Novo' })
  x.responde(x.duda, novo, 'agora')
  assert.deepEqual(ids(x.s.topicosDa(x.c, { ordem: 'melhores', limite: 50 })), [velho, novo], 'todo o tempo: 2 pessoas (6) contra 1 (3)')
  assert.deepEqual(ids(x.s.topicosDa(x.c, { ordem: 'em-alta', limite: 50 })), [novo, velho], '24h: só o tópico novo tem atividade na janela')
  assert.deepEqual(ids(x.s.topicosDa(x.c, { ordem: 'em-alta', janela: '24h', limite: 50 })), [novo, velho])
  assert.deepEqual(ids(x.s.topicosDa(x.c, { ordem: 'em-alta', janela: '7d', limite: 50 })), [velho, novo], '7 dias: a atividade antiga entra de volta')
  assert.equal(codigoDe(() => x.s.topicosDa(x.c, { ordem: 'em-alta', janela: '1h' })), 'esquema')
})

test('paginação por deslocamento: as páginas somam a lista inteira, sem repetir, e os fixados só vêm na primeira', () => {
  const x = mundo()
  const repliers = [x.ana, x.beto, x.caio, x.duda, x.eli]
  const topicos = []
  for (let k = 5; k >= 1; k--) {
    const t = x.topico(x.dono, x.c, { titulo: `Tópico com ${k} pessoas` })
    topicos[k] = t
    for (const r of repliers.slice(0, k)) x.responde(r, t, `resposta de quem tem ${k} colegas`)
  }
  assert.deepEqual(ids(x.s.topicosDa(x.c, { ordem: 'recentes', limite: 50 })), [topicos[1], topicos[2], topicos[3], topicos[4], topicos[5]], 'por tempo é o inverso')
  const p1 = x.s.topicosDa(x.c, { ordem: 'melhores', limite: 2 })
  assert.deepEqual(ids(p1), [topicos[5], topicos[4]])
  assert.equal(p1.proximo, 2)
  const p2 = x.s.topicosDa(x.c, { ordem: 'melhores', limite: 2, antes: p1.proximo })
  assert.deepEqual(ids(p2), [topicos[3], topicos[2]])
  assert.equal(p2.proximo, 4)
  const p3 = x.s.topicosDa(x.c, { ordem: 'melhores', limite: 2, antes: p2.proximo })
  assert.deepEqual(ids(p3), [topicos[1]])
  assert.equal(p3.proximo, null)
  x.ok(x.ana, 'topico-gestao', { topico: topicos[1], acao: 'fixar', comunidade: null, categoria: null })
  const q1 = x.s.topicosDa(x.c, { ordem: 'melhores', limite: 2 })
  assert.deepEqual(q1.fixados.map((i) => i.id), [topicos[1]], 'o fixado vem à parte, na primeira página')
  assert.deepEqual(ids(q1), [topicos[5], topicos[4]])
  const q2 = x.s.topicosDa(x.c, { ordem: 'melhores', limite: 2, antes: q1.proximo })
  assert.equal(q2.fixados, undefined, 'segunda página sem fixados')
  assert.deepEqual(ids(q2), [topicos[3], topicos[2]])
})

test('respostas de um tópico: melhores conta quem respondeu a cada resposta e quem reagiu a ela', () => {
  const x = mundo()
  const t = x.topico(x.dono, x.c)
  const r2 = x.responde(x.eli, t, 'segunda no tempo')
  const r1 = x.responde(x.beto, t, 'primeira em pessoas')
  const r3 = x.responde(x.duda, t, 'sem ninguém')
  x.responde(x.caio, t, 'filha 1', { em: r1 }); x.responde(x.duda, t, 'filha 2', { em: r1 })
  curtir(x, x.ana, r2); curtir(x, x.caio, r2)
  assert.deepEqual(ids(x.s.respostasDo(t, { ordem: 'antigas', limite: 50 })).filter((i) => [r1, r2, r3].includes(i)), [r2, r1, r3])
  assert.deepEqual(ids(x.s.respostasDo(t, { ordem: 'recentes', limite: 50 })).filter((i) => [r1, r2, r3].includes(i)), [r3, r1, r2])
  assert.deepEqual(ids(x.s.respostasDo(t, { ordem: 'melhores', limite: 50 })), [r1, r2, r3], 'r1: 2 pessoas respondendo (6); r2: 2 pessoas reagindo (2); r3: 0')
  const pag = x.s.respostasDo(t, { ordem: 'melhores', limite: 2 })
  assert.equal(pag.proximo, 2)
  assert.deepEqual(ids(x.s.respostasDo(t, { ordem: 'melhores', limite: 2, antes: 2 })), [r3])
  assert.deepEqual(ids(x.s.respostasDo(t, { ordem: 'em-alta', limite: 50 })), [r1, r2, r3], 'tudo aconteceu na janela')
})

test('respostas de uma postagem: a mesma fórmula, para respostas a respostas e reações', () => {
  const x = mundo()
  const post = x.ok(x.ana, 'postagem', { texto: 'uma postagem para responder', topicos: [] }).id
  const pc = x.ok(x.duda, 'resposta', { alvo: post, texto: 'primeira no tempo' }).id
  const pb = x.ok(x.caio, 'resposta', { alvo: post, texto: 'segunda, sem ninguém' }).id
  const pa = x.ok(x.beto, 'resposta', { alvo: post, texto: 'terceira, com filhas' }).id
  x.ok(x.caio, 'resposta', { alvo: pa, texto: 'filha de pa' }); x.ok(x.duda, 'resposta', { alvo: pa, texto: 'outra filha de pa' })
  curtir(x, x.eli, pc)
  const quais = (o) => x.s.respostasDaPostagem(post, { limite: 50, ...o }).itens.map((i) => i.envelope.objeto.id)
  assert.deepEqual(quais({ ordem: 'recentes' }), [pa, pb, pc])
  assert.deepEqual(quais({ ordem: 'melhores' }), [pa, pc, pb], 'pa: 2 pessoas (6); pc: 1 reação (1); pb: 0')
  assert.deepEqual(quais({ ordem: 'em-alta' }), [pa, pc, pb])
  assert.equal(codigoDe(() => x.s.respostasDaPostagem(post, { ordem: 'populares' })), 'esquema')
})

test('busca de tópicos aceita ordem; em outro tipo, ordem é erro; o padrão continua a relevância', () => {
  const x = mundo()
  const a = x.topico(x.dono, x.c, { titulo: 'Orquestra de planilhas', texto: 'a orquestra toca todo dia' })
  const b = x.topico(x.dono, x.c, { titulo: 'Orquestra de lembretes', texto: 'orquestra pequena' })
  for (const r of [x.beto, x.caio, x.duda]) x.responde(r, a, 'toco junto')
  x.responde(x.eli, b, 'também')
  const agora = x.m.relogio.agora
  const busca = (o) => x.s.buscar({ q: 'orquestra', tipo: 'topicos', leitor: null, ...o }, agora).itens.map((i) => i.id)
  assert.deepEqual(busca({ ordem: 'recentes' }), [b, a])
  assert.deepEqual(busca({ ordem: 'melhores' }), [a, b])
  assert.deepEqual(busca({ ordem: 'em-alta' }), [a, b])
  assert.deepEqual(busca({}), busca({ ordem: 'relevancia' }), 'sem ordem é a relevância, igual à 0.3.1')
  for (const tipo of ['rovers', 'comunidades', 'paginas', 'todos']) {
    assert.equal(codigoDe(() => x.s.buscar({ q: 'orquestra', tipo, ordem: 'melhores', leitor: null }, agora)), 'esquema', tipo)
  }
  assert.equal(codigoDe(() => x.s.buscar({ q: 'orquestra', tipo: 'topicos', ordem: 'populares', leitor: null }, agora)), 'esquema')
  assert.deepEqual(Object.keys(x.s.buscar({ q: 'orquestra', tipo: 'todos', leitor: null }, agora)), ['rovers', 'comunidades', 'topicos', 'paginas'], 'tipo=todos continua igual')
})

test('privacidade: comunidade fechada não se ordena de fora, ordem inválida é esquema e os pontos nunca saem', () => {
  const x = mundo()
  const fechada = x.comunidade(x.dono, { acesso: 'fechada' })
  assert.equal(codigoDe(() => x.s.topicosDa(fechada, { ordem: 'melhores', credencial: x.como(x.caio) })), 'nao_encontrado')
  assert.equal(codigoDe(() => x.s.topicosDa(x.c, { ordem: 'populares' })), 'esquema')
  const t = x.topico(x.dono, x.c)
  x.responde(x.beto, t, 'oi')
  curtir(x, x.caio, t)
  const lista = x.s.topicosDa(x.c, { ordem: 'melhores', limite: 50 })
  const texto = JSON.stringify(lista)
  for (const proibido of ['pontos', 'score', 'pessoas']) assert.equal(texto.includes(`"${proibido}"`), false, `a lista não expõe "${proibido}"`)
  for (const quem of [x.beto, x.caio]) assert.equal(texto.includes(quem.uid), false, 'e nunca quem respondeu ou reagiu')
})

test('respostas de tópico: em-alta olha só a janela e melhores olha todo o tempo', () => {
  const x = mundo()
  const t = x.topico(x.dono, x.c)
  const velha = x.responde(x.beto, t, 'a antiga, com duas filhas')
  const nova = x.responde(x.eli, t, 'a nova')
  x.responde(x.caio, t, 'filha antiga 1', { em: velha }); x.responde(x.duda, t, 'filha antiga 2', { em: velha })
  x.avancar(2 * DIA)
  x.responde(x.caio, t, 'filha nova', { em: nova })
  const quais = (o) => ids(x.s.respostasDo(t, { limite: 50, ...o }))
  assert.deepEqual(quais({ ordem: 'melhores' }), [velha, nova], 'todo o tempo: 2 pessoas (6) contra 1 (3)')
  assert.deepEqual(quais({ ordem: 'em-alta' }), [nova, velha], '24h: só a resposta nova tem atividade')
  assert.deepEqual(quais({ ordem: 'em-alta', janela: '7d' }), [velha, nova])
  assert.equal(codigoDe(() => x.s.respostasDo(t, { ordem: 'em-alta', janela: '1h' })), 'esquema')
})

test('respostas de postagem: em-alta olha só a janela e melhores olha todo o tempo', () => {
  const x = mundo()
  const post = x.ok(x.ana, 'postagem', { texto: 'uma postagem de janela', topicos: [] }).id
  const pa = x.ok(x.beto, 'resposta', { alvo: post, texto: 'a antiga' }).id
  const pb = x.ok(x.eli, 'resposta', { alvo: post, texto: 'a nova' }).id
  x.ok(x.caio, 'resposta', { alvo: pa, texto: 'filha antiga 1' }); x.ok(x.duda, 'resposta', { alvo: pa, texto: 'filha antiga 2' })
  x.avancar(2 * DIA)
  x.ok(x.caio, 'resposta', { alvo: pb, texto: 'filha nova' })
  const quais = (o) => x.s.respostasDaPostagem(post, { limite: 50, ...o }).itens.map((i) => i.envelope.objeto.id)
  assert.deepEqual(quais({ ordem: 'melhores' }), [pa, pb])
  assert.deepEqual(quais({ ordem: 'em-alta' }), [pb, pa])
  assert.deepEqual(quais({ ordem: 'em-alta', janela: '7d' }), [pa, pb])
  assert.equal(codigoDe(() => x.s.respostasDaPostagem(post, { ordem: 'em-alta', janela: '1h' })), 'esquema')
})

test('busca de tópicos: em-alta olha só a janela, melhores todo o tempo; recentes é por tempo e a relevância é a do texto', () => {
  const x = mundo()
  const a = x.topico(x.dono, x.c, { titulo: 'orquestra orquestra orquestra', texto: 'orquestra orquestra orquestra orquestra' })
  for (const r of [x.beto, x.caio, x.duda]) x.responde(r, a, 'toco junto')
  x.avancar(2 * DIA)
  const b = x.topico(x.dono, x.c, { titulo: 'Orquestra', texto: 'um dia' })
  x.responde(x.eli, b, 'também')
  const busca = (o) => x.s.buscar({ q: 'orquestra', tipo: 'topicos', leitor: null, ...o }, x.m.relogio.agora).itens.map((i) => i.id)
  assert.deepEqual(busca({ ordem: 'melhores' }), [a, b], 'todo o tempo: 3 pessoas (9) contra 1 (3)')
  assert.deepEqual(busca({ ordem: 'em-alta' }), [b, a], '24h: só o tópico novo tem atividade')
  assert.deepEqual(busca({ ordem: 'em-alta', janela: '7d' }), [a, b])
  assert.deepEqual(busca({ ordem: 'recentes' }), [b, a], 'por tempo: o mais novo primeiro')
  assert.deepEqual(busca({}), [a, b], 'a relevância do texto põe o que fala mais da palavra primeiro, ao contrário do tempo')
  assert.deepEqual(busca({ ordem: 'relevancia' }), [a, b])
  assert.equal(codigoDe(() => x.s.buscar({ q: 'orquestra', tipo: 'topicos', ordem: 'em-alta', janela: '1h', leitor: null }, x.m.relogio.agora)), 'esquema')
})

test('o pai de uma lista de respostas (em) só vale se for resposta de nível um do próprio tópico', () => {
  const x = mundo()
  const t = x.topico(x.dono, x.c)
  const outro = x.topico(x.dono, x.c, { titulo: 'Outro tópico' })
  const r = x.responde(x.beto, t, 'resposta de nível um')
  x.responde(x.caio, t, 'filha', { em: r })
  const deOutro = x.responde(x.duda, outro, 'resposta de outro tópico')
  const edicao = x.ok(x.dono, 'topico-editar', { topico: t, titulo: 'Titulo editado', texto: 'Texto editado', tags: [] }).id
  assert.equal(x.s.respostasDo(t, { em: r, limite: 50 }).itens.length, 1, 'o pai válido lista as filhas')
  for (const [nome, em] of [['resposta de outro tópico', deOutro], ['a edição do tópico', edicao], ['o próprio tópico', t], ['id que não existe', `ob_${'Z'.repeat(43)}`], ['texto qualquer', 'nao-e-id']]) {
    assert.equal(codigoDe(() => x.s.respostasDo(t, { em })), 'nao_encontrado', nome)
  }
})
