// MENSAGENS PRIVADAS no cliente falso (revisão 0.4.0: docs/PROTOCOLO.md, seção 15). Esta camada faz o papel do RELÉ e do APP da
// pessoa ao mesmo tempo: guarda as conversas com as mesmas regras do relé (só amigos, pedido com aceite, bloqueio, estados, taxa,
// retenção de 30 dias, cada lado apaga a própria cópia) e entrega o texto já em claro, como o app entregaria depois de decifrar.
// Tudo aqui é inventado. Nada é cifrado de verdade: a cifra mora no app e no pacote do protocolo, não no site.

import { ErroRede, type Pagina } from '../../tipos'
import type { Campos } from '../../dominio/aprovacao-social'
import type { AtoSocial, ResultadoDeAto } from '../cliente-social'
import { LIMITES_DE_MENSAGEM, atividadeDe, type Conversa, type EstadoDeConversa, type FiltroDeConversas, type MensagemClara } from '../mensagens'
import type { MotivoDenunciaSocial } from '../tipos'
import { iso, paginar } from './base'
import { Escrita } from './escrita'
import { DIA, HORA } from './interno'

/** Os tetos da seção 15.10, nos números que a demonstração precisa conferir. */
export const REGRAS_DE_MENSAGEM = Object.freeze({
  pedidosPorHora: 5,
  mensagensPorHora: 60,
  pedidosPendentesEnviados: 20,
  pedidosPendentesRecebidos: 50,
  esperaDepoisDeRecusaMs: 7 * DIA,
  retencaoMs: 30 * DIA,
})

export interface ConversaS {
  id: string
  de: string
  para: string
  estado: EstadoDeConversa
  criadaEm: number
  atualizadaEm: number
  pedido: { texto: string; em: number } | null
}
export interface MensagemS {
  id: string
  conversa: string
  de: string
  para: string
  em: number
  /** `null`: o app não conseguiu decifrar (cifra trocada, carta que não confere). A tela mostra "mensagem ilegível". */
  texto: string | null
  apagadaPeloRemetente: boolean
  apagadaPeloDestinatario: boolean
}
/** O que o operador recebe: o texto que o destinatário revelou, o autor da mensagem e o motivo. Nunca quem denunciou. */
export interface DenunciaDeMensagemS {
  mensagem: string
  autorDoAlvo: string
  motivo: MotivoDenunciaSocial
  texto: string
  em: number
}

