// SPDX-License-Identifier: AGPL-3.0-or-later
// Grafo de seguir: público por padrão; a pessoa ou o rover o fecham; vale o mais restritivo; nada vaza por outra rota.
import test from 'node:test'
import assert from 'node:assert/strict'
import { GRAFOS, maisRestritivo } from '../../packages/protocolo/src/index.js'
import { politicaDe } from '../ajuda/mundo.js'
import { codigoDe, credencialDe, erroDe, novoMundo, publicar, roverRegistrado } from '../ajuda/rele-de-teste.js'

const post = (texto) => ({ texto, topicos: [] })
const seguir = (m, de, para) => publicar(m, de, 'seguir', { alvo: para.uid })
const declarar = (m, rover, opcoes) => m.rele.aceitarDeclaracao({ declaracao: politicaDe(rover, { emitidaEm: m.relogio.agora, ...opcoes }) })
const uids = (pagina) => pagina.itens.map((e) => e.objeto.corpo.alvo)
const autores = (pagina) => pagina.itens.map((e) => e.objeto.autor)

/** a segue b e c; d segue b. Todos com o grafo no padrão. */
function rede(opcoesDeA = {}) {
  const m = novoMundo()
  const a = roverRegistrado(m, opcoesDeA)
  const b = roverRegistrado(m)
  const c = roverRegistrado(m)
  const d = roverRegistrado(m)
  const s1 = seguir(m, a, b)
  const s2 = seguir(m, a, c)
  seguir(m, d, b)
  publicar(m, b, 'postagem', post('postagem de b'))
  publicar(m, c, 'postagem', post('postagem de c'))
  return { m, a, b, c, d, s1, s2 }
}

test('padrão: o grafo é público, com listas, contagens e a linha do início para qualquer um', () => {
  const { m, a, b, c, d } = rede()
  const pa = m.rele.perfil(a.uid)
  assert.equal(pa.grafo, 'publico')
  assert.deepEqual(pa.exigirAprovacao, [])
  assert.equal(pa.seguindo, 2)
  assert.equal(pa.seguidores, 0)
  assert.equal(m.rele.perfil(b.uid).seguidores, 2)
  assert.deepEqual(uids(m.rele.seguindo(a.uid)).sort(), [b.uid, c.uid].sort())
  assert.deepEqual(autores(m.rele.seguidores(b.uid)).sort(), [a.uid, d.uid].sort())
  assert.equal(m.rele.linhaDoInicio(a.uid).itens.length, 2)
  // as listas trazem o objeto assinado: quem lê confere sozinho
  assert.equal(m.rele.seguindo(a.uid).itens[0].objeto.tipo, 'seguir')
})

test('listas de seguidos e seguidores: do mais novo ao mais velho, paginadas sem repetir nem pular', () => {
  const m = novoMundo()
  const a = roverRegistrado(m)
  const alvos = [roverRegistrado(m), roverRegistrado(m), roverRegistrado(m)]
  for (const x of alvos) seguir(m, a, x)
  const p1 = m.rele.seguindo(a.uid, { limite: 2 })
  assert.deepEqual(uids(p1), [alvos[2].uid, alvos[1].uid])
  assert.ok(p1.proximo)
  const p2 = m.rele.seguindo(a.uid, { limite: 2, antes: p1.proximo })
  assert.deepEqual(uids(p2), [alvos[0].uid])
  assert.equal(p2.proximo, null)
  const alvo = alvos[0]
  const outros = [roverRegistrado(m), roverRegistrado(m), roverRegistrado(m)]
  for (const x of outros) seguir(m, x, alvo)
  const q1 = m.rele.seguidores(alvo.uid, { limite: 2 })
  assert.deepEqual(autores(q1), [outros[2].uid, outros[1].uid])
  assert.deepEqual(autores(m.rele.seguidores(alvo.uid, { limite: 2, antes: q1.proximo })), [outros[0].uid, a.uid])
  assert.equal(m.rele.seguidores(alvo.uid, { limite: 4 }).proximo, null)
})

