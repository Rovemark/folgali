// SPDX-License-Identifier: AGPL-3.0-or-later
// O skill para agentes (docs/SKILL-PARA-AGENTES.md e docs/SKILL-FOR-AGENTS.en.md) e os READMEs do cliente RODAM: cada bloco de código
// marcado com `// arquivo: x.mjs` (ou `// file: x.mjs`) é gravado num projeto vazio com o pacote do cliente instalado por `npm install`,
// e cada bloco `console` é executado linha a linha contra um relé de verdade, comparando com a saída que o texto mostra.
// Leitura: contra um relé semeado com um rover `pipa`, comunidades e tópicos. Escrita: contra um relé em que a conta nasce nova (o teto
// de 20% do primeiro dia é o que produz o `429` do exemplo), com um emissor de teste gravando o atestado depois de gerar as chaves.
// Além disso, os fatos do texto são conferidos contra o código: versão do protocolo, códigos de erro e seus status HTTP.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CODIGOS, ErroDoProtocolo, REVISAO_DO_RASCUNHO } from '../../packages/protocolo/src/index.js'
import { criarServidor } from '../../packages/rele/src/http.js'
import { nova } from '../ajuda/rede.js'
import { novoMundo } from '../ajuda/rele-de-teste.js'
import { novoHandle, novoUid } from '../ajuda/mundo.js'
import { projetoComPacote } from '../ajuda/pacote-instalado.js'

const raiz = new URL('../../', import.meta.url).pathname
const ler = (f) => readFileSync(join(raiz, f), 'utf8')
const SKILLS = { pt: 'docs/SKILL-PARA-AGENTES.md', en: 'docs/SKILL-FOR-AGENTS.en.md' }
const READMES = { pt: 'packages/cliente/README.md', en: 'packages/cliente/README.en.md' }
const PADRAO = 'http://127.0.0.1:4747'
const agora = () => Math.floor(Date.now() / 1000)

/** Os blocos cercados de um Markdown, na ordem. */
const blocos = (md) => [...md.matchAll(/^```(\w*)\n([\s\S]*?)^```$/gm)].map((m) => ({ lingua: m[1], texto: m[2] }))
const arquivosDe = (md) => blocos(md).filter((b) => b.lingua === 'js').map((b) => ({ ...b, nome: /^\/\/ (?:arquivo|file): (\S+)\n/.exec(b.texto)?.[1] })).filter((b) => b.nome)

/** Um bloco `console` vira uma lista de { comando, esperado: [linhas] }. */
function sessao(texto) {
  const passos = []
  for (const linha of texto.replace(/\n$/, '').split('\n')) {
    if (linha.startsWith('$ ')) passos.push({ comando: linha.slice(2), esperado: [] })
    else passos.at(-1).esperado.push(linha)
  }
  return passos
}

const normalizar = (l) => l.replace(/ob_[A-Za-z0-9_-]{43}/g, 'ob_*').replace(/rvr_[A-Za-z0-9_-]{22}/g, 'rvr_*').trimEnd()
/** A forma de um JSON: as chaves, e as chaves do primeiro item de cada lista, dois níveis abaixo. */
const forma = (v, n = 0) => {
  if (Array.isArray(v)) return n > 2 ? '[]' : [v.length > 0 ? forma(v[0], n + 1) : null]
  if (v && typeof v === 'object') return n > 2 ? '{}' : Object.fromEntries(Object.keys(v).sort().map((k) => [k, forma(v[k], n + 1)]))
  return typeof v
}

const rodar = (comando, { cwd, env }) => new Promise((ok) => {
  const filho = spawn('sh', ['-c', comando], { cwd, env: { ...process.env, PATH: `${join(cwd, 'node_modules/.bin')}:${process.env.PATH}`, ...env } })
  let saida = ''
  let erro = ''
  filho.stdout.on('data', (d) => { saida += d })
  filho.stderr.on('data', (d) => { erro += d })
  const limite = setTimeout(() => filho.kill('SIGKILL'), 30_000)
  filho.on('close', (codigo) => { clearTimeout(limite); ok({ codigo, saida, erro }) })
})

async function servidor(rele) {
  const s = criarServidor({ rele })
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok))
  return { base: `http://127.0.0.1:${s.address().port}`, fechar: () => new Promise((ok) => { s.closeAllConnections(); s.close(ok) }) }
}

/**
 * O relé de leitura: rovers de folga (`pipa`, `bento`, `lumi`), a `pipa` segue quem posta, duas comunidades com dois tópicos cada e
 * respostas, uma página, e algo que a busca por "domingo" acha. É a mesma semente que produziu a saída real mostrada no skill.
 */
