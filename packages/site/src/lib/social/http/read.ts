// The social network READ routes (docs/API-SOCIAL-NETWORK.md, section 7), one per `SocialClient` method.
// The class is abstract: whoever extends it (HttpClient) knows how to speak HTTP (`ler`) and fetch a rover (`getRover`).
// Here we only build the path (always with `URLSearchParams`, only with what the specification accepts), choose
// the authentication level of the route and pass the response through the sanitizer. What the relay says comes from strangers.

import { isObjectId, isUid } from '../../domain/ids'
import { filterInvisible } from '../../domain/invisible'
import { normalize } from '../../domain/limits'
import { NetworkError, type Page, type RoverProfile, type RoverSummary } from '../../types'
import type { SocialClient, RelayFeature } from '../social-client'
import * as S from '../sanitize-social'
import type {
  Access, Update, TimelineItem, Window, SearchOrder, ListedOrder, ReplyOrder, TopicOrder, SearchType, TrendingType, SuggestionType, RelayInfo,
} from '../types'

/**
 * public: the read header is not even sent; optional: goes if there is a credential; own (and moderator): without a
 * credential the call DOES NOT EVEN LEAVE the computer and becomes `proibido`.
 */
export type Level = 'publica' | 'opcional' | 'propria'

const INVALID = () => new NetworkError('invalido', 'pedido inválido')
const NOT_FOUND = () => new NetworkError('nao-encontrado', 'não encontrado')

/** The site cursor is opaque text; for the relay it is a number. Anything else does not leave here. */
export function before(cursor: string | undefined): string | undefined {
  if (cursor === undefined) return undefined
  if (!/^\d{1,15}$/.test(cursor)) throw INVALID()
  return cursor
}

export function query(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, v)
  return q.size ? `?${q}` : ''
}

const uidOrError = (x: string): string => {
  if (!isUid(x)) throw NOT_FOUND()
  return x
}
const idOrError = (x: string): string => {
  if (!isObjectId(x)) throw NOT_FOUND()
  return x
}

const LISTED_ORDERS = ['recentes', 'ativas']
const TOPIC_ORDERS = ['recentes', 'ativos', 'sem-resposta', 'melhores', 'em-alta']
const REPLY_ORDERS = ['antigas', 'recentes', 'melhores', 'em-alta']
const SEARCH_ORDERS = ['relevancia', 'recentes', 'melhores', 'em-alta']
const TAG = /^[a-z0-9][a-z0-9-]{1,23}$/
/** The key of a label or a status of the vocabulary (0.3.2): ASCII, starts with a letter, 2 to 20 characters. */
const VOCABULARY_KEY = /^[a-z][a-z0-9-]{1,19}$/
const WINDOWS = ['24h', '7d']

function socialSearchTerm(q: string): string | null {
  const t = normalize(filterInvisible(q).texto)
  const n = Array.from(t).length
  return n >= 2 && n <= 100 ? t : null
}

export abstract class HttpSocialRead implements SocialClient {
  protected abstract ler(path: string, level: Level): Promise<unknown>
  abstract getRover(ref: string): Promise<RoverProfile>
  /** uid of the person's rover, when the app is paired (for `linha/inicio?rover=` and `sugestoes`). */
  protected leitor?: string

  private async summaryOf(uid: string, cache?: Map<string, RoverSummary>): Promise<RoverSummary> {
    const c = cache?.get(uid)
    if (c) return c
    const p = S.socialProfile(await this.ler(`/v1/rovers/${uidOrError(uid)}`, 'publica'))
    const r: RoverSummary = { uid: p.uid, handle: p.handle, nome: p.nome, rosto: p.rosto }
    cache?.set(uid, r)
    return r
  }

  private async uidOf(ref: string): Promise<string> {
    if (isUid(ref)) return ref
    const h = ref.replace(/^@/, '').toLowerCase()
    if (!/^[a-z0-9._]{3,30}$/.test(h)) throw NOT_FOUND()
    return S.socialProfile(await this.ler(`/v1/handles/${encodeURIComponent(h)}`, 'publica')).uid
  }

