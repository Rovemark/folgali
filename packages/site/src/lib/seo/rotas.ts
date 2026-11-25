// Registro único das rotas públicas. O rodapé, o sitemap, o llms.txt e o RSS leem DAQUI: página que não está aqui não aparece em
// nenhum deles, e um teste confere que cada rota daqui tem um `page.tsx` de verdade (nada de link morto).

import { ENTIDADE } from '@/lib/site'

export type Secao = 'rede' | 'pessoas' | 'dev' | 'recursos' | 'confianca' | 'empresa'
export type Frequencia = 'daily' | 'weekly' | 'monthly' | 'yearly'

export type Rota = {
  /** Chave do rótulo em `rodape.<idioma>.json` (`rotulos`) e do título em `institucional` quando a página é nossa. */
  id: string
  /** '' (início do idioma) ou caminho que começa com `/`, sem o idioma. Vazio quando o destino é externo. */
  caminho: string
  /** Em que coluna do rodapé aparece. `null` quando só entra no sitemap e no llms.txt. */
  secao: Secao | null
  /** Destino fora do site (rodapé). Quando existe, a rota não entra no sitemap nem no llms.txt. */
  externo?: string
  /** Entra no sitemap quando o site for indexável. */
  indexavel: boolean
  prioridade: number
  frequencia: Frequencia
}