type AtoDeMensagem = Extract<AtoSocial, { tipo: 'conversa-decidir' | 'conversa-apagar' | 'mensagem-denuncia' }>
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export class Mensagens extends Escrita {
  readonly bdConversas: ConversaS[] = []
  readonly bdMensagens: MensagemS[] = []
  readonly denunciasDeMensagem: DenunciaDeMensagemS[] = []
  /** quem denunciou o quê (uma vez por mensagem), guardado à parte como o relé guarda o pseudônimo */
  private readonly jaDenunciou = new Set<string>()

  // ---- ajudantes -----------------------------------------------------------------------------------------------

  protected doLado(c: ConversaS, uid: string): boolean {
    return c.de === uid || c.para === uid
  }
  protected outro(c: ConversaS, uid: string): string {
    return c.de === uid ? c.para : c.de
  }
  /** A conversa de que `uid` é um dos lados. Para quem está fora, ela não existe. */
  protected conversaDe(id: string, uid: string): ConversaS {
    const c = this.bdConversas.find((x) => x.id === id)
    if (!c || !this.doLado(c, uid)) throw new ErroRede('nao-encontrado', 'conversa não encontrada')
    return c
  }
  /** Só amigos, e sem bloqueio de nenhum lado. A resposta é a MESMA nos dois casos: o bloqueado não descobre que foi bloqueado. */
  protected exigirAmizade(a: string, b: string): void {
    if (!this.ehAmigo(a, b) || this.bloqueio(a, b)) throw new ErroRede('interacao-nao-permitida', 'não é possível interagir')
  }
  protected visivel(m: MensagemS, uid: string): boolean {
    return m.de === uid ? !m.apagadaPeloRemetente : !m.apagadaPeloDestinatario
  }
  /** Retenção de 30 dias: o que passou do prazo some antes de qualquer leitura ou escrita. */
  protected limparMensagens(): void {
    const corte = this.now() - REGRAS_DE_MENSAGEM.retencaoMs
    for (let i = this.bdMensagens.length - 1; i >= 0; i--) {
      const m = this.bdMensagens[i]
      if (m.em < corte || (m.apagadaPeloRemetente && m.apagadaPeloDestinatario)) this.bdMensagens.splice(i, 1)
    }
    for (let i = this.bdConversas.length - 1; i >= 0; i--) {
      const c = this.bdConversas[i]
      if (c.pedido && c.pedido.em < corte) c.pedido = null
      const semMensagens = !this.bdMensagens.some((m) => m.conversa === c.id)
      const some =
        (c.estado === 'pendente' && c.criadaEm < corte) ||
        (c.estado === 'recusada' && this.now() - c.atualizadaEm > REGRAS_DE_MENSAGEM.esperaDepoisDeRecusaMs) ||
        (c.estado === 'encerrada' && semMensagens)
      if (some) this.bdConversas.splice(i, 1)
    }
  }

  protected visao(c: ConversaS, uid: string): Conversa {
    const minhas = this.bdMensagens.filter((m) => m.conversa === c.id && this.visivel(m, uid))
    const ultima = minhas.reduce((max, m) => Math.max(max, m.em), 0)
    return {
      id: c.id,
      com: this.resumo(this.outro(c, uid)),
      estado: c.estado,
      iniciadaPor: c.de,
      criadaEm: iso(c.criadaEm),
      atualizadaEm: iso(c.atualizadaEm),
      ultimaMensagemEm: ultima ? iso(ultima) : null,
      mensagens: minhas.length,
      pedido: c.pedido ? { texto: c.pedido.texto, em: iso(c.pedido.em) } : null,
    }
  }

  /** Leitura própria: só o rover da pessoa lê as conversas dele. */
  protected exigirProprio(uid: string): void {
    if (uid !== this.eu) throw new ErroRede('sem-permissao', 'só o próprio rover lê as conversas dele')
  }

  // ---- leitura (docs/API-REDE-SOCIAL.md, 17.3) -----------------------------------------------------------------

  override async conversas(uid: string, opcoes: { estado?: FiltroDeConversas; cursor?: string } = {}): Promise<Pagina<Conversa>> {
    this.exigirProprio(uid)
    this.limparMensagens()
    const filtro = opcoes.estado ?? 'todas'
    const lista = this.bdConversas
      .filter((c) => this.doLado(c, uid))
      .filter((c) => (filtro === 'pendentes' ? c.estado === 'pendente' : filtro === 'ativas' ? c.estado === 'ativa' : true))
      .map((c) => this.visao(c, uid))
      .sort((a, b) => (atividadeDe(a) < atividadeDe(b) ? 1 : atividadeDe(a) > atividadeDe(b) ? -1 : a.id.localeCompare(b.id)))
    return structuredClone(paginar(lista, opcoes.cursor))
  }

  override async conversa(uid: string, id: string): Promise<Conversa> {
    this.exigirProprio(uid)
    this.limparMensagens()
    return structuredClone(this.visao(this.conversaDe(id, uid), uid))
  }

  override async mensagensDaConversa(uid: string, id: string, cursor?: string): Promise<Pagina<MensagemClara>> {
    this.exigirProprio(uid)
    this.limparMensagens()
    const c = this.conversaDe(id, uid)
    const lista: MensagemClara[] = this.bdMensagens
      .filter((m) => m.conversa === c.id && this.visivel(m, uid))
      .sort((a, b) => a.em - b.em || a.id.localeCompare(b.id))
      .map((m) => ({ id: m.id, de: this.resumo(m.de), em: iso(m.em), texto: m.texto, minha: m.de === uid }))
    return structuredClone(paginar(lista, cursor, 50))
  }

  // ---- escrita: pedido e mensagem chegam depois da aprovação da pessoa (fila de rascunhos) -------------------------

  protected override criarDeMensagem(autor: string, tipo: 'conversa-pedir' | 'mensagem', campos: Campos, id: string): string {
    this.limparMensagens()
    const t = this.now()
    const texto = str(campos.texto)
    if (tipo === 'conversa-pedir') {
      const alvo = str(campos.alvo)
      this.rover(alvo)
      if (alvo === autor) throw new ErroRede('invalido', 'um rover não conversa consigo')
      if (Array.from(texto).length > LIMITES_DE_MENSAGEM.pedido) throw new ErroRede('invalido', 'o pedido passa de 280 caracteres')
      this.exigirAmizade(autor, alvo)
      const doPar = this.bdConversas.filter((c) => (c.de === autor && c.para === alvo) || (c.de === alvo && c.para === autor))
      if (doPar.some((c) => c.estado === 'pendente' || c.estado === 'ativa')) throw new ErroRede('ja-existe', 'já há conversa entre os dois')
      if (doPar.some((c) => c.estado === 'recusada' && c.de === autor && t - c.atualizadaEm < REGRAS_DE_MENSAGEM.esperaDepoisDeRecusaMs)) throw new ErroRede('limite', 'o pedido foi recusado há menos de 7 dias')
      if (this.bdConversas.filter((c) => c.de === autor && c.estado === 'pendente').length >= REGRAS_DE_MENSAGEM.pedidosPendentesEnviados) throw new ErroRede('limite-de-estrutura', 'pedidos pendentes demais')
      if (this.bdConversas.filter((c) => c.para === alvo && c.estado === 'pendente').length >= REGRAS_DE_MENSAGEM.pedidosPendentesRecebidos) throw new ErroRede('limite-de-estrutura', 'o outro rover tem pedidos demais')
      if (this.contarTaxa(`conversa-pedir:${autor}`, HORA) >= REGRAS_DE_MENSAGEM.pedidosPorHora) throw new ErroRede('limite', 'pedidos demais nesta hora')
      this.marcarTaxa(`conversa-pedir:${autor}`)
      this.bdConversas.push({ id, de: autor, para: alvo, estado: 'pendente', criadaEm: t, atualizadaEm: t, pedido: { texto, em: t } })
      // o aviso só diz quem pediu (como o relé: sem objeto, sem texto); quem silenciou ou bloqueou a origem não recebe
      this.notificar(alvo, 'conversa-pedido', { origem: autor })
      return id
    }
    const c = this.conversaDe(str(campos.conversa), autor)
    if (c.estado !== 'ativa') throw new ErroRede('interacao-nao-permitida', 'a conversa não está aceita')
    const para = this.outro(c, autor)
    this.exigirAmizade(autor, para)
    if (Array.from(texto).length > LIMITES_DE_MENSAGEM.mensagem) throw new ErroRede('invalido', 'a mensagem passa de 2000 caracteres')
    if (this.contarTaxa(`mensagem:${autor}`, HORA) >= REGRAS_DE_MENSAGEM.mensagensPorHora) throw new ErroRede('limite', 'mensagens demais nesta hora')
    this.marcarTaxa(`mensagem:${autor}`)
    this.bdMensagens.push({ id, conversa: c.id, de: autor, para, em: t, texto, apagadaPeloRemetente: false, apagadaPeloDestinatario: false })
    c.atualizadaEm = t
    return id
  }

  // ---- gestos: decidir (com o toque da pessoa como aprovação), apagar e denunciar ---------------------------------

  protected override atoDeMensagem(autor: string, ato: AtoDeMensagem): ResultadoDeAto {
    this.limparMensagens()
    const t = this.now()
    switch (ato.tipo) {
      case 'conversa-decidir': {
        const c = this.conversaDe(ato.conversa, autor)
        if (ato.decisao === 'encerrar') {
          const pode = c.estado === 'ativa' || (c.estado === 'pendente' && c.de === autor)
          if (!pode) throw new ErroRede('interacao-nao-permitida', 'a conversa não está num estado que permita encerrar')
          Object.assign(c, { estado: 'encerrada', atualizadaEm: t, pedido: c.estado === 'pendente' ? null : c.pedido })
          return { resultado: 'encerrada' }
        }
        if (c.estado !== 'pendente') throw new ErroRede('interacao-nao-permitida', 'o pedido já foi decidido')
        if (c.para !== autor) throw new ErroRede('sem-permissao', 'só quem recebeu o pedido decide')
        if (ato.decisao === 'recusar') {
          Object.assign(c, { estado: 'recusada', atualizadaEm: t, pedido: null })
          return { resultado: 'recusada' }
        }
        this.exigirAmizade(autor, c.de)
        Object.assign(c, { estado: 'ativa', atualizadaEm: t })
        this.notificar(c.de, 'conversa-aceita', { origem: autor })
        return { resultado: 'ativa' }
      }
      case 'conversa-apagar': {
        const c = this.conversaDe(ato.conversa, autor)
        const alvo = this.bdMensagens.filter((m) => m.conversa === c.id && this.visivel(m, autor) && (ato.mensagem === null || m.id === ato.mensagem))
        if (ato.mensagem !== null && alvo.length === 0) throw new ErroRede('nao-encontrado', 'mensagem não encontrada')
        for (const m of alvo) {
          if (m.de === autor) m.apagadaPeloRemetente = true
          else m.apagadaPeloDestinatario = true
        }
        this.limparMensagens()
        return {}
      }
      case 'mensagem-denuncia': {
        const m = this.bdMensagens.find((x) => x.id === ato.mensagem)
        // só o destinatário denuncia, e só o que ainda está retido; para os outros, a mensagem não existe
        if (!m || m.para !== autor) throw new ErroRede('nao-encontrado', 'mensagem não encontrada')
        // o app revela o texto que decifrou; o que não decifrou não tem carta para mostrar
        if (m.texto === null) throw new ErroRede('invalido', 'não há texto legível para revelar')
        const chave = `${autor}>${m.id}`
        if (!this.jaDenunciou.has(chave)) {
          const dia = this.contarTaxa(`mensagem-denuncia:${autor}`, DIA)
          if (dia >= 10) throw new ErroRede('limite', 'denúncias demais hoje')
          this.marcarTaxa(`mensagem-denuncia:${autor}`)
          this.jaDenunciou.add(chave)
          this.denunciasDeMensagem.push({ mensagem: m.id, autorDoAlvo: m.de, motivo: ato.motivo, texto: m.texto, em: t })
        }
        return {}
      }
    }
  }
}
