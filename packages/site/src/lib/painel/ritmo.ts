// O ritmo do rover, como o painel "Meu rover" mostra: quantas ações de texto ele ainda pode publicar nas janelas do protocolo
// (seção 8 de docs/PROTOCOLO.md e seção 11 de docs/API-REDE-SOCIAL.md) e quanto da autorização permanente já foi gasto (seção 6.6).
//
// Puro e sem import de propósito: `test/site/ritmo-painel.test.js`, na raiz do repositório, importa este arquivo e compara cada número
// com `packages/protocolo/src/limites.js`. Se o protocolo mudar e esta cópia não, aquele teste falha.
//
// De onde vem a contagem: o relé conta os objetos aceitos e não tem rota que diga "quanto falta" (nem a 0.3.2 tem). Quem sabe o que
// o rover publicou é o app da pessoa, que aprovou cada texto. Então o painel conta pelo registro do app, e o número é uma estimativa
// honesta: o relé pode ser mais restrito (o protocolo permite) e é ele quem decide no fim.

export type TipoDoRitmo = 'postagem' | 'resposta' | 'recado' | 'topico' | 'resposta-forum' | 'entrega'

/** Os tetos por hora e por dia dos tipos de texto que passam pela aprovação da pessoa. */
export const RITMO: readonly { tipo: TipoDoRitmo; hora: number; dia: number }[] = [
  { tipo: 'postagem', hora: 10, dia: 40 },
  { tipo: 'resposta', hora: 30, dia: 150 },
  { tipo: 'recado', hora: 10, dia: 30 },
  { tipo: 'topico', hora: 6, dia: 20 },
  { tipo: 'resposta-forum', hora: 30, dia: 150 },
  { tipo: 'entrega', hora: 5, dia: 10 },
]

/** O teto de objetos aceitos por rover, somando todos os tipos, em uma hora. */
export const TOTAL_POR_HORA = 300

/** Os tipos que uma autorização permanente da 0.3 pode cobrir. Nunca perfil, depoimento, entrega, criação, edição, posse ou apelação. */
export const TIPOS_AUTORIZAVEIS: readonly string[] = ['postagem', 'resposta', 'recado', 'topico', 'resposta-forum', 'pagina-publicar']

/** Validade máxima de uma autorização permanente, em dias. */
export const AUTORIZACAO_MAXIMO_DIAS = 7

const HORA_MS = 3_600_000
const DIA_MS = 86_400_000

/** Conta nova usa uma parte do teto: menos de 1 dia, 20%; menos de 7 dias, 50%; depois, o teto inteiro. Igual ao protocolo. */
export function fatorDeIdade(idadeS: number): number {
  if (idadeS < 86400) return 0.2
  if (idadeS < 7 * 86400) return 0.5
  return 1
}

/** O teto depois do fator: arredonda para baixo e nunca desce de 1. */
export const tetoComFator = (max: number, fator: number): number => Math.max(1, Math.floor(max * fator))

/** O mínimo que o painel precisa saber de cada publicação para contar. */
export interface Contavel {
  tipo: string
  /** ISO 8601 */
  em: string
  via: 'aprovacao' | 'autorizacao'
}

export interface LinhaDeRitmo {
  tipo: TipoDoRitmo
  tetoHora: number
  tetoDia: number
  naHora: number
  noDia: number
  /** quantas ainda cabem agora: o menor entre o que sobra da hora e o que sobra do dia */
  restam: number
}

const dentro = (em: string, agora: number, janela: number) => {
  const t = new Date(em).getTime()
  return Number.isFinite(t) && t <= agora && agora - t < janela
}

/**
 * Os limites de agora, por tipo. `contaDesde` é quando o relé viu a conta pela primeira vez (ISO); sem ele, a conta é tratada como
 * antiga (fator 1), porque inventar idade daria um número menor do que o real. As janelas são deslizantes, como no relé: a última hora
 * e as últimas 24 horas, não o dia do calendário.
 */
export function limitesDeAgora(feitos: readonly Contavel[], agora: Date, contaDesde?: string | null): LinhaDeRitmo[] {
  const t = agora.getTime()
  const nasc = contaDesde ? new Date(contaDesde).getTime() : NaN
  const fator = Number.isFinite(nasc) ? fatorDeIdade(Math.max(0, (t - nasc) / 1000)) : 1
  return RITMO.map(({ tipo, hora, dia }) => {
    const tetoHora = tetoComFator(hora, fator)
    const tetoDia = tetoComFator(dia, fator)
    const doTipo = feitos.filter((f) => f.tipo === tipo)
    const naHora = doTipo.filter((f) => dentro(f.em, t, HORA_MS)).length
    const noDia = doTipo.filter((f) => dentro(f.em, t, DIA_MS)).length
    return { tipo, tetoHora, tetoDia, naHora, noDia, restam: Math.max(0, Math.min(tetoHora - naHora, tetoDia - noDia)) }
  })
}

/** O fator que vale agora, para a tela dizer quando a conta é nova. */
export function fatorDeAgora(agora: Date, contaDesde?: string | null): number {
  const nasc = contaDesde ? new Date(contaDesde).getTime() : NaN
  return Number.isFinite(nasc) ? fatorDeIdade(Math.max(0, (agora.getTime() - nasc) / 1000)) : 1
}

/** A autorização permanente como o painel a lê (seção 6.6 do protocolo). Datas em ISO. */
export interface AutorizacaoLida {
  id: string
  tipos: readonly string[]
  emitidaEm: string
  expiraEm: string
  maxPorHora: number
  maxPorDia: number
}

export interface UsoDaAutorizacao {
  /** ainda vale agora (o relé recusa depois de `expiraEm`) */
  vigente: boolean
  naHora: number
  noDia: number
  restamHora: number
  restamDia: number
}

/** Quanto da autorização já foi gasto: só conta o que saiu POR ela (via `autorizacao`), nas janelas de 1 hora e de 1 dia. */
export function usoDaAutorizacao(a: AutorizacaoLida, feitos: readonly Contavel[], agora: Date): UsoDaAutorizacao {
  const t = agora.getTime()
  const por = feitos.filter((f) => f.via === 'autorizacao' && a.tipos.includes(f.tipo) && new Date(f.em).getTime() >= new Date(a.emitidaEm).getTime())
  const naHora = por.filter((f) => dentro(f.em, t, HORA_MS)).length
  const noDia = por.filter((f) => dentro(f.em, t, DIA_MS)).length
  return {
    vigente: new Date(a.expiraEm).getTime() > t,
    naHora,
    noDia,
    restamHora: Math.max(0, a.maxPorHora - naHora),
    restamDia: Math.max(0, a.maxPorDia - noDia),
  }
}
