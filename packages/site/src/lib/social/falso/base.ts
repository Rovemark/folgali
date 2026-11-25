// A base do estado social em memória: os dados e os ajudantes de consulta que leitura e escrita dividem.

import { idDeDemonstracao } from '../../dominio/ids'
import { podeNaComunidade, type Quem } from '../../dominio/permissoes'
import { ErroRede, type Pagina, type Postagem, type ResumoRover } from '../../tipos'
import type { MotivoDenunciaSocial, PapelNaComunidade } from '../tipos'
import {
  DIA, TAMANHO_SOCIAL, type AmizadeAtiva, type AmizadeRecusada, type AnuncioS, type ApelacaoS, type AtualizacaoS, type ComunidadeS, type ConteudoRetido, type DenunciaS,
  type DepoimentoS, type EntregaS, type NotificacaoS, type PaginaS, type PedidoAmizade, type RecadoS, type RegistroS, type RespostaS, type RoverS, type SeloS, type TopicoS,
} from './interno'
import type { RascunhoSocial } from '../../dominio/aprovacao-social'

/** O que o cliente antigo (postagens, seguir) empresta ao social. */
export interface Ganchos {
  perfilAntigo(uid: string): { seguindo: number; seguidores: number; euSigo?: boolean } | undefined
  postagensDaLinha(): Postagem[]
  desfazerSeguir(a: string, b: string): void
  /** devolve verdadeiro se o id era uma postagem antiga (e a removeu, se do autor) */
  removerPostagemAntiga(id: string, autor: string): boolean
  denunciarAntiga(alvo: string, motivo: MotivoDenunciaSocial): boolean
}

export const SEM_GANCHOS: Ganchos = {
  perfilAntigo: () => undefined,
  postagensDaLinha: () => [],
  desfazerSeguir: () => undefined,
  removerPostagemAntiga: () => false,
  denunciarAntiga: () => false,
}

export const iso = (ms: number) => new Date(ms).toISOString()
const criarCursor = (n: number) => btoa(String(n))
export function lerCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0
  let n = NaN
  try {
    n = Number.parseInt(atob(cursor), 10)
  } catch {
    n = NaN
  }
  if (!Number.isInteger(n) || n < 0) throw new ErroRede('invalido', 'cursor inválido')
  return n
}
export function paginar<T>(itens: T[], cursor?: string, tam = TAMANHO_SOCIAL): Pagina<T> {
  const ini = lerCursor(cursor)
  return { itens: itens.slice(ini, ini + tam), proximo: ini + tam < itens.length ? criarCursor(ini + tam) : undefined }
}

export const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()

export class Base {
  readonly rovers = new Map<string, RoverS>()
  readonly bdComunidades = new Map<string, ComunidadeS>()
  readonly bdTopicos = new Map<string, TopicoS>()
  readonly bdRespostas = new Map<string, RespostaS>()
  readonly bdPaginas = new Map<string, PaginaS>()
  readonly bdAtualizacoes = new Map<string, AtualizacaoS>()
  /** 0.3.2: os anúncios do operador do relé */
  readonly bdAnuncios: AnuncioS[] = []
  readonly bdRecados: RecadoS[] = []
  readonly bdDepoimentos: DepoimentoS[] = []
  readonly bdSelos: SeloS[] = []
  readonly bdEntregas: EntregaS[] = []
  readonly amizades: AmizadeAtiva[] = []
  readonly pedidos: PedidoAmizade[] = []
  readonly recusadas: AmizadeRecusada[] = []
  /** `${de}>${alvo}` -> relação */
  readonly bdRelacoes = new Map<string, { relacao: 'bloqueio' | 'silencio'; desde: number }>()
  readonly bdNotificacoes: NotificacaoS[] = []
  readonly denuncias: DenunciaS[] = []
  readonly apelacoes: ApelacaoS[] = []
  readonly registro: RegistroS[] = []
  readonly retidos = new Map<string, ConteudoRetido>()
  readonly rascunhos: RascunhoSocial[] = []
  /** quem denunciou o quê, por dia (a mesma pessoa: no máximo 10 por dia) */
  readonly denunciasPorQuem = new Map<string, number[]>()
  /** os últimos tempos de cada tipo de gesto por autor (taxa, só onde a demonstração precisa) */
  readonly taxa = new Map<string, number[]>()
  protected seq = 0
  protected contador = 0
  protected contadorRascunho = 0

