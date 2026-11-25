// @vitest-environment node
// O lado da folgali do "Entrar com a Rovemark" e as rotas que a Central de Contas chama. A Rovemark é falsa (fetch
// substituído): nenhuma chamada sai do computador. Prova: PKCE certo, estado conferido antes de tudo, um cookie só e
// essencial, fichas só no servidor, renovação serializada, assinatura da Central em tempo constante e com prazo.
import { createHmac } from 'node:crypto'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

import { GET as inicio } from '@/app/api/auth/rovemark/inicio/route'
import { GET as volta } from '@/app/api/auth/rovemark/callback/route'
import { POST as sair } from '@/app/api/auth/sair/route'
import { POST as ligados } from '@/app/api/rovemark/ligados/route'
import { POST as remover } from '@/app/api/rovemark/ligados/remover/route'
import { POST as contaApagada } from '@/app/api/rovemark/conta-apagada/route'
import { _esquecer, ligar, lerSessao, salvarSessao } from '@/lib/folgali/cofre'
import { COOKIE_SESSAO, abrir, assinaturaValida, configLogin, desafioS256, destinoSeguro, selar, type ConteudoDoCookie } from '@/lib/folgali/login'
import { manterViva } from '@/lib/folgali/sessao'

const SEGREDO = 'segredo-de-teste-da-sessao-com-mais-de-32-caracteres'
const CENTRAL = 'segredo-de-teste-da-central-com-mais-de-32-caracteres'
const BASE = 'https://folgali.com'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'folgali-cofre-'))
  vi.stubEnv('FOLGALI_DADOS_DIR', dir)
  vi.stubEnv('FOLGALI_SESSAO_SEGREDO', SEGREDO)
  vi.stubEnv('FOLGALI_ROVEMARK_API', 'https://api.rovemark.co')
  vi.stubEnv('FOLGALI_ROVEMARK_VOLTA', 'https://folgali.com/api/auth/rovemark/callback')
  vi.stubEnv('RVM_FOLGALI_SEGREDO', CENTRAL)
  _esquecer()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const fichas = (n = 1) => ({ ok: true, token_type: 'Bearer', access_token: `rmapp_at_${'a'.repeat(42)}${n}`, expires_in: 900, refresh_token: `rmapp_rt_${'r'.repeat(42)}${n}`, refresh_expires_in: 2592000, pessoa: { id: 'p_lumi123456', nome: 'Ana Folga' } })
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })
const cookieDa = (res: Response) => res.headers.getSetCookie()

describe('configuração', () => {
  it('sem segredo de 32+ caracteres não há login (o botão fica "em breve")', () => {
    vi.stubEnv('FOLGALI_SESSAO_SEGREDO', 'curto')
    expect(configLogin()).toBeNull()
  })
  it('API ou volta sem https (fora de localhost) é recusada', () => {
    vi.stubEnv('FOLGALI_ROVEMARK_API', 'http://api.rovemark.co')
    expect(configLogin()).toBeNull()
    vi.stubEnv('FOLGALI_ROVEMARK_API', 'http://127.0.0.1:4000')
    expect(configLogin()?.api).toBe('http://127.0.0.1:4000')
  })
  it('a volta padrão é a registrada na Rovemark', () => {
    vi.stubEnv('FOLGALI_ROVEMARK_VOLTA', undefined)
    expect(configLogin()?.volta).toBe('https://folgali.com/api/auth/rovemark/callback')
  })
})

