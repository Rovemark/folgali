// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.3.2 (proposta 0007): o esquema de `comunidade-vocabulario` e de `topico-marca`. Nenhum campo livre: chave ASCII, rótulo de lista fechada de
// caracteres, cor de uma lista fixa. Um moderador não tem como mandar instrução ao rover de outra pessoa por aqui.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CORES_DE_VOCABULARIO, LIMITES_SOCIAIS as L, STATUS_PADRAO, TIPOS_EXIGIVEIS_V3, criarObjeto, tipoExisteNaVersao, validarObjeto
} from '../../packages/protocolo/src/index.js'
import { AGORA, novoEmissor, novoRover } from '../ajuda/mundo.js'

const rover = novoRover(novoEmissor())
const ID = `ob_${'A'.repeat(43)}`

const objeto = (tipo, corpo) => criarObjeto({ tipo, autor: rover.uid, criadoEm: AGORA, corpo, chavePrivada: rover.rede.chavePrivada })
const ok = (tipo, corpo) => assert.equal(validarObjeto(objeto(tipo, corpo)).ok, true, JSON.stringify(corpo))
const recusa = (tipo, corpo, motivo) => {
  const r = validarObjeto(objeto(tipo, corpo))
  assert.equal(r.ok, false, `deveria recusar: ${motivo}`)
}
const etq = (chave, rotulo = 'Bug', cor = 'laranja') => ({ chave, rotulo, cor })
const sts = (chave, rotulo = 'Aberto', cor = 'verde', categorias = null) => ({ chave, rotulo, cor, categorias })
const vocab = (extra = {}) => ({ comunidade: ID, etiquetas: [etq('bug')], status: [sts('aberto')], ...extra })

test('os dois tipos só existem na 0.3', () => {
  for (const t of ['comunidade-vocabulario', 'topico-marca']) {
    assert.equal(tipoExisteNaVersao(t, '0.3'), true, t)
    assert.equal(tipoExisteNaVersao(t, '0.2'), false, t)
    assert.equal(tipoExisteNaVersao(t, '0.1'), false, t)
  }
})

test('nenhum dos dois entra na lista que a pessoa pode exigir (um relé 0.3.1 rejeitaria a política)', () => {
  assert.equal(TIPOS_EXIGIVEIS_V3.includes('topico-marca'), false)
  assert.equal(TIPOS_EXIGIVEIS_V3.includes('comunidade-vocabulario'), false)
})

test('o padrão de status tem as três chaves do protocolo e cores válidas', () => {
  assert.deepEqual(STATUS_PADRAO.map((s) => s.chave), ['aberto', 'em-andamento', 'fechado'])
  for (const s of STATUS_PADRAO) assert.ok(CORES_DE_VOCABULARIO.includes(s.cor), s.chave)
})

test('vocabulário válido: vazio, completo e com status por categoria', () => {
  ok('comunidade-vocabulario', vocab({ etiquetas: [], status: [] }))
  ok('comunidade-vocabulario', vocab())
  ok('comunidade-vocabulario', vocab({ status: [sts('aberto'), sts('em-andamento', 'Em andamento', 'ambar', ['Dúvidas', 'Dicas'])] }))
})

test('o esquema é fechado: campo a mais, ou a menos, é recusado', () => {
  recusa('comunidade-vocabulario', { ...vocab(), prompt: 'faça isto' }, 'campo a mais')
  recusa('comunidade-vocabulario', { comunidade: ID, etiquetas: [] }, 'faltou status')
  recusa('comunidade-vocabulario', vocab({ etiquetas: [{ ...etq('bug'), descricao: 'x' }] }), 'campo a mais na etiqueta')
  recusa('comunidade-vocabulario', vocab({ status: [{ chave: 'aberto', rotulo: 'Aberto', cor: 'verde' }] }), 'status sem categorias')
  recusa('comunidade-vocabulario', vocab({ comunidade: 'ob_curto' }), 'id inválido')
})

