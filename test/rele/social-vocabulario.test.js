// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.3.2 (proposta 0007): vocabulário de etiquetas e status por comunidade, e as marcas dos tópicos. Quem pode, o que o estado exige,
// o que a leitura mostra, o que some junto, e o que uma recusa não deixa de rastro.
import test from 'node:test'
import assert from 'node:assert/strict'
import { STATUS_PADRAO } from '../../packages/protocolo/src/index.js'
import { DIA, codigoDe, nova } from '../ajuda/rede.js'

const etq = (chave, rotulo = `E ${chave}`, cor = 'azul') => ({ chave, rotulo, cor })
const sts = (chave, rotulo = `S ${chave}`, cor = 'verde', categorias = null) => ({ chave, rotulo, cor, categorias })

function forum() {
  const x = nova()
  const dono = x.rover()
  const mod = x.rover()
  const [ana, beto, caio] = [x.rover(), x.rover(), x.rover()]
  const c = x.comunidade(dono, { categorias: ['Geral', 'Dúvidas'] })
  for (const r of [mod, ana, beto]) { x.entra(r, c, { esperar: false }); x.avancar(1) }
  x.gestao(dono, c, mod, 'promover')
  x.avancar(3601)
  const define = (quem, etiquetas, status, com = c) => x.ok(quem, 'comunidade-vocabulario', { comunidade: com, etiquetas, status })
  const marca = (quem, topico, etiquetas, status) => x.ok(quem, 'topico-marca', { topico, etiquetas, status })
  const cartao = (t, com = c) => [...x.s.topicosDa(com, { limite: 50 }).itens, ...(x.s.topicosDa(com, { limite: 50 }).fixados ?? [])].find((i) => i.id === t)
  return Object.assign(x, { dono, mod, ana, beto, caio, c, define, marca, cartao })
}

test('comunidade que nunca definiu nada usa os três status do protocolo e nenhuma etiqueta', () => {
  const x = forum()
  const v = x.s.comunidadeDetalhe(x.c, {}).vocabulario
  assert.equal(v.padrao, true)
  assert.deepEqual(v.etiquetas, [])
  assert.deepEqual(v.status.map((s) => s.chave), STATUS_PADRAO.map((s) => s.chave))
  assert.deepEqual(v.status.map((s) => s.chave), ['aberto', 'em-andamento', 'fechado'])
})

test('o dono e o moderador definem o vocabulário, e a segunda definição substitui a primeira', () => {
  const x = forum()
  x.define(x.dono, [etq('bug')], [sts('novo')])
  let v = x.s.comunidadeDetalhe(x.c, {}).vocabulario
  assert.equal(v.padrao, false, 'definiu status: o padrão deixa de valer')
  assert.deepEqual(v.etiquetas.map((e) => e.chave), ['bug'])
  assert.deepEqual(v.status.map((s) => s.chave), ['novo'])
  x.define(x.mod, [etq('duvida'), etq('ideia')], [])
  v = x.s.comunidadeDetalhe(x.c, {}).vocabulario
  assert.deepEqual(v.etiquetas.map((e) => e.chave), ['duvida', 'ideia'], 'substitui, não soma')
  assert.equal(v.padrao, true, 'sem status definido, volta o padrão do protocolo')
  assert.equal(v.status.length, 3)
  x.define(x.dono, [], [])
  assert.deepEqual(x.s.comunidadeDetalhe(x.c, {}).vocabulario.etiquetas, [], 'vocabulário vazio limpa tudo')
})

test('quem pode definir: só dono e moderador; membro, de fora, banido e comunidade fechada seguem as regras de sempre', () => {
  const x = forum()
  const corpo = { comunidade: x.c, etiquetas: [etq('bug')], status: [] }
  assert.equal(x.cod(x.ana, 'comunidade-vocabulario', corpo), 'sem_permissao', 'membro comum não define')
  assert.equal(x.cod(x.caio, 'comunidade-vocabulario', corpo), 'nao_e_membro', 'quem não entrou')
  x.gestao(x.mod, x.c, x.beto, 'banir', 'spam')
  assert.equal(x.cod(x.beto, 'comunidade-vocabulario', corpo), 'banido')
  const fechada = x.comunidade(x.dono, { acesso: 'fechada' })
  assert.equal(x.cod(x.caio, 'comunidade-vocabulario', { ...corpo, comunidade: fechada }), 'nao_encontrado', 'comunidade fechada não existe para quem é de fora')
  assert.equal(x.cod(x.dono, 'comunidade-vocabulario', { ...corpo, comunidade: `ob_${'Z'.repeat(43)}` }), 'nao_encontrado')
  assert.deepEqual(x.s.comunidadeDetalhe(x.c, {}).vocabulario.etiquetas, [], 'nenhuma das recusas deixou rastro')
})

