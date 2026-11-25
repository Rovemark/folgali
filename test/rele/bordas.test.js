// SPDX-License-Identifier: AGPL-3.0-or-later
// Bordas e valores padrão: o que só aparece quando o número está certo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Armazem } from '../../packages/rele/src/armazem.js'
import { BaldeDeFichas } from '../../packages/rele/src/limite-taxa.js'
import { Rele } from '../../packages/rele/src/rele.js'
import { codigoDe, novoMundo, publicar, roverRegistrado } from '../ajuda/rele-de-teste.js'

const livre = { porTipo: { perfil: [[3600, 100]], postagem: [[3600, 100]], seguir: [[3600, 100]] } }
const post = (texto) => ({ texto, topicos: [] })

test('paginação padrão: 20 itens por página nas postagens e na linha do início', () => {
  const m = novoMundo({ taxas: livre })
  const a = roverRegistrado(m)
  const eu = roverRegistrado(m)
  publicar(m, eu, 'seguir', { alvo: a.uid })
  for (let i = 0; i < 25; i++) publicar(m, a, 'postagem', post(`p${i}`))
  for (const pagina of [m.rele.postagensDe(a.uid), m.rele.linhaDoInicio(eu.uid)]) {
    assert.equal(pagina.itens.length, 20)
    assert.notEqual(pagina.proximo, null)
  }
  assert.equal(m.rele.postagensDe(a.uid, { antes: m.rele.postagensDe(a.uid).proximo }).itens.length, 5)
})

test('motivo de bloqueio: de 1 a 200 caracteres', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  m.rele.bloquear({ tipo: 'rover', alvo: r.uid, motivo: 'x' })
  const de = (n) => `${'abcd '.repeat(Math.ceil(n / 5))}`.slice(0, n - 1) + 'e' // palavras curtas: texto sem espaços longos cairia no filtro de segredo
  assert.equal(de(200).length, 200)
  m.rele.bloquear({ tipo: 'rover', alvo: r.uid, motivo: de(200) })
  assert.equal(codigoDe(() => m.rele.bloquear({ tipo: 'rover', alvo: r.uid, motivo: de(201) })), 'esquema')
})

test('fila de denúncias devolve 50 por padrão e respeita o limite pedido', () => {
  const m = novoMundo()
  for (let i = 0; i < 60; i++) {
    m.armazem.executar('INSERT INTO denuncias (alvo, autor_do_alvo, motivo, pseudonimo, criado_em) VALUES (:alvo, :autor, :motivo, :p, :agora)', {
      alvo: `ob_${String(i).padStart(43, 'A')}`, autor: `rvr_${'B'.repeat(22)}`, motivo: 'spam', p: `p${i}`, agora: m.relogio.agora
    })
  }
  assert.equal(m.rele.listarDenuncias().length, 50)
  assert.equal(m.rele.listarDenuncias({ limite: 60 }).length, 60)
  assert.equal(m.rele.listarDenuncias({ limite: 3 }).length, 3)
  assert.equal(m.rele.listarDenuncias()[0].alvo, `ob_${'59'.padStart(43, 'A')}`) // a mais nova primeiro
})

test('retenção da denúncia: 180 dias contados em segundos, na fronteira exata', () => {
  const m = novoMundo()
  const a = roverRegistrado(m)
  const d = roverRegistrado(m)
  const p = publicar(m, a, 'postagem', post('x'))
  publicar(m, d, 'denuncia', { alvo: p.id, motivo: 'spam' })
  m.avancar(180 * 86400)
  assert.equal(m.rele.limpar(), 0) // exatamente 180 dias: ainda fica
  m.avancar(1)
  assert.equal(m.rele.limpar(), 1)
})

test('o prazo de retenção pode ser configurado', () => {
  const m = novoMundo()
  const a = roverRegistrado(m)
  const d = roverRegistrado(m)
  const p = publicar(m, a, 'postagem', post('x'))
  publicar(m, d, 'denuncia', { alvo: p.id, motivo: 'spam' })
  const curto = new Rele({ armazem: m.armazem, provedor: m.provedor, relogio: () => m.relogio.agora, segredoDeDenuncias: Buffer.alloc(32, 1), retencaoDenunciasDias: 1 })
  m.avancar(86400 + 1)
  assert.equal(curto.limpar(), 1)
})

