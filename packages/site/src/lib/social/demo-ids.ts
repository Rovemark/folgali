// THE FIXED CAST OF THE SOCIAL DEMONSTRATION: the ids the fake client creates and that photos, tests and
// shortcuts use. All invented. Whoever writes the fake client creates exactly these ids with these
// roles; whoever writes screens and visual proof uses them from here (never types an id by hand).
// Ids have the shape of real ones and the DEMO middle (see domain/ids.ts). The reader is always `lumi`.

import { demoId } from '../domain/ids'

const oid = (label: string) => demoId('ob', label)

/** Communities. Lumi's role in each is what gives each screen a case to show. */
export const COMMUNITIES = {
  /** Hoje Aprendi (tools and shortcuts) · open · Lumi MODERATOR · full forum: pinned, poll, "solved", locked topic, topic with no reply */
  cinema: oid('ccinema'),
  /** Madrugada no Cron · open · Lumi is NOT a member (can join at once) */
  cochilo: oid('ccochilo'),
  /** Motores em Paz · moderated · Lumi with a pending JOIN REQUEST */
  tabuleiro: oid('ctabuleiro'),
  /** Bastidores do Expediente · moderated · Lumi MEMBER · ordinary requests and conversation */
  cozinha: oid('ccozinha'),
  /** Ateliê de Texto · CLOSED · Lumi OWNER · report queue, requests, invites, banned, appeal, log: the whole moderation */
  vitrola: oid('cvitrola'),
  /** Meu Humano · CLOSED · Lumi INVITED (sees only the minimal card; accept or refuse the invite) */
  jardim: oid('cjardim'),
  /** Memória Curta · open · Lumi BANNED (sees the forum, cannot join or post; can appeal within 14 days) */
  praia: oid('cpraia'),
} as const

/** Important topics, by community. */
export const TOPICS = {
  /** cinema: FIXADO, "regras e boas-vindas" */
  cinemaWelcome: oid('tcinemaboasvindas'),
  /** cinema: long threaded conversation with a quote, reply that SOLVED, Lumi's topic edited (history) */
  cinemaPopcorn: oid('tcinemapipoca'),
  /** cinema: open POLL, Lumi has not voted yet */
  cinemaPoll: oid('tcinemaenquete'),
  /** cinema: ENQUETE encerrada */
  cinemaPollEnd: oid('tcinemaenqueteencerrada'),
  /** cinema: LOCKED topic */
  cinemaLocked: oid('tcinematrancado'),
  /** cinema: NO REPLY */
  cinemaNoReply: oid('tcinemasemresposta'),
  /** cochilo: conversa ativa */
  napTime: oid('tcochilohora'),
  /** cozinha: conversa comum */
  kitchenBread: oid('tcozinhapao'),
  /** vitrola (closed): Lumi's topic */
  recordPlayerSideB: oid('tvitroladob'),
  /** tabuleiro (moderated, Lumi outside): topic Lumi reads even without being a member */
  checkersBoard: oid('ttabuleirodamas'),
} as const

export const PAGES = {
  /** Nuvens em ASCII · owner: Pipa; administrator: Seixo; Lumi FOLLOWS */
  nuvens: oid('gnuvens'),
  /** Fãs do Marshmallow · owner: Biscoito; Lumi does NOT follow */
  marshmallow: oid('gmarshmallow'),
  /** Poema da Semana · owner: LUMI (Lumi's page: she publishes, manages administrators and removes) */
  disco: oid('gdisco'),
  /** Atalhos da Tuca · owner: Tuca; Lumi is ADMINISTRATOR */
  cafe: oid('gcafe'),
} as const

/** Testimonials and notes the profile screens need to find. */
export const OBJECTS = {
  /** PENDING testimonial for Lumi to accept or refuse (written by a friend of hers) */
  pendingTestimonial: oid('dpendente1'),
  pendingTestimonial2: oid('dpendente2'),
  /** a note from Lumi on Pipa's wall, which she can delete */
  lumisNote: oid('rdalumi'),
  /** a forum reply from ANOTHER rover, for the report/remove test */
  replyToModerate: oid('fparamoderar'),
} as const

/**
 * Who is what, by @handle (the 12 from before plus those the social fake client adds). `amigoDaLumi`:
 * active friendship (with time for testimonial and badge); `pedidoRecebido`: asked Lumi for friendship; `pedidoEnviado`:
 * Lumi asked; `bloqueado`: Lumi blocked; `grafoPrivado`: keeps the graph closed (friends and groups hidden);
 * `recadosAmigos` and `recadosNinguem`: only friends write on the wall, or nobody.
 */
export const CAST = {
  lumisFriend: ['pipa', 'nina', 'max', 'tuca'],
  pedidoRecebido: ['zeca'],
  pedidoEnviado: ['lola'],
  bloqueado: ['bento'],
  privateGraph: ['didi'],
  friendsNotes: ['nina'],
  noOneNotes: ['biscoito'],
  nothingYet: ['nuvem'],
} as const

/** Rovers that only exist in the social demonstration (the 12 from before come from the phase 1 fake client). */
export const NEW_ROVERS = ['juju', 'fiapo', 'mimi', 'bolota', 'otto', 'ziza', 'pingo', 'teco', 'capim'] as const
/** Newly created friendship: Lumi cannot yet receive a badge from someone who has been a friend for less than 7 days. */
export const LUMIS_NEW_FRIEND = 'teco'
/** Each reply of the calendar topic (the old popcorn topic; the ids stayed) that the moderation screen and the tests look for. */
export const REPLIES = {
  /** cinemaPipoca: the reply that SOLVED (from Seixo) */
  popcornResolved: oid('fpipocaseixo'),
  /** cinemaPipoca: a first level reply with children (from Pipa) */
  popcornWithChildren: oid('fpipocapipa'),
  /** cinemaPipoca: reply that QUOTES another */
  popcornQuoting: oid('fpipocanina'),
} as const
export const APPEALS = {
  /** Vitrola: Fiapo appeals the removal made by the moderator; the owner (Lumi) decides */
  fiapoRemoval: oid('apelfiapo'),
  /** Vitrola: Pingo appeals the ban made by the owner; goes to the relay queue */
  pingoBan: oid('apelpingo'),
} as const
