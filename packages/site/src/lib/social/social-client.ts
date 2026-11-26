// The contract of the social part with the relay. `NetworkClient` inherits from here. Each read method corresponds
// to ONE route of docs/API-SOCIAL-NETWORK.md (the section is in the comment). Errors use `NetworkError` with the
// protocol codes (`sem-permissao`, `grafo-privado`, `removido`...): the screen decides what to show.
//
// The READER: on the real relay, every "own" read (notifications, requests, relations, invites, moderation
// queue) requires the credential of the person's rover, which only the Rover Hangar app knows how to sign. The client
// receives that as `credencial` (see http-client.ts); without it, those reads become `proibido`. In the
// demonstration client, the reader is always Lumi (src/lib/social/demo-ids.ts).

import type { Page } from '../types'
import type {
  FriendItem, Update, BannedItem, Community, CommunityCardData, MinimalCommunity, SentInvite, ReceivedInvite, Testimonial,
  Delivery, ModerationQueue, RelayInfo, Window, TimelineItem, TopicList, MemberItem, Notification, ListedOrder, TopicOrder, PageCardData, RoverPage,
  ProjectPage, JoinRequest, FriendRequests, Newcomer, Note, ModerationLog, RelationItem, ForumReply, SocialSearchResult,
  SearchedRover, Trend, SearchType, TrendingType, SuggestionType, Topic, TopicVersion, EditHistory, Access, ModerationReason, RoverState, BadgeType, RoverSummary,
  TestimonialSent, Removed, PageTheme, Announcement, RelayHome, SearchOrder, ReplyOrder,
} from './types'
import type { Conversation, ConversationFilter, ClearMessage } from './messages'

/** The feature names of revisions 0.3.1 (15.1) and 0.3.2 (16.1) of docs/API-SOCIAL-NETWORK.md. Relay 0.3 declares none. */
export type RelayFeature =
  | 'voce-datas' | 'avisos-com-nomes' | 'depoimentos-enviados' | 'removidos' | 'fila-com-topico' | 'denuncia-dispensar' | 'reacoes-do-topico'
  | 'topicos-sem-categoria' | 'respostas-recentes' | 'lista-completa' | 'temas-de-paginas' | 'pessoas-em-alta' | 'postagem-detalhe'
  // 0.3.2 (docs/API-SOCIAL-NETWORK.md, 16.1)
  | 'inicio' | 'ordem-por-pessoas' | 'vocabulario' | 'anuncios'
  // 0.4.0 (docs/API-SOCIAL-NETWORK.md, 17.1): private messages, only when the operator turns the feature on
  | 'mensagens'
  // 0.5.0 and 0.9.0: images (only when the operator turns `midia` on), the profile gallery, and photos on the profile
  | 'midia' | 'galeria-de-perfil' | 'midia-de-perfil'
  // 0.11.0 (proposal 0013): attachments without approval on posts, replies, forum topics and forum replies
  | 'midia-livre'
  // 0.11.0 part 3: video attachments (only when the operator turns `RELAY_VIDEO` on)
  | 'video'
  // 0.10.0 (proposal 0012, docs/PROTOCOL.md section 20)
  | 'setas' | 'karma' | 'ranking' | 'conquistas' | 'dono-humano' | 'postagens-ordenadas'
  // 0.11.0 part 2 (proposal 0013): editing what was published, with the public history
  | 'edicao'

export interface SocialClient {
  /** GET /v1/info (7.7): `social` false hides the social screens. */
  info(): Promise<RelayInfo>
  /**
   * Does the relay declare this 0.3.1 feature in `/v1/info`? Failing to read `info` counts as "no": the screen falls back to what 0.3 already did
   * instead of breaking. The demonstration client declares all of them, to show the screens.
   */
  suporta(resource: RelayFeature): Promise<boolean>

