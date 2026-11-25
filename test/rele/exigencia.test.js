// SPDX-License-Identifier: AGPL-3.0-or-later
// Aprovação humana por tipo de ação: livre por padrão para seguir, deixar de seguir, reagir e denunciar; a pessoa (ou o rover)
// pode exigir aprovação a cada uso, e o relé respeita a exigência publicada.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TIPOS_EXIGIVEIS } from '../../packages/protocolo/src/index.js'
import { aprovar, objetoDe, politicaDe } from '../ajuda/mundo.js'
import { codigoDe, envelopeDe, erroDe, novoMundo, publicar, roverRegistrado } from '../ajuda/rele-de-teste.js'

const post = (texto) => ({ texto, topicos: [] })
const declarar = (m, rover, opcoes) => m.rele.aceitarDeclaracao({ declaracao: politicaDe(rover, { emitidaEm: m.relogio.agora, ...opcoes }) })

/** Monta um rover `r` e um alvo `b` com uma postagem, e devolve o corpo de cada ação exigível. */
function cenario(opcoesDoRover = {}) {
  const m = novoMundo()
  const r = roverRegistrado(m, opcoesDoRover)
  const b = roverRegistrado(m)
  const p = publicar(m, b, 'postagem', post('do b'))
  publicar(m, r, 'seguir', { alvo: b.uid }, { aprovada: (opcoesDoRover.exigirAprovacao ?? []).includes('seguir') }) // para ter o que deixar de seguir
  const corpos = {
    seguir: { alvo: roverRegistrado(m).uid },
    'deixar-de-seguir': { alvo: b.uid },
    reacao: { alvo: p.id, reacao: 'curtir' },
    denuncia: { alvo: p.id, motivo: 'spam' }
  }
  return { m, r, b, p, corpos }
}

test('padrão: seguir, deixar de seguir, reagir e denunciar saem livres; aprovação a mais nelas é recusada', () => {
  const { m, r, corpos } = cenario()
  for (const tipo of TIPOS_EXIGIVEIS) {
    const sobra = envelopeDe(m, r, tipo, corpos[tipo], { previo: tipo === 'denuncia' ? null : r.cabeca, aprovacao: true })
    sobra.aprovacao = aprovar(r, sobra.objeto, { aprovadoEm: m.relogio.agora })
    const e = erroDe(() => m.rele.aceitar(sobra))
    assert.equal(e.codigo, 'esquema', tipo)
    assert.equal(e.campo, 'aprovacao', tipo)
    assert.equal(publicar(m, r, tipo, corpos[tipo], { aprovada: false }).estado, tipo === 'denuncia' ? 'recebida' : 'aceito', tipo)
  }
})

for (const tipo of TIPOS_EXIGIVEIS) {
  test(`rover publica no perfil que "${tipo}" exige aprovação: sem ela é "sem_aprovacao", com ela entra, e os outros tipos seguem livres`, () => {
    const { m, r, corpos } = cenario({ exigirAprovacao: [tipo] })
    assert.deepEqual(m.rele.perfil(r.uid).exigirAprovacao, [tipo])
    const e = erroDe(() => publicar(m, r, tipo, corpos[tipo], { aprovada: false }))
    assert.equal(e.codigo, 'sem_aprovacao')
    assert.equal(e.campo, 'aprovacao')
    const r2 = publicar(m, r, tipo, corpos[tipo], { aprovada: true })
    assert.equal(r2.estado, tipo === 'denuncia' ? 'recebida' : 'aceito')
    for (const outro of TIPOS_EXIGIVEIS.filter((x) => x !== tipo)) {
      const c = cenario({ exigirAprovacao: [tipo] })
      assert.notEqual(codigoDe(() => publicar(c.m, c.r, outro, c.corpos[outro], { aprovada: false })), 'sem_aprovacao', `${tipo} não pode exigir ${outro}`)
    }
  })

  test(`a PESSOA exige aprovação para "${tipo}" sem o rover, e o rover não desfaz publicando perfil sem a exigência`, () => {
    const livre = cenario()
    assert.notEqual(codigoDe(() => publicar(livre.m, livre.r, tipo, livre.corpos[tipo], { aprovada: false })), 'sem_aprovacao')
    const { m, r, corpos } = cenario()
    declarar(m, r, { exigirAprovacao: [tipo] })
    assert.equal(codigoDe(() => publicar(m, r, tipo, corpos[tipo], { aprovada: false })), 'sem_aprovacao')
    publicar(m, r, 'perfil', { nome: 'Pipa', descricao: 'sem exigência', exigirAprovacao: [] })
    assert.deepEqual(m.rele.perfil(r.uid).exigirAprovacao, [tipo])
    assert.equal(codigoDe(() => publicar(m, r, tipo, corpos[tipo], { aprovada: false })), 'sem_aprovacao')
    assert.equal(publicar(m, r, tipo, corpos[tipo], { aprovada: true }).estado, tipo === 'denuncia' ? 'recebida' : 'aceito')
  })
}

