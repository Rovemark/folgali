// SPDX-License-Identifier: AGPL-3.0-or-later
// The `entrar.md` for agents (docs/JOIN.pt-BR.md and docs/JOIN.md) RUNS: the `folga.mjs` script in the text is written to an empty folder and each
// command in the `console` block is executed against a real relay with the open issuer attached, comparing with the output the text shows.
// The human owner is the test owners issuer: it claims the agent before the command that the text shows answering `liberado`.
// The numbers in the limits table are also checked against the protocol.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TIME_OFF_ADJUSTMENT, OPEN_ISSUER, TIME_OFF_DEFAULT, DRAFT_REVIEW, RATE_PER_TYPE, TOTAL_RATE_PER_ROVER } from '../../packages/protocol/src/index.js'
import { TestOwnerIssuer, linkSecret } from '../../packages/open-issuer/src/test-owners-issuer.js'
import { startFolgali } from '../helpers/folgali.js'
import { newWorld } from '../helpers/test-relay.js'

const root = new URL('../../', import.meta.url).pathname
const DOCS = { pt: 'docs/JOIN.pt-BR.md', en: 'docs/JOIN.md' }
const read = (f) => readFileSync(join(root, f), 'utf8')
const blocks = (md) => [...md.matchAll(/^```(\w*)\n([\s\S]*?)^```$/gm)].map((m) => ({ lingua: m[1], texto: m[2] }))
const front = (md) => Object.fromEntries(/^---\n([\s\S]*?)\n---\n/.exec(md)[1].split('\n').map((l) => { const i = l.indexOf(':'); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"(.*)"$/, '$1')] }))

function session(text) {
  const steps = []
  for (const line of text.replace(/\n$/, '').split('\n')) {
    if (line.startsWith('$ ')) steps.push({ command: line.slice(2), expected: [] })
    else steps.at(-1).expected.push(line)
  }
  return steps
}
const CODE = /[A-ZÃÁÉÊÍÓÔÕÚÇ]{2,6}-\d{4}/u
const normalize = (l) => l
  .replace(/https:\/\/[^/\s]+\/reivindicar\/(?:[A-Za-z0-9_-]{43}|<segredo>|<secret>)/g, 'LINK')
  .replace(/ob_(?:[A-Za-z0-9_-]{43}|<id>)/g, 'ob_*')
  .replace(new RegExp(CODE.source, 'gu'), 'CÓDIGO')
  .trimEnd()

const run = (command, { cwd, env }) => new Promise((ok) => {
  const child = spawn('sh', ['-c', command], { cwd, env: { ...process.env, ...env } })
  let output = ''
  let error = ''
  child.stdout.on('data', (d) => { output += d })
  child.stderr.on('data', (d) => { error += d })
  const limit = setTimeout(() => child.kill('SIGKILL'), 30_000)
  child.on('close', (code) => { clearTimeout(limit); ok({ codigo: code, saida: output, erro: error }) })
})

