// Para onde um aviso leva e o que a tela escreve nele. O aviso NUNCA carrega texto de conteúdo: só o tipo e
// ponteiros (quem, qual objeto, qual comunidade). Para ler, a pessoa abre o objeto, e a leitura obedece à
// visibilidade de agora; quando o ponteiro vem nulo, o aviso diz "não está mais disponível". Puro.

import { fmt, type Dicionario } from '../i18n-base'
import type { Notificacao, TipoDeNotificacao } from '../social/tipos'

export interface Destino {
  /** caminho depois de /<lang>; null quando não há para onde ir */
  href: string | null
  /** o aviso aponta para algo que já não pode ser lido */
  indisponivel: boolean
}

const DE_TOPICO: TipoDeNotificacao[] = ['resposta-no-topico', 'resposta-a-voce', 'citacao', 'mencao', 'resolveu']
const DE_COMUNIDADE: TipoDeNotificacao[] = ['convite-comunidade', 'pedido-de-entrada', 'entrada-aprovada', 'expulso', 'banido', 'posse-recebida', 'apelacao-recebida', 'apelacao-decidida']

/** O destino do aviso, dado o handle do rover da pessoa e o do autor (origem). */
export function destinoDoAviso(n: Pick<Notificacao, 'tipo' | 'objeto' | 'comunidade' | 'pagina' | 'origem'>, meuHandle: string): Destino {
  const t = n.tipo
  if (t === 'recado') return { href: `/r/${meuHandle}?aba=mural`, indisponivel: false }
  if (t === 'selo-recebido') return { href: `/r/${meuHandle}`, indisponivel: false }
  if (t === 'pedido-de-amizade') return { href: '/amigos', indisponivel: false }
  if (t === 'amizade-aceita') return n.origem ? { href: `/r/${n.origem.handle}`, indisponivel: false } : { href: null, indisponivel: true }
  if (t === 'depoimento-para-aceitar') return { href: `/r/${meuHandle}?aba=depoimentos`, indisponivel: false }
  if (t === 'depoimento-aceito') return n.origem ? { href: `/r/${n.origem.handle}?aba=depoimentos`, indisponivel: false } : { href: null, indisponivel: true }
  if (DE_TOPICO.includes(t)) return n.objeto ? { href: `/t/${n.objeto}`, indisponivel: false } : { href: null, indisponivel: true }
  if (DE_COMUNIDADE.includes(t)) return n.comunidade ? { href: `/comunidades/${n.comunidade}`, indisponivel: false } : { href: null, indisponivel: true }
  if (t === 'novo-seguidor') return n.pagina ? { href: `/paginas/${n.pagina}`, indisponivel: false } : { href: null, indisponivel: true }
  // 0.4.0: o aviso de conversa leva às mensagens; o pedido e as mensagens só se leem lá, com a chave do app
  if (t === 'conversa-pedido' || t === 'conversa-aceita') return { href: '/mensagens', indisponivel: false }
  if (t === 'removido-por-responsavel') return n.comunidade ? { href: `/comunidades/${n.comunidade}`, indisponivel: false } : n.pagina ? { href: `/paginas/${n.pagina}`, indisponivel: false } : { href: null, indisponivel: false }
  return { href: null, indisponivel: false }
}

/** Quais avisos têm um botão de ação ali mesmo. */
export type AcaoDoAviso = 'amizade' | 'convite' | null
export function acaoDoAviso(n: Pick<Notificacao, 'tipo' | 'origem' | 'comunidade'>): AcaoDoAviso {
  if (n.tipo === 'pedido-de-amizade' && n.origem) return 'amizade'
  if (n.tipo === 'convite-comunidade' && n.comunidade) return 'convite'
  return null
}

/** Os avisos novos são os de número maior que o último visto. */
export const ehNovo = (n: Pick<Notificacao, 'seq'>, visto: number): boolean => n.seq > visto

/** A frase do aviso: quem, o quê, onde. Nada de conteúdo: o aviso só aponta. */
export function fraseDoAviso(n: Notificacao, d: Dicionario): string {
  const a = d.socAvisos
  const base = a.tipos[n.tipo]
  return fmt(base, {
    nome: n.origem?.nome ?? a.alguem,
    lugar: n.nomeDoLugar ?? (n.pagina && !n.comunidade ? a.pagina : a.lugar),
    topico: n.nomeDoTopico ?? a.topicoSem,
  })
}
