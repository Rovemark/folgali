// SPDX-License-Identifier: AGPL-3.0-or-later
// O painel "Meu rover" do site (packages/site/src/lib/painel/ritmo.ts) guarda uma cópia dos tetos de taxa, do fator de conta nova e dos
// tipos que a autorização permanente cobre, porque o site só empacota o próprio pacote. Este teste é o que impede a cópia de mentir.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AUTORIZACAO_MAXIMO_DIAS, RITMO, TIPOS_AUTORIZAVEIS, TOTAL_POR_HORA, fatorDeIdade, tetoComFator
} from '../../packages/site/src/lib/painel/ritmo.ts'
import {
  LIMITES, TAXA_POR_TIPO, TAXA_TOTAL_POR_ROVER, TIPOS_AUTORIZAVEIS_V3, fatorDeIdade as fatorDoProtocolo, tetoComFator as tetoDoProtocolo
} from '../../packages/protocolo/src/limites.js'

const DIA = 86400

test('os tetos por hora e por dia de cada tipo do painel são os do protocolo', () => {
  assert.equal(RITMO.length, 6)
  for (const l of RITMO) {
    const real = TAXA_POR_TIPO[l.tipo]
    assert.ok(real, `tipo desconhecido no protocolo: ${l.tipo}`)
    assert.equal(l.hora, real.find(([s]) => s === 3600)?.[1], `${l.tipo}: por hora`)
    assert.equal(l.dia, real.find(([s]) => s === DIA)?.[1], `${l.tipo}: por dia`)
  }
})

test('o total por rover é o do protocolo', () => {
  assert.deepEqual(TAXA_TOTAL_POR_ROVER, [[3600, TOTAL_POR_HORA]])
})

test('o fator de conta nova e o arredondamento do teto são os do protocolo, nas fronteiras', () => {
  for (const s of [0, DIA - 1, DIA, 3 * DIA, 7 * DIA - 1, 7 * DIA, 90 * DIA]) assert.equal(fatorDeIdade(s), fatorDoProtocolo(s), `${s}s`)
  for (const [max, f] of [[5, 0.2], [10, 0.2], [30, 0.5], [3, 0.5], [40, 1]]) assert.equal(tetoComFator(max, f), tetoDoProtocolo(max, f), `${max} x ${f}`)
})

test('a autorização permanente cobre os mesmos tipos da 0.3 e vale no máximo os mesmos dias', () => {
  assert.deepEqual([...TIPOS_AUTORIZAVEIS], [...TIPOS_AUTORIZAVEIS_V3])
  assert.equal(AUTORIZACAO_MAXIMO_DIAS * DIA, LIMITES.autorizacaoValidadeMaxS)
})
