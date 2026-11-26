// Cuts the fonts for the share images (Open Graph) in Chinese, Japanese and Korean.
//
// The next/og renderer only ships Latin. Instead of fetching a font from the network for each image (the site promises not to use third-party fonts),
// the fonts stay in the repository, CUT: each file has only the glyphs of the phrases that the image draws (title of each route and
// brand, in the language) plus ASCII, so they weigh tens of KB and not the 10 MB of the whole family.
//
// Source fonts (SIL Open Font License 1.1, https://github.com/google/fonts/tree/main/ofl):
//   Noto Sans SC, JP and KR (variable in wght). Arabic has no font here: see the comment in src/app/og/[lang]/[id]/route.tsx.
//
// usage: node scripts/og-fonts.mjs --origem <folder with the downloaded fonts> --subset-font <path of the subset-font module>
//   (subset-font is not a dependency of the site: install it in a support folder, `npm i subset-font`, only to generate these files)
// Run again when a phrase of the image changes: test/seo/og-fontes.test.ts fails if any glyph is missing.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined }
const origin = arg('--origem')
const subsetModule = arg('--subset-font')
if (!origin || !subsetModule) { console.log('uso: node scripts/og-fonts.mjs --origem <pasta> --subset-font <caminho do módulo>'); process.exit(2) }
const subsetFont = (await import(pathToFileURL(path.resolve(subsetModule)).href)).default

/** Language -> source file per weight. */
const SOURCES = {
  zh: { 400: 'NotoSansSC[wght].ttf', 700: 'NotoSansSC[wght].ttf' },
  ja: { 400: 'NotoSansJP[wght].ttf', 700: 'NotoSansJP[wght].ttf' },
  ko: { 400: 'NotoSansKR[wght].ttf', 700: 'NotoSansKR[wght].ttf' },
}
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('')

/** All the text the image may draw in this language. The same function is used by the test. */
export function imageTexts(lang) {
  const inst = JSON.parse(fs.readFileSync(path.join(ROOT, `src/i18n/institutional.${lang}.json`), 'utf8'))
  const footer = JSON.parse(fs.readFileSync(path.join(ROOT, `src/i18n/footer.${lang}.json`), 'utf8'))
  const titles = Object.values(inst.meta).map((m) => m.titulo)
  return [...titles, footer.marca.titulo, footer.marca.nota, ASCII, '·'].join('')
}

fs.mkdirSync(path.join(ROOT, 'src/fonts/og'), { recursive: true })
for (const [lang, weights] of Object.entries(SOURCES)) {
  const text = imageTexts(lang)
  for (const [weight, file] of Object.entries(weights)) {
    const source = fs.readFileSync(path.join(origin, file))
    const options = { targetFormat: 'truetype' }
    if (file.includes('[wght]')) options.variationAxes = { wght: Number(weight) }
    const output = await subsetFont(source, text, options)
    const destination = path.join(ROOT, 'src/fonts/og', `${lang}-${weight}.ttf`)
    fs.writeFileSync(destination, output)
    console.log(`${lang}-${weight}.ttf  ${(output.length / 1024).toFixed(1)} KB  (${new Set(text).size} glifos pedidos)`)
  }
}
