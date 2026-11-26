#!/usr/bin/env node
// Mutation meter for the SCREENS and logic of revision 0.3.1 of the site (new relay fields: dates, grace period, removed, testimonials sent, topics,
// topic reactions, dismissing a report, people on the rise). Same pattern as `scripts/mutation.mjs`, in three stages, and it refuses to give a score if one fails:
//
//   1. BASE GUARD: the tests pass with no defect at all.
//   2. LETHAL DEFECT GUARD: plants by hand defects that must NOT pass (showing a button to someone who cannot, wiping content on dismiss, letting a 0.3 relay become an
//      error, leaking who reported...) in a copy of the project and requires the tests to catch each one. If one passes, the mutation does not bite and the score would be a lie.
//   3. STRYKER: only on the NEW LINES (the ranges come from anchors in the text, so the rest of the files is not mutated), each mutant running the tests that cover it.
//
// Usage: node scripts/mutation-031.mjs [--so-guardas]

import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const onlyGuards = process.argv.includes('--so-guardas')

function vitest(cwd, targets = []) {
  const r = spawnSync('npx', ['vitest', 'run', ...targets], { cwd, encoding: 'utf8' })
  return { ok: r.status === 0, saida: `${r.stdout}\n${r.stderr}` }
}

console.log('1. guarda de base: a suíte do site passa sem defeito?')
const base = vitest(root)
if (!base.ok) {
  console.error(base.saida.split('\n').slice(-25).join('\n'))
  console.error('\nBASE VERMELHA: conserte os testes antes de medir mutação.')
  process.exit(1)
}
console.log('   verde.\n')