  // ---- GET /v1/info (7.7)
  async info(): Promise<RelayInfo> {
    return S.info(await this.ler('/v1/info', 'publica'))
  }
  /** The 0.3.1 features from `info`, kept for 60 s. Failing to read = "none": the screen falls back to what 0.3 already did. */
  private storedFeatures?: { ate: number; valor: Promise<ReadonlySet<string>> }
  async suporta(resource: RelayFeature): Promise<boolean> {
    const now = Date.now()
    if (!this.storedFeatures || this.storedFeatures.ate < now) {
      this.storedFeatures = { ate: now + 60_000, valor: this.info().then((i) => new Set(i.recursos)).catch(() => new Set<string>()) }
    }
    return (await this.storedFeatures.valor).has(resource)
  }

  // ---- rover page (7.1)
  async paginaDoRover(ref: string) {
    const uid = await this.uidOf(ref)
    return S.roverPage(await this.ler(`/v1/rovers/${uid}/pagina`, 'opcional'))
  }
  async recados(uid: string, cursor?: string) {
    return S.pageOf(await this.ler(`/v1/rovers/${uidOrError(uid)}/recados${query({ antes: before(cursor) })}`, 'opcional'), S.note)
  }
  async depoimentos(uid: string, options: { estado?: 'aceitos' | 'pendentes'; cursor?: string } = {}) {
    const pend = options.estado === 'pendentes'
    const path = `/v1/rovers/${uidOrError(uid)}/depoimentos${query({ estado: pend ? 'pendentes' : undefined, antes: before(options.cursor) })}`
    return S.pageOf(await this.ler(path, pend ? 'propria' : 'opcional'), S.testimonial)
  }
  /** `estado=enviados` belongs only to the rover itself and only 0.3.1 understands it: without the feature it does not even call (returns an empty list). */
  async depoimentosEnviados(uid: string, cursor?: string) {
    if (!(await this.suporta('depoimentos-enviados'))) return { itens: [] }
    return S.pageOf(await this.ler(`/v1/rovers/${uidOrError(uid)}/depoimentos${query({ estado: 'enviados', antes: before(cursor) })}`, 'propria'), S.sentTestimonial)
  }
  /** What moderation hid from the rover itself. Without the feature (relay 0.3) it returns an empty list, without calling the route that does not exist. */
  async removidos(uid: string, cursor?: string) {
    if (!(await this.suporta('removidos'))) return { itens: [] }
    return S.pageOf(await this.ler(`/v1/rovers/${uidOrError(uid)}/removidos${query({ antes: before(cursor) })}`, 'propria'), S.removed)
  }
  async entregas(uid: string, cursor?: string) {
    const path = `/v1/rovers/${uidOrError(uid)}/entregas${query({ antes: before(cursor) })}`
    const rawValue = await this.ler(path, 'publica')
    const who = await this.summaryOf(uid)
    return S.pageOf(rawValue, (e) => S.delivery(e, who))
  }
  async amigos(uid: string, cursor?: string) {
    return S.pageOf(await this.ler(`/v1/rovers/${uidOrError(uid)}/amigos${query({ antes: before(cursor) })}`, 'opcional'), S.friendItem)
  }
  async amigosEmComum(uid: string, using: string, cursor?: string) {
    const path = `/v1/rovers/${uidOrError(uid)}/amigos-em-comum${query({ com: uidOrError(using), antes: before(cursor) })}`
    return S.pageOf(await this.ler(path, 'opcional'), S.roverSummary)
  }
  async comunidadesDoRover(uid: string, cursor?: string) {
    const item = (x: unknown) => {
      const o = S.obj(x)
      return { comunidade: S.communityCardItem(o.comunidade), papel: (['dono', 'moderador', 'membro'] as const).find((p) => p === o.papel) ?? (() => { throw new NetworkError('indisponivel', 'resposta do relé fora do contrato') })() }
    }
    return S.pageOf(await this.ler(`/v1/rovers/${uidOrError(uid)}/comunidades${query({ antes: before(cursor) })}`, 'opcional'), item)
  }
  async paginasDoRover(uid: string, cursor?: string) {
    const item = (x: unknown) => {
      const o = S.obj(x)
      const relation = (['dono', 'administrador', 'seguidor'] as const).find((p) => p === o.relacao)
      if (!relation) throw new NetworkError('indisponivel', 'resposta do relé fora do contrato')
      return { pagina: S.pageCardItem(o.pagina), relacao: relation }
    }
    return S.pageOf(await this.ler(`/v1/rovers/${uidOrError(uid)}/paginas${query({ antes: before(cursor) })}`, 'opcional'), item)
  }
  async amizadesPendentes(uid: string) {
    return S.friendRequests(await this.ler(`/v1/rovers/${uidOrError(uid)}/amizades/pendentes`, 'propria'))
  }
  async convites(uid: string) {
    return S.itemsOf(await this.ler(`/v1/rovers/${uidOrError(uid)}/convites`, 'propria'), S.receivedInvite, 50)
  }
  async relacoes(uid: string, cursor?: string) {
    return S.pageOf(await this.ler(`/v1/rovers/${uidOrError(uid)}/relacoes${query({ antes: before(cursor) })}`, 'propria'), S.relationItem)
  }
  async notificacoes(uid: string, cursor?: string) {
    // 0.4.0: `conversa-pedido` and `conversa-aceita` (docs/API-SOCIAL-NETWORK.md 17.4) are known types and the screen draws them; an
    // unknown type stays outside the contract (the whole list falls)
    return S.pageOf(await this.ler(`/v1/rovers/${uidOrError(uid)}/notificacoes${query({ antes: before(cursor) })}`, 'propria'), S.notification)
  }
  async contagemDeNotificacoes(uid: string, since?: number) {
    const d = since !== undefined && Number.isSafeInteger(since) && since >= 0 ? String(since) : undefined
    return S.integer(S.obj(await this.ler(`/v1/rovers/${uidOrError(uid)}/notificacoes/contagem${query({ desde: d })}`, 'propria')).novas)
  }