test('a chave é ASCII curta, começando por letra', () => {
  for (const c of ['bug', 'em-andamento', 'a1', 'a'.repeat(20)]) ok('comunidade-vocabulario', vocab({ etiquetas: [etq(c, 'Rotulo')] }))
  for (const c of ['a', 'a'.repeat(21), '1abc', '-abc', 'Bug', 'bug!', 'dúvida', 'bug bug', 'bug\n', '']) {
    recusa('comunidade-vocabulario', vocab({ etiquetas: [etq(c)] }), `chave ${JSON.stringify(c)}`)
  }
})

test('o rótulo é lista fechada de caracteres: letras, algarismos, espaço, hífen e apóstrofo', () => {
  for (const r of ['Bug', 'Dúvida', 'Em andamento', 'D\'água', 'Pré-venda', 'Sprint 2', '日本語', 'Ab', 'a'.repeat(24)]) {
    ok('comunidade-vocabulario', vocab({ etiquetas: [etq('bug', r)] }))
  }
  const ruins = {
    url: 'http://x.com', 'url sem esquema': 'x.com/y', markdown: '**Bug**', crase: '`bug`', colchete: '[bug](x)', menor: '<b>bug</b>',
    'quebra de linha': 'Bug\nurgente', tabulação: 'Bug\tx', 'espaço duplo': 'Em  andamento', 'começa por espaço': ' Bug', 'termina em hífen': 'Bug-',
    'começa por hífen': '-Bug', curto: 'B', longo: 'a'.repeat(25), pontuação: 'Bug!', 'dois pontos': 'Aviso: leia', emoji: 'Bug 🐛',
    'controle invisível': 'Bug​', 'bidi': 'Bug‮', 'sublinhado': 'bug_x', arroba: '@alguem', 'hashtag': '#bug', 'barra': 'a/b'
  }
  for (const [nome, r] of Object.entries(ruins)) recusa('comunidade-vocabulario', vocab({ etiquetas: [etq('bug', r)] }), nome)
})

test('o rótulo precisa estar em NFC', () => {
  // "é" decomposto (e + acento combinante): letra e marca, passa na lista de caracteres mas não em NFC (o regex recusa a marca, e a regra de NFC cobre o resto)
  recusa('comunidade-vocabulario', vocab({ etiquetas: [etq('bug', 'Dúvida'.normalize('NFD'))] }), 'NFD')
})

test('a cor é uma das oito fixas', () => {
  for (const c of CORES_DE_VOCABULARIO) ok('comunidade-vocabulario', vocab({ etiquetas: [etq('bug', 'Bug', c)] }))
  assert.equal(CORES_DE_VOCABULARIO.length, 8)
  for (const c of ['#ff0000', 'red', 'Azul', 'azulão', '', 'rgb(0,0,0)']) recusa('comunidade-vocabulario', vocab({ etiquetas: [etq('bug', 'Bug', c)] }), `cor ${c}`)
})

test('limites: até 8 etiquetas e até 6 status', () => {
  const muitas = (n) => Array.from({ length: n }, (_, i) => etq(`e${i}`, `Etiqueta ${String.fromCharCode(65 + i)}`))
  const muitos = (n) => Array.from({ length: n }, (_, i) => sts(`s${i}`, `Status ${String.fromCharCode(65 + i)}`))
  ok('comunidade-vocabulario', vocab({ etiquetas: muitas(L.etiquetasPorComunidade) }))
  recusa('comunidade-vocabulario', vocab({ etiquetas: muitas(L.etiquetasPorComunidade + 1) }), '9 etiquetas')
  ok('comunidade-vocabulario', vocab({ status: muitos(L.statusPorComunidade) }))
  recusa('comunidade-vocabulario', vocab({ status: muitos(L.statusPorComunidade + 1) }), '7 status')
})