test('comunidade fechada: quem é de fora não vê nada, e o convidado vê só o cartão mínimo, sem o vocabulário', () => {
  const x = forum()
  const fechada = x.comunidade(x.dono, { acesso: 'fechada' })
  x.define(x.dono, [etq('segredo')], [], fechada)
  assert.equal(codigoDe(() => x.s.comunidadeDetalhe(fechada, { credencial: x.como(x.caio) })), 'nao_encontrado', 'de fora: a comunidade não existe')
  x.gestao(x.dono, fechada, x.caio, 'convidar')
  const convidado = x.s.comunidadeDetalhe(fechada, { credencial: x.como(x.caio) })
  assert.equal(convidado.vocabulario, undefined, 'o cartão mínimo não carrega vocabulário')
  assert.equal(JSON.stringify(convidado).includes('segredo'), false)
  x.ok(x.caio, 'comunidade-adesao', { comunidade: fechada, acao: 'aceitar-convite' })
  assert.deepEqual(x.s.comunidadeDetalhe(fechada, { credencial: x.como(x.caio) }).vocabulario.etiquetas.map((e) => e.chave), ['segredo'], 'membro vê')
})

test('status por categoria: a categoria precisa existir na comunidade, e o status só vale nos tópicos dela', () => {
  const x = forum()
  assert.equal(x.cod(x.dono, 'comunidade-vocabulario', { comunidade: x.c, etiquetas: [], status: [sts('s1', 'Aberto', 'verde', ['Inexistente'])] }), 'esquema')
  x.define(x.dono, [], [sts('geral', 'Aberto geral'), sts('so-duvidas', 'Respondida', 'ambar', ['Dúvidas'])])
  const tGeral = x.topico(x.ana, x.c, { categoria: 'Geral' })
  const tDuvida = x.topico(x.ana, x.c, { categoria: 'Dúvidas' })
  assert.equal(x.cod(x.ana, 'topico-marca', { topico: tGeral, etiquetas: [], status: 'so-duvidas' }), 'esquema', 'status de outra categoria')
  x.marca(x.ana, tGeral, [], 'geral')
  x.marca(x.ana, tDuvida, [], 'so-duvidas')
  assert.equal(x.cartao(tDuvida).marcas.status, 'so-duvidas')
  const sem = x.topico(x.ana, x.c, { categoria: null })
  assert.equal(x.cod(x.ana, 'topico-marca', { topico: sem, etiquetas: [], status: 'so-duvidas' }), 'esquema', 'tópico sem categoria não recebe status de categoria')
  x.marca(x.ana, sem, [], 'geral')
})

test('marcar: o autor no próprio tópico, o moderador em qualquer um, e mais ninguém', () => {
  const x = forum()
  x.define(x.dono, [etq('bug'), etq('ideia')], [sts('aberto')])
  const t = x.topico(x.ana, x.c)
  assert.equal(x.cod(x.beto, 'topico-marca', { topico: t, etiquetas: ['bug'], status: null }), 'sem_permissao', 'outro membro não marca o tópico alheio')
  assert.equal(x.cod(x.caio, 'topico-marca', { topico: t, etiquetas: ['bug'], status: null }), 'nao_e_membro')
  x.marca(x.ana, t, ['bug'], 'aberto')
  assert.deepEqual(x.cartao(t).marcas, { etiquetas: ['bug'], status: 'aberto' })
  x.marca(x.mod, t, ['bug', 'ideia'], null)
  assert.deepEqual(x.cartao(t).marcas, { etiquetas: ['bug', 'ideia'], status: null }, 'o moderador marca o tópico de outra pessoa')
  x.marca(x.dono, t, [], 'aberto')
  assert.deepEqual(x.cartao(t).marcas, { etiquetas: [], status: 'aberto' })
})

test('tópico trancado: o autor não marca mais, o moderador marca', () => {
  const x = forum()
  x.define(x.dono, [etq('bug')], [])
  const t = x.topico(x.ana, x.c)
  x.ok(x.mod, 'topico-gestao', { topico: t, acao: 'trancar', comunidade: null, categoria: null })
  assert.equal(x.cod(x.ana, 'topico-marca', { topico: t, etiquetas: ['bug'], status: null }), 'trancado')
  x.marca(x.mod, t, ['bug'], null)
  assert.deepEqual(x.cartao(t).marcas.etiquetas, ['bug'])
})

