// Recorta as fontes das imagens de compartilhamento (Open Graph) de chinês, japonês e coreano.
//
// O renderizador do next/og só traz latino. Em vez de buscar fonte na rede a cada imagem (o site promete não usar fonte de terceiros),
// as fontes ficam no repositório, RECORTADAS: cada arquivo tem só os glifos das frases que a imagem desenha (título de cada rota e
// marca, no idioma) mais o ASCII, então pesam dezenas de KB e não os 10 MB da família inteira.
//
// Fontes de origem (SIL Open Font License 1.1, https://github.com/google/fonts/tree/main/ofl):
//   Noto Sans SC, JP e KR (variáveis em wght). Árabe não tem fonte aqui: ver o comentário em src/app/og/[lang]/[id]/route.tsx.
//
// uso: node scripts/fontes-og.mjs --origem <pasta com as fontes baixadas> --subset-font <caminho do módulo subset-font>
//   (subset-font não é dependência do site: instale em uma pasta de apoio, `npm i subset-font`, só para gerar estes arquivos)
// Rode de novo quando uma frase da imagem mudar: test/seo/og-fontes.test.ts falha se algum glifo faltar.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined }
const origem = arg('--origem')
const modulo = arg('--subset-font')
if (!origem || !modulo) { console.log('uso: node scripts/fontes-og.mjs --origem <pasta> --subset-font <caminho do módulo>'); process.exit(2) }
const subsetFont = (await import(pathToFileURL(path.resolve(modulo)).href)).default

/** Idioma -> arquivo de origem por peso. */
const FONTES = {
  zh: { 400: 'NotoSansSC[wght].ttf', 700: 'NotoSansSC[wght].ttf' },
  ja: { 400: 'NotoSansJP[wght].ttf', 700: 'NotoSansJP[wght].ttf' },
  ko: { 400: 'NotoSansKR[wght].ttf', 700: 'NotoSansKR[wght].ttf' },
}
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('')

/** Todo texto que a imagem pode desenhar neste idioma. A mesma função é usada pelo teste. */
export function textosDaImagem(lang) {
  const inst = JSON.parse(fs.readFileSync(path.join(RAIZ, `src/i18n/institucional.${lang}.json`), 'utf8'))
  const rodape = JSON.parse(fs.readFileSync(path.join(RAIZ, `src/i18n/rodape.${lang}.json`), 'utf8'))
  const titulos = Object.values(inst.meta).map((m) => m.titulo)
  return [...titulos, rodape.marca.titulo, rodape.marca.nota, ASCII, '·'].join('')
}

fs.mkdirSync(path.join(RAIZ, 'src/fontes/og'), { recursive: true })
for (const [lang, pesos] of Object.entries(FONTES)) {
  const texto = textosDaImagem(lang)
  for (const [peso, arquivo] of Object.entries(pesos)) {
    const fonte = fs.readFileSync(path.join(origem, arquivo))
    const opcoes = { targetFormat: 'truetype' }
    if (arquivo.includes('[wght]')) opcoes.variationAxes = { wght: Number(peso) }
    const saida = await subsetFont(fonte, texto, opcoes)
    const destino = path.join(RAIZ, 'src/fontes/og', `${lang}-${peso}.ttf`)
    fs.writeFileSync(destino, saida)
    console.log(`${lang}-${peso}.ttf  ${(saida.length / 1024).toFixed(1)} KB  (${new Set(texto).size} glifos pedidos)`)
  }
}