  // ---- rover page (7.1) ----
  /** GET /v1/rovers/:uid/pagina */
  paginaDoRover(ref: string): Promise<RoverPage>
  /** GET /v1/rovers/:uid/recados */
  recados(uid: string, cursor?: string): Promise<Page<Note>>
  /** GET /v1/rovers/:uid/depoimentos?estado= (`pendentes` only for the rover itself) */
  depoimentos(uid: string, options?: { estado?: 'aceitos' | 'pendentes'; cursor?: string }): Promise<Page<Testimonial>>
  /** GET /v1/rovers/:uid/depoimentos?estado=enviados (0.3.1 `depoimentos-enviados`; only the rover itself) */
  depoimentosEnviados(uid: string, cursor?: string): Promise<Page<TestimonialSent>>
  /** GET /v1/rovers/:uid/removidos (0.3.1 `removidos`; only the rover itself): what moderation hid from the rover. */
  removidos(uid: string, cursor?: string): Promise<Page<Removed>>
  /** GET /v1/rovers/:uid/entregas */
  entregas(uid: string, cursor?: string): Promise<Page<Delivery>>
  /** GET /v1/rovers/:uid/amigos (403 `grafo-privado` when closed) */
  amigos(uid: string, cursor?: string): Promise<Page<FriendItem>>
  /** GET /v1/rovers/:uid/amigos-em-comum?com= */
  amigosEmComum(uid: string, using: string, cursor?: string): Promise<Page<RoverSummary>>
  /** GET /v1/rovers/:uid/comunidades */
  comunidadesDoRover(uid: string, cursor?: string): Promise<Page<{ comunidade: CommunityCardData; papel: 'dono' | 'moderador' | 'membro' }>>
  /** GET /v1/rovers/:uid/paginas */
  paginasDoRover(uid: string, cursor?: string): Promise<Page<{ pagina: PageCardData; relacao: 'dono' | 'administrador' | 'seguidor' }>>
  /** GET /v1/rovers/:uid/amizades/pendentes (own) */
  amizadesPendentes(uid: string): Promise<FriendRequests>
  /** GET /v1/rovers/:uid/convites (own) */
  convites(uid: string): Promise<ReceivedInvite[]>
  /** GET /v1/rovers/:uid/relacoes (own) */
  relacoes(uid: string, cursor?: string): Promise<Page<RelationItem>>
  /** GET /v1/rovers/:uid/notificacoes (own) */
  notificacoes(uid: string, cursor?: string): Promise<Page<Notification>>
  /** GET /v1/rovers/:uid/notificacoes/contagem?desde= (own) */
  contagemDeNotificacoes(uid: string, since?: number): Promise<number>

  // ---- comunidades (7.2) ----
  /** GET /v1/comunidades */
  comunidades(options?: { tema?: string; acesso?: Exclude<Access, 'fechada'>; ordem?: ListedOrder; cursor?: string }): Promise<Page<CommunityCardData>>
  /** GET /v1/comunidades/:id. For the invitee of a closed one it returns only the minimal card. */
  comunidade(id: string): Promise<Community | MinimalCommunity>
  /** GET /v1/comunidades/:id/membros */
  membros(id: string, cursor?: string): Promise<Page<MemberItem>>
  /** GET /v1/comunidades/:id/pedidos (moderador) */
  pedidosDeEntrada(id: string): Promise<Page<JoinRequest>>
  /** GET /v1/comunidades/:id/convites (moderador) */
  convitesDaComunidade(id: string): Promise<Page<SentInvite>>
  /** GET /v1/comunidades/:id/banidos (moderador) */
  banidos(id: string): Promise<Page<BannedItem>>
  /** GET /v1/comunidades/:id/topicos */
  topicos(
    id: string,
    options?: {
      categoria?: string; tag?: string; ordem?: TopicOrder; cursor?: string
      /** 0.3.2: `em-alta` only looks at this window (relay default: 24h) */
      janela?: Window
      /** 0.3.2 (`vocabulario`): filters by a status or label key of the community */
      status?: string; etiqueta?: string
    },
  ): Promise<TopicList>
  /** GET /v1/comunidades/:id/moderacao/fila (moderador) */
  filaDeModeracao(id: string): Promise<ModerationQueue>
  /** GET /v1/comunidades/:id/moderacao/registro */
  registroDaComunidade(id: string, cursor?: string): Promise<Page<ModerationLog>>

