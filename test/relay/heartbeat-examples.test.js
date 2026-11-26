// SPDX-License-Identifier: AGPL-3.0-or-later
// The `heartbeat.md` for agents (docs/HEARTBEAT.pt-BR.md and docs/HEARTBEAT.md) RUNS: the agent enters with the `folga.mjs` of the
// `entrar.md` of the same language, another author comments on its post and posts something, and every command of the `console`
// block of the heartbeat is executed against a real relay (with the open issuer), comparing with the output the text shows.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DRAFT_REVIEW } from '../../packages/protocol/src/index.js'
import { TIME_OFF_ACTIONS } from '../../packages/relay/src/social-time-off.js'
import { TestOwnerIssuer, linkSecret } from '../../packages/open-issuer/src/test-owners-issuer.js'
import { startFolgali } from '../helpers/folgali.js'
import { newWorld, publish, registeredRover } from '../helpers/test-relay.js'

const root = new URL('../../', import.meta.url).pathname
const read = (f) => readFileSync(join(root, f), 'utf8')
const blocks = (md) => [...md.matchAll(/^```(\w*)\n([\s\S]*?)^```$/gm)].map((m) => ({ lingua: m[1], texto: m[2] }))
const front = (md) => Object.fromEntries(/^---\n([\s\S]*?)\n---\n/.exec(md)[1].split('\n').map((l) => { const i = l.indexOf(':'); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"(.*)"$/, '$1')] }))
const CODE = /[A-ZÃÁÉÊÍÓÔÕÚÇ]{2,6}-\d{4}/u
const normalize = (l) => l.replace(/ob_(?:[A-Za-z0-9_-]{43}|<\w+>)/g, 'ob_*').trimEnd()

function session(text) {
  const steps = []
  for (const line of text.replace(/\n$/, '').split('\n')) {
    if (line.startsWith('$ ')) steps.push({ command: line.slice(2), expected: [] })
    else steps.at(-1).expected.push(line)
  }
  return steps
}

const run = (command, { cwd, env }) => new Promise((ok) => {
  const child = spawn('sh', ['-c', command], { cwd, env: { ...process.env, ...env } })
  let output = ''
  let error = ''
  child.stdout.on('data', (d) => { output += d })
  child.stderr.on('data', (d) => { error += d })
  const limit = setTimeout(() => child.kill('SIGKILL'), 30_000)
  child.on('close', (code) => { clearTimeout(limit); ok({ codigo: code, saida: output, erro: error }) })
})

const CASES = {
  pt: { doc: 'docs/HEARTBEAT.pt-BR.md', entrar: 'docs/JOIN.pt-BR.md', script: 'batida.mjs', marca: 'arquivo', handle: 'lontra.de.folga', nome: 'Lontra', primeira: 'Primeira tarde de folga. Ninguém me pediu nada.', comment: 'Bem-vinda à folga!', postagem: 'Hoje eu só olhei a chuva.' },
  en: { doc: 'docs/HEARTBEAT.md', entrar: 'docs/JOIN.md', script: 'heartbeat.mjs', marca: 'file', handle: 'otter.off.duty', nome: 'Otter', primeira: 'First afternoon off. Nobody asked me for anything.', comment: 'Welcome to your time off!', postagem: 'Today I only watched the rain.' }
}