test('sem "limite", a página das listas tem 20 itens e avisa que há mais', () => {
  const m = novoMundo()
  const a = roverRegistrado(m)
  const alvos = Array.from({ length: 21 }, () => roverRegistrado(m))
  for (const x of alvos) seguir(m, a, x)
  const p = m.rele.seguindo(a.uid)
  assert.equal(p.itens.length, 20)
  assert.ok(p.proximo)
  assert.equal(m.rele.seguindo(a.uid, { antes: p.proximo }).itens.length, 1)
  const alvo = roverRegistrado(m)
  const seguidores = Array.from({ length: 21 }, () => roverRegistrado(m))
  for (const x of seguidores) seguir(m, x, alvo)
  const q = m.rele.seguidores(alvo.uid)
  assert.equal(q.itens.length, 20)
  assert.ok(q.proximo)
  assert.equal(m.rele.seguidores(alvo.uid, { antes: q.proximo }).itens.length, 1)
})

test('lista só tem quem ainda é seguido: deixar de seguir tira da lista e da contagem', () => {
  const { m, a, b, c } = rede()
  publicar(m, a, 'deixar-de-seguir', { alvo: b.uid })
  assert.deepEqual(uids(m.rele.seguindo(a.uid)), [c.uid])
  assert.equal(m.rele.perfil(a.uid).seguindo, 1)
  assert.deepEqual(autores(m.rele.seguidores(b.uid)).length, 1)
  assert.equal(m.rele.perfil(b.uid).seguidores, 1)
})

test('rover bloqueado, ou que saiu, some das listas e das contagens dos outros', () => {
  const { m, a, b, c, d } = rede()
  m.rele.bloquear({ tipo: 'rover', alvo: d.uid, motivo: 'teste' })
  assert.deepEqual(autores(m.rele.seguidores(b.uid)), [a.uid])
  assert.equal(m.rele.perfil(b.uid).seguidores, 1)
  m.rele.bloquear({ tipo: 'rover', alvo: c.uid, motivo: 'teste' })
  assert.deepEqual(uids(m.rele.seguindo(a.uid)), [b.uid])
  assert.equal(m.rele.perfil(a.uid).seguindo, 1)
  assert.equal(codigoDe(() => m.rele.seguindo(c.uid)), 'nao_encontrado')
  assert.equal(codigoDe(() => m.rele.seguidores(d.uid)), 'nao_encontrado')
})

test('rover desconhecido ou uid malformado: 404 nas listas, sem pista', () => {
  const { m } = rede()
  for (const ruim of ['rvr_curto', '', "rvr_' OR 1=1 --", `rvr_${'A'.repeat(22)}`]) {
    assert.equal(codigoDe(() => m.rele.seguindo(ruim)), 'nao_encontrado', ruim)
    assert.equal(codigoDe(() => m.rele.seguidores(ruim)), 'nao_encontrado', ruim)
  }
})

// ---------- fechando o grafo ----------

for (const nivel of ['contagens', 'privado']) {
  test(`grafo "${nivel}" escolhido pelo rover: nenhuma lista, nem pela linha do início, nem pelo id do seguir`, () => {
    const { m, a, b, s1 } = rede({ grafo: nivel })
    const pa = m.rele.perfil(a.uid)
    assert.equal(pa.grafo, nivel)
    assert.equal(codigoDe(() => m.rele.seguindo(a.uid)), 'grafo_privado')
    assert.equal(codigoDe(() => m.rele.seguidores(a.uid)), 'grafo_privado')
    assert.equal(codigoDe(() => m.rele.linhaDoInicio(a.uid)), 'grafo_privado')
    // rota alternativa: o objeto `seguir` é o grafo; pelo id ele também não aparece (nem como removido)
    assert.equal(codigoDe(() => m.rele.objeto(s1.id)), 'nao_encontrado')
    // o que o grafo não cobre continua público
    assert.equal(m.rele.perfil(a.uid).nome, 'Pipa')
    assert.equal(m.rele.postagensDe(b.uid).itens.length, 1)
    // quem o rover segue: ele some da lista de seguidores do alvo, e da contagem, em qualquer nível fechado
    assert.deepEqual(autores(m.rele.seguidores(b.uid)), [m.rele.seguidores(b.uid).itens[0].objeto.autor])
    assert.equal(autores(m.rele.seguidores(b.uid)).includes(a.uid), false)
    assert.equal(m.rele.perfil(b.uid).seguidores, 1)
  })
}

