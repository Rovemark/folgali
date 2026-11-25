#!/usr/bin/env node
// Medidor de mutação da infraestrutura de SEO, AEO e GEO (flag de indexação, política de robots, sitemap, llms.txt, RSS, JSON-LD,
// metadados, proxy). Mesmo padrão do `scripts/mutacao.mjs`, em três etapas, e ele se recusa a dar nota se alguma falhar:
//
//   1. GUARDA DE BASE: os testes desses módulos passam sem defeito nenhum.
//   2. GUARDA DE DEFEITO LETAL: planta à mão defeitos que NÃO podem passar (abrir o site fechado, indexar tela de credencial, vazar
//      `</script>` no JSON-LD, quebrar o RSS com um `&`...) numa cópia do projeto, UM POR PROCESSO, e exige que os testes acusem cada um.
//   3. STRYKER: gera as mutações automáticas nos módulos, cada mutante num processo do próprio Stryker, com tempo limite.
//
// Uso: node scripts/mutacao-seo.mjs [--so-guardas]

import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const soGuardas = process.argv.includes('--so-guardas')
const TESTES = ['test/seo', 'test/componentes/rodape.test.tsx']

function vitest(cwd, alvos = TESTES) {
  const r = spawnSync('npx', ['vitest', 'run', ...alvos], { cwd, encoding: 'utf8', timeout: 180_000, killSignal: 'SIGKILL' })
  return { ok: r.status === 0, saida: `${r.stdout}\n${r.stderr}` }
}

console.log('1. guarda de base: os testes de SEO passam sem defeito?')
const base = vitest(raiz)
if (!base.ok) {
  console.error(base.saida.split('\n').slice(-25).join('\n'))
  console.error('\nBASE VERMELHA: conserte os testes antes de medir mutação.')
  process.exit(1)
}
console.log('   verde.\n')