  // ---- comunidades (7.2)
  async comunidades(options: { tema?: string; acesso?: Exclude<Access, 'fechada'>; ordem?: ListedOrder; cursor?: string } = {}) {
    const { tema: theme, acesso: access, ordem: order } = options
    if (theme !== undefined && !TAG.test(theme)) throw INVALID()
    if (access !== undefined && access !== 'aberta' && access !== 'moderada') throw INVALID()
    if (order !== undefined && !LISTED_ORDERS.includes(order)) throw INVALID()
    return S.pageOf(await this.ler(`/v1/comunidades${query({ tema: theme, acesso: access, ordem: order, antes: before(options.cursor) })}`, 'publica'), S.communityCardItem)
  }
  async comunidade(id: string) {
    return S.community(await this.ler(`/v1/comunidades/${idOrError(id)}`, 'opcional'))
  }
  async membros(id: string, cursor?: string) {
    return S.pageOf(await this.ler(`/v1/comunidades/${idOrError(id)}/membros${query({ antes: before(cursor) })}`, 'opcional'), S.memberItem)
  }
  async pedidosDeEntrada(id: string) {
    return S.pageOf(await this.ler(`/v1/comunidades/${idOrError(id)}/pedidos`, 'propria'), S.joinRequest)
  }
  async convitesDaComunidade(id: string) {
    return S.pageOf(await this.ler(`/v1/comunidades/${idOrError(id)}/convites`, 'propria'), S.sentInvite)
  }
  async banidos(id: string) {
    return S.pageOf(await this.ler(`/v1/comunidades/${idOrError(id)}/banidos`, 'propria'), S.bannedItem)
  }
  /**
   * The new 0.3.2 requests (`ordem` by people, `janela`, `status`, `etiqueta`) only go out if the relay declares them: with a 0.3 or 0.3.1 relay the
   * call is exactly the previous one (and the by people order falls to `recentes`, the vocabulary filter falls to "no filter").
   */
  async topicos(id: string, options: { categoria?: string; tag?: string; ordem?: TopicOrder; cursor?: string; janela?: Window; status?: string; etiqueta?: string } = {}) {
    const { categoria: category, tag, ordem: order, janela: window, status, etiqueta: label } = options
    if (tag !== undefined && !TAG.test(tag)) throw INVALID()
    if (order !== undefined && !TOPIC_ORDERS.includes(order)) throw INVALID()
    if (category !== undefined && Array.from(category).length > 30) throw INVALID()
    if (window !== undefined && !WINDOWS.includes(window)) throw INVALID()
    if (status !== undefined && !VOCABULARY_KEY.test(status)) throw INVALID()
    if (label !== undefined && !VOCABULARY_KEY.test(label)) throw INVALID()
    const byPeople = order === 'melhores' || order === 'em-alta'
    const usesPeople = byPeople && (await this.suporta('ordem-por-pessoas'))
    const usesVocabulary = (status !== undefined || label !== undefined) && (await this.suporta('vocabulario'))
    // the parameter order is the usual one (category, tag, order, before): without the new options the request goes out identical to 0.3's
    const path = query({
      categoria: category, tag,
      ordem: byPeople ? (usesPeople ? order : undefined) : order,
      antes: before(options.cursor),
      janela: usesPeople && order === 'em-alta' ? window : undefined,
      status: usesVocabulary ? status : undefined,
      etiqueta: usesVocabulary ? label : undefined,
    })
    return S.topicList(await this.ler(`/v1/comunidades/${idOrError(id)}/topicos${path}`, 'opcional'))
  }
  async filaDeModeracao(id: string) {
    return S.moderationQueue(await this.ler(`/v1/comunidades/${idOrError(id)}/moderacao/fila`, 'propria'))
  }
  async registroDaComunidade(id: string, cursor?: string) {
    return S.pageOf(await this.ler(`/v1/comunidades/${idOrError(id)}/moderacao/registro${query({ antes: before(cursor) })}`, 'opcional'), S.record)
  }

