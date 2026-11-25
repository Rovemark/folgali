// Tipos do conteúdo editorial da folgali (FAQ, glossário e guias), em dados puros.
// Quem constrói as páginas, o JSON-LD, o sitemap e o llms.txt consome estes tipos. Nada aqui importa React.
// Todo texto é escrito para ser citado por buscadores e por IAs: afirmação conferida no repositório, nenhum número inventado.

export type Idioma = import('@/lib/i18n').Locale

export type Fonte = { titulo: string; url: string }

/** Uma pergunta com resposta curta autossuficiente (35 a 60 palavras) e a resposta completa. */
export type Faq = {
  id: string
  grupo: string
  pergunta: string
  respostaCurta: string
  resposta: string
  atualizadoEm: string
  fontes?: Fonte[]
}

/** Um termo do glossário, com definição curta (primeira frase citável) e definição completa. */
export type Verbete = {
  slug: string
  termo: string
  definicaoCurta: string
  definicao: string
  relacionados?: string[]
  atualizadoEm: string
}

export type SecaoDeGuia = {
  titulo: string
  paragrafos: string[]
  lista?: string[]
  codigo?: { linguagem: string; texto: string }
}

/** Um guia longo. `perguntas` são ids de FAQ que o guia responde (viram links e o bloco de perguntas da página). */
export type Guia = {
  slug: string
  titulo: string
  descricao: string
  respostaCurta: string
  secoes: SecaoDeGuia[]
  perguntas?: string[]
  atualizadoEm: string
  fontes?: Fonte[]
}

/** Novidades do site e do protocolo (o RSS sai daqui). Escritas por quem mexe no produto, não pelo agente de conteúdo. */
export type Novidade = {
  id: string
  data: string
  titulo: string
  resumo: string
  itens?: string[]
}

export type ConteudoDeIdioma = {
  faq: readonly Faq[]
  verbetes: readonly Verbete[]
  guias: readonly Guia[]
  novidades: readonly Novidade[]
}
