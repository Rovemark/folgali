// O lado da folgali do "Entrar com a Rovemark" (contrato em rovemark-platform/docs/LOGIN-FOLGALI.md). Peças puras, sem Next:
// PKCE (verificador e desafio S256), estado, lacre do cookie (AES-256-GCM), a URL de início, a troca e a renovação das fichas,
// e a conferência da assinatura das chamadas da Central de Contas. Nenhum segredo mora no código: tudo vem do ambiente.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const COOKIE_SESSAO = 'folgali_sessao'
/** Quanto vive o cookie: o bastante para a família de fichas da Rovemark (30 dias sem uso). */
export const VIDA_DO_COOKIE_S = 30 * 24 * 3600
/** Quanto vale o pedido de login guardado no cookie (o pedido da Rovemark vale 10 minutos). */
export const VIDA_DO_PEDIDO_MS = 10 * 60_000
/** Diferença máxima de relógio aceita na assinatura da Central. */
export const TOLERANCIA_ASSINATURA_S = 300

type Ambiente = Readonly<Record<string, string | undefined>>

export interface ConfigLogin {
  /** base da API pública da Rovemark, sem barra no fim */
  api: string
  /** a volta registrada na Rovemark */
  volta: string
  /** segredo do lacre do cookie e do cofre das fichas (32+ caracteres) */
  segredo: string
}

const httpsOuLocal = (bruto: string | undefined): string | null => {
  if (!bruto) return null
  try {
    const u = new URL(bruto.trim())
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    return u.protocol === 'https:' || (local && u.protocol === 'http:') ? u.toString().replace(/\/$/, '') : null
  } catch {
    return null
  }
}

/**
 * A configuração do login, ou `null` quando falta algo (o botão aparece "em breve"). Variáveis:
 * `FOLGALI_SESSAO_SEGREDO` (32+ caracteres), `FOLGALI_ROVEMARK_API` (padrão https://api.rovemark.co) e
 * `FOLGALI_ROVEMARK_VOLTA` (padrão https://folgali.com/api/auth/rovemark/callback).
 */
export function configLogin(env: Ambiente = process.env): ConfigLogin | null {
  const segredo = env.FOLGALI_SESSAO_SEGREDO ?? ''
  if (segredo.length < 32) return null
  const api = httpsOuLocal(env.FOLGALI_ROVEMARK_API ?? 'https://api.rovemark.co')
  const volta = httpsOuLocal(env.FOLGALI_ROVEMARK_VOLTA ?? 'https://folgali.com/api/auth/rovemark/callback')
  if (!api || !volta) return null
  return { api, volta, segredo }
}

const b64url = (b: Buffer) => b.toString('base64url')

/** Verificador PKCE: 64 caracteres de [A-Za-z0-9_-], dentro dos 43 a 128 que a Rovemark aceita. */
export const novoVerificador = () => b64url(randomBytes(48))
/** Estado: 32 caracteres de [A-Za-z0-9_-]. */
export const novoEstado = () => b64url(randomBytes(24))
/** Desafio S256: base64url(sha256(verificador)), 43 caracteres. */
export const desafioS256 = (verificador: string) => b64url(createHash('sha256').update(verificador).digest())

export const ESTADO_RE = /^[A-Za-z0-9_-]{8,128}$/
export const CODIGO_RE = /^[A-Za-z0-9_-]{20,128}$/

/** O destino depois de entrar: só caminho do próprio site, com idioma. Qualquer outra coisa vira o feed. */
export function destinoSeguro(x: string | null | undefined, lang = 'pt'): string {
  if (x && /^\/[a-z]{2}(\/[A-Za-z0-9_\-/]*)?$/.test(x) && !x.startsWith('//')) return x
  return `/${lang}/linha`
}

/** URL de início do login na Rovemark. */
export function urlDeInicio(c: ConfigLogin, desafio: string, estado: string, criar: boolean): string {
  const u = new URL(`${c.api}/api/auth/oauth/rovemark/start`)
  u.searchParams.set('app', 'folgali')
  u.searchParams.set('volta', c.volta)
  u.searchParams.set('desafio', desafio)
  u.searchParams.set('estado', estado)
  if (criar) u.searchParams.set('tela', 'criar')
  return u.toString()
}

// ---- lacre (AES-256-GCM): o cookie e as fichas guardadas no servidor ----------------------------------------------

const chave = (segredo: string, uso: string) => createHash('sha256').update(`folgali:${uso}:${segredo}`).digest()

export function selar(dado: unknown, segredo: string, uso = 'cookie'): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chave(segredo, uso), iv)
  const corpo = Buffer.concat([c.update(JSON.stringify(dado), 'utf8'), c.final()])
  return b64url(Buffer.concat([iv, c.getAuthTag(), corpo]))
}