// cada defeito: arquivo, trecho exato a trocar, troca, e o que ele quebra
const DEFEITOS = [
  { arq: 'src/lib/site.ts', de: "return env.ROVER_NETWORK_INDEXAVEL === 'sim'", para: "return env.ROVER_NETWORK_INDEXAVEL !== undefined", nome: 'a flag abrir o site com qualquer valor (inclusive "nao")' },
  { arq: 'src/lib/site.ts', de: "if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return URL_BASE_PADRAO", para: "if (false) return URL_BASE_PADRAO", nome: 'aceitar javascript: ou http como endereço-base' },
  { arq: 'src/lib/seo/politica.ts', de: 'if (!aberto) return { index: false, follow: false, arquivo: false }', para: 'if (false) return { index: false, follow: false, arquivo: false }', nome: 'o site fechado continuar indexável' },
  { arq: 'src/lib/seo/politica.ts', de: 'return REGEX_FORA.some((re) => re.test(alvo))', para: 'return false', nome: 'tela de credencial (aprovar, avisos, gestão) entrar no índice' },
  { arq: 'src/lib/seo/politica.ts', de: "  '/aprovar/**',\n", para: '', nome: 'esquecer a tela de aprovar na lista de rotas fora do índice' },
  { arq: 'src/lib/seo/politica.ts', de: "  '/r/**',\n", para: '', nome: 'perfil de rover entrar no índice' },
  { arq: 'src/lib/seo/politica.ts', de: "return [`${base}$`, `${base}/`, `${base}?`]", para: "return [`${base}$`]", nome: 'robots.txt deixar passar o que está embaixo da rota fechada e a consulta' },
  { arq: 'src/lib/seo/politica.ts', de: "aberto ? '(?:/.*)?' : '/?'", para: "aberto ? '' : '/?'", nome: 'padrão `/**` não casar o que está embaixo' },
  { arq: 'src/lib/seo/politica.ts', de: "if (!aberto) return { rules: { userAgent: '*', disallow: '/' } }", para: "if (false) return { rules: { userAgent: '*', disallow: '/' } }", nome: 'robots.txt aberto com o site fechado' },
  { arq: 'src/lib/seo/politica.ts', de: "const seguir = /^\\/(?:r|buscar)(?:\\/|$)/.test(resto)", para: 'const seguir = true', nome: 'seguir os links de uma tela de credencial' },
  { arq: 'src/lib/seo/sitemap.ts', de: 'if (!d.aberto) return []', para: 'if (false) return []', nome: 'sitemap cheio com o site fechado' },
  { arq: 'src/lib/seo/sitemap.ts', de: "const padrao = langs.includes(d.padrao) ? d.padrao : idiomas[0].lang", para: 'const padrao = d.padrao', nome: 'x-default apontar para um idioma em que a página não existe' },
  { arq: 'src/lib/seo/sitemap.ts', de: 'const idiomas = d.idiomas.filter((i) => langs.includes(i.lang))', para: 'const idiomas = [...d.idiomas]', nome: 'sitemap listar a página num idioma em que ela não existe' },
  { arq: 'src/lib/seo/sitemap.ts', de: '`/comunidades/${encodeURIComponent(c.id)}`', para: '`/comunidades/${c.id}`', nome: 'id de comunidade sem escape na URL' },
  { arq: 'src/lib/seo/rotas.ts', de: "{ id: 'buscar', caminho: '/buscar', secao: 'rede', indexavel: false", para: "{ id: 'buscar', caminho: '/buscar', secao: 'rede', indexavel: true", nome: 'resultado de busca no sitemap' },
  { arq: 'src/lib/seo/rotas.ts', de: "{ id: 'aprovacaoHumana', caminho: '/guias/aprovacao-humana', secao: 'pessoas', indexavel: false", para: "{ id: 'aprovacaoHumana', caminho: '/guias/aprovacao-humana', secao: 'pessoas', indexavel: true", nome: 'endereço repetido no sitemap (guia pelo registro e pela lista)' },
  { arq: 'src/lib/seo/rss.ts', de: ".replace(/&/g, '&amp;')", para: '', nome: 'o & quebrar o XML do feed' },
  { arq: 'src/lib/seo/rss.ts', de: '.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))', para: '', nome: 'novidades fora de ordem no feed' },
  { arq: 'src/lib/seo/jsonld.ts', de: ".replace(/</g, '\\\\u003c')", para: '', nome: '`</script>` num título fechar a tag de dados estruturados' },
  { arq: 'src/lib/seo/jsonld.ts', de: "text: `${f.respostaCurta} ${f.resposta}`.trim()", para: 'text: f.respostaCurta', nome: 'o FAQPage dizer menos do que a página mostra' },
  { arq: 'src/lib/seo/jsonld.ts', de: "operatingSystem: 'macOS, Windows, Linux'", para: "operatingSystem: 'macOS, Windows, Linux, iOS, Android'", nome: 'afirmar app de celular que ainda não existe' },
  { arq: 'src/lib/seo/metadata.ts', de: 'robots: metaRobots(politicaDaRota(`/${e.lang}${e.caminho}`, aberto)),', para: 'robots: metaRobots(politicaDaRota(`/${e.lang}${e.caminho}`, true)),', nome: 'meta robots aberto com o site fechado' },
  { arq: 'src/lib/seo/metadata.ts', de: 'alternates: { canonical: url, languages,', para: 'alternates: { canonical: urlAbsoluta(base, e.lang), languages,', nome: 'canonical apontar para o início' },
  { arq: 'src/lib/seo/metadata.ts', de: "title: e.caminho === '' ? { absolute: e.titulo } : e.titulo,", para: 'title: e.titulo,', nome: 'título do início com o sufixo repetido' },
  { arq: 'src/lib/seo/llms.ts', de: "...principal.entidade.fatos.map((f) => `- ${f}`)", para: '...[]', nome: 'llms.txt sem os fatos citáveis' },
  { arq: 'src/lib/seo/llms.ts', de: 'for (const r of rotasDoSitemap()) {\n      const m = t.meta[r.id]', para: 'for (const r of []) {\n      const m = t.meta[r.id]', nome: 'llms.txt sem a lista de páginas' },
  { arq: 'src/proxy.ts', de: "cabecalhoRobots(politicaDaRota(pathname, indexavel()))", para: "cabecalhoRobots(politicaDaRota(pathname, true))", nome: 'cabeçalho X-Robots-Tag aberto com o site fechado' },
  { arq: 'src/app/llms.txt/route.ts', de: 'if (!indexavel()) return', para: 'if (false) return', nome: 'llms.txt servido com o site fechado' },
  { arq: 'src/lib/seo/existe.ts', de: 'return !lista.some((x) => x.slug === slug)', para: 'return false', nome: 'verbete ou guia que não existe responder 200 (soft 404)' },
  { arq: 'src/app/[lang]/[...resto]/route.ts', de: '{ status: 404,', para: '{ status: 200,', nome: 'endereço inexistente responder 200' },
  { arq: 'src/proxy.ts', de: "res = NextResponse.rewrite(url, { status: 404 })", para: "res = NextResponse.rewrite(url)", nome: 'o proxy reescrever o 404 sem o status' },
  { arq: 'src/lib/seo/og-cores.ts', de: '(x + 0.05) / (y + 0.05)', para: '(x + 0.05) / (y + 0.5)', nome: 'contraste calculado errado (texto ilegível passa)' },
]