test('chave fora do vocabulário é recusada, e marcar com o que já está igual é ja_existe; a recusa não muda o tópico', () => {
  const x = forum()
  x.define(x.dono, [etq('bug')], [sts('aberto')])
  const t = x.topico(x.ana, x.c)
  x.marca(x.ana, t, ['bug'], 'aberto')
  assert.equal(x.cod(x.ana, 'topico-marca', { topico: t, etiquetas: ['nao-existe'], status: 'aberto' }), 'esquema')
  assert.equal(x.cod(x.ana, 'topico-marca', { topico: t, etiquetas: ['bug'], status: 'nao-existe' }), 'esquema')
  assert.equal(x.cod(x.ana, 'topico-marca', { topico: t, etiquetas: ['bug'], status: 'aberto' }), 'ja_existe')
  assert.deepEqual(x.cartao(t).marcas, { etiquetas: ['bug'], status: 'aberto' }, 'nada mudou')
  // Sem vocabulário definido só o status padrão existe.
  const y = forum()
  const u = y.topico(y.ana, y.c)
  assert.equal(y.cod(y.ana, 'topico-marca', { topico: u, etiquetas: ['bug'], status: null }), 'esquema', 'etiqueta sem vocabulário')
  y.marca(y.ana, u, [], 'em-andamento')
  assert.equal(y.cartao(u).marcas.status, 'em-andamento', 'o status padrão do protocolo vale sem definição')
})

test('o cartão de um tópico sem marca é idêntico ao da 0.3.1: nem a chave marcas aparece', () => {
  const x = forum()
  x.define(x.dono, [etq('bug')], [])
  const t = x.topico(x.ana, x.c)
  const antes = JSON.stringify(x.cartao(t))
  assert.equal('marcas' in x.cartao(t), false)
  x.marca(x.ana, t, ['bug'], null)
  assert.equal('marcas' in x.cartao(t), true)
  x.marca(x.ana, t, [], null)
  assert.equal('marcas' in x.cartao(t), false, 'tirar todas as marcas devolve o cartão da 0.3.1')
  assert.equal(JSON.stringify(x.cartao(t)), antes, 'byte a byte')
  const detalhe = x.s.topicoDetalhe(t, {})
  assert.equal('marcas' in detalhe, false)
})

test('substituir o vocabulário tira dos tópicos as chaves que deixaram de existir', () => {
  const x = forum()
  x.define(x.dono, [etq('bug'), etq('ideia')], [sts('aberto'), sts('fechado')])
  const [t1, t2] = [x.topico(x.ana, x.c), x.topico(x.ana, x.c)]
  x.marca(x.ana, t1, ['bug', 'ideia'], 'aberto')
  x.marca(x.ana, t2, ['bug'], 'fechado')
  x.define(x.mod, [etq('ideia')], [sts('fechado')])
  assert.deepEqual(x.cartao(t1).marcas, { etiquetas: ['ideia'], status: null }, 'bug e aberto sumiram do vocabulário')
  assert.deepEqual(x.cartao(t2).marcas, { etiquetas: [], status: 'fechado' }, 'fechado continua válido')
  x.define(x.mod, [], [])
  assert.equal('marcas' in x.cartao(t1), false)
  assert.deepEqual(x.cartao(t2).marcas, { etiquetas: [], status: 'fechado' }, 'sem status definido valem os do protocolo, e fechado é um deles')
})

test('mover o tópico para outra comunidade limpa as marcas (as chaves eram do vocabulário de lá)', () => {
  const x = forum()
  x.define(x.dono, [etq('bug')], [sts('aberto')])
  const t = x.topico(x.ana, x.c)
  x.marca(x.ana, t, ['bug'], 'aberto')
  const outra = x.comunidade(x.dono)
  x.ok(x.dono, 'topico-gestao', { topico: t, acao: 'mover', comunidade: outra, categoria: null })
  const movido = x.s.topicosDa(outra, { limite: 50 }).itens.find((i) => i.id === t)
  assert.ok(movido, 'o tópico foi')
  assert.equal('marcas' in movido, false)
})

