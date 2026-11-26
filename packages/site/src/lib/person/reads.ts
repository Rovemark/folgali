// The two relay reads the browser may sign to learn the person's own reactions, shared by the browser (src/lib/person/client.ts) and
// the site route that carries them (src/app/api/person/reactions/route.ts). Any other path is refused: the route is not a relay proxy.

const ID = '(ob_[A-Za-z0-9_-]{43})'
export const OBJECT_ID = /^ob_[A-Za-z0-9_-]{43}$/
/** The post detail. */
export const POST_PATH = new RegExp(`^/v1/postagens/${ID}$`)
/** The reply list exactly as the post page reads it, so one signed read covers every reply shown under that post. */
export const REPLIES_PATH = new RegExp(`^/v1/postagens/${ID}/respostas\\?ordem=antigas&limite=50$`)
export const postPath = (post: string) => `/v1/postagens/${post}`
export const repliesPath = (post: string) => `/v1/postagens/${post}/respostas?ordem=antigas&limite=50`
/** The read credential of the protocol (packages/protocol/src/read.js); group 1 is the reader's uid. */
export const READ_CREDENTIAL = /^Rover-Assinatura uid=(rvr_[A-Za-z0-9_-]{22}), t=\d{10}, a=[A-Za-z0-9_-]{86}$/
/** At most this many signed reads in one request. */
export const MAX_READS = 40

const REACTION = /^[a-z]{1,16}$/

/** `minhaReacao` per object id, from a post detail (`{ envelope, minhaReacao }`) or a reply list (`{ itens: [...] }`). */
export function reactionsFrom(json: Record<string, unknown>): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  const take = (item: unknown) => {
    const i = item as { envelope?: { objeto?: { id?: unknown } }; minhaReacao?: unknown } | null
    const id = i?.envelope?.objeto?.id
    if (typeof id === 'string' && OBJECT_ID.test(id)) out[id] = typeof i?.minhaReacao === 'string' && REACTION.test(i.minhaReacao) ? i.minhaReacao : null
  }
  if (Array.isArray(json.itens)) json.itens.forEach(take)
  else take(json)
  return out
}

// ---------- private messages (protocol 0.4.0) ----------
// The reads the messages screen signs on the device (src/lib/person/messages.ts) and /api/person/read carries. The conversation reads
// are the person's OWN (the route checks the uid of the path against the signed-in person); the profile and the cipher key of a rover
// are public on the relay (they carry the attestation and the signed `chave-de-cifra` the browser checks itself).

const UID = '(rvr_[A-Za-z0-9_-]{22})'
const PAGE_Q = '\\?limite=50(?:&antes=\\d{1,16})?'
export const CONVERSATION_STATES = ['todas', 'pendentes', 'ativas'] as const
export type ConversationFilter = (typeof CONVERSATION_STATES)[number]
const pageQ = (before?: number | null) => `?limite=50${before ? `&antes=${before}` : ''}`

/** Own: the conversation list in one of the three filters. */
export const CONVERSATIONS_PATH = new RegExp(`^/v1/rovers/${UID}/conversas\\?estado=(?:todas|pendentes|ativas)&limite=50(?:&antes=\\d{1,16})?$`)
/** Own: one conversation. */
export const CONVERSATION_PATH = new RegExp(`^/v1/rovers/${UID}/conversas/${ID}$`)
/** Own: the messages of one conversation (newest first, paged). */
export const MESSAGES_PATH = new RegExp(`^/v1/rovers/${UID}/conversas/${ID}/mensagens${PAGE_Q}$`)
/** Own: the friend list (whom a conversation can be asked of). */
export const FRIENDS_PATH = new RegExp(`^/v1/rovers/${UID}/amigos${PAGE_Q}$`)
/** Anyone's, public: the profile (with the attestation) and the current cipher key. */
export const PROFILE_PATH = new RegExp(`^/v1/rovers/${UID}$`)
export const CIPHER_KEY_PATH = new RegExp(`^/v1/rovers/${UID}/chave-de-cifra$`)

export const conversationsPath = (uid: string, state: ConversationFilter, before?: number | null) => `/v1/rovers/${uid}/conversas?estado=${state}&limite=50${before ? `&antes=${before}` : ''}`
export const conversationPath = (uid: string, id: string) => `/v1/rovers/${uid}/conversas/${id}`
export const messagesPath = (uid: string, id: string, before?: number | null) => `/v1/rovers/${uid}/conversas/${id}/mensagens${pageQ(before)}`
export const friendsPath = (uid: string, before?: number | null) => `/v1/rovers/${uid}/amigos${pageQ(before)}`
export const profilePath = (uid: string) => `/v1/rovers/${uid}`
export const cipherKeyPath = (uid: string) => `/v1/rovers/${uid}/chave-de-cifra`

/** Whose path is it: the uid a read of the person's own data must carry, `public` for the two public reads, null for any other path. */
export function messageReadOwner(path: string): { uid: string } | 'public' | null {
  for (const re of [CONVERSATIONS_PATH, CONVERSATION_PATH, MESSAGES_PATH, FRIENDS_PATH]) {
    const m = re.exec(path)
    if (m) return { uid: m[1] }
  }
  return PROFILE_PATH.test(path) || CIPHER_KEY_PATH.test(path) ? 'public' : null
}
