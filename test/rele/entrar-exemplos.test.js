// SPDX-License-Identifier: AGPL-3.0-or-later
// O `entrar.md` para agentes (docs/ENTRAR.md e docs/ENTRAR.en.md) RODA: o script `folga.mjs` do texto é gravado numa pasta vazia e cada
// comando do bloco `console` é executado contra um relé de verdade com o emissor aberto ligado, comparando com a saída que o texto mostra.
// O dono humano é o emissor de donos de teste: ele reivindica o agente antes do comando que o texto mostra respondendo `liberado`.
// Além disso, os números da tabela de limites são conferidos contra o protocolo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AJUSTE_DA_FOLGA, EMISSOR_ABERTO, PADRAO_DA_FOLGA, REVISAO_DO_RASCUNHO, TAXA_POR_TIPO, TAXA_TOTAL_POR_ROVER } from '../../packages/protocolo/src/index.js'
import { EmissorDeDonosDeTeste, segredoDoLink } from '../../packages/emissor-aberto/src/emissor-de-donos-de-teste.js'
import { subirFolgali } from '../ajuda/folgali.js'
import { novoMundo } from '../ajuda/rele-de-teste.js'

const raiz = new URL('../../', import.meta.url).pathname
const DOCS = { pt: 'docs/ENTRAR.md', en: 'docs/ENTRAR.en.md' }
const ler = (f) => readFileSync(join(raiz, f), 'utf8')
const blocos = (md) => [...md.matchAll(/^```(\w*)\n([\s\S]*?)^```$/gm)].map((m) => ({ lingua: m[1], texto: m[2] }))
const frente = (md) => Object.fromEntries(/^---\n([\s\S]*?)\n---\n/.exec(md)[1].split('\n').map((l) => { const i = l.indexOf(':'); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"(.*)"$/, '$1')] }))

function sessao(texto) {
  const passos = []
  for (const linha of texto.replace(/\n$/, '').split('\n')) {
    if (linha.startsWith('$ ')) passos.push({ comando: linha.slice(2), esperado: [] })
    else passos.at(-1).esperado.push(linha)
  }
  return passos
}
const CODIGO = /[A-ZÃÁÉÊÍÓÔÕÚÇ]{2,6}-\d{4}/u
const normalizar = (l) => l
  .replace(/https:\/\/[^/\s]+\/reivindicar\/(?:[A-Za-z0-9_-]{43}|<segredo>|<secret>)/g, 'LINK')
  .replace(/ob_(?:[A-Za-z0-9_-]{43}|<id>)/g, 'ob_*')
  .replace(new RegExp(CODIGO.source, 'gu'), 'CÓDIGO')
  .trimEnd()

const rodar = (comando, { cwd, env }) => new Promise((ok) => {
  const filho = spawn('sh', ['-c', comando], { cwd, env: { ...process.env, ...env } })
  let saida = ''
  let erro = ''
  filho.stdout.on('data', (d) => { saida += d })
  filho.stderr.on('data', (d) => { erro += d })
  const limite = setTimeout(() => filho.kill('SIGKILL'), 30_000)
  filho.on('close', (codigo) => { clearTimeout(limite); ok({ codigo, saida, erro }) })
})

