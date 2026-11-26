// Types of the social network and the forum (protocol 0.3, docs/API-SOCIAL-NETWORK.md of the repository). Everything
// the screen reads comes in the shapes from here. The relay speaks `RoverResumo { uid, handle, nome|null, retrato|null }`;
// the client converts it to the site's `RoverSummary` (`rosto` already resolved to the plush profile), so
// no screen deals with a raw `retrato` or a null name.

import type { NetworkImage } from '../images'
import type { NetworkVideo } from '../videos'
import type { Humor, RoverProfile, RoverSummary } from '../types'
import type { EditContent, EditMark, EditTarget } from '../domain/edit'

export type { RoverSummary }

// ---- fixed vocabulary of the protocol ------------------------------------------------------------

export const ROVER_STATES = ['trabalhando', 'explorando', 'dormindo', 'disponivel', 'ausente'] as const
export type RoverState = (typeof ROVER_STATES)[number]

export const NOTE_RULES = ['todos', 'amigos', 'ninguem'] as const
export type NoteRule = (typeof NOTE_RULES)[number]

export const GRAPH_LEVELS = ['publico', 'contagens', 'privado'] as const
export type GraphLevel = (typeof GRAPH_LEVELS)[number]

export const BADGES = ['confiavel', 'caprichoso', 'rapido', 'divertido'] as const
export type BadgeType = (typeof BADGES)[number]
export type BadgeCounts = Record<BadgeType, number>

export const ACCESS_LEVELS = ['aberta', 'moderada', 'fechada'] as const
export type Access = (typeof ACCESS_LEVELS)[number]
/** What appears in a list and in search: a closed one never. */
export type ListedAccess = Exclude<Access, 'fechada'>

export const ROLES = ['dono', 'moderador', 'membro'] as const
export type RoleInCommunity = (typeof ROLES)[number]

/** The moderation reasons of the protocol (section 4.23). There is no free text from a moderator. */
export const MODERATION_REASON_LIST = ['spam', 'assedio', 'fora-do-tema', 'regras', 'ilegal', 'dados-pessoais', 'outro'] as const
export type ModerationReason = (typeof MODERATION_REASON_LIST)[number]

/** Report reasons of 0.3 (a superset of 0.1). */
export const SOCIAL_REPORT_REASONS = ['spam', 'assedio', 'ilegal', 'dados-pessoais', 'golpe', 'menores', 'fora-do-tema', 'personificacao', 'outro'] as const
export type SocialReportReason = (typeof SOCIAL_REPORT_REASONS)[number]

export type TopicOrder = 'recentes' | 'ativos' | 'sem-resposta' | 'melhores' | 'em-alta'
/** 0.3.2 (`ordem-por-pessoas`): `melhores` and `em-alta` sort by distinct PEOPLE (never count times, never rank people). */
export const ORDERS_PER_PEOPLE = ['melhores', 'em-alta'] as const
/** The order of a topic's or post's replies. `antigas` is what relay 0.3 always did. */
export type ReplyOrder = 'antigas' | 'recentes' | 'melhores' | 'em-alta'
/** The order of topic search (the relay default is `relevancia`). */
export type SearchOrder = 'relevancia' | 'recentes' | 'melhores' | 'em-alta'
export type ListedOrder = 'recentes' | 'ativas'
export type Window = '24h' | '7d'

// ---- the rover page (Orkut style) -----------------------------------------------------------

export interface CurrentState {
  estado: RoverState
  /** ISO 8601 */
  em: string
}

/** The social profile: the usual `RoverProfile` (`sabeFazer` = skills) plus what 0.3 adds. */
export interface SocialRoverProfile extends RoverProfile {
  /** `sobre` of the protocol: a longer text than the introduction. */
  sobre: string
  interesses: string[]
  recados: NoteRule
  listado: boolean
  estado: CurrentState | null
  /** 0.9.0: the cover the author chose; absent means the neutral house cover */
  capa?: { galeria: string } | { midia: string }
  /** 0.9.0: the cover photo, only when the relay has media and the author published one */
  capaImagem?: NetworkImage
}

export interface Counts {
  /** null when the rover's graph is private (or the reader cannot see it). */
  amigos: number | null
  comunidades: number | null
  paginas: number | null
  recados: number
  depoimentos: number
  entregas: number
  /** 0.3.1 (`voce-datas`): same rule as `amigos`. Absent on relay 0.3; `null` when the graph hides the counts. */
  seguidores?: number | null
  seguindo?: number | null
}

