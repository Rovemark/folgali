// A política de rastreamento do site, numa função só. O meta robots (layout e páginas), o cabeçalho X-Robots-Tag (proxy) e o robots.txt
// leem DAQUI e da mesma flag (`indexavel`), então "ligar" o site é uma decisão única e não há canto esquecido.
//
// Regras:
//   - flag desligada (o padrão): nada é indexável, em lugar nenhum, inclusive arquivos;
//   - flag ligada: o conteúdo público é indexável e citável; as telas que dependem de credencial, de rascunho ou de uma pessoa
//     específica (aprovar, avisos, amigos, o painel "Meu rover", mensagens, gestão de comunidade, perfis de rover, resultados de busca) ficam fora SEMPRE.
import type { MetadataRoute } from 'next'
import { caminhoSemIdioma } from './rotas'

/**
 * Padrões das rotas que nunca são indexadas, no caminho SEM o idioma. `*` casa um segmento; `**` no fim casa o resto.
 * É a lista única: o robots.txt e o meta robots saem dela.
 */
export const ROTAS_FORA_DO_INDICE: readonly string[] = [
  '/aprovar/**',
  '/__nao-encontrado',
  '/avisos/**',
  '/amigos/**',
  '/inicio/**',
  '/mensagens/**',
  '/app/**',
  '/denunciar/**',
  '/buscar',
  '/r/**',
  '/comunidades/nova',
  '/paginas/nova',
  '/comunidades/*/gerir',
  '/comunidades/*/novo',
  '/comunidades/*/membros',
  '/comunidades/*/moderacao',
  '/comunidades/*/apelar',
  '/paginas/*/gerir',
  '/t/*/editar',
]

const escapar = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')

/** Padrão da lista -> regex que casa o caminho sem idioma. */
export function padraoParaRegex(padrao: string): RegExp {
  const aberto = padrao.endsWith('/**')
  const base = aberto ? padrao.slice(0, -3) : padrao
  const corpo = base
    .split('/')
    .map((seg) => (seg === '*' ? '[^/]+' : escapar(seg)))
    .join('/')
  return new RegExp(`^${corpo}${aberto ? '(?:/.*)?' : '/?'}$`)
}

const REGEX_FORA = ROTAS_FORA_DO_INDICE.map(padraoParaRegex)

export function foraDoIndice(restoDoCaminho: string): boolean {
  const alvo = restoDoCaminho.split('?')[0].split('#')[0]
  return REGEX_FORA.some((re) => re.test(alvo))
}

export type Politica = { index: boolean; follow: boolean; arquivo: boolean }

/** A política de uma rota. `pathname` vem com o idioma na frente (`/pt/aprovar`); sem idioma conta como rota qualquer. */
export function politicaDaRota(pathname: string, aberto: boolean): Politica {
  if (!aberto) return { index: false, follow: false, arquivo: false }
  const { resto } = caminhoSemIdioma(pathname)
  if (foraDoIndice(resto)) {
    // perfis de rover e resultados de busca: não entram no índice, mas os links que eles têm podem ser seguidos
    const seguir = /^\/(?:r|buscar)(?:\/|$)/.test(resto)
    return { index: false, follow: seguir, arquivo: false }
  }
  return { index: true, follow: true, arquivo: true }
}

/** O valor do cabeçalho X-Robots-Tag. */
export function cabecalhoRobots(p: Politica): string {
  if (!p.index) return [`noindex`, p.follow ? 'follow' : 'nofollow', 'noarchive'].join(', ')
  return 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1'
}

/** O objeto `robots` do `Metadata` do Next, com o mesmo conteúdo do cabeçalho. */
export function metaRobots(p: Politica): NonNullable<import('next').Metadata['robots']> {
  if (!p.index) return { index: false, follow: p.follow, nocache: true, noarchive: true, googleBot: { index: false, follow: p.follow } }
  return {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large', 'max-video-preview': -1 },
  }
}

/**
 * Rastreadores de IA. Decisão: o site é de código aberto e quer ser achado e citado, então os de BUSCA e de RESPOSTA entram, e os de
 * TREINO também entram no conteúdo público (a licença do código é AGPL e a arte tem aviso próprio no rodapé). Tudo o que depende de
 * credencial fica fechado para todos, humanos ou máquinas. Quem quiser mudar a decisão muda esta lista e roda os testes.
 */
export const RASTREADORES_DE_IA: readonly { agente: string; papel: 'busca' | 'resposta' | 'treino'; empresa: string }[] = [
  { agente: 'OAI-SearchBot', papel: 'busca', empresa: 'OpenAI' },
  { agente: 'ChatGPT-User', papel: 'resposta', empresa: 'OpenAI' },
  { agente: 'GPTBot', papel: 'treino', empresa: 'OpenAI' },
  { agente: 'Claude-SearchBot', papel: 'busca', empresa: 'Anthropic' },
  { agente: 'Claude-User', papel: 'resposta', empresa: 'Anthropic' },
  { agente: 'ClaudeBot', papel: 'treino', empresa: 'Anthropic' },
  { agente: 'PerplexityBot', papel: 'busca', empresa: 'Perplexity' },
  { agente: 'Perplexity-User', papel: 'resposta', empresa: 'Perplexity' },
  { agente: 'Google-Extended', papel: 'treino', empresa: 'Google' },
  { agente: 'Applebot-Extended', papel: 'treino', empresa: 'Apple' },
]

/**
 * Os Disallow do robots.txt, com o curinga do idioma na frente. Cada padrão vira TRÊS linhas precisas (a rota exata `$`, o que está
 * embaixo dela `/` e a consulta `?`), porque o robots.txt casa por prefixo e `/*\/r` bloquearia também `/pt/regras`.
 */
export function disallowsDeRobots(): string[] {
  return ROTAS_FORA_DO_INDICE.flatMap((p) => {
    const base = `/*${p.endsWith('/**') ? p.slice(0, -3) : p}`
    return [`${base}$`, `${base}/`, `${base}?`]
  })
}

/** O conteúdo do robots.txt. Fechado: `Disallow: /` para todos, sem sitemap. Aberto: o que está acima. */
export function regrasDeRobots(aberto: boolean, base: string): MetadataRoute.Robots {
  if (!aberto) return { rules: { userAgent: '*', disallow: '/' } }
  const disallow = disallowsDeRobots()
  const agentes = ['*', ...RASTREADORES_DE_IA.map((r) => r.agente)]
  return {
    rules: agentes.map((userAgent) => ({ userAgent, allow: '/', disallow })),
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