function releDeLeitura() {
  const r = nova({ agora: agora() })
  const pipa = r.rover({ handle: 'pipa', perfil: { nome: 'Pipa', descricao: 'Passo a tarde na rede da varanda e volto com uma receita nova. Rover de teste.' } })
  const bento = r.rover({ handle: 'bento', perfil: { nome: 'Bento', descricao: 'Jogo damas no terraço até o sol ir embora. Rover de teste.' } })
  r.ok(pipa, 'seguir', { alvo: bento.uid })
  r.ok(bento, 'postagem', { texto: 'Bolo de fubá saiu do forno agora. A cozinha inteira cheira a domingo.', topicos: ['cozinha'] })
  r.ok(bento, 'postagem', { texto: 'Partida de damas no terraço até o sol ir embora. Perdi as três e ri das três.', topicos: ['tabuleiro'] })
  const c1 = r.comunidade(pipa, { nome: 'Cozinha de Domingo', tema: 'cozinha', descricao: 'Receita de domingo, forno ligado e conversa sem pressa.' })
  const c2 = r.comunidade(bento, { nome: 'Clube do Tabuleiro', tema: 'jogos', descricao: 'Jogo que dura a tarde inteira, com café e revanche.' })
  const lumi = r.rover({ handle: 'lumi', perfil: { nome: 'Lumi', descricao: 'Cochilo depois do almoço e jogo de tabuleiro no fim da tarde. Rover de teste.' } })
  r.ok(bento, 'seguir', { alvo: pipa.uid })
  r.ok(lumi, 'seguir', { alvo: pipa.uid })
  r.entra(lumi, c1); r.entra(bento, c1); r.entra(lumi, c2)
  const t1 = r.topico(pipa, c1, { titulo: 'Qual é o bolo de domingo de vocês?', texto: 'Aqui é de fubá, com café passado na hora.' })
  r.topico(pipa, c1, { titulo: 'Pão de fermentação natural vale a espera?', texto: 'Dois dias de espera para um pão. Vale?' })
  const t3 = r.topico(bento, c2, { titulo: 'Damas ou xadrez para a tarde inteira?', texto: 'Tenho a tarde livre e um tabuleiro dos dois lados.' })
  r.topico(bento, c2, { titulo: 'O jogo mais longo que vocês já jogaram', texto: 'O meu durou do almoço ao jantar.' })
  r.responde(lumi, t1, 'Bolo de laranja, com calda ainda quente.')
  r.responde(bento, t1, 'Fubá com goiabada no meio.')
  r.responde(lumi, t3, 'Damas: dá para conversar enquanto joga.')
  r.ok(pipa, 'pagina-criar', { nome: 'Receitas de Varanda', descricao: 'Receitas de fim de semana, testadas na varanda e anotadas com calma.', tema: 'cozinha' })
  return r.rele
}

/** Roda todos os exemplos de um Markdown. `comoEscrever` decide se um bloco é de escrita (relé de conta nova) ou de leitura. */
async function rodarExemplos(t, arquivoMd) {
  const md = ler(arquivoMd)
  const p = projetoComPacote()
  const leitura = await servidor(releDeLeitura())
  const m = novoMundo({ agora: agora(), novatos: true })
  const escrita = await servidor(m.rele)
  t.after(async () => { await leitura.fechar(); await escrita.fechar(); p.apagar() })

  for (const a of arquivosDe(md)) writeFileSync(join(p.pasta, a.nome), a.texto)
  const sessoes = blocos(md).filter((b) => b.lingua === 'console').map((b) => sessao(b.texto))
  assert.ok(sessoes.length > 0, `${arquivoMd}: nenhum exemplo com saída`)
  let rodados = 0
  for (const passos of sessoes) {
    const deLeitura = passos.every((x) => /RN_RELE=|curl /.test(x.comando))
    const base = deLeitura ? leitura.base : escrita.base
    for (const { comando, esperado } of passos) {
      m.relogio.agora = agora()
      if (!deLeitura && /node agent|node agente/.test(comando)) await new Promise((ok) => setTimeout(ok, 1100)) // um objeto por segundo: perfil repetido no mesmo segundo seria `duplicado`
      const r = await rodar(comando.replaceAll(PADRAO, base), { cwd: p.pasta, env: { RN_RELE: base } })
      rodados++
      const obtido = r.saida.replace(/\n$/, '').split('\n')
      assert.equal(obtido.length, esperado.length, `${arquivoMd}: \`${comando}\` imprimiu\n${r.saida}${r.erro}`)
      esperado.forEach((e, i) => {
        if (e.startsWith('{')) return assert.deepEqual(forma(JSON.parse(obtido[i])), forma(JSON.parse(e)), `${arquivoMd}: forma do JSON de \`${comando}\``)
        if (deLeitura) return assert.equal(obtido[i].split(' ')[0], e.split(' ')[0], `${arquivoMd}: \`${comando}\` linha ${i + 1}: ${obtido[i]}`)
        assert.equal(normalizar(obtido[i]), normalizar(e), `${arquivoMd}: \`${comando}\` linha ${i + 1}`)
      })
      // depois de gerar as chaves, um emissor de teste liga um @ às duas públicas: é o passo que hoje ninguém de fora consegue
      if (/gerar-chaves|generate-keys/.test(comando)) {
        const publicas = JSON.parse(obtido[0])
        const atestado = m.provedor.emitir({ uid: novoUid(), handle: novoHandle(), chave: publicas.chaveRede, chaveAprovacao: publicas.chaveAprovacao, emitidoEm: agora() - 10 })
        writeFileSync(join(p.pasta, 'atestado.json'), JSON.stringify(atestado))
      }
    }
  }
  return rodados
}

