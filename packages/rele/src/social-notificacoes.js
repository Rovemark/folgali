// SPDX-License-Identifier: AGPL-3.0-or-later
// Notificações: um fato por linha, sem texto. A linha guarda só ids e o tipo; quem lê abre o objeto, e a leitura obedece à
// visibilidade de agora. Ninguém é avisado por rover que silenciou ou bloqueou, e menção de quem não é amigo tem teto por hora.
import { PAGINA_PADRAO, RAJADA_CONTRA_ALVO, TEMPOS, extrairMencoes } from '../../protocolo/src/index.js'
import { Base, TIPOS_DE_ACAO } from './social-base.js'

export const TIPOS_DE_NOTIFICACAO = Object.freeze([
  'recado', 'pedido-de-amizade', 'amizade-aceita', 'depoimento-para-aceitar', 'depoimento-aceito', 'resposta-no-topico',
  'resposta-a-voce', 'citacao', 'mencao', 'convite-comunidade', 'pedido-de-entrada', 'entrada-aprovada', 'selo-recebido',
  'removido-por-responsavel', 'apelacao-recebida', 'apelacao-decidida', 'expulso', 'banido', 'posse-recebida', 'resolveu',
  'novo-seguidor',
  // 0.4.0: mensagens privadas (só com o recurso ligado; sem objeto, só a origem)
  'conversa-pedido', 'conversa-aceita'
])
const RETENCAO_MAXIMA = 500

export class Notificacoes extends Base {
  /**
   * Cria a notificação se couber: o destinatário existe e é visível, não é o próprio autor, não silenciou nem bloqueou a origem.
   */
  avisar(dest, tipo, { origem = null, objeto = null, comunidade = null, pagina = null } = {}, agora) {
    if (!dest || dest === origem || !this.roverVisivel(dest, agora)) return
    if (origem && (this.bloqueioEntre(dest, origem) || this.euSilenciei(dest, origem))) return
    this.a.executar(
      'INSERT INTO notificacoes (dest, tipo, origem, objeto, comunidade, pagina, em) VALUES (:dest, :tipo, :origem, :objeto, :comunidade, :pagina, :agora)',
      { dest, tipo, origem, objeto, comunidade, pagina, agora }
    )
  }

  /**
   * Menções no texto de um objeto. O handle precisa existir; quem não pode ler o espaço onde o texto está não é avisado.
   * `leitorDe(uid)` diz se o mencionado pode ler o conteúdo (comunidade fechada).
   */
  mencoes(texto, { origem, objeto, comunidade = null, pagina = null, jaAvisados = new Set() }, agora) {
    for (const handle of extrairMencoes(texto)) {
      const r = this.a.roverPorHandle(handle)
      if (!r || r.uid === origem || jaAvisados.has(r.uid)) continue
      if (comunidade) {
        const com = this.comunidade(comunidade)
        if (!com || !this.podeLerComunidade(com, r.uid)) continue
      }
      if (!this.amizadeAtiva(origem, r.uid)) {
        const recentes = this.contar("FROM notificacoes WHERE dest = :dest AND tipo = 'mencao' AND em > :desde", { dest: r.uid, desde: agora - 3600 })
        if (recentes >= RAJADA_CONTRA_ALVO.mencoesDeEstranhosPorHora) continue
      }
      this.avisar(r.uid, 'mencao', { origem, objeto, comunidade, pagina }, agora)
      jaAvisados.add(r.uid)
    }
  }

  /** Mantém só as últimas 500 e os últimos 90 dias. */
  limparNotificacoes(agora) {
    this.a.executar('DELETE FROM notificacoes WHERE em < :corte', { corte: agora - TEMPOS.notificacaoRetencaoS })
    this.a.executar(
      'DELETE FROM notificacoes WHERE seq IN (SELECT seq FROM (SELECT seq, ROW_NUMBER() OVER (PARTITION BY dest ORDER BY seq DESC) AS pos FROM notificacoes) WHERE pos > :max)',
      { max: RETENCAO_MAXIMA }
    )
  }

  /** Lista as notificações de um rover, as mais novas primeiro. O `objeto` vira null se o leitor já não pode ler o que ele aponta. */
  listar(uid, { antes = null, limite = PAGINA_PADRAO }, agora) {
    const linhas = this.a.todos(
      'SELECT * FROM notificacoes WHERE dest = :uid AND (:antes IS NULL OR seq < :antes) ORDER BY seq DESC LIMIT :limite',
      { uid, antes, limite: limite + 1 }
    )
    const itens = linhas.slice(0, limite).map((n) => {
      const legivel = n.objeto ? this.objetoVisivelParaNotificacao(n, uid, agora) : null
      const comunidade = n.comunidade && this.comunidade(n.comunidade) && this.podeLerComunidadeOuConvite(n.comunidade, uid) ? n.comunidade : null
      const pagina = n.pagina && this.pagina(n.pagina) ? n.pagina : null
      return {
        seq: n.seq,
        tipo: n.tipo,
        em: n.em,
        origem: n.origem && n.tipo !== 'selo-recebido' ? this.resumo(n.origem) : null,
        objeto: legivel ? n.objeto : null,
        comunidade,
        pagina,
        // 0.3.1: o nome do lugar e o tópico a que o aviso leva, só quando o leitor pode ver (proposta 0006)
        lugar: this.lugarDoAviso(comunidade, pagina),
        topico: legivel ? this.topicoDoAviso(n.objeto) : null
      }
    })
    return { itens, proximo: linhas.length > limite ? linhas[limite - 1].seq : null }
  }

  /** `{ tipo, id, nome }` do lugar do aviso, ou `null`. Os dois ids já passaram pela regra de leitura de quem recebe. */
  lugarDoAviso(comunidade, pagina) {
    if (comunidade) return { tipo: 'comunidade', id: comunidade, nome: this.comunidade(comunidade).nome }
    if (pagina) return { tipo: 'pagina', id: pagina, nome: this.pagina(pagina).nome }
    return null
  }

  /** O tópico a que o aviso leva: o próprio tópico, ou o tópico de uma resposta de fórum. O objeto já foi dado como legível. */
  topicoDoAviso(objetoId) {
    const l = this.a.objeto(objetoId)
    const id = l?.tipo === 'topico' ? l.id : l?.tipo === 'resposta-forum' ? l.ctx : null
    const t = id ? this.topico(id) : null
    return t ? { id: t.id, titulo: t.titulo } : null
  }

  /** O objeto de uma notificação continua legível? Ação (que não tem envelope) nunca é: o cliente usa o contexto. */
  objetoVisivelParaNotificacao(n, uid, agora) {
    const l = this.a.objeto(n.objeto)
    if (!l || TIPOS_DE_ACAO.includes(l.tipo)) return false
    if (l.removido_em !== null || l.oculto_em !== null) return false
    if (l.tipo === 'depoimento' && l.estado !== 'aceito' && l.alvo !== uid && l.autor !== uid) return false
    return this.espacoLegivel(l, uid) && this.roverVisivel(l.autor, agora) !== null
  }

  podeLerComunidadeOuConvite(comunidadeId, uid) {
    const com = this.comunidade(comunidadeId)
    return com !== null && (this.podeLerComunidade(com, uid) || this.convidado(com.id, uid))
  }

  contagem(uid, desde) {
    return this.contar('FROM notificacoes WHERE dest = :uid AND seq > :desde', { uid, desde })
  }
}

