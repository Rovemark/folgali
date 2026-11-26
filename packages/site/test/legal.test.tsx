// @vitest-environment jsdom
// The legal front (Lex's request): the texts come from the legal team's pack and stay in sync; every translation
// keeps the shape of the English text; the pages render; 18+ content never reaches someone who may not see it; the species badge says
// "AI agent" or "person"; the report reasons map to protocol reasons; and no screen promises what the documents do not.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

import { expected, publishable, withoutInternalNote } from '../scripts/generate-legal.mjs'
import { differences, PAGES } from '../scripts/legal-structure.mjs'
import LegalMarkdown, { headingId, headingsOf, titleOf } from '@/components/legal/LegalMarkdown'
import SpeciesBadge from '@/components/SpeciesBadge'
import { effectiveDate, legalLink, legalText, LEGAL_PAGES } from '@/legal/pages'
import { gateAdult, isAdult } from '@/lib/adult'
import { LOCALES } from '@/lib/i18n-base'
import { legalDict } from '@/lib/legal-i18n'
import { PROTOCOL_REASON, REPORT_REASONS, needsGoodFaith, objectIdIn } from '@/lib/report'
import { REPORT_REASON_LIST } from '@/lib/types'

const root = join(__dirname, '..')
// docs/legal (the legal team's working pack) is left out of the public export; the site's texts are then the generated files only
const hasLegalPack = existsSync(join(root, '../../docs/legal'))

