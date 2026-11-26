import { dict, isReady, META, DEFAULT, type Ready } from '@/lib/i18n'
import { labelOf } from '@/lib/i18n-extra'
import { ROUTES } from '@/lib/seo/routes'
import { REQUEST_404 } from '@/proxy'

// An address that does not exist inside a valid language: answers a real 404 (the app's pages go through a loading skeleton
// that has already sent status 200 when they find there is nothing there). The body is the 404 page with the whole site around it (header, menu,
// footer), requested from this same server at the same address, marked for the proxy to serve /{lang}/endereco-inexistente; if that request fails,
// the minimal page below goes out, noindex, with the main paths.

const SUGGESTIONS = ['inicio', 'linha', 'descobrir', 'comunidades', 'ajuda', 'glossario', 'protocolo'] as const

const TEXT: Partial<Record<Ready, { titulo: string; texto: string }>> = {
  pt: { titulo: 'Página não encontrada', texto: 'Este endereço não existe na folgali. Talvez o link tenha mudado, ou tenha sido digitado com um erro. Estes caminhos costumam ajudar:' },
  en: { titulo: 'Page not found', texto: 'This address does not exist on folgali. The link may have moved, or have a typo. These places usually help:' },
}

// The brand's palette (Ivory, Graphite, Hangar Blue) and the lost-in-the-woods scene (Rovemark art, public/marca/folgali/scenes), still a
// single static page: no script, no layout, no font download.
const STYLE = [
  ':root{color-scheme:light dark;--f:#F4F1EA;--t:#111318;--a:#3455E8;--l:color-mix(in oklab,var(--t) 16%,var(--f))}',
  '@media (prefers-color-scheme:dark){:root{--f:#111318;--t:#F4F1EA;--a:#DFEAFF}}',
  'body{font:17px/1.55 system-ui,sans-serif;background:var(--f);color:var(--t);max-width:40rem;margin:6vh auto;padding:0 1.25rem}',
  '.brand{border:0;padding:0;display:inline-block;margin-bottom:1rem}.brand img{display:block;height:auto}',
  '.scene{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;border-radius:20px;margin:0 0 1.25rem}',
  'h1{font-size:1.9rem;margin:0 0 .5rem;color:var(--a)}',
  'ul{padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:.5rem}',
  'li a{display:inline-block;padding:.45rem .85rem;border:1px solid var(--l);border-radius:999px;text-decoration:none;color:inherit;background:color-mix(in oklab,var(--f) 70%,white)}',
  '@media (prefers-color-scheme:dark){li a{background:color-mix(in oklab,var(--f) 80%,white)}.brand img{content:url(/marca/folgali/logo-escuro.webp)}}',
  'li a:hover,li a:focus-visible{text-decoration:underline;border-color:var(--a)}',
].join('')

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function page404(lang: Ready): string {
  // pt and en have their own text for this minimal page; the other ten use the dictionary's (the same as the app's 404 page).
  const t = TEXT[lang] ?? { titulo: dict(lang).erro.naoEncontradoTitulo, texto: dict(lang).erro.naoEncontradoTexto }
  const links = SUGGESTIONS.map((id) => {
    const r = ROUTES.find((x) => x.id === id)!
    return `<li><a href="/${lang}${r.caminho}">${esc(labelOf(lang, id))}</a></li>`
  }).join('')
  return `<!doctype html><html lang="${META[lang].html}" dir="${META[lang].dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t.titulo)} · folgali</title><style>${STYLE}</style></head><body><main><a class="brand" href="/${lang}"><img src="/marca/folgali/logo-principal.webp" alt="folgali" width="160" height="58"></a><img class="scene" src="/marca/folgali/scenes/404-forest.webp" alt="" width="1280" height="853"><h1>${esc(t.titulo)}</h1><p>${esc(t.texto)}</p><ul>${links}</ul></main></body></html>`
}

const HEADERS = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' }

/** The full 404 page, asked to this same server (loopback in the container, where PORT is set). null when it does not come. */
async function fullPage(req: Request, lang: string): Promise<string | null> {
  // only for a language with pages: the marked request must land on the proxy's 404 rewrite, never back on this route
  if (!isReady(lang)) return null
  const origin = process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : new URL(req.url).origin
  try {
    // the SAME address, marked: the proxy rewrites it to /{lang}/endereco-inexistente, so the page renders with the address the
    // browser shows (the language links of the footer and the router agree on the server and in the browser)
    const u = new URL(req.url)
    const r = await fetch(`${origin}${u.pathname}${u.search}`, { headers: { accept: 'text/html', 'accept-language': req.headers.get('accept-language') ?? '', [REQUEST_404]: '1' }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000) })
    const html = await r.text()
    // the mark is the site header of src/app/[lang]/layout.tsx; test/seo/not-found.test.ts reads the class from that file, so a rename there fails the test
    return /^<!DOCTYPE html>/i.test(html) && html.includes('<header class="top"') ? html : null
  } catch {
    return null
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const l: Ready = isReady(lang) ? lang : DEFAULT
  return new Response((await fullPage(req, lang)) ?? page404(l), { status: 404, headers: HEADERS })
}