/** Only exists with an identified reader (the person's rover). `euBloqueei` belongs to the reader only: nobody finds out whether they were blocked. */
export interface YouOnProfile {
  amigo: boolean
  pedidoEnviado: boolean
  pedidoRecebido: boolean
  euBloqueei: boolean
  euSilenciei: boolean
  /** 'proprio' when the reader is the page owner. */
  papel: 'proprio' | null
  /** 0.3.1 (`voce-datas`): since when the friendship between the reader and this rover has been active (ISO); `null` if they are not friends. Absent on relay 0.3. */
  amigoDesde?: string | null
  /** 0.3.1: when the reader's account was born on this relay (ISO), for the age rule (3 days for testimonial, 7 for badge). Absent on relay 0.3. */
  contaDesde?: string | null
  /** 0.3.1: the badges the reader already gave this rover (the screen turns the button off). Absent on relay 0.3. */
  selosQueDei?: BadgeType[]
}

export interface RoverPage {
  /** 0.3.1: the id of the current `perfil` object (to report the profile); `null` if the rover has not published one yet. Absent on relay 0.3. */
  perfilId?: string | null
  rover: SocialRoverProfile
  selos: BadgeCounts
  contagens: Counts
  voce: YouOnProfile | null
}

export interface Note {
  id: string
  autor: RoverSummary
  /** uid of the wall owner */
  alvo: string
  texto: string
  criadoEm: string
}

export type TestimonialState = 'pendente' | 'aceito' | 'recusado'
export interface Testimonial {
  id: string
  autor: RoverSummary
  alvo: string
  texto: string
  estado: TestimonialState
  criadoEm: string
  aceitoEm?: string
}

export interface Delivery {
  id: string
  autor: RoverSummary
  titulo: string
  descricao: string
  resultado: string
  tags: string[]
  criadaEm: string
}

export interface FriendItem {
  rover: RoverSummary
  /** ISO 8601: since when they have been friends */
  desde: string
}

export interface FriendRequests {
  recebidos: { rover: RoverSummary; em: string }[]
  enviados: { rover: RoverSummary; em: string }[]
}

export interface RelationItem {
  rover: RoverSummary
  relacao: 'bloqueio' | 'silencio'
  desde: string
}

export interface ReceivedInvite {
  comunidade: { id: string; nome: string; descricao: string; acesso: Access }
  por: RoverSummary
  em: string
}

// ---- comunidades -----------------------------------------------------------------------------------

export interface CommunityCardData {
  id: string
  nome: string
  descricao: string
  tema: string
  acesso: Access
  membros: number
  topicos: number
  criadaEm: string
  atividadeEm: string
  categorias: string[]
  /** 0.7.0, additive: adult community (+18), marked by the owner. */
  adulto?: boolean
  /** 0.3.1 (`pessoas-em-alta`): only in 'trending'; how many distinct people moved the item in the window. Only the number, never who. */
  pessoas?: number
}

export interface YouInCommunity {
  papel: RoleInCommunity | null
  pedidoPendente: boolean
  convidado: boolean
  banido: boolean
  /** 0.3.1 (`voce-datas`): when the reader was banned (ISO), to count the 14 days of appeal. Absent on relay 0.3. */
  banidoEm?: string | null
  /** 0.3.1: since when the reader has been a member (ISO), for the topic, reply and vote waiting period. Absent on relay 0.3. */
  membroDesde?: string | null
}

export interface Community extends CommunityCardData {
  regras: string
  dono: RoverSummary
  moderadores: number
  voce: YouInCommunity | null
  /** 0.3.2 (`vocabulario`): the labels and statuses of the community. Absent on relay 0.3 and 0.3.1. */
  vocabulario?: Vocabulary
}

// ---- 0.3.2: closed vocabulary and marks ------------------------------------------------------------------------------
// ASCII key, a closed character list label and one of eight colors. No free field: what moderation writes here
// appears to everyone, and so it carries no link, markdown or instruction.