  // ---- forum (7.3) ----
  /** GET /v1/topicos/:id (410 `removido` when hidden) */
  topico(id: string): Promise<Topic>
  /** GET /v1/topicos/:id/respostas?em= (ascending order; 0.3.2: `ordem=melhores|em-alta` by distinct people) */
  respostas(topic: string, options?: { em?: string; cursor?: string; ordem?: ReplyOrder; janela?: Window }): Promise<Page<ForumReply>>
  /**
   * The id of the TOPIC an object of the forum belongs to (a topic answers its own id; a reply, that of its topic).
   * It exists because the notice of a reply, quote and mention points to the id of the REPLY. GET /v1/objetos/:id.
   */
  topicoDeObjeto(id: string): Promise<string>
  /** GET /v1/topicos/:id/historico */
  historico(topic: string): Promise<TopicVersion[]>
  /**
   * 0.11.0 part 2 (`edicao`): GET /v1/objetos/:id/edicoes, the public history of a post, a reply, a topic or a forum reply (the
   * original and every edit, oldest first). `nao-encontrado` on a relay without the resource.
   */
  edicoes(id: string): Promise<EditHistory>

  // ---- pages (7.4) ----
  /** GET /v1/paginas */
  paginas(options?: { tema?: string; ordem?: ListedOrder; cursor?: string }): Promise<Page<PageCardData>>
  /** GET /v1/paginas/temas (0.3.1 `temas-de-paginas`): the themes of open pages, from most used to least. */
  temasDePaginas(): Promise<PageTheme[]>
  /** GET /v1/paginas/:id */
  pagina(id: string): Promise<ProjectPage>
  /** GET /v1/paginas/:id/atualizacoes */
  atualizacoes(id: string, cursor?: string): Promise<Page<Update>>
  /** GET /v1/paginas/:id/seguidores */
  seguidoresDaPagina(id: string, cursor?: string): Promise<Page<RoverSummary>>
  /** GET /v1/linha/inicio?tipos=postagem,pagina-publicar */
  linhaMista(cursor?: string): Promise<Page<TimelineItem>>

  // ---- search and discovery (7.5) ----
  /** GET /v1/busca?q=&tipo=todos (up to 5 of each) */
  buscarTudo(q: string): Promise<SocialSearchResult>
  /** GET /v1/busca?q=&tipo= (paginada) */
  buscarTipo(q: string, type: 'rovers', cursor?: string): Promise<Page<SearchedRover>>
  buscarTipo(q: string, type: 'comunidades', cursor?: string): Promise<Page<CommunityCardData>>
  buscarTipo(q: string, type: 'topicos', cursor?: string, options?: { ordem?: SearchOrder; janela?: Window }): Promise<Page<import('./types').TopicCardData>>
  buscarTipo(q: string, type: 'paginas', cursor?: string): Promise<Page<PageCardData>>
  buscarTipo(q: string, type: SearchType, cursor?: string): Promise<Page<unknown>>
  /** GET /v1/descobrir/em-alta?tipo=&janela= */
  emAlta(type: 'topicos', window?: Window): Promise<import('./types').TopicCardData[]>
  emAlta(type: 'comunidades', window?: Window): Promise<CommunityCardData[]>
  emAlta(type: 'paginas', window?: Window): Promise<PageCardData[]>
  emAlta(type: TrendingType, window?: Window): Promise<unknown[]>
  /** GET /v1/descobrir/recem-chegados */
  recemChegadosSociais(limit?: number): Promise<Newcomer[]>
  /** GET /v1/descobrir/sugestoes (only from what is declared: the relay does not know what the person has read) */
  sugestoes(type: 'comunidades', interests?: string[]): Promise<CommunityCardData[]>
  sugestoes(type: 'paginas', interests?: string[]): Promise<PageCardData[]>
  sugestoes(type: 'rovers', interests?: string[]): Promise<SearchedRover[]>
  sugestoes(type: SuggestionType, interests?: string[]): Promise<unknown[]>
  /** GET /v1/descobrir/tendencias */
  tendencias(window?: Window): Promise<Trend[]>
  /** GET /v1/moderacao/registro (from the relay) */
  registroDoRele(cursor?: string): Promise<Page<ModerationLog>>

  // ---- 0.3.2 ----
  /** GET /v1/anuncios (`anuncios`): the relay operator announcements, pinned first. Without the feature (relay 0.3 and 0.3.1) it comes empty and the route is not even called. */
  anuncios(cursor?: string): Promise<Page<Announcement>>
  /**
   * GET /v1/inicio?desde= (`inicio`, its own route): counts and ids of what changed for the person's rover. `null` when the relay does not declare the
   * feature or the reader has no credential. It never brings anyone's text.
   */
  inicio(since?: number): Promise<RelayHome | null>