export const ROTAS: readonly Rota[] = [
  // Rede
  { id: 'inicio', caminho: '', secao: 'rede', indexavel: true, prioridade: 1, frequencia: 'daily' },
  { id: 'linha', caminho: '/linha', secao: 'rede', indexavel: true, prioridade: 0.8, frequencia: 'daily' },
  { id: 'descobrir', caminho: '/descobrir', secao: 'rede', indexavel: true, prioridade: 0.8, frequencia: 'daily' },
  { id: 'comunidades', caminho: '/comunidades', secao: 'rede', indexavel: true, prioridade: 0.8, frequencia: 'daily' },
  { id: 'paginas', caminho: '/paginas', secao: 'rede', indexavel: true, prioridade: 0.7, frequencia: 'daily' },
  { id: 'buscar', caminho: '/buscar', secao: 'rede', indexavel: false, prioridade: 0.3, frequencia: 'weekly' },
  // o painel "Meu rover" depende do app pareado (a credencial do rover): fica no registro para ter título e descrição pelo mesmo caminho
  // das outras páginas, mas sem coluna no rodapé, fora do sitemap e fora do índice SEMPRE (ROTAS_FORA_DO_INDICE, em politica.ts)
  { id: 'meuRover', caminho: '/inicio', secao: null, indexavel: false, prioridade: 0, frequencia: 'daily' },
  // Pessoas
  { id: 'entrar', caminho: '/entrar', secao: 'pessoas', indexavel: true, prioridade: 0.9, frequencia: 'monthly' },
  // /entrar/pessoa e /entrar/agente saíram em 24/11/2026 (redirecionam para /entrar e /agentes): a pessoa entra pela Rovemark em
  // /entrar, e o agente de fora lê /agentes. O id `entrarAgente` ficou, para o rótulo do rodapé e o título não mudarem de chave.
  { id: 'entrarAgente', caminho: '/agentes', secao: 'dev', indexavel: true, prioridade: 0.8, frequencia: 'monthly' },
  { id: 'comoFunciona', caminho: '/como-funciona', secao: 'pessoas', indexavel: true, prioridade: 0.9, frequencia: 'monthly' },
  { id: 'privacidade', caminho: '/privacidade', secao: 'pessoas', indexavel: true, prioridade: 0.6, frequencia: 'monthly' },
  // o guia entra no sitemap pela lista de guias (por slug); marcá-lo aqui também repetiria o endereço
  { id: 'aprovacaoHumana', caminho: '/guias/como-funciona-a-aprovacao-humana', secao: 'pessoas', indexavel: false, prioridade: 0.8, frequencia: 'monthly' },
  // Agentes e desenvolvedores
  { id: 'protocolo', caminho: '/protocolo', secao: 'dev', indexavel: true, prioridade: 0.9, frequencia: 'monthly' },
  { id: 'desenvolvedores', caminho: '/desenvolvedores', secao: 'dev', indexavel: true, prioridade: 0.8, frequencia: 'monthly' },
  { id: 'api', caminho: '/desenvolvedores/api', secao: 'dev', indexavel: true, prioridade: 0.7, frequencia: 'monthly' },
  { id: 'codigo', caminho: '', secao: 'dev', externo: ENTIDADE.urlCodigo, indexavel: false, prioridade: 0, frequencia: 'yearly' },
  { id: 'registroPublico', caminho: '/moderacao', secao: 'dev', indexavel: true, prioridade: 0.5, frequencia: 'daily' },
  { id: 'status', caminho: '/status', secao: 'dev', indexavel: true, prioridade: 0.4, frequencia: 'daily' },
  // Recursos
  { id: 'ajuda', caminho: '/ajuda', secao: 'recursos', indexavel: true, prioridade: 0.9, frequencia: 'monthly' },
  { id: 'glossario', caminho: '/glossario', secao: 'recursos', indexavel: true, prioridade: 0.8, frequencia: 'monthly' },
  { id: 'guias', caminho: '/guias', secao: 'recursos', indexavel: true, prioridade: 0.8, frequencia: 'monthly' },
  { id: 'novidades', caminho: '/novidades', secao: 'recursos', indexavel: true, prioridade: 0.6, frequencia: 'weekly' },
  // Confiança
  { id: 'termos', caminho: '/termos', secao: 'confianca', indexavel: true, prioridade: 0.4, frequencia: 'yearly' },
  { id: 'regras', caminho: '/regras', secao: 'confianca', indexavel: true, prioridade: 0.6, frequencia: 'monthly' },
  { id: 'seguranca', caminho: '/seguranca', secao: 'confianca', indexavel: true, prioridade: 0.7, frequencia: 'monthly' },
  { id: 'transparencia', caminho: '/transparencia', secao: 'confianca', indexavel: true, prioridade: 0.6, frequencia: 'monthly' },
  { id: 'governanca', caminho: '/governanca', secao: 'confianca', indexavel: true, prioridade: 0.5, frequencia: 'monthly' },
  { id: 'licenca', caminho: '/licenca', secao: 'confianca', indexavel: true, prioridade: 0.5, frequencia: 'yearly' },
  // Empresa
  { id: 'sobre', caminho: '/sobre', secao: 'empresa', indexavel: true, prioridade: 0.7, frequencia: 'monthly' },
  { id: 'rovemark', caminho: '', secao: 'empresa', externo: ENTIDADE.urlEmpresa, indexavel: false, prioridade: 0, frequencia: 'yearly' },
  { id: 'roverHangar', caminho: '', secao: 'empresa', externo: 'https://roverhangar.com', indexavel: false, prioridade: 0, frequencia: 'yearly' },
  { id: 'imprensa', caminho: '/imprensa', secao: 'empresa', indexavel: true, prioridade: 0.4, frequencia: 'monthly' },
  { id: 'contato', caminho: '/contato', secao: 'empresa', indexavel: true, prioridade: 0.5, frequencia: 'yearly' },
]

/** A seção `confianca` repete `privacidade` e a de pessoas também: o link existe nas duas colunas, a rota é uma só. */
export const SECOES_DO_RODAPE: readonly Secao[] = ['rede', 'pessoas', 'dev', 'recursos', 'confianca', 'empresa']

export const rotasDaSecao = (s: Secao): Rota[] => ROTAS.filter((r) => r.secao === s)

/** Rotas cujo `page.tsx` é nosso e que existem no site (sem as externas). */
export const rotasInternas = (): Rota[] => ROTAS.filter((r) => r.externo === undefined)
/** Rotas do sitemap: internas e marcadas como indexáveis. */
export const rotasDoSitemap = (): Rota[] => ROTAS.filter((r) => r.externo === undefined && r.indexavel)

/** O primeiro segmento depois do idioma que decide a seção de um caminho (usado pelos testes de cobertura). */
export const caminhoSemIdioma = (pathname: string): { lang: string | null; resto: string } => {
  const m = /^\/([a-z]{2})(\/.*)?$/.exec(pathname)
  if (!m) return { lang: null, resto: pathname }
  return { lang: m[1], resto: m[2] ?? '' }
}
