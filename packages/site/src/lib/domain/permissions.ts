// THE WHO-CAN-DO-WHAT MATRIX (docs/API-SOCIAL-NETWORK.md, section 8), as a pure function. The screen uses it to
// show only the buttons that make sense; the relay really decides and repeats the rule. When the rule
// denies, it returns the SAME error code the relay would return, so the screen can explain without guessing.
//
// Roles: owner (D), moderator (M), member (m), non member (n, null role) and banned (B, flag).

import type { Access, RoleInCommunity, NoteRule } from '../social/types'

export type Denial = 'sem-permissao' | 'interacao-nao-permitida' | 'conta-nova' | 'banido' | 'nao-e-membro' | 'ja-existe' | 'nao-encontrado'
export type Verdict = { ok: true } | { ok: false; motivo: Denial }
const OK: Verdict = { ok: true }
const denies = (reason: Denial): Verdict => ({ ok: false, motivo: reason })

/** Protocol waiting periods (section 10.6): topic and vote, 1 hour; reply, 10 minutes. Owner and moderator do not wait. */
export const TOPIC_GRACE_S = 3600
export const REPLY_GRACE_S = 600
export const TOPIC_EDIT_S = 30 * 60
export const MAX_TOPIC_EDITS = 5

export interface Who {
  papel: RoleInCommunity | null
  banido: boolean
  /** seconds since becoming a member; absent = no waiting period to check */
  memberFor?: number
}

export type CommunityAction =
  | 'ler' | 'entrar' | 'pedir-entrada' | 'sair'
  | 'postar-topico' | 'responder' | 'votar' | 'reagir'
  | 'editar-meu-topico' | 'convidar' | 'decidir-pedido'
  | 'fixar' | 'trancar' | 'mover' | 'remover-alheio' | 'resolver'
  | 'expulsar' | 'banir' | 'desbanir' | 'promover' | 'rebaixar'
  | 'editar-dados' | 'mudar-acesso' | 'transferir' | 'encerrar'
  | 'ver-moderacao' | 'ver-apelacoes' | 'apelar'

export interface Extra {
  /** the topic belongs to the reader (resolve, edit) */
  meuTopico?: boolean
  /** role of the target, when the action is about a rover (expel, ban) */
  alvoPapel?: RoleInCommunity | null
  /** the content to remove belongs to the community owner */
  conteudoDoDono?: boolean
  /** the reader is the author of content removed by moderation (appeal) */
  autorRemovido?: boolean
}

const team = (p: Who['papel']) => p === 'dono' || p === 'moderador'

export function canInCommunity(action: CommunityAction, q: Who, access: Access, x: Extra = {}): Verdict {
  const member = q.papel !== null && !q.banido
  switch (action) {
    case 'ler':
      return access !== 'fechada' || member ? OK : denies('nao-encontrado')
    case 'entrar':
      if (q.banido) return denies('banido')
      if (q.papel !== null) return denies('ja-existe')
      return access === 'aberta' ? OK : access === 'fechada' ? denies('nao-encontrado') : denies('sem-permissao')
    case 'pedir-entrada':
      if (q.banido) return denies('banido')
      if (q.papel !== null) return denies('ja-existe')
      return access === 'moderada' ? OK : access === 'fechada' ? denies('nao-encontrado') : denies('sem-permissao')
    case 'sair':
      if (q.papel === null) return denies('nao-e-membro')
      return q.papel === 'dono' ? denies('sem-permissao') : OK
    case 'postar-topico':
    case 'responder':
    case 'votar':
    case 'reagir': {
      if (q.banido) return denies('banido')
      if (q.papel === null) return denies('nao-e-membro')
      if (team(q.papel) || action === 'reagir') return OK
      const required = action === 'responder' ? REPLY_GRACE_S : TOPIC_GRACE_S
      return q.memberFor === undefined || q.memberFor >= required ? OK : denies('conta-nova')
    }
    case 'editar-meu-topico':
      return member && x.meuTopico ? OK : denies('sem-permissao')
    case 'convidar':
    case 'decidir-pedido':
    case 'fixar':
    case 'trancar':
    case 'mover':
    case 'desbanir':
    case 'editar-dados':
    case 'ver-moderacao':
      return team(q.papel) && !q.banido ? OK : denies('sem-permissao')
    case 'remover-alheio':
      if (!team(q.papel) || q.banido) return denies('sem-permissao')
      return q.papel === 'moderador' && x.conteudoDoDono ? denies('sem-permissao') : OK
    case 'resolver':
      if (!member) return denies('sem-permissao')
      return team(q.papel) || x.meuTopico ? OK : denies('sem-permissao')
    case 'expulsar':
      if (q.papel === 'dono') return OK
      if (q.papel === 'moderador') return x.alvoPapel === 'membro' ? OK : denies('sem-permissao')
      return denies('sem-permissao')
    case 'banir':
      if (q.papel === 'dono') return OK
      if (q.papel === 'moderador') return x.alvoPapel === 'moderador' || x.alvoPapel === 'dono' ? denies('sem-permissao') : OK
      return denies('sem-permissao')
    case 'promover':
    case 'rebaixar':
    case 'mudar-acesso':
    case 'transferir':
    case 'encerrar':
    case 'ver-apelacoes':
      return q.papel === 'dono' && !q.banido ? OK : denies('sem-permissao')
    case 'apelar':
      return x.autorRemovido || q.banido ? OK : denies('sem-permissao')
  }
}

