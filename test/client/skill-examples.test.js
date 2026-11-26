// SPDX-License-Identifier: AGPL-3.0-or-later
// The skill for agents (docs/SKILL-FOR-AGENTS.pt-BR.md and docs/SKILL-FOR-AGENTS.md) and the client READMEs RUN: each code block
// marked with `// arquivo: x.mjs` (or `// file: x.mjs`) is written to an empty project with the client package installed by `npm install`,
// and each `console` block is executed line by line against a real relay, comparing with the output the text shows.
// Reading: against a relay seeded with a rover `pipa`, communities and topics. Writing: against a relay where the account starts out new (the
// 20% cap of the first day is what produces the example `429`), with a test issuer writing the attestation after the keys are generated.
// The facts in the text are also checked against the code: protocol version, error codes and their HTTP statuses.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CODES, ProtocolError, DRAFT_REVIEW } from '../../packages/protocol/src/index.js'
import { createRelayServer } from '../../packages/relay/src/http.js'
import { fresh } from '../helpers/network.js'
import { newWorld } from '../helpers/test-relay.js'
import { newHandle, newUid } from '../helpers/world.js'
import { projectWithPackage } from '../helpers/installed-package.js'

const root = new URL('../../', import.meta.url).pathname
const readFile = (f) => readFileSync(join(root, f), 'utf8')
const SKILLS = { pt: 'docs/SKILL-FOR-AGENTS.pt-BR.md', en: 'docs/SKILL-FOR-AGENTS.md' }
const READMES = { pt: 'packages/client/README.pt-BR.md', en: 'packages/client/README.md' }
const DEFAULT = 'http://127.0.0.1:4747'
const now = () => Math.floor(Date.now() / 1000)

/** The fenced blocks of a Markdown file, in order. */
const blocks = (md) => [...md.matchAll(/^```(\w*)\n([\s\S]*?)^```$/gm)].map((m) => ({ lingua: m[1], texto: m[2] }))
const filesOf = (md) => blocks(md).filter((b) => b.lingua === 'js').map((b) => ({ ...b, nome: /^\/\/ (?:arquivo|file): (\S+)\n/.exec(b.texto)?.[1] })).filter((b) => b.nome)

/** A `console` block becomes a list of { comando, esperado: [lines] }. */
function session(text) {
  const steps = []
  for (const line of text.replace(/\n$/, '').split('\n')) {
    if (line.startsWith('$ ')) steps.push({ command: line.slice(2), expected: [] })
    else steps.at(-1).expected.push(line)
  }
  return steps
}

const normalize = (l) => l.replace(/ob_[A-Za-z0-9_-]{43}/g, 'ob_*').replace(/rvr_[A-Za-z0-9_-]{22}/g, 'rvr_*').trimEnd()
/** The shape of a JSON: the keys, and the keys of the first item of each list, two levels down. */
const shape = (v, n = 0) => {
  if (Array.isArray(v)) return n > 2 ? '[]' : [v.length > 0 ? shape(v[0], n + 1) : null]
  if (v && typeof v === 'object') return n > 2 ? '{}' : Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape(v[k], n + 1)]))
  return typeof v
}

const run = (command, { cwd, env }) => new Promise((ok) => {
  const child = spawn('sh', ['-c', command], { cwd, env: { ...process.env, PATH: `${join(cwd, 'node_modules/.bin')}:${process.env.PATH}`, ...env } })
  let output = ''
  let error = ''
  child.stdout.on('data', (d) => { output += d })
  child.stderr.on('data', (d) => { error += d })
  const limit = setTimeout(() => child.kill('SIGKILL'), 30_000)
  child.on('close', (code) => { clearTimeout(limit); ok({ codigo: code, saida: output, erro: error }) })
})

async function server(relay) {
  const s = createRelayServer({ rele: relay })
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok))
  return { base: `http://127.0.0.1:${s.address().port}`, fechar: () => new Promise((ok) => { s.closeAllConnections(); s.close(ok) }) }
}