describe('peças puras', () => {
  it('desafio S256 do RFC 7636 (exemplo oficial)', () => {
    expect(desafioS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
  it('o lacre abre com o mesmo segredo e não abre adulterado, com outro segredo ou para outro uso', () => {
    const s = selar({ sid: 'x' }, SEGREDO)
    expect(abrir(s, SEGREDO)).toEqual({ sid: 'x' })
    expect(abrir(s, `${SEGREDO}!`)).toBeNull()
    expect(abrir(s, SEGREDO, 'fichas')).toBeNull()
    const b = Buffer.from(s, 'base64url')
    b[b.length - 1] ^= 1
    expect(abrir(b.toString('base64url'), SEGREDO)).toBeNull()
    expect(abrir('lixo', SEGREDO)).toBeNull()
  })
  it('o destino depois de entrar é sempre caminho do próprio site', () => {
    expect(destinoSeguro('/pt/inicio')).toBe('/pt/inicio')
    for (const ruim of ['https://mal.example', '//mal.example', '/pt/../x', 'javascript:alert(1)', '/pt?x=1', null]) expect(destinoSeguro(ruim, 'en')).toBe('/en/linha')
  })
  it('assinatura da Central: certa passa; corpo mudado, segredo errado, prazo de 5 minutos estourado e formato torto não', () => {
    const t = 1_800_000_000
    const corpo = '{"pessoa":"p_lumi123456"}'
    const v1 = createHmac('sha256', CENTRAL).update(`${t}.${corpo}`).digest('hex')
    expect(assinaturaValida(`t=${t},v1=${v1}`, corpo, CENTRAL, t)).toBe(true)
    expect(assinaturaValida(`t=${t},v1=${v1}`, corpo, CENTRAL, t + 300)).toBe(true)
    expect(assinaturaValida(`t=${t},v1=${v1}`, corpo, CENTRAL, t + 301)).toBe(false)
    expect(assinaturaValida(`t=${t},v1=${v1}`, `${corpo} `, CENTRAL, t)).toBe(false)
    expect(assinaturaValida(`t=${t},v1=${v1}`, corpo, `${CENTRAL}x`, t)).toBe(false)
    expect(assinaturaValida(`t=${t},v1=${v1.slice(0, 63)}`, corpo, CENTRAL, t)).toBe(false)
    expect(assinaturaValida(null, corpo, CENTRAL, t)).toBe(false)
  })
})

describe('entrar: início e volta', () => {
  it('o início guarda verificador e estado no cookie e manda para a Rovemark com o desafio S256; um cookie só, essencial', async () => {
    const res = inicio(new NextRequest(`${BASE}/api/auth/rovemark/inicio?lang=en&tela=criar&destino=/en/inicio`))
    expect(res.status).toBe(302)
    const destino = new URL(res.headers.get('location')!)
    expect(destino.origin + destino.pathname).toBe('https://api.rovemark.co/api/auth/oauth/rovemark/start')
    expect(destino.searchParams.get('app')).toBe('folgali')
    expect(destino.searchParams.get('volta')).toBe('https://folgali.com/api/auth/rovemark/callback')
    expect(destino.searchParams.get('tela')).toBe('criar')
    const cookies = cookieDa(res)
    expect(cookies).toHaveLength(1)
    expect(cookies[0]).toMatch(new RegExp(`^${COOKIE_SESSAO}=`))
    expect(cookies[0]).toMatch(/HttpOnly/i)
    expect(cookies[0]).toMatch(/Secure/i)
    expect(cookies[0]).toMatch(/SameSite=lax/i)
    const c = abrir<ConteudoDoCookie>(cookies[0].split(';')[0].split('=')[1], SEGREDO)!
    expect(destino.searchParams.get('desafio')).toBe(desafioS256(c.login!.verificador))
    expect(destino.searchParams.get('estado')).toBe(c.login!.estado)
    expect(c.login!.destino).toBe('/en/inicio')
  })
  it('sem configuração, o início não sai do site', () => {
    vi.stubEnv('FOLGALI_SESSAO_SEGREDO', '')
    const res = inicio(new NextRequest(`${BASE}/api/auth/rovemark/inicio`))
    expect(new URL(res.headers.get('location')!).pathname).toBe('/pt/entrar')
    expect(cookieDa(res)).toHaveLength(0)
  })

  const pedido = (estado = 'estado-certo-123', em = Date.now()) => selar({ login: { verificador: 'v'.repeat(64), estado, destino: '/pt/inicio', em } }, SEGREDO)
  const voltaCom = (q: string, cookie?: string) => volta(new NextRequest(`${BASE}/api/auth/rovemark/callback?${q}`, { headers: cookie ? { cookie: `${COOKIE_SESSAO}=${cookie}` } : {} }))

  it('estado diferente do cookie: recusa ANTES de chamar a Rovemark', async () => {
    const busca = vi.fn()
    vi.stubGlobal('fetch', busca)
    const res = await voltaCom(`codigo=${'c'.repeat(43)}&estado=estado-errado-123`, pedido())
    expect(res.headers.get('location')).toMatch(/\/pt\/entrar\?erro=pedido$/)
    expect(busca).not.toHaveBeenCalled()
  })
  it('sem cookie, ou pedido vencido (mais de 10 minutos): recusa', async () => {
    vi.stubGlobal('fetch', vi.fn())
    expect((await voltaCom(`codigo=${'c'.repeat(43)}&estado=estado-certo-123`)).headers.get('location')).toMatch(/erro=pedido/)
    expect((await voltaCom(`codigo=${'c'.repeat(43)}&estado=estado-certo-123`, pedido('estado-certo-123', Date.now() - 11 * 60_000))).headers.get('location')).toMatch(/erro=pedido/)
  })
  it('cancelado na Rovemark: volta para entrar com o aviso', async () => {
    const res = await voltaCom('erro=cancelado&mensagem=x&estado=estado-certo-123', pedido())
    expect(res.headers.get('location')).toMatch(/\/pt\/entrar\?erro=cancelado$/)
  })
  it('aprovado: troca o código servidor a servidor, guarda as fichas CIFRADAS no cofre e o cookie leva só o id da sessão', async () => {
    const busca = vi.fn(async () => json(fichas()))
    vi.stubGlobal('fetch', busca)
    const res = await voltaCom(`codigo=${'c'.repeat(43)}&estado=estado-certo-123`, pedido())
    expect(busca).toHaveBeenCalledOnce()
    const [url, init] = busca.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.rovemark.co/api/auth/app/exchange')
    expect(JSON.parse(init.body as string)).toEqual({ codigo: 'c'.repeat(43), verificador: 'v'.repeat(64) })
    expect(new URL(res.headers.get('location')!).pathname).toBe('/pt/inicio')
    const c = abrir<ConteudoDoCookie>(cookieDa(res)[0].split(';')[0].split('=')[1], SEGREDO)!
    expect(c.login).toBeUndefined()
    expect(lerSessao(c.sid!)?.nome).toBe('Ana Folga')
    const arquivo = readFileSync(join(dir, 'cofre.json'), 'utf8')
    expect(arquivo).not.toMatch(/rmapp_/)
    expect(statSync(join(dir, 'cofre.json')).mode & 0o777).toBe(0o600)
  })
  it('a Rovemark recusa o código: volta para entrar sem sessão', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'x', codigo: 'codigo_invalido' }, 400)))
    const res = await voltaCom(`codigo=${'c'.repeat(43)}&estado=estado-certo-123`, pedido())
    expect(res.headers.get('location')).toMatch(/erro=troca/)
    expect(abrir<ConteudoDoCookie>(cookieDa(res)[0].split(';')[0].split('=')[1], SEGREDO)?.sid).toBeUndefined()
  })
})