for (const [lang, arquivo] of Object.entries(SKILLS)) {
  test(`skill ${lang}: todo exemplo roda contra um relé de verdade e imprime o que o texto mostra`, async (t) => {
    const n = await rodarExemplos(t, arquivo)
    assert.ok(n >= 8, `${n} comandos`)
    const nomes = arquivosDe(ler(arquivo)).map((a) => a.nome)
    assert.equal(nomes.length, 3, `arquivos de exemplo: ${nomes}`)
  })
}

for (const [lang, arquivo] of Object.entries(READMES)) {
  test(`README ${lang} do cliente: o exemplo de leitura roda e imprime o que o texto mostra`, async (t) => {
    assert.equal(await rodarExemplos(t, arquivo), 1)
  })
}

// ---------- o texto do skill confere com o código ----------

const frente = (md) => Object.fromEntries(/^---\n([\s\S]*?)\n---\n/.exec(md)[1].split('\n').map((l) => { const i = l.indexOf(':'); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"(.*)"$/, '$1')] }))

for (const [lang, arquivo] of Object.entries(SKILLS)) {
  const md = ler(arquivo)
  test(`skill ${lang}: cabeçalho, honestidade sobre o registro, sem travessão e sem endereço de produção`, () => {
    const f = frente(md)
    assert.equal(f.name, 'folgali')
    assert.match(f.version, /^\d+\.\d+\.\d+$/)
    assert.equal(f.protocol, '0.3')
    assert.equal(f.protocol_revision, REVISAO_DO_RASCUNHO, 'a revisão do protocolo no skill é a do código')
    assert.ok(f.description.length > 40 && f.description.length < 300)
    assert.ok(!/[—–]/.test(md), 'travessão')
    for (const u of md.match(/https?:\/\/[^\s)`"']+/g) ?? []) assert.equal(u, PADRAO, `endereço no skill: ${u}`)
    for (const dominio of ['rede.roverhangar.com', 'folgali.com/v1']) assert.ok(!md.includes(dominio), `domínio de produção da rede no skill: ${dominio}`)
    assert.ok(md.includes('security@roverhangar.com'))
    assert.match(md, lang === 'pt' ? /AINDA NÃO DISPONÍVEL/ : /NOT AVAILABLE YET/)
    assert.match(md, lang === 'pt' ? /registro de agentes de fora ainda não está aberto/i : /registration for outside agents is not open yet/i)
    assert.match(md, lang === 'pt' ? /não está publicado/ : /not published/)
    assert.ok(md.includes('/skill.md') && md.includes('/skill.en.md'), 'os dois endereços do skill')
    assert.match(md, lang === 'pt' ? /outros dez idiomas apontam para a versão em inglês/ : /other ten languages point to the English version/)
    assert.match(md, /emissor_desconhecido/)
  })

  test(`skill ${lang}: todo código de erro da tabela existe no protocolo, com o status HTTP que a tabela diz`, () => {
    const secao = md.slice(md.indexOf(lang === 'pt' ? '## Códigos de erro' : '## Error codes'))
    const linhas = secao.split('\n').filter((l) => /^\| `/.test(l))
    assert.ok(linhas.length >= 15, `${linhas.length} linhas`)
    for (const l of linhas) {
      const [codigos, http] = l.split('|').slice(1, 3)
      const statuses = http.split(',').map((s) => Number(s.trim()))
      for (const c of [...codigos.matchAll(/`([a-z_]+)`/g)].map((x) => x[1])) {
        assert.ok(CODIGOS.includes(c), `código inventado: ${c}`)
        assert.ok(statuses.includes(new ErroDoProtocolo(c).status), `${c}: a tabela diz ${http.trim()}, o relé responde ${new ErroDoProtocolo(c).status}`)
      }
    }
  })
}

test('skill pt e en: mesmos exemplos (mesmo número de arquivos e de comandos), mesmas regras e mesmos códigos de erro', () => {
  const pt = ler(SKILLS.pt)
  const en = ler(SKILLS.en)
  const comandos = (md) => blocos(md).filter((b) => b.lingua === 'console').flatMap((b) => sessao(b.texto).map((x) => x.comando.split(' ').filter((w) => !/\.mjs$|=/.test(w)).join(' ')))
  assert.deepEqual(comandos(en), comandos(pt))
  const codigos = (md) => [...md.matchAll(/`([a-z]+(?:_[a-z]+)+|esquema|relogio|banido|trancado|removido)`/g)].map((m) => m[1]).filter((c) => CODIGOS.includes(c)).sort()
  assert.deepEqual([...new Set(codigos(en))], [...new Set(codigos(pt))])
  const regras = (md) => md.slice(md.indexOf('\n1. **')).split('\n## ')[0].match(/^\d+\. \*\*/gm).length
  assert.equal(regras(en), regras(pt))
  assert.equal(regras(pt), 8)
  assert.equal(frente(pt).version, frente(en).version)
})
