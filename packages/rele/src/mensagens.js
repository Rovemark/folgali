// SPDX-License-Identifier: AGPL-3.0-or-later
// Mensagens privadas no relé (revisão 0.4.0, PROTOCOLO.md seção 15). O relé NÃO decifra nada: confere forma, assinatura, aprovação,
// amizade, bloqueio, estado da conversa, chaves vigentes e taxa, e guarda o cifrado por 30 dias. Só existe com o recurso ligado
// (`new Rele({ mensagens: true })`); desligado, nada das mensagens existe (rota, tipo, recurso). As funções de limpeza e de apagar no fim do arquivo
// valem com o recurso ligado ou não, para o que já foi guardado sair no prazo.
import {
  ESTRUTURA_DE_MENSAGEM, ErroDoProtocolo, ID_RE, LIMITES_DE_MENSAGEM, PAGINA_PADRAO, RECURSO_MENSAGENS,
  TEMPOS_DE_MENSAGEM, TIPOS_DE_MENSAGEM, UID_RE, VERSAO_DE_MENSAGENS, canonicalizar, cartaConfere, chaveDeCifraFraca
} from '../../protocolo/src/index.js'
import { parDe } from './social-base.js'

const T = TEMPOS_DE_MENSAGEM
const ABERTAS = "('pendente', 'ativa')"
const ESTADOS_DA_LISTA = { pendentes: ['pendente'], ativas: ['ativa'], todas: ['pendente', 'ativa', 'recusada', 'encerrada'] }

export class Mensagens {
  /** @param {import('./rele.js').Rele} rele */
  constructor(rele) {
    this.rele = rele
    this.a = rele.armazem
  }

  get social() { return this.rele.social }

  // ====================================================================================================
  // ESCRITA
  // ====================================================================================================

  /**
   * Chega aqui depois de: envelope, forma (esquema, previo null, id), atestado, bloqueios do operador, assinatura, duplicata e relógio.
   * Daqui: rover registrado, liberação (aprovação), regras do tipo, taxa, gravação. Nada entra na cadeia `previo`.
   */
  aceitar({ envelope, obj, efetivo, atestadoNovo, guardado, agora }) {
    if (!guardado) throw new ErroDoProtocolo('perfil_primeiro')
    const { aprovacao } = this.rele._liberar(envelope, obj, efetivo, guardado, agora)
    if (obj.tipo === 'mensagem-denuncia') return this.denunciar(obj, agora)
    const efeito = this[`r_${obj.tipo.replaceAll('-', '_')}`](obj, agora)
    this.rele._conferirTaxa(obj, efetivo.emissor, agora, null, guardado)
    this.a.transacao(() => {
      if (atestadoNovo) this.rele._atualizarAtestado(obj, atestadoNovo)
      // Só o rastro do id (contra reenvio, e para a taxa): sem envelope e sem alvo, para não guardar quem fala com quem além do necessário.
      this.a.executar(
        `INSERT INTO objetos (id, autor, tipo, criado_em, recebido_em, emissor, profundidade, envelope, removido_em)
         VALUES (:id, :autor, :tipo, :criadoEm, :agora, :emissor, 0, NULL, :agora)`,
        { id: obj.id, autor: obj.autor, tipo: obj.tipo, criadoEm: obj.criadoEm, agora, emissor: efetivo.emissor }
      )
      efeito.gravar({ agora, aprovacao, chaveDeRede: efetivo.chave })
    })
    return efeito.resultado === undefined ? { estado: 'aceito', id: obj.id } : { estado: 'aceito', id: obj.id, resultado: efeito.resultado }
  }

  // ---------- consultas ----------