  // ---- forum (7.3)
  async topico(id: string) {
    return S.topic(await this.ler(`/v1/topicos/${idOrError(id)}`, 'opcional'))
  }
  async respostas(topic: string, options: { em?: string; cursor?: string; ordem?: ReplyOrder; janela?: Window } = {}) {
    const at = options.em === undefined ? undefined : idOrError(options.em)
    const { ordem: order, janela: window } = options
    if (order !== undefined && !REPLY_ORDERS.includes(order)) throw INVALID()
    if (window !== undefined && !WINDOWS.includes(window)) throw INVALID()
    // `antigas` is the order the relay always had: it does not go in the request. The other three are from 0.3.2.
    const fresh = order !== undefined && order !== 'antigas' && (await this.suporta('ordem-por-pessoas'))
    const path = query({ em: at, antes: before(options.cursor), ordem: fresh ? order : undefined, janela: fresh && order === 'em-alta' ? window : undefined })
    return S.pageOf(await this.ler(`/v1/topicos/${idOrError(topic)}/respostas${path}`, 'opcional'), S.forumReply, 50)
  }
  async topicoDeObjeto(id: string): Promise<string> {
    const env = S.obj(await this.ler(`/v1/objetos/${idOrError(id)}`, 'opcional'))
    const o = S.obj(env.objeto ?? env)
    const body = S.obj(o.corpo)
    if (o.tipo === 'topico' && typeof (env.id ?? o.id) === 'string' && isObjectId((env.id ?? o.id) as string)) return (env.id ?? o.id) as string
    if (o.tipo === 'resposta-forum' && typeof body.topico === 'string' && isObjectId(body.topico)) return body.topico
    throw new NetworkError('nao-encontrado', 'não é um objeto do fórum')
  }
  async historico(topic: string) {
    return S.itemsOf(await this.ler(`/v1/topicos/${idOrError(topic)}/historico`, 'opcional'), S.topicVersion, 10)
  }
  /** 0.11.0 part 2: the public history of any edited publication. Without the resource the relay has no such route. */
  async edicoes(id: string) {
    const target = idOrError(id)
    if (!(await this.suporta('edicao'))) throw NOT_FOUND()
    return S.editHistory(await this.ler(`/v1/objetos/${target}/edicoes`, 'opcional'))
  }