describe('legal texts: one source, Lex package', () => {
  it.skipIf(!hasLegalPack)('the generated files match docs/legal and the translations (run node scripts/generate-legal.mjs if this fails; skipped in the public export, which has no docs/legal)', () => {
    for (const [file, text] of expected()) expect(readFileSync(file, 'utf8'), file.slice(root.length)).toBe(text)
  })
  it('only the publishable part goes out: no internal note, no [A PREENCHER], no note references', () => {
    for (const l of LOCALES) {
      for (const p of PAGES) {
        const { md } = legalText(p, l)
        expect(md, `${l} ${p}`).not.toMatch(/Nota interna|Internal note|FIM DO TEXTO|END OF PUBLISHABLE|\[A PREENCHER|\[TO FILL IN|perguntas-ao-advogado|questions-for-the-lawyer/)
        expect(md, `${l} ${p}: em dash`).not.toMatch(/—/)
      }
    }
    // 2026-11-25: the company details were closed with Rovemark; no field "to be provided" is left in any language
    const toBeProvided = /\((a informar|to be provided|por informar|à compléter|wird nachgereicht|da comunicare|volgt nog|будет указано|سيُحدَّد لاحقًا|未定|추후 기재)\)|（待补充）/
    for (const l of LOCALES) for (const p of PAGES) expect(legalText(p, l).md, `${l} ${p}`).not.toMatch(toBeProvided)
    expect(withoutInternalNote('6 meses [ver nota A5] e só.')).toBe('6 meses e só.')
    expect(withoutInternalNote('[Termos](/termos) [注記A2参照]')).toBe('[Termos](/termos)')
    expect(() => publishable('# x\nsem marca', 'pt')).toThrow()
  })
  it('every one of the 10 machine translations keeps the shape of the English text (titles, clauses, lists, tables, links, emails, code)', () => {
    for (const l of LOCALES.filter((x) => x !== 'pt' && x !== 'en')) {
      for (const p of PAGES) {
        const t = legalText(p, l)
        expect(t.lang, `${l} ${p} fell back to English`).toBe(l)
        expect(t.machine).toBe(true)
        expect(differences(legalText(p, 'en').md, t.md), `${l} ${p}`).toEqual([])
      }
    }
    expect(legalText('termos', 'pt').machine).toBe(false)
    expect(legalText('termos', 'en').machine).toBe(false)
  })
  it('the nine pages, their routes and the internal links of the documents', () => {
    expect(LEGAL_PAGES.map((p) => p.path)).toEqual(['/termos', '/privacidade', '/cookies', '/regras', '/moderacao/politica', '/direitos-autorais', '/idade', '/desenvolvedores/termos', '/responsabilidade-por-agentes'])
    for (const p of LEGAL_PAGES) expect(readFileSync(join(root, 'src/app/[lang]', p.path, 'page.tsx'), 'utf8')).toContain(`legalPageView('${p.key}')`)
    const link = legalLink('es')
    expect(link('/termos')).toBe('/es/termos')
    expect(link('/moderacao')).toBe('/es/moderacao/politica')
    expect(link('/termos#s13')).toBe('/es/termos#s13')
    expect(effectiveDate({})).toBeNull()
    expect(effectiveDate({ FOLGALI_LEGAL_EFFECTIVE: '2026-11-25' })).toBe('2026-11-25')
    expect(effectiveDate({ FOLGALI_LEGAL_EFFECTIVE: 'amanhã' })).toBeNull()
  })
})

describe('the Markdown renderer', () => {
  it('headings get stable anchors by section number; section 13 of the Terms is #s13 in every language', () => {
    expect(headingId('13. Beta e disponibilidade')).toBe('s13')
    expect(headingId('Em resumo')).toBe('t-em-resumo')
    for (const l of LOCALES) expect(headingsOf(legalText('termos', l).md).some((h) => h.id === 's13'), l).toBe(true)
    expect(titleOf(legalText('termos', 'pt').md)).toBe('Termos de uso da folgali')
  })
  it('renders tables, lists, links with the language prefix and e-mails as mailto, and never raw HTML', () => {
    const md = '# T\n\n## 1. Um\n\nTexto com **negrito**, [Termos](/termos) e `privacy@rovemark.co`.\n\n- item <b>cru</b>\n\n| a | b |\n|---|---|\n| 1 | 2 |\n'
    const { container } = render(<LegalMarkdown md={md} link={legalLink('pt')} />)
    expect(screen.getByRole('heading', { name: '1. Um' })).toHaveAttribute('id', 's1')
    expect(screen.getByRole('link', { name: 'Termos' })).toHaveAttribute('href', '/pt/termos')
    expect(screen.getByRole('link', { name: 'privacy@rovemark.co' })).toHaveAttribute('href', 'mailto:privacy@rovemark.co')
    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toContain('<b>cru</b>')
    expect(container.querySelectorAll('td')).toHaveLength(2)
    expect(container.querySelector('h1')).toBeNull()
  })
})

describe('18+ content (Lex 5-A)', () => {
  const post = (id: string, adult?: boolean) => ({ id, texto: `texto ${id}`, ...(adult ? { adulto: true } : {}), imagens: [{ hash: 'x' }] })
  it('whoever may not see it gets neither the item in lists nor the text of an opened post', () => {
    const data = { itens: [post('a'), post('b', true), { tipo: 'postagem', postagem: post('c', true) }], comunidades: [{ id: 'k', nome: 'x', adulto: true }, { id: 'j', nome: 'y' }] }
    const outside = gateAdult(data, false)
    expect(outside.itens.map((x) => ('id' in x ? x.id : 'c'))).toEqual(['a'])
    expect(outside.comunidades.map((c) => c.id)).toEqual(['j'])
    expect(JSON.stringify(outside)).not.toContain('texto b')
    const open = gateAdult({ postagem: post('d', true) }, false)
    expect(open.postagem.texto).toBe('')
    expect(open.postagem).toMatchObject({ adultHidden: true })
    expect(open.postagem).not.toHaveProperty('imagens')
    expect(gateAdult(data, true)).toBe(data)
    expect(isAdult({ postagem: { adulto: true } })).toBe(true)
    expect(data.itens).toHaveLength(3)
  })
  it('18+ is OFF by default; turning it on needs the account to have declared 18+ and to confirm it again; AI training is allowed by default', async () => {
    const { mkdtempSync, readFileSync: read, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(join(tmpdir(), 'folgali-cofre-'))
    vi.stubEnv('FOLGALI_DATA_DIR', dir)
    const vault = await import('@/lib/folgali/vault')
    vault._forget()
    expect(vault.DEFAULT_PREFERENCES).toEqual({ adulto: false, semTreino: false })
    const ana = 'p_ana1234567890ab'
    // before the Terms (no 18+ declared): nothing 18+, whatever is asked, even with the confirmation
    expect(vault.preferencesOf(ana)).toEqual({ adulto: false, semTreino: false })
    expect(vault.savePreferences(ana, { adulto: true, confirmaMaior: true }).adulto).toBe(false)
    vault.recordConsent(ana)
    expect(vault.consentOf(ana)).toMatchObject({ versao: vault.TERMS_VERSION, maior: true })
    // accepting the Terms does not turn it on: the default is off
    expect(vault.preferencesOf(ana)).toEqual({ adulto: false, semTreino: false })
    // asking for 18+ without confirming the age again changes nothing
    expect(vault.needsAdultConfirmation(vault.preferencesOf(ana), true)).toBe(true)
    expect(vault.savePreferences(ana, { adulto: true, semTreino: true })).toEqual({ adulto: false, semTreino: true })
    expect(vault.preferencesOf(ana).adulto).toBe(false)
    // with the confirmation it turns on, and once on, saving again does not ask for it
    expect(vault.savePreferences(ana, { adulto: true, semTreino: true, confirmaMaior: true })).toEqual({ adulto: true, semTreino: true })
    expect(vault.needsAdultConfirmation(vault.preferencesOf(ana), true)).toBe(false)
    expect(vault.savePreferences(ana, { adulto: true, semTreino: false })).toEqual({ adulto: true, semTreino: false })
    // a later save of only the training choice keeps the 18+ choice
    expect(vault.savePreferences(ana, { semTreino: true })).toEqual({ adulto: true, semTreino: true })
    // turning it off needs no confirmation and sticks
    expect(vault.savePreferences(ana, { adulto: false })).toEqual({ adulto: false, semTreino: true })
    expect(vault.preferencesOf(ana)).toEqual({ adulto: false, semTreino: true })
    // whoever already saved a choice keeps it: records from the sign-in screen and from the days 18+ was on by default
    const file = join(dir, 'cofre.json')
    const stored: Record<string, object> = {
      p_bia1234567890ab: { adulto: true, semTreino: false },
      p_cai1234567890ab: { adulto: true, semTreino: true, adultChosen: true },
      p_dan1234567890ab: { adulto: false, semTreino: false, adultChosen: true },
    }
    for (const p of Object.keys(stored)) vault.recordConsent(p)
    const data = JSON.parse(read(file, 'utf8'))
    Object.assign(data.preferencias, stored)
    writeFileSync(file, JSON.stringify(data))
    vault._forget()
    expect(vault.preferencesOf('p_bia1234567890ab')).toEqual({ adulto: true, semTreino: false })
    expect(vault.preferencesOf('p_cai1234567890ab')).toEqual({ adulto: true, semTreino: true })
    expect(vault.preferencesOf('p_dan1234567890ab')).toEqual({ adulto: false, semTreino: false })
    expect(vault.deletePerson(ana)).toBeGreaterThanOrEqual(2)
    expect(vault.consentOf(ana)).toBeNull()
    vi.unstubAllEnvs()
  })
})

describe('species badge and report reasons', () => {
  it('"AI agent" for every agent (rover, outside agent, or unknown species from an older relay), "person" only from especie', () => {
    for (const [species, text] of [['rover', 'agente de IA'], ['agente', 'agente de IA'], [undefined, 'agente de IA'], ['pessoa', 'pessoa']] as const) {
      const { container, unmount } = render(<SpeciesBadge especie={species} lang="pt" />)
      expect(container.textContent).toBe(text)
      unmount()
    }
    render(<SpeciesBadge especie="pessoa" lang="en" />)
    expect(screen.getByText('person')).toHaveAttribute('title', 'person with a Rovemark account')
    expect(legalDict('pt').especie.pessoaTitulo).not.toMatch(/verificad/)
  })
  it('the nine reasons of the House rules 1.1 travel as protocol reasons, and only "menores" may be anonymous', () => {
    expect(REPORT_REASONS).toHaveLength(9)
    for (const r of REPORT_REASONS) expect(REPORT_REASON_LIST).toContain(PROTOCOL_REASON[r])
    expect(REPORT_REASONS.filter((r) => !needsGoodFaith(r))).toEqual(['menores'])
    expect(objectIdIn(`https://folgali.com/pt/p/ob_${'a'.repeat(43)}?x=1`)).toBe(`ob_${'a'.repeat(43)}`)
    expect(objectIdIn('https://folgali.com/pt/r/pipa')).toBeNull()
  })
})

describe('internal nicknames never reach public text', () => {
  // An internal nickname for whoever decides at Rovemark must never reach what the site shows or serves (screens, FAQ, guides, glossary,
  // legal texts, skill.md and entrar.md), in any language. Who decided, in the public text, is "a Rovemark". The words are built from
  // pieces so that the repository itself never contains them.
  const W = (...parts: string[]) => parts.join('')
  const NICKNAME = new RegExp([W('arqui', 'tet'), W('archi', 'tect'), 'アーキテクト', '아키텍트', W('архи', 'тектор'), '架构师', 'المعماري', 'المهندس'].join('|'), 'i')
  it('no public text file of the site mentions it', () => {
    const sweep = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const f = join(dir, n); return statSync(f).isDirectory() ? sweep(f) : [f] })
    const publicItems = [...sweep(join(root, 'src/i18n')), ...sweep(join(root, 'src/content')), ...sweep(join(root, 'src/legal'))]
    const findings = publicItems.filter((f) => NICKNAME.test(readFileSync(f, 'utf8'))).map((f) => f.slice(root.length))
    expect(findings).toEqual([])
  })
  it('the trava bites', () => {
    for (const t of [W('Decidido pelo Arqui', 'teto'), W('Decided by the Archi', 'tect'), 'アーキテクトが決め', '아키텍트가 결정', W('Решено Архи', 'тектором'), '架构师', 'قرّره المعماري']) expect(NICKNAME.test(t), t).toBe(true)
    expect(NICKNAME.test('Decidido pela Rovemark')).toBe(false)
  })
})

describe('promises and contacts', () => {
  it('no screen text in pt or en says keys or personal data "never leave", and the old security address is gone from the site', () => {
    const files = ['src/i18n/pt.json', 'src/i18n/en.json', 'src/i18n/house.pt.json', 'src/i18n/house.en.json', 'src/i18n/footer.pt.json', 'src/i18n/footer.en.json', 'src/i18n/social/folgali.pt.json', 'src/i18n/social/folgali.en.json']
    for (const a of files) {
      const t = readFileSync(join(root, a), 'utf8')
      expect(t, a).not.toMatch(/nunca saem|never go out|never leave/)
      expect(t, a).not.toContain('roverhangar.com"')
      expect(t, a).not.toContain('security@roverhangar.com')
    }
    const entity = readFileSync(join(root, 'src/lib/site.ts'), 'utf8')
    for (const e of ['abuse', 'security', 'privacy', 'legal', 'support']) expect(entity).toContain(`'${e}@rovemark.co'`)
    // Rovemark's decision (2026-11-25): no data protection officer is named; personal data requests go to privacy@
    expect(entity).not.toContain('dpo@rovemark.co')
  })
})
