#!/usr/bin/env node
// Confere o sitemap de um preview ABERTO contra as páginas de verdade: cada <loc> responde 200, o canonical da página é o próprio <loc>,
// o meta robots deixa indexar (título e descrição únicos DENTRO de cada idioma: texto de usuário não é traduzido), os hreflang do sitemap batem com os da página e são recíprocos, e há título/descrição únicos.
// Existe porque a ferramenta de auditoria da skill de SEO recusa 127.0.0.1 (proteção contra SSRF, correta): isto cobre o que ela cobriria
// num preview local. Uso: node scripts/conferir-sitemap.mjs http://127.0.0.1:3966
const base = (process.argv[2] ?? 'http://127.0.0.1:3966').replace(/\/$/, '')
const PUBLICA = 'https://folgali.com'
const local = (u) => u.replace(PUBLICA, base)
const xml = await (await fetch(`${base}/sitemap.xml`)).text()
const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => {
  const loc = /<loc>(.*?)<\/loc>/.exec(m[1])[1]
  const alt = [...m[1].matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((a) => [a[1], a[2]])
  return { loc, alt }
})
const falhas = []
const titulos = new Map()
const descricoes = new Map()
const porLoc = new Map(urls.map((u) => [u.loc, u]))
for (const u of urls) {
  const r = await fetch(local(u.loc))
  const html = await r.text()
  if (r.status !== 200) falhas.push(`${u.loc}: status ${r.status}`)
  const canon = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1]
  if (canon !== u.loc) falhas.push(`${u.loc}: canonical é ${canon}`)
  const robots = /<meta name="robots" content="([^"]+)"/.exec(html)?.[1] ?? ''
  if (!/\bindex\b/.test(robots) || /noindex/.test(robots)) falhas.push(`${u.loc}: robots "${robots}"`)
  const hl = [...html.matchAll(/<link rel="alternate"([^>]*)>/g)]
    .map((a) => [/hreflang="([^"]+)"/i.exec(a[1])?.[1], /href="([^"]+)"/.exec(a[1])?.[1]])
    .filter(([l]) => l)
    .map(([l, h]) => `${l}=${h}`)
    .sort()
    .join('|')
  const sm = u.alt.map(([l, h]) => `${l}=${h}`).sort().join('|')
  if (hl !== sm) falhas.push(`${u.loc}: hreflang da página (${hl}) difere do sitemap (${sm})`)
  for (const [, h] of u.alt) {
    const o = porLoc.get(h)
    if (!o) falhas.push(`${u.loc}: hreflang aponta para ${h}, que não está no sitemap`)
    else if (!o.alt.some(([, x]) => x === u.loc)) falhas.push(`${u.loc}: ${h} não aponta de volta (reciprocidade)`)
  }
  const t = /<title>(.*?)<\/title>/.exec(html)?.[1] ?? ''
  const d = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? ''
  if (!t) falhas.push(`${u.loc}: sem título`)
  if (!d) falhas.push(`${u.loc}: sem descrição`)
  const k = (x) => `${u.loc.replace(PUBLICA, '').split('/')[1]}|${x}`
  titulos.set(k(t), [...(titulos.get(k(t)) ?? []), u.loc])
  descricoes.set(k(d), [...(descricoes.get(k(d)) ?? []), u.loc])
  if (!/<h1[ >]/.test(html)) falhas.push(`${u.loc}: sem h1`)
}
for (const [t, l] of titulos) if (l.length > 1) falhas.push(`título repetido "${t}": ${l.join(', ')}`)
for (const [d, l] of descricoes) if (l.length > 1) falhas.push(`descrição repetida "${d.slice(0, 60)}": ${l.join(', ')}`)
console.log(`${urls.length} endereços no sitemap conferidos contra as páginas.`)
if (falhas.length) {
  console.log(`${falhas.length} falha(s):`)
  for (const f of falhas.slice(0, 60)) console.log(' -', f)
  process.exit(1)
}
console.log('canonical, robots, hreflang (e reciprocidade), título e descrição únicos, h1: tudo certo.')