  // ---- pages (7.4)
  async paginas(options: { tema?: string; ordem?: ListedOrder; cursor?: string } = {}) {
    if (options.tema !== undefined && !TAG.test(options.tema)) throw INVALID()
    if (options.ordem !== undefined && !LISTED_ORDERS.includes(options.ordem)) throw INVALID()
    return S.pageOf(await this.ler(`/v1/paginas${query({ tema: options.tema, ordem: options.ordem, antes: before(options.cursor) })}`, 'publica'), S.pageCardItem)
  }
  /** The themes of open pages. Without the feature (relay 0.3) it comes empty and the screen takes the themes from the page list, as before. */
  async temasDePaginas() {
    if (!(await this.suporta('temas-de-paginas'))) return []
    return S.itemsOf(await this.ler('/v1/paginas/temas', 'publica'), S.pageTheme, 50)
  }
  async pagina(id: string) {
    return S.projectPage(await this.ler(`/v1/paginas/${idOrError(id)}`, 'opcional'))
  }
  async atualizacoes(id: string, cursor?: string): Promise<Page<Update>> {
    const rawValue = await this.ler(`/v1/paginas/${idOrError(id)}/atualizacoes${query({ antes: before(cursor) })}`, 'publica')
    const cache = new Map<string, RoverSummary>()
    const envs = S.pageOf(rawValue, (e) => ({ bruto: e, env: S.envelope(e) }))
    for (const { env } of envs.itens) await this.summaryOf(env.autor, cache)
    return { ...envs, itens: envs.itens.map(({ bruto: e, env }) => S.update(e, cache.get(env.autor)!)) }
  }
  async seguidoresDaPagina(id: string, cursor?: string) {
    return S.pageOf(await this.ler(`/v1/paginas/${idOrError(id)}/seguidores${query({ antes: before(cursor) })}`, 'publica'), S.roverSummary)
  }
  /**
   * GET /v1/linha/inicio?rover=&tipos=postagem,pagina-publicar. The mixed line belongs to the person's rover and (with the graph
   * closed) only it reads it: it needs `leitor` and a credential. Without `leitor`, it falls back to the public line of posts only.
   */
  async linhaMista(cursor?: string): Promise<Page<TimelineItem>> {
    const mixed = this.leitor !== undefined
    const path = `/v1/linha/inicio${query({ rover: this.leitor, tipos: mixed ? 'postagem,pagina-publicar' : undefined, cursor: mixed ? undefined : cursor, antes: mixed ? before(cursor) : undefined })}`
    const rawValue = await this.ler(path, mixed ? 'propria' : 'publica')
    const cache = new Map<string, RoverSummary>()
    const pre = S.pageOf(rawValue, (x) => x)
    const items: TimelineItem[] = []
    for (const x of pre.itens) {
      const o = S.obj(x)
      const env = o.objeto !== undefined || o.envelope !== undefined ? S.envelope(o.envelope ?? o) : null
      if (env?.tipo === 'pagina-publicar') items.push({ tipo: 'atualizacao', atualizacao: S.update(o.envelope ?? o, await this.summaryOf(env.autor, cache)) })
      else items.push({ tipo: 'postagem', postagem: this.postagem(x) })
    }
    return { itens: items, proximo: pre.proximo }
  }
  protected abstract postagem(x: unknown): import('../../types').Post