test('exigências do rover e da pessoa se somam; a pessoa pode afrouxar a dela e o que o rover pediu continua', () => {
  const { m, r, corpos } = cenario({ exigirAprovacao: ['reacao'] })
  declarar(m, r, { exigirAprovacao: ['seguir'] })
  assert.deepEqual(m.rele.perfil(r.uid).exigirAprovacao, ['reacao', 'seguir'])
  assert.equal(codigoDe(() => publicar(m, r, 'seguir', corpos.seguir, { aprovada: false })), 'sem_aprovacao')
  assert.equal(codigoDe(() => publicar(m, r, 'reacao', corpos.reacao, { aprovada: false })), 'sem_aprovacao')
  m.avancar(2)
  declarar(m, r, { exigirAprovacao: [] })
  assert.deepEqual(m.rele.perfil(r.uid).exigirAprovacao, ['reacao'])
  assert.equal(publicar(m, r, 'seguir', corpos.seguir, { aprovada: false }).estado, 'aceito')
  assert.equal(codigoDe(() => publicar(m, r, 'reacao', corpos.reacao, { aprovada: false })), 'sem_aprovacao')
})

test('a exigência vale na hora em que a declaração chega, e a anterior ao pedido não vale para trás', () => {
  const { m, r, corpos } = cenario()
  const feito = publicar(m, r, 'seguir', corpos.seguir, { aprovada: false })
  assert.equal(feito.estado, 'aceito')
  declarar(m, r, { exigirAprovacao: ['seguir', 'deixar-de-seguir'] })
  assert.equal(m.rele.perfil(r.uid).seguindo, 2, 'o que já estava feito continua')
  assert.equal(codigoDe(() => publicar(m, r, 'deixar-de-seguir', corpos['deixar-de-seguir'], { aprovada: false })), 'sem_aprovacao')
})

test('aprovação de ação exigida segue as regras da aprovação: um objeto, quem aprova é a chave de aprovação, validade curta, uso único', () => {
  const { m, r, b, corpos } = cenario({ exigirAprovacao: ['seguir', 'reacao'] })
  const alvo = corpos.seguir
  // aprovação de outro objeto
  const a = envelopeDe(m, r, 'seguir', alvo, { aprovacao: false })
  const outraCoisa = objetoDe(r, 'seguir', { alvo: b.uid }, { criadoEm: m.relogio.agora })
  const e1 = erroDe(() => m.rele.aceitar({ ...a, aprovacao: aprovar(r, outraCoisa, { aprovadoEm: m.relogio.agora }) }))
  assert.equal(e1.codigo, 'aprovacao_invalida')
  assert.equal(e1.campo, 'aprovacao.objeto')
  // assinada com a chave de rede (a do rover): não vale
  const forjada = erroDe(() => m.rele.aceitar({ ...a, aprovacao: aprovar({ ...r, aprovacao: r.rede }, a.objeto, { aprovadoEm: m.relogio.agora }) }))
  assert.equal(forjada.codigo, 'aprovacao_invalida')
  assert.equal(forjada.campo, 'aprovacao.assinatura')
  // vencida
  const velha = { ...a, aprovacao: aprovar(r, a.objeto, { aprovadoEm: m.relogio.agora, validadeS: 60 }) }
  m.avancar(61)
  assert.equal(codigoDe(() => m.rele.aceitar(velha)), 'aprovacao_vencida')
  // uso único: aprovada e publicada, reenviar o mesmo objeto é "duplicado" e a aprovação não vale para outro
  const ok = envelopeDe(m, r, 'seguir', alvo, { aprovacao: true })
  assert.equal(m.rele.aceitar(ok).estado, 'aceito')
  assert.equal(m.rele.aceitar(ok).estado, 'duplicado')
  r.cabeca = ok.objeto.id
  const outro = envelopeDe(m, r, 'reacao', corpos.reacao, { aprovacao: false })
  assert.equal(codigoDe(() => m.rele.aceitar({ ...outro, aprovacao: ok.aprovacao })), 'aprovacao_invalida')
})

