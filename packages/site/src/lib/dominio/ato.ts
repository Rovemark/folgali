// Validação do que o NAVEGADOR manda para as ações do servidor. O navegador é um estranho: nada que ele
// envia vira ato sem passar por aqui (forma dos ids, tipo conhecido, enum de cada campo). O relé confere
// tudo de novo; isto só impede que lixo chegue até a ponte do app.

import type { AtoSocial } from '../social/cliente-social'
import { ESTADOS_ROVER, MOTIVOS_DENUNCIA_SOCIAL, MOTIVOS_MODERACAO, SELOS } from '../social/tipos'
import { validarGestao, type AcaoDeGestao } from './moderacao'
import { ehIdObjeto, ehUid } from './ids'

type Obj = Record<string, unknown>
const em = (lista: readonly string[], x: unknown): x is string => typeof x === 'string' && lista.includes(x)

const GESTAO = ['convidar', 'cancelar-convite', 'aprovar-pedido', 'recusar-pedido', 'expulsar', 'banir', 'desbanir', 'promover', 'rebaixar']

/** Devolve o ato limpo (só os campos que ele tem) ou null se algo não bate. */
export function validarAto(x: unknown): AtoSocial | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null
  const o = x as Obj
  switch (o.tipo) {
    case 'estado':
      return em(ESTADOS_ROVER, o.estado) ? { tipo: 'estado', estado: o.estado as AtoSocial extends { estado: infer E } ? E : never } : null
    case 'amizade':
      return ehUid(o.alvo) && em(['pedir', 'aceitar', 'recusar', 'desfazer'], o.acao) ? { tipo: 'amizade', alvo: o.alvo as string, acao: o.acao as 'pedir' } : null
    case 'relacao':
      return ehUid(o.alvo) && em(['bloquear', 'desbloquear', 'silenciar', 'dessilenciar'], o.acao) ? { tipo: 'relacao', alvo: o.alvo as string, acao: o.acao as 'bloquear' } : null
    case 'selo':
      return ehUid(o.alvo) && em(SELOS, o.selo) ? { tipo: 'selo', alvo: o.alvo as string, selo: o.selo as 'confiavel' } : null
    case 'depoimento-decisao':
      return ehIdObjeto(o.depoimento) && em(['aceitar', 'recusar'], o.decisao) ? { tipo: 'depoimento-decisao', depoimento: o.depoimento as string, decisao: o.decisao as 'aceitar' } : null
    case 'comunidade-adesao':
      return ehIdObjeto(o.comunidade) && em(['entrar', 'sair', 'aceitar-convite', 'recusar-convite', 'cancelar-pedido'], o.acao) ? { tipo: 'comunidade-adesao', comunidade: o.comunidade as string, acao: o.acao as 'entrar' } : null
    case 'comunidade-gestao': {
      if (!ehIdObjeto(o.comunidade) || !ehUid(o.alvo) || !em(GESTAO, o.acao)) return null
      const motivo = o.motivo === null || o.motivo === undefined ? null : em(MOTIVOS_MODERACAO, o.motivo) ? (o.motivo as 'spam') : undefined
      if (motivo === undefined) return null
      if (validarGestao(o.acao as AcaoDeGestao, motivo) !== null) return null
      return { tipo: 'comunidade-gestao', comunidade: o.comunidade as string, alvo: o.alvo as string, acao: o.acao as 'banir', motivo }
    }
    case 'topico-gestao': {
      if (!ehIdObjeto(o.topico) || !em(['fixar', 'desafixar', 'trancar', 'destrancar', 'mover'], o.acao)) return null
      const comunidade = o.comunidade === null || o.comunidade === undefined ? null : ehIdObjeto(o.comunidade) ? (o.comunidade as string) : undefined
      const categoria = o.categoria === null || o.categoria === undefined ? null : typeof o.categoria === 'string' && o.categoria.length <= 30 ? o.categoria : undefined
      if (comunidade === undefined || categoria === undefined) return null
      if ((o.acao === 'mover') !== (comunidade !== null)) return null
      return { tipo: 'topico-gestao', topico: o.topico as string, acao: o.acao as 'fixar', comunidade, categoria }
    }
    case 'topico-resolvido':
      return ehIdObjeto(o.topico) && (o.resposta === null || ehIdObjeto(o.resposta)) ? { tipo: 'topico-resolvido', topico: o.topico as string, resposta: o.resposta as string | null } : null
    case 'voto':
      return ehIdObjeto(o.topico) && Number.isInteger(o.opcao) && (o.opcao as number) >= 0 && (o.opcao as number) <= 5 ? { tipo: 'voto', topico: o.topico as string, opcao: o.opcao as number } : null
    case 'pagina-seguir':
      return ehIdObjeto(o.pagina) && em(['seguir', 'deixar'], o.acao) ? { tipo: 'pagina-seguir', pagina: o.pagina as string, acao: o.acao as 'seguir' } : null
    case 'pagina-gestao':
      return ehIdObjeto(o.pagina) && ehUid(o.alvo) && em(['adicionar-admin', 'remover-admin'], o.acao) ? { tipo: 'pagina-gestao', pagina: o.pagina as string, alvo: o.alvo as string, acao: o.acao as 'adicionar-admin' } : null
    case 'remocao-por-responsavel':
      return ehIdObjeto(o.alvo) && em(MOTIVOS_MODERACAO, o.motivo) ? { tipo: 'remocao-por-responsavel', alvo: o.alvo as string, motivo: o.motivo as 'spam' } : null
    case 'remocao-pelo-autor':
      return ehIdObjeto(o.alvo) ? { tipo: 'remocao-pelo-autor', alvo: o.alvo as string } : null
    case 'apelacao-decisao':
      return ehIdObjeto(o.apelacao) && em(['mantida', 'revertida'], o.resultado) ? { tipo: 'apelacao-decisao', apelacao: o.apelacao as string, resultado: o.resultado as 'mantida' } : null
    case 'denuncia':
      return ehIdObjeto(o.alvo) && em(MOTIVOS_DENUNCIA_SOCIAL, o.motivo) ? { tipo: 'denuncia', alvo: o.alvo as string, motivo: o.motivo as 'spam' } : null
    case 'denuncia-dispensar':
      return ehIdObjeto(o.comunidade) && ehIdObjeto(o.alvo) ? { tipo: 'denuncia-dispensar', comunidade: o.comunidade as string, alvo: o.alvo as string } : null
    // 0.4.0: mensagens privadas
    case 'conversa-decidir':
      return ehIdObjeto(o.conversa) && em(['aceitar', 'recusar', 'encerrar'], o.decisao) ? { tipo: 'conversa-decidir', conversa: o.conversa as string, decisao: o.decisao as 'aceitar' } : null
    case 'conversa-apagar':
      return ehIdObjeto(o.conversa) && (o.mensagem === null || ehIdObjeto(o.mensagem)) ? { tipo: 'conversa-apagar', conversa: o.conversa as string, mensagem: o.mensagem as string | null } : null
    case 'mensagem-denuncia':
      return ehIdObjeto(o.mensagem) && em(MOTIVOS_DENUNCIA_SOCIAL, o.motivo) ? { tipo: 'mensagem-denuncia', mensagem: o.mensagem as string, motivo: o.motivo as 'spam' } : null
    default:
      return null
  }
}