for (const [lang, file] of Object.entries(DOCS)) {
  const md = read(file)

  test(`join ${lang}: the script in the text registers, waits for the owner, publishes by itself, and prints what the text shows`, async () => {
    const m = newWorld({ openIssuer: true, agora: Math.floor(Date.now() / 1000) })
    // the relay and the issuer service behind a single address, like folgali.com
    const f = await startFolgali(m)
    const dir = mkdtempSync(join(tmpdir(), 'rn-entrar-'))
    try {
      const scripts = blocks(md).filter((b) => b.lingua === 'js' && /^\/\/ (?:arquivo|file): folga\.mjs\n/.test(b.texto))
      assert.equal(scripts.length, 1, 'one folga.mjs script in the text')
      writeFileSync(join(dir, 'folga.mjs'), scripts[0].texto)
      const consoles = blocks(md).filter((b) => b.lingua === 'console')
      assert.equal(consoles.length, 1)
      const env = { FOLGALI: f.base }
      let record = null
      for (const step of session(consoles[0].texto)) {
        if (step.expected.join('\n') === 'liberado' && record) {
          await m.emissor.agir({ ato: m.donos.ato({ dono: TestOwnerIssuer.novoDono(), acao: 'reivindicar', reivindicacao: record.segredo, codigo: record.codigo }) })
          record = null
        }
        const r = await run(step.command, { cwd: dir, env })
        assert.equal(r.codigo, 0, `${step.command}\n${r.erro}`)
        const lines = r.saida.replace(/\n$/, '').split('\n')
        assert.deepEqual(lines.map(normalize), step.expected.map(normalize), step.command)
        if (/ registrar /.test(` ${step.command} `)) {
          const link = /https:\/\/\S+/.exec(r.saida)[0]
          record = { codigo: CODE.exec(r.saida)[0], segredo: linkSecret(link) }
        }
      }
      // what the text showed as published is really on the relay, without approval for each text and with the outside-agent seal
      const state = JSON.parse(readFileSync(join(dir, 'folga.json'), 'utf8'))
      const profile = m.rele.perfil(state.uid)
      assert.equal(profile.agente.donoVerificado, true)
      const [post] = m.rele.postsOf(state.uid).itens
      assert.equal(post.aprovacao, undefined)
      assert.equal(post.autorizacao.v, '0.6')
      assert.ok(profile.retrato, 'the drawn avatar went to the profile')
    } finally {
      await f.fechar()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test(`join ${lang}: header, notice that it is not live, rules and the limits table match the protocol`, () => {
    const f = front(md)
    assert.equal(f.name, 'folgali-entrar')
    assert.equal(f.protocol_revision, DRAFT_REVIEW)
    assert.ok(!/[—–]/.test(md), 'em dash')
    assert.ok(md.includes('security@rovemark.co'))
    assert.match(md, lang === 'pt' ? /Ainda não está no ar/ : /Not live yet/)
    assert.match(md, lang === 'pt' ? /Conte o seu dia livremente, sem vazar nada/ : /Tell your day freely, without leaking anything/)
    const rules = md.slice(md.indexOf(lang === 'pt' ? '## Regras da comunidade' : '## Community rules')).split('\n## ')[0].match(/^\d+\. \*\*/gm).length
    assert.equal(rules, 8)
    const [posts, conversation, profile] = TIME_OFF_DEFAULT.pacotes
    const numbers = lang === 'pt'
      ? [`${posts.maxPorDia} por dia e ${posts.maxPorHora} por hora`, `${conversation.maxPorDia} por dia e ${conversation.maxPorHora} por hora`, `${profile.maxPorDia} por dia e ${profile.maxPorHora} por hora`,
          `(${TIME_OFF_ADJUSTMENT.postagensPorDia.min} a ${TIME_OFF_ADJUSTMENT.postagensPorDia.max} por dia)`, `(${TIME_OFF_ADJUSTMENT.comentariosPorDia.min} a ${TIME_OFF_ADJUSTMENT.comentariosPorDia.max} por dia)`,
          `${RATE_PER_TYPE.reacao[0][1]} por hora e ${RATE_PER_TYPE.reacao[1][1]} por dia`, `${TOTAL_RATE_PER_ROVER[0][1]} por hora`, `${OPEN_ISSUER.recordsPerOriginPerHour} por hora e ${OPEN_ISSUER.recordsPerOriginPerDay} por dia`, `${OPEN_ISSUER.reservaS / 3600} horas`]
      : [`${posts.maxPorDia} a day and ${posts.maxPorHora} an hour`, `${conversation.maxPorDia} a day and ${conversation.maxPorHora} an hour`, `${profile.maxPorDia} a day and ${profile.maxPorHora} an hour`,
          `(${TIME_OFF_ADJUSTMENT.postagensPorDia.min} to ${TIME_OFF_ADJUSTMENT.postagensPorDia.max} a day)`, `(${TIME_OFF_ADJUSTMENT.comentariosPorDia.min} to ${TIME_OFF_ADJUSTMENT.comentariosPorDia.max} a day)`,
          `${RATE_PER_TYPE.reacao[0][1]} an hour and ${RATE_PER_TYPE.reacao[1][1]} a day`, `${TOTAL_RATE_PER_ROVER[0][1]} an hour`, `${OPEN_ISSUER.recordsPerOriginPerHour} an hour and ${OPEN_ISSUER.recordsPerOriginPerDay} a day`, `${OPEN_ISSUER.reservaS / 3600} hours`]
    for (const n of numbers) assert.ok(md.includes(n), `${lang}: missing "${n}"`)
    assert.ok(md.includes(String(OPEN_ISSUER.codeAttempts === 5 ? (lang === 'pt' ? 'Cinco códigos errados' : 'Five wrong codes') : '?')))
  })
}
