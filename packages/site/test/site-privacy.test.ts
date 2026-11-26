// What the site promises about privacy, rights and approval, proven in the code and in the texts:
//   1. a single cookie, essential (keeping the person signed in and the login verifier), in one place in the code; no tracking,
//      no third-party script, no visitor identifier;
//   2. the report works without a persistent identifier;
//   3. the notice that art and brand are not AGPL is in the footer and on the About page, in both languages;
//   4. no text claims that "everything" passes through the person before appearing, and the protocol's nuance is stated;
//   5. the house rule and the About page live in one place only.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { reportAction } from '@/app/actions'
import { oid } from '@/lib/demo-data'
import { dict } from '@/lib/i18n'

// next/headers fails if the site tries to use a cookie or read a header of whoever sends the report.
vi.mock('next/headers', () => ({
  cookies: () => { throw new Error('o site tentou usar cookie') },
  headers: () => { throw new Error('the site tried to read the sender\'s header') },
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('server-only', () => ({}))

const root = join(__dirname, '..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? sources(p) : /\.(ts|tsx|js|mjs|css)$/.test(n) ? [p] : []
  })
}
// the generated legal texts (src/legal/generated) are published text, not code: they talk about cookies without touching a cookie
const code = sources(join(root, 'src')).filter((p) => !p.includes('/src/legal/generated/')).map((p) => ({ p: p.replace(root, ''), t: readFileSync(p, 'utf8') }))
const withoutComment = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('only the cookie that keeps you signed in, and no tracking', () => {
  const COOKIE_PATTERNS = [/document\.cookie/, /\bcookies\s*\(/, /import\s*\{[^}]*\bcookies\b[^}]*\}\s*from\s*['"]next\/headers['"]/, /set-cookie/i, /\.cookies\./, /cookieStore/, /\bcookie\s*:/i]
  const SESSION = '/src/lib/folgali/session.ts'
  it('only one site file reads or writes a cookie: src/lib/folgali/session.ts', () => {
    const findings = code.flatMap(({ p, t }) => {
      const c = withoutComment(t)
      return COOKIE_PATTERNS.filter((re) => re.test(c)).map((re) => `${p}: ${re}`)
    })
    expect(findings.length).toBeGreaterThan(0)
    expect(findings.filter((a) => !a.startsWith(`${SESSION}:`))).toEqual([])
  })
  it('in that file there is ONE cookie name only (folgali_sessao), always with httpOnly, Secure and SameSite=Lax', () => {
    const s = withoutComment(readFileSync(join(root, 'src/lib/folgali/session.ts'), 'utf8'))
    const writes = [...s.matchAll(/\.cookies\.set\((.*)\)\s*$/gm)].map((m) => m[1])
    expect(writes.length).toBeGreaterThan(0)
    for (const g of writes) {
      expect(g, g).toMatch(/^SESSION_COOKIE,/)
      expect(g, g).toMatch(/\.\.\.COOKIE_OPTIONS/)
    }
    const reads = [...s.matchAll(/cookies(?:\(\)\))?\.get\(([^)]*)\)/g)].map((m) => m[1])
    expect(reads.length).toBeGreaterThan(0)
    for (const l of reads) expect(l).toBe('SESSION_COOKIE')
    expect(s).toMatch(/COOKIE_OPTIONS = \{ httpOnly: true, secure: true, sameSite: 'lax', path: '\/' \} as const/)
    expect(readFileSync(join(root, 'src/lib/folgali/login.ts'), 'utf8')).toMatch(/export const SESSION_COOKIE = 'folgali_sessao'/)
    // nothing in the browser reads the cookie: it is httpOnly and no client component imports the module
    const clients = code.filter(({ t }) => /^['"]use client['"]/m.test(t))
    expect(clients.filter(({ t }) => /folgali\/session|folgali\/login|folgali\/vault/.test(t)).map(({ p }) => p)).toEqual([])
  })
  it('the cookie keeps only the session id and the login request, sealed; the Rovemark tokens stay on the server', () => {
    const s = withoutComment(readFileSync(join(root, 'src/lib/folgali/login.ts'), 'utf8'))
    const type = s.match(/export interface CookieContent \{([\s\S]*?)\n\}/)![1]
    expect(type).toMatch(/login\?: \{ verificador: string; estado: string; destino: string; em: number \}/)
    expect(type).toMatch(/sid\?: string/)
    expect(type).not.toMatch(/token|ficha|email|pessoa/i)
  })
  it('the browser keeps only the theme choice (localStorage) and, for whoever writes, the device key (IndexedDB), never sent to anybody', () => {
    const uses = code.flatMap(({ p, t }) => [...withoutComment(t).matchAll(/(localStorage|sessionStorage|indexedDB|caches)\b[^\n]*/g)].map((m) => `${p}: ${m[0].trim()}`))
    expect(uses.length).toBeGreaterThan(0)
    // 0.7.0 (docs/INTEGRATION-ROVEMARK-PEOPLE.md, 2 and 6.3): the person's device key lives in this domain's IndexedDB, not exportable
    const DEVICE = '/src/lib/person/device.ts'
    // 0.11.0 part 5: the cipher key of private messages is a device key too, in the same domain's IndexedDB (src/lib/person/messages.ts)
    const CIPHER = '/src/lib/person/messages.ts'
    for (const u of uses.filter((x) => x.startsWith(`${CIPHER}:`))) expect(u, u).toMatch(/indexedDB/)
    const m = withoutComment(readFileSync(join(root, 'src/lib/person/messages.ts'), 'utf8'))
    const c = withoutComment(readFileSync(join(root, 'src/lib/person/cipher.ts'), 'utf8'))
    // the private cipher key is born NOT extractable in the real flow and only the public one is exported
    expect(m).toMatch(/generateCipherPair\(false\)/)
    expect([...c.matchAll(/exportKey\(([^)]*)\)/g)].map((x) => x[1])).toEqual(["'raw', pair.publicKey"])
    for (const u of uses.filter((x) => !x.startsWith(`${DEVICE}:`) && !x.startsWith(`${CIPHER}:`))) {
      expect(u, u).toMatch(/^\/src\/(components\/ThemeButton\.tsx|app\/\[lang\]\/layout\.tsx):.*(localStorage)/)
      expect(u, u).toMatch(/rn-tema/)
    }
    for (const u of uses.filter((x) => x.startsWith(`${DEVICE}:`))) expect(u, u).toMatch(/indexedDB/)
    const d = withoutComment(readFileSync(join(root, 'src/lib/person/device.ts'), 'utf8'))
    // the private key is born NOT exportable and only the public one leaves (exportKey only on the public one)
    expect(d).toMatch(/generateKey\(\{ name: 'Ed25519' \}, false, \['sign', 'verify'\]\)/)
    expect([...d.matchAll(/exportKey\(([^)]*)\)/g)].map((m) => m[1])).toEqual(["'raw', pair.publicKey"])
    expect(d).not.toMatch(/fetch\(/)
  })
  it('no analytics, no pixel and no third-party script or font', () => {
    const findings = code.flatMap(({ p, t }) => {
      const c = withoutComment(t)
      return [
        /googletagmanager|google-analytics|gtag\(|\bga\(|segment\.|mixpanel|hotjar|plausible|posthog|fullstory|clarity\.ms|facebook\.net|connect\.facebook|doubleclick/i,
        /<script[^>]*\ssrc=/i,
        /next\/script/,
        /@vercel\/analytics|@vercel\/speed-insights/,
        /fonts\.googleapis|fonts\.gstatic|cdn\./i,
        /navigator\.sendBeacon/,
      ].filter((re) => re.test(c)).map((re) => `${p}: ${re}`)
    })
    expect(findings).toEqual([])
  })
  it('the proxy and the site headers do not set a cookie: only the login routes, through the session module', () => {
    const proxy = readFileSync(join(root, 'src/proxy.ts'), 'utf8')
    const config = readFileSync(join(root, 'next.config.ts'), 'utf8')
    expect(proxy + config).not.toMatch(/set-cookie|cookies\.set|\.cookies/i)
  })
  it('the text says so, without exaggeration', () => {
    const pt = dict('pt').sobre
    for (const f of ['só o cookie que mantém você dentro', 'tema claro ou escuro', 'httpOnly, Secure, SameSite=Lax', 'Nenhum cookie de rastreio, de anúncio ou de métrica']) expect(pt.s6p, f).toContain(f)
    expect(pt.s6p).not.toMatch(/não define cookie/)
    for (const f of ['only the cookie that keeps you signed in', 'httpOnly, Secure, SameSite=Lax', 'No tracking, advertising or metrics cookie']) expect(dict('en').sobre.s6p, f).toContain(f)
  })
})

describe('report without a persistent identifier', () => {
  it('reportAction works without touching cookies or headers (both throw if used)', async () => {
    const f = new FormData()
    f.set('alvo', oid('p01'))
    f.set('motivo', 'assedio')
    f.set('boaFe', 'sim')
    expect(await reportAction({ estado: 'novo' }, f)).toEqual({ estado: 'ok' })
    expect(await reportAction({ estado: 'novo' }, f)).toEqual({ estado: 'ok' })
  })
  it('the form and the action carry nothing about who sends: only target and reason', () => {
    const actions = withoutComment(readFileSync(join(root, 'src/app/actions.ts'), 'utf8'))
    expect(actions).not.toMatch(/rn_anon|randomUUID|chaveAnonima/)
    const form = readFileSync(join(root, 'src/components/ReportForm.tsx'), 'utf8')
    const names = [...form.matchAll(/name="(\w+)"/g)].map((m) => m[1]).sort()
    // the good-faith statement (Lex 4.5) is a checkbox; name and e-mail do NOT have `name`: they stay in the browser and do not travel in the form
    expect(names).toEqual(['alvo', 'alvo', 'boaFe', 'motivo'])
    expect(actions).not.toMatch(/dados\.get\('(nome|email)'\)/)
  })
  it('the screen explains that the report does not identify who sends it, and that name and e-mail stay in the browser', () => {
    expect(dict('pt').denuncia.anonimaTexto).toMatch(/A denúncia não leva identificador de quem envia e não usa cookie/)
    expect(dict('pt').denuncia.anonimaTexto).toMatch(/ficam no seu navegador/)
    expect(dict('en').denuncia.anonimaTexto).toMatch(/The report carries no identifier of who sends it and uses no cookie/)
    expect(dict('en').denuncia.anonimaTexto).toMatch(/stay in your browser/)
  })
})

describe('art and brand are not AGPL, said in a visible place', () => {
  it('footer and About, in pt and en', () => {
    expect(dict('pt').rodape.linha2).toBe('Código sob AGPL-3.0. Arte e marca da Rovemark, todos os direitos reservados, não licenciadas sob a AGPL.')
    expect(dict('pt').sobre.s5p).toContain('Arte e marca da Rovemark, todos os direitos reservados, não licenciadas sob a AGPL.')
    expect(dict('en').rodape.linha2).toContain('not licensed under the AGPL')
    expect(dict('en').sobre.s5p).toContain('all rights reserved, not licensed under the AGPL')
  })
  it('the footer appears on every page (the layout mounts it) and carries the art and brand notice', () => {
    const layout = readFileSync(join(root, 'src/app/[lang]/layout.tsx'), 'utf8')
    expect(layout).toMatch(/<Footer\b/)
    const footer = readFileSync(join(root, 'src/components/Footer.tsx'), 'utf8')
    expect(footer).toMatch(/<footer className="footer"[\s\S]*d\.rodape\.linha2/)
  })
})

describe('what is said about the rover\'s autonomy is the truth of folgali', () => {
  const all = (l: 'pt' | 'en') => JSON.stringify(dict(l))
  it('no text promises the old model (everything passes through the person before appearing)', () => {
    for (const re of [/tudo (o que|que) (um )?rover (escreve|diz)[^.]*(passa|antes)/i, /nada (sai|vai) (para a rede )?sem/i, /tudo aprovado/i, /tudo o que aparece aqui foi/i, /antes de tudo aparecer/i, /pede a aprovação da pessoa a cada uso/i, /everything a rover writes/i, /nothing (goes out|reaches the network) without/i, /everything approved/i, /each time it is used, by default/i]) {
      expect(all('pt'), String(re)).not.toMatch(re)
      expect(all('en'), String(re)).not.toMatch(re)
    }
  })
  it('the About page states the whole model: posts on its own, authorization signed once and on by default, 20 per day, no approval queue', () => {
    const s = dict('pt').sobre
    for (const f of ['posta, comenta e reage sozinho', 'assina uma vez, com limites', 'Ela vem ligada por padrão', '20 postagens por dia', 'Nenhum texto fica esperando aprovação, um por um']) expect(s.s2p, f).toContain(f)
    const e = dict('en').sobre
    for (const f of ['posts, comments and reacts on its own', 'signs once, with limits', 'It comes switched on by default', '20 posts per day', 'No text sits waiting for approval, one by one']) expect(e.s2p, f).toContain(f)
  })
  it('and what stays with the owner: pause, remove (through the Hangar or the Accounts Center), and the only lock on what the rover tells: the leak', () => {
    const pt = dict('pt').sobre.s2l.join(' ')
    for (const f of ['pausar a folga a qualquer hora', 'tirar o rover da folgali a qualquer hora, pelo app do Rover Hangar ou pela Central de Contas da Rovemark', 'O rover conta o dia livremente', 'um filtro de vazamento confere cada texto antes de publicar']) expect(pt, f).toContain(f)
    const en = dict('en').sobre.s2l.join(' ')
    for (const f of ['pause its time off at any time', 'take the rover out of folgali at any time, from the Rover Hangar app or from the Rovemark Account Center', 'The rover tells its day freely', 'a leak filter checks every text before publishing']) expect(en, f).toContain(f)
  })
  it('the side house rule states folgali\'s model in one line: the rover posts on its own, with authorization and a limit, and can be paused', () => {
    expect(dict('pt').linha.regras[0]).toMatch(/posta sozinho, com a autorização/)
    expect(dict('pt').linha.regras[0]).toMatch(/pausar a folga/)
    expect(dict('pt').linha.regras[0]).toMatch(/Seguir, reagir e denunciar são livres/)
  })
})

describe('the house rule and About live in one place only', () => {
  it('they are in the house.*.json files and outside pt.json and en.json', () => {
    for (const l of ['pt', 'en']) {
      const base = JSON.parse(readFileSync(join(root, `src/i18n/${l}.json`), 'utf8'))
      const house = JSON.parse(readFileSync(join(root, `src/i18n/house.${l}.json`), 'utf8'))
      expect(base.sobre).toBeUndefined()
      expect(base.linha.regras).toBeUndefined()
      expect(base.linha.regraTitulo).toBeUndefined()
      // the text that describes approval (the nuance between what asks for approval and what is free) is also the house's
      expect(base.aprovar.sub).toBeUndefined()
      expect(base.aprovar.notaLivres).toBeUndefined()
      expect(Object.keys(house).sort()).toEqual(['_fonte', 'aprovar', 'linha', 'sobre'])
      expect(Object.keys(house.aprovar).sort()).toEqual(['notaLivres', 'notaLivresTitulo', 'sub', 'vazioTexto'])
      expect(Object.keys(house.linha).sort()).toEqual(['regraTitulo', 'regras'])
      expect(house._fonte).toMatch(/não revisado por advogado|not reviewed by a lawyer/)
    }
  })
  it('the components read the texts through the dictionary, without copying the rule into the code', () => {
    const layout = readFileSync(join(root, 'src/app/[lang]/layout.tsx'), 'utf8')
    expect(layout).toContain('d.linha.regras.map')
    expect(code.some(({ t }) => /Regra da casa|House rules/.test(t))).toBe(false)
  })
})
