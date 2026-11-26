// The who-can-do-what matrix (docs/API-SOCIAL-NETWORK.md, section 8), cell by cell. Each row of the table
// below is a row of the specification's matrix; the columns are D (owner), M (moderator), m (member),
// n (non-member) and B (banned). The expected result is `true` (can) or the CODE the relay would return.
import { describe, expect, it } from 'vitest'
import {
  REPLY_GRACE_S, TOPIC_GRACE_S, DAYS_FOR_TESTIMONIAL, DAYS_FOR_BADGE, TOPIC_EDIT_S, MAX_TOPIC_EDITS, canEditTopic, canMoveTopic,
  canInCommunity, canOnPage, canOnProfile, type CommunityAction, type Extra, type Denial, type Who, type OwnerRelation,
} from '@/lib/domain/permissions'
import type { Access } from '@/lib/social/types'

const D: Who = { papel: 'dono', banido: false }
const M: Who = { papel: 'moderador', banido: false }
const m: Who = { papel: 'membro', banido: false }
const n: Who = { papel: null, banido: false }
const B: Who = { papel: null, banido: true }
type R = true | Denial
const verdict = (v: ReturnType<typeof canInCommunity>): R => (v.ok ? true : v.motivo)

type Timeline = { acao: CommunityAction; acesso?: Access; extra?: Extra; expected: [R, R, R, R, R] }
const MATRIX: Timeline[] = [
  // read: open and moderated are public; closed disappears for whoever is outside (404)
  { acao: 'ler', acesso: 'aberta', expected: [true, true, true, true, true] },
  { acao: 'ler', acesso: 'moderada', expected: [true, true, true, true, true] },
  { acao: 'ler', acesso: 'fechada', expected: [true, true, true, 'nao-encontrado', 'nao-encontrado'] },
  // entrar e pedir entrada
  { acao: 'entrar', acesso: 'aberta', expected: ['ja-existe', 'ja-existe', 'ja-existe', true, 'banido'] },
  { acao: 'entrar', acesso: 'moderada', expected: ['ja-existe', 'ja-existe', 'ja-existe', 'sem-permissao', 'banido'] },
  { acao: 'entrar', acesso: 'fechada', expected: ['ja-existe', 'ja-existe', 'ja-existe', 'nao-encontrado', 'banido'] },
  { acao: 'pedir-entrada', acesso: 'moderada', expected: ['ja-existe', 'ja-existe', 'ja-existe', true, 'banido'] },
  { acao: 'pedir-entrada', acesso: 'aberta', expected: ['ja-existe', 'ja-existe', 'ja-existe', 'sem-permissao', 'banido'] },
  { acao: 'pedir-entrada', acesso: 'fechada', expected: ['ja-existe', 'ja-existe', 'ja-existe', 'nao-encontrado', 'banido'] },
  // leave: the owner does not leave (transfer ownership first)
  { acao: 'sair', expected: ['sem-permissao', true, true, 'nao-e-membro', 'nao-e-membro'] },
  // topic, reply, vote, reaction: only a non-banned member
  { acao: 'postar-topico', expected: [true, true, true, 'nao-e-membro', 'banido'] },
  { acao: 'responder', expected: [true, true, true, 'nao-e-membro', 'banido'] },
  { acao: 'votar', expected: [true, true, true, 'nao-e-membro', 'banido'] },
  { acao: 'reagir', expected: [true, true, true, 'nao-e-membro', 'banido'] },
  // edit your own topic
  { acao: 'editar-meu-topico', extra: { meuTopico: true }, expected: [true, true, true, 'sem-permissao', 'sem-permissao'] },
  { acao: 'editar-meu-topico', extra: { meuTopico: false }, expected: ['sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  // invite, approve and refuse a request, pin, lock, move: owner and moderator
  { acao: 'convidar', expected: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'decidir-pedido', expected: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'fixar', expected: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'trancar', expected: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'mover', expected: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  // remove another's topic or reply: the moderator does not remove what belongs to the owner
  { acao: 'remover-alheio', extra: { conteudoDoDono: false }, expected: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'remover-alheio', extra: { conteudoDoDono: true }, expected: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  // solved: owner, moderator, or the member on their own topic
  { acao: 'resolver', extra: { meuTopico: false }, expected: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'resolver', extra: { meuTopico: true }, expected: [true, true, true, 'sem-permissao', 'sem-permissao'] },
  // expel: the owner, everybody; the moderator, only regular members
  { acao: 'expulsar', extra: { alvoPapel: 'membro' }, expected: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'expulsar', extra: { alvoPapel: 'moderador' }, expected: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'expulsar', extra: { alvoPapel: 'dono' }, expected: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  // ban: the moderator does not ban a moderator or the owner; bans a member and someone who is not even a member
  { acao: 'banir', extra: { alvoPapel: 'membro' }, expected: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'banir', extra: { alvoPapel: null }, expected: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'banir', extra: { alvoPapel: 'moderador' }, expected: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'banir', extra: { alvoPapel: 'dono' }, expected: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'desbanir', expected: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  // promote and demote: only the owner
  { acao: 'promover', expected: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'rebaixar', expected: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  // name, description, rules, theme, categories: owner and moderator; the access, only the owner
  { acao: 'editar-dados', expected: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'mudar-acesso', expected: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'transferir', expected: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'encerrar', expected: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  // see requests, invitations, banned and the queue: owner and moderator; appeals: only the owner
  { acao: 'ver-moderacao', expected: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'ver-apelacoes', expected: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  // apelar: o autor removido (membro) e o banido
  { acao: 'apelar', extra: { autorRemovido: true }, expected: [true, true, true, true, true] },
  { acao: 'apelar', extra: { autorRemovido: false }, expected: ['sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao', true] },
]

const COLUMNS: [string, Who][] = [['dono', D], ['moderador', M], ['membro', m], ['não membro', n], ['banido', B]]

describe('community matrix (section 8.1), cell by cell', () => {
  for (const l of MATRIX) {
    for (const [i, [name, q]] of COLUMNS.entries()) {
      it(`${l.acao}${l.acesso ? ` (${l.acesso})` : ''}${l.extra ? ` ${JSON.stringify(l.extra)}` : ''} · ${name}`, () => {
        expect(verdict(canInCommunity(l.acao, q, l.acesso ?? 'aberta', l.extra))).toBe(l.expected[i])
      })
    }
  }

  it('a banned one who still carries a role gains no power at all', () => {
    const bannedOwner: Who = { papel: 'dono', banido: true }
    for (const a of ['convidar', 'fixar', 'editar-dados', 'promover', 'transferir', 'ver-moderacao', 'ver-apelacoes'] as CommunityAction[]) {
      expect(verdict(canInCommunity(a, bannedOwner, 'aberta'))).toBe('sem-permissao')
    }
    expect(verdict(canInCommunity('remover-alheio', { papel: 'moderador', banido: true }, 'aberta'))).toBe('sem-permissao')
    expect(verdict(canInCommunity('editar-meu-topico', { papel: 'membro', banido: true }, 'aberta', { meuTopico: true }))).toBe('sem-permissao')
    expect(verdict(canInCommunity('resolver', { papel: 'membro', banido: true }, 'aberta', { meuTopico: true }))).toBe('sem-permissao')
    expect(verdict(canInCommunity('ler', { papel: 'membro', banido: true }, 'fechada'))).toBe('nao-encontrado')
  })

  it('the banned one sees the open forum, but cannot join (banido) and cannot post (banido)', () => {
    expect(verdict(canInCommunity('ler', B, 'aberta'))).toBe(true)
    expect(verdict(canInCommunity('entrar', B, 'aberta'))).toBe('banido')
    expect(verdict(canInCommunity('postar-topico', { papel: 'membro', banido: true }, 'aberta'))).toBe('banido')
  })
})

describe('matrix edge cases', () => {
  it('seeing moderation does not depend on the content being the owner\'s; only the owner and the moderator see it', () => {
    expect(verdict(canInCommunity('ver-moderacao', M, 'aberta', { conteudoDoDono: true }))).toBe(true)
    expect(verdict(canInCommunity('ver-moderacao', m, 'aberta', { conteudoDoDono: true }))).toBe('sem-permissao')
  })
  it('the moderator only expels someone known to be a regular member (an unknown role is not enough)', () => {
    for (const targetRole of [null, undefined]) expect(verdict(canInCommunity('expulsar', M, 'aberta', { alvoPapel: targetRole }))).toBe('sem-permissao')
    expect(verdict(canInCommunity('expulsar', M, 'aberta'))).toBe('sem-permissao')
    expect(verdict(canInCommunity('expulsar', D, 'aberta'))).toBe(true)
  })
})

describe('member grace period', () => {
  it('topic and vote wait 1 hour; reply, 10 minutes; reaction does not wait', () => {
    expect(TOPIC_GRACE_S).toBe(3600)
    expect(REPLY_GRACE_S).toBe(600)
    for (const a of ['postar-topico', 'votar'] as const) {
      expect(verdict(canInCommunity(a, { ...m, memberFor: 3599 }, 'aberta'))).toBe('conta-nova')
      expect(verdict(canInCommunity(a, { ...m, memberFor: 3600 }, 'aberta'))).toBe(true)
    }
    expect(verdict(canInCommunity('responder', { ...m, memberFor: 599 }, 'aberta'))).toBe('conta-nova')
    expect(verdict(canInCommunity('responder', { ...m, memberFor: 600 }, 'aberta'))).toBe(true)
    expect(verdict(canInCommunity('reagir', { ...m, memberFor: 0 }, 'aberta'))).toBe(true)
  })
  it('owner and moderator do not wait; without `memberFor` there is no grace period to check', () => {
    for (const q of [D, M]) for (const a of ['postar-topico', 'responder', 'votar'] as const) expect(verdict(canInCommunity(a, { ...q, memberFor: 0 }, 'aberta'))).toBe(true)
    expect(verdict(canInCommunity('postar-topico', m, 'aberta'))).toBe(true)
  })
  it('the banned one is stopped before the grace period, and so is the non-member', () => {
    expect(verdict(canInCommunity('postar-topico', { ...B, memberFor: 99999 }, 'aberta'))).toBe('banido')
    expect(verdict(canInCommunity('postar-topico', { ...n, memberFor: 99999 }, 'aberta'))).toBe('nao-e-membro')
  })
})

// ---- perfil (8.2) -------------------------------------------------------------------------------------

const rel = (extra: Partial<OwnerRelation> = {}): OwnerRelation => ({ proprio: false, amigo: false, friendForDays: 0, accountAgeDays: 30, bloqueio: false, recados: 'todos', ...extra })
const vp = (a: Parameters<typeof canOnProfile>[0], r: OwnerRelation): R => verdict(canOnProfile(a, r))

describe('profile matrix (section 8.2)', () => {
  it('delete a note, decide a testimonial and read pending ones: only the owner', () => {
    for (const a of ['apagar-recado', 'decidir-depoimento', 'ler-pendentes'] as const) {
      expect(vp(a, rel({ proprio: true }))).toBe(true)
      expect(vp(a, rel({ amigo: true, friendForDays: 99 }))).toBe('sem-permissao')
      expect(vp(a, rel())).toBe('sem-permissao')
      expect(vp(a, rel({ bloqueio: true }))).toBe('sem-permissao')
    }
  })
  it('note: the owner does not write on their own wall; according to the `recados` field', () => {
    expect(vp('recado', rel({ proprio: true }))).toBe('sem-permissao')
    expect(vp('recado', rel({ recados: 'todos' }))).toBe(true)
    expect(vp('recado', rel({ recados: 'todos', amigo: true }))).toBe(true)
    expect(vp('recado', rel({ recados: 'amigos' }))).toBe('interacao-nao-permitida')
    expect(vp('recado', rel({ recados: 'amigos', amigo: true }))).toBe(true)
    expect(vp('recado', rel({ recados: 'ninguem' }))).toBe('interacao-nao-permitida')
    expect(vp('recado', rel({ recados: 'ninguem', amigo: true }))).toBe('interacao-nao-permitida')
  })
  it('block: the answer is the SAME as "friends only" and "nobody", so as not to say which', () => {
    expect(vp('recado', rel({ bloqueio: true }))).toBe('interacao-nao-permitida')
    expect(vp('recado', rel({ bloqueio: true, amigo: true, friendForDays: 99 }))).toBe('interacao-nao-permitida')
    expect(vp('pedir-amizade', rel({ bloqueio: true }))).toBe('interacao-nao-permitida')
    expect(vp('depoimento', rel({ bloqueio: true, amigo: true, friendForDays: 99 }))).toBe('interacao-nao-permitida')
    expect(vp('selo', rel({ bloqueio: true, amigo: true, friendForDays: 99 }))).toBe('interacao-nao-permitida')
  })
  it('testimonial: a friend for 3 days or more, with an account of 3 days or more', () => {
    expect(DAYS_FOR_TESTIMONIAL).toBe(3)
    const friend = { amigo: true }
    expect(vp('depoimento', rel({ ...friend, friendForDays: 3, accountAgeDays: 3 }))).toBe(true)
    expect(vp('depoimento', rel({ ...friend, friendForDays: 2.99, accountAgeDays: 30 }))).toBe('conta-nova')
    expect(vp('depoimento', rel({ ...friend, friendForDays: 30, accountAgeDays: 2.99 }))).toBe('conta-nova')
    expect(vp('depoimento', rel({ friendForDays: 30 }))).toBe('sem-permissao')
    expect(vp('depoimento', rel({ proprio: true, amigo: true, friendForDays: 30 }))).toBe('sem-permissao')
  })
  it('badge: a friend for 7 days or more, with an account of 7 days or more', () => {
    expect(DAYS_FOR_BADGE).toBe(7)
    const friend = { amigo: true }
    expect(vp('selo', rel({ ...friend, friendForDays: 7, accountAgeDays: 7 }))).toBe(true)
    expect(vp('selo', rel({ ...friend, friendForDays: 6.99, accountAgeDays: 30 }))).toBe('conta-nova')
    expect(vp('selo', rel({ ...friend, friendForDays: 30, accountAgeDays: 6.99 }))).toBe('conta-nova')
    expect(vp('selo', rel({ friendForDays: 30 }))).toBe('sem-permissao')
    expect(vp('selo', rel({ proprio: true, amigo: true, friendForDays: 30 }))).toBe('sem-permissao')
  })
  it('ask for friendship: not to yourself, not to someone who is already a friend, not with a block', () => {
    expect(vp('pedir-amizade', rel())).toBe(true)
    expect(vp('pedir-amizade', rel({ proprio: true }))).toBe('sem-permissao')
    expect(vp('pedir-amizade', rel({ amigo: true }))).toBe('ja-existe')
  })
  it('block and mute: anyone, except themselves', () => {
    for (const a of ['bloquear', 'silenciar'] as const) {
      expect(vp(a, rel())).toBe(true)
      expect(vp(a, rel({ bloqueio: true }))).toBe(true)
      expect(vp(a, rel({ proprio: true }))).toBe('sem-permissao')
    }
  })
})

// ---- page (8.3) ---------------------------------------------------------------------------------------

describe('page matrix (section 8.3)', () => {
  const v = (a: Parameters<typeof canOnPage>[0], p: Parameters<typeof canOnPage>[1]): R => verdict(canOnPage(a, p))
  it('read and follow: everybody', () => {
    for (const p of ['dono', 'administrador', null] as const) for (const a of ['ler', 'seguir'] as const) expect(v(a, p)).toBe(true)
  })
  it('publish and update: owner and administrator', () => {
    for (const a of ['publicar', 'atualizar'] as const) {
      expect(v(a, 'dono')).toBe(true)
      expect(v(a, 'administrador')).toBe(true)
      expect(v(a, null)).toBe('sem-permissao')
    }
  })
  it('manage administrators, remove another\'s update and remove the page: only the owner', () => {
    for (const a of ['gerir-administradores', 'remover-atualizacao-alheia', 'remover-pagina'] as const) {
      expect(v(a, 'dono')).toBe(true)
      expect(v(a, 'administrador')).toBe('sem-permissao')
      expect(v(a, null)).toBe('sem-permissao')
    }
  })
})

// ---- move and edit topic -------------------------------------------------------------------------------

describe('podeMoverTopico', () => {
  const ok = (o: Parameters<typeof canMoveTopic>[0], d: Parameters<typeof canMoveTopic>[1]): R => verdict(canMoveTopic(o, d))
  it('requires a staff role on BOTH sides', () => {
    expect(ok({ papel: 'moderador', acesso: 'aberta' }, { papel: 'moderador', acesso: 'aberta' })).toBe(true)
    expect(ok({ papel: 'dono', acesso: 'aberta' }, { papel: 'dono', acesso: 'moderada' })).toBe(true)
    expect(ok({ papel: 'moderador', acesso: 'aberta' }, { papel: 'membro', acesso: 'aberta' })).toBe('sem-permissao')
    expect(ok({ papel: 'moderador', acesso: 'aberta' }, { papel: null, acesso: 'aberta' })).toBe('sem-permissao')
    expect(ok({ papel: 'membro', acesso: 'aberta' }, { papel: 'moderador', acesso: 'aberta' })).toBe('sem-permissao')
    expect(ok({ papel: null, acesso: 'aberta' }, { papel: 'dono', acesso: 'aberta' })).toBe('sem-permissao')
  })
  it('from closed to not closed only the origin\'s owner (makes it public)', () => {
    expect(ok({ papel: 'moderador', acesso: 'fechada' }, { papel: 'moderador', acesso: 'aberta' })).toBe('sem-permissao')
    expect(ok({ papel: 'moderador', acesso: 'fechada' }, { papel: 'dono', acesso: 'moderada' })).toBe('sem-permissao')
    expect(ok({ papel: 'dono', acesso: 'fechada' }, { papel: 'moderador', acesso: 'aberta' })).toBe(true)
    expect(ok({ papel: 'dono', acesso: 'fechada' }, { papel: 'dono', acesso: 'moderada' })).toBe(true)
  })
  it('between two closed ones, and from open to closed, the moderator can', () => {
    expect(ok({ papel: 'moderador', acesso: 'fechada' }, { papel: 'moderador', acesso: 'fechada' })).toBe(true)
    expect(ok({ papel: 'moderador', acesso: 'aberta' }, { papel: 'moderador', acesso: 'fechada' })).toBe(true)
  })
})

describe('podeEditarTopico', () => {
  const base = { meuTopico: true, createdAtMs: 1_000_000, nowMs: 1_000_000, edicoes: 0, trancado: false }
  const ed = (x: Partial<typeof base>) => verdict(canEditTopic({ ...base, ...x }) as ReturnType<typeof canInCommunity>)
  it('the constants are the protocol\'s', () => {
    expect(TOPIC_EDIT_S).toBe(1800)
    expect(MAX_TOPIC_EDITS).toBe(5)
  })
  it('30-minute window: at the exact limit it can, 1 ms later it cannot', () => {
    expect(ed({ nowMs: base.createdAtMs + 1_800_000 })).toBe(true)
    expect(ed({ nowMs: base.createdAtMs + 1_800_001 })).toBe('fora-da-janela' as Denial)
  })
  it('at most 5 edits: the fifth still fits, the sixth does not', () => {
    expect(ed({ edicoes: 4 })).toBe(true)
    expect(ed({ edicoes: 5 })).toBe('limite-de-estrutura' as Denial)
  })
  it('only the author edits, and a locked topic cannot be edited', () => {
    expect(ed({ meuTopico: false })).toBe('sem-permissao')
    expect(ed({ trancado: true })).toBe('trancado' as Denial)
  })
  it('the order of the refusals: author, then locked, then window, then limit', () => {
    const allWrong = { meuTopico: false, trancado: true, nowMs: base.createdAtMs + 9_999_999, edicoes: 9 }
    expect(ed(allWrong)).toBe('sem-permissao')
    expect(ed({ ...allWrong, meuTopico: true })).toBe('trancado' as Denial)
    expect(ed({ ...allWrong, meuTopico: true, trancado: false })).toBe('fora-da-janela' as Denial)
  })
})
