#!/usr/bin/env node
// Sweeps the footer of a live site (the local preview or the server) and the site map it links to: takes every link of both, in each
// language, and requires HTTP 200 without redirecting. It also checks that external links open with rel="noopener", that no link points
// to "#" or is empty, and that the footer links the site map (it is how the routes outside the footer stay reachable).
// Usage: node scripts/sweep-footer.mjs [http://127.0.0.1:3965]   (exits with code 1 if ANY link fails)
const base = (process.argv[2] ?? 'http://127.0.0.1:3965').replace(/\/$/, '')
const languageSet = ['pt', 'en']
let failures = 0
const bad = (msg) => {
  failures++
  console.error(`FALHOU  ${msg}`)
}

/** The links of an HTML snippet: internal ones in a set, external ones counted (and checked for noopener). */
function collect(where, excerpt, internal) {
  let external = 0
  for (const attrs of [...excerpt.matchAll(/<a\s+([^>]*?)>/g)].map((m) => m[1])) {
    const href = /href="([^"]*)"/.exec(attrs)?.[1]
    if (!href || href === '#') {
      bad(`${where}: link vazio ou "#" (${attrs.slice(0, 80)})`)
      continue
    }
    if (/^https?:\/\//.test(href)) {
      external++
      if (!/rel="[^"]*noopener/.test(attrs)) bad(`${where}: link externo sem rel=noopener: ${href}`)
    } else internal.add(href.replace(/&amp;/g, '&'))
  }
  return external
}

for (const lang of languageSet) {
  const r = await fetch(`${base}/${lang}`, { redirect: 'manual' })
  const html = await r.text()
  const footer = /<footer class="footer"[\s\S]*?<\/footer>/.exec(html)?.[0]
  if (!footer) {
    bad(`/${lang}: o rodapé não está na página`)
    continue
  }
  const internal = new Set()
  let external = collect(`/${lang} (rodapé)`, footer, internal)
  const map = `/${lang}/mapa-do-site`
  if (!internal.has(map)) bad(`/${lang}: o rodapé não liga o mapa do site (${map})`)
  const pageMap = await (await fetch(base + map, { redirect: 'manual' })).text()
  const list = /<div class="sitemap">[\s\S]*?<\/div>/.exec(pageMap)?.[0]
  if (!list) bad(`${map}: a lista do mapa do site não está na página`)
  else external += collect(map, list, internal)
  for (const href of internal) {
    const res = await fetch(base + href, { redirect: 'manual' })
    if (res.status !== 200) bad(`${href} respondeu ${res.status}`)
  }
  console.log(`/${lang}: ${internal.size} links internos e ${external} externos conferidos (rodapé e mapa do site)`)
}
if (failures) {
  console.error(`\n${failures} problema(s) no rodapé ou no mapa do site.`)
  process.exit(1)
}
console.log('rodapé e mapa do site: todos os links internos respondem 200.')
