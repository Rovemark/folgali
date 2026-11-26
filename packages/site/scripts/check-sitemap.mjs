#!/usr/bin/env node
// Checks the sitemap of an OPEN preview against the real pages: each <loc> answers 200, the page canonical is the <loc> itself,
// the robots meta allows indexing (titles and descriptions unique WITHIN each language: user text is not translated), the sitemap hreflang entries match the page ones and are reciprocal, and titles/descriptions are unique.
// It exists because the audit tool of the SEO skill refuses 127.0.0.1 (SSRF protection, correctly): this covers what it would cover
// on a local preview. Usage: node scripts/check-sitemap.mjs http://127.0.0.1:3966
const base = (process.argv[2] ?? 'http://127.0.0.1:3966').replace(/\/$/, '')
const PUBLIC = 'https://folgali.com'
const local = (u) => u.replace(PUBLIC, base)
const xml = await (await fetch(`${base}/sitemap.xml`)).text()
const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => {
  const loc = /<loc>(.*?)<\/loc>/.exec(m[1])[1]
  const alt = [...m[1].matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((a) => [a[1], a[2]])
  return { loc, alt }
})
const failures = []
const titles = new Map()
const descriptions = new Map()
const byLoc = new Map(urls.map((u) => [u.loc, u]))
for (const u of urls) {
  const r = await fetch(local(u.loc))
  const html = await r.text()
  if (r.status !== 200) failures.push(`${u.loc}: status ${r.status}`)
  const canon = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1]
  if (canon !== u.loc) failures.push(`${u.loc}: canonical é ${canon}`)
  const robots = /<meta name="robots" content="([^"]+)"/.exec(html)?.[1] ?? ''
  if (!/\bindex\b/.test(robots) || /noindex/.test(robots)) failures.push(`${u.loc}: robots "${robots}"`)
  const hl = [...html.matchAll(/<link rel="alternate"([^>]*)>/g)]
    .map((a) => [/hreflang="([^"]+)"/i.exec(a[1])?.[1], /href="([^"]+)"/.exec(a[1])?.[1]])
    .filter(([l]) => l)
    .map(([l, h]) => `${l}=${h}`)
    .sort()
    .join('|')
  const sm = u.alt.map(([l, h]) => `${l}=${h}`).sort().join('|')
  if (hl !== sm) failures.push(`${u.loc}: hreflang da página (${hl}) difere do sitemap (${sm})`)
  for (const [, h] of u.alt) {
    const o = byLoc.get(h)
    if (!o) failures.push(`${u.loc}: hreflang aponta para ${h}, que não está no sitemap`)
    else if (!o.alt.some(([, x]) => x === u.loc)) failures.push(`${u.loc}: ${h} não aponta de volta (reciprocidade)`)
  }
  const t = /<title>(.*?)<\/title>/.exec(html)?.[1] ?? ''
  const d = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? ''
  if (!t) failures.push(`${u.loc}: sem título`)
  if (!d) failures.push(`${u.loc}: sem descrição`)
  const k = (x) => `${u.loc.replace(PUBLIC, '').split('/')[1]}|${x}`
  titles.set(k(t), [...(titles.get(k(t)) ?? []), u.loc])
  descriptions.set(k(d), [...(descriptions.get(k(d)) ?? []), u.loc])
  if (!/<h1[ >]/.test(html)) failures.push(`${u.loc}: sem h1`)
}
for (const [t, l] of titles) if (l.length > 1) failures.push(`título repetido "${t}": ${l.join(', ')}`)
for (const [d, l] of descriptions) if (l.length > 1) failures.push(`descrição repetida "${d.slice(0, 60)}": ${l.join(', ')}`)
console.log(`${urls.length} endereços no sitemap conferidos contra as páginas.`)
if (failures.length) {
  console.log(`${failures.length} failure(s):`)
  for (const f of failures.slice(0, 60)) console.log(' -', f)
  process.exit(1)
}
console.log('canonical, robots, hreflang (e reciprocidade), título e descrição únicos, h1: tudo certo.')
