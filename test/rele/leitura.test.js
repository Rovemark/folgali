// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import { assinaturaDoObjetoConfere, validarObjeto } from '../../packages/protocolo/src/index.js'
import { codigoDe, erroDe, novoMundo, publicar, roverRegistrado } from '../ajuda/rele-de-teste.js'

const post = (texto) => ({ texto, topicos: [] })

test('perfil público: só o que o protocolo diz que é público, com tudo para conferir a assinatura', () => {
  const m = novoMundo()
  const r = roverRegistrado(m, { handle: 'pipa.rover' })
  const p = m.rele.perfil(r.uid)
  assert.deepEqual(Object.keys(p).sort(), [
    'atestado', 'cabeca', 'chave', 'chaveAprovacao', 'descricao', 'desde', 'emissor', 'estado', 'exigirAprovacao', 'grafo', 'habilidades', 'handle',
    'interesses', 'listado', 'nome', 'perfil', 'perfilId', 'recados', 'retrato', 'seguidores', 'seguindo', 'sobre', 'uid'
  ])
  assert.equal(p.handle, 'pipa.rover')
  assert.equal(p.nome, 'Pipa')
  assert.equal(p.chave, r.rede.chavePublica)
  assert.equal(p.chaveAprovacao, r.aprovacao.chavePublica)
  assert.equal(p.desde, m.relogio.agora - 30 * 86400) // o mundo de teste envelhece as contas em 30 dias (ver novoMundo)
  assert.equal(p.cabeca, r.cabeca)
  assert.equal(validarObjeto(p.perfil).ok, true)
  assert.equal(assinaturaDoObjetoConfere(p.perfil, p.chave), true)
  assert.equal(p.seguindo, 0)
  assert.equal(p.seguidores, 0)
})

test('perfil por handle e por uid; formatos inválidos e desconhecidos dão 404', () => {
  const m = novoMundo()
  const r = roverRegistrado(m, { handle: 'achado.aqui' })
  assert.equal(m.rele.porHandle('achado.aqui').uid, r.uid)
  for (const ruim of ['', 'AB', 'Maiusculo', 'a'.repeat(31), 'com espaço', "x'; DROP TABLE rovers;--", 'nao.existe']) {
    assert.equal(codigoDe(() => m.rele.porHandle(ruim)), 'nao_encontrado', ruim)
  }
  for (const ruim of ['rvr_curto', '', 'x', "rvr_' OR 1=1 --", `rvr_${'A'.repeat(22)}`]) {
    assert.equal(codigoDe(() => m.rele.perfil(ruim)), 'nao_encontrado', ruim)
  }
})

test('postagens do rover: ordem do mais novo ao mais velho, paginação por cursor sem repetir nem pular', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const ids = []
  for (let i = 0; i < 5; i++) ids.push(publicar(m, r, 'postagem', post(`postagem ${i}`)).id)
  const p1 = m.rele.postagensDe(r.uid, { limite: 2 })
  assert.deepEqual(p1.itens.map((e) => e.objeto.id), [ids[4], ids[3]])
  assert.ok(p1.proximo)
  const p2 = m.rele.postagensDe(r.uid, { limite: 2, antes: p1.proximo })
  assert.deepEqual(p2.itens.map((e) => e.objeto.id), [ids[2], ids[1]])
  const p3 = m.rele.postagensDe(r.uid, { limite: 2, antes: p2.proximo })
  assert.deepEqual(p3.itens.map((e) => e.objeto.id), [ids[0]])
  assert.equal(p3.proximo, null)
  assert.ok(p1.itens.every((e) => e.aprovacao && e.objeto.tipo === 'postagem'))
})

test('paginação: página cheia exata não promete próxima', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  for (let i = 0; i < 4; i++) publicar(m, r, 'postagem', post(`p${i}`))
  const p1 = m.rele.postagensDe(r.uid, { limite: 2 })
  const p2 = m.rele.postagensDe(r.uid, { limite: 2, antes: p1.proximo })
  assert.equal(p2.itens.length, 2)
  assert.equal(p2.proximo, null)
  assert.equal(m.rele.postagensDe(r.uid, { limite: 4 }).proximo, null)
  assert.notEqual(m.rele.postagensDe(r.uid, { limite: 3 }).proximo, null)
})

test('postagens: só as do rover, sem as removidas e sem respostas', () => {
  const m = novoMundo()
  const a = roverRegistrado(m)
  const b = roverRegistrado(m)
  const pa = publicar(m, a, 'postagem', post('de A'))
  publicar(m, b, 'postagem', post('de B'))
  publicar(m, b, 'resposta', { alvo: pa.id, texto: 'resposta de B' })
  const apagada = publicar(m, a, 'postagem', post('apagada'))
  publicar(m, a, 'remocao-pelo-autor', { alvo: apagada.id })
  const lista = m.rele.postagensDe(a.uid).itens
  assert.deepEqual(lista.map((e) => e.objeto.corpo.texto), ['de A'])
  assert.equal(m.rele.postagensDe(b.uid).itens.length, 1)
})

test('linha do início: só quem o rover segue, em ordem de chegada, e acompanha seguir e deixar de seguir', () => {
  const m = novoMundo()
  const eu = roverRegistrado(m)
  const a = roverRegistrado(m)
  const b = roverRegistrado(m)
  const c = roverRegistrado(m)
  publicar(m, eu, 'seguir', { alvo: a.uid })
  publicar(m, eu, 'seguir', { alvo: b.uid })
  const a1 = publicar(m, a, 'postagem', post('a1')).id
  publicar(m, c, 'postagem', post('c1 (não sigo)'))
  const b1 = publicar(m, b, 'postagem', post('b1')).id
  const a2 = publicar(m, a, 'postagem', post('a2')).id
  publicar(m, eu, 'postagem', post('minha própria'))
  assert.deepEqual(m.rele.linhaDoInicio(eu.uid).itens.map((e) => e.objeto.id), [a2, b1, a1])
  publicar(m, eu, 'deixar-de-seguir', { alvo: a.uid })
  assert.deepEqual(m.rele.linhaDoInicio(eu.uid).itens.map((e) => e.objeto.id), [b1])
  assert.deepEqual(m.rele.linhaDoInicio(c.uid).itens, [])
})

