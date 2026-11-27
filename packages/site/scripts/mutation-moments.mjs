#!/usr/bin/env node
// Bite meter for the MOMENTS on the real relay (owner decision of 2026-11-26: a moment is a `postagem` tagged `momento` with the card
// Rover Hangar drew attached). Same guard pattern as `scripts/mutation-031.mjs`:
//
//   1. BASE GUARD: the moments tests pass with no defect at all.
//   2. LETHAL DEFECT GUARD: plants by hand, one at a time, defects that must NOT pass (an ordinary post showing as a moment, yesterday's
//      moment staying up, a removed or 18+ one leaking, the walk reading the whole relay, two moments of the same rover clashing on the
//      React key, the caption repeating the card...) in a copy of the project, and requires the moments tests to catch each one. One that passes means the tests do not bite.
//
// Usage: node scripts/mutation-moments.mjs

import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TESTS = ['test/moments.test.ts', 'test/components/moments.test.tsx']

function vitest(cwd) {
  const r = spawnSync('npx', ['vitest', 'run', ...TESTS], { cwd, encoding: 'utf8' })
  return { ok: r.status === 0, saida: `${r.stdout}\n${r.stderr}` }
}

console.log('1. guarda de base: os testes dos momentos passam sem defeito?')
const base = vitest(root)
if (!base.ok) {
  console.error(base.saida.split('\n').slice(-25).join('\n'))
  console.error('\nBASE VERMELHA: conserte os testes antes de medir.')
  process.exit(1)
}
console.log('   verde.\n')

const LIB = 'src/lib/moments.ts'
const PAGE = 'src/app/[lang]/momentos/page.tsx'
const VIEWER = 'src/components/folgali/MomentsViewer.tsx'
// each defect: file, exact snippet to replace, replacement, and what it breaks
const DEFECTS = [
  { file: LIB, de: 'if (!p.topicos.includes(MOMENT_TOPIC) || p.removida', para: 'if (p.removida', nome: 'um post comum com imagem virar momento' },
  { file: LIB, de: '|| p.adultHidden || !momentImage(p)) return false', para: '|| p.adultHidden) return false', nome: 'um momento sem cartão entrar na tela' },
  { file: LIB, de: '|| p.removida || p.adultHidden', para: '|| p.adultHidden', nome: 'um momento removido pelo autor continuar no ar' },
  { file: LIB, de: '|| p.adultHidden || !momentImage', para: '|| !momentImage', nome: 'um momento +18 de texto escondido aparecer para quem não pode ver' },
  { file: LIB, de: 'return age < MOMENT_WINDOW_MS && age', para: 'return age <= MOMENT_WINDOW_MS && age', nome: 'o momento de exatamente 24 horas atrás continuar no ar' },
  { file: LIB, de: 'return age < MOMENT_WINDOW_MS && age', para: 'return true && age', nome: 'o momento de anteontem continuar no ar' },
  { file: LIB, de: '&& age >= -MOMENT_FUTURE_SKEW_MS', para: '&& true', nome: 'um momento datado horas no futuro furar a fila' },
  { file: LIB, de: 'Date.parse(b.criadaEm) - Date.parse(a.criadaEm)', para: 'Date.parse(a.criadaEm) - Date.parse(b.criadaEm)', nome: 'o mais velho primeiro' },
  { file: LIB, de: 'if (seen.has(p.id) || !isMoment(p, now)) continue', para: 'if (!isMoment(p, now)) continue', nome: 'o mesmo momento duas vezes (página que repete)' },
  { file: LIB, de: 'for (let page = 0; page < maxPages; page++)', para: 'for (let page = 0; page <= maxPages; page++)', nome: 'ler uma página além do teto' },
  { file: LIB, de: ' || r.itens.some((p) => pastWindow(p, now))) break', para: ') break', nome: 'seguir lendo o relé depois de passar das 24 horas' },
  { file: LIB, de: "if (!r.proximo || r.proximo === cursor || ", para: "if (!r.proximo || ", nome: 'um cursor parado fazer a página ler o teto inteiro' },
  { file: LIB, de: 'if (page === 0) throw e', para: 'if (false) throw e', nome: 'o relé fora do ar virar "ninguém publicou"' },
  { file: LIB, de: 'posts.push(...gate(r.itens))', para: 'posts.push(...r.itens)', nome: 'o filtro +18 não passar pelas páginas' },
  { file: PAGE, de: "client.postagensOrdenadas({ ordem: 'novas',", para: "client.postagensOrdenadas({ ordem: 'quentes',", nome: 'ler a lista quente em vez da mais nova' },
  { file: PAGE, de: 'gate: (posts) => gateAdult(posts, canSee)', para: 'gate: (posts) => posts', nome: 'a página não aplicar a regra +18 do leitor' },
  { file: PAGE, de: "const alt = imageName(image, galleryTexts(lang).genericAlt.replace('{nome}', p.autor.nome))", para: 'const alt = p.texto', nome: 'o alt não vir da imagem' },
  { file: PAGE, de: '{read.ok ? (\n          <EmptyState', para: '{true ? (\n          <EmptyState', nome: 'o relé fora do ar mostrar o vazio honesto' },
  { file: VIEWER, de: '<li key={x.chave}>', para: '<li key={x.autor}>', nome: 'dois momentos do mesmo rover baterem na chave do React' },
  { file: VIEWER, de: '{m.cartao ? (', para: '{false ? (', nome: 'o cartão desenhado não aparecer' },
  { file: LIB, de: "return normalized(text) === normalized(cardAlt) ? null : text", para: "return text", nome: 'repetir embaixo do cartão a frase que ele já diz' },
  { file: LIB, de: "return normalized(text) === normalized(cardAlt) ? null : text", para: "return text === cardAlt ? null : text", nome: 'um espaço ou quebra de linha a mais repetir a legenda' },
  { file: LIB, de: "return normalized(text) === normalized(cardAlt) ? null : text", para: "return null", nome: 'esconder a legenda que diz algo diferente do cartão' },
  { file: LIB, de: "s.replace(/\\s+/gu, ' ').trim()", para: "s.replace(/\\s+/gu, ' ')", nome: 'um espaço nas pontas repetir a legenda' },
  { file: PAGE, de: 'legenda: captionFor(p.texto, image.alt) ??', para: 'legenda: captionFor(p.texto, p.texto) ??', nome: 'comparar a postagem com ela mesma e nunca mostrar legenda' },
  { file: VIEWER, de: "{m.legenda && <p className=\"moment-caption\"", para: "{<p className=\"moment-caption\"", nome: 'uma legenda vazia na tela' },
  { file: VIEWER, de: 'alt="" aria-hidden="true" className="moment-card-backdrop"', para: 'alt={m.cartao.alt} className="moment-card-backdrop"', nome: 'o fundo desfocado ser lido como uma segunda imagem' },
]

console.log('2. guarda de defeito letal: cada defeito plantado precisa ser acusado pelos testes.')
const tmp = join(root, '.stryker-tmp', 'letal-momentos')
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
  console.error(`\n${leaked} defeito(s) letal(is) passaram. Os testes dos momentos não mordem.`)
  process.exit(1)
}
console.log(`   ${DEFECTS.length} de ${DEFECTS.length} acusados.`)
