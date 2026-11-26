#!/usr/bin/env node
// Mutation meter for the SEO, AEO and GEO infrastructure (indexing flag, robots policy, sitemap, llms.txt, RSS, JSON-LD,
// metadata, proxy). Same pattern as `scripts/mutation.mjs`, in three stages, and it refuses to give a score if any fails:
//
//   1. BASE GUARD: the tests of these modules pass with no defect at all.
//   2. LETHAL DEFECT GUARD: plants by hand defects that must NOT pass (opening the closed site, indexing a credential screen, leaking
//      `</script>` in the JSON-LD, breaking the RSS with an `&`...) in a copy of the project, ONE PER PROCESS, and requires the tests to catch each one.
//   3. STRYKER: generates the automatic mutations in the modules, each mutant in a process of Stryker itself, with a time limit.
//
// Usage: node scripts/mutation-seo.mjs [--so-guardas]

import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const onlyGuards = process.argv.includes('--so-guardas')
const TESTS = ['test/seo', 'test/components/footer.test.tsx']

function vitest(cwd, targets = TESTS) {
  const r = spawnSync('npx', ['vitest', 'run', ...targets], { cwd, encoding: 'utf8', timeout: 180_000, killSignal: 'SIGKILL' })
  return { ok: r.status === 0, saida: `${r.stdout}\n${r.stderr}` }
}

console.log('1. guarda de base: os testes de SEO passam sem defeito?')
const base = vitest(root)
if (!base.ok) {
  console.error(base.saida.split('\n').slice(-25).join('\n'))
  console.error('\nBASE VERMELHA: conserte os testes antes de medir mutação.')
  process.exit(1)
}
console.log('   verde.\n')