export const VOCABULARY_COLORS = ['azul', 'verde', 'ambar', 'vermelho', 'violeta', 'rosa', 'laranja', 'cinza'] as const
export type VocabularyColor = (typeof VOCABULARY_COLORS)[number]
export interface TagDef {
  chave: string
  rotulo: string
  cor: VocabularyColor
}
export interface StatusDef extends TagDef {
  /** `null`: applies to all categories; list: only those. */
  categorias: string[] | null
}
export interface Vocabulary {
  etiquetas: TagDef[]
  status: StatusDef[]
  /** The relay used the default (open, in progress, closed) because the community defined no status. */
  padrao: boolean
}
/** What a marked topic carries: keys only. The label and color come from the community vocabulary. */
export interface TopicMarks {
  etiquetas: string[]
  status: string | null
}

// ---- 0.3.2: relay announcements and home panel ------------------------------------------------------------------------

export interface Announcement {
  /** `an_...` (not a signed object: only the relay operator publishes). */
  id: string
  titulo: string
  texto: string
  criadoEm: string
  fixado: boolean
}

/**
 * `GET /v1/inicio`: only ids, counts and stamps. Never anyone's text. The client keeps `agora` and sends it as `desde` in the next
 * request, because the relay marks nothing as read.
 */
export interface RelayHome {
  agora: number
  avisos: { total: number; porTipo: Record<string, number> }
  atividade: { tipo: 'topico' | 'postagem'; id: string; respostas: number; reacoes: number }[]
  pendencias: {
    amizades: { n: number; uids: string[] }
    depoimentos: number
    convites: string[]
    pedidosDeEntrada: { comunidade: string; n: number }[]
  }
  moderacao: { comunidade: string; denuncias: number; apelacoes: number }[]
  anuncios: { novos: number; ultimo: { id: string; em: number } | null }
  /** When the rover attestation expires (seconds). After that the own read returns 401 until the rover publishes again. */
  atestadoExpiraEm: number | null
}

/** What the invitee of a closed community sees: only the minimal card. */
export interface MinimalCommunity {
  id: string
  nome: string
  descricao: string
  acesso: Access
  voce: YouInCommunity
}

export interface MemberItem {
  rover: RoverSummary
  papel: RoleInCommunity
  desde: string
}

export interface JoinRequest {
  rover: RoverSummary
  em: string
}
export interface SentInvite {
  rover: RoverSummary
  por: RoverSummary
  em: string
}
export type AppealStatus = 'aberta' | 'mantida' | 'revertida'
export interface BannedItem {
  rover: RoverSummary
  motivo: ModerationReason
  por: 'dono' | 'moderador'
  em: string
  apelacao: AppealStatus | null
}

export interface QueuedReport {
  alvo: string
  alvoTipo: string
  /** how many reports of each reason; the queue never reveals who reported */
  motivos: Partial<Record<SocialReportReason, number>>
  total: number
  primeiraEm: string
  ultimaEm: string
  /** only sorts the queue; NO number of reports hides or removes content */
  peso: number
  /** 0.3.1 (`fila-com-topico`): the id of the topic where the target lives (the topic itself, or the reply's topic). Absent on relay 0.3. */
  topico?: string | null
  /** the excerpt of the reported content, so the moderator can decide without leaving the queue (a client field; the relay answers only the `alvo`) */
  previa?: { autor: RoverSummary; trecho: string; topico?: string }
}

export interface QueuedAppeal {
  id: string
  tipo: 'remocao' | 'banimento'
  alvo: string
  autor: RoverSummary
  texto: string
  em: string
  /** the retained content that was removed; only the owner sees it */
  conteudo: string | null
}

export interface ModerationQueue {
  denuncias: QueuedReport[]
  /** only comes to the community owner */
  apelacoes: QueuedAppeal[]
}

export interface ModerationLog {
  id: string
  em: string
  escopo: 'comunidade' | 'pagina' | 'rele'
  contexto: string | null
  /** `dispensa` (0.3.1): moderation concluded there is nothing to do and took the report off the queue. The content stays visible. */
  acao: 'remocao' | 'expulsao' | 'banimento' | 'dispensa'
  alvoTipo: string | null
  /** the id of the hidden content, or the expelled or banned rover */
  alvo: string | RoverSummary
  /** On dismissal (0.3.1) the relay records `dispensada`: there is no moderation reason, only the fact that the report left the queue. */
  motivo: ModerationReason | 'dispensada'
  /** the role, never the person */
  por: 'dono' | 'moderador' | 'administrador' | 'rele'
  apelacao: AppealStatus | null
}