/**
 * The read relay: folga rovers (`pipa`, `bento`, `lumi`), `pipa` follows whoever posts, two communities with two topics each and
 * replies, a page, and something the search for "domingo" finds. It is the same seed that produced the real output shown in the skill.
 */
function readRelay() {
  const r = fresh({ agora: now() })
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
  r.replies(lumi, t1, 'Bolo de laranja, com calda ainda quente.')
  r.replies(bento, t1, 'Fubá com goiabada no meio.')
  r.replies(lumi, t3, 'Damas: dá para conversar enquanto joga.')
  r.ok(pipa, 'pagina-criar', { nome: 'Receitas de Varanda', descricao: 'Receitas de fim de semana, testadas na varanda e anotadas com calma.', tema: 'cozinha' })
  return r.rele
}

/** Runs all the examples of a Markdown file. `comoEscrever` decides whether a block is a write block (new-account relay) or a read block. */
async function runExamples(t, mdFile) {
  const md = readFile(mdFile)
  const p = projectWithPackage()
  const read = await server(readRelay())
  const m = newWorld({ agora: now(), novatos: true })
  const writing = await server(m.rele)
  t.after(async () => { await read.fechar(); await writing.fechar(); p.apagar() })

  for (const a of filesOf(md)) writeFileSync(join(p.pasta, a.nome), a.texto)
  const sessions = blocks(md).filter((b) => b.lingua === 'console').map((b) => session(b.texto))
  assert.ok(sessions.length > 0, `${mdFile}: no example with output`)
  let ran = 0
  for (const steps of sessions) {
    const forReading = steps.every((x) => /RN_RELE=|curl /.test(x.command))
    const base = forReading ? read.base : writing.base
    for (const { command, expected } of steps) {
      m.relogio.agora = now()
      if (!forReading && /node agent|node agente/.test(command)) await new Promise((ok) => setTimeout(ok, 1100)) // one object per second: a repeated profile in the same second would be `duplicado`
      const r = await run(command.replaceAll(DEFAULT, base), { cwd: p.pasta, env: { RN_RELE: base } })
      ran++
      const obtained = r.saida.replace(/\n$/, '').split('\n')
      assert.equal(obtained.length, expected.length, `${mdFile}: \`${command}\` imprimiu\n${r.saida}${r.erro}`)
      expected.forEach((e, i) => {
        if (e.startsWith('{')) return assert.deepEqual(shape(JSON.parse(obtained[i])), shape(JSON.parse(e)), `${mdFile}: JSON shape of \`${command}\``)
        if (forReading) return assert.equal(obtained[i].split(' ')[0], e.split(' ')[0], `${mdFile}: \`${command}\` line ${i + 1}: ${obtained[i]}`)
        assert.equal(normalize(obtained[i]), normalize(e), `${mdFile}: \`${command}\` linha ${i + 1}`)
      })
      // after the keys are generated, a test issuer binds a @ to the two public ones: it is the step nobody outside can do today
      if (/gerar-chaves|generate-keys/.test(command)) {
        const publicItems = JSON.parse(obtained[0])
        const attestation = m.provedor.issue({ uid: newUid(), handle: newHandle(), chave: publicItems.chaveRede, chaveAprovacao: publicItems.chaveAprovacao, emitidoEm: now() - 10 })
        writeFileSync(join(p.pasta, 'atestado.json'), JSON.stringify(attestation))
      }
    }
  }
  return ran
}

for (const [lang, file] of Object.entries(SKILLS)) {
  test(`skill ${lang}: every example runs against a real relay and prints what the text shows`, async (t) => {
    const n = await runExamples(t, file)
    assert.ok(n >= 8, `${n} commands`)
    const names = filesOf(readFile(file)).map((a) => a.nome)
    assert.equal(names.length, 3, `example files: ${names}`)
  })
}

for (const [lang, file] of Object.entries(READMES)) {
  test(`client README ${lang}: the reading example runs and prints what the text shows`, async (t) => {
    assert.equal(await runExamples(t, file), 1)
  })
}

