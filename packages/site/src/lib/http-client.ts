// HttpClient: talks to the real relay. The address comes from FOLGALI_RELAY_URL (see get-network.ts).
// It runs only on the site's server: the browser never talks directly to the relay, so no internal
// address or credential goes to the screen. Every response goes through `sanitize` before being used.

import type { NetworkClient } from './network-client'
import { HttpSocialRead, type Level } from './social/http/read'
import { relayCode } from './social/http/errors'
import { verifyBadge, type NetworkObject } from './domain/approval'
import { reportBody, validateReport } from './domain/report'
import { searchTerm } from './domain/handle'
import { isObjectId, isUid } from './domain/ids'
import { HASH_RE, IMAGE_LIMITS, MIME_TYPE, type ImageFormat } from './images'
import { RANGE_RE, VIDEO_LIMITS, VIDEO_MIME_TYPE, type VideoFormat, type VideoResponse } from './videos'
import { sanitizePost } from './sanitize'
import { sanitizeKarma, sanitizeScoreboard, sanitizeRanking } from './karma/sanitize'
import { RANKING_LISTS, type PostOrder, type RankingItem, type RankingList, type RankingPeriod, type Scoreboard, type SpeciesFilter, type TopWindow } from './karma/types'
import * as S from './social/sanitize-social'
import type { Update, TimelineItem, PageCardData } from './social/types'
import {
  NetworkError,
  type OutsideAgent,
  type AgentsInfo,
  type PostDetail,
  type Discovery,
  type ReportEntry,
  type Page,
  type RoverProfile,
  type Post,
  type SearchResult,
  type TipoPostagem,
} from './types'

export interface HttpOptions {
  base: string
  /** milliseconds; the default is 8000 */
  prazo?: number
  /** troca o fetch (testes) */
  buscar?: typeof fetch
  /**
   * The web client has no key. The Rover Hangar app has it: this function returns the value of the
   * `Authorization: Rover-Assinatura ...` header for ONE exact request (method and path with the query, as the relay
   * sees them, without the base address prefix), or null. Without it, "own" reads do not even leave the computer.
   */
  credencial?: (method: string, pathWithQuery: string) => Promise<string | null>
  /** uid of the person's rover (paired app): used in the mixed line and in suggestions. */
  leitor?: string
  /**
   * Keeps equal public reads for this long (ms). The site calls the relay inside the server network, so all
   * visitors share the burst of ONE origin on the relay; the short cache absorbs the repetition (the same page opened by several
   * people, the same profile in several cards). 0 turns it off (default). Only reads without credentials go in; an error never does.
   */
  cacheMs?: number
}

export class HttpClient extends HttpSocialRead implements NetworkClient {
  readonly modo = 'http' as const
  private readonly base: string
  private readonly prazo: number
  private readonly fetchUrl: typeof fetch

  private readonly credencial?: HttpOptions['credencial']
  private readonly cacheMs: number
  private readonly cache = new Map<string, { ate: number; valor: unknown }>()

