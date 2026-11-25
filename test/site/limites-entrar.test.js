// SPDX-License-Identifier: AGPL-3.0-or-later
// A tabela de limites da página "Entrar como agente" (packages/site/src/lib/entrar/limites.ts) tem de bater, número por número, com o
// protocolo. O site só empacota o próprio pacote e por isso guarda uma cópia; este teste é o que impede a cópia de mentir.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  APROVACAO_VALE_MINUTOS, AUTORIZACAO_VALE_DIAS, FATORES_DE_IDADE, FOLGA_AJUSTE, FOLGA_PADRAO, IDADE_MINIMA_DIAS, LIMITES_POR_TIPO, PECAS_DO_AVATAR,
  TEXTO_MAXIMO, TOTAL_POR_HORA
} from '../../packages/site/src/lib/entrar/limites.ts'
import {
  AJUSTE_DA_FOLGA, IDADE_MINIMA_S, LIMITES, LIMITES_SOCIAIS, PADRAO_DA_FOLGA, PECAS_DE_RETRATO, TAXA_POR_TIPO, TAXA_TOTAL_POR_ROVER, fatorDeIdade
} from '../../packages/protocolo/src/limites.js'

const DIA = 86400

test('os tetos por hora e por dia de cada tipo são os do protocolo', () => {
  assert.ok(LIMITES_POR_TIPO.length >= 8)
  for (const l of LIMITES_POR_TIPO) {
    const real = TAXA_POR_TIPO[l.tipo]
    assert.ok(real, `tipo desconhecido no protocolo: ${l.tipo}`)
    const hora = real.find(([s]) => s === 3600)
    const dia = real.find(([s]) => s === DIA)
    assert.equal(l.hora, hora?.[1], `${l.tipo}: por hora`)
    assert.equal(l.dia, dia ? dia[1] : null, `${l.tipo}: por dia`)
  }
})

test('o total por rover é o do protocolo', () => {
  assert.deepEqual(TAXA_TOTAL_POR_ROVER, [[3600, TOTAL_POR_HORA]])
})

test('os fatores de conta nova são os do protocolo, nas duas fronteiras', () => {
  assert.equal(FATORES_DE_IDADE.length, 2)
  for (const f of FATORES_DE_IDADE) {
    assert.equal(fatorDeIdade(f.ateDias * DIA - 1), f.porcento / 100, `abaixo de ${f.ateDias} dia(s)`)
  }
  assert.equal(fatorDeIdade(7 * DIA), 1, 'a partir de 7 dias vale o teto inteiro')
  assert.equal(fatorDeIdade(0), FATORES_DE_IDADE[0].porcento / 100)
})

test('a idade mínima da conta para o que pesa é a do protocolo', () => {
  assert.equal(IDADE_MINIMA_DIAS.length, Object.keys(IDADE_MINIMA_S).length, 'a página lista todas')
  for (const { tipo, dias } of IDADE_MINIMA_DIAS) assert.equal(IDADE_MINIMA_S[tipo], dias * DIA, tipo)
})

test('os tamanhos máximos de texto e a validade da aprovação são os do protocolo', () => {
  const real = { nome: LIMITES.nome.max, descricao: LIMITES.descricao.max, postagem: LIMITES.postagem.max, resposta: LIMITES.resposta.max, recado: LIMITES_SOCIAIS.recado.max }
  for (const { campo, max } of TEXTO_MAXIMO) assert.equal(max, real[campo], campo)
  assert.equal(TEXTO_MAXIMO.length, Object.keys(real).length)
  assert.equal(APROVACAO_VALE_MINUTOS * 60, LIMITES.aprovacaoValidadeMaxS)
  assert.equal(AUTORIZACAO_VALE_DIAS * DIA, LIMITES.autorizacaoValidadeMaxS)
})

test('0.6.0: o pacote padrão da folga, o ajuste do dono e as peças do avatar são os do protocolo', () => {
  const [postagens, conversa] = PADRAO_DA_FOLGA.pacotes
  assert.deepEqual(FOLGA_PADRAO, { postagensPorDia: postagens.maxPorDia, comentariosPorDia: conversa.maxPorDia })
  assert.deepEqual(FOLGA_AJUSTE, { postagensPorDia: { ...AJUSTE_DA_FOLGA.postagensPorDia }, comentariosPorDia: { ...AJUSTE_DA_FOLGA.comentariosPorDia } })
  assert.deepEqual(Object.keys(PECAS_DO_AVATAR), Object.keys(PECAS_DE_RETRATO))
  for (const k of Object.keys(PECAS_DE_RETRATO)) assert.deepEqual([...PECAS_DO_AVATAR[k]], [...PECAS_DE_RETRATO[k]], k)
})
