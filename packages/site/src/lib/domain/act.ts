// Validation of what the BROWSER sends to the server actions. The browser is a stranger: nothing it
// sends becomes an act without passing through here (shape of the ids, known type, enum of each field). The relay checks
// everything again; this only keeps garbage from reaching the app bridge.

import type { SocialAct } from '../social/social-client'
import { ROVER_STATES, SOCIAL_REPORT_REASONS, MODERATION_REASON_LIST, BADGES } from '../social/types'
import { validateManagement, type ManagementAction } from './moderation'
import { isObjectId, isUid } from './ids'

type Obj = Record<string, unknown>
const at = (list: readonly string[], x: unknown): x is string => typeof x === 'string' && list.includes(x)

const MANAGEMENT = ['convidar', 'cancelar-convite', 'aprovar-pedido', 'recusar-pedido', 'expulsar', 'banir', 'desbanir', 'promover', 'rebaixar']

/** Returns the clean act (only the fields it has) or null if something does not match. */
export function validateAct(x: unknown): SocialAct | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null
  const o = x as Obj
  switch (o.tipo) {
    case 'estado':
      return at(ROVER_STATES, o.estado) ? { tipo: 'estado', estado: o.estado as SocialAct extends { estado: infer E } ? E : never } : null
    case 'amizade':
      return isUid(o.alvo) && at(['pedir', 'aceitar', 'recusar', 'desfazer'], o.acao) ? { tipo: 'amizade', alvo: o.alvo as string, acao: o.acao as 'pedir' } : null
    case 'relacao':
      return isUid(o.alvo) && at(['bloquear', 'desbloquear', 'silenciar', 'dessilenciar'], o.acao) ? { tipo: 'relacao', alvo: o.alvo as string, acao: o.acao as 'bloquear' } : null
    case 'selo':
      return isUid(o.alvo) && at(BADGES, o.selo) ? { tipo: 'selo', alvo: o.alvo as string, selo: o.selo as 'confiavel' } : null
    case 'depoimento-decisao':
      return isObjectId(o.depoimento) && at(['aceitar', 'recusar'], o.decisao) ? { tipo: 'depoimento-decisao', depoimento: o.depoimento as string, decisao: o.decisao as 'aceitar' } : null
    case 'comunidade-adesao':
      return isObjectId(o.comunidade) && at(['entrar', 'sair', 'aceitar-convite', 'recusar-convite', 'cancelar-pedido'], o.acao) ? { tipo: 'comunidade-adesao', comunidade: o.comunidade as string, acao: o.acao as 'entrar' } : null
    case 'comunidade-gestao': {
      if (!isObjectId(o.comunidade) || !isUid(o.alvo) || !at(MANAGEMENT, o.acao)) return null
      const reason = o.motivo === null || o.motivo === undefined ? null : at(MODERATION_REASON_LIST, o.motivo) ? (o.motivo as 'spam') : undefined
      if (reason === undefined) return null
      if (validateManagement(o.acao as ManagementAction, reason) !== null) return null
      return { tipo: 'comunidade-gestao', comunidade: o.comunidade as string, alvo: o.alvo as string, acao: o.acao as 'banir', motivo: reason }
    }
    case 'topico-gestao': {
      if (!isObjectId(o.topico) || !at(['fixar', 'desafixar', 'trancar', 'destrancar', 'mover'], o.acao)) return null
      const community = o.comunidade === null || o.comunidade === undefined ? null : isObjectId(o.comunidade) ? (o.comunidade as string) : undefined
      const category = o.categoria === null || o.categoria === undefined ? null : typeof o.categoria === 'string' && o.categoria.length <= 30 ? o.categoria : undefined
      if (community === undefined || category === undefined) return null
      if ((o.acao === 'mover') !== (community !== null)) return null
      return { tipo: 'topico-gestao', topico: o.topico as string, acao: o.acao as 'fixar', comunidade: community, categoria: category }
    }
    case 'topico-resolvido':
      return isObjectId(o.topico) && (o.resposta === null || isObjectId(o.resposta)) ? { tipo: 'topico-resolvido', topico: o.topico as string, resposta: o.resposta as string | null } : null
    case 'voto':
      return isObjectId(o.topico) && Number.isInteger(o.opcao) && (o.opcao as number) >= 0 && (o.opcao as number) <= 5 ? { tipo: 'voto', topico: o.topico as string, opcao: o.opcao as number } : null
    case 'pagina-seguir':
      return isObjectId(o.pagina) && at(['seguir', 'deixar'], o.acao) ? { tipo: 'pagina-seguir', pagina: o.pagina as string, acao: o.acao as 'seguir' } : null
    case 'pagina-gestao':
      return isObjectId(o.pagina) && isUid(o.alvo) && at(['adicionar-admin', 'remover-admin'], o.acao) ? { tipo: 'pagina-gestao', pagina: o.pagina as string, alvo: o.alvo as string, acao: o.acao as 'adicionar-admin' } : null
    case 'remocao-por-responsavel':
      return isObjectId(o.alvo) && at(MODERATION_REASON_LIST, o.motivo) ? { tipo: 'remocao-por-responsavel', alvo: o.alvo as string, motivo: o.motivo as 'spam' } : null
    case 'remocao-pelo-autor':
      return isObjectId(o.alvo) ? { tipo: 'remocao-pelo-autor', alvo: o.alvo as string } : null
    case 'apelacao-decisao':
      return isObjectId(o.apelacao) && at(['mantida', 'revertida'], o.resultado) ? { tipo: 'apelacao-decisao', apelacao: o.apelacao as string, resultado: o.resultado as 'mantida' } : null
    case 'denuncia':
      return isObjectId(o.alvo) && at(SOCIAL_REPORT_REASONS, o.motivo) ? { tipo: 'denuncia', alvo: o.alvo as string, motivo: o.motivo as 'spam' } : null
    case 'denuncia-dispensar':
      return isObjectId(o.comunidade) && isObjectId(o.alvo) ? { tipo: 'denuncia-dispensar', comunidade: o.comunidade as string, alvo: o.alvo as string } : null
    // 0.4.0: mensagens privadas
    case 'conversa-decidir':
      return isObjectId(o.conversa) && at(['aceitar', 'recusar', 'encerrar'], o.decisao) ? { tipo: 'conversa-decidir', conversa: o.conversa as string, decisao: o.decisao as 'aceitar' } : null
    case 'conversa-apagar':
      return isObjectId(o.conversa) && (o.mensagem === null || isObjectId(o.mensagem)) ? { tipo: 'conversa-apagar', conversa: o.conversa as string, mensagem: o.mensagem as string | null } : null
    case 'mensagem-denuncia':
      return isObjectId(o.mensagem) && at(SOCIAL_REPORT_REASONS, o.motivo) ? { tipo: 'mensagem-denuncia', mensagem: o.mensagem as string, motivo: o.motivo as 'spam' } : null
    default:
      return null
  }
}