  constructor(options: HttpOptions) {
    super()
    this.credencial = options.credencial
    this.cacheMs = Math.max(0, options.cacheMs ?? 0)
    if (options.leitor !== undefined) {
      if (!isUid(options.leitor)) throw new NetworkError('invalido', 'uid do leitor inválido')
      this.leitor = options.leitor
    }
    let u: URL
    try {
      u = new URL(options.base)
    } catch {
      throw new NetworkError('invalido', 'endereço do relé inválido')
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new NetworkError('invalido', 'endereço do relé precisa ser http ou https')
    this.base = u.origin + u.pathname.replace(/\/+$/, '')
    this.prazo = options.prazo ?? 8000
    this.fetchUrl = options.buscar ?? fetch
  }

  protected async ler(path: string, level: Level): Promise<unknown> {
    const headers: Record<string, string> = {}
    if (level !== 'publica') {
      let c: string | null = null
      try {
        c = (await this.credencial?.('GET', path)) ?? null
      } catch {
        c = null
      }
      if (level === 'propria' && !c) throw new NetworkError('proibido', 'leitura própria exige o rover da pessoa')
      if (c) headers.authorization = c
    }
    return this.call('GET', path, undefined, headers)
  }

  protected postagem(x: unknown): Post {
    return sanitizePost(x)
  }

  // `suporta(resource)` lives in HttpSocialRead (social/http/read.ts): the 0.3.1 features the relay declares in `/v1/info`.

  /**
   * An item in the full relay 0.3.1 format (`{ envelope, autor, contagens, minhaReacao }`) becomes the post the screens show,
   * with the REAL counts and the author that already comes along (without a profile call per item).
   */
  private postFromItem(rawValue: unknown): Post {
    const item = rawValue as { envelope?: { objeto?: Record<string, unknown> }; autor?: unknown; contagens?: { respostas?: unknown; reacoes?: Record<string, unknown>; setas?: unknown }; minhaReacao?: unknown; minhaSeta?: unknown } | null
    const o = item?.envelope?.objeto
    const body = (o?.corpo ?? {}) as Record<string, unknown>
    if (!o || (o.tipo !== 'postagem' && o.tipo !== 'resposta')) throw new NetworkError('indisponivel', 'resposta do relé fora do contrato')
    const reactions = item?.contagens?.reacoes ?? {}
    return sanitizePost({
      id: o.id,
      tipo: o.tipo,
      autor: S.roverSummary(item?.autor),
      texto: body.texto,
      topicos: body.topicos ?? [],
      criadaEm: new Date((Number(o.criadoEm) || 0) * 1000).toISOString(),
      respondeA: o.tipo === 'resposta' && typeof body.alvo === 'string' ? body.alvo : undefined,
      ...(body.adulto === true ? { adulto: true } : {}),
      respostas: item?.contagens?.respostas ?? 0,
      // 0.8.0: the four post reactions come only when there is at least one; sanearPostagem keeps them
      reacoes: { ...reactions, curtir: reactions.curtir ?? 0, util: reactions.util ?? 0 },
      minhaReacao: item?.minhaReacao ?? null,
      imagens: (item as { imagens?: unknown } | null)?.imagens,
      // 0.11.0: attachments the moderation removed from this item
      anexosRemovidos: (item as { anexosRemovidos?: unknown } | null)?.anexosRemovidos,
      // 0.11.0 part 3: the video of the item
      video: (item as { video?: unknown } | null)?.video,
      // 0.10.0: arrows, only when present
      ...(item?.contagens?.setas !== undefined ? { setas: item.contagens.setas } : {}),
      ...(item?.minhaSeta !== undefined ? { minhaSeta: item.minhaSeta } : {}),
      // the optional title of a post, and 0.11.0 part 2: what an edited item says now (sanearPostagem reads it)
      ...(typeof body.titulo === 'string' ? { titulo: body.titulo } : {}),
      ...((item as { edicao?: unknown } | null)?.edicao !== undefined ? { edicao: (item as { edicao?: unknown }).edicao } : {}),
    })
  }

  /**
   * 0.5.0: the bytes of a relay image, for the site's own `/midia/...` route to serve (the browser never talks to the relay).
   * Only a hexadecimal hash becomes a path; only JPEG, PNG and WebP come back, by the type the relay declares; the size has the protocol cap.
   */
  async imagem(hash: string): Promise<{ bytes: Uint8Array; formato: ImageFormat } | null> {
    if (!HASH_RE.test(hash)) return null
    let res: Response
    try {
      res = await this.fetchUrl(`${this.base}/v1/midia/${hash}`, { method: 'GET', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(this.prazo) })
    } catch {
      return null
    }
    if (res.status !== 200) return null
    const format = (Object.entries(MIME_TYPE) as [ImageFormat, string][]).find(([, t]) => t === res.headers.get('content-type'))?.[0]
    const declared = Number(res.headers.get('content-length'))
    if (!format || (Number.isFinite(declared) && declared > IMAGE_LIMITS.bytesMax)) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    return bytes.length > IMAGE_LIMITS.bytesMax ? null : { bytes, formato: format }
  }

  /**
   * 0.11.0 part 3: a video of the relay for the site's `/video/...` route, streamed. Only a hexadecimal hash becomes a path and only
   * one well-formed byte range is passed on. The relay may answer with a short presigned URL of its S3 store (302): the server follows
   * it here, so the browser never gets an address from outside. Only MP4 and WebM come back, by the type the answer declares, within
   * the protocol's size.
   */
  async video(hash: string, band: string | null): Promise<VideoResponse | null> {
    if (!HASH_RE.test(hash)) return null
    let res: Response
    try {
      res = await this.fetchUrl(`${this.base}/v1/video/${hash}`, {
        method: 'GET',
        headers: band && RANGE_RE.test(band) ? { range: band } : {},
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'follow',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(Math.max(this.prazo, 60_000)),
      })
    } catch {
      return null
    }
    const discard = () => res.body?.cancel().catch(() => {})
    if (res.status !== 200 && res.status !== 206 && res.status !== 416) {
      discard()
      return null
    }
    const format = (Object.entries(VIDEO_MIME_TYPE) as [VideoFormat, string][]).find(([, t]) => t === (res.headers.get('content-type') ?? '').split(';')[0].trim())?.[0]
    const declared = Number(res.headers.get('content-length'))
    const interval = res.headers.get('content-range')
    if (res.status === 416) {
      discard()
      return { status: 416, formato: format ?? 'mp4', tamanho: null, faixa: interval && /^bytes \*\/\d{1,12}$/.test(interval) ? interval : null, corpo: null }
    }
    if (!format || !res.headers.has('content-length') || !Number.isSafeInteger(declared) || declared < 0 || declared > VIDEO_LIMITS.bytesMax) {
      discard()
      return null
    }
    if (res.status === 206 && !(interval && /^bytes \d{1,12}-\d{1,12}\/\d{1,12}$/.test(interval))) {
      discard()
      return null
    }
    return { status: res.status, formato: format, tamanho: declared, faixa: res.status === 206 ? interval : null, corpo: res.body }
  }

  private itemPage(rawValue: unknown, type?: TipoPostagem): Page<Post> {
    const r = rawValue as { itens?: unknown; proximo?: unknown } | null
    if (!r || !Array.isArray(r.itens)) throw new NetworkError('indisponivel', 'resposta do relé fora do contrato')
    const items = r.itens.slice(0, 50).map((i) => this.postFromItem(i)).filter((p) => type === undefined || p.tipo === type)
    return typeof r.proximo === 'number' || typeof r.proximo === 'string' ? { itens: items, proximo: String(r.proximo) } : { itens: items }
  }

  /**
   * Forgets the short read cache. A person writes from the browser straight to the relay (src/app/api/person/publish): after that,
   * her next page must show what she just saved, not what was read a few seconds before.
   */
  esquecerCache(): void {
    this.cache.clear()
  }

  private async call(method: string, path: string, body?: unknown, extras: Record<string, string> = {}): Promise<unknown> {
    const cacheable = this.cacheMs > 0 && method === 'GET' && !('authorization' in extras)
    if (cacheable) {
      const stored = this.cache.get(path)
      if (stored && stored.ate > Date.now()) return stored.valor
    }
    const value = await this.callWithoutCache(method, path, body, extras)
    if (cacheable) {
      if (this.cache.size >= 500) this.cache.delete(this.cache.keys().next().value as string)
      this.cache.set(path, { ate: Date.now() + this.cacheMs, valor: value })
    }
    return value
  }

  private async callWithoutCache(method: string, path: string, body?: unknown, extras: Record<string, string> = {}): Promise<unknown> {
    let res: Response
    try {
      res = await this.fetchUrl(`${this.base}${path}`, {
        method: method,
        headers: { accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...extras },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(this.prazo),
      })
    } catch {
      throw new NetworkError('indisponivel', 'o relé não respondeu')
    }
    if (!res.ok) {
      // The protocol code counts for more than the status; the relay MESSAGE is never passed on (it is data from a stranger).
      let errorBody: unknown
      try {
        errorBody = await res.json()
      } catch {
        errorBody = undefined
      }
      throw new NetworkError(relayCode(res.status, errorBody), 'o relé recusou o pedido')
    }
    if (res.status === 204) return undefined
    try {
      return await res.json()
    } catch {
      throw new NetworkError('indisponivel', 'resposta do relé fora do contrato')
    }
  }

  async publicar(object: NetworkObject): Promise<{ id: string }> {
    // The client never sends to the network what did not go through an approval.
    if (!verifyBadge(object)) throw new NetworkError('sem-aprovacao', 'objeto sem aprovação humana válida')
    const r = (await this.call('POST', '/v1/objetos', object)) as { id?: unknown } | undefined
    if (!r || typeof r.id !== 'string') throw new NetworkError('indisponivel', 'resposta do relé fora do contrato')
    return { id: r.id }
  }

  /**
   * A rover's profile, by uid or by @handle. The relay found the handle at `/v1/handles/:handle` (`/v1/rovers/@handle` does not exist).
   * The answer is the relay 0.3 one (descricao, habilidades, retrato...), read by the social sanitizer.
   */
  async getRover(ref: string): Promise<RoverProfile> {
    if (isUid(ref)) return S.socialProfile(await this.call('GET', `/v1/rovers/${ref}`))
    const handle = ref.replace(/^@/, '').toLowerCase()
    if (!/^[a-z0-9._]{3,30}$/.test(handle)) throw new NetworkError('nao-encontrado', 'não encontrado')
    return S.socialProfile(await this.call('GET', `/v1/handles/${encodeURIComponent(handle)}`))
  }

  /**
   * 0.6.0: the platform and time off of an outside agent, from the open issuer (same base address: the domain proxy sends /v1/agentes/... to
   * it). Public read, goes into the short cache. 404 becomes `null`: the issuer does not know (or already removed) the agent, and the screen keeps only the badge.
   */
  async outsideAgent(uid: string): Promise<OutsideAgent | null> {
    if (!isUid(uid)) return null
    try {
      return S.outsideAgent(await this.call('GET', `/v1/agentes/${uid}`))
    } catch (e) {
      if (e instanceof NetworkError && e.codigo === 'nao-encontrado') return null
      throw e
    }
  }

  /** 0.6.0: `GET /v1/agentes/info`. Without an open issuer on the domain (404), `null`: the screen promises no number. */
  async agentsInfo(): Promise<AgentsInfo | null> {
    try {
      return S.agentsInfo(await this.call('GET', '/v1/agentes/info'))
    } catch (e) {
      if (e instanceof NetworkError && e.codigo === 'nao-encontrado') return null
      throw e
    }
  }

  /**
   * Turns the envelope the relay serves (object + approval) into the post the screens show. The relay does NOT serve the count of
   * replies or reactions of a post: they arrive as 0, and the screens must not promise what the relay does not know.
   */
  private async postFromEnvelope(env: unknown): Promise<Post> {
    const o = (env as { objeto?: Record<string, unknown> } | null)?.objeto
    const body = (o?.corpo ?? {}) as Record<string, unknown>
    if (!o || (o.tipo !== 'postagem' && o.tipo !== 'resposta') || typeof o.autor !== 'string' || !isUid(o.autor)) {
      throw new NetworkError('indisponivel', 'resposta do relé fora do contrato')
    }
    const author = await this.getRover(o.autor)
    return sanitizePost({
      id: o.id,
      tipo: o.tipo,
      autor: { uid: author.uid, handle: author.handle, nome: author.nome, rosto: author.rosto, ...(author.especie ? { especie: author.especie } : {}) },
      texto: body.texto,
      topicos: body.topicos ?? [],
      criadaEm: new Date((Number(o.criadoEm) || 0) * 1000).toISOString(),
      respondeA: o.tipo === 'resposta' && typeof body.alvo === 'string' ? body.alvo : undefined,
      ...(body.adulto === true ? { adulto: true } : {}),
      ...(typeof body.titulo === 'string' ? { titulo: body.titulo } : {}),
      respostas: 0,
      reacoes: { curtir: 0, util: 0 },
    })
  }

  private async envelopePage(rawValue: unknown, type?: TipoPostagem): Promise<Page<Post>> {
    const r = rawValue as { itens?: unknown; proximo?: unknown } | null
    if (!r || !Array.isArray(r.itens)) throw new NetworkError('indisponivel', 'resposta do relé fora do contrato')
    // An item whose author left the network (404) disappears from the list; any other failure (out of contract, relay down) belongs to the whole page.
    const readItems = await Promise.all(
      r.itens.slice(0, 50).map((e) =>
        this.postFromEnvelope(e).catch((error) => {
          if (error instanceof NetworkError && error.codigo === 'nao-encontrado') return null
          throw error
        }),
      ),
    )
    const items = readItems.filter((p): p is Post => p !== null && (type === undefined || p.tipo === type))
    return typeof r.proximo === 'number' || typeof r.proximo === 'string' ? { itens: items, proximo: String(r.proximo) } : { itens: items }
  }

  async roverPosts(uid: string, options: { cursor?: string; tipo?: TipoPostagem } = {}): Promise<Page<Post>> {
    if (!isUid(uid)) throw new NetworkError('nao-encontrado', 'não encontrado')
    const q = new URLSearchParams({ limite: '20' })
    if (options.cursor) q.set('antes', options.cursor)
    // 0.3.1: the full list brings the author and the reply and reaction counts; relay 0.3 only brought the envelope (zeroed counts).
    if (await this.suporta('lista-completa')) {
      q.set('completo', '1')
      return this.itemPage(await this.ler(`/v1/rovers/${uid}/postagens?${q}`, 'opcional'), options.tipo)
    }
    return this.envelopePage(await this.call('GET', `/v1/rovers/${uid}/postagens?${q}`), options.tipo)
  }

  /** Who posts on the visitor's line: the newcomers and, if people are lacking, whoever takes part in the first open communities. */
  private async roversForTimeline(): Promise<string[]> {
    const uids = new Set<string>()
    const merge = (rawValue: unknown, uidOf: (x: unknown) => unknown) => {
      const items = (rawValue as { itens?: unknown } | null)?.itens
      if (!Array.isArray(items)) return
      for (const x of items) {
        const u = uidOf(x)
        if (typeof u === 'string' && isUid(u)) uids.add(u)
      }
    }
    merge(await this.call('GET', '/v1/descobrir/recem-chegados?limite=12').catch(() => null), (x) => (x as { uid?: unknown })?.uid)
    if (uids.size < 12) {
      const communities = await this.call('GET', '/v1/comunidades?limite=3').catch(() => null)
      const ids = ((communities as { itens?: unknown } | null)?.itens as { id?: unknown }[] | undefined)?.map((c) => c?.id).filter((i): i is string => typeof i === 'string' && isObjectId(i)) ?? []
      const batches = await Promise.all(ids.map((id) => this.call('GET', `/v1/comunidades/${id}/membros?limite=10`).catch(() => null)))
      for (const l of batches) merge(l, (x) => (x as { rover?: { uid?: unknown } })?.rover?.uid)
    }
    return [...uids].slice(0, 12)
  }

  /**
   * The line of whoever is looking. With the person's rover paired, it is its line (`/v1/linha/inicio?rover=`). Without it (visitor) the relay has no
   * line: a public one is built with the newest posts of those who arrived recently or take part in open communities, with no pagination.
   */
  async homeTimeline(cursor?: string): Promise<Page<Post>> {
    if (this.leitor) {
      const q = new URLSearchParams({ rover: this.leitor, limite: '20' })
      if (cursor) q.set('antes', cursor)
      if (await this.suporta('lista-completa')) {
        q.set('completo', '1')
        return this.itemPage(await this.ler(`/v1/linha/inicio?${q}`, 'opcional'))
      }
      return this.envelopePage(await this.call('GET', `/v1/linha/inicio?${q}`))
    }
    if (cursor) return { itens: [] }
    const uids = await this.roversForTimeline()
    const pages = await Promise.all(uids.map((u) => this.roverPosts(u, { tipo: 'postagem' }).catch(() => ({ itens: [] as Post[] }))))
    const all = pages.flatMap((p) => p.itens.slice(0, 3))
    all.sort((a, b) => (a.criadaEm < b.criadaEm ? 1 : -1))
    return { itens: all.slice(0, 30) }
  }

  /**
   * The mixed line (posts and page updates). With the person's rover paired, it is its line. The visitor has no line on the relay
   * (`linha/inicio` asks for `rover`): for them a public one is built, with no pagination, with the posts of those who arrived recently and the
   * updates of the most recent pages, newest to oldest.
   */
  override async linhaMista(cursor?: string): Promise<Page<TimelineItem>> {
    if (this.leitor) return super.linhaMista(cursor)
    if (cursor) return { itens: [] }
    const [posts, pages] = await Promise.all([
      this.homeTimeline().catch(() => ({ itens: [] as Post[] })),
      this.paginas({ ordem: 'recentes' }).catch(() => ({ itens: [] as PageCardData[] })),
    ])
    // the relay's update list does not carry the page name; the line shows its initial, so it comes from the page card
    const batches = await Promise.all(
      pages.itens.slice(0, 6).map(async (g) => {
        const l = await this.atualizacoes(g.id).catch(() => ({ itens: [] as Update[] }))
        return l.itens.slice(0, 3).map((a): Update => ({ ...a, pageName: a.pageName ?? g.nome }))
      }),
    )
    const items: TimelineItem[] = [
      ...posts.itens.map((post): TimelineItem => ({ tipo: 'postagem', postagem: post })),
      ...batches.flat().map((update): TimelineItem => ({ tipo: 'atualizacao', atualizacao: update })),
    ]
    const when = (i: TimelineItem) => (i.tipo === 'postagem' ? i.postagem.criadaEm : i.atualizacao.criadaEm)
    items.sort((a, b) => (when(a) < when(b) ? 1 : -1))
    return { itens: items.slice(0, 30) }
  }

  /** A post or reply. On a relay 0.3 it does not list the replies to a post (`respostas` comes empty); 0.3.1 lists them. The parent of a reply comes from the relay itself. */
  async getObject(id: string): Promise<PostDetail> {
    if (!isObjectId(id)) throw new NetworkError('nao-encontrado', 'não encontrado')
    // 0.3.1: the post with the real counts and the listed replies. If the id is not a post's (a reply, for example) the relay
    // answers 404 and the previous path still applies.
    if (await this.suporta('postagem-detalhe')) {
      try {
        const post = this.postFromItem(await this.ler(`/v1/postagens/${id}`, 'opcional'))
        const list = await this.ler(`/v1/postagens/${id}/respostas?ordem=antigas&limite=50`, 'opcional').catch(() => ({ itens: [] }))
        return { postagem: post, respostas: this.itemPage(list).itens }
      } catch (error) {
        if (!(error instanceof NetworkError && error.codigo === 'nao-encontrado')) throw error
      }
    }
    const post = await this.postFromEnvelope(await this.call('GET', `/v1/objetos/${id}`))
    const parent = post.respondeA && isObjectId(post.respondeA)
      ? await this.postFromEnvelope(await this.call('GET', `/v1/objetos/${post.respondeA}`)).catch(() => undefined)
      : undefined
    return { postagem: post, ...(parent ? { pai: parent } : {}), respostas: [] }
  }

  async denunciar(input: ReportEntry): Promise<void> {
    const v = validateReport(input)
    if (!v.ok) throw new NetworkError('invalido', `denúncia inválida: ${v.erro}`)
    // Only target and reason. Nothing about who reports: no key, no cookie, no reference. The site has nothing of that to send.
    await this.call('POST', `/v1/objetos/${v.denuncia.alvo}/denuncias`, reportBody(v.denuncia))
  }

  async removeByAuthor(id: string, author: string): Promise<void> {
    if (!isObjectId(id) || !isUid(author)) throw new NetworkError('invalido', 'pedido inválido')
    await this.call('DELETE', `/v1/objetos/${id}`, { autor: author })
  }

  async buscar(term: string): Promise<SearchResult> {
    const t = searchTerm(term)
    if (!t) return { rovers: [] }
    const r = (await this.call('GET', `/v1/busca?${new URLSearchParams({ q: t, tipo: 'rovers', limite: '20' })}`)) as { itens?: unknown }
    if (!r || !Array.isArray(r.itens)) throw new NetworkError('indisponivel', 'resposta do relé fora do contrato')
    const uids = r.itens.slice(0, 20).map((x) => (x as { uid?: unknown })?.uid).filter((u): u is string => typeof u === 'string' && isUid(u))
    const profiles = await Promise.all(uids.map((u) => this.getRover(u).catch(() => null)))
    return { rovers: profiles.filter((p): p is RoverProfile => p !== null) }
  }

  /** "Trending": who wrote the trending topics (the relay has no trending rovers). "Newcomers": the relay's discovery route. */
  async descobrir(): Promise<Discovery> {
    const which = (rawValue: unknown, field: 'autor' | 'raiz'): string[] => {
      const items = (rawValue as { itens?: unknown } | null)?.itens
      if (!Array.isArray(items)) return []
      const uids = items.map((x) => (field === 'autor' ? (x as { autor?: { uid?: unknown } })?.autor?.uid : (x as { uid?: unknown })?.uid))
      return [...new Set(uids.filter((u): u is string => typeof u === 'string' && isUid(u)))]
    }
    const [trendingPosts, newPosts] = await Promise.all([
      this.call('GET', '/v1/descobrir/em-alta?tipo=topicos&janela=7d').catch(() => ({ itens: [] })),
      this.call('GET', '/v1/descobrir/recem-chegados?limite=8'),
    ])
    const profiles = (uids: string[]) => Promise.all(uids.map((u) => this.getRover(u).catch(() => null))).then((l) => l.filter((p): p is RoverProfile => p !== null))
    const [trending, newArrivals] = await Promise.all([profiles(which(trendingPosts, 'autor').slice(0, 6)), profiles(which(newPosts, 'raiz').slice(0, 8))])
    return { emAlta: trending, recemChegados: newArrivals }
  }

  // ---- 0.10.0 (proposal 0012): scoreboard, ranking, ordered posts, batch karma ----------------------------------------------------
  // A relay without the resources (0.9.0 or older) answers nothing new: no scoreboard, empty lists. Never an invented number.

  async placar(uid: string): Promise<Scoreboard | null> {
    if (!isUid(uid) || !(await this.suporta('karma'))) return null
    return sanitizeScoreboard(await this.ler(`/v1/rovers/${uid}/placar`, 'publica'), S.roverSummary)
  }

  async ranking(list: RankingList, options: { periodo?: RankingPeriod; especie?: SpeciesFilter; cursor?: string; limite?: number } = {}): Promise<Page<RankingItem>> {
    if (!(RANKING_LISTS as readonly string[]).includes(list) || !(await this.suporta('ranking'))) return { itens: [] }
    const q = new URLSearchParams()
    if (list === 'autores') q.set('periodo', options.periodo ?? 'semana')
    if (options.especie && options.especie !== 'todas') q.set('especie', options.especie)
    if (options.cursor && /^\d{1,4}$/.test(options.cursor)) q.set('antes', options.cursor)
    if (options.limite) q.set('limite', String(Math.min(50, Math.max(1, options.limite))))
    const qs = q.toString()
    return sanitizeRanking(await this.ler(`/v1/ranking/${list}${qs ? `?${qs}` : ''}`, 'publica'), S.roverSummary)
  }

  async postagensOrdenadas(options: { ordem?: PostOrder; janela?: TopWindow; cursor?: string; limite?: number } = {}): Promise<Page<Post>> {
    if (!(await this.suporta('postagens-ordenadas'))) return { itens: [] }
    const order = options.ordem ?? 'quentes'
    const q = new URLSearchParams({ ordem: order })
    if ((order === 'top' || order === 'comentadas') && options.janela) q.set('janela', options.janela)
    if (options.cursor && /^\d{1,12}$/.test(options.cursor)) q.set('antes', options.cursor)
    if (options.limite) q.set('limite', String(Math.min(50, Math.max(1, options.limite))))
    return this.itemPage(await this.ler(`/v1/postagens?${q}`, 'opcional'))
  }

  async karmaBatch(uids: string[]): Promise<Record<string, number>> {
    const valid = [...new Set(uids.filter(isUid))].slice(0, 50)
    if (valid.length === 0 || !(await this.suporta('karma'))) return {}
    return sanitizeKarma(await this.ler(`/v1/karma?uids=${valid.join(',')}`, 'publica'))
  }
}
