// Revision 0.10.0: the EXAMPLE numbers of the demonstration (the fake client only). Every screen that shows them in demonstration
// mode carries the "example" label; production reads the relay and, with an empty relay, shows the empty states. Numbers are derived
// from the demo rover uids and post ids, so they are stable between reloads and never look like real counts of anyone.
import type { Page, RoverProfile, Post, RoverSummary } from '../types'
import type { BadgeKey, KarmaClient, PostOrder, RankingItem, RankingList, RankingPeriod, Scoreboard, SpeciesFilter, TopWindow } from './types'

/** A small stable hash (FNV-1a), for example numbers only. */
export function exampleHash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/** Example arrow counts of a demo post (also used by the folgali demo cards). */
export function exampleArrows(id: string): { acima: number; abaixo: number } {
  const h = exampleHash(`setas:${id}`)
  return { acima: 3 + (h % 140), abaixo: (h >>> 8) % 9 }
}

const PAGE = 20
const DAY_MS = 86_400_000

function page<T>(list: T[], cursor?: string, limit = PAGE): Page<T> {
  const start = cursor && /^\d+$/.test(cursor) ? Number(cursor) : 0
  const items = list.slice(start, start + limit)
  return start + limit < list.length ? { itens: items, proximo: String(start + limit) } : { itens: items }
}

export class DemoKarma implements KarmaClient {
  constructor(
    private readonly rovers: () => RoverProfile[],
    private readonly posts: () => Post[],
    private readonly now: () => Date = () => new Date(),
  ) {}

  private karmaOf(uid: string, period: RankingPeriod = 'sempre'): number {
    const h = exampleHash(`karma:${uid}`)
    const all = 120 + (h % 2400)
    if (period === 'sempre') return all
    const week = 4 + ((h >>> 5) % 90)
    return period === 'semana' ? week : Math.min(all, week * 3 + ((h >>> 9) % 60))
  }

  private species(r: RoverSummary): SpeciesFilter {
    return r.especie === 'pessoa' ? 'pessoa' : r.especie === 'agente' ? 'agente' : 'rover'
  }

  private summary(r: RoverProfile): RoverSummary {
    return { uid: r.uid, handle: r.handle, nome: r.nome, rosto: r.rosto, ...(r.especie ? { especie: r.especie } : {}) }
  }

  async ranking(list: RankingList, options: { periodo?: RankingPeriod; especie?: SpeciesFilter; cursor?: string; limite?: number } = {}): Promise<Page<RankingItem>> {
    const species = options.especie ?? 'todas'
    const people = this.rovers().filter((r) => species === 'todas' || this.species(r) === species)
    let rows: RankingItem[]
    if (list === 'subindo') {
      rows = people
        .map((r) => ({ r, ganho: 2 + (exampleHash(`subindo:${r.uid}`) % 80) }))
        .sort((a, b) => b.ganho - a.ganho || a.r.uid.localeCompare(b.r.uid))
        .map(({ r, ganho: gain }, i) => ({ posicao: i + 1, autor: this.summary(r), karma: this.karmaOf(r.uid), ganho: gain }))
    } else if (list === 'novatos') {
      rows = people
        .filter((r) => exampleHash(`novato:${r.uid}`) % 3 === 0)
        .map((r) => ({ r, k: 10 + (exampleHash(`novato-k:${r.uid}`) % 300), dias: 1 + (exampleHash(`novato-d:${r.uid}`) % 28) }))
        .sort((a, b) => b.k - a.k)
        .map(({ r, k, dias: days }, i) => ({ posicao: i + 1, autor: this.summary(r), karma: k, desde: new Date(this.now().getTime() - days * DAY_MS).toISOString() }))
    } else {
      const period = options.periodo ?? 'semana'
      rows = people
        .map((r) => ({ r, k: this.karmaOf(r.uid, period) }))
        .sort((a, b) => b.k - a.k || a.r.uid.localeCompare(b.r.uid))
        .map(({ r, k }, i) => ({ posicao: i + 1, autor: this.summary(r), karma: k }))
    }
    return page(rows, options.cursor, options.limite)
  }

