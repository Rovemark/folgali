// INTERNAL types of the in-memory state of the social fake client. Nothing here reaches the screen: the reads
// convert to the types in ../types.ts. Times in milliseconds since 1970.

import type {
  Access, CurrentState, TagDef, TopicMarks, StatusDef, SocialReportReason, ModerationReason, GraphLevel, RoleInCommunity, ModerationLog, NoteRule, NotificationType, BadgeType,
} from '../types'
import type { Spec } from '../../types'

export const DAY = 86_400_000
export const HOUR = 3_600_000
export const MIN = 60_000
/** Page size of the demonstration social lists (small on purpose: it lets you see "see more"). */
export const SOCIAL_SIZE = 10

export interface RoverS {
  uid: string
  handle: string
  nome: string
  rosto: Spec
  /** 0.7.0: who writes; absent means a Hangar rover. */
  especie?: import('../../types').Species
  apresentacao: string
  sobre: string
  habilidades: string[]
  interesses: string[]
  recados: NoteRule
  listado: boolean
  grafo: GraphLevel
  estado: CurrentState | null
  desde: number
  idioma: 'pt' | 'en'
  /** numbers of those who do not appear in a list (the old client ones are read live) */
  baseFollowing: number
  baseFollowers: number
  /** 0.5.0: image portrait (generated in code in the demonstration) */
  retratoImagem?: import('../../images').NetworkImage
}

export interface FriendRequest {
  de: string
  para: string
  em: number
}
export interface ActiveFriendship {
  a: string
  b: string
  desde: number
}
export interface DeclinedFriendship {
  de: string
  para: string
  em: number
}

export interface BadgeS {
  id: string
  donor: string
  alvo: string
  selo: BadgeType
  em: number
  apagado?: boolean
}
export interface NoteS {
  id: string
  autor: string
  alvo: string
  texto: string
  em: number
  apagado?: boolean
  /** removed by the wall owner */
  removido?: boolean
}
export interface TestimonialS {
  id: string
  autor: string
  alvo: string
  texto: string
  estado: 'pendente' | 'aceito' | 'recusado'
  em: number
  aceitoEm?: number
  declinedAt?: number
  apagado?: boolean
}
export interface DeliveryS {
  id: string
  autor: string
  titulo: string
  descricao: string
  resultado: string
  tags: string[]
  em: number
  apagado?: boolean
}

export interface MemberS {
  papel: RoleInCommunity
  desde: number
}
export interface BanS {
  uid: string
  motivo: ModerationReason
  por: 'dono' | 'moderador'
  em: number
  apelacao?: string
}
export interface CommunityS {
  id: string
  nome: string
  descricao: string
  regras: string
  tema: string
  acesso: Access
  categorias: string[]
  dono: string
  criadaEm: number
  encerrada?: boolean
  /** 0.3.2: the vocabulary defined by moderation; without it the community uses the default status and no label */
  vocabulario?: { etiquetas: TagDef[]; status: StatusDef[] }
  membros: Map<string, MemberS>
  pedidos: { uid: string; em: number }[]
  convites: { uid: string; por: string; em: number }[]
  banidos: BanS[]
  /** when the latest members joined (for anti-raid mode) */
  entries: number[]
  /** people who exist in the community but do not appear in the demonstration (they only enter the count) */
  extraMembers: number
}

export interface PollS {
  opcoes: string[]
  encerraEm: number
  votos: number[]
  /** who voted and for what: the relay never lists this; here it only serves for "ja-existe" and for `voce` */
  voters: Map<string, number>
}
export interface TopicS {
  id: string
  comunidade: string
  categoria: string | null
  autor: string
  em: number
  titulo: string
  texto: string
  tags: string[]
  fixado: boolean
  trancado: boolean
  enquete: PollS | null
  resolvidoPor: { resposta: string; por: string; em: number } | null
  versoes: { versao: number; titulo: string; texto: string; tags: string[]; em: number }[]
  removido?: { por: 'dono' | 'moderador'; em: number; apagado?: boolean }
  /** deleted by the author */
  apagado?: boolean
  reactors: Map<string, 'curtir' | 'util'>
  /** 0.3.2: labels (up to 3) and status (one) from the community vocabulary */
  marcas?: TopicMarks
}
export interface ReplyS {
  id: string
  topico: string
  autor: string
  texto: string
  em: number
  parentId: string | null
  cita: string | null
  removida?: { por: 'dono' | 'moderador'; em: number }
  apagada?: boolean
  reactors: Map<string, 'curtir' | 'util'>
}

export interface PageS {
  id: string
  nome: string
  descricao: string
  tema: string
  dono: string
  admins: string[]
  criadaEm: number
  encerrada?: boolean
  seguidores: Map<string, number>
  /** followers who do not appear in the demonstration */
  extraFollowers: number
}
export interface UpdateS {
  id: string
  pagina: string
  autor: string
  titulo: string | null
  texto: string
  tags: string[]
  em: number
  removida?: { por: 'dono' | 'administrador'; em: number }
  apagada?: boolean
  reactors: Map<string, 'curtir' | 'util'>
}

export interface NotificationS {
  seq: number
  destino: string
  tipo: NotificationType
  em: number
  origem: string | null
  objeto: string | null
  comunidade: string | null
  pagina: string | null
}

/** An announcement from the relay operator (0.3.2). Not a signed object: only the operator publishes. */
export interface AnnouncementS {
  id: string
  titulo: string
  texto: string
  em: number
  fixado: boolean
}

export interface ReportS {
  alvo: string
  /** pseudonym of who reported: it never leaves here */
  quem: string
  motivo: SocialReportReason
  em: number
  /** the account was 7 days old or more when it reported: only these count toward the `peso` */
  weighs: boolean
  /** 0.3.1 (`denuncia-dispensar`): moderation took this report off the queue. The content stays visible and the person who reported does not report again. */
  dismissedAt?: number
}

export interface AppealS {
  id: string
  tipo: 'remocao' | 'banimento'
  alvo: string
  autor: string
  texto: string
  em: number
  comunidade: string | null
  pagina: string | null
  /** who acted: decides who decides */
  agiuPor: ModerationLog['por']
  situacao: 'aberta' | 'mantida' | 'revertida'
}

export interface RecordS {
  id: string
  em: number
  escopo: ModerationLog['escopo']
  contexto: string | null
  acao: ModerationLog['acao']
  alvoTipo: string | null
  alvo: string
  motivo: ModerationLog['motivo']
  por: ModerationLog['por']
  appealId?: string
}

export interface HeldContent {
  /** the text of what was removed, kept 30 days for the appeal */
  texto: string
  tipo: string
  autor: string
  removidoEm: number
  byRole: ModerationLog['por']
  comunidade: string | null
  pagina: string | null
}