// ---- perfil ------------------------------------------------------------------------------------------------

export const DAYS_FOR_TESTIMONIAL = 3
export const DAYS_FOR_BADGE = 7

export interface OwnerRelation {
  /** the reader is the page owner */
  proprio: boolean
  amigo: boolean
  /** how many days they have been friends */
  friendForDays: number
  /** age of the acting account, in days */
  accountAgeDays: number
  /** block in ANY direction: the answer is the same for both sides */
  bloqueio: boolean
  recados: NoteRule
}

export type ProfileAction = 'recado' | 'depoimento' | 'selo' | 'pedir-amizade' | 'apagar-recado' | 'decidir-depoimento' | 'ler-pendentes' | 'bloquear' | 'silenciar'

export function canOnProfile(action: ProfileAction, r: OwnerRelation): Verdict {
  switch (action) {
    case 'apagar-recado':
    case 'decidir-depoimento':
    case 'ler-pendentes':
      return r.proprio ? OK : denies('sem-permissao')
    case 'bloquear':
    case 'silenciar':
      return r.proprio ? denies('sem-permissao') : OK
    case 'pedir-amizade':
      if (r.proprio) return denies('sem-permissao')
      if (r.bloqueio) return denies('interacao-nao-permitida')
      return r.amigo ? denies('ja-existe') : OK
    case 'recado':
      if (r.proprio) return denies('sem-permissao')
      // the same message for block, "friends only" and "nobody": the screen does not say which
      if (r.bloqueio || r.recados === 'ninguem' || (r.recados === 'amigos' && !r.amigo)) return denies('interacao-nao-permitida')
      return OK
    case 'depoimento':
    case 'selo': {
      if (r.proprio) return denies('sem-permissao')
      if (r.bloqueio) return denies('interacao-nao-permitida')
      if (!r.amigo) return denies('sem-permissao')
      const days = action === 'depoimento' ? DAYS_FOR_TESTIMONIAL : DAYS_FOR_BADGE
      return r.friendForDays >= days && r.accountAgeDays >= days ? OK : denies('conta-nova')
    }
  }
}

// ---- project pages ------------------------------------------------------------------------------------

export type PageRole = 'dono' | 'administrador' | null
export type PageAction = 'ler' | 'seguir' | 'publicar' | 'atualizar' | 'gerir-administradores' | 'remover-atualizacao-alheia' | 'remover-pagina'

export function canOnPage(action: PageAction, role: PageRole): Verdict {
  switch (action) {
    case 'ler':
    case 'seguir':
      return OK
    case 'publicar':
    case 'atualizar':
      return role !== null ? OK : denies('sem-permissao')
    case 'gerir-administradores':
    case 'remover-atualizacao-alheia':
    case 'remover-pagina':
      return role === 'dono' ? OK : denies('sem-permissao')
  }
}

/** Moving a topic: team role on BOTH sides, and from closed to not closed only the owner of the origin (makes it public). */
export function canMoveTopic(origin: { papel: RoleInCommunity | null; acesso: Access }, destination: { papel: RoleInCommunity | null; acesso: Access }): Verdict {
  if (!team(origin.papel) || !team(destination.papel)) return denies('sem-permissao')
  if (origin.acesso === 'fechada' && destination.acesso !== 'fechada' && origin.papel !== 'dono') return denies('sem-permissao')
  return OK
}

/** Topic edit window: 30 minutes, 5 edits, never locked, author only. */
export function canEditTopic(x: { meuTopico: boolean; createdAtMs: number; nowMs: number; edicoes: number; trancado: boolean }): Verdict | { ok: false; motivo: 'fora-da-janela' | 'limite-de-estrutura' | 'trancado' | 'sem-permissao' } {
  if (!x.meuTopico) return denies('sem-permissao')
  if (x.trancado) return { ok: false, motivo: 'trancado' }
  if (x.nowMs - x.createdAtMs > TOPIC_EDIT_S * 1000) return { ok: false, motivo: 'fora-da-janela' }
  if (x.edicoes >= MAX_TOPIC_EDITS) return { ok: false, motivo: 'limite-de-estrutura' }
  return OK
}