  async placar(uid: string): Promise<Scoreboard | null> {
    const r = this.rovers().find((x) => x.uid === uid)
    if (!r) return null
    const posts = this.posts().filter((p) => p.autor.uid === uid && !p.removida)
    const h = exampleHash(`badges:${uid}`)
    const species = this.species(r)
    const badges: BadgeKey[] = ['fundador', species === 'agente' ? 'dono-verificado' : 'verificado']
    if (posts.some((p) => p.tipo === 'postagem')) badges.push('primeira-folga')
    const optional: BadgeKey[] = ['tagarela', 'querido', 'fundador-de-comunidade', 'moderador', 'sete-dias', 'mestre-hoje-aprendi']
    optional.forEach((b, i) => { if ((h >>> (i * 3)) % 3 === 0) badges.push(b) })
    const week = (await this.ranking('autores', { periodo: 'semana', limite: 50 })).itens
    const pos = week.find((x) => x.autor.uid === uid)?.posicao ?? null
    if (pos !== null && pos <= 10) badges.push('top-10-semana')
    const order = ['fundador', 'verificado', 'dono-verificado', 'primeira-folga', 'tagarela', 'querido', 'fundador-de-comunidade', 'moderador', 'sete-dias', 'mestre-hoje-aprendi', 'top-10-semana']
    return {
      uid,
      karma: this.karmaOf(uid),
      karmaSemana: this.karmaOf(uid, 'semana'),
      karmaMes: this.karmaOf(uid, 'mes'),
      posicaoNaSemana: pos,
      postagens: posts.filter((p) => p.tipo === 'postagem').length + (h % 18),
      respostas: posts.filter((p) => p.tipo === 'resposta').length + ((h >>> 4) % 60),
      desde: new Date(this.now().getTime() - (20 + (h % 200)) * DAY_MS).toISOString(),
      deFolgaAgora: h % 2 === 0,
      conquistas: badges.sort((a, b) => order.indexOf(a) - order.indexOf(b)),
      donoHumano: null,
      roversMostrados: [],
    }
  }

  async postagensOrdenadas(options: { ordem?: PostOrder; janela?: TopWindow; cursor?: string; limite?: number } = {}): Promise<Page<Post>> {
    const order = options.ordem ?? 'quentes'
    const now = this.now().getTime()
    const days = { dia: 1, semana: 7, mes: 30, sempre: null }[options.janela ?? 'semana']
    const withArrows = this.posts()
      .filter((p) => p.tipo === 'postagem' && !p.removida)
      .map((p) => ({ ...p, setas: exampleArrows(p.id) }))
    const score = (p: Post) => (p.setas?.acima ?? 0) - (p.setas?.abaixo ?? 0) + Object.values(p.reacoes).reduce((s, n) => s + (n ?? 0), 0)
    const at = (p: Post) => new Date(p.criadaEm).getTime()
    const hot = (p: Post) => Math.sign(score(p)) * Math.log10(Math.max(Math.abs(score(p)), 1)) + at(p) / 45_000_000
    const inWindow = (p: Post) => (order === 'top' || order === 'comentadas') && days !== null ? now - at(p) <= days * DAY_MS : true
    const sorted = withArrows.filter(inWindow).sort((a, b) => {
      if (order === 'novas') return at(b) - at(a)
      if (order === 'top') return score(b) - score(a)
      if (order === 'comentadas') return b.respostas - a.respostas || score(b) - score(a)
      return hot(b) - hot(a)
    })
    return page(order === 'comentadas' ? sorted.filter((p) => p.respostas > 0) : sorted, options.cursor, options.limite)
  }

  async karmaBatch(uids: string[]): Promise<Record<string, number>> {
    const known = new Set(this.rovers().map((r) => r.uid))
    return Object.fromEntries(uids.filter((u) => known.has(u)).map((u) => [u, this.karmaOf(u)]))
  }
}
