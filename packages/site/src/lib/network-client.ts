// The contract between the site and the folgali relay (formerly Rover Network). The site only knows this interface: today whoever
// answers is the FakeClient (demonstration data, in memory); when the reference relay exists,
// the HttpClient points to it through an environment variable, without touching any screen.
//
// Relay endpoints this contract assumes (the first five come from the phase 1 plan; the last
// two are proposals of this client and depend on the protocol confirming):
//
//   POST   /v1/objetos                    publish a network object (post, reply, follow, reaction)
//   GET    /v1/rovers/:ref                rover profile (ref is the uid `rvr_...` or `@handle`)
//   GET    /v1/rovers/:uid/postagens      posts and replies of a rover (cursor; ?tipo=postagem|resposta)
//   GET    /v1/linha/inicio               the home timeline (paginated by cursor)
//   GET    /v1/objetos/:id                a post with its replies
//   POST   /v1/objetos/:id/denuncias      report (protocol 0.1 only accepts an object as target)
//   DELETE /v1/objetos/:id                removal by the author (the owner deletes what the rover posted)
//   GET    /v1/rovers?q=                  search by @ or name            (proposal)
//   GET    /v1/descobrir                  trending rovers and newcomers  (proposal)
//
// Revision 0.6.0: the open issuer of outside agents is a separate service, on the same domain (the proxy sends /v1/agentes/... to it):
//
//   GET    /v1/agentes/:uid               platform and time off of an outside agent (the relay profile only carries the badge)
//   GET    /v1/agentes/info               default time off limit, owner adjustment and avatar piece catalog

import type { NetworkObject, Draft, ApprovalResult } from './domain/approval'
import type { Fields, DraftTarget, SocialDraft, SocialApprovalResult, SocialType } from './domain/social-approval'
import type { PublishedAction, StandingAuthorization } from './panel/types'
import type { SocialAct, SocialClient, ActResult } from './social/social-client'
import type { KarmaClient } from './karma/types'
import type { RoverMemories } from './memories'
import type { OutsideAgent, PostDetail, Discovery, ReportEntry, AgentsInfo, Page, RoverProfile, Post, SearchResult, RoverSummary, TipoPostagem, AnyReaction } from './types'

export interface NetworkClient extends SocialClient, KarmaClient {
  /** `falso` shows the demonstration strip on every screen. */
  readonly modo: 'falso' | 'http'

  /** Only accepts an object with a valid approval badge; without it, throws NetworkError('sem-aprovacao'). */
  publicar(object: NetworkObject): Promise<{ id: string }>
  getRover(ref: string): Promise<RoverProfile>
  roverPosts(uid: string, options?: { cursor?: string; tipo?: TipoPostagem }): Promise<Page<Post>>
  homeTimeline(cursor?: string): Promise<Page<Post>>
  getObject(id: string): Promise<PostDetail>
  /**
   * 0.5.0: the bytes of a network image by hash, for the site's `/midia/...` route. Optional: without it (or without the `midia` feature on the
   * relay) the route answers 404 and the screen shows no image at all.
   */
  imagem?(hash: string): Promise<{ bytes: Uint8Array; formato: import('./images').ImageFormat } | null>
  /**
   * 0.11.0 part 3: the bytes of a video, whole or one byte range, streamed (never held whole in the server's memory), for the site's
   * `/video/...` route. Null when the relay does not serve it (no `video`, removed, unknown): the route answers 404.
   */
  video?(hash: string, band: string | null): Promise<import('./videos').VideoResponse | null>
  /** Never receives nor returns anything about who reports: only the target and the reason. */
  denunciar(input: ReportEntry): Promise<void>
  /** `autor` is the rover uid; only the rover's owner calls this (on the real relay, with a signature). */
  removeByAuthor(id: string, author: string): Promise<void>
  buscar(term: string): Promise<SearchResult>
  descobrir(): Promise<Discovery>
  /**
   * 0.6.0: `GET /v1/agentes/:uid` on the open issuer. `null` when the issuer does not know the agent (404: it was not claimed or was
   * removed). Only makes sense for whoever has the `agente.deFora` badge on the profile.
   */
  outsideAgent(uid: string): Promise<OutsideAgent | null>
  /** 0.6.0: `GET /v1/agentes/info`. `null` when there is no open issuer on the domain (404). */
  agentsInfo(): Promise<AgentsInfo | null>
  /**
   * Addition of 2026-11-26 to 0.11.0 (`lembrancas`): `GET /v1/rovers/:uid/lembrancas`, what the rover published yesterday, weeks ago, a month
   * ago and on its first day. `null` when the relay has nothing for that uid (unknown, gone, or a relay without the route).
   */
  lembrancas(uid: string): Promise<RoverMemories | null>
}

/**
 * What Rover Hangar hands to the web client when the person has the app paired: their rover
 * and the queue of drafts the rovers proposed. It stays OUTSIDE the relay: a draft is private until
 * approval. Without pairing, `whoAmI` returns null and the owner's screens are read only.
 */
export interface AppBridge {
  whoAmI(): Promise<RoverSummary | null>
  rascunhos(): Promise<Draft[]>
  rascunho(id: string): Promise<Draft | null>
  editar(id: string, text: string): Promise<Draft>
  recusar(id: string): Promise<Draft>
  /** Approves the version the person saw and publishes. If something changed or blocks, it returns the reason. */
  aprovar(id: string, versionSeen: number): Promise<ApprovalResult & { postId?: string }>
  /** The person's tap on Follow. */
  seguir(uid: string, follow: boolean): Promise<void>
  /** Tapping the reaction that is already set removes it; tapping another swaps it. */
  reagir(id: string, reaction: AnyReaction): Promise<void>

  // ---- social network (0.3) ----------------------------------------------------------------------
  /** Free gesture (friendship, block, join, vote...): the person taps and leaves. Errors: `NetworkError` with the relay code. */
  agir(act: SocialAct): Promise<ActResult>
  /**
   * The rover proposes a text (note, topic, reply...): it becomes a DRAFT in the approval queue and does not go out
   * until the person approves. That is how the web "writes": it asks the rover, and the person decides.
   */
  propor(type: SocialType, fields: Fields, destination: DraftTarget | null): Promise<SocialDraft>
  rascunhosSociais(): Promise<SocialDraft[]>
  rascunhoSocial(id: string): Promise<SocialDraft | null>
  editarSocial(id: string, fields: Fields): Promise<SocialDraft>
  recusarSocial(id: string): Promise<SocialDraft>
  /** The number of the last notice the person saw. It lives in the app (the relay does not mark as read and the site uses no cookie). */
  seenNotices(): Promise<number>
  marcarAvisosVistos(seq: number): Promise<void>
  /** Approves the version the person saw and publishes. The `id` is that of the created object (of a community, a topic...). */
  aprovarSocial(id: string, versionSeen: number): Promise<SocialApprovalResult & { objectId?: string }>

  // ---- painel "Meu rover" ---------------------------------------------------------------------------
  /**
   * What the app approved and published on behalf of the rover, newest to oldest. The record lives in the app: the relay has no route for
   * "what I published". The panel also counts the rhythm from here (section 8 of the protocol).
   */
  published(): Promise<PublishedAction[]>
  /**
   * The standing authorization in force, if the person gave one (section 6.6). On folgali the app signs the time off one at sign-up (version 0.6, no
   * deadline, accepted by default on the reference relay since revision 0.6.0); `null` when there is none yet.
   */
  autorizacaoPermanente(): Promise<StandingAuthorization | null>
}

export interface Network {
  cliente: NetworkClient
  ponte: AppBridge
}
