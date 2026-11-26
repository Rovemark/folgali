// FakeClient: the whole network in memory, with the demonstration data. It serves to show the site
// to Rovemark, for tests and for anyone to run the project without a relay. It has the same
// rules as the real client: it does not publish without a valid approval badge, it cleans invisible text,
// it refuses text over the limit and it stores a report without knowing who reported.

import { demoBytes } from './social/fake/images'
import type { NetworkClient, AppBridge } from './network-client'
import type { SocialClient } from './social/social-client'
import { FakeSocialNetwork } from './social/fake'
import { DemoKarma, exampleArrows } from './karma/demo'
import { demoAuthorization, demoPublished } from './panel/fake'
import type { PublishedAction, StandingAuthorization } from './panel/types'
import { DEMO_ROVER, oid, summaryOf, seed, uidOf, type DemoData } from './demo-data'
import { TIME_OFF_ADJUST, DEFAULT_TIME_OFF, AVATAR_PARTS } from './join/limits'
import { OUTSIDE_AGENTS } from './folgali/demo'
import { rank } from './domain/trending'
import {
  approve as approveDraft,
  edit as editDraft,
  isText,
  refuse as rejectDraft,
  sealTouch,
  verifyBadge,
  type NetworkObject,
  type Draft,
  type ApprovalResult,
} from './domain/approval'
import { ReportLedger, validateReport } from './domain/report'
import { searchTerm } from './domain/handle'
import { validateText } from './domain/limits'
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
  type RoverSummary,
  type TipoPostagem,
  type ReactionType,
  type AnyReaction,
  ALL_REACTIONS,
  POST_ONLY_REACTIONS,
} from './types'

export const PAGE_SIZE = 8

const DELEGATES = [
  'info', 'suporta', 'depoimentosEnviados', 'removidos', 'temasDePaginas', 'paginaDoRover', 'recados', 'depoimentos', 'entregas', 'amigos', 'amigosEmComum', 'comunidadesDoRover', 'paginasDoRover', 'amizadesPendentes', 'convites', 'relacoes',
  'notificacoes', 'contagemDeNotificacoes', 'comunidades', 'comunidade', 'membros', 'pedidosDeEntrada', 'convitesDaComunidade', 'banidos', 'topicos', 'filaDeModeracao',
  'registroDaComunidade', 'topico', 'topicoDeObjeto', 'respostas', 'historico', 'edicoes', 'paginas', 'pagina', 'atualizacoes', 'seguidoresDaPagina', 'linhaMista', 'buscarTudo', 'buscarTipo', 'emAlta',
  'recemChegadosSociais', 'sugestoes', 'tendencias', 'registroDoRele', 'anuncios', 'inicio', 'agir', 'propor', 'rascunhosSociais', 'rascunhoSocial', 'editarSocial', 'recusarSocial', 'aprovarSocial',
  // 0.4.0: mensagens privadas
  'conversas', 'conversa', 'mensagensDaConversa',
] as const
/** Handle that simulates a relay that is down, for the error screen. It only exists on the fake client. */
export const OFFLINE_HANDLE = 'fora_do_ar'

const clone = <T>(x: T): T => structuredClone(x)
const recent = (a: Post, b: Post) => (a.criadaEm < b.criadaEm ? 1 : a.criadaEm > b.criadaEm ? -1 : a.id.localeCompare(b.id))

function readCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0
  let n = NaN
  try {
    n = Number.parseInt(atob(cursor), 10)
  } catch {
    n = NaN
  }
  if (!Number.isInteger(n) || n < 0) throw new NetworkError('invalido', 'cursor inválido')
  return n
}
const createCursor = (n: number) => btoa(String(n))

function paginate<T>(items: T[], cursor?: string): Page<T> {
  const ini = readCursor(cursor)
  const slice = items.slice(ini, ini + PAGE_SIZE)
  return { itens: slice, proximo: ini + PAGE_SIZE < items.length ? createCursor(ini + PAGE_SIZE) : undefined }
}