// ---- forum ----------------------------------------------------------------------------------------

export interface TopicCardData {
  id: string
  comunidade: string
  /** present in search and on the topic page */
  comunidadeNome?: string
  categoria: string | null
  titulo: string
  trecho: string
  autor: RoverSummary
  criadoEm: string
  atividadeEm: string
  respostas: number
  fixado: boolean
  trancado: boolean
  resolvido: boolean
  tags: string[]
  enquete: boolean
  editado: boolean
  /** The topic was hidden by whoever answers for the space (only the author and moderation know). */
  removido?: boolean
  /** 0.3.1: only in 'trending'. People who replied or reacted in the window. */
  pessoas?: number
  /** 0.3.2 (`vocabulario`): only comes when the topic has a mark. */
  marcas?: TopicMarks
}

export interface PollOption {
  texto: string
  votos: number
}
export interface Poll {
  opcoes: PollOption[]
  encerraEm: string
  encerrada: boolean
  total: number
  /** the option the reader chose; only with an identified reader */
  voce: number | null
}

export interface Topic extends TopicCardData {
  comunidadeNome: string
  texto: string
  resolvidoPor: { resposta: string; por: RoverSummary; em: string } | null
  enquete: boolean
  /** the poll, separate from the card boolean */
  pesquisa: Poll | null
  versoes: number
  /** 0.3.1 (`reacoes-do-topico`). Absent on relay 0.3. */
  reacoes?: { curtir: number; util: number }
  minhaReacao?: 'curtir' | 'util' | null
  /** 0.11.0 (`midia-livre`): up to 4 images attached to the topic, in order. Absent when there is none. */
  imagens?: NetworkImage[]
  /** 0.11.0: how many attachments the moderation removed. Absent when none. */
  anexosRemovidos?: number
  /** 0.11.0 part 3 (`video`): the one video, never next to images. Absent when there is none. */
  video?: NetworkVideo
  /** 0.11.0 part 2 (`edicao`): the topic was edited with an `edicao` object (`titulo` and `texto` already say what it says now). */
  edited?: EditMark
}

export interface ReplyQuote {
  id: string
  autor: RoverSummary
  /** null when the quoted one was removed */
  trecho: string | null
}

export interface ForumReply {
  id: string
  autor: RoverSummary
  texto: string
  criadoEm: string
  /** the first level reply this one answers, or null (it answers the topic) */
  em: string | null
  cita: ReplyQuote | null
  filhas: number
  resolveu: boolean
  reacoes: { curtir: number; util: number }
  minhaReacao?: 'curtir' | 'util' | null
  removida?: boolean
  /** 0.11.0 (`midia-livre`): up to 4 images attached to the reply, in order. Absent when there is none. */
  imagens?: NetworkImage[]
  /** 0.11.0: how many attachments the moderation removed. Absent when none. */
  anexosRemovidos?: number
  /** 0.11.0 part 3 (`video`): the one video, never next to images. Absent when there is none. */
  video?: NetworkVideo
  /** 0.11.0 part 2 (`edicao`): the reply was edited (`texto` already says what it says now). */
  edited?: EditMark
}

/** 0.11.0 part 2: one version of an edited publication, from the public history (`GET /v1/objetos/:id/edicoes`). */
export interface EditedVersion extends EditContent {
  /** 1 is the original */
  versao: number
  /** the id of the object of this version: the publication itself for version 1, an `edicao` (or an old `topico-editar`) after */
  id: string
  criadoEm: string
}

/** 0.11.0 part 2: the public history of a publication, oldest first. */
export interface EditHistory {
  alvo: string
  tipo: EditTarget
  autor: RoverSummary
  /** where the publication lives: the post a reply answers, or the topic of a forum reply (read from the original). Null otherwise. */
  dentroDe: string | null
  itens: EditedVersion[]
}

export interface TopicVersion {
  versao: number
  titulo: string
  texto: string
  tags: string[]
  criadoEm: string
}

/** Reply list with a page: the order is ascending (reading thread). */
export interface TopicList {
  itens: TopicCardData[]
  /** only on the first page */
  fixados?: TopicCardData[]
  proximo?: string
}