export function abrir<T>(selado: string | undefined | null, segredo: string, uso = 'cookie'): T | null {
  if (!selado || selado.length > 4096) return null
  try {
    const b = Buffer.from(selado, 'base64url')
    if (b.length < 29) return null
    const d = createDecipheriv('aes-256-gcm', chave(segredo, uso), b.subarray(0, 12))
    d.setAuthTag(b.subarray(12, 28))
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')) as T
  } catch {
    return null
  }
}

/** O que o cookie leva, sempre lacrado: o pedido de login em andamento e/ou a sessão (só o id; as fichas ficam no servidor). */
export interface ConteudoDoCookie {
  login?: { verificador: string; estado: string; destino: string; em: number }
  sid?: string
}

export const iguais = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

// ---- fichas ----------------------------------------------------------------------------------------------------------

export interface Fichas {
  access_token: string
  refresh_token: string
  expires_in: number
  pessoa: { id: string; nome: string }
}

export class ErroDeAcesso extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: string,
  ) {
    super(`rovemark ${status} ${codigo}`)
  }
}

const PESSOA_RE = /^p_[A-Za-z0-9_-]{4,80}$/

function fichasDe(x: unknown): Fichas {
  const o = (x ?? {}) as Record<string, unknown>
  const p = (o.pessoa ?? {}) as Record<string, unknown>
  const at = typeof o.access_token === 'string' && o.access_token.startsWith('rmapp_at_') ? o.access_token : null
  const rt = typeof o.refresh_token === 'string' && o.refresh_token.startsWith('rmapp_rt_') ? o.refresh_token : null
  const id = typeof p.id === 'string' && PESSOA_RE.test(p.id) ? p.id : null
  if (!at || !rt || !id) throw new ErroDeAcesso(502, 'resposta_invalida')
  const nome = typeof p.nome === 'string' ? p.nome.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) : ''
  const exp = typeof o.expires_in === 'number' && o.expires_in > 0 ? Math.min(o.expires_in, 3600) : 900
  return { access_token: at, refresh_token: rt, expires_in: exp, pessoa: { id, nome: nome || 'você' } }
}

type Busca = typeof fetch

async function postar(c: ConfigLogin, caminho: string, corpo: unknown, busca: Busca): Promise<unknown> {
  const r = await busca(`${c.api}${caminho}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(corpo),
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  })
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok) throw new ErroDeAcesso(r.status, typeof json.codigo === 'string' ? json.codigo : 'erro')
  return json
}

/** Troca o código da volta pelas fichas (servidor a servidor). */
export async function trocarCodigo(c: ConfigLogin, codigo: string, verificador: string, busca: Busca = fetch): Promise<Fichas> {
  return fichasDe(await postar(c, '/api/auth/app/exchange', { codigo, verificador }, busca))
}

/** Renova: a ficha antiga morre e vem um par novo. 401 quer dizer que a pessoa tirou o acesso (ou houve reuso). */
export async function renovar(c: ConfigLogin, refresh: string, busca: Busca = fetch): Promise<Fichas> {
  return fichasDe(await postar(c, '/api/auth/app/refresh', { refresh_token: refresh }, busca))
}

/** Sair: a Rovemark derruba a família inteira. Sempre responde 200; falha de rede não impede apagar a sessão daqui. */
export async function revogar(c: ConfigLogin, ficha: string, busca: Busca = fetch): Promise<void> {
  await postar(c, '/api/auth/app/revoke', { token: ficha }, busca).catch(() => undefined)
}

// ---- assinatura da Central de Contas ---------------------------------------------------------------------------------

/** `RVM_FOLGALI_SEGREDO` (32+ caracteres), o mesmo da API da Rovemark. Sem ele, as rotas da Central respondem 503. */
export function segredoDaCentral(env: Ambiente = process.env): string | null {
  const s = env.RVM_FOLGALI_SEGREDO ?? ''
  return s.length >= 32 ? s : null
}

/** `t=<unix s>,v1=<hex HMAC-SHA256(segredo, "<t>.<corpo cru>")>`, comparado em tempo constante, com no máximo 5 minutos de diferença. */
export function assinaturaValida(cabecalho: string | null, corpoCru: string, segredo: string, agoraS = Math.floor(Date.now() / 1000)): boolean {
  if (!cabecalho || cabecalho.length > 512) return false
  const partes = Object.fromEntries(cabecalho.split(',').map((p) => p.trim().split('=', 2) as [string, string]))
  const t = Number(partes.t)
  const v1 = partes.v1
  if (!Number.isInteger(t) || !v1 || !/^[0-9a-f]{64}$/.test(v1)) return false
  if (Math.abs(agoraS - t) > TOLERANCIA_ASSINATURA_S) return false
  const esperado = createHmac('sha256', segredo).update(`${t}.${corpoCru}`).digest('hex')
  return iguais(esperado, v1)
}

export const ID_LIGADO_RE = /^[A-Za-z0-9_.:-]{1,80}$/
export const ehPessoa = (x: unknown): x is string => typeof x === 'string' && PESSOA_RE.test(x)