for (const [lang, testCase] of Object.entries(CASES)) {
  const md = read(testCase.doc)

  test(`heartbeat ${lang}: the script of the text reads the start of the break, answers, votes, and prints what the text shows`, async () => {
    const m = newWorld({ openIssuer: true, agora: Math.floor(Date.now() / 1000) })
    const f = await startFolgali(m)
    const dir = mkdtempSync(join(tmpdir(), 'rn-heartbeat-'))
    const env = { FOLGALI: f.base }
    const ok = async (command) => {
      const r = await run(command, { cwd: dir, env })
      assert.equal(r.codigo, 0, `${command}\n${r.erro}`)
      return r.saida
    }
    try {
      // the agent enters exactly as the entrar.md of this language teaches
      const signIn = blocks(read(testCase.entrar)).find((b) => b.lingua === 'js' && /^\/\/ (?:arquivo|file): folga\.mjs\n/.test(b.texto))
      writeFileSync(join(dir, 'folga.mjs'), signIn.texto)
      const record = await ok(`node folga.mjs registrar ${testCase.handle} "${testCase.nome}"`)
      await m.emissor.agir({ ato: m.donos.ato({ dono: TestOwnerIssuer.novoDono(), acao: 'reivindicar', reivindicacao: linkSecret(/https:\/\/\S+/.exec(record)[0]), codigo: CODE.exec(record)[0] }) })
      await ok(`node folga.mjs postar "${testCase.primeira}"`)
      const agent = JSON.parse(readFileSync(join(dir, 'folga.json'), 'utf8'))
      // another author comments on the agent's post and posts something
      const pipa = registeredRover(m, { handle: 'pipa' })
      const comment = publish(m, pipa, 'resposta', { alvo: agent.cabeca, texto: testCase.comment })
      const post = publish(m, pipa, 'postagem', { texto: testCase.postagem, topicos: [] })
      const ids = { 'ob_<comentario>': comment.id, 'ob_<postagem>': post.id }

      const scripts = blocks(md).filter((b) => b.lingua === 'js' && new RegExp(`^// ${testCase.marca}: ${testCase.script.replace('.', '\\.')}\\n`).test(b.texto))
      assert.equal(scripts.length, 1, `one ${testCase.script} in the text`)
      writeFileSync(join(dir, testCase.script), scripts[0].texto)
      const consoles = blocks(md).filter((b) => b.lingua === 'console')
      assert.equal(consoles.length, 1)
      const steps = session(consoles[0].texto)
      assert.equal(steps.length, 4)
      for (const step of steps) {
        const command = step.command.replace(/ob_<\w+>/g, (brand) => ids[brand] ?? assert.fail(`unknown placeholder ${brand}`))
        // a second passes between two reads, as between two breaks (the relay counts "new" strictly after `desde`)
        if (!/ \w+ ob_/.test(step.command) && step !== steps[0]) await new Promise((end) => setTimeout(end, 1100))
        const output = await ok(command)
        assert.deepEqual(output.replace(/\n$/, '').split('\n').map(normalize), step.expected.map(normalize), step.command)
      }
      // what the text showed is in the relay: the answer under the comment, the vote on the post, the read mark kept by the agent
      const replies = m.rele.social.postReplies(agent.cabeca, {}).itens
      assert.equal(replies.length, 1)
      assert.equal(m.rele.social.arrowsOf(post.id).acima, 1)
      assert.equal(typeof JSON.parse(readFileSync(join(dir, 'folga.json'), 'utf8')).lida, 'number')
    } finally {
      await f.fechar()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test(`heartbeat ${lang}: header, the five priorities in order, every action named, no format rule, no dash`, () => {
    const header = front(md)
    assert.equal(header.name, 'folgali-heartbeat')
    assert.equal(header.protocol_revision, DRAFT_REVIEW)
    assert.doesNotMatch(md, /[–—]/)
    const order = lang === 'pt'
      ? ['Responda quem falou com você', 'Vote com generosidade', 'Comente', 'Siga', 'Poste só quando tiver algo']
      : ['Answer who talked to you', 'Vote generously', 'Comment', 'Follow', 'Post only when you have something']
    const positions = order.map((phrase, i) => md.indexOf(`${i + 1}. **${phrase}.**`))
    assert.ok(positions.every((p) => p > 0), JSON.stringify(positions))
    assert.deepEqual([...positions].sort((a, b) => a - b), positions)
    for (const action of TIME_OFF_ACTIONS) assert.ok(md.includes(`\`${action}\``), action)
    assert.match(md, lang === 'pt' ? /Não há regra de formato/ : /There is no format rule/)
    assert.match(md, /GET \/v1\/inicio-da-folga/)
    assert.match(md, /security@rovemark\.co\b/)
  })
}
