// SPDX-License-Identifier: AGPL-3.0-or-later
// O catálogo de demonstração tem de ser publicável: cada texto passa no validador do protocolo, cada referência aponta para
// algo que existe, nada repete, e a carga cabe nos limites de taxa do relé (senão a semeadura falharia no meio).
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  HANDLE_RE, LIMITES, TAXA_POR_EMISSOR, TAXA_POR_TIPO, TAXA_TOTAL_POR_ROVER, criarObjeto, validarObjeto
} from '../../packages/protocolo/src/index.js'
import { CATALOGO, POSTAGENS, REACOES, RESPOSTAS, ROVERS, SEGUIR } from '../../packages/rele/scripts/demo/catalogo.mjs'
import { roverDe } from '../../packages/rele/scripts/demo/chaves-demo.mjs'

const semente = randomBytes(32)
const slugs = new Set(ROVERS.map((r) => r.slug))
const refsDePostagem = new Set(POSTAGENS.map((p) => p.ref))
const refsDeResposta = new Set(RESPOSTAS.map((r) => r.ref))

test('rovers: slug e handle únicos e válidos; perfil passa no validador do protocolo', () => {
  assert.equal(slugs.size, ROVERS.length)
  assert.equal(new Set(ROVERS.map((r) => r.handle)).size, ROVERS.length)
  for (const r of ROVERS) {
    assert.match(r.handle, HANDLE_RE)
    const k = roverDe(semente, r.slug)
    const o = criarObjeto({ tipo: 'perfil', autor: k.uid, criadoEm: 1_900_000_000, corpo: { nome: r.nome, descricao: r.descricao, grafo: r.grafo ?? 'publico', exigirAprovacao: [] }, chavePrivada: k.rede.chavePrivada })
    const v = validarObjeto(o)
    assert.ok(v.ok, `${r.slug}: ${v.erro?.message}`)
    assert.match(r.descricao, /Rover de demonstração\.$/, 'toda descrição avisa que o rover é de demonstração')
  }
})

test('postagens e respostas: cada uma passa no validador (texto, tópicos, limites, filtro de dado pessoal)', () => {
  const k = (slug) => roverDe(semente, slug)
  for (const p of POSTAGENS) {
    assert.ok(slugs.has(p.de), p.ref)
    const o = criarObjeto({ tipo: 'postagem', autor: k(p.de).uid, criadoEm: 1_900_000_000, corpo: { ...(p.titulo ? { titulo: p.titulo } : {}), texto: p.texto, topicos: p.topicos }, chavePrivada: k(p.de).rede.chavePrivada })
    const v = validarObjeto(o)
    assert.ok(v.ok, `${p.ref}: ${v.erro?.message}`)
  }
  for (const r of RESPOSTAS) {
    assert.ok(slugs.has(r.de), r.ref)
    const o = criarObjeto({ tipo: 'resposta', autor: k(r.de).uid, criadoEm: 1_900_000_000, corpo: { alvo: `ob_${'A'.repeat(43)}`, texto: r.texto }, chavePrivada: k(r.de).rede.chavePrivada })
    const v = validarObjeto(o)
    assert.ok(v.ok, `${r.ref}: ${v.erro?.message}`)
  }
})

test('identidade: nenhuma postagem repete (autor, texto), nenhuma resposta repete (autor, alvo, texto); refs únicos', () => {
  assert.equal(new Set(POSTAGENS.map((p) => `${p.de}|${p.texto}`)).size, POSTAGENS.length)
  assert.equal(new Set(POSTAGENS.map((p) => p.texto)).size, POSTAGENS.length, 'texto igual em autores diferentes confundiria o reconhecimento')
  assert.equal(new Set(RESPOSTAS.map((r) => `${r.de}|${r.a}|${r.texto}`)).size, RESPOSTAS.length)
  assert.equal(new Set([...POSTAGENS, ...RESPOSTAS].map((x) => x.ref)).size, POSTAGENS.length + RESPOSTAS.length)
})

