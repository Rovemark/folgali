// Prazos que as telas dizem em palavras: quando o leitor poderá dar um selo, quanto falta para a carência de membro acabar. São contas
// PURAS sobre as datas que o relé 0.3.1 devolve em `voce` (`amigoDesde`, `contaDesde`, `membroDesde`). Quem decide é sempre o relé: aqui
// só se adianta a regra, para a tela explicar o "ainda não" com a data certa em vez de deixar o toque falhar.

import { CARENCIA_RESPOSTA_S, CARENCIA_TOPICO_S, DIAS_PARA_DEPOIMENTO, DIAS_PARA_SELO } from './permissoes'

const DIA_MS = 86_400_000

/** Milissegundos de um instante ISO, ou `null` se ausente ou torto. */
function ms(iso: string | null | undefined): number | null {
  if (typeof iso !== 'string') return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

/**
 * Quando o leitor passa a poder dar um selo: o dia em que A AMIZADE e A CONTA completam 7 dias (vale o que vier por último).
 * `null` quando falta uma das datas (relé 0.3 não manda): a tela então não promete data nenhuma.
 */
export function quandoPodeDarSelo(amigoDesde: string | null | undefined, contaDesde: string | null | undefined): Date | null {
  return maiorPrazo(amigoDesde, contaDesde, DIAS_PARA_SELO)
}

/** O mesmo para o depoimento: 3 dias de amizade e 3 de conta. */
export function quandoPodeEscreverDepoimento(amigoDesde: string | null | undefined, contaDesde: string | null | undefined): Date | null {
  return maiorPrazo(amigoDesde, contaDesde, DIAS_PARA_DEPOIMENTO)
}

function maiorPrazo(a: string | null | undefined, b: string | null | undefined, dias: number): Date | null {
  const ta = ms(a)
  const tb = ms(b)
  if (ta === null || tb === null) return null
  return new Date(Math.max(ta, tb) + dias * DIA_MS)
}

/** Já passou? (no instante exato conta como já passou) */
export function jaPassou(quando: Date | null, agora: Date): boolean {
  return quando !== null && agora.getTime() >= quando.getTime()
}

export type TipoDeCarencia = 'topico' | 'resposta'

/**
 * Quantos SEGUNDOS faltam para a carência de membro acabar, ou 0 se já acabou (ou se não dá para saber). Tópico e voto esperam 1 hora
 * depois da entrada, resposta 10 minutos. Dono e moderação não têm carência: quem chama decide isso antes.
 */
export function faltaDeCarencia(membroDesde: string | null | undefined, tipo: TipoDeCarencia, agora: Date): number {
  const t = ms(membroDesde)
  if (t === null) return 0
  const exigido = tipo === 'resposta' ? CARENCIA_RESPOSTA_S : CARENCIA_TOPICO_S
  const passou = Math.floor((agora.getTime() - t) / 1000)
  return passou >= exigido ? 0 : Math.max(0, exigido - Math.max(0, passou))
}

/** Segundos desde que o leitor entrou, para a matriz de permissões (`Quem.membroHa`); `undefined` quando o relé não disse. */
export function membroHaSegundos(membroDesde: string | null | undefined, agora: Date): number | undefined {
  const t = ms(membroDesde)
  return t === null ? undefined : Math.max(0, Math.floor((agora.getTime() - t) / 1000))
}

/** Minutos para mostrar ("faltam 12 minutos"): arredonda para cima, no mínimo 1. */
export function minutosParaMostrar(segundos: number): number {
  return Math.max(1, Math.ceil(segundos / 60))
}
