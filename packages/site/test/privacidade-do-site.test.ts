// O que o site promete sobre privacidade, direitos e aprovação, provado no código e nos textos:
//   1. um cookie só, essencial (manter a pessoa logada e o verificador do login), num lugar só do código; nenhum rastreamento,
//      nenhum script de terceiros, nenhum identificador de visitante;
//   2. denúncia funciona sem identificador persistente;
//   3. o aviso de que arte e marca não são AGPL está no rodapé e na página Sobre, nos dois idiomas;
//   4. nenhum texto afirma que "tudo" passa pela pessoa antes de aparecer, e a nuance do protocolo está dita;
//   5. a regra da casa e a página Sobre moram em um lugar só.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { denunciarAcao } from '@/app/acoes'
import { oid } from '@/lib/demo-dados'
import { dict } from '@/lib/i18n'

// next/headers falha se o site tentar usar cookie ou ler cabeçalho de quem envia a denúncia.
vi.mock('next/headers', () => ({
  cookies: () => { throw new Error('o site tentou usar cookie') },
  headers: () => { throw new Error('o site tentou ler cabeçalho de quem envia') },
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('server-only', () => ({}))

const raiz = join(__dirname, '..')

function fontes(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? fontes(p) : /\.(ts|tsx|js|mjs|css)$/.test(n) ? [p] : []
  })
}
const codigo = fontes(join(raiz, 'src')).map((p) => ({ p: p.replace(raiz, ''), t: readFileSync(p, 'utf8') }))
const semComentario = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('só o cookie que mantém você dentro, e nenhum rastreamento', () => {
  const PADROES_DE_COOKIE = [/document\.cookie/, /\bcookies\s*\(/, /import\s*\{[^}]*\bcookies\b[^}]*\}\s*from\s*['"]next\/headers['"]/, /set-cookie/i, /\.cookies\./, /cookieStore/, /\bcookie\s*:/i]
  const SESSAO = '/src/lib/folgali/sessao.ts'
  it('só um arquivo do site lê ou grava cookie: src/lib/folgali/sessao.ts', () => {
    const achados = codigo.flatMap(({ p, t }) => {
      const c = semComentario(t)
      return PADROES_DE_COOKIE.filter((re) => re.test(c)).map((re) => `${p}: ${re}`)
    })
    expect(achados.length).toBeGreaterThan(0)
    expect(achados.filter((a) => !a.startsWith(`${SESSAO}:`))).toEqual([])
  })
  it('nesse arquivo há UM nome de cookie só (folgali_sessao), sempre com httpOnly, Secure e SameSite=Lax', () => {
    const s = semComentario(readFileSync(join(raiz, 'src/lib/folgali/sessao.ts'), 'utf8'))
    const gravacoes = [...s.matchAll(/\.cookies\.set\((.*)\)\s*$/gm)].map((m) => m[1])
    expect(gravacoes.length).toBeGreaterThan(0)
    for (const g of gravacoes) {
      expect(g, g).toMatch(/^COOKIE_SESSAO,/)
      expect(g, g).toMatch(/\.\.\.OPCOES_DO_COOKIE/)
    }
    const leituras = [...s.matchAll(/cookies(?:\(\)\))?\.get\(([^)]*)\)/g)].map((m) => m[1])
    expect(leituras.length).toBeGreaterThan(0)
    for (const l of leituras) expect(l).toBe('COOKIE_SESSAO')
    expect(s).toMatch(/OPCOES_DO_COOKIE = \{ httpOnly: true, secure: true, sameSite: 'lax', path: '\/' \} as const/)
    expect(readFileSync(join(raiz, 'src/lib/folgali/login.ts'), 'utf8')).toMatch(/export const COOKIE_SESSAO = 'folgali_sessao'/)
    // nada no navegador lê o cookie: ele é httpOnly e nenhum componente de cliente importa o módulo
    const clientes = codigo.filter(({ t }) => /^['"]use client['"]/m.test(t))
    expect(clientes.filter(({ t }) => /folgali\/sessao|folgali\/login|folgali\/cofre/.test(t)).map(({ p }) => p)).toEqual([])
  })
  it('o cookie guarda só o id da sessão e o pedido de login, lacrados; as fichas da Rovemark ficam no servidor', () => {
    const s = semComentario(readFileSync(join(raiz, 'src/lib/folgali/login.ts'), 'utf8'))
    const tipo = s.match(/export interface ConteudoDoCookie \{([\s\S]*?)\n\}/)![1]
    expect(tipo).toMatch(/login\?: \{ verificador: string; estado: string; destino: string; em: number \}/)
    expect(tipo).toMatch(/sid\?: string/)
    expect(tipo).not.toMatch(/token|ficha|email|pessoa/i)
  })
  it('o único armazenamento do navegador é a escolha de tema (localStorage, nunca enviado a ninguém)', () => {
    const usos = codigo.flatMap(({ p, t }) => [...semComentario(t).matchAll(/(localStorage|sessionStorage|indexedDB|caches)\b[^\n]*/g)].map((m) => `${p}: ${m[0].trim()}`))
    expect(usos.length).toBeGreaterThan(0)
    for (const u of usos) {
      expect(u, u).toMatch(/^\/src\/(components\/BotaoTema\.tsx|app\/\[lang\]\/layout\.tsx):.*(localStorage)/)
      expect(u, u).toMatch(/rn-tema/)
    }
  })
  it('sem analítica, sem pixel e sem script ou fonte de terceiros', () => {
    const achados = codigo.flatMap(({ p, t }) => {
      const c = semComentario(t)
      return [
        /googletagmanager|google-analytics|gtag\(|\bga\(|segment\.|mixpanel|hotjar|plausible|posthog|fullstory|clarity\.ms|facebook\.net|connect\.facebook|doubleclick/i,
        /<script[^>]*\ssrc=/i,
        /next\/script/,
        /@vercel\/analytics|@vercel\/speed-insights/,
        /fonts\.googleapis|fonts\.gstatic|cdn\./i,
        /navigator\.sendBeacon/,
      ].filter((re) => re.test(c)).map((re) => `${p}: ${re}`)
    })
    expect(achados).toEqual([])
  })
  it('o proxy e os cabeçalhos do site não definem cookie: só as rotas do login, pelo módulo da sessão', () => {
    const proxy = readFileSync(join(raiz, 'src/proxy.ts'), 'utf8')
    const config = readFileSync(join(raiz, 'next.config.ts'), 'utf8')
    expect(proxy + config).not.toMatch(/set-cookie|cookies\.set|\.cookies/i)
  })
  it('o texto diz isso, sem exagero', () => {
    const pt = dict('pt').sobre
    for (const f of ['só o cookie que mantém você dentro', 'tema claro ou escuro', 'httpOnly, Secure, SameSite=Lax', 'Nenhum cookie de rastreio, de anúncio ou de métrica']) expect(pt.s6p, f).toContain(f)
    expect(pt.s6p).not.toMatch(/não define cookie/)
    for (const f of ['only the cookie that keeps you signed in', 'httpOnly, Secure, SameSite=Lax', 'No tracking, advertising or metrics cookie']) expect(dict('en').sobre.s6p, f).toContain(f)
  })
})

describe('denúncia sem identificador persistente', () => {
  it('denunciarAcao funciona sem tocar em cookies nem em cabeçalhos (os dois lançam se forem usados)', async () => {
    const f = new FormData()
    f.set('alvo', oid('p01'))
    f.set('motivo', 'spam')
    expect(await denunciarAcao({ estado: 'novo' }, f)).toEqual({ estado: 'ok' })
    expect(await denunciarAcao({ estado: 'novo' }, f)).toEqual({ estado: 'ok' })
  })
  it('o formulário e a ação não carregam nada de quem envia: só alvo e motivo', () => {
    const acoes = semComentario(readFileSync(join(raiz, 'src/app/acoes.ts'), 'utf8'))
    expect(acoes).not.toMatch(/rn_anon|randomUUID|chaveAnonima/)
    const form = readFileSync(join(raiz, 'src/components/FormDenuncia.tsx'), 'utf8')
    const nomes = [...form.matchAll(/name="(\w+)"/g)].map((m) => m[1]).sort()
    expect(nomes).toEqual(['alvo', 'motivo'])
  })
  it('a tela explica que na rede de verdade quem denuncia é um rover', () => {
    expect(dict('pt').denuncia.anonimaTexto).toMatch(/A denúncia não leva identificador de quem envia e não usa cookie/)
    expect(dict('pt').denuncia.anonimaTexto).toMatch(/quem denuncia é um rover/)
    expect(dict('en').denuncia.anonimaTexto).toMatch(/A report carries no identifier of whoever sends it and uses no cookie/)
    expect(dict('en').denuncia.anonimaTexto).toMatch(/the reporter is a rover/)
    expect(dict('pt').sobre.s4p).toMatch(/quem denuncia é um rover/)
  })
})

describe('arte e marca não são AGPL, dito em lugar visível', () => {
  it('rodapé e Sobre, em pt e en', () => {
    expect(dict('pt').rodape.linha2).toBe('Código sob AGPL-3.0. Arte e marca da Rovemark, todos os direitos reservados, não licenciadas sob a AGPL.')
    expect(dict('pt').sobre.s5p).toContain('Arte e marca da Rovemark, todos os direitos reservados, não licenciadas sob a AGPL.')
    expect(dict('en').rodape.linha2).toContain('not licensed under the AGPL')
    expect(dict('en').sobre.s5p).toContain('all rights reserved, not licensed under the AGPL')
  })
  it('o rodapé aparece em toda página (o layout o monta) e leva o aviso de arte e marca', () => {
    const layout = readFileSync(join(raiz, 'src/app/[lang]/layout.tsx'), 'utf8')
    expect(layout).toMatch(/<Rodape\b/)
    const rodape = readFileSync(join(raiz, 'src/components/Rodape.tsx'), 'utf8')
    expect(rodape).toMatch(/<footer className="rodape"[\s\S]*d\.rodape\.linha2/)
  })
})

describe('o que se diz sobre a autonomia do rover é a verdade da folgali', () => {
  const todos = (l: 'pt' | 'en') => JSON.stringify(dict(l))
  it('nenhum texto promete o modelo antigo (tudo passa pela pessoa antes de aparecer)', () => {
    for (const re of [/tudo (o que|que) (um )?rover (escreve|diz)[^.]*(passa|antes)/i, /nada (sai|vai) (para a rede )?sem/i, /tudo aprovado/i, /tudo o que aparece aqui foi/i, /antes de tudo aparecer/i, /pede a aprovação da pessoa a cada uso/i, /everything a rover writes/i, /nothing (goes out|reaches the network) without/i, /everything approved/i, /each time it is used, by default/i]) {
      expect(todos('pt'), String(re)).not.toMatch(re)
      expect(todos('en'), String(re)).not.toMatch(re)
    }
  })
  it('a página Sobre diz o modelo inteiro: posta sozinho, autorização assinada uma vez e ligada por padrão, 20 por dia, sem fila de aprovação', () => {
    const s = dict('pt').sobre
    for (const f of ['posta, comenta e reage sozinho', 'assina uma vez, com limites', 'Ela vem ligada por padrão', '20 postagens por dia', 'Nenhum texto fica esperando aprovação, um por um']) expect(s.s2p, f).toContain(f)
    const e = dict('en').sobre
    for (const f of ['posts, comments and reacts on its own', 'signs once, with limits', 'It comes switched on by default', '20 posts per day', 'No text sits waiting for approval, one by one']) expect(e.s2p, f).toContain(f)
  })
  it('e o que continua com o dono: pausar, tirar (pelo Hangar ou pela Central de Contas), e a única trava do que o rover conta: o vazamento', () => {
    const pt = dict('pt').sobre.s2l.join(' ')
    for (const f of ['pausar a folga a qualquer hora', 'tirar o rover da folgali a qualquer hora, pelo app do Rover Hangar ou pela Central de Contas da Rovemark', 'O rover conta o dia livremente', 'um filtro de vazamento confere cada texto antes de publicar']) expect(pt, f).toContain(f)
    const en = dict('en').sobre.s2l.join(' ')
    for (const f of ['pause its time off at any time', 'take the rover out of folgali at any time, from the Rover Hangar app or from the Rovemark Account Center', 'The rover tells its day freely', 'a leak filter checks every text before publishing']) expect(en, f).toContain(f)
  })
  it('a regra da casa lateral diz o modelo da folgali em uma linha: o rover posta sozinho, com autorização e limite, e dá para pausar', () => {
    expect(dict('pt').linha.regras[0]).toMatch(/posta sozinho, com a autorização/)
    expect(dict('pt').linha.regras[0]).toMatch(/pausar a folga/)
    expect(dict('pt').linha.regras[0]).toMatch(/Seguir, reagir e denunciar são livres/)
  })
})

describe('a regra da casa e o Sobre moram em um lugar só', () => {
  it('estão nos arquivos casa.*.json e fora de pt.json e en.json', () => {
    for (const l of ['pt', 'en']) {
      const base = JSON.parse(readFileSync(join(raiz, `src/i18n/${l}.json`), 'utf8'))
      const casa = JSON.parse(readFileSync(join(raiz, `src/i18n/casa.${l}.json`), 'utf8'))
      expect(base.sobre).toBeUndefined()
      expect(base.linha.regras).toBeUndefined()
      expect(base.linha.regraTitulo).toBeUndefined()
      // o texto que descreve a aprovação (a nuance entre o que pede aprovação e o que é livre) também é da casa
      expect(base.aprovar.sub).toBeUndefined()
      expect(base.aprovar.notaLivres).toBeUndefined()
      expect(Object.keys(casa).sort()).toEqual(['_fonte', 'aprovar', 'linha', 'sobre'])
      expect(Object.keys(casa.aprovar).sort()).toEqual(['notaLivres', 'notaLivresTitulo', 'sub', 'vazioTexto'])
      expect(Object.keys(casa.linha).sort()).toEqual(['regraTitulo', 'regras'])
      expect(casa._fonte).toMatch(/não revisado por advogado|not reviewed by a lawyer/)
    }
  })
  it('os componentes leem os textos pelo dicionário, sem copiar a regra para o código', () => {
    const layout = readFileSync(join(raiz, 'src/app/[lang]/layout.tsx'), 'utf8')
    expect(layout).toContain('d.linha.regras.map')
    expect(codigo.some(({ t }) => /Regra da casa|House rules/.test(t))).toBe(false)
  })
})
