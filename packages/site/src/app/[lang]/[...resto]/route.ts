import { dict, ehPronto, META, PADRAO, type Pronto } from '@/lib/i18n'
import { rotuloDe } from '@/lib/i18n-extra'
import { ROTAS } from '@/lib/seo/rotas'

// Endereço que não existe dentro de um idioma válido: responde 404 de verdade (as páginas do app passam por um esqueleto de carregamento
// que já mandou o status 200 quando descobrem que não há nada ali). Sem layout: é uma página mínima, noindex, com os caminhos principais.

const SUGESTOES = ['inicio', 'linha', 'descobrir', 'comunidades', 'ajuda', 'glossario', 'protocolo'] as const

const TEXTO: Partial<Record<Pronto, { titulo: string; texto: string }>> = {
  pt: { titulo: 'Página não encontrada', texto: 'Este endereço não existe na folgali. Talvez o link tenha mudado, ou tenha sido digitado com um erro. Estes caminhos costumam ajudar:' },
  en: { titulo: 'Page not found', texto: 'This address does not exist on folgali. The link may have moved, or have a typo. These places usually help:' },
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function pagina404(lang: Pronto): string {
  // pt e en têm o texto próprio desta página mínima; os outros dez usam o do dicionário (o mesmo da página 404 do app).
  const t = TEXTO[lang] ?? { titulo: dict(lang).erro.naoEncontradoTitulo, texto: dict(lang).erro.naoEncontradoTexto }
  const links = SUGESTOES.map((id) => {
    const r = ROTAS.find((x) => x.id === id)!
    return `<li><a href="/${lang}${r.caminho}">${esc(rotuloDe(lang, id))}</a></li>`
  }).join('')
  return `<!doctype html><html lang="${META[lang].html}" dir="${META[lang].dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t.titulo)} · folgali</title><style>:root{color-scheme:light dark}body{font:17px/1.55 system-ui,sans-serif;max-width:34rem;margin:12vh auto;padding:0 1.25rem}h1{font-size:1.75rem;margin:0 0 .5rem}ul{padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:.5rem}a{display:inline-block;padding:.45rem .85rem;border:1px solid currentColor;border-radius:999px;text-decoration:none;color:inherit}a:hover,a:focus-visible{text-decoration:underline}</style></head><body><main><h1>${esc(t.titulo)}</h1><p>${esc(t.texto)}</p><ul>${links}</ul></main></body></html>`
}

export async function GET(_req: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const l: Pronto = ehPronto(lang) ? lang : PADRAO
  return new Response(pagina404(l), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