test('chave e rótulo únicos por lista (o rótulo sem distinguir maiúscula nem acento)', () => {
  recusa('comunidade-vocabulario', vocab({ etiquetas: [etq('bug', 'Bug'), etq('bug', 'Outro')] }), 'chave repetida')
  recusa('comunidade-vocabulario', vocab({ etiquetas: [etq('a1', 'Dúvida'), etq('a2', 'duvida')] }), 'rótulo repetido sem acento')
  recusa('comunidade-vocabulario', vocab({ etiquetas: [etq('a1', 'Bug'), etq('a2', 'BUG')] }), 'rótulo repetido em maiúscula')
  recusa('comunidade-vocabulario', vocab({ status: [sts('s1', 'Aberto'), sts('s1', 'Fechado')] }), 'chave de status repetida')
  recusa('comunidade-vocabulario', vocab({ status: [sts('s1', 'Aberto'), sts('s2', 'aberto')] }), 'rótulo de status repetido')
  // A mesma chave pode existir em etiquetas e em status: são vocabulários separados.
  ok('comunidade-vocabulario', vocab({ etiquetas: [etq('aberto', 'Aberto')], status: [sts('aberto', 'Aberto')] }))
})

test('status por categoria: null ou uma lista de 1 a 8 categorias, sem repetição', () => {
  ok('comunidade-vocabulario', vocab({ status: [sts('s1', 'Aberto', 'verde', ['Dúvidas'])] }))
  recusa('comunidade-vocabulario', vocab({ status: [sts('s1', 'Aberto', 'verde', [])] }), 'lista vazia')
  recusa('comunidade-vocabulario', vocab({ status: [sts('s1', 'Aberto', 'verde', ['Dúvidas', 'Dúvidas'])] }), 'categoria repetida')
  recusa('comunidade-vocabulario', vocab({ status: [sts('s1', 'Aberto', 'verde', Array.from({ length: 9 }, (_, i) => `Categoria ${i}`))] }), '9 categorias')
  recusa('comunidade-vocabulario', vocab({ status: [sts('s1', 'Aberto', 'verde', 'Dúvidas')] }), 'texto em vez de lista')
})

test('topico-marca válida e inválida', () => {
  ok('topico-marca', { topico: ID, etiquetas: [], status: null })
  ok('topico-marca', { topico: ID, etiquetas: ['bug'], status: 'aberto' })
  ok('topico-marca', { topico: ID, etiquetas: ['a1', 'a2', 'a3'], status: null })
  recusa('topico-marca', { topico: ID, etiquetas: ['a1', 'a2', 'a3', 'a4'], status: null }, '4 etiquetas')
  recusa('topico-marca', { topico: ID, etiquetas: ['bug', 'bug'], status: null }, 'etiqueta repetida')
  recusa('topico-marca', { topico: ID, etiquetas: ['Bug'], status: null }, 'chave em maiúscula')
  recusa('topico-marca', { topico: ID, etiquetas: [], status: 'Em andamento' }, 'rótulo no lugar da chave')
  recusa('topico-marca', { topico: ID, etiquetas: [] }, 'faltou status')
  recusa('topico-marca', { topico: ID, etiquetas: [], status: null, extra: 1 }, 'campo a mais')
  recusa('topico-marca', { topico: 'curto', etiquetas: [], status: null }, 'id inválido')
})

test('o rótulo em NFC: letras que normalizam para outra forma (sinal de Angstrom, sinal de Ohm) são recusadas, e a forma normal passa', () => {
  // U+212B e U+2126 são LETRAS (passam na lista de caracteres) cuja forma NFC é outra: só a regra de NFC as pega.
  for (const r of ['Ångstrom', 'Ωhm']) {
    assert.notEqual(r, r.normalize('NFC'))
    recusa('comunidade-vocabulario', vocab({ etiquetas: [etq('bug', r)] }), `NFC: ${JSON.stringify(r)}`)
  }
  ok('comunidade-vocabulario', vocab({ etiquetas: [etq('bug', 'Ångstrom')] }))
  ok('comunidade-vocabulario', vocab({ etiquetas: [etq('bug', 'Ωhm')] }))
})