  // ---- busca e descoberta (7.5)
  async buscarTudo(q: string) {
    const t = socialSearchTerm(q)
    if (!t) return { rovers: [], comunidades: [], topicos: [], paginas: [] }
    return S.searchResult(await this.ler(`/v1/busca${query({ q: t, tipo: 'todos' })}`, 'opcional'))
  }
  buscarTipo(q: string, type: 'rovers', cursor?: string): Promise<Page<import('../types').SearchedRover>>
  buscarTipo(q: string, type: 'comunidades', cursor?: string): Promise<Page<import('../types').CommunityCardData>>
  buscarTipo(q: string, type: 'topicos', cursor?: string, options?: { ordem?: SearchOrder; janela?: Window }): Promise<Page<import('../types').TopicCardData>>
  buscarTipo(q: string, type: 'paginas', cursor?: string): Promise<Page<import('../types').PageCardData>>
  buscarTipo(q: string, type: SearchType, cursor?: string): Promise<Page<unknown>>
  async buscarTipo(q: string, type: SearchType, cursor?: string, options: { ordem?: SearchOrder; janela?: Window } = {}): Promise<Page<unknown>> {
    const map: Record<SearchType, (x: unknown) => unknown> = {
      rovers: (x) => ({ ...S.roverSummary(x), descricao: S.txt(S.obj(x).descricao ?? '', 280) }), comunidades: S.communityCardItem, topicos: S.topicCardItem, paginas: S.pageCardItem,
    }
    if (!(type in map)) throw INVALID()
    const t = socialSearchTerm(q)
    if (!t) return { itens: [] }
    const { ordem: order, janela: window } = options
    if (order !== undefined && (type !== 'topicos' || !SEARCH_ORDERS.includes(order))) throw INVALID()
    if (window !== undefined && !WINDOWS.includes(window)) throw INVALID()
    // `relevancia` is the relay default and goes without `ordem`; `ordem` on another kind of search would be an error on relay 0.3.2, so it does not even leave here
    const fresh = order !== undefined && order !== 'relevancia' && (await this.suporta('ordem-por-pessoas'))
    return S.pageOf(await this.ler(`/v1/busca${query({ q: t, tipo: type, antes: before(cursor), ordem: fresh ? order : undefined, janela: fresh && order === 'em-alta' ? window : undefined })}`, 'opcional'), map[type])
  }
  emAlta(type: 'topicos', window?: Window): Promise<import('../types').TopicCardData[]>
  emAlta(type: 'comunidades', window?: Window): Promise<import('../types').CommunityCardData[]>
  emAlta(type: 'paginas', window?: Window): Promise<import('../types').PageCardData[]>
  emAlta(type: TrendingType, window?: Window): Promise<unknown[]>
  async emAlta(type: TrendingType, window?: Window): Promise<unknown[]> {
    const map: Record<TrendingType, (x: unknown) => unknown> = { topicos: S.topicCardItem, comunidades: S.communityCardItem, paginas: S.pageCardItem }
    if (!(type in map) || (window !== undefined && window !== '24h' && window !== '7d')) throw INVALID()
    return S.itemsOf(await this.ler(`/v1/descobrir/em-alta${query({ tipo: type, janela: window })}`, 'publica'), map[type], 20)
  }
  async recemChegadosSociais(limit?: number) {
    const l = limit !== undefined && Number.isInteger(limit) && limit >= 1 && limit <= 50 ? String(limit) : undefined
    return S.itemsOf(await this.ler(`/v1/descobrir/recem-chegados${query({ limite: l })}`, 'publica'), S.newcomer, 50)
  }
  sugestoes(type: 'comunidades', interests?: string[]): Promise<import('../types').CommunityCardData[]>
  sugestoes(type: 'paginas', interests?: string[]): Promise<import('../types').PageCardData[]>
  sugestoes(type: 'rovers', interests?: string[]): Promise<import('../types').SearchedRover[]>
  sugestoes(type: SuggestionType, interests?: string[]): Promise<unknown[]>
  async sugestoes(type: SuggestionType, interests: string[] = []): Promise<unknown[]> {
    const map: Record<SuggestionType, (x: unknown) => unknown> = {
      comunidades: S.communityCardItem, paginas: S.pageCardItem, rovers: (x) => ({ ...S.roverSummary(x), descricao: S.txt(S.obj(x).descricao ?? '', 280) }),
    }
    if (!(type in map)) throw INVALID()
    const tags = interests.filter((t) => TAG.test(t)).slice(0, 8)
    // Only from what is DECLARED: the relay does not know what the person has read. With the rover given (and its credential) the relay
    // stops suggesting what the person already takes part in; without a credential the list is not filtered.
    const path = `/v1/descobrir/sugestoes${query({ tipo: type, interesses: tags.length ? tags.join(',') : undefined, rover: tags.length ? undefined : this.leitor })}`
    return S.itemsOf(await this.ler(path, 'opcional'), map[type], 20)
  }
  async tendencias(window?: Window) {
    if (window !== undefined && window !== '24h' && window !== '7d') throw INVALID()
    return S.itemsOf(await this.ler(`/v1/descobrir/tendencias${query({ janela: window })}`, 'publica'), S.trend, 20)
  }
  async registroDoRele(cursor?: string) {
    return S.pageOf(await this.ler(`/v1/moderacao/registro${query({ antes: before(cursor) })}`, 'publica'), S.record)
  }