describe('sessão viva, renovação e saída', () => {
  const comSessao = (venceEm: number) => {
    salvarSessao('sid1', { pessoa: 'p_lumi123456', nome: 'Ana', fichas: { at: 'rmapp_at_x', rt: 'rmapp_rt_velha' }, venceEm }, SEGREDO)
    return configLogin()!
  }
  it('renova perto de vencer, e duas renovações ao mesmo tempo viram UMA chamada (a Rovemark derruba a família se a ficha for reusada)', async () => {
    const c = comSessao(Date.now() + 10_000)
    const busca = vi.fn(async () => json(fichas(2)))
    const [a, b] = await Promise.all([manterViva('sid1', c, busca), manterViva('sid1', c, busca)])
    expect([a, b]).toEqual([true, true])
    expect(busca).toHaveBeenCalledOnce()
    expect(JSON.parse((busca.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ refresh_token: 'rmapp_rt_velha' })
    expect(lerSessao('sid1')!.venceEm).toBeGreaterThan(Date.now() + 800_000)
  })
  it('ficha ainda boa: não renova', async () => {
    const c = comSessao(Date.now() + 10 * 60_000)
    const busca = vi.fn()
    expect(await manterViva('sid1', c, busca)).toBe(true)
    expect(busca).not.toHaveBeenCalled()
  })
  it('401 na renovação (tirada na Central, reuso, senha trocada): a sessão acaba aqui também', async () => {
    const c = comSessao(Date.now() - 1)
    expect(await manterViva('sid1', c, vi.fn(async () => json({ codigo: 'acesso_revogado' }, 401)))).toBe(false)
    expect(lerSessao('sid1')).toBeNull()
  })
  it('sair revoga a família na Rovemark, apaga a sessão e o cookie', async () => {
    comSessao(Date.now() + 600_000)
    const busca = vi.fn(async () => json({ ok: true }))
    vi.stubGlobal('fetch', busca)
    const res = await sair(new NextRequest(`${BASE}/api/auth/sair?lang=pt`, { method: 'POST', headers: { cookie: `${COOKIE_SESSAO}=${selar({ sid: 'sid1' }, SEGREDO)}` } }))
    expect((busca.mock.calls[0] as unknown as [string])[0]).toBe('https://api.rovemark.co/api/auth/app/revoke')
    expect(lerSessao('sid1')).toBeNull()
    expect(cookieDa(res)[0]).toMatch(/Max-Age=0/i)
  })
})

describe('Central de Contas', () => {
  const assinado = (url: string, corpo: unknown, segredo = CENTRAL, t = Math.floor(Date.now() / 1000)) => {
    const cru = JSON.stringify(corpo)
    const v1 = createHmac('sha256', segredo).update(`${t}.${cru}`).digest('hex')
    return new NextRequest(`${BASE}${url}`, { method: 'POST', body: cru, headers: { 'content-type': 'application/json', 'x-rvm-assinatura': `t=${t},v1=${v1}` } })
  }
  const item = { id: 'rvr_lumi', tipo: 'rover' as const, nome: 'Lumi', ligadoEm: '2026-11-24T12:00:00.000Z' }

  it('sem RVM_FOLGALI_SEGREDO: 503 (a Central mostra "em breve")', async () => {
    vi.stubEnv('RVM_FOLGALI_SEGREDO', '')
    expect((await ligados(assinado('/api/rovemark/ligados', { pessoa: 'p_lumi123456' }))).status).toBe(503)
  })
  it('assinatura errada ou velha: 401, e nada é lido nem apagado', async () => {
    ligar('p_lumi123456', item)
    expect((await ligados(assinado('/api/rovemark/ligados', { pessoa: 'p_lumi123456' }, 'outro-segredo-com-mais-de-32-caracteres!!'))).status).toBe(401)
    expect((await contaApagada(assinado('/api/rovemark/conta-apagada', { pessoa: 'p_lumi123456' }, CENTRAL, Math.floor(Date.now() / 1000) - 400))).status).toBe(401)
    expect(await (await ligados(assinado('/api/rovemark/ligados', { pessoa: 'p_lumi123456' }))).json()).toEqual({ itens: [item] })
  })
  it('lista, tira (ok false quando já não estava) e apaga tudo da pessoa quando a conta some', async () => {
    ligar('p_lumi123456', item)
    salvarSessao('sid9', { pessoa: 'p_lumi123456', nome: 'Ana', fichas: { at: 'a', rt: 'r' }, venceEm: Date.now() + 1e6 }, SEGREDO)
    expect(await (await remover(assinado('/api/rovemark/ligados/remover', { pessoa: 'p_lumi123456', tipo: 'rover', id: 'rvr_lumi' }))).json()).toEqual({ ok: true })
    expect(await (await remover(assinado('/api/rovemark/ligados/remover', { pessoa: 'p_lumi123456', tipo: 'rover', id: 'rvr_lumi' }))).json()).toEqual({ ok: false })
    expect(await (await contaApagada(assinado('/api/rovemark/conta-apagada', { pessoa: 'p_lumi123456' }))).json()).toEqual({ ok: true })
    expect(lerSessao('sid9')).toBeNull()
  })
  it('corpo fora do contrato: 400', async () => {
    expect((await remover(assinado('/api/rovemark/ligados/remover', { pessoa: 'p_lumi123456', tipo: 'gato', id: 'x' }))).status).toBe(400)
    expect((await ligados(assinado('/api/rovemark/ligados', { pessoa: '../etc' }))).status).toBe(400)
  })
})
