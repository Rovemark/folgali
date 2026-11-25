// A fila de aprovação é UMA só: rascunhos de postagem e resposta (fase 1) e rascunhos sociais (0.3) juntos, do mais
// antigo ao mais novo. Este módulo monta a fila e diz para onde levar a pessoa depois de publicar. Puro.

import type { Rascunho } from './aprovacao'
import type { Campos, RascunhoSocial } from './aprovacao-social'

export type ItemDaFila = { tipo: 'texto'; id: string; criadoEm: string; r: Rascunho } | { tipo: 'social'; id: string; criadoEm: string; r: RascunhoSocial }

/** Junta as duas listas pela data de criação (o que espera há mais tempo vem primeiro). Sem rascunho social, não mexe na ordem. */
export function montarFila(textos: Rascunho[], sociais: RascunhoSocial[]): ItemDaFila[] {
  const t: ItemDaFila[] = textos.map((r) => ({ tipo: 'texto', id: r.id, criadoEm: r.criadoEm, r }))
  if (sociais.length === 0) return t
  const s: ItemDaFila[] = sociais.map((r) => ({ tipo: 'social', id: r.id, criadoEm: r.criadoEm, r }))
  return [...t, ...s].sort((a, b) => (a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : 0))
}

const texto = (c: Campos, nome: string): string | null => {
  const v = c[nome]
  return typeof v === 'string' && v !== '' ? v : null
}

/**
 * Para onde levar a pessoa depois de aprovar: o objeto criado (comunidade, tópico, página) ou o lugar de destino que o
 * rascunho disse. Devolve um caminho SEM idioma (`/comunidades/ob_...`) ou null quando não há para onde ir.
 */
export function caminhoDepoisDePublicar(r: Pick<RascunhoSocial, 'tipo' | 'campos' | 'destino' | 'rover'>, objetoId?: string): string | null {
  const c = r.campos
  switch (r.tipo) {
    case 'comunidade-criar':
      return objetoId ? `/comunidades/${objetoId}` : null
    case 'pagina-criar':
      return objetoId ? `/paginas/${objetoId}` : null
    case 'topico':
      return objetoId ? `/t/${objetoId}` : null
    case 'comunidade-atualizar':
      return texto(c, 'comunidade') ? `/comunidades/${texto(c, 'comunidade')}` : null
    case 'comunidade-posse':
      return texto(c, 'comunidade') ? `/comunidades/${texto(c, 'comunidade')}` : null
    case 'apelacao':
      return r.campos.tipo === 'banimento' && texto(c, 'alvo') ? `/comunidades/${texto(c, 'alvo')}` : null
    case 'pagina-atualizar':
    case 'pagina-publicar':
      return texto(c, 'pagina') ? `/paginas/${texto(c, 'pagina')}` : null
    case 'topico-editar':
    case 'resposta-forum':
      return texto(c, 'topico') ? `/t/${texto(c, 'topico')}` : null
    case 'entrega':
      return `/r/${r.rover.handle}`
    case 'conversa-pedir':
      return objetoId ? `/mensagens/${objetoId}` : '/mensagens'
    case 'mensagem':
      return texto(c, 'conversa') ? `/mensagens/${texto(c, 'conversa')}` : '/mensagens'
    case 'recado':
    case 'depoimento':
      return r.destino?.href ? r.destino.href.replace(/^\/(?:pt|en)(?=\/|$)/, '') || null : null
  }
}