export class FakeClient implements NetworkClient, AppBridge {
  readonly modo = 'falso' as const
  private dados: DemoData
  private readonly ledger = new ReportLedger()
  private readonly ownReactions = new Map<string, AnyReaction>()
  private contador = 0
  private followed: Set<string>
  /** The whole social network (communities, forum, pages, friendship...), in src/lib/social/fake. */
  readonly social: FakeSocialNetwork

  // SocialClient and the social part of the bridge: the FakeClient only delegates to `social`.
  declare info: SocialClient['info']
  declare suporta: SocialClient['suporta']
  declare depoimentosEnviados: SocialClient['depoimentosEnviados']
  declare removidos: SocialClient['removidos']
  declare temasDePaginas: SocialClient['temasDePaginas']
  declare paginaDoRover: SocialClient['paginaDoRover']
  declare recados: SocialClient['recados']
  declare depoimentos: SocialClient['depoimentos']
  declare entregas: SocialClient['entregas']
  declare amigos: SocialClient['amigos']
  declare amigosEmComum: SocialClient['amigosEmComum']
  declare comunidadesDoRover: SocialClient['comunidadesDoRover']
  declare paginasDoRover: SocialClient['paginasDoRover']
  declare amizadesPendentes: SocialClient['amizadesPendentes']
  declare convites: SocialClient['convites']
  declare relacoes: SocialClient['relacoes']
  declare notificacoes: SocialClient['notificacoes']
  declare contagemDeNotificacoes: SocialClient['contagemDeNotificacoes']
  declare comunidades: SocialClient['comunidades']
  declare comunidade: SocialClient['comunidade']
  declare membros: SocialClient['membros']
  declare pedidosDeEntrada: SocialClient['pedidosDeEntrada']
  declare convitesDaComunidade: SocialClient['convitesDaComunidade']
  declare banidos: SocialClient['banidos']
  declare topicos: SocialClient['topicos']
  declare filaDeModeracao: SocialClient['filaDeModeracao']
  declare registroDaComunidade: SocialClient['registroDaComunidade']
  declare topico: SocialClient['topico']
  declare respostas: SocialClient['respostas']
  declare topicoDeObjeto: SocialClient['topicoDeObjeto']
  declare historico: SocialClient['historico']
  declare edicoes: SocialClient['edicoes']
  declare paginas: SocialClient['paginas']
  declare pagina: SocialClient['pagina']
  declare atualizacoes: SocialClient['atualizacoes']
  declare seguidoresDaPagina: SocialClient['seguidoresDaPagina']
  declare linhaMista: SocialClient['linhaMista']
  declare buscarTudo: SocialClient['buscarTudo']
  declare buscarTipo: SocialClient['buscarTipo']
  declare emAlta: SocialClient['emAlta']
  declare recemChegadosSociais: SocialClient['recemChegadosSociais']
  declare sugestoes: SocialClient['sugestoes']
  declare tendencias: SocialClient['tendencias']
  declare registroDoRele: SocialClient['registroDoRele']
  declare anuncios: SocialClient['anuncios']
  declare inicio: SocialClient['inicio']
  declare conversas: SocialClient['conversas']
  declare conversa: SocialClient['conversa']
  declare mensagensDaConversa: SocialClient['mensagensDaConversa']
  declare agir: AppBridge['agir']
  declare propor: AppBridge['propor']
  declare rascunhosSociais: AppBridge['rascunhosSociais']
  declare rascunhoSocial: AppBridge['rascunhoSocial']
  declare editarSocial: AppBridge['editarSocial']
  declare recusarSocial: AppBridge['recusarSocial']
  declare aprovarSocial: AppBridge['aprovarSocial']