  conversa(id) { return typeof id === 'string' ? this.a.um('SELECT * FROM conversas WHERE id = :id', { id }) : null }
  conversaAbertaDoPar(x, y) { return this.a.um(`SELECT * FROM conversas WHERE par = :par AND estado IN ${ABERTAS}`, { par: parDe(x, y) }) }
  chaveVigente(uid) { return this.a.um('SELECT * FROM chaves_de_cifra WHERE uid = :uid AND vigente = 1', { uid }) }
  outroLado(c, uid) { return c.de === uid ? c.para : c.para === uid ? c.de : null }

  /** Amizade ativa e nenhum bloqueio. Os dois casos dão a MESMA resposta: o bloqueado não descobre que foi bloqueado. */
  exigirAmigosSemBloqueio(x, y, campo) {
    if (this.social.bloqueioEntre(x, y) || !this.social.amizadeAtiva(x, y)) throw new ErroDoProtocolo('interacao_nao_permitida', { campo })
  }

  /** A conversa existe e o autor é um dos lados. Quem não é parte recebe o mesmo que "não existe". */
  exigirParte(id, uid, campo = 'objeto.corpo.conversa') {
    const c = this.conversa(id)
    if (!c || this.outroLado(c, uid) === null) throw new ErroDoProtocolo('nao_encontrado', { campo })
    return c
  }

  marcarAtividade(id, agora, extra = '') {
    this.a.executar(`UPDATE conversas SET atualizada_em = :agora, seq_atividade = (SELECT COALESCE(MAX(seq_atividade), 0) + 1 FROM conversas)${extra} WHERE id = :id`, { id, agora })
  }

  // ---------- regras por tipo: cada uma confere e devolve { resultado?, gravar({ agora, aprovacao, chaveDeRede }) } ----------

  r_chave_de_cifra(obj) {
    if (chaveDeCifraFraca(obj.corpo.chave)) throw new ErroDoProtocolo('chave_fraca', { campo: 'objeto.corpo.chave' })
    return {
      gravar: ({ agora }) => {
        this.a.executar('UPDATE chaves_de_cifra SET vigente = 0 WHERE uid = :uid', { uid: obj.autor })
        this.a.executar('INSERT INTO chaves_de_cifra (id, uid, chave, envelope, em, vigente) VALUES (:id, :uid, :chave, :envelope, :agora, 1)', {
          id: obj.id, uid: obj.autor, chave: obj.corpo.chave, envelope: canonicalizar({ objeto: obj }), agora
        })
      }
    }
  }

  r_conversa_pedir(obj, agora) {
    const alvo = this.social.exigirRover(obj.corpo.alvo, agora)
    this.exigirAmigosSemBloqueio(obj.autor, alvo.uid, 'objeto.corpo.alvo')
    if (this.conversaAbertaDoPar(obj.autor, alvo.uid)) throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.alvo' })
    const recusa = this.a.um(
      "SELECT MAX(atualizada_em) AS em FROM conversas WHERE de = :de AND para = :para AND estado = 'recusada'", { de: obj.autor, para: alvo.uid }
    )
    if (recusa?.em && recusa.em + T.recusaDePedidoDeConversaS > agora) {
      throw new ErroDoProtocolo('limite_de_taxa', { detalhe: 'O último pedido de conversa a este rover foi recusado há pouco tempo.', retryAfterS: recusa.em + T.recusaDePedidoDeConversaS - agora })
    }
    const E = ESTRUTURA_DE_MENSAGEM
    const conta = (sql, p) => this.a.um(`SELECT COUNT(*) AS n FROM conversas WHERE ${sql}`, p).n
    if (conta("de = :uid AND estado = 'pendente'", { uid: obj.autor }) >= E.pedidosPendentesEnviados) {
      throw new ErroDoProtocolo('limite_de_estrutura', { detalhe: `O limite é de ${E.pedidosPendentesEnviados} pedidos de conversa pendentes enviados.` })
    }
    if (conta("para = :uid AND estado = 'pendente'", { uid: alvo.uid }) >= E.pedidosPendentesRecebidos) {
      throw new ErroDoProtocolo('limite_de_estrutura', { detalhe: 'Este rover já tem pedidos de conversa pendentes demais.' })
    }
    return {
      resultado: 'pendente',
      gravar: ({ agora: t, aprovacao }) => {
        this.a.executar(
          `INSERT INTO conversas (id, par, de, para, estado, pedido, criada_em, atualizada_em, ultima_mensagem_em, seq_atividade)
           VALUES (:id, :par, :de, :para, 'pendente', :pedido, :t, :t, NULL, (SELECT COALESCE(MAX(seq_atividade), 0) + 1 FROM conversas))`,
          { id: obj.id, par: parDe(obj.autor, alvo.uid), de: obj.autor, para: alvo.uid, pedido: canonicalizar({ objeto: obj, aprovacao }), t }
        )
        this.social.avisar(alvo.uid, 'conversa-pedido', { origem: obj.autor }, t)
      }
    }
  }

