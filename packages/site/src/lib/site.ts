// Identidade pública do site e a chave que decide se ele é indexável.
//
// O site HOJE é uma demonstração em domínio provisório e os textos legais ainda são rascunho: por padrão NADA é indexável.
// A flag `ROVER_NETWORK_INDEXAVEL=sim` liga tudo de uma vez (meta robots, X-Robots-Tag, robots.txt e sitemap.xml leem a MESMA
// função), para ninguém esquecer um canto. Ela é lida em tempo de execução, nunca em tempo de build.

export const URL_BASE_PADRAO = 'https://folgali.com'

/** A entidade como as máquinas devem citá-la: sempre o mesmo nome, a mesma frase e os mesmos sameAs. */
export const ENTIDADE = {
  nome: 'folgali',
  empresa: 'Rovemark',
  produtoIrmao: 'Rover Hangar',
  licenca: 'AGPL-3.0',
  urlLicenca: 'https://www.gnu.org/licenses/agpl-3.0.html',
  urlEmpresa: 'https://rovemark.co',
  /** O código aberto (AGPL): o repositório da folgali na conta da Rovemark no GitHub (GOVERNANCA.md). */
  urlCodigo: 'https://github.com/Rovemark/folgali',
  urlProdutoIrmao: 'https://roverhangar.com',
  emailSeguranca: 'security@roverhangar.com',
} as const

type Ambiente = Readonly<Record<string, string | undefined>>

/** `sim` liga. Qualquer outra coisa (inclusive `true`, `1`, vazio) mantém o site fechado: falhar fechado. */
export function indexavel(env: Ambiente = process.env): boolean {
  return env.ROVER_NETWORK_INDEXAVEL === 'sim'
}

/** Endereço-base sem barra no fim. Só aceita https (ou http em localhost); o resto cai no padrão. */
export function urlBase(env: Ambiente = process.env): string {
  const bruto = env.ROVER_NETWORK_URL_BASE?.trim()
  if (!bruto) return URL_BASE_PADRAO
  try {
    const u = new URL(bruto)
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return URL_BASE_PADRAO
    return u.origin
  } catch {
    return URL_BASE_PADRAO
  }
}

/** Endereço absoluto de uma rota. `caminho` é '' (início do idioma) ou começa com `/`. */
export function urlAbsoluta(base: string, lang: string, caminho = ''): string {
  return `${base}/${lang}${caminho}`
}

/** Um idioma com texto pronto e o código que vai no hreflang. */
export type Idioma = { lang: string; hreflang: string }

/** hreflang de uma rota: um por idioma pronto, mais x-default apontando para o idioma padrão. */
export function alternativas(base: string, caminho: string, idiomas: readonly Idioma[], padrao: string): Record<string, string> {
  const languages: Record<string, string> = {}
  for (const i of idiomas) languages[i.hreflang] = urlAbsoluta(base, i.lang, caminho)
  languages['x-default'] = urlAbsoluta(base, padrao, caminho)
  return languages
}
