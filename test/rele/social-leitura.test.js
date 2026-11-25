// SPDX-License-Identifier: AGPL-3.0-or-later
// Leitura social: paginação nas bordas, trechos, citação de resposta que saiu, rótulos de estado e ids que não existem.
import test from 'node:test'
import assert from 'node:assert/strict'
import { PAGINA_PADRAO } from '../../packages/protocolo/src/index.js'
import { codigoDe, nova } from '../ajuda/rede.js'

const IDX = `ob_${'A'.repeat(43)}`
const UIDX = `rvr_${'A'.repeat(22)}`
/** Texto de `n` letras que o filtro de segredo aceita (palavras curtas, não uma carreira de letras). */
const texto = (n) => `${'abcd '.repeat(Math.ceil(n / 5)).slice(0, n - 1)}x`

function comunidadeComTopico(extra = {}) {
  const x = nova()
  const dono = x.rover()
  const m = x.rover()
  const c = x.comunidade(dono)
  x.entra(m, c)
  const t = x.topico(m, c, extra)
  return { x, dono, m, c, t }
}

test('o tamanho de página padrão é 20 e vale quando ninguém pede outro', () => {
  assert.equal(PAGINA_PADRAO, 20)
  const x = nova()
  const dono = x.rover()
  for (let i = 0; i < PAGINA_PADRAO + 1; i++) x.ok(x.rover(), 'recado', { alvo: dono.uid, texto: `recado ${i}` })
  const p = x.s.recados(dono.uid, {})
  assert.equal(p.itens.length, PAGINA_PADRAO)
  assert.notEqual(p.proximo, null)
  assert.equal(x.s.recados(dono.uid, { antes: p.proximo }).itens.length, 1)
})

test('paginação por cursor: exatamente "limite" itens não tem próxima página; um a mais tem', () => {
  const x = nova()
  const dono = x.rover()
  for (let i = 0; i < 3; i++) x.ok(x.rover(), 'recado', { alvo: dono.uid, texto: `recado ${i}` })
  assert.equal(x.s.recados(dono.uid, { limite: 3 }).proximo, null)
  const dois = x.s.recados(dono.uid, { limite: 2 })
  assert.equal(dois.itens.length, 2)
  assert.notEqual(dois.proximo, null)
  assert.equal(x.s.recados(dono.uid, { limite: 2, antes: dois.proximo }).itens.length, 1)
})

test('paginação por deslocamento: a próxima página só existe quando sobra item', () => {
  const x = nova()
  const dono = x.rover()
  const c = x.comunidade(dono)
  x.entra(x.rover(), c, { esperar: false })
  assert.equal(x.s.membrosDa(c, { limite: 2, credencial: x.como(dono) }).proximo, null, 'dois membros, página de dois')
  const um = x.s.membrosDa(c, { limite: 1, credencial: x.como(dono) })
  assert.equal(um.itens.length, 1)
  assert.equal(um.proximo, 1)
  const resto = x.s.membrosDa(c, { limite: 1, antes: um.proximo, credencial: x.como(dono) })
  assert.equal(resto.itens.length, 1)
  assert.equal(resto.proximo, null)
})

test('o trecho do tópico corta em 200 letras e só então põe reticências', () => {
  const exato = comunidadeComTopico({ texto: texto(200) })
  assert.equal(exato.x.s.topicosDa(exato.c, {}).itens[0].trecho, texto(200))
  const maior = comunidadeComTopico({ texto: texto(201) })
  assert.equal(maior.x.s.topicosDa(maior.c, {}).itens[0].trecho, `${texto(201).slice(0, 200)}…`)
})

test('o cartão do tópico diz se está trancado e se tem enquete', () => {
  const { x, dono, m, c, t } = comunidadeComTopico()
  const sem = x.s.topicosDa(c, {}).itens[0]
  assert.equal(sem.trancado, false)
  assert.equal(sem.enquete, false)
  x.ok(dono, 'topico-gestao', { topico: t, acao: 'trancar', comunidade: null, categoria: null })
  assert.equal(x.s.topicosDa(c, {}).itens[0].trancado, true)
  const e = x.topico(m, c, { titulo: 'Com enquete', enquete: { opcoes: ['Sim', 'Não'], encerraEm: x.m.relogio.agora + 7200 } })
  assert.equal(x.s.topicosDa(c, {}).itens.find((i) => i.id === e).enquete, true)
})

test('a citação mostra o trecho só enquanto a resposta citada está viva e visível', () => {
  const { x, dono, m, t } = comunidadeComTopico()
  const a1 = x.responde(m, t, 'apagada pelo autor')
  const a2 = x.responde(m, t, 'escondida pela moderação')
  const a3 = x.responde(m, t, 'continua aqui')
  x.avancar(700)
  const b1 = x.responde(m, t, 'cito a primeira', { cita: a1 })
  const b2 = x.responde(m, t, 'cito a segunda', { cita: a2 })
  const b3 = x.responde(m, t, 'cito a terceira', { cita: a3 })
  x.ok(m, 'remocao-pelo-autor', { alvo: a1 })
  x.ok(dono, 'remocao-por-responsavel', { alvo: a2, motivo: 'spam' })
  const cita = (id) => x.s.respostasDo(t, { limite: 50 }).itens.find((i) => i.id === id).cita
  assert.equal(cita(b1).trecho, null)
  assert.equal(cita(b2).trecho, null)
  assert.equal(cita(b3).trecho, 'continua aqui')
})