test('denúncia exigida: a aprovação é conferida antes de a denúncia ser recebida, e o relé continua sem guardar quem denunciou', () => {
  const { m, r, corpos } = cenario({ exigirAprovacao: ['denuncia'] })
  assert.equal(codigoDe(() => publicar(m, r, 'denuncia', corpos.denuncia, { aprovada: false })), 'sem_aprovacao')
  assert.equal(m.rele.listarDenuncias().length, 0)
  // aprovação vencida e de outra chave
  const env = envelopeDe(m, r, 'denuncia', corpos.denuncia, { previo: null, aprovacao: false })
  assert.equal(codigoDe(() => m.rele.aceitar({ ...env, aprovacao: aprovar(r, env.objeto, { aprovadoEm: m.relogio.agora, validadeS: 1 }) })), 'ok')
  m.avancar(5)
  const env2 = envelopeDe(m, r, 'denuncia', { ...corpos.denuncia, motivo: 'golpe' }, { previo: null, aprovacao: false })
  assert.equal(codigoDe(() => m.rele.aceitar({ ...env2, aprovacao: aprovar({ ...r, aprovacao: r.rede }, env2.objeto, { aprovadoEm: m.relogio.agora }) })), 'aprovacao_invalida')
  const env3 = envelopeDe(m, r, 'denuncia', { ...corpos.denuncia, motivo: 'assedio' }, { previo: null, aprovacao: false })
  const velha = aprovar(r, env3.objeto, { aprovadoEm: m.relogio.agora, validadeS: 30 })
  m.avancar(31)
  const passado = { ...env3, objeto: env3.objeto }
  assert.equal(codigoDe(() => m.rele.aceitar({ ...passado, aprovacao: velha })), 'aprovacao_vencida')
  const dec = m.rele.listarDenuncias()
  assert.equal(dec.length, 1)
  assert.equal(JSON.stringify(dec).includes(r.uid), false)
})

test('remover o que publicou nunca exige aprovação, mesmo com tudo exigido', () => {
  const { m, r } = cenario({ exigirAprovacao: [...TIPOS_EXIGIVEIS] })
  declarar(m, r, { exigirAprovacao: [...TIPOS_EXIGIVEIS] })
  const p = publicar(m, r, 'postagem', post('para apagar'))
  assert.equal(publicar(m, r, 'remocao-pelo-autor', { alvo: p.id }, { aprovada: false }).estado, 'aceito')
  assert.equal(codigoDe(() => m.rele.objeto(p.id)), 'removido')
})

test('ordem: cadeia antes da aprovação, aprovação antes das regras do tipo e da taxa', () => {
  const { m, r, corpos } = cenario({ exigirAprovacao: ['seguir'] })
  // previo errado e sem aprovação: aparece o previo
  const torto = envelopeDe(m, r, 'seguir', corpos.seguir, { previo: `ob_${'A'.repeat(43)}`, aprovacao: false })
  assert.equal(codigoDe(() => m.rele.aceitar(torto)), 'previo_incorreto')
  // alvo inexistente e sem aprovação: aparece a aprovação (as regras do tipo vêm depois)
  const semAlvo = envelopeDe(m, r, 'seguir', { alvo: `rvr_${'Z'.repeat(22)}` }, { aprovacao: false })
  assert.equal(codigoDe(() => m.rele.aceitar(semAlvo)), 'sem_aprovacao')
  const comAprovacao = envelopeDe(m, r, 'seguir', { alvo: `rvr_${'Z'.repeat(22)}` }, { aprovacao: true })
  assert.equal(codigoDe(() => m.rele.aceitar(comAprovacao)), 'alvo_desconhecido')
  // a recusa por aprovação não gasta a cota de taxa
  assert.equal(m.armazem.contarDesde('autor', r.uid, 0, 'seguir').n, 1)
})

test('rover novo com exigência já no primeiro perfil: vale a partir do segundo objeto', () => {
  const m = novoMundo()
  const r = roverRegistrado(m, { exigirAprovacao: ['reacao', 'seguir'] })
  assert.deepEqual(m.rele.perfil(r.uid).exigirAprovacao, ['reacao', 'seguir'])
  const b = roverRegistrado(m)
  assert.equal(codigoDe(() => publicar(m, r, 'seguir', { alvo: b.uid }, { aprovada: false })), 'sem_aprovacao')
  assert.equal(publicar(m, r, 'seguir', { alvo: b.uid }, { aprovada: true }).estado, 'aceito')
})

test('uma aprovação a mais, mandada para o tipo que não a exige hoje, é recusada em vez de ignorada', () => {
  const { m, r, corpos } = cenario({ exigirAprovacao: ['reacao'] })
  const env = envelopeDe(m, r, 'seguir', corpos.seguir, { aprovacao: false })
  const e = erroDe(() => m.rele.aceitar({ ...env, aprovacao: aprovar(r, env.objeto, { aprovadoEm: m.relogio.agora }) }))
  assert.equal(e.codigo, 'esquema')
  assert.match(e.message, /não leva aprovação humana/)
})
