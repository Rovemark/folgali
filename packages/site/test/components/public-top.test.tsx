import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import PublicTop from '@/components/folgali/PublicTop'
import { dict } from '@/lib/i18n'

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])

// A person who is already signed in used to see "Sign in" and "Create account" on every public page, and "Sign in" led back to the sign-in page,
// which only said "you are in" (reported by the owner on 2026-11-26). With a person, the doors become one way into the feed.
describe('PublicTop: the doors depend on who is looking', () => {
  const d = dict('pt')
  it('without a person: Sign in leads to /entrar, in the full bar and in the simple one', () => {
    expect(hrefs(renderToStaticMarkup(<PublicTop lang="pt" d={d} criar="/pt/entrar" />))).toContain('/pt/entrar')
    expect(hrefs(renderToStaticMarkup(<PublicTop lang="pt" d={d} criar="/pt/entrar" simple />))).toContain('/pt/entrar')
  })
  it('with a person: no link to /entrar and no "Create account"; one link to the feed', () => {
    for (const simple of [false, true]) {
      const html = renderToStaticMarkup(<PublicTop lang="pt" d={d} criar="https://rovemark.co/criar" simple={simple} person={{ nome: 'Ana' }} />)
      expect(hrefs(html)).not.toContain('/pt/entrar')
      expect(hrefs(html)).not.toContain('https://rovemark.co/criar')
      expect(hrefs(html)).toContain('/pt/linha')
      expect(html).toContain(d.socFolgali.entrar.continuar)
    }
  })
  it('the feed link exists in every language of the site, with the translated label', async () => {
    const { READY } = await import('@/lib/i18n-base')
    for (const lang of READY) {
      const dl = dict(lang)
      const html = renderToStaticMarkup(<PublicTop lang={lang} d={dl} criar="/x" person={{ nome: 'A' }} />)
      expect(hrefs(html)).toContain(`/${lang}/linha`)
      expect(dl.socFolgali.entrar.continuar.length).toBeGreaterThan(2)
    }
  })
})