test('linha do início: pagina, esconde removidas e esconde quem perdeu o atestado ou foi revogado', () => {
  const m = novoMundo()
  const eu = roverRegistrado(m)
  const a = roverRegistrado(m)
  const curto = roverRegistrado(m, { validadeS: 500 })
  const revogado = roverRegistrado(m)
  for (const alvo of [a, curto, revogado]) publicar(m, eu, 'seguir', { alvo: alvo.uid })
  const ids = []
  for (let i = 0; i < 3; i++) ids.push(publicar(m, a, 'postagem', post(`a${i}`)).id)
  publicar(m, curto, 'postagem', post('do que vai vencer'))
  publicar(m, revogado, 'postagem', post('do revogado'))
  const apagada = publicar(m, a, 'postagem', post('apagada'))
  publicar(m, a, 'remocao-pelo-autor', { alvo: apagada.id })
  m.provedor.revogar(m.provedor.chavePublica, revogado.uid)
  const antes = m.rele.linhaDoInicio(eu.uid, { limite: 100 }).itens.map((e) => e.objeto.corpo.texto)
  assert.deepEqual(antes, ['do que vai vencer', 'a2', 'a1', 'a0'])
  m.avancar(600)
  const depois = m.rele.linhaDoInicio(eu.uid, { limite: 100 }).itens.map((e) => e.objeto.corpo.texto)
  assert.deepEqual(depois, ['a2', 'a1', 'a0'])
  const p1 = m.rele.linhaDoInicio(eu.uid, { limite: 2 })
  assert.equal(p1.itens.length, 2)
  assert.deepEqual(m.rele.linhaDoInicio(eu.uid, { limite: 2, antes: p1.proximo }).itens.map((e) => e.objeto.corpo.texto), ['a0'])
})

test('linha e postagens de rover desconhecido, sem atestado vigente ou com uid torto: 404', () => {
  const m = novoMundo()
  const curto = roverRegistrado(m, { validadeS: 100 })
  m.avancar(200)
  for (const uid of [curto.uid, `rvr_${'A'.repeat(22)}`, 'x']) {
    assert.equal(codigoDe(() => m.rele.linhaDoInicio(uid)), 'nao_encontrado')
    assert.equal(codigoDe(() => m.rele.postagensDe(uid)), 'nao_encontrado')
    assert.equal(codigoDe(() => m.rele.perfil(uid)), 'nao_encontrado')
  }
})

test('objeto por id: devolve o envelope com a aprovação; removido dá 410; desconhecido e torto dão 404', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const p = publicar(m, r, 'postagem', post('olá'))
  const lido = m.rele.objeto(p.id)
  assert.equal(lido.objeto.id, p.id)
  assert.equal(lido.aprovacao.objeto, p.id)
  const seguir = publicar(m, r, 'seguir', { alvo: roverRegistrado(m).uid })
  assert.equal(m.rele.objeto(seguir.id).aprovacao, undefined)
  assert.equal(codigoDe(() => m.rele.objeto(`ob_${'A'.repeat(43)}`)), 'nao_encontrado')
  assert.equal(codigoDe(() => m.rele.objeto('ob_curto')), 'nao_encontrado')
  assert.equal(codigoDe(() => m.rele.objeto("ob_' OR 1=1 --")), 'nao_encontrado')
  publicar(m, r, 'remocao-pelo-autor', { alvo: p.id })
  const e = erroDe(() => m.rele.objeto(p.id))
  assert.equal(e.codigo, 'removido')
  assert.equal(e.status, 410)
})

test('um objeto de "deixar de seguir" guarda só o rastro, não o envelope', () => {
  const m = novoMundo()
  const eu = roverRegistrado(m)
  const a = roverRegistrado(m)
  publicar(m, eu, 'seguir', { alvo: a.uid })
  const d = publicar(m, eu, 'deixar-de-seguir', { alvo: a.uid })
  assert.equal(m.armazem.objeto(d.id).envelope, null)
  assert.equal(codigoDe(() => m.rele.objeto(d.id)), 'removido')
})

test('info do relé: versões, emissores e limites', () => {
  const m = novoMundo()
  const i = m.rele.info()
  assert.deepEqual(i.protocolo, ['0.1', '0.2', '0.3'])
  assert.equal(i.versaoDoRascunho, '0.6.0', 'a revisão aditiva (propostas 0006, 0007 e 0008)')
  assert.deepEqual(i.protocolo, ['0.1', '0.2', '0.3'], 'os objetos continuam 0.3: a lista de versões aceitas não muda')
  assert.ok(Array.isArray(i.recursos) && i.recursos.includes('postagem-detalhe') && i.recursos.includes('denuncia-dispensar'))
  for (const nome of ['inicio', 'ordem-por-pessoas', 'vocabulario', 'anuncios']) assert.ok(i.recursos.includes(nome), `0.3.2: ${nome}`)
  assert.equal(i.social, true)
  assert.deepEqual(i.emissores, [m.provedor.chavePublica])
  assert.equal(i.limites.aprovacaoValidadeMaxS, 600)
  assert.equal(i.limites.seguidosPorRover, 500)
  assert.equal(i.provedor, 'teste')
})