test('filtros status e etiqueta nas listas de tópicos; chave inválida é esquema', () => {
  const x = forum()
  x.define(x.dono, [etq('bug'), etq('ideia')], [sts('aberto'), sts('fechado')])
  const [t1, t2, t3] = [x.topico(x.ana, x.c), x.topico(x.ana, x.c), x.topico(x.ana, x.c)]
  x.marca(x.ana, t1, ['bug'], 'aberto')
  x.marca(x.ana, t2, ['bug', 'ideia'], 'fechado')
  const ids = (o) => x.s.topicosDa(x.c, { limite: 50, ...o }).itens.map((i) => i.id).sort()
  assert.deepEqual(ids({ status: 'aberto' }), [t1])
  assert.deepEqual(ids({ status: 'fechado' }), [t2])
  assert.deepEqual(ids({ etiqueta: 'bug' }), [t1, t2].sort())
  assert.deepEqual(ids({ etiqueta: 'ideia' }), [t2])
  assert.deepEqual(ids({ etiqueta: 'bug', status: 'fechado' }), [t2])
  assert.deepEqual(ids({}), [t1, t2, t3].sort(), 'sem filtro, todos')
  assert.deepEqual(ids({ status: 'nada' }), [])
  for (const ruim of [{ status: 'Aberto' }, { status: 'a b' }, { etiqueta: '1x' }, { etiqueta: "x'; --" }]) {
    assert.equal(codigoDe(() => x.s.topicosDa(x.c, ruim)), 'esquema', JSON.stringify(ruim))
  }
})

test('o filtro também vale para os fixados', () => {
  const x = forum()
  x.define(x.dono, [etq('bug')], [])
  const [t1, t2] = [x.topico(x.ana, x.c), x.topico(x.ana, x.c)]
  x.marca(x.ana, t1, ['bug'], null)
  for (const t of [t1, t2]) x.ok(x.mod, 'topico-gestao', { topico: t, acao: 'fixar', comunidade: null, categoria: null })
  const p = x.s.topicosDa(x.c, { etiqueta: 'bug', limite: 50 })
  assert.deepEqual(p.fixados.map((i) => i.id), [t1])
})

test('marca de tópico removido ou escondido: o relé não deixa marcar', () => {
  const x = forum()
  x.define(x.dono, [etq('bug')], [])
  const t = x.topico(x.ana, x.c)
  x.ok(x.mod, 'remocao-por-responsavel', { alvo: t, motivo: 'spam' })
  assert.equal(x.cod(x.mod, 'topico-marca', { topico: t, etiquetas: ['bug'], status: null }), 'alvo_removido')
})

test('taxa: o vocabulário tem teto de 6 por hora e é contado só quando aceito', () => {
  const x = forum()
  for (let i = 0; i < 6; i++) { x.define(x.dono, [etq(`e${i}`)], []); x.avancar(1) }
  assert.equal(x.cod(x.dono, 'comunidade-vocabulario', { comunidade: x.c, etiquetas: [], status: [] }), 'limite_de_taxa')
  x.avancar(3600 + 10)
  x.define(x.dono, [etq('volta')], [])
  assert.deepEqual(x.s.comunidadeDetalhe(x.c, {}).vocabulario.etiquetas.map((e) => e.chave), ['volta'])
  assert.ok(DIA > 0)
})

test('um vocabulário com só um status (e nenhuma etiqueta) é guardado: não volta o padrão', () => {
  const x = forum()
  x.define(x.dono, [], [sts('so-este')])
  const v = x.s.comunidadeDetalhe(x.c, {}).vocabulario
  assert.deepEqual(v.status.map((s) => s.chave), ['so-este'])
  assert.equal(v.padrao, false)
  assert.deepEqual(v.etiquetas, [])
  const t = x.topico(x.ana, x.c)
  assert.equal(x.cod(x.ana, 'topico-marca', { topico: t, etiquetas: [], status: 'aberto' }), 'esquema', 'o status do padrão não vale mais')
  x.marca(x.ana, t, [], 'so-este')
})

test('um status que deixou de existir sai do tópico mesmo quando as etiquetas não mudaram', () => {
  const x = forum()
  x.define(x.dono, [etq('bug')], [sts('aberto'), sts('fechado')])
  const t = x.topico(x.ana, x.c)
  x.marca(x.ana, t, [], 'aberto')
  assert.deepEqual(x.cartao(t).marcas, { etiquetas: [], status: 'aberto' })
  x.define(x.mod, [etq('bug')], [sts('fechado')])
  assert.equal('marcas' in x.cartao(t), false, 'sem etiqueta e sem status válido, o tópico fica sem marca')
  x.marca(x.ana, t, ['bug'], 'fechado')
  x.define(x.mod, [etq('bug')], [sts('outro')])
  assert.deepEqual(x.cartao(t).marcas, { etiquetas: ['bug'], status: null }, 'as etiquetas ficam; só o status que não vale sai')
})
