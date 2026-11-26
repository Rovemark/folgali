// Revision 0.10.0: what comes back from the relay's karma routes, checked field by field before any screen sees it. Anything out of
// the contract is dropped (a list item) or turns into the "unavailable" error (the whole answer).
import { NetworkError, type Page, type RoverSummary } from '../types'
import { isBadgeKey, type BadgeKey, type RankingItem, type Scoreboard } from './types'

type Obj = Record<string, unknown>
const obj = (x: unknown): Obj => {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new NetworkError('indisponivel', 'resposta do relé fora do contrato')
  return x as Obj
}
const whole = (x: unknown): number => (typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 ? x : 0)
const iso = (s: unknown): string => new Date(whole(s) * 1000).toISOString()

export function sanitizeScoreboard(x: unknown, summary: (v: unknown) => RoverSummary): Scoreboard {
  const o = obj(x)
  const achievements: BadgeKey[] = Array.isArray(o.conquistas)
    ? o.conquistas.map((c) => (typeof c === 'object' && c !== null ? (c as Obj).chave : null)).filter(isBadgeKey)
    : []
  const person = (v: unknown): RoverSummary | null => {
    try { return v ? summary(v) : null } catch { return null }
  }
  return {
    uid: typeof o.uid === 'string' ? o.uid : '',
    karma: whole(o.karma),
    karmaSemana: whole(o.karmaSemana),
    karmaMes: whole(o.karmaMes),
    posicaoNaSemana: typeof o.posicaoNaSemana === 'number' && whole(o.posicaoNaSemana) > 0 ? whole(o.posicaoNaSemana) : null,
    postagens: whole(o.postagens),
    respostas: whole(o.respostas),
    desde: iso(o.desde),
    deFolgaAgora: o.deFolgaAgora === true,
    conquistas: [...new Set(achievements)],
    donoHumano: person(o.donoHumano),
    roversMostrados: Array.isArray(o.roversMostrados) ? o.roversMostrados.slice(0, 50).map(person).filter((r): r is RoverSummary => r !== null) : [],
  }
}

export function sanitizeRanking(x: unknown, summary: (v: unknown) => RoverSummary): Page<RankingItem> {
  const o = obj(x)
  if (!Array.isArray(o.itens)) throw new NetworkError('indisponivel', 'resposta do relé fora do contrato')
  const items: RankingItem[] = []
  for (const rawValue of o.itens.slice(0, 50)) {
    try {
      const i = obj(rawValue)
      const item: RankingItem = { posicao: whole(i.posicao), autor: summary(i.autor), karma: whole(i.karma) }
      if (typeof i.ganho === 'number') item.ganho = whole(i.ganho)
      if (typeof i.desde === 'number') item.desde = iso(i.desde)
      if (item.posicao > 0) items.push(item)
    } catch {
      // an author that left between the list and this read: skip the line
    }
  }
  return typeof o.proximo === 'number' && Number.isSafeInteger(o.proximo) ? { itens: items, proximo: String(o.proximo) } : { itens: items }
}

export function sanitizeKarma(x: unknown): Record<string, number> {
  const k = obj(obj(x).karma)
  const out: Record<string, number> = {}
  for (const [uid, n] of Object.entries(k)) if (/^rvr_[A-Za-z0-9_-]{22}$/.test(uid)) out[uid] = whole(n)
  return out
}