test('o trecho da citação também corta em 200 letras', () => {
  const { x, m, t } = comunidadeComTopico()
  const longa = x.responde(m, t, texto(201))
  x.avancar(700)
  const b = x.responde(m, t, 'cito a longa', { cita: longa })
  assert.equal(x.s.respostasDo(t, { limite: 50 }).itens.find((i) => i.id === b).cita.trecho, `${texto(201).slice(0, 200)}…`)
})

test('respostas em fio: "em" precisa ser uma resposta deste tópico', () => {
  const { x, dono, m, t } = comunidadeComTopico()
  const r = x.responde(m, t, 'uma resposta')
  const reacao = x.ok(dono, 'reacao', { alvo: t, reacao: 'curtir' }).id
  assert.equal(codigoDe(() => x.s.respostasDo(t, { em: reacao })), 'nao_encontrado', 'uma reação ao tópico não é resposta')
  assert.equal(codigoDe(() => x.s.respostasDo(t, { em: t })), 'nao_encontrado', 'o tópico não é resposta')
  assert.equal(codigoDe(() => x.s.respostasDo(t, { em: IDX })), 'nao_encontrado')
  assert.deepEqual(x.s.respostasDo(t, { em: r }).itens, [])
})

test('depoimento pendente não leva a data de aceite; o aceito leva', () => {
  const x = nova()
  const [a, b] = [x.rover(), x.rover()]
  x.amigos(a, b, 4)
  const d = x.ok(b, 'depoimento', { alvo: a.uid, texto: 'Entrega no prazo.' })
  const pend = x.s.depoimentos(a.uid, { estado: 'pendentes', credencial: x.como(a) }).itens[0]
  assert.equal('aceitoEm' in pend, false)
  x.ok(a, 'depoimento-decisao', { depoimento: d.id, decisao: 'aceitar' })
  const aceito = x.s.depoimentos(a.uid, {}).itens[0]
  assert.equal(aceito.aceitoEm, x.m.armazem.objeto(d.id).estado_em)
})

test('comunidade moderada: quem pediu entrada vê "pedidoPendente", quem não pediu não', () => {
  const x = nova()
  const [dono, a, b] = [x.rover(), x.rover(), x.rover()]
  const c = x.comunidade(dono, { acesso: 'moderada' })
  x.ok(a, 'comunidade-adesao', { comunidade: c, acao: 'entrar' })
  assert.equal(x.s.comunidadeDetalhe(c, { credencial: x.como(a) }).voce.pedidoPendente, true)
  assert.equal(x.s.comunidadeDetalhe(c, { credencial: x.como(b) }).voce.pedidoPendente, false)
})

test('filas de gestão numa comunidade que não existe: "nao_encontrado", com e sem credencial', () => {
  const x = nova()
  const r = x.rover()
  for (const fn of ['pedidosDe', 'convitesDa', 'banidosDa']) {
    assert.equal(codigoDe(() => x.s[fn](IDX, { credencial: x.como(r) })), 'nao_encontrado', `${fn} com credencial`)
    assert.equal(codigoDe(() => x.s[fn](IDX, {})), 'nao_encontrado', `${fn} sem credencial`)
  }
})

test('listas do grafo de um rover que não existe: "nao_encontrado"', () => {
  const x = nova()
  for (const fn of ['amigos', 'comunidadesDoRover', 'paginasDoRover']) {
    assert.equal(codigoDe(() => x.s[fn](UIDX, {})), 'nao_encontrado', fn)
  }
})

test('páginas: ordem inválida é recusada; "ativas" põe primeiro quem publicou por último', () => {
  const x = nova()
  const dono = x.rover()
  const p1 = x.ok(dono, 'pagina-criar', { nome: 'Primeira página', descricao: '', tema: 'rovers' }).id
  x.avancar(10)
  const p2 = x.ok(dono, 'pagina-criar', { nome: 'Segunda página', descricao: '', tema: 'rovers' }).id
  assert.equal(codigoDe(() => x.s.paginasListadas({ ordem: 'nada' })), 'esquema')
  assert.deepEqual(x.s.paginasListadas({ ordem: 'recentes' }).itens.map((i) => i.id), [p2, p1])
  x.avancar(10)
  x.ok(dono, 'pagina-publicar', { pagina: p1, texto: 'Novidade na primeira.', tags: [] })
  assert.deepEqual(x.s.paginasListadas({ ordem: 'ativas' }).itens.map((i) => i.id), [p1, p2])
  assert.deepEqual(x.s.paginasListadas({ ordem: 'recentes' }).itens.map((i) => i.id), [p2, p1])
})