  constructor(
    readonly agora: () => Date,
    readonly eu: string,
    protected readonly ganchos: Ganchos = SEM_GANCHOS,
  ) {}

  /** Depois da semente: o próximo aviso e o próximo rascunho continuam a partir dos que já existem. */
  fixarContadores(avisos: number): void {
    this.seq = avisos
    this.contadorRascunho = this.rascunhos.length
  }

  now(): number {
    return this.agora().getTime()
  }
  novoId(): string {
    return idDeDemonstracao('ob', `z${++this.contador}`)
  }
  novoRascunhoId(): string {
    return `rsc_soc_${String(++this.contadorRascunho).padStart(2, '0')}`
  }

  // ---- rovers ---------------------------------------------------------------------------------------

  rover(uid: string): RoverS {
    const r = this.rovers.get(uid)
    if (!r) throw new ErroRede('nao-encontrado', 'rover não encontrado')
    return r
  }
  roverPorRef(ref: string): RoverS {
    const limpo = ref.replace(/^@/, '').toLowerCase()
    for (const r of this.rovers.values()) if (r.uid === ref || r.handle === limpo) return r
    throw new ErroRede('nao-encontrado', 'rover não encontrado')
  }
  resumo(uid: string): ResumoRover {
    const r = this.rover(uid)
    return { uid: r.uid, handle: r.handle, nome: r.nome, rosto: r.rosto }
  }
  contaDias(uid: string): number {
    return Math.floor((this.now() - this.rover(uid).desde) / DIA)
  }
  proprio(uid: string): boolean {
    return uid === this.eu
  }

  // ---- relações ----------------------------------------------------------------------------------------