// each defect: file, exact snippet to replace, replacement, and what it breaks
const DEFECTS = [
  { file: 'src/lib/domain/deadlines.ts', de: 'Math.max(ta, tb) + dias * DIA_MS', para: 'Math.min(ta, tb) + dias * DIA_MS', nome: 'dizer que o selo abre antes do dia em que abre de verdade' },
  { file: 'src/lib/domain/deadlines.ts', de: 'return passou >= exigido ? 0 :', para: 'return false ? 0 :', nome: 'a carência nunca acabar' },
  { file: 'src/lib/domain/deadlines.ts', de: 'return Math.max(1, Math.ceil(segundos / 60))', para: 'return Math.floor(segundos / 60)', nome: 'mostrar "faltam 0 minutos"' },
  { file: 'src/components/profile/eligibility.ts', de: 'return Number.isFinite(t) ? Math.floor((agora.getTime() - t) / DIA) :', para: 'return Number.isFinite(t) ? Math.ceil((agora.getTime() - t) / DIA) :', nome: 'contar um dia de amizade que ainda não completou' },
  { file: 'src/lib/communities/data.ts', de: 'membroHa: memberForSeconds(voce?.membroDesde, agora) }', para: 'membroHa: undefined }', nome: 'a carência de membro não valer na tela' },
  { file: 'src/lib/domain/act.ts', de: "return isObjectId(o.comunidade) && isObjectId(o.alvo) ? { tipo: 'denuncia-dispensar'", para: "return true ? { tipo: 'denuncia-dispensar'", nome: 'aceitar um pedido de dispensar com ids inventados' },
  { file: 'src/lib/social/sanitize-social.ts', de: "o.acao === 'dispensa' ? enumerado(['dispensada'] as const, o.motivo) : enumerado(MODERATION_REASON_LIST, o.motivo)", para: "enumerado(MODERATION_REASON_LIST, o.motivo)", nome: 'o registro com a dispensa derrubar a página inteira' },
  { file: 'src/lib/social/sanitize-social.ts', de: "return SELOS.filter((k) => x.includes(k))", para: "return x as BadgeType[]", nome: 'aceitar um selo que não existe' },
  { file: 'src/lib/social/sanitize-social.ts', de: 'x >= 0 && x <= 1_000_000 ? x : undefined', para: 'true ? x as number : undefined', nome: 'mostrar "-3 pessoas" no em alta' },
  { file: 'src/lib/social/sanitize-social.ts', de: "if (banidoEm !== undefined) voce.banidoEm = banidoEm", para: "void banidoEm", nome: 'perder a data do banimento' },
  { file: 'src/lib/social/sanitize-social.ts', de: "if (rc && typeof rc.curtir === 'number' && typeof rc.util === 'number') {", para: "if (rc) {", nome: 'o tópico com contagem torta quebrar a página' },
  { file: 'src/lib/social/http/read.ts', de: "if (!(await this.supports('removidos'))) return { itens: [] }", para: "if (false) return { itens: [] }", nome: 'chamar uma rota que o relé 0.3 não tem' },
  { file: 'src/lib/social/http/read.ts', de: "antes: before(cursor) })}`, 'propria'), S.depoimentoEnviado)", para: "antes: before(cursor) })}`, 'publica'), S.depoimentoEnviado)", nome: 'ler os depoimentos enviados sem a credencial do rover' },
  { file: 'src/lib/social/http/read.ts', de: "return (await this.storedFeatures.valor).has(recurso)", para: "return true", nome: 'achar que um relé 0.3 tem os recursos novos' },
  { file: 'src/lib/social/fake/write.ts', de: "if (!this.isTeam(c, autor)) throw new NetworkError('sem-permissao', 'só o dono e a moderação dispensam denúncias')", para: "void c", nome: 'qualquer membro dispensar denúncia' },
  { file: 'src/lib/social/fake/write.ts', de: 'for (const d of abertas) d.dispensadaEm = agora', para: 'for (const d of abertas) void d', nome: 'a denúncia dispensada continuar na fila' },
  { file: 'src/lib/social/fake/read.ts', de: 'if (d.dispensadaEm !== undefined) continue', para: 'if (false) continue', nome: 'a fila ignorar que a denúncia foi dispensada' },
  { file: 'src/lib/social/fake/read.ts', de: "const r = this.rover(uid)\n    this.requireOwn(uid)\n    const itens = this.registro", para: "const r = this.rover(uid)\n    const itens = this.registro", nome: 'ler o que foi removido do rover de outra pessoa' },
  { file: 'src/components/profile/Medals.tsx', de: "{pode === 'sim' && !jaDeu.includes(k) && (", para: "{pode === 'sim' && (", nome: 'oferecer dar de novo um selo que já foi dado' },
  { file: 'src/components/profile/RemovedList.tsx', de: "const canAppeal = x.escopo === 'comunidade' && x.contexto !== null && x.apelacao === null", para: "const canAppeal = x.apelacao === null", nome: 'oferecer apelar de uma remoção da página ou do relé' },
  { file: 'src/app/[lang]/comunidades/[id]/moderacao/page.tsx', de: '{podeDispensar && (\n                        <ActionButton', para: '{(\n                        <ActionButton', nome: 'mostrar "Dispensar" num relé que não tem a ação' },
]

console.log('2. guarda de defeito letal: cada defeito plantado precisa ser acusado pelos testes.')
const tmp = join(root, '.stryker-tmp', 'letal031')
let leaked = 0
for (const [i, d] of DEFECTS.entries()) {
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })
  for (const dir of ['src', 'test', 'public']) cpSync(join(root, dir), join(tmp, dir), { recursive: true })
  for (const f of ['package.json', 'tsconfig.json', 'vitest.config.ts']) cpSync(join(root, f), join(tmp, f))
  symlinkSync(join(root, 'node_modules'), join(tmp, 'node_modules'))
  const target = join(tmp, d.file)
  const before = readFileSync(target, 'utf8')
  if (!before.includes(d.de)) {
    console.error(`   defeito ${i + 1} (${d.nome}): o trecho a trocar não existe mais no código. Atualize a lista.`)
    process.exit(1)
  }
  writeFileSync(target, before.replace(d.de, d.para))
  const r = vitest(tmp)
  if (r.ok) {
    leaked++
    console.error(`   NÃO ACUSADO: ${d.nome}`)
  } else console.log(`   acusado: ${d.nome}`)
}
rmSync(tmp, { recursive: true, force: true })
if (leaked) {
  console.error(`\n${leaked} defeito(s) letal(is) passaram. O mutation não morde: nota recusada.`)
  process.exit(1)
}
console.log(`   ${DEFECTS.length} de ${DEFECTS.length} acusados.\n`)
if (onlyGuards) process.exit(0)