test('contagens: o nível "contagens" mostra os números e esconde as listas; "privado" esconde os dois', () => {
  const c1 = rede({ grafo: 'contagens' })
  const p1 = c1.m.rele.perfil(c1.a.uid)
  assert.equal(p1.seguindo, 2)
  assert.equal(p1.seguidores, 0)
  const c2 = rede({ grafo: 'privado' })
  const p2 = c2.m.rele.perfil(c2.a.uid)
  assert.equal(p2.seguindo, null)
  assert.equal(p2.seguidores, null)
  assert.equal('seguindo' in p2 && 'seguidores' in p2, true, 'o campo existe, vem nulo')
  // seguidores do rover fechado: quem o segue é público no perfil de cada seguidor, não no dele
  const c3 = rede({ grafo: 'contagens' })
  seguir(c3.m, c3.b, c3.a)
  assert.equal(c3.m.rele.perfil(c3.a.uid).seguidores, 1)
  assert.equal(codigoDe(() => c3.m.rele.seguidores(c3.a.uid)), 'grafo_privado')
})

test('o próprio rover continua lendo o próprio grafo e a própria linha, assinando o pedido com a chave de REDE', () => {
  const { m, a, b, c, d } = rede({ grafo: 'privado' })
  seguir(m, d, a)
  const t = (alvo, extra) => ({ cabecalho: credencialDe(m, a, alvo), metodo: 'GET', alvo, ...extra })
  const alvoSeguindo = `/v1/rovers/${a.uid}/seguindo?limite=5`
  assert.deepEqual(uids(m.rele.seguindo(a.uid, { limite: 5, credencial: t(alvoSeguindo) })).sort(), [b.uid, c.uid].sort())
  const alvoSeguidores = `/v1/rovers/${a.uid}/seguidores`
  assert.deepEqual(autores(m.rele.seguidores(a.uid, { credencial: t(alvoSeguidores) })), [d.uid])
  const alvoLinha = `/v1/linha/inicio?rover=${a.uid}`
  assert.equal(m.rele.linhaDoInicio(a.uid, { credencial: t(alvoLinha) }).itens.length, 2)
})

test('credencial de outro rover não abre o grafo fechado de quem não é ela', () => {
  const { m, a, b } = rede({ grafo: 'privado' })
  const alvo = `/v1/rovers/${a.uid}/seguindo`
  // b tem credencial válida, mas é b, não a
  assert.equal(codigoDe(() => m.rele.seguindo(a.uid, { credencial: { cabecalho: credencialDe(m, b, alvo), metodo: 'GET', alvo } })), 'grafo_privado')
  assert.equal(codigoDe(() => m.rele.seguidores(a.uid, { credencial: { cabecalho: credencialDe(m, b, `/v1/rovers/${a.uid}/seguidores`), metodo: 'GET', alvo: `/v1/rovers/${a.uid}/seguidores` } })), 'grafo_privado')
  const alvoLinha = `/v1/linha/inicio?rover=${a.uid}`
  assert.equal(codigoDe(() => m.rele.linhaDoInicio(a.uid, { credencial: { cabecalho: credencialDe(m, b, alvoLinha), metodo: 'GET', alvo: alvoLinha } })), 'grafo_privado')
  // b lê o próprio grafo público sem problema
  assert.equal(m.rele.seguidores(b.uid).itens.length, 1)
})

