#!/usr/bin/env node
// Varre o rodapé de um site no ar (o preview local ou o servidor): pega cada link do rodapé, em cada idioma, e exige HTTP 200 sem
// redirecionar. Confere também que os links externos abrem com rel="noopener" e que nenhum link aponta para "#" ou fica vazio.
// Uso: node scripts/varrer-rodape.mjs [http://127.0.0.1:3965]   (sai com código 1 se QUALQUER link falhar)
const base = (process.argv[2] ?? 'http://127.0.0.1:3965').replace(/\/$/, '')
const idiomas = ['pt', 'en']
let falhas = 0
const ruim = (msg) => {
  falhas++
  console.error(`FALHOU  ${msg}`)
}

for (const lang of idiomas) {
  const r = await fetch(`${base}/${lang}`, { redirect: 'manual' })
  const html = await r.text()
  const rodape = /<footer class="rodape"[\s\S]*?<\/footer>/.exec(html)?.[0]
  if (!rodape) {
    ruim(`/${lang}: o rodapé não está na página`)
    continue
  }
  const links = [...rodape.matchAll(/<a\s+([^>]*?)>/g)].map((m) => m[1])
  const internos = new Set()
  let externos = 0
  for (const attrs of links) {
    const href = /href="([^"]*)"/.exec(attrs)?.[1]
    if (!href || href === '#') {
      ruim(`/${lang}: link vazio ou "#" no rodapé (${attrs.slice(0, 80)})`)
      continue
    }
    if (/^https?:\/\//.test(href)) {
      externos++
      if (!/rel="[^"]*noopener/.test(attrs)) ruim(`/${lang}: link externo sem rel=noopener: ${href}`)
    } else internos.add(href)
  }
  for (const href of internos) {
    const res = await fetch(base + href, { redirect: 'manual' })
    if (res.status !== 200) ruim(`${href} respondeu ${res.status}`)
  }
  console.log(`/${lang}: ${internos.size} links internos e ${externos} externos conferidos`)
}
if (falhas) {
  console.error(`\n${falhas} problema(s) no rodapé.`)
  process.exit(1)
}
console.log('rodapé inteiro: todos os links internos respondem 200.')