// ---- 3. Stryker only on the new lines -------------------------------------------------------------------------------------------------------
/** Lines (1-based, inclusive) of the block that starts at the line with `ancora` (anchor): if the line does not open braces, it is only that line; otherwise it runs to the first `}` in column 0. */
function block(file, anchor) {
  const lines = readFileSync(join(root, file), 'utf8').split('\n')
  const i = lines.findIndex((l) => l.includes(anchor))
  if (i < 0) throw new Error(`âncora não achada em ${file}: ${anchor}`)
  if (!lines[i].trimEnd().endsWith('{')) return [i + 1, i + 1]
  // the closing is `}` in column 0 for a module function, or `  }` for a class method
  const closing = lines[i].startsWith(' ') ? '  }' : '}'
  let j = i + 1
  while (j < lines.length && lines[j] !== closing) j++
  return [i + 1, j + 1]
}
const band = (file, anchor, until) => {
  const [a, b] = block(file, anchor)
  const f = until ? block(file, until)[1] : b
  return `${file}:${a}-${f}`
}
const mutate = [
  'src/lib/domain/deadlines.ts',
  'src/components/profile/Medals.tsx',
  'src/components/profile/SentList.tsx',
  'src/components/profile/RemovedList.tsx',
  band('src/components/profile/eligibility.ts', 'export function daysSince('),
  band('src/lib/communities/data.ts', 'export function whoOf('),
  band('src/lib/domain/act.ts', "case 'denuncia-dispensar':", "return isObjectId(o.comunidade) && isObjectId(o.alvo) ? { tipo: 'denuncia-dispensar'"),
  band('src/lib/social/sanitize-social.ts', '// ---- campos aditivos da revisão 0.3.1 ----', 'const selosAditivo = '),
  band('src/lib/social/sanitize-social.ts', 'function withPeople('),
  band('src/lib/social/sanitize-social.ts', 'const voceNaComunidade = '),
  band('src/lib/social/sanitize-social.ts', 'function queuedTopic('),
  band('src/lib/social/sanitize-social.ts', 'export function record('),
  band('src/lib/social/sanitize-social.ts', 'export function removed('),
  band('src/lib/social/sanitize-social.ts', 'export function sentTestimonial('),
  band('src/lib/social/sanitize-social.ts', 'export function pageTheme('),
  band('src/lib/social/http/read.ts', 'async suporta('),
  band('src/lib/social/http/read.ts', 'async depoimentosEnviados('),
  band('src/lib/social/http/read.ts', 'async removidos('),
  band('src/lib/social/http/read.ts', 'async temasDePaginas('),
  band('src/lib/social/fake/write.ts', 'protected dismissReport('),
  band('src/lib/social/fake/read.ts', 'async depoimentosEnviados('),
  band('src/lib/social/fake/read.ts', 'async removidos('),
  band('src/lib/social/fake/read.ts', 'async temasDePaginas('),
]
const config = {
  $schema: './node_modules/@stryker-mutator/core/schema/stryker-schema.json',
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts' },
  coverageAnalysis: 'perTest',
  mutate,
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'reports/mutacao-031.json' },
  tempDirName: '.stryker-tmp',
  concurrency: 4,
  timeoutMS: 20000,
  ignoreStatic: true,
  thresholds: { high: 90, low: 80, break: null },
}
const file = join(root, '.stryker-tmp', 'stryker.031.json')
mkdirSync(dirname(file), { recursive: true })
writeFileSync(file, JSON.stringify(config, null, 2))
console.log('3. stryker (mutações automáticas só nas linhas novas)...')
const s = spawnSync('npx', ['stryker', 'run', file], { cwd: root, stdio: 'inherit' })
process.exit(s.status ?? 1)