test('credencial inválida para o grafo fechado: 401, e só quando o grafo é fechado', () => {
  const { m, a, b } = rede({ grafo: 'privado' })
  const alvo = `/v1/rovers/${a.uid}/seguindo`
  const bom = credencialDe(m, a, alvo)
  const lerCom = (cabecalho, extra = {}) => codigoDe(() => m.rele.seguindo(a.uid, { credencial: { cabecalho, metodo: 'GET', alvo, ...extra } }))
  assert.equal(lerCom(bom), 'ok')
  assert.equal(lerCom(bom, { metodo: 'POST' }), 'leitura_nao_autorizada')
  assert.equal(lerCom(bom, { alvo: `${alvo}?limite=7` }), 'leitura_nao_autorizada')
  assert.equal(lerCom(credencialDe(m, a, alvo, { t: m.relogio.agora - 121 })), 'leitura_nao_autorizada')
  assert.equal(lerCom(credencialDe(m, a, alvo, { t: m.relogio.agora + 121 })), 'leitura_nao_autorizada')
  assert.equal(lerCom(credencialDe(m, a, alvo, { t: m.relogio.agora - 120 })), 'ok')
  assert.equal(lerCom('Bearer abc'), 'leitura_nao_autorizada')
  assert.equal(lerCom(''), 'leitura_nao_autorizada')
  assert.equal(lerCom(bom.replace(a.uid, b.uid)), 'leitura_nao_autorizada')
  // chave errada: assinado por quem não é a chave de rede de a
  assert.equal(lerCom(credencialDe(m, { ...a, rede: b.rede }, alvo)), 'leitura_nao_autorizada')
  // uid que o relé não conhece
  assert.equal(lerCom(bom.replace(a.uid, `rvr_${'B'.repeat(22)}`)), 'leitura_nao_autorizada')
  // a chave de APROVAÇÃO não serve de credencial de leitura
  assert.equal(lerCom(credencialDe(m, { ...a, rede: a.aprovacao }, alvo)), 'leitura_nao_autorizada')
  // grafo público ignora o cabeçalho, mesmo torto: não há o que proteger
  assert.equal(codigoDe(() => m.rele.seguindo(b.uid, { credencial: { cabecalho: 'lixo', metodo: 'GET', alvo: '/x' } })), 'ok')
  assert.equal(codigoDe(() => m.rele.seguidores(b.uid, { credencial: { cabecalho: 'lixo', metodo: 'GET', alvo: '/x' } })), 'ok')
  assert.equal(codigoDe(() => m.rele.linhaDoInicio(b.uid, { credencial: { cabecalho: 'lixo', metodo: 'GET', alvo: '/x' } })), 'ok')
})

test('credencial de rover bloqueado ou fora do relé não abre nada', () => {
  const { m, a, b } = rede({ grafo: 'privado' })
  const alvo = `/v1/rovers/${a.uid}/seguindo`
  m.rele.bloquear({ tipo: 'rover', alvo: a.uid, motivo: 'teste' })
  // com a bloqueado o rover nem é visível: 404 antes de qualquer credencial
  assert.equal(codigoDe(() => m.rele.seguindo(a.uid, { credencial: { cabecalho: credencialDe(m, a, alvo), metodo: 'GET', alvo } })), 'nao_encontrado')
  m.rele.desbloquear('rover', a.uid)
  m.rele.bloquear({ tipo: 'rover', alvo: b.uid, motivo: 'teste' })
  const alvoB = `/v1/rovers/${a.uid}/seguidores`
  assert.equal(codigoDe(() => m.rele.seguidores(a.uid, { credencial: { cabecalho: credencialDe(m, b, alvoB), metodo: 'GET', alvo: alvoB } })), 'leitura_nao_autorizada')
})

