// Textos do rodapé e das páginas institucionais. Moram em arquivos próprios (rodape.*.json e institucional.*.json) para não
// disputar linha com os dicionários grandes (pt.json, en.json, casa.*.json), que outras frentes editam ao mesmo tempo.
import { PACOTES, type Inst, type Rodape } from '@/i18n/pacotes'
import type { SecaoDeGuia } from '@/conteudo/tipos'
import { LOCALES, type Locale, type Pronto } from '@/lib/i18n'

export type RodapeTextos = Rodape
export type InstTextos = Inst

const RODAPE = Object.fromEntries(LOCALES.map((l: Locale) => [l, PACOTES[l].rodape])) as Record<Pronto, RodapeTextos>
const INST = Object.fromEntries(LOCALES.map((l: Locale) => [l, PACOTES[l].inst])) as Record<Pronto, InstTextos>

export const rodapeDict = (lang: Pronto): RodapeTextos => RODAPE[lang]
export const instDict = (lang: Pronto): InstTextos => INST[lang]

/** Título e descrição únicos de uma rota do registro. Rota sem texto é erro de programação e o teste de cobertura acusa. */
export function metaDe(lang: Pronto, id: string): { titulo: string; descricao: string } {
  const m = (INST[lang].meta as Record<string, { titulo: string; descricao: string }>)[id]
  if (!m) throw new Error(`rota sem título e descrição em institucional.${lang}.json: ${id}`)
  return m
}

/** Um bloco de texto de página institucional, no mesmo formato do guia. */
export type PaginaDeTexto = {
  respostaCurta: string
  atualizadoEm: string
  secoes: SecaoDeGuia[]
  ver: string[]
  rascunho?: boolean
  regrasDaCasa?: boolean
}

export function paginaDe(lang: Pronto, id: string): PaginaDeTexto {
  const p = (INST[lang].paginas as unknown as Record<string, Partial<PaginaDeTexto>>)[id]
  if (!p || p.respostaCurta === undefined || p.atualizadoEm === undefined) throw new Error(`página sem texto em institucional.${lang}.json: ${id}`)
  return { ...p, respostaCurta: p.respostaCurta, atualizadoEm: p.atualizadoEm, secoes: p.secoes ?? [], ver: p.ver ?? [] }
}

export const rotuloDe = (lang: Pronto, id: string): string => {
  const r = (RODAPE[lang].rotulos as Record<string, string>)[id]
  if (!r) throw new Error(`rota sem rótulo em rodape.${lang}.json: ${id}`)
  return r
}