  r_conversa_decidir(obj, agora) {
    const c = this.exigirParte(obj.corpo.conversa, obj.autor)
    const estado = (novo, extra = '') => ({ agora: t }) => this.a.executar(`UPDATE conversas SET estado = '${novo}', atualizada_em = :t${extra} WHERE id = :id`, { id: c.id, t })
    switch (obj.corpo.decisao) {
      case 'aceitar':
      case 'recusar': {
        if (c.para !== obj.autor) throw new ErroDoProtocolo('sem_permissao', { campo: 'objeto.corpo.conversa', detalhe: 'Só quem recebeu o pedido decide sobre ele.' })
        if (c.estado !== 'pendente') throw new ErroDoProtocolo('estado_da_conversa', { campo: 'objeto.corpo.conversa' })
        if (obj.corpo.decisao === 'recusar') return { resultado: 'recusada', gravar: estado('recusada', ', pedido = NULL') }
        this.exigirAmigosSemBloqueio(obj.autor, c.de, 'objeto.corpo.conversa')
        if (this.a.um("SELECT COUNT(*) AS n FROM conversas WHERE estado = 'ativa' AND (de = :uid OR para = :uid)", { uid: obj.autor }).n >= ESTRUTURA_DE_MENSAGEM.conversasAtivas) {
          throw new ErroDoProtocolo('limite_de_estrutura', { detalhe: `O limite é de ${ESTRUTURA_DE_MENSAGEM.conversasAtivas} conversas aceitas.` })
        }
        return {
          resultado: 'ativa',
          gravar: ({ agora: t }) => {
            this.a.executar("UPDATE conversas SET estado = 'ativa' WHERE id = :id", { id: c.id })
            this.marcarAtividade(c.id, t)
            this.social.avisar(c.de, 'conversa-aceita', { origem: obj.autor }, t)
          }
        }
      }
      default: {
        // encerrar: a conversa aceita, por qualquer lado; a pendente, só por quem pediu (é cancelar)
        const vale = c.estado === 'ativa' || (c.estado === 'pendente' && c.de === obj.autor)
        if (!vale) throw new ErroDoProtocolo('estado_da_conversa', { campo: 'objeto.corpo.conversa' })
        return { resultado: 'encerrada', gravar: estado('encerrada', ', pedido = NULL') }
      }
    }
  }