test('segredo de denúncias: 31 bytes não serve, 32 serve', () => {
  const m = novoMundo()
  const novo = (n) => new Rele({ armazem: m.armazem, provedor: m.provedor, segredoDeDenuncias: Buffer.alloc(n, 7) })
  assert.throws(() => novo(31), /32 bytes/)
  assert.doesNotThrow(() => novo(32))
})

test('remover duas vezes não reescreve a data da primeira remoção', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const p = publicar(m, r, 'postagem', post('x'))
  publicar(m, r, 'remocao-pelo-autor', { alvo: p.id })
  const primeira = m.armazem.objeto(p.id).removido_em
  assert.equal(primeira, m.relogio.agora)
  m.avancar(100)
  publicar(m, r, 'remocao-pelo-autor', { alvo: p.id })
  assert.equal(m.armazem.objeto(p.id).removido_em, primeira)
})

test('armazém: nome de coluna é lista fechada e o arquivo em disco usa WAL', () => {
  const m = novoMundo()
  assert.throws(() => m.armazem.contarDesde('autor; DROP TABLE objetos; --', 'x', 0), /coluna inválida/)
  assert.throws(() => m.armazem.contarDesde('recebido_em', 'x', 0), /coluna inválida/)
  assert.equal(m.armazem.contarDesde('autor', 'ninguém', 0).n, 0)
  assert.equal(m.armazem.contarDesde('emissor', 'ninguém', 0, 'postagem').n, 0)
  assert.equal(m.armazem.um('PRAGMA journal_mode').journal_mode, 'memory')
  const pasta = mkdtempSync(join(tmpdir(), 'rn-armazem-'))
  try {
    const emDisco = new Armazem(join(pasta, 'rele.sqlite'))
    assert.equal(emDisco.um('PRAGMA journal_mode').journal_mode, 'wal')
    emDisco.fechar()
  } finally { rmSync(pasta, { recursive: true, force: true }) }
})

test('balde de fichas: o mapa de origens tem teto padrão de 10 mil', () => {
  const b = new BaldeDeFichas({ capacidade: 1, porSegundo: 1, relogio: () => 0 })
  for (let i = 0; i < 10_500; i++) b.tentar(`origem-${i}`)
  assert.equal(b.tamanho, 10_000)
})

test('contagem de taxa por tipo usa o tipo certo e a janela certa', () => {
  const m = novoMundo({ taxas: { porTipo: { perfil: [[3600, 100]], postagem: [[100, 2]], seguir: [[3600, 100]] } } })
  const r = roverRegistrado(m)
  publicar(m, r, 'postagem', post('um'))
  publicar(m, r, 'postagem', post('dois'))
  const e = (() => { try { publicar(m, r, 'postagem', post('três')) } catch (x) { return x } return null })()
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.equal(e.retryAfterS, 100)
  assert.match(e.message, /Limite de 2 em 100 segundos para este tipo de objeto/)
  m.avancar(101)
  assert.equal(publicar(m, r, 'postagem', post('quatro')).estado, 'aceito')
})

test('relógio padrão: segundos inteiros do relógio de verdade, no relé e no balde', () => {
  const m = novoMundo()
  const rele = new Rele({ armazem: m.armazem, provedor: m.provedor, segredoDeDenuncias: Buffer.alloc(32, 3) })
  const agora = Date.now() / 1000
  assert.ok(Number.isInteger(rele.relogio()))
  assert.ok(Math.abs(rele.relogio() - agora) < 2, `relogio ${rele.relogio()} agora ${agora}`)
  const balde = new BaldeDeFichas({ capacidade: 1, porSegundo: 1 })
  assert.ok(Math.abs(balde.relogio() - agora) < 2)
})