  /**
   * `autorizacao`: the demonstration gets a standing authorization (only to photograph the panel block with it). Off by
   * default, as in the protocol.
   */
  constructor(
    private readonly clock: () => Date = () => new Date(),
    private readonly opcoes: { autorizacao?: boolean } = {},
  ) {
    this.dados = seed(this.clock())
    this.followed = new Set(this.dados.segue.get(DEMO_ROVER))
    this.ownReactions.set(oid('p05'), 'util')
    this.ownReactions.set(oid('p12'), 'curtir')
    this.social = new FakeSocialNetwork(this.clock, uidOf(DEMO_ROVER), this.hooks(), this.dados.rovers)
    const social = this.social as unknown as Record<string, (...a: unknown[]) => unknown>
    const me = this as unknown as Record<string, unknown>
    for (const name of DELEGATES) me[name] = (...a: unknown[]) => social[name](...a)
  }

  private hooks() {
    return {
      oldProfile: (uid: string) => {
        const r = this.dados.rovers.find((x) => x.uid === uid)
        return r ? { seguindo: r.seguindo, seguidores: r.seguidores, euSigo: uid === uidOf(DEMO_ROVER) ? undefined : this.followed.has(uid) } : undefined
      },
      homeTimelinePosts: () => this.dados.postagens.filter((p) => p.tipo === 'postagem' && !p.removida).map((p) => this.withMyView(p)),
      undoFollow: (a: string, b: string) => {
        if (a === uidOf(DEMO_ROVER) && this.followed.has(b)) {
          this.followed.delete(b)
          const target = this.dados.rovers.find((r) => r.uid === b)
          const me = this.dados.rovers.find((r) => r.uid === a)
          if (target) target.seguidores--
          if (me) me.seguindo--
        }
      },
      removeOldPost: (id: string, author: string) => {
        if (!this.dados.postagens.some((p) => p.id === id)) return false
        void this.removeByAuthor(id, author)
        return true
      },
      reportOld: (target: string, reason: string) => {
        if (!this.dados.postagens.some((p) => p.id === target)) return false
        const older = ['spam', 'assedio', 'ilegal', 'dados-pessoais', 'golpe', 'outro']
        if (!older.includes(reason)) throw new NetworkError('invalido', 'motivo não vale para postagem')
        this.ledger.receive({ alvo: target, motivo: reason as never }, this.clock())
        return true
      },
    }
  }

  // ---- relay ----------------------------------------------------------------------------------

  private withMyView(p: Post): Post {
    const c = clone(p)
    c.minhaReacao = this.ownReactions.get(p.id) ?? null
    // 0.10.0: every demo post carries the same EXAMPLE arrows wherever it shows (src/lib/karma/demo.ts)
    if (!c.setas && c.tipo === 'postagem') c.setas = exampleArrows(p.id)
    return c
  }

  private perfil(uid: string): RoverProfile {
    const r = this.dados.rovers.find((x) => x.uid === uid)
    if (!r) {
      // rovers that only exist on the social network also have a phase 1 profile
      const extra = this.social?.basicProfile(uid)
      if (!extra) throw new NetworkError('nao-encontrado', 'rover não encontrado')
      return extra
    }
    const c = clone(r)
    if (uid !== uidOf(DEMO_ROVER)) c.euSigo = this.followed.has(uid)
    return c
  }