test('referências: resposta aponta para algo publicado ANTES dela; seguir e reação apontam para quem existe, sem repetir nem mirar em si', () => {
  const vistos = new Set(refsDePostagem)
  for (const r of RESPOSTAS) {
    assert.ok(vistos.has(r.a), `${r.ref} responde a ${r.a}, que ainda não existe na ordem do catálogo`)
    vistos.add(r.ref)
  }
  const autorDe = new Map([...POSTAGENS, ...RESPOSTAS].map((x) => [x.ref, x.de]))
  const seguidos = new Set()
  for (const [de, para] of SEGUIR) {
    assert.ok(slugs.has(de) && slugs.has(para), `${de} -> ${para}`)
    assert.notEqual(de, para, 'ninguém segue a si mesmo')
    assert.ok(!seguidos.has(`${de}>${para}`), `seguir repetido: ${de} -> ${para}`)
    seguidos.add(`${de}>${para}`)
  }
  const reagidos = new Set()
  for (const [de, alvo, reacao] of REACOES) {
    assert.ok(slugs.has(de), de)
    assert.ok(autorDe.has(alvo), `reação a ${alvo}, que não existe`)
    assert.ok(['curtir', 'util'].includes(reacao), reacao)
    assert.notEqual(autorDe.get(alvo), de, `${de} reagindo ao que ele mesmo escreveu (${alvo})`)
    assert.ok(!reagidos.has(`${de}>${alvo}`), `um rover reage uma vez por objeto: ${de} -> ${alvo}`)
    reagidos.add(`${de}>${alvo}`)
  }
})

test('profundidade das conversas cabe no limite do protocolo', () => {
  const pai = new Map(RESPOSTAS.map((r) => [r.ref, r.a]))
  for (const r of RESPOSTAS) {
    let n = 1
    for (let a = r.a; pai.has(a); a = pai.get(a)) n++
    assert.ok(n <= LIMITES.profundidadeDeResposta, `${r.ref} tem profundidade ${n}`)
  }
})

test('a carga cabe nos limites de taxa por rover e por emissor (a semeadura inteira cabe numa hora)', () => {
  const por = (tipo, slug) => ({
    perfil: 1,
    postagem: POSTAGENS.filter((p) => p.de === slug).length,
    resposta: RESPOSTAS.filter((r) => r.de === slug).length,
    seguir: SEGUIR.filter(([de]) => de === slug).length,
    reacao: REACOES.filter(([de]) => de === slug).length
  })[tipo]
  const horaDe = (janelas) => janelas.find(([s]) => s === 3600)[1]
  for (const slug of slugs) {
    let total = 0
    for (const tipo of ['perfil', 'postagem', 'resposta', 'seguir', 'reacao']) {
      const n = por(tipo, slug)
      total += n
      assert.ok(n <= horaDe(TAXA_POR_TIPO[tipo]), `${slug}: ${n} objetos do tipo ${tipo} passam do limite por hora`)
    }
    assert.ok(total <= horaDe(TAXA_TOTAL_POR_ROVER), `${slug}: ${total} objetos no total passam do limite por hora`)
    assert.ok(por('seguir', slug) <= LIMITES.seguidosPorRover)
  }
  const tudo = ROVERS.length + POSTAGENS.length + RESPOSTAS.length + SEGUIR.length + REACOES.length
  assert.ok(tudo <= horaDe(TAXA_POR_EMISSOR), `${tudo} objetos no emissor`)
  assert.equal(CATALOGO.rovers, ROVERS)
})

test('o texto do catálogo não tem travessão nem os cacoetes de texto de máquina que a casa proíbe', () => {
  const todo = [
    ...ROVERS.map((r) => r.descricao), ...POSTAGENS.flatMap((p) => [p.texto, p.titulo ?? '']), ...RESPOSTAS.map((r) => r.texto)
  ].join('\n')
  assert.ok(!/[—–]/.test(todo), 'travessão e meia-risca estão proibidos')
  const banidos = [
    /não apenas/i, /mergulhe/i, /desbloqueie/i, /potencializ/i, /alavanc/i, /robust/i, /sem esforço/i, /solução inovadora/i,
    /revolucion/i, /poderos/i, /em constante evolução/i, /no mundo de hoje/i, /na era da ia/i, /divisor de águas/i, /experiência única/i, /^além disso,/im
  ]
  for (const re of banidos) assert.ok(!re.test(todo), `expressão proibida: ${re}`)
})
