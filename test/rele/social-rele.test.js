// SPDX-License-Identifier: AGPL-3.0-or-later
// Pontos do relé que a 0.3 mexeu: alvo de reação e de resposta por versão, contexto da reação, teto de conta nova e peso da denúncia.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TEMPOS } from '../../packages/protocolo/src/index.js'
import { erroDe, nova } from '../ajuda/rede.js'

function comTopico() {
  const x = nova()
  const dono = x.rover()
  const m = x.rover()
  const c = x.comunidade(dono)
  x.entra(m, c)
  const t = x.topico(m, c)
  return { x, dono, m, c, t }
}

test('resposta (tipo antigo) só mira postagem ou resposta, em qualquer versão; reação da 0.3 mira também o resto', () => {
  const { x, dono, m, c, t } = comTopico()
  const r03 = erroDe(() => x.ok(m, 'resposta', { alvo: t, texto: 'respondendo um tópico' }))
  assert.equal(r03.codigo, 'esquema')
  assert.match(r03.message, /postagem ou uma resposta\.$/)
  const r02 = erroDe(() => x.ok(m, 'reacao', { alvo: t, reacao: 'curtir' }, { v: '0.2' }))
  assert.equal(r02.codigo, 'esquema')
  assert.match(r02.message, /postagem ou uma resposta\.$/, 'reação 0.2 não alcança tópico')
  const fora = erroDe(() => x.ok(m, 'reacao', { alvo: c, reacao: 'curtir' }))
  assert.equal(fora.codigo, 'esquema')
  assert.match(fora.message, /tópico, resposta de fórum, atualização de página ou entrega\.$/)
  assert.equal(x.faz(dono, 'reacao', { alvo: t, reacao: 'curtir' }).estado, 'aceito', 'reação 0.3 em tópico')
})

test('a reação guarda o contexto: o tópico, quando o alvo é o tópico ou uma resposta dele; nenhum, numa postagem', () => {
  const { x, dono, m, t } = comTopico()
  const resp = x.responde(m, t)
  const noTopico = x.ok(dono, 'reacao', { alvo: t, reacao: 'curtir' })
  const naResposta = x.ok(dono, 'reacao', { alvo: resp, reacao: 'util' })
  assert.equal(x.m.armazem.objeto(noTopico.objeto.id).ctx, t)
  assert.equal(x.m.armazem.objeto(naResposta.objeto.id).ctx, t)
  const post = x.ok(m, 'postagem', { texto: 'uma postagem comum', topicos: [] })
  const naPostagem = x.ok(dono, 'reacao', { alvo: post.objeto.id, reacao: 'curtir' })
  assert.equal(x.m.armazem.objeto(naPostagem.objeto.id).ctx, null)
})

test('perfil não tem o teto reduzido de conta nova: seis por hora, nem um a mais nem um a menos', () => {
  const x = nova({ novatos: true })
  const r = x.rover({ novato: true }) // o registro já publicou um perfil
  for (let i = 0; i < 5; i++) assert.equal(x.faz(r, 'perfil', { nome: `Pipa ${i}`, descricao: '' }).estado, 'aceito', `perfil ${i + 2}`)
  assert.equal(erroDe(() => x.ok(r, 'perfil', { nome: 'Pipa demais', descricao: '' })).codigo, 'limite_de_taxa')
})

test('o teto do emissor não encolhe por a conta ser nova', () => {
  const x = nova({ novatos: true, taxas: { emissor: [[3600, 6]], total: [[3600, 1000]], porTipo: { postagem: [[3600, 1000]] } } })
  const r = x.rover({ novato: true }) // o perfil de registro conta 1 para o emissor
  let aceitos = 0
  for (let i = 0; i < 10; i++) {
    const e = (() => { try { return x.faz(r, 'postagem', { texto: `postagem ${i}`, topicos: [] }) } catch (err) { return err } })()
    if (e.estado === 'aceito') aceitos++
    else { assert.equal(e.codigo, 'limite_de_taxa'); assert.match(e.message, /emissor/); break }
  }
  assert.equal(aceitos, 5)
})

test('quem sai da lista de descoberta sai do índice de busca; quem volta, volta', () => {
  const x = nova()
  const r = x.rover({ handle: 'indice.teste' })
  const indexados = () => x.m.armazem.todos("SELECT ref FROM busca WHERE tipo = 'rover' AND ref = :uid", { uid: r.uid }).length
  assert.equal(indexados(), 1)
  x.ok(r, 'perfil', { nome: 'Pipa', descricao: '', listado: false })
  assert.equal(indexados(), 0)
  const oculto = x.rover({ perfil: { listado: false } })
  assert.equal(x.m.armazem.todos("SELECT ref FROM busca WHERE tipo = 'rover' AND ref = :uid", { uid: oculto.uid }).length, 0, 'quem nunca foi listado nunca entrou')
  x.ok(r, 'perfil', { nome: 'Pipa', descricao: '', listado: true })
  assert.equal(indexados(), 1)
})

test('denúncia de conta com exatamente 7 dias pesa como forte; um segundo a menos, não', () => {
  const x = nova()
  const [autor, velha, quase] = [x.rover(), x.rover(), x.rover()]
  const p1 = x.ok(autor, 'postagem', { texto: 'primeira postagem', topicos: [] }).objeto.id
  const p2 = x.ok(autor, 'postagem', { texto: 'segunda postagem', topicos: [] }).objeto.id
  const agora = x.m.relogio.agora
  x.m.armazem.executar('UPDATE rovers SET criado_em = :c WHERE uid = :u', { c: agora - TEMPOS.pesoDeDenunciaContaMinimaS, u: velha.uid })
  x.m.armazem.executar('UPDATE rovers SET criado_em = :c WHERE uid = :u', { c: agora - TEMPOS.pesoDeDenunciaContaMinimaS + 1, u: quase.uid })
  x.faz(velha, 'denuncia', { alvo: p1, motivo: 'spam' })
  x.faz(quase, 'denuncia', { alvo: p2, motivo: 'spam' })
  const forte = (alvo) => x.m.armazem.um('SELECT forte FROM denuncias WHERE alvo = :a', { a: alvo }).forte
  assert.equal(forte(p1), 1)
  assert.equal(forte(p2), 0)
})