// each defect: file, exact snippet to replace, replacement, and what it breaks
const DEFECTS = [
  { file: 'src/lib/site.ts', de: "return env.FOLGALI_INDEXABLE === 'sim'", para: "return env.FOLGALI_INDEXABLE !== undefined", nome: 'a flag abrir o site com qualquer valor (inclusive "nao")' },
  { file: 'src/lib/site.ts', de: "if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return DEFAULT_BASE_URL", para: "if (false) return DEFAULT_BASE_URL", nome: 'aceitar javascript: ou http como endereço-base' },
  { file: 'src/lib/seo/policy.ts', de: 'if (!aberto) return { index: false, follow: false, arquivo: false }', para: 'if (false) return { index: false, follow: false, arquivo: false }', nome: 'o site fechado continuar indexável' },
  { file: 'src/lib/seo/policy.ts', de: 'return REGEX_FORA.some((re) => re.test(alvo))', para: 'return false', nome: 'tela de credencial (aprovar, avisos, gestão) entrar no índice' },
  { file: 'src/lib/seo/policy.ts', de: "  '/aprovar/**',\n", para: '', nome: 'esquecer a tela de aprovar na lista de rotas fora do índice' },
  { file: 'src/lib/seo/policy.ts', de: "  '/r/**',\n", para: '', nome: 'perfil de rover entrar no índice' },
  { file: 'src/lib/seo/policy.ts', de: "return [`${base}$`, `${base}/`, `${base}?`]", para: "return [`${base}$`]", nome: 'robots.txt deixar passar o que está embaixo da rota fechada e a consulta' },
  { file: 'src/lib/seo/policy.ts', de: "aberto ? '(?:/.*)?' : '/?'", para: "aberto ? '' : '/?'", nome: 'padrão `/**` não casar o que está embaixo' },
  { file: 'src/lib/seo/policy.ts', de: "if (!aberto) return { rules: { userAgent: '*', disallow: '/' } }", para: "if (false) return { rules: { userAgent: '*', disallow: '/' } }", nome: 'robots.txt aberto com o site fechado' },
  { file: 'src/lib/seo/policy.ts', de: "const seguir = /^\\/(?:r|buscar)(?:\\/|$)/.test(resto)", para: 'const seguir = true', nome: 'seguir os links de uma tela de credencial' },
  { file: 'src/lib/seo/sitemap.ts', de: 'if (!d.aberto) return []', para: 'if (false) return []', nome: 'sitemap cheio com o site fechado' },
  { file: 'src/lib/seo/sitemap.ts', de: "const padrao = langs.includes(d.padrao) ? d.padrao : idiomas[0].lang", para: 'const padrao = d.padrao', nome: 'x-default apontar para um idioma em que a página não existe' },
  { file: 'src/lib/seo/sitemap.ts', de: 'const idiomas = d.idiomas.filter((i) => langs.includes(i.lang))', para: 'const idiomas = [...d.idiomas]', nome: 'sitemap listar a página num idioma em que ela não existe' },
  { file: 'src/lib/seo/sitemap.ts', de: '`/comunidades/${encodeURIComponent(c.id)}`', para: '`/comunidades/${c.id}`', nome: 'id de comunidade sem escape na URL' },
  { file: 'src/lib/seo/routes.ts', de: "{ id: 'buscar', caminho: '/buscar', secao: 'rede', indexavel: false", para: "{ id: 'buscar', caminho: '/buscar', secao: 'rede', indexavel: true", nome: 'resultado de busca no sitemap' },
  { file: 'src/lib/seo/routes.ts', de: "{ id: 'aprovacaoHumana', caminho: '/guias/aprovacao-humana', secao: 'pessoas', indexavel: false", para: "{ id: 'aprovacaoHumana', caminho: '/guias/aprovacao-humana', secao: 'pessoas', indexavel: true", nome: 'endereço repetido no sitemap (guia pelo registro e pela lista)' },
  { file: 'src/lib/seo/rss.ts', de: ".replace(/&/g, '&amp;')", para: '', nome: 'o & quebrar o XML do feed' },
  { file: 'src/lib/seo/rss.ts', de: '.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))', para: '', nome: 'novidades fora de ordem no feed' },
  { file: 'src/lib/seo/jsonld.ts', de: ".replace(/</g, '\\\\u003c')", para: '', nome: '`</script>` num título fechar a tag de dados estruturados' },
  { file: 'src/lib/seo/jsonld.ts', de: "text: `${f.respostaCurta} ${f.resposta}`.trim()", para: 'text: f.respostaCurta', nome: 'o FAQPage dizer menos do que a página mostra' },
  { file: 'src/lib/seo/jsonld.ts', de: "operatingSystem: 'macOS, Windows, Linux'", para: "operatingSystem: 'macOS, Windows, Linux, iOS, Android'", nome: 'afirmar app de celular que ainda não existe' },
  { file: 'src/lib/seo/metadata.ts', de: 'robots: metaRobots(routePolicy(`/${e.lang}${e.caminho}`, aberto)),', para: 'robots: metaRobots(routePolicy(`/${e.lang}${e.caminho}`, true)),', nome: 'meta robots aberto com o site fechado' },
  { file: 'src/lib/seo/metadata.ts', de: 'alternates: { canonical: url, languages,', para: 'alternates: { canonical: absoluteUrl(base, e.lang), languages,', nome: 'canonical apontar para o início' },
  { file: 'src/lib/seo/metadata.ts', de: "title: e.caminho === '' ? { absolute: e.titulo } : e.titulo,", para: 'title: e.titulo,', nome: 'título do início com o sufixo repetido' },
  { file: 'src/lib/seo/llms.ts', de: "...principal.entidade.fatos.map((f) => `- ${f}`)", para: '...[]', nome: 'llms.txt sem os fatos citáveis' },
  { file: 'src/lib/seo/llms.ts', de: 'for (const r of sitemapRoutes()) {\n      const m = t.meta[r.id]', para: 'for (const r of []) {\n      const m = t.meta[r.id]', nome: 'llms.txt sem a lista de páginas' },
  { file: 'src/proxy.ts', de: "robotsHeader(routePolicy(pathname, indexable()))", para: "robotsHeader(routePolicy(pathname, true))", nome: 'cabeçalho X-Robots-Tag aberto com o site fechado' },
  { file: 'src/app/llms.txt/route.ts', de: 'if (!indexable()) return', para: 'if (false) return', nome: 'llms.txt servido com o site fechado' },
  { file: 'src/lib/seo/exists.ts', de: 'return !lista.some((x) => x.slug === slug)', para: 'return false', nome: 'verbete ou guia que não existe responder 200 (soft 404)' },
  { file: 'src/app/[lang]/[...resto]/route.ts', de: '{ status: 404,', para: '{ status: 200,', nome: 'endereço inexistente responder 200' },
  { file: 'src/proxy.ts', de: "res = NextResponse.rewrite(url, { status: 404 })", para: "res = NextResponse.rewrite(url)", nome: 'o proxy reescrever o 404 sem o status' },
  { file: 'src/lib/seo/og-cores.ts', de: '(x + 0.05) / (y + 0.05)', para: '(x + 0.05) / (y + 0.5)', nome: 'contraste calculado errado (texto ilegível passa)' },
]

console.log('2. guarda de defeito letal: cada defeito plantado precisa ser acusado pelos testes (um por processo).')
const tmp = join(root, '.stryker-tmp', 'letal-seo')
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

// ---- 3. Stryker on the modules --------------------------------------------------------------------------------------------------------------
const config = {
  $schema: './node_modules/@stryker-mutator/core/schema/stryker-schema.json',
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts' },
  coverageAnalysis: 'perTest',
  mutate: [
    'src/lib/site.ts',
    'src/lib/seo/policy.ts',
    'src/lib/seo/sitemap.ts',
    'src/lib/seo/llms.ts',
    'src/lib/seo/rss.ts',
    'src/lib/seo/jsonld.ts',
    'src/lib/seo/metadata.ts',
    'src/lib/seo/meta-screens.ts',
    'src/lib/seo/og-cores.ts',
    'src/lib/seo/exists.ts',
    'src/proxy.ts',
  ],
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'reports/mutacao-seo.json' },
  tempDirName: '.stryker-tmp',
  concurrency: 4,
  timeoutMS: 20000,
  ignoreStatic: true,
  thresholds: { high: 90, low: 80, break: null },
}
const file = join(root, '.stryker-tmp', 'stryker.seo.json')
mkdirSync(dirname(file), { recursive: true })
writeFileSync(file, JSON.stringify(config, null, 2))
console.log('3. stryker (mutações automáticas nos módulos de SEO)...')
const s = spawnSync('npx', ['stryker', 'run', file], { cwd: root, stdio: 'inherit' })
process.exit(s.status ?? 1)