  r_mensagem(obj, agora) {
    const { conversa, para, chaveDe, chavePara } = obj.corpo
    const c = this.exigirParte(conversa, obj.autor)
    if (this.outroLado(c, obj.autor) !== para) throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.para' })
    if (c.estado !== 'ativa') throw new ErroDoProtocolo('estado_da_conversa', { campo: 'objeto.corpo.conversa' })
    this.social.exigirRover(para, agora, 'objeto.corpo.para')
    this.exigirAmigosSemBloqueio(obj.autor, para, 'objeto.corpo.para')
    if (this.chaveVigente(obj.autor)?.chave !== chaveDe) throw new ErroDoProtocolo('chave_de_cifra_desatualizada', { campo: 'objeto.corpo.chaveDe' })
    if (this.chaveVigente(para)?.chave !== chavePara) throw new ErroDoProtocolo('chave_de_cifra_desatualizada', { campo: 'objeto.corpo.chavePara' })
    return {
      gravar: ({ agora: t, aprovacao, chaveDeRede }) => {
        this.a.executar(
          `INSERT INTO mensagens (id, conversa, de, para, criado_em, recebido_em, iv, chave_rede_de, envelope)
           VALUES (:id, :conversa, :de, :para, :criadoEm, :t, :iv, :chaveDeRede, :envelope)`,
          { id: obj.id, conversa: c.id, de: obj.autor, para, criadoEm: obj.criadoEm, t, iv: obj.corpo.iv, chaveDeRede, envelope: canonicalizar({ objeto: obj, aprovacao }) }
        )
        this.marcarAtividade(c.id, t, ', ultima_mensagem_em = :agora')
      }
    }
  }

  r_conversa_apagar(obj) {
    const c = this.exigirParte(obj.corpo.conversa, obj.autor)
    const coluna = c.de === obj.autor ? 'apagada_de' : 'apagada_para'
    const alvo = obj.corpo.mensagem
    if (alvo !== null && !this.a.um('SELECT 1 AS x FROM mensagens WHERE id = :id AND conversa = :c', { id: alvo, c: c.id })) {
      throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.mensagem' })
    }
    const filtro = alvo === null ? 'conversa = :c' : 'conversa = :c AND id = :id'
    const params = alvo === null ? { c: c.id } : { c: c.id, id: alvo }
    const n = this.a.um(`SELECT COUNT(*) AS n FROM mensagens WHERE ${filtro} AND ${coluna} = 0`, params).n
    return {
      resultado: n,
      gravar: () => {
        this.a.executar(`UPDATE mensagens SET ${coluna} = 1 WHERE ${filtro}`, params)
        this.a.executar('DELETE FROM mensagens WHERE apagada_de = 1 AND apagada_para = 1')
        this.a.executar(`DELETE FROM conversas WHERE id = :c AND estado IN ('encerrada', 'recusada') AND NOT EXISTS (SELECT 1 FROM mensagens m WHERE m.conversa = :c)`, { c: c.id })
      }
    }
  }

  /**
   * Denúncia de mensagem: só o destinatário, com a carta revelada. O relé remonta a carta com o que guardou (conversa, criadoEm, de, iv,
   * para) e o texto revelado, e confere com a chave de rede que o remetente tinha QUANDO a mensagem chegou. Depois guarda o que foi
   * revelado e descarta o objeto, como na denúncia comum (seção 9.4): de quem denunciou fica só o pseudônimo.
   */
  denunciar(obj, agora) {
    const m = this.a.um('SELECT * FROM mensagens WHERE id = :id', { id: obj.corpo.mensagem })
    if (!m || m.para !== obj.autor) throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.mensagem' })
    const carta = { conversa: m.conversa, criadoEm: m.criado_em, de: m.de, iv: m.iv, para: m.para, texto: obj.corpo.texto }
    if (!cartaConfere(carta, obj.corpo.assinatura, m.chave_rede_de)) throw new ErroDoProtocolo('revelacao_invalida', { campo: 'objeto.corpo.assinatura' })
    const pseudonimo = this.rele._pseudonimo(obj.autor)
    for (const [janelaS, max] of this.rele.taxas.denuncia) {
      const n = this.a.um('SELECT COUNT(*) AS n FROM denuncias_de_mensagem WHERE pseudonimo = :p AND criado_em > :desde', { p: pseudonimo, desde: agora - janelaS }).n
      if (n >= max) throw new ErroDoProtocolo('limite_de_taxa', { retryAfterS: janelaS })
    }
    this.a.executar(
      'INSERT OR IGNORE INTO denuncias_de_mensagem (mensagem, autor_do_alvo, motivo, texto, pseudonimo, criado_em) VALUES (:mensagem, :autor, :motivo, :texto, :p, :agora)',
      { mensagem: m.id, autor: m.de, motivo: obj.corpo.motivo, texto: obj.corpo.texto, p: pseudonimo, agora }
    )
    return { estado: 'recebida', id: obj.id }
  }