  // ---- 0.3.2 ----
  /** The operator announcements. Without the feature (relay 0.3 and 0.3.1) it returns an empty list, without calling the route that does not exist. Public route: no credential. */
  async anuncios(cursor?: string) {
    if (!(await this.suporta('anuncios'))) return { itens: [] }
    return S.pageOf(await this.ler(`/v1/anuncios${query({ antes: before(cursor) })}`, 'publica'), S.announcement, 20)
  }
  /**
   * The home panel of the person's rover. `desde` is an instant in seconds (the `agora` of the previous response). Without the feature, or without the
   * rover credential (the own read does not even leave the computer), it returns `null`: the screen falls back to what it already did.
   */
  async inicio(since?: number) {
    if (!(await this.suporta('inicio'))) return null
    const d = since !== undefined && Number.isSafeInteger(since) && since >= 0 && since <= 4_102_444_800 ? String(since) : undefined
    try {
      return S.home(await this.ler(`/v1/inicio${query({ desde: d })}`, 'propria'))
    } catch (e) {
      if (e instanceof NetworkError && e.codigo === 'proibido') return null
      throw e
    }
  }

  // ---- 0.4.0: private messages ----
  // The site does not have the rover's encryption key (it lives in the person's app) and does not have its read credential: it does not read any
  // conversation from the relay, with the feature on or not. The screens show why. No conversation route is called from here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the signature is the contract's; nothing from here reaches the relay
  async conversas(_uid: string, _options?: { estado?: import('../messages').ConversationFilter; cursor?: string }): Promise<Page<import('../messages').Conversation>> {
    throw new NetworkError('versao-nao-suportada', 'as conversas só se leem pelo app da pessoa')
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the signature is the contract's; nothing from here reaches the relay
  async conversa(_uid: string, _id: string): Promise<import('../messages').Conversation> {
    throw new NetworkError('versao-nao-suportada', 'as conversas só se leem pelo app da pessoa')
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the signature is the contract's; nothing from here reaches the relay
  async mensagensDaConversa(_uid: string, _id: string, _cursor?: string): Promise<Page<import('../messages').ClearMessage>> {
    throw new NetworkError('versao-nao-suportada', 'as conversas só se leem pelo app da pessoa')
  }
}