console.log('2. guarda de defeito letal: cada defeito plantado precisa ser acusado pelos testes (um por processo).')
const tmp = join(raiz, '.stryker-tmp', 'letal-seo')
let furou = 0
for (const [i, d] of DEFEITOS.entries()) {
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })
  for (const pasta of ['src', 'test', 'public']) cpSync(join(raiz, pasta), join(tmp, pasta), { recursive: true })
  for (const f of ['package.json', 'tsconfig.json', 'vitest.config.ts']) cpSync(join(raiz, f), join(tmp, f))
  symlinkSync(join(raiz, 'node_modules'), join(tmp, 'node_modules'))
  const alvo = join(tmp, d.arq)
  const antes = readFileSync(alvo, 'utf8')
  if (!antes.includes(d.de)) {
    console.error(`   defeito ${i + 1} (${d.nome}): o trecho a trocar não existe mais no código. Atualize a lista.`)
    process.exit(1)
  }
  writeFileSync(alvo, antes.replace(d.de, d.para))
  const r = vitest(tmp)
  if (r.ok) {
    furou++
    console.error(`   NÃO ACUSADO: ${d.nome}`)
  } else console.log(`   acusado: ${d.nome}`)
}
rmSync(tmp, { recursive: true, force: true })
if (furou) {
  console.error(`\n${furou} defeito(s) letal(is) passaram. O medidor não morde: nota recusada.`)
  process.exit(1)
}
console.log(`   ${DEFEITOS.length} de ${DEFEITOS.length} acusados.\n`)
if (soGuardas) process.exit(0)

// ---- 3. Stryker nos módulos --------------------------------------------------------------------------------------------------------------
const config = {
  $schema: './node_modules/@stryker-mutator/core/schema/stryker-schema.json',
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts' },
  coverageAnalysis: 'perTest',
  mutate: [
    'src/lib/site.ts',
    'src/lib/seo/politica.ts',
    'src/lib/seo/sitemap.ts',
    'src/lib/seo/llms.ts',
    'src/lib/seo/rss.ts',
    'src/lib/seo/jsonld.ts',
    'src/lib/seo/metadata.ts',
    'src/lib/seo/meta-telas.ts',
    'src/lib/seo/og-cores.ts',
    'src/lib/seo/existe.ts',
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
const arquivo = join(raiz, '.stryker-tmp', 'stryker.seo.json')
mkdirSync(dirname(arquivo), { recursive: true })
writeFileSync(arquivo, JSON.stringify(config, null, 2))
console.log('3. stryker (mutações automáticas nos módulos de SEO)...')
const s = spawnSync('npx', ['stryker', 'run', arquivo], { cwd: raiz, stdio: 'inherit' })
process.exit(s.status ?? 1)
