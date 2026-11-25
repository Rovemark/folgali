// Ponto único do conteúdo editorial. As páginas, o sitemap, o llms.txt, o RSS e os dados estruturados leem DAQUI.
// As listas de FAQ, glossário e guias são as REAIS (escritas e conferidas contra o protocolo); a pasta `_exemplo` saiu.
import type { ConteudoDeIdioma } from './tipos'
import { faqPt } from './faq.pt'
import { faqEn } from './faq.en'
import { verbetesPt } from './verbetes.pt'
import { verbetesEn } from './verbetes.en'
import { guiasPt } from './guias.pt'
import { guiasEn } from './guias.en'
import { novidadesEn, novidadesPt } from './novidades'
import dadosEs from './dados/es.json'
import dadosFr from './dados/fr.json'
import dadosDe from './dados/de.json'
import dadosIt from './dados/it.json'
import dadosNl from './dados/nl.json'
import dadosRu from './dados/ru.json'
import dadosAr from './dados/ar.json'
import dadosZh from './dados/zh.json'
import dadosJa from './dados/ja.json'
import dadosKo from './dados/ko.json'
import type { Locale } from '@/lib/i18n'

export { entidade } from './entidade'
export { faqPt, faqEn, verbetesPt, verbetesEn, guiasPt, guiasEn, novidadesEn, novidadesPt }

/** Marca que as listas acima ainda seriam o exemplo. Agora são as reais. */
export const CONTEUDO_E_EXEMPLO = false

/** Conteúdo dos dez idiomas traduzidos: `dados/<idioma>.json`, gerado por `scripts/traduzir-site.mjs` a partir do português. */
type Dados = Pick<ConteudoDeIdioma, 'faq' | 'verbetes' | 'guias' | 'novidades'>
const deJson = (d: unknown): ConteudoDeIdioma => d as Dados

const POR_IDIOMA: Record<Locale, ConteudoDeIdioma> = {
  pt: { faq: faqPt, verbetes: verbetesPt, guias: guiasPt, novidades: novidadesPt },
  en: { faq: faqEn, verbetes: verbetesEn, guias: guiasEn, novidades: novidadesEn },
  es: deJson(dadosEs),
  fr: deJson(dadosFr),
  de: deJson(dadosDe),
  it: deJson(dadosIt),
  nl: deJson(dadosNl),
  ru: deJson(dadosRu),
  ar: deJson(dadosAr),
  zh: deJson(dadosZh),
  ja: deJson(dadosJa),
  ko: deJson(dadosKo),
}

export const conteudoDe = (lang: Locale): ConteudoDeIdioma => POR_IDIOMA[lang]
export type { ConteudoDeIdioma, Faq, Fonte, Guia, Idioma, Novidade, SecaoDeGuia, Verbete } from './tipos'