  async publicar(object: NetworkObject): Promise<{ id: string }> {
    if (!verifyBadge(object)) throw new NetworkError('sem-aprovacao', 'objeto sem aprovação humana válida')
    const author = this.dados.rovers.find((r) => r.uid === object.autor)
    if (!author) throw new NetworkError('nao-encontrado', 'rover autor não encontrado')

    if (isText(object)) {
      const v = validateText(object.texto, object.tipo)
      if (!v.ok) throw new NetworkError('invalido', v.motivo === 'vazio' ? 'texto vazio' : 'texto acima do limite')
      if (object.tipo === 'resposta') {
        const parent = this.dados.postagens.find((p) => p.id === object.respondeA)
        if (!parent || parent.removida) throw new NetworkError('nao-encontrado', 'a postagem respondida não existe')
        parent.respostas++
      }
      const id = oid(`n${++this.contador}`)
      this.dados.postagens.push({
        id, tipo: object.tipo, autor: summaryOf(author.handle), texto: v.texto, topicos: [...object.topicos], idioma: object.idioma, humor: object.humor,
        criadaEm: this.clock().toISOString(), respondeA: object.respondeA, respostas: 0, reacoes: { curtir: 0, util: 0 },
      })
      return { id }
    }
    if (object.tipo === 'seguir' || object.tipo === 'deixar-de-seguir') {
      const target = this.dados.rovers.find((r) => r.uid === object.alvo)
      if (!target) throw new NetworkError('nao-encontrado', 'rover não encontrado')
      if (target.uid === object.autor) throw new NetworkError('invalido', 'um rover não segue a si mesmo')
      const already = this.followed.has(target.uid)
      if (object.tipo === 'seguir' && !already) {
        this.followed.add(target.uid)
        target.seguidores++
        author.seguindo++
      } else if (object.tipo === 'deixar-de-seguir' && already) {
        this.followed.delete(target.uid)
        target.seguidores--
        author.seguindo--
      }
      return { id: oid(`n${++this.contador}`) }
    }
    if (object.tipo !== 'reacao') throw new NetworkError('invalido', 'tipo de objeto desconhecido')
    const target = this.dados.postagens.find((p) => p.id === object.alvo)
    if (!target || target.removida) throw new NetworkError('nao-encontrado', 'postagem não encontrada')
    // 0.8.0: the five post reactions (and util); another one replaces mine, the same one again takes it back
    const fresh = object.reacao as AnyReaction
    if (!(ALL_REACTIONS as readonly string[]).includes(fresh)) throw new NetworkError('invalido', 'reação inválida')
    const old = this.ownReactions.get(target.id)
    if (old) target.reacoes[old] = Math.max(0, (target.reacoes[old] ?? 0) - 1)
    if (old === fresh) this.ownReactions.delete(target.id)
    else {
      target.reacoes[fresh] = (target.reacoes[fresh] ?? 0) + 1
      this.ownReactions.set(target.id, fresh)
    }
    return { id: oid(`n${++this.contador}`) }
  }

  /** 0.5.0: the demonstration images are generated in code (social/fake/images.ts); none comes from outside. */
  async imagem(hash: string): Promise<{ bytes: Uint8Array; formato: 'png' } | null> {
    return demoBytes(hash)
  }

  // ---- 0.10.0: karma, ranking and ordered posts. EXAMPLE numbers of the demonstration (src/lib/karma/demo.ts) --------------------
  private readonly karmaDemo = new DemoKarma(() => this.dados.rovers, () => this.dados.postagens.map((p) => this.withMyView(p)))
  placar(uid: string) { return this.karmaDemo.placar(uid) }
  ranking(...a: Parameters<DemoKarma['ranking']>) { return this.karmaDemo.ranking(...a) }
  postagensOrdenadas(...a: Parameters<DemoKarma['postagensOrdenadas']>) { return this.karmaDemo.postagensOrdenadas(...a) }
  karmaBatch(uids: string[]) { return this.karmaDemo.karmaBatch(uids) }

  async getRover(ref: string): Promise<RoverProfile> {
    const handle = ref.replace(/^@/, '').toLowerCase()
    if (handle === OFFLINE_HANDLE) throw new NetworkError('indisponivel', 'o relé não respondeu')
    const r = this.dados.rovers.find((x) => x.uid === ref || x.handle === handle)
    if (!r) {
      const extra = this.social.basicProfile(ref)
      if (!extra) throw new NetworkError('nao-encontrado', 'rover não encontrado')
      return extra
    }
    return this.perfil(r.uid)
  }

  async roverPosts(uid: string, options: { cursor?: string; tipo?: TipoPostagem } = {}): Promise<Page<Post>> {
    this.perfil(uid)
    const list = this.dados.postagens
      .filter((p) => p.autor.uid === uid && !p.removida && (!options.tipo || p.tipo === options.tipo))
      .sort(recent)
      .map((p) => this.withMyView(p))
    return paginate(list, options.cursor)
  }

  async homeTimeline(cursor?: string): Promise<Page<Post>> {
    const list = this.dados.postagens
      .filter((p) => p.tipo === 'postagem' && !p.removida)
      .sort(recent)
      .map((p) => this.withMyView(p))
    return paginate(list, cursor)
  }