  chave = (a: string, b: string) => `${a}>${b}`
  bloqueou(de: string, alvo: string): boolean {
    return this.bdRelacoes.get(this.chave(de, alvo))?.relacao === 'bloqueio'
  }
  silenciou(de: string, alvo: string): boolean {
    return this.bdRelacoes.get(this.chave(de, alvo))?.relacao === 'silencio'
  }
  /** bloqueio em QUALQUER sentido */
  bloqueio(a: string, b: string): boolean {
    return this.bloqueou(a, b) || this.bloqueou(b, a)
  }
  amizade(a: string, b: string): AmizadeAtiva | undefined {
    return this.amizades.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))
  }
  ehAmigo(a: string, b: string): boolean {
    return !!this.amizade(a, b)
  }
  amigosDe(uid: string): string[] {
    return this.amizades.filter((x) => x.a === uid || x.b === uid).map((x) => (x.a === uid ? x.b : x.a))
  }
  amigoHaDias(a: string, b: string): number {
    const am = this.amizade(a, b)
    return am ? Math.floor((this.now() - am.desde) / DIA) : 0
  }
  grafoPublico(uid: string): boolean {
    return this.rover(uid).grafo === 'publico'
  }

  // ---- comunidades -------------------------------------------------------------------------------------

  com(id: string): ComunidadeS {
    const c = this.bdComunidades.get(id)
    if (!c || c.encerrada) throw new ErroRede('nao-encontrado', 'comunidade não encontrada')
    return c
  }
  papel(c: ComunidadeS, uid: string): PapelNaComunidade | null {
    return c.membros.get(uid)?.papel ?? null
  }
  banido(c: ComunidadeS, uid: string): boolean {
    return c.banidos.some((b) => b.uid === uid)
  }
  quem(c: ComunidadeS, uid: string): Quem {
    const m = c.membros.get(uid)
    return { papel: m?.papel ?? null, banido: this.banido(c, uid), membroHa: m ? Math.floor((this.now() - m.desde) / 1000) : undefined }
  }
  /** O leitor pode ler esta comunidade? (fechada: só membro não banido) */
  podeLer(c: ComunidadeS, uid: string): boolean {
    return podeNaComunidade('ler', this.quem(c, uid), c.acesso).ok
  }
  ehEquipe(c: ComunidadeS, uid: string): boolean {
    const p = this.papel(c, uid)
    return (p === 'dono' || p === 'moderador') && !this.banido(c, uid)
  }
  top(id: string): TopicoS {
    const t = this.bdTopicos.get(id)
    if (!t || t.apagado) throw new ErroRede('nao-encontrado', 'tópico não encontrado')
    return t
  }
  /** Tópico que o leitor pode ver (a comunidade fechada é invisível a quem está fora). Lança nao-encontrado. */
  topicoLegivel(id: string, leitor = this.eu): TopicoS {
    const t = this.top(id)
    const c = this.bdComunidades.get(t.comunidade)
    if (!c || c.encerrada || !this.podeLer(c, leitor)) throw new ErroRede('nao-encontrado', 'tópico não encontrado')
    return t
  }
  respostasVivas(topicoId: string): RespostaS[] {
    return [...this.bdRespostas.values()].filter((r) => r.topico === topicoId && !r.removida && !r.apagada).sort((a, b) => a.em - b.em)
  }
  atividadeDoTopico(t: TopicoS): number {
    const ult = this.respostasVivas(t.id).at(-1)
    return Math.max(t.em, ult?.em ?? 0)
  }
  atividadeDaComunidade(c: ComunidadeS): number {
    let m = c.criadaEm
    for (const t of this.bdTopicos.values()) if (t.comunidade === c.id && !t.removido && !t.apagado) m = Math.max(m, this.atividadeDoTopico(t))
    return m
  }

  // ---- páginas ------------------------------------------------------------------------------------------

  pag(id: string): PaginaS {
    const p = this.bdPaginas.get(id)
    if (!p || p.encerrada) throw new ErroRede('nao-encontrado', 'página não encontrada')
    return p
  }
  papelNaPagina(p: PaginaS, uid: string): 'dono' | 'administrador' | null {
    if (p.dono === uid) return 'dono'
    return p.admins.includes(uid) ? 'administrador' : null
  }
  /** seguidores que mantêm o grafo público */
  seguidoresPublicos(p: PaginaS): string[] {
    return [...p.seguidores.keys()].filter((u) => this.rovers.has(u) && this.grafoPublico(u))
  }

  // ---- notificações ------------------------------------------------------------------------------------

  /** Gera a notificação, SEM texto. Não sai para si mesmo, nem de rover silenciado ou bloqueado. */
  notificar(destino: string, tipo: NotificacaoS['tipo'], o: { origem?: string | null; objeto?: string | null; comunidade?: string | null; pagina?: string | null } = {}): void {
    const origem = o.origem ?? null
    if (origem && (origem === destino || this.bloqueio(origem, destino) || this.silenciou(destino, origem))) return
    if (!this.rovers.has(destino)) return
    this.bdNotificacoes.push({ seq: ++this.seq, destino, tipo, em: this.now(), origem, objeto: o.objeto ?? null, comunidade: o.comunidade ?? null, pagina: o.pagina ?? null })
  }

  /** Conta gestos recentes de um autor, para a taxa. */
  contarTaxa(chave: string, janelaMs: number): number {
    const agora = this.now()
    const l = (this.taxa.get(chave) ?? []).filter((t) => agora - t < janelaMs)
    this.taxa.set(chave, l)
    return l.length
  }
  marcarTaxa(chave: string): void {
    const l = this.taxa.get(chave) ?? []
    l.push(this.now())
    this.taxa.set(chave, l)
  }
}
