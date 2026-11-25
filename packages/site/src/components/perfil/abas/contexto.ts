import type { Elegibilidade } from '../elegibilidade'
import type { Dicionario, Pronto } from '@/lib/i18n'
import type { PaginaDoRover } from '@/lib/social/tipos'
import type { PerfilRover, ResumoRover } from '@/lib/tipos'

/** O que toda aba da página do rover recebe. */
export interface ContextoAba {
  rover: PerfilRover
  pag: PaginaDoRover
  eu: ResumoRover | null
  d: Dicionario
  lang: Pronto
  /** ISO do instante em que a página foi montada (o "há 6 min" bate entre servidor e navegador) */
  agora: string
  eleg: Elegibilidade
}