  async getObject(id: string): Promise<PostDetail> {
    const p = this.dados.postagens.find((x) => x.id === id)
    if (!p) throw new NetworkError('nao-encontrado', 'postagem não encontrada')
    const parent = p.respondeA ? this.dados.postagens.find((x) => x.id === p.respondeA) : undefined
    const replies = this.dados.postagens
      .filter((x) => x.respondeA === id && !x.removida)
      .sort((a, b) => (a.criadaEm < b.criadaEm ? -1 : 1))
      .map((x) => this.withMyView(x))
    return { postagem: this.withMyView(p), pai: parent ? this.withMyView(parent) : undefined, respostas: replies }
  }

  async denunciar(input: ReportEntry): Promise<void> {
    const v = validateReport(input)
    if (!v.ok) throw new NetworkError('invalido', `denúncia inválida: ${v.erro}`)
    if (!this.dados.postagens.some((p) => p.id === v.denuncia.alvo)) {
      if (!this.social.knows(v.denuncia.alvo)) throw new NetworkError('nao-encontrado', 'alvo não encontrado')
      // social network object: the anonymous report from 0.3 (silently discarded if whoever reported could not see it)
      this.social.executar(uidOf(DEMO_ROVER), { tipo: 'denuncia', alvo: v.denuncia.alvo, motivo: v.denuncia.motivo })
      return
    }
    const r = this.ledger.receive(v.denuncia, this.clock())
    if (r === 'limite') throw new NetworkError('limite', 'muitas denúncias em pouco tempo')
  }

  async removeByAuthor(id: string, author: string): Promise<void> {
    const p = this.dados.postagens.find((x) => x.id === id)
    if (!p) {
      // not a phase 1 post: it can be a note, testimonial, topic, forum reply, update...
      this.social.executar(author, { tipo: 'remocao-pelo-autor', alvo: id })
      return
    }
    if (p.autor.uid !== author) throw new NetworkError('proibido', 'só o dono do rover apaga o que ele postou')
    p.removida = true
    p.texto = ''
    if (p.respondeA) {
      const parent = this.dados.postagens.find((x) => x.id === p.respondeA)
      if (parent && parent.respostas > 0) parent.respostas--
    }
  }

  async buscar(term: string): Promise<SearchResult> {
    const t = searchTerm(term)
    if (!t) return { rovers: [] }
    const norm = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
    const scored = this.dados.rovers
      .map((r) => {
        let points = 0
        if (r.handle === t) points = 5
        else if (r.handle.startsWith(t)) points = 4
        else if (norm(r.nome).startsWith(t)) points = 3
        else if (r.handle.includes(t) || norm(r.nome).includes(t)) points = 2
        else if (r.sabeFazer.some((s) => norm(s).includes(t))) points = 1
        return { r, pontos: points }
      })
      .filter((x) => x.pontos > 0)
      .sort((a, b) => b.pontos - a.pontos || a.r.handle.localeCompare(b.r.handle))
    return { rovers: scored.map((x) => this.perfil(x.r.uid)) }
  }

  async descobrir(): Promise<Discovery> {
    const now = this.clock()
    const ranking = rank(this.dados.postagens, now).slice(0, 5)
    const trending = ranking.map((x) => this.perfil(x.uid))
    const newArrivals = [...this.dados.rovers]
      .sort((a, b) => ((a.desde ?? '') < (b.desde ?? '') ? 1 : -1))
      .slice(0, 4)
      .map((r) => this.perfil(r.uid))
    return { emAlta: trending, recemChegados: newArrivals }
  }

  // ---- 0.6.0: the open issuer of outside agents --------------------------------------------------

  /** The demonstration's outside agents (src/lib/folgali/demo.ts), as the open issuer returns them. Never the owner. */
  async outsideAgent(uid: string): Promise<OutsideAgent | null> {
    const a = Object.values(OUTSIDE_AGENTS).find((x) => x.uid === uid)
    if (!a) return null
    return { uid: a.uid, handle: a.handle, nome: a.nome, plataforma: a.origem ?? null, folga: a.folga, donoVerificado: true, desde: new Date(this.clock().getTime() - a.dias * 86_400_000).toISOString() }
  }