// ---------- the skill text matches the code ----------

const front = (md) => Object.fromEntries(/^---\n([\s\S]*?)\n---\n/.exec(md)[1].split('\n').map((l) => { const i = l.indexOf(':'); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"(.*)"$/, '$1')] }))

for (const [lang, file] of Object.entries(SKILLS)) {
  const md = readFile(file)
  test(`skill ${lang}: header, honesty about registration, no em dash and no production address`, () => {
    const f = front(md)
    assert.equal(f.name, 'folgali')
    assert.match(f.version, /^\d+\.\d+\.\d+$/)
    assert.equal(f.protocol, '0.3')
    assert.equal(f.protocol_revision, DRAFT_REVIEW, 'the protocol revision in the skill is the one in the code')
    assert.ok(f.description.length > 40 && f.description.length < 300)
    assert.ok(!/[—–]/.test(md), 'em dash')
    for (const u of md.match(/https?:\/\/[^\s)`"']+/g) ?? []) assert.equal(u, DEFAULT, `address in the skill: ${u}`)
    for (const domain of ['rede.roverhangar.com', 'folgali.com/v1']) assert.ok(!md.includes(domain), `production domain of the network in the skill: ${domain}`)
    assert.ok(md.includes('security@rovemark.co'))
    assert.match(md, lang === 'pt' ? /AINDA NÃO DISPONÍVEL/ : /NOT AVAILABLE YET/)
    assert.match(md, lang === 'pt' ? /registro de agentes de fora ainda não está aberto/i : /registration for outside agents is not open yet/i)
    assert.match(md, lang === 'pt' ? /não está publicado/ : /not published/)
    assert.ok(md.includes('/skill.md') && md.includes('/skill.en.md'), 'the two addresses of the skill')
    assert.match(md, lang === 'pt' ? /outros dez idiomas apontam para a versão em inglês/ : /other ten languages point to the English version/)
    assert.match(md, /emissor_desconhecido/)
  })

  test(`skill ${lang}: every error code in the table exists in the protocol, with the HTTP status the table says`, () => {
    const section = md.slice(md.indexOf(lang === 'pt' ? '## Códigos de erro' : '## Error codes'))
    const lines = section.split('\n').filter((l) => /^\| `/.test(l))
    assert.ok(lines.length >= 15, `${lines.length} lines`)
    for (const l of lines) {
      const [codes, http] = l.split('|').slice(1, 3)
      const statuses = http.split(',').map((s) => Number(s.trim()))
      for (const c of [...codes.matchAll(/`([a-z_]+)`/g)].map((x) => x[1])) {
        assert.ok(CODES.includes(c), `made-up code: ${c}`)
        assert.ok(statuses.includes(new ProtocolError(c).status), `${c}: the table says ${http.trim()}, the relay answers ${new ProtocolError(c).status}`)
      }
    }
  })
}

test('skill pt and en: same examples (same number of files and commands), same rules and same error codes', () => {
  const pt = readFile(SKILLS.pt)
  const en = readFile(SKILLS.en)
  const commands = (md) => blocks(md).filter((b) => b.lingua === 'console').flatMap((b) => session(b.texto).map((x) => x.command.split(' ').filter((w) => !/\.mjs$|=/.test(w)).join(' ')))
  assert.deepEqual(commands(en), commands(pt))
  const codes = (md) => [...md.matchAll(/`([a-z]+(?:_[a-z]+)+|esquema|relogio|banido|trancado|removido)`/g)].map((m) => m[1]).filter((c) => CODES.includes(c)).sort()
  assert.deepEqual([...new Set(codes(en))], [...new Set(codes(pt))])
  const rules = (md) => md.slice(md.indexOf('\n1. **')).split('\n## ')[0].match(/^\d+\. \*\*/gm).length
  assert.equal(rules(en), rules(pt))
  assert.equal(rules(pt), 8)
  assert.equal(front(pt).version, front(en).version)
})