test('removido: com o grafo público o seguir apagado é "removido"; com o grafo fechado continua "não encontrado"', () => {
  const { m, a, b, s1 } = rede()
  assert.equal(m.rele.objeto(s1.id).objeto.tipo, 'seguir')
  publicar(m, a, 'remocao-pelo-autor', { alvo: s1.id })
  assert.equal(codigoDe(() => m.rele.objeto(s1.id)), 'removido')
  const f = rede({ grafo: 'privado' })
  publicar(f.m, f.a, 'remocao-pelo-autor', { alvo: f.s1.id })
  assert.equal(codigoDe(() => f.m.rele.objeto(f.s1.id)), 'nao_encontrado')
  // o `deixar-de-seguir` não guarda conteúdo e nunca revela o alvo
  const u = publicar(f.m, f.a, 'deixar-de-seguir', { alvo: f.c.uid })
  assert.equal(f.m.armazem.objeto(u.id).envelope, null)
})

test('com o grafo público o seguir pelo id aparece; reação e postagem de quem fechou o grafo continuam públicas', () => {
  const { m, a, b, s1 } = rede({ grafo: 'privado' })
  const p = publicar(m, a, 'postagem', post('olá'))
  assert.equal(m.rele.objeto(p.id).objeto.corpo.texto, 'olá')
  const r = publicar(m, a, 'reacao', { alvo: m.rele.postagensDe(b.uid).itens[0].objeto.id, reacao: 'curtir' })
  assert.equal(m.rele.objeto(r.id).objeto.tipo, 'reacao')
  assert.equal(codigoDe(() => m.rele.objeto(s1.id)), 'nao_encontrado')
})

// ---------- a pessoa fecha; o rover não reabre ----------

test('a pessoa fecha o grafo sem o rover: vale já, e o rover não consegue reabri-lo publicando outro perfil', () => {
  const { m, a, b, s1 } = rede()
  assert.equal(m.rele.seguidores(b.uid).itens.length, 2)
  assert.equal(declarar(m, a, { grafo: 'privado' }).estado, 'aceita')
  const pa = m.rele.perfil(a.uid)
  assert.equal(pa.grafo, 'privado')
  assert.equal(pa.seguindo, null)
  assert.equal(codigoDe(() => m.rele.seguindo(a.uid)), 'grafo_privado')
  assert.equal(codigoDe(() => m.rele.linhaDoInicio(a.uid)), 'grafo_privado')
  assert.equal(codigoDe(() => m.rele.objeto(s1.id)), 'nao_encontrado')
  assert.equal(m.rele.perfil(b.uid).seguidores, 1)
  // o rover tenta reabrir: novo perfil, aprovado, com grafo público
  publicar(m, a, 'perfil', { nome: 'Pipa', descricao: 'reaberto', grafo: 'publico', exigirAprovacao: [] })
  assert.equal(m.rele.perfil(a.uid).grafo, 'privado')
  assert.equal(codigoDe(() => m.rele.seguindo(a.uid)), 'grafo_privado')
  assert.equal(m.rele.perfil(a.uid).descricao, 'reaberto', 'o resto do perfil foi atualizado')
  // e tenta pelo perfil 0.1, que nem tem o campo
  publicar(m, a, 'perfil', { nome: 'Pipa', descricao: 'de novo' }, { })
  assert.equal(m.rele.perfil(a.uid).grafo, 'privado')
})

test('rover e pessoa divergindo: vale o mais restritivo, em todas as nove combinações', () => {
  for (const doRover of GRAFOS) {
    for (const daPessoa of GRAFOS) {
      const { m, a, b } = rede({ grafo: doRover })
      assert.equal(declarar(m, a, { grafo: daPessoa }).estado, 'aceita')
      const esperado = maisRestritivo(doRover, daPessoa)
      const nome = `${doRover}+${daPessoa}`
      assert.equal(m.rele.perfil(a.uid).grafo, esperado, nome)
      assert.equal(codigoDe(() => m.rele.seguindo(a.uid)), esperado === 'publico' ? 'ok' : 'grafo_privado', nome)
      assert.equal(codigoDe(() => m.rele.linhaDoInicio(a.uid)), esperado === 'publico' ? 'ok' : 'grafo_privado', nome)
      assert.equal(m.rele.perfil(a.uid).seguindo, esperado === 'privado' ? null : 2, nome)
      // o seguidor fechado some da lista e da contagem do alvo, igual ao que o perfil dele diz
      assert.equal(m.rele.seguidores(b.uid).itens.some((e) => e.objeto.autor === a.uid), esperado === 'publico', nome)
      assert.equal(m.rele.perfil(b.uid).seguidores, esperado === 'publico' ? 2 : 1, nome)
    }
  }
})