  /** What the open issuer says in `GET /v1/agentes/info`, from the copy checked against the protocol (src/lib/join/limits.ts). */
  async agentsInfo(): Promise<AgentsInfo> {
    return {
      padrao: { ...DEFAULT_TIME_OFF },
      ajuste: { postagensPorDia: { ...TIME_OFF_ADJUST.postagensPorDia }, comentariosPorDia: { ...TIME_OFF_ADJUST.comentariosPorDia } },
      pecas: { corpo: [...AVATAR_PARTS.corpo], cor: [...AVATAR_PARTS.cor], veste: [...AVATAR_PARTS.veste], acessorio: [...AVATAR_PARTS.acessorio] },
    }
  }

  // ---- app bridge ---------------------------------------------------------------------------

  async whoAmI(): Promise<RoverSummary | null> {
    return summaryOf(DEMO_ROVER)
  }

  async rascunhos(): Promise<Draft[]> {
    return clone(this.dados.rascunhos.filter((r) => r.estado === 'pendente'))
  }

  async rascunho(id: string): Promise<Draft | null> {
    const r = this.dados.rascunhos.find((x) => x.id === id)
    return r ? clone(r) : null
  }

  private find(id: string): { r: Draft; i: number } {
    const i = this.dados.rascunhos.findIndex((x) => x.id === id)
    if (i < 0) throw new NetworkError('nao-encontrado', 'rascunho não encontrado')
    return { r: this.dados.rascunhos[i], i }
  }

  async editar(id: string, text: string): Promise<Draft> {
    const { r, i } = this.find(id)
    this.dados.rascunhos[i] = editDraft(r, text)
    return clone(this.dados.rascunhos[i])
  }

  async recusar(id: string): Promise<Draft> {
    const { r, i } = this.find(id)
    this.dados.rascunhos[i] = rejectDraft(r, this.clock())
    return clone(this.dados.rascunhos[i])
  }

  async aprovar(id: string, versionSeen: number): Promise<ApprovalResult & { postId?: string }> {
    const { r, i } = this.find(id)
    const res = approveDraft(r, versionSeen, this.clock())
    if (!res.ok) return res
    const { id: postId } = await this.publicar(res.objeto)
    this.dados.rascunhos[i] = res.rascunho
    return { ...res, postId }
  }

  private noticeSeen = 0
  async seenNotices(): Promise<number> {
    return this.noticeSeen
  }
  async marcarAvisosVistos(seq: number): Promise<void> {
    this.noticeSeen = Math.max(this.noticeSeen, seq)
  }

  // ---- "My rover" panel (what the app knows and the relay does not answer) ------------------------------------

  async autorizacaoPermanente(): Promise<StandingAuthorization | null> {
    return this.opcoes.autorizacao ? demoAuthorization(this.clock()) : null
  }

  async published(): Promise<PublishedAction[]> {
    return demoPublished(summaryOf(DEMO_ROVER), this.dados.postagens, this.social, await this.autorizacaoPermanente())
  }

  async seguir(uid: string, follow: boolean): Promise<void> {
    await this.publicar(sealTouch({ tipo: follow ? 'seguir' : 'deixar-de-seguir', autor: uidOf(DEMO_ROVER), alvo: uid }, this.clock()))
  }

  async reagir(id: string, reaction: AnyReaction): Promise<void> {
    // the four post-only reactions never reach topics, forum replies or page updates (they would be refused by the relay too)
    const postOnly = (POST_ONLY_REACTIONS as readonly string[]).includes(reaction)
    if (!postOnly && this.social.reactSocial(uidOf(DEMO_ROVER), id, reaction as ReactionType)) return
    await this.publicar(sealTouch({ tipo: 'reacao', autor: uidOf(DEMO_ROVER), alvo: id, reacao: reaction }, this.clock()))
  }
}
