// Funções puras do painel "Meu rover": o resumo do rascunho que espera há mais tempo e o corte dos avisos novos.
import type { ItemDaFila } from '../dominio/fila-aprovacao'
import type { Campos } from '../dominio/aprovacao-social'
import type { Notificacao } from '../social/tipos'

export interface ResumoDoRascunho {
  /** a chave do tipo em `socInicio.tipos` */
  tipo: string
  /** título ou nome, quando o rascunho tem (tópico, entrega, comunidade, página) */
  titulo: string | null
  /** o começo do texto EXATO, sem reescrever nada: só corta, e só em fim de palavra */
  texto: string
  /** o texto foi cortado (a tela avisa que continua na fila) */
  cortado: boolean
  /** para onde ou para quem vai, quando o rascunho diz */
  destino: string | null
}

export const TAMANHO_DO_RESUMO = 280

/** Corta em fim de palavra, sem mexer em nada do que fica: o resumo é o começo do texto exato. */
export function comecoExato(texto: string, max = TAMANHO_DO_RESUMO): { texto: string; cortado: boolean } {
  if (texto.length <= max) return { texto, cortado: false }
  const corte = texto.slice(0, max)
  const espaco = Math.max(corte.lastIndexOf(' '), corte.lastIndexOf('\n'))
  return { texto: `${(espaco > max * 0.6 ? corte.slice(0, espaco) : corte).trimEnd()}…`, cortado: true }
}

const campo = (c: Campos, nome: string): string | null => {
  const v = c[nome]
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

export function resumoDoRascunho(item: ItemDaFila, max = TAMANHO_DO_RESUMO): ResumoDoRascunho {
  if (item.tipo === 'texto') {
    const r = item.r
    const { texto, cortado } = comecoExato(r.texto, max)
    return { tipo: r.tipo, titulo: null, texto, cortado, destino: r.respondeA ? `@${r.respondeA.autor.handle}` : null }
  }
  const r = item.r
  const corpo = campo(r.campos, 'texto') ?? campo(r.campos, 'descricao') ?? campo(r.campos, 'resultado') ?? ''
  const { texto, cortado } = comecoExato(corpo, max)
  return { tipo: r.tipo, titulo: campo(r.campos, 'titulo') ?? campo(r.campos, 'nome'), texto, cortado, destino: r.destino?.rotulo ?? null }
}

/** Os avisos que a pessoa ainda não viu (número maior que o último visto), do mais novo ao mais velho, até `n`. */
export function avisosNaoLidos(itens: readonly Notificacao[], visto: number, n: number): { lista: Notificacao[]; total: number } {
  const novos = itens.filter((x) => x.seq > visto).sort((a, b) => b.seq - a.seq)
  return { lista: novos.slice(0, n), total: novos.length }
}
