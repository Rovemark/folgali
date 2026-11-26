import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { OG_SCENE } from '@/lib/folgali/scenes'
import { isReady, META, type Ready } from '@/lib/i18n'
import { metaOf, footerDict } from '@/lib/i18n-extra'
import { OG } from '@/lib/seo/og-cores'
import { ROUTES } from '@/lib/seo/routes'
import { ENTITY, urlBase } from '@/lib/site'

export const dynamic = 'force-dynamic'

// The font built into next/og only has Latin: without a font of our own, Chinese, Japanese, Korean and Arabic come out as empty squares.
// The fonts live IN the repository (src/fonts/og/<language>-<weight>.ttf), cut down to only the glyphs the image uses (text of the routes
// and of the brand in the 12 languages; the test test/seo/og-fontes.test.ts checks that no glyph is missing). No network, no Google Fonts and no
// third-party font at run time: the site's privacy promise also holds for the image.
// ARABIC is left out on purpose: the next/og renderer (satori) does not do bidirectional ordering nor measure joined words (the brand
// came out reversed and with huge gaps, checked on a photo on 2026-11-09). In Arabic the image comes out in English, readable and correct; the page is fully Arabic.
const FAMILY: Partial<Record<Ready, string>> = { zh: 'Noto Sans SC', ja: 'Noto Sans JP', ko: 'Noto Sans KR' }
const FONT_CACHE = new Map<string, Buffer | null>()
let LOGO: string | null | undefined

/** The folgali logo as PNG (satori does not read webp), embedded as a data URL. Without the file, the image comes out with the text only. */
async function logo(): Promise<string | null> {
  if (LOGO !== undefined) return LOGO
  try {
    LOGO = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/marca/folgali/logo-og.png'))).toString('base64')}`
  } catch {
    LOGO = null
  }
  return LOGO
}

const SCENE_CACHE = new Map<string, string | null>()

/** The section's scene (OG_SCENE, a 260 px JPEG), as a data URL. A missing file only drops the photo; the text stays. */
async function sceneOf(id: string): Promise<string | null> {
  const name = OG_SCENE[id]
  if (!name || !/^[a-z0-9-]+$/.test(name)) return null
  if (SCENE_CACHE.has(name)) return SCENE_CACHE.get(name) ?? null
  try {
    const url = `data:image/jpeg;base64,${(await readFile(join(process.cwd(), 'public/marca/folgali/og', `${name}.jpg`))).toString('base64')}`
    SCENE_CACHE.set(name, url)
    return url
  } catch {
    SCENE_CACHE.set(name, null)
    return null
  }
}

async function loadFont(lang: Ready, weight: 400 | 700): Promise<Buffer | null> {
  if (!FAMILY[lang]) return null
  const key = `${lang}-${weight}`
  if (FONT_CACHE.has(key)) return FONT_CACHE.get(key) ?? null
  try {
    const data = await readFile(join(process.cwd(), 'src/fonts/og', `${key}.ttf`))
    FONT_CACHE.set(key, data)
    return data
  } catch {
    FONT_CACHE.set(key, null)
    return null   // without the file the image still comes out, with the default font
  }
}

/** next/og does not do bidirectional reordering: in Arabic it builds word by word in a flex row-reverse so the phrase reads in the right order. */
const Timeline = ({ texto: text, rtl, style }: { texto: string; rtl: boolean; style: React.CSSProperties }) =>
  rtl ? (
    <div style={{ display: 'flex', flexDirection: 'row-reverse', flexWrap: 'wrap', columnGap: 14, rowGap: 2, ...style }}>
      {text.split(' ').map((p, i) => <div key={i} style={{ display: 'flex' }}>{p}</div>)}
    </div>
  ) : (
    <div style={{ display: 'flex', ...style }}>{text}</div>
  )

// Share image 1200x630. The text comes ONLY from the route registry (page title) and the dictionary: nothing anyone typed
// (community name, topic title) goes in here, not even by parameter. Unknown id falls back to the default image.
export async function GET(_req: Request, { params }: { params: Promise<{ lang: string; id: string }> }): Promise<Response> {
  const { lang, id } = await params
  if (!isReady(lang)) return new Response('Not found', { status: 404 })
  const [bold, normal, brand, scene] = await Promise.all([loadFont(lang, 700), loadFont(lang, 400), logo(), sceneOf(id)])
  // A script that needs its own font and does not have it (Arabic, or a file missing on the server): the image comes out in English instead of empty squares.
  const needsFont = FAMILY[lang] !== undefined || META[lang].dir === 'rtl'
  const effective: Ready = needsFont && !bold && !normal ? 'en' : lang
  const r = footerDict(effective)
  const known = ROUTES.some((x) => x.id === id && x.externo === undefined && id !== 'aprovacaoHumana')
  const title = known ? metaOf(effective, id).titulo : r.marca.titulo
  const label = known && id !== 'inicio' ? r.marca.titulo : r.marca.nota
  const host = new URL(urlBase()).host
  const rtl = META[effective].dir === 'rtl'
  const fontName = FAMILY[effective] ?? ''
  const fonts = [
    ...(bold ? [{ name: fontName, data: bold, weight: 700 as const, style: 'normal' as const }] : []),
    ...(normal ? [{ name: fontName, data: normal, weight: 400 as const, style: 'normal' as const }] : []),
  ]
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: OG.fundo, color: OG.tinta, ...(fonts.length ? { fontFamily: fontName } : {}), ...(rtl ? { alignItems: 'flex-end' } : {}) }}>
        <div style={{ display: 'flex', flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 24 }}>
          {brand ? (
            // eslint-disable-next-line @next/next/no-img-element -- image inside satori, not a page
            <img src={brand} width={286} height={105} alt="" />
          ) : (
            <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, color: OG.acao }}>folgali</div>
          )}
          <Timeline texto={label} rtl={rtl} style={{ fontSize: 26, color: OG.acao, letterSpacing: rtl ? 0 : 1 }} />
        </div>
        {/* the title, and beside it the section's scene (a small rounded photo: a full-height one made the PNG ten times heavier) */}
        <div style={{ display: 'flex', flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 40 }}>
          <Timeline texto={title} rtl={rtl} style={{ fontSize: title.length > 38 ? 68 : 88, fontWeight: 700, lineHeight: 1.12, letterSpacing: rtl || effective === 'zh' || effective === 'ja' || effective === 'ko' ? 0 : -2, maxWidth: scene ? 730 : 1000, ...(rtl ? { justifyContent: 'flex-start' } : {}) }} />
          {/* eslint-disable-next-line @next/next/no-img-element -- image inside satori, not a page */}
          {scene && <img src={scene} width={260} height={260} alt="" style={{ borderRadius: 36, flexShrink: 0 }} />}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${OG.linha}`, paddingTop: 28, fontSize: 26, color: OG.softInk }}>
          <div style={{ display: 'flex' }}>{host}</div>
          <div style={{ display: 'flex' }}>{ENTITY.licenca} · {ENTITY.empresa}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, ...(fonts.length ? { fonts } : {}), headers: { 'Cache-Control': 'public, max-age=86400' } },
  )
}