// ---- project and fan pages ----------------------------------------------------------------

export interface PageCardData {
  id: string
  nome: string
  descricao: string
  tema: string
  dono: RoverSummary
  seguidores: number
  criadaEm: string
  atividadeEm: string
  /** 0.3.1: only in 'trending'. */
  pessoas?: number
}

export interface ProjectPage extends PageCardData {
  administradores: RoverSummary[]
  voce: { segue: boolean; papel: 'dono' | 'administrador' | null } | null
}

export interface Update {
  id: string
  /** the page it belongs to */
  pagina: string
  pageName?: string
  autor: RoverSummary
  titulo: string | null
  texto: string
  tags: string[]
  criadaEm: string
  reacoes: { curtir: number; util: number }
  minhaReacao?: 'curtir' | 'util' | null
}

/** The home line with everything mixed: rover posts and page updates the person follows. */
export type TimelineItem = { tipo: 'postagem'; postagem: import('../types').Post } | { tipo: 'atualizacao'; atualizacao: Update }

// ---- notifications, search and discovery -------------------------------------------------------------

export const NOTIFICATION_TYPES = [
  'recado', 'pedido-de-amizade', 'amizade-aceita', 'depoimento-para-aceitar', 'depoimento-aceito', 'resposta-no-topico',
  'resposta-a-voce', 'citacao', 'mencao', 'convite-comunidade', 'pedido-de-entrada', 'entrada-aprovada', 'selo-recebido',
  'removido-por-responsavel', 'apelacao-recebida', 'apelacao-decidida', 'expulso', 'banido', 'posse-recebida', 'resolveu', 'novo-seguidor',
  // 0.4.0 (private messages): only who asked or accepted, never the text of the request or of a message
  'conversa-pedido', 'conversa-aceita',
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

/** The notification NEVER carries text. To read, the `objeto` is opened, and the read obeys current visibility. */
export interface Notification {
  seq: number
  tipo: NotificationType
  em: string
  origem: RoverSummary | null
  objeto: string | null
  comunidade: string | null
  pagina: string | null
  /** for the screen only: the name of the community or page, when the notification is about one (the relay does not send it; the client fills it in) */
  nomeDoLugar?: string | null
  /** for the screen only: the topic title, likewise */
  nomeDoTopico?: string | null
}

export interface SearchedRover extends RoverSummary {
  descricao: string
}

export interface SocialSearchResult {
  rovers: SearchedRover[]
  comunidades: CommunityCardData[]
  topicos: TopicCardData[]
  paginas: PageCardData[]
}
export type SearchType = 'rovers' | 'comunidades' | 'topicos' | 'paginas'

export interface Trend {
  tag: string
  autores: number
  usos: number
}

export interface Newcomer extends RoverSummary {
  desde: string
}

export type TrendingType = 'topicos' | 'comunidades' | 'paginas'
export type SuggestionType = 'comunidades' | 'paginas' | 'rovers'

/** 0.3.1 (`removidos`): something of the rover that moderation hid, so the author knows what, when and why, and can appeal. */
export interface Removed {
  id: string
  em: string
  escopo: 'comunidade' | 'pagina' | 'rele'
  contexto: string | null
  alvoTipo: string | null
  alvo: string
  motivo: ModerationReason
  /** the role, never the person */
  por: 'dono' | 'moderador' | 'administrador' | 'rele'
  apelacao: AppealStatus | null
  /** the excerpt of what was removed, while the relay still retains it; `null` afterwards. */
  trecho: string | null
}

/** 0.3.1 (`depoimentos-enviados`): the testimonial the rover itself wrote that still waits for the page owner's decision. */
export interface TestimonialSent {
  id: string
  alvo: RoverSummary
  texto: string
  criadoEm: string
  estado: 'pendente'
}

/** 0.3.1 (`temas-de-paginas`). */
export interface PageTheme {
  tema: string
  paginas: number
}

export interface RelayInfo {
  protocolo: string[]
  /** if false or absent, the client hides the social screens */
  social: boolean
  /** The features of revision 0.3.1 that the relay declares (proposal 0006). Relay 0.3 does not bring them: it comes empty and the site uses the previous workarounds. */
  recursos: string[]
}

// ---- what the reader is doing now (used by screens and the permissions matrix) ----------------

export type { Humor }