test('a pessoa reabre o grafo quando quiser, e só ela: o perfil do rover aberto não anula a política fechada', () => {
  const { m, a } = rede({ grafo: 'privado' })
  m.avancar(5)
  declarar(m, a, { grafo: 'publico' })
  // o rover escolheu privado e a pessoa publico: continua privado (o mais restritivo)
  assert.equal(m.rele.perfil(a.uid).grafo, 'privado')
  // o rover abre o dele, aprovado pela pessoa no perfil: agora os dois são públicos
  publicar(m, a, 'perfil', { nome: 'Pipa', descricao: 'aberto', grafo: 'publico', exigirAprovacao: [] })
  assert.equal(m.rele.perfil(a.uid).grafo, 'publico')
  assert.equal(m.rele.seguindo(a.uid).itens.length, 2)
  // a pessoa fecha de novo
  m.avancar(5)
  declarar(m, a, { grafo: 'contagens' })
  assert.equal(m.rele.perfil(a.uid).grafo, 'contagens')
  m.avancar(5)
  declarar(m, a, { grafo: 'publico' })
  assert.equal(m.rele.perfil(a.uid).grafo, 'publico')
})

test('perfil 0.1 vale grafo público; um 0.1 publicado depois de um 0.2 fechado reabre o do rover (a pessoa aprovou esse perfil)', () => {
  const m = novoMundo()
  const a = roverRegistrado(m, { grafo: 'privado', exigirAprovacao: ['seguir'] })
  assert.equal(m.rele.perfil(a.uid).grafo, 'privado')
  assert.deepEqual(m.rele.perfil(a.uid).exigirAprovacao, ['seguir'])
  const velho = publicar(m, a, 'perfil', { nome: 'Velho', descricao: '' }, { v: '0.1' })
  assert.equal(velho.objeto.v, '0.1')
  assert.equal(m.rele.perfil(a.uid).grafo, 'publico')
  assert.deepEqual(m.rele.perfil(a.uid).exigirAprovacao, [])
  assert.equal(m.rele.perfil(a.uid).nome, 'Velho')
  // um rover 0.1 desde o começo também nasce público
  const b = (() => { const r = roverRegistrado(m); return r })()
  assert.equal(m.rele.perfil(b.uid).grafo, 'publico')
})

test('quem fechou o grafo (rover ou pessoa) volta às listas dos outros ao reabrir', () => {
  const { m, a, b } = rede()
  declarar(m, a, { grafo: 'contagens' })
  assert.equal(autores(m.rele.seguidores(b.uid)).includes(a.uid), false)
  m.avancar(3)
  declarar(m, a, { grafo: 'publico' })
  assert.equal(autores(m.rele.seguidores(b.uid)).includes(a.uid), true)
  assert.equal(m.rele.perfil(b.uid).seguidores, 2)
})

test('sair da rede apaga a política da pessoa; o uid não volta', () => {
  const { m, a } = rede()
  declarar(m, a, { grafo: 'privado' })
  assert.ok(m.armazem.politica(a.uid))
  const perfilId = m.rele.perfil(a.uid).perfil.id
  publicar(m, a, 'remocao-pelo-autor', { alvo: perfilId })
  assert.equal(m.armazem.politica(a.uid), null)
  assert.equal(codigoDe(() => m.rele.perfil(a.uid)), 'nao_encontrado')
  assert.equal(erroDe(() => m.rele.aceitarDeclaracao({ declaracao: politicaDe(a, { emitidaEm: m.relogio.agora + 1 }) })).codigo, 'nao_encontrado')
})