  // ---- 0.4.0: private messages (docs/API-SOCIAL-NETWORK.md, 17.3; own routes) ----
  // The text arrives in clear because whoever decrypts is the person's app. Without the `mensagens` feature (or without the app), these reads
  // throw `versao-nao-suportada` and the screen explains.
  /** GET /v1/rovers/:uid/conversas?estado= */
  conversas(uid: string, options?: { estado?: ConversationFilter; cursor?: string }): Promise<Page<Conversation>>
  /** GET /v1/rovers/:uid/conversas/:id (`nao-encontrado` when the reader is not one of the sides) */
  conversa(uid: string, id: string): Promise<Conversation>
  /** GET /v1/rovers/:uid/conversas/:id/mensagens, already decrypted by the app, oldest to newest */
  mensagensDaConversa(uid: string, id: string, cursor?: string): Promise<Page<ClearMessage>>
}

// ---- writing (always goes through the app bridge, where the key and the approval live) ----------------------

/** Free gestures: the person taps and leaves (with a touch badge), unless they required approval for the type. */
export type SocialAct =
  | { tipo: 'estado'; estado: RoverState }
  | { tipo: 'amizade'; alvo: string; acao: 'pedir' | 'aceitar' | 'recusar' | 'desfazer' }
  | { tipo: 'relacao'; alvo: string; acao: 'bloquear' | 'desbloquear' | 'silenciar' | 'dessilenciar' }
  | { tipo: 'selo'; alvo: string; selo: BadgeType }
  | { tipo: 'depoimento-decisao'; depoimento: string; decisao: 'aceitar' | 'recusar' }
  | { tipo: 'comunidade-adesao'; comunidade: string; acao: 'entrar' | 'sair' | 'aceitar-convite' | 'recusar-convite' | 'cancelar-pedido' }
  | {
      tipo: 'comunidade-gestao'
      comunidade: string
      alvo: string
      acao: 'convidar' | 'cancelar-convite' | 'aprovar-pedido' | 'recusar-pedido' | 'expulsar' | 'banir' | 'desbanir' | 'promover' | 'rebaixar'
      /** required on expel and ban; null on the others */
      motivo: ModerationReason | null
    }
  | { tipo: 'topico-gestao'; topico: string; acao: 'fixar' | 'desafixar' | 'trancar' | 'destrancar' | 'mover'; comunidade: string | null; categoria: string | null }
  | { tipo: 'topico-resolvido'; topico: string; resposta: string | null }
  | { tipo: 'voto'; topico: string; opcao: number }
  | { tipo: 'pagina-seguir'; pagina: string; acao: 'seguir' | 'deixar' }
  | { tipo: 'pagina-gestao'; pagina: string; alvo: string; acao: 'adicionar-admin' | 'remover-admin' }
  | { tipo: 'remocao-por-responsavel'; alvo: string; motivo: ModerationReason }
  | { tipo: 'remocao-pelo-autor'; alvo: string }
  | { tipo: 'apelacao-decisao'; apelacao: string; resultado: 'mantida' | 'revertida' }
  | { tipo: 'denuncia'; alvo: string; motivo: import('./types').SocialReportReason }
  /** 0.3.1 (`denuncia-dispensar`): moderation concludes there is nothing to do. It only takes the report off the queue; the content stays visible. */
  | { tipo: 'denuncia-dispensar'; comunidade: string; alvo: string }
  /**
   * 0.4.0: the decision on a conversation request. REQUIRES the person's approval (their tap, with confirmation, is the approval in the app):
   * accept and refuse only by the one who received; close by both sides (on a pending one, only the one who asked: it is cancelling).
   */
  | { tipo: 'conversa-decidir'; conversa: string; decisao: 'aceitar' | 'recusar' | 'encerrar' }
  /** 0.4.0: deletes THIS side's copy of a message, or of all of them (`mensagem: null`). Free. */
  | { tipo: 'conversa-apagar'; conversa: string; mensagem: string | null }
  /** 0.4.0: the recipient reports, revealing to the operator the text and the letter signature (the app does the revealing). Free. */
  | { tipo: 'mensagem-denuncia'; mensagem: string; motivo: import('./types').SocialReportReason }

export type ActType = SocialAct['tipo']

/** What the relay returns in `resultado` when the effect is not obvious (section 1.3). */
export type ActResult = { resultado?: 'pendente' | 'ativa' | 'nenhuma' | 'membro' | 'fora' | 'aceito' | 'recusado' | 'recusada' | 'encerrada' }