  // ====================================================================================================
  // LEITURA
  // ====================================================================================================

  chaveDe(uid) {
    const agora = this.rele.relogio()
    const r = UID_RE.test(uid) ? this.rele._roverVisivel(uid, agora) : null
    const k = r ? this.chaveVigente(uid) : null
    if (!k) throw new ErroDoProtocolo('nao_encontrado')
    return JSON.parse(k.envelope)
  }

  cartao(c, leitor) {
    const coluna = c.de === leitor ? 'apagada_de' : 'apagada_para'
    return {
      id: c.id,
      com: this.social.resumo(this.outroLado(c, leitor)),
      estado: c.estado,
      iniciadaPor: c.de,
      criadaEm: c.criada_em,
      atualizadaEm: c.atualizada_em,
      ultimaMensagemEm: c.ultima_mensagem_em,
      mensagens: this.a.um(`SELECT COUNT(*) AS n FROM mensagens WHERE conversa = :c AND ${coluna} = 0`, { c: c.id }).n,
      pedido: c.pedido ? JSON.parse(c.pedido) : null
    }
  }

  conversasDe(uid, { estado = 'todas', antes = null, limite = PAGINA_PADRAO, credencial = null } = {}) {
    const agora = this.rele.relogio()
    const leitor = this.social.exigirPropria(uid, credencial, agora)
    const estados = ESTADOS_DA_LISTA[estado ?? 'todas']
    if (!estados) throw new ErroDoProtocolo('esquema', { campo: 'estado', detalhe: 'Parâmetro estado: pendentes, ativas ou todas.' })
    const linhas = this.a.todos(
      `SELECT * FROM conversas WHERE (de = :uid OR para = :uid) AND estado IN (SELECT value FROM json_each(:estados))
         AND (:antes IS NULL OR seq_atividade < :antes) ORDER BY seq_atividade DESC LIMIT :limite`,
      { uid: leitor, estados: JSON.stringify(estados), antes, limite: limite + 1 }
    )
    return { itens: linhas.slice(0, limite).map((c) => this.cartao(c, leitor)), proximo: linhas.length > limite ? linhas[limite - 1].seq_atividade : null }
  }

  conversaDe(uid, id, { credencial = null } = {}) {
    const leitor = this.social.exigirPropria(uid, credencial, this.rele.relogio())
    const c = ID_RE.test(id) ? this.conversa(id) : null
    if (!c || this.outroLado(c, leitor) === null) throw new ErroDoProtocolo('nao_encontrado')
    return this.cartao(c, leitor)
  }

  mensagensDe(uid, id, { antes = null, limite = PAGINA_PADRAO, credencial = null } = {}) {
    const leitor = this.social.exigirPropria(uid, credencial, this.rele.relogio())
    const c = ID_RE.test(id) ? this.conversa(id) : null
    if (!c || this.outroLado(c, leitor) === null) throw new ErroDoProtocolo('nao_encontrado')
    const coluna = c.de === leitor ? 'apagada_de' : 'apagada_para'
    const linhas = this.a.todos(
      `SELECT seq, envelope FROM mensagens WHERE conversa = :c AND ${coluna} = 0 AND (:antes IS NULL OR seq < :antes) ORDER BY seq DESC LIMIT :limite`,
      { c: c.id, antes, limite: limite + 1 }
    )
    return { itens: linhas.slice(0, limite).map((l) => JSON.parse(l.envelope)), proximo: linhas.length > limite ? linhas[limite - 1].seq : null }
  }