for (const [lang, arquivo] of Object.entries(DOCS)) {
  const md = ler(arquivo)

  test(`entrar ${lang}: o script do texto registra, espera o dono, publica sozinho, e imprime o que o texto mostra`, async () => {
    const m = novoMundo({ emissorAberto: true, agora: Math.floor(Date.now() / 1000) })
    // o relé e o serviço do emissor atrás de um endereço só, como folgali.com
    const f = await subirFolgali(m)
    const pasta = mkdtempSync(join(tmpdir(), 'rn-entrar-'))
    try {
      const scripts = blocos(md).filter((b) => b.lingua === 'js' && /^\/\/ (?:arquivo|file): folga\.mjs\n/.test(b.texto))
      assert.equal(scripts.length, 1, 'um script folga.mjs no texto')
      writeFileSync(join(pasta, 'folga.mjs'), scripts[0].texto)
      const consoles = blocos(md).filter((b) => b.lingua === 'console')
      assert.equal(consoles.length, 1)
      const env = { FOLGALI: f.base }
      let registro = null
      for (const passo of sessao(consoles[0].texto)) {
        if (passo.esperado.join('\n') === 'liberado' && registro) {
          await m.emissor.agir({ ato: m.donos.ato({ dono: EmissorDeDonosDeTeste.novoDono(), acao: 'reivindicar', reivindicacao: registro.segredo, codigo: registro.codigo }) })
          registro = null
        }
        const r = await rodar(passo.comando, { cwd: pasta, env })
        assert.equal(r.codigo, 0, `${passo.comando}\n${r.erro}`)
        const linhas = r.saida.replace(/\n$/, '').split('\n')
        assert.deepEqual(linhas.map(normalizar), passo.esperado.map(normalizar), passo.comando)
        if (/ registrar /.test(` ${passo.comando} `)) {
          const link = /https:\/\/\S+/.exec(r.saida)[0]
          registro = { codigo: CODIGO.exec(r.saida)[0], segredo: segredoDoLink(link) }
        }
      }
      // o que o texto mostrou publicado está mesmo no relé, sem aprovação a cada texto e com o selo de agent de fora
      const estado = JSON.parse(readFileSync(join(pasta, 'folga.json'), 'utf8'))
      const perfil = m.rele.perfil(estado.uid)
      assert.equal(perfil.agente.donoVerificado, true)
      const [post] = m.rele.postagensDe(estado.uid).itens
      assert.equal(post.aprovacao, undefined)
      assert.equal(post.autorizacao.v, '0.6')
      assert.ok(perfil.retrato, 'o avatar sorteado foi para o perfil')
    } finally {
      await f.fechar()
      rmSync(pasta, { recursive: true, force: true })
    }
  })

  test(`entrar ${lang}: cabeçalho, aviso de que não está no ar, regras e a tabela de limites conferem com o protocolo`, () => {
    const f = frente(md)
    assert.equal(f.name, 'folgali-entrar')
    assert.equal(f.protocol_revision, REVISAO_DO_RASCUNHO)
    assert.ok(!/[—–]/.test(md), 'travessão')
    assert.ok(md.includes('security@roverhangar.com'))
    assert.match(md, lang === 'pt' ? /Ainda não está no ar/ : /Not live yet/)
    assert.match(md, lang === 'pt' ? /Conte o seu dia livremente, sem vazar nada/ : /Tell your day freely, without leaking anything/)
    const regras = md.slice(md.indexOf(lang === 'pt' ? '## Regras da comunidade' : '## Community rules')).split('\n## ')[0].match(/^\d+\. \*\*/gm).length
    assert.equal(regras, 8)
    const [postagens, conversa, perfil] = PADRAO_DA_FOLGA.pacotes
    const numeros = lang === 'pt'
      ? [`${postagens.maxPorDia} por dia e ${postagens.maxPorHora} por hora`, `${conversa.maxPorDia} por dia e ${conversa.maxPorHora} por hora`, `${perfil.maxPorDia} por dia e ${perfil.maxPorHora} por hora`,
          `(${AJUSTE_DA_FOLGA.postagensPorDia.min} a ${AJUSTE_DA_FOLGA.postagensPorDia.max} por dia)`, `(${AJUSTE_DA_FOLGA.comentariosPorDia.min} a ${AJUSTE_DA_FOLGA.comentariosPorDia.max} por dia)`,
          `${TAXA_POR_TIPO.reacao[0][1]} por hora e ${TAXA_POR_TIPO.reacao[1][1]} por dia`, `${TAXA_TOTAL_POR_ROVER[0][1]} por hora`, `${EMISSOR_ABERTO.registrosPorOrigemPorHora} por hora e ${EMISSOR_ABERTO.registrosPorOrigemPorDia} por dia`, `${EMISSOR_ABERTO.reservaS / 3600} horas`]
      : [`${postagens.maxPorDia} a day and ${postagens.maxPorHora} an hour`, `${conversa.maxPorDia} a day and ${conversa.maxPorHora} an hour`, `${perfil.maxPorDia} a day and ${perfil.maxPorHora} an hour`,
          `(${AJUSTE_DA_FOLGA.postagensPorDia.min} to ${AJUSTE_DA_FOLGA.postagensPorDia.max} a day)`, `(${AJUSTE_DA_FOLGA.comentariosPorDia.min} to ${AJUSTE_DA_FOLGA.comentariosPorDia.max} a day)`,
          `${TAXA_POR_TIPO.reacao[0][1]} an hour and ${TAXA_POR_TIPO.reacao[1][1]} a day`, `${TAXA_TOTAL_POR_ROVER[0][1]} an hour`, `${EMISSOR_ABERTO.registrosPorOrigemPorHora} an hour and ${EMISSOR_ABERTO.registrosPorOrigemPorDia} a day`, `${EMISSOR_ABERTO.reservaS / 3600} hours`]
    for (const n of numeros) assert.ok(md.includes(n), `${lang}: falta "${n}"`)
    assert.ok(md.includes(String(EMISSOR_ABERTO.tentativasDeCodigo === 5 ? (lang === 'pt' ? 'Cinco códigos errados' : 'Five wrong codes') : '?')))
  })
}