  listarDenuncias({ limite = 50 } = {}) {
    return this.a.todos(
      `SELECT id, mensagem, autor_do_alvo AS autorDoAlvo, motivo, texto, pseudonimo AS denunciante, criado_em AS criadoEm
       FROM denuncias_de_mensagem ORDER BY id DESC LIMIT :limite`,
      { limite }
    )
  }

  /** O que `GET /v1/info` ganha com o recurso ligado. */
  info(base) {
    return {
      ...base,
      // a revisão declarada é a do relé (REVISAO_DO_RASCUNHO, 0.5.0, que contém a 0.4.0): ligar as mensagens só acrescenta
      protocolo: [...base.protocolo, VERSAO_DE_MENSAGENS],
      recursos: [...base.recursos, RECURSO_MENSAGENS],
      limites: {
        ...base.limites,
        mensagemCaracteres: LIMITES_DE_MENSAGEM.texto.max,
        pedidoDeConversaCaracteres: LIMITES_DE_MENSAGEM.pedido.max,
        retencaoDeMensagemS: T.retencaoDeMensagemS
      },
      mensagens: true
    }
  }
}

// ====================================================================================================
// VALEM COM O RECURSO LIGADO OU NÃO (o que já foi guardado sai no prazo e some quando o rover sai)
// ====================================================================================================

/** Desfazer a amizade ou bloquear encerra a conversa aberta entre os dois. As mensagens retidas seguem até apagarem ou até 30 dias. */
export function encerrarConversasDoPar(armazem, x, y, agora) {
  armazem.executar(`UPDATE conversas SET estado = 'encerrada', pedido = NULL, atualizada_em = :agora WHERE par = :par AND estado IN ${ABERTAS}`, { par: parDe(x, y), agora })
}

/** Sair da rede apaga, neste relé, as conversas, mensagens e chaves de cifra do rover, dos dois lados. */
export function apagarMensagensDoRover(armazem, uid) {
  armazem.executar('DELETE FROM mensagens WHERE de = :uid OR para = :uid', { uid })
  armazem.executar('DELETE FROM conversas WHERE de = :uid OR para = :uid', { uid })
  armazem.executar('DELETE FROM chaves_de_cifra WHERE uid = :uid', { uid })
}

/**
 * Retenção (seção 15.10): mensagem com mais de 30 dias de recebida; pedido pendente com mais de 30 dias; recusa com mais de 7 dias;
 * conversa encerrada sem mensagem; rastro de id dos objetos da 0.4 com mais de 30 dias. Devolve quantas mensagens apagou.
 */
export function limparMensagens(armazem, agora, retencaoDenunciasDias = 180) {
  const apagadas = Number(armazem.executar('DELETE FROM mensagens WHERE recebido_em < :corte', { corte: agora - T.retencaoDeMensagemS }).changes)
  armazem.executar("DELETE FROM conversas WHERE estado = 'pendente' AND criada_em < :corte", { corte: agora - T.retencaoDePedidoS })
  armazem.executar('UPDATE conversas SET pedido = NULL WHERE pedido IS NOT NULL AND criada_em < :corte', { corte: agora - T.retencaoDePedidoS })
  armazem.executar("DELETE FROM conversas WHERE estado = 'recusada' AND atualizada_em < :corte", { corte: agora - T.recusaDePedidoDeConversaS })
  armazem.executar("DELETE FROM conversas WHERE estado = 'encerrada' AND NOT EXISTS (SELECT 1 FROM mensagens m WHERE m.conversa = conversas.id)")
  armazem.executar(
    'DELETE FROM objetos WHERE tipo IN (SELECT value FROM json_each(:tipos)) AND recebido_em < :corte',
    { tipos: JSON.stringify(TIPOS_DE_MENSAGEM), corte: agora - T.rastroDeObjetoS }
  )
  armazem.executar('DELETE FROM denuncias_de_mensagem WHERE criado_em < :corte', { corte: agora - retencaoDenunciasDias * 86400 })
  return apagadas
}
