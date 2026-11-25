// SPDX-License-Identifier: AGPL-3.0-or-later
// As REGRAS de escrita dos tipos sociais da 0.3. Cada tipo tem um método `r_<tipo>` que confere o estado (alvo existe, papel,
// bloqueio, limites estruturais) e devolve um EFEITO:
//
//   { alvo, ctx, sub, estado, semEnvelope, resultado, depois({ seq, agora }) }
//
// `depois` roda dentro da transação de gravação, depois do INSERT do objeto, e é onde o estado derivado muda e as notificações saem.
// Nada aqui grava antes de `depois`: uma recusa nunca deixa rastro.
import {
  ESTRUTURA, ErroDoProtocolo, IDADE_MINIMA_S, RAID, RAJADA_CONTRA_ALVO, TEMPOS, chaveDeNome, extrairMencoes
} from '../../protocolo/src/index.js'
import { TIPOS_DE_ACAO, parDe } from './social-base.js'
import { encerrarConversasDoPar } from './mensagens.js'
import { Indice } from './social-indice.js'


export class Escrita extends Indice {
  // ====================================================================================================
  // PORTÕES BARATOS
  // ====================================================================================================

  /** Idade mínima da conta para o que pesa (criar comunidade ou página, depoimento, selo). */
  conferirIdade(obj, guardado, agora) {
    const minima = IDADE_MINIMA_S[obj.tipo]
    if (!minima) return // (o primeiro objeto de um rover, o perfil, não tem idade mínima nem conta guardada)
    const idade = agora - guardado.criado_em
    if (idade < minima) throw new ErroDoProtocolo('conta_nova', { detalhe: `Faltam ${minima - idade} segundos de idade da conta.`, retryAfterS: minima - idade })
  }

  /** Os tetos de rajada contra um alvo (contam só objetos aceitos), depois dos tetos normais de taxa. */
  taxaExtra(obj, efeito, agora) {
    // n >= teto implica que o mais antigo da janela ainda está dentro dela, então a espera é sempre de pelo menos 1 segundo
    const recusar = (detalhe, retryAfterS) => { throw new ErroDoProtocolo('limite_de_taxa', { detalhe, retryAfterS }) }
    const dia = agora - 86400
    if (obj.tipo === 'recado') {
      const alvo = obj.corpo.alvo
      const porPar = this.a.um("SELECT COUNT(*) AS n, MIN(recebido_em) AS velho FROM objetos WHERE tipo = 'recado' AND autor = :autor AND alvo = :alvo AND recebido_em > :dia", { autor: obj.autor, alvo, dia })
      if (porPar.n >= RAJADA_CONTRA_ALVO.recadosPorParPorDia) recusar(`Limite de ${RAJADA_CONTRA_ALVO.recadosPorParPorDia} recados por dia para o mesmo mural.`, porPar.velho + 86400 - agora)
      if (!efeito.amigos) {
        const estranhos = this.a.um(
          `SELECT COUNT(*) AS n, MIN(o.recebido_em) AS velho FROM objetos o WHERE o.tipo = 'recado' AND o.alvo = :alvo AND o.recebido_em > :dia
             AND NOT EXISTS (SELECT 1 FROM amizades am WHERE am.estado = 'ativa'
               AND am.par = CASE WHEN o.autor < o.alvo THEN o.autor || '|' || o.alvo ELSE o.alvo || '|' || o.autor END)`,
          { alvo, dia }
        )
        if (estranhos.n >= RAJADA_CONTRA_ALVO.recadosDeEstranhosPorMuralPorDia) recusar('Este mural já recebeu recados demais de quem não é amigo hoje.', estranhos.velho + 86400 - agora)
      }
    }
    if (obj.tipo === 'selo') {
      const r = this.a.um("SELECT COUNT(*) AS n, MIN(recebido_em) AS velho FROM objetos WHERE tipo = 'selo' AND alvo = :alvo AND recebido_em > :dia", { alvo: obj.corpo.alvo, dia })
      if (r.n >= RAJADA_CONTRA_ALVO.selosRecebidosPorDia) recusar('Este rover já recebeu selos demais hoje.', r.velho + 86400 - agora)
    }
    if (obj.tipo === 'resposta-forum' && this.idadeDaConta(obj.autor, agora) < TEMPOS.contaConsideradaNaDescobertaS) {
      // O teto por conta nova (20% do normal) já vem do fator de idade. Aqui o teto de TODAS as contas novas juntas no mesmo tópico:
      // uma rajada de muitas contas não passa por ser cada uma pequena.
      const todas = this.a.um(
        `SELECT COUNT(*) AS n, MIN(o.recebido_em) AS velho FROM objetos o JOIN rovers r ON r.uid = o.autor
         WHERE o.tipo = 'resposta-forum' AND o.ctx = :topico AND o.recebido_em > :hora AND :agora - r.criado_em < :idade`,
        { topico: obj.corpo.topico, hora: agora - 3600, agora, idade: TEMPOS.contaConsideradaNaDescobertaS }
      )
      if (todas.n >= RAJADA_CONTRA_ALVO.respostasDeContasNovasNoTopicoPorHora) recusar('Este tópico já recebeu respostas demais de contas novas na última hora.', todas.velho + 3600 - agora)
    }
  }

  // ====================================================================================================
  // DESPACHO
  // ====================================================================================================

  /** Regras de um tipo social. Os tipos antigos ficam em rele.js. */
  regras(obj, agora, guardado) {
    const f = this[`r_${obj.tipo.replaceAll('-', '_')}`]
    const efeito = f.call(this, obj, agora, guardado)
    efeito.semEnvelope ??= TIPOS_DE_ACAO.includes(obj.tipo)
    return efeito
  }

  // ====================================================================================================
  // PÁGINA DO ROVER
  // ====================================================================================================

  r_estado(obj) {
    return {
      semEnvelope: true,
      depois: ({ agora }) => this.a.executar('UPDATE rovers SET estado = :estado, estado_em = :agora WHERE uid = :uid', { estado: obj.corpo.estado, agora, uid: obj.autor })
    }
  }

  r_recado(obj, agora) {
    const alvo = this.exigirRover(obj.corpo.alvo, agora)
    this.exigirSemBloqueio(obj.autor, alvo.uid)
    const amigos = this.amizadeAtiva(obj.autor, alvo.uid) !== null
    if (alvo.recados === 'ninguem' || (alvo.recados === 'amigos' && !amigos)) throw new ErroDoProtocolo('interacao_nao_permitida', { campo: 'objeto.corpo.alvo' })
    return {
      alvo: alvo.uid,
      ctx: alvo.uid,
      amigos,
      depois: ({ agora: t }) => {
        this.avisar(alvo.uid, 'recado', { origem: obj.autor, objeto: obj.id }, t)
        this.mencoes(obj.corpo.texto, { origem: obj.autor, objeto: obj.id }, t)
      }
    }
  }

  r_amizade(obj, agora) {
    const { alvo: alvoUid, acao } = obj.corpo
    const alvo = this.exigirRover(alvoUid, agora)
    this.exigirSemBloqueio(obj.autor, alvo.uid)
    const par = parDe(obj.autor, alvo.uid)
    const linha = this.amizade(obj.autor, alvo.uid)
    const amigosDe = (uid) => this.contar("FROM amizades WHERE estado = 'ativa' AND (de = :uid OR para = :uid)", { uid })
    const exigirEspaco = () => {
      if (amigosDe(obj.autor) >= ESTRUTURA.amigos || amigosDe(alvo.uid) >= ESTRUTURA.amigos) throw new ErroDoProtocolo('limite_de_estrutura', { detalhe: `O limite é de ${ESTRUTURA.amigos} amigos.` })
    }
    const ativar = (de, para, t) => this.a.executar(
      "INSERT INTO amizades (par, de, para, estado, criado_em, atualizado_em) VALUES (:par, :de, :para, 'ativa', :t, :t) ON CONFLICT(par) DO UPDATE SET de = :de, para = :para, estado = 'ativa', atualizado_em = :t",
      { par, de, para, t }
    )
    switch (acao) {
      case 'pedir': {
        if (linha?.estado === 'ativa') throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.alvo' })
        if (linha?.estado === 'pendente' && linha.de === obj.autor) throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.alvo' })
        if (linha?.estado === 'recusada' && linha.atualizado_em + TEMPOS.recusaDePedidoDeAmizadeS > agora) {
          throw new ErroDoProtocolo('limite_de_taxa', { detalhe: 'O pedido foi recusado há pouco tempo.', retryAfterS: linha.atualizado_em + TEMPOS.recusaDePedidoDeAmizadeS - agora })
        }
        exigirEspaco()
        if (linha?.estado === 'pendente') {
          // o outro já tinha pedido: os dois querem, a amizade nasce ativa
          return {
            resultado: 'ativa',
            depois: ({ agora: t }) => {
              ativar(linha.de, linha.para, t)
              this.avisar(linha.de, 'amizade-aceita', { origem: obj.autor, objeto: obj.id }, t)
            }
          }
        }
        if (this.contar("FROM amizades WHERE estado = 'pendente' AND de = :uid", { uid: obj.autor }) >= ESTRUTURA.pedidosDeAmizadeEnviados) {
          throw new ErroDoProtocolo('limite_de_estrutura', { detalhe: `O limite é de ${ESTRUTURA.pedidosDeAmizadeEnviados} pedidos enviados pendentes.` })
        }
        if (this.contar("FROM amizades WHERE estado = 'pendente' AND para = :uid", { uid: alvo.uid }) >= ESTRUTURA.pedidosDeAmizadeRecebidos) {
          throw new ErroDoProtocolo('limite_de_estrutura', { detalhe: 'Este rover já tem pedidos pendentes demais.' })
        }
        return {
          resultado: 'pendente',
          depois: ({ agora: t }) => {
            this.a.executar(
              "INSERT INTO amizades (par, de, para, estado, criado_em, atualizado_em) VALUES (:par, :de, :para, 'pendente', :t, :t) ON CONFLICT(par) DO UPDATE SET de = :de, para = :para, estado = 'pendente', criado_em = :t, atualizado_em = :t",
              { par, de: obj.autor, para: alvo.uid, t }
            )
            this.avisar(alvo.uid, 'pedido-de-amizade', { origem: obj.autor, objeto: obj.id }, t)
          }
        }
      }
      case 'aceitar':
      case 'recusar': {
        if (linha?.estado !== 'pendente' || linha.para !== obj.autor) throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.alvo' })
        if (acao === 'aceitar') {
          exigirEspaco()
          return {
            resultado: 'ativa',
            depois: ({ agora: t }) => {
              this.a.executar("UPDATE amizades SET estado = 'ativa', atualizado_em = :t WHERE par = :par", { par, t })
              this.avisar(linha.de, 'amizade-aceita', { origem: obj.autor, objeto: obj.id }, t)
            }
          }
        }
        return {
          resultado: 'nenhuma',
          depois: ({ agora: t }) => this.a.executar("UPDATE amizades SET estado = 'recusada', atualizado_em = :t WHERE par = :par", { par, t })
        }
      }
      default: {
        // desfazer: amizade ativa (qualquer dos dois) ou pedido enviado por mim (cancelar)
        const vale = linha && (linha.estado === 'ativa' || (linha.estado === 'pendente' && linha.de === obj.autor))
        if (!vale) throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.alvo' })
        return {
          resultado: 'nenhuma',
          depois: ({ agora: t }) => {
            this.a.executar('DELETE FROM amizades WHERE par = :par', { par })
            encerrarConversasDoPar(this.a, obj.autor, alvo.uid, t) // 0.4.0: sem amizade não há conversa
          }
        }
      }
    }
  }

  r_depoimento(obj, agora) {
    const alvo = this.exigirRover(obj.corpo.alvo, agora)
    this.exigirSemBloqueio(obj.autor, alvo.uid)
    const am = this.amizadeAtiva(obj.autor, alvo.uid)
    if (!am || am.atualizado_em + TEMPOS.amizadeParaDepoimentoS > agora) {
      throw new ErroDoProtocolo('interacao_nao_permitida', { campo: 'objeto.corpo.alvo', detalhe: 'Só um amigo de pelo menos 3 dias escreve depoimento.' })
    }
    const vivo = this.a.um("SELECT 1 AS n FROM objetos WHERE tipo = 'depoimento' AND autor = :autor AND alvo = :alvo AND removido_em IS NULL AND estado IN ('pendente', 'aceito')", { autor: obj.autor, alvo: alvo.uid })
    if (vivo) throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.alvo' })
    const recusado = this.a.um("SELECT MAX(estado_em) AS em FROM objetos WHERE tipo = 'depoimento' AND autor = :autor AND alvo = :alvo AND estado = 'recusado'", { autor: obj.autor, alvo: alvo.uid })
    if (recusado?.em && recusado.em + TEMPOS.depoimentoAposRecusaS > agora) {
      throw new ErroDoProtocolo('limite_de_taxa', { detalhe: 'O último depoimento para este rover foi recusado há pouco tempo.', retryAfterS: recusado.em + TEMPOS.depoimentoAposRecusaS - agora })
    }
    if (this.contar("FROM objetos WHERE tipo = 'depoimento' AND alvo = :alvo AND estado = 'pendente' AND removido_em IS NULL", { alvo: alvo.uid }) >= ESTRUTURA.depoimentosPendentes) {
      throw new ErroDoProtocolo('limite_de_estrutura', { detalhe: 'Este rover já tem depoimentos pendentes demais.' })
    }
    return {
      alvo: alvo.uid,
      ctx: alvo.uid,
      estado: 'pendente',
      depois: ({ agora: t }) => this.avisar(alvo.uid, 'depoimento-para-aceitar', { origem: obj.autor, objeto: obj.id }, t)
    }
  }

  r_depoimento_decisao(obj, agora) {
    const dep = this.a.objeto(obj.corpo.depoimento)
    if (!dep || dep.tipo !== 'depoimento' || dep.removido_em !== null) throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.depoimento' })
    if (dep.alvo !== obj.autor) throw new ErroDoProtocolo('sem_permissao', { campo: 'objeto.corpo.depoimento' })
    const novo = obj.corpo.decisao === 'aceitar' ? 'aceito' : 'recusado'
    if (dep.estado === novo) throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.decisao' })
    return {
      resultado: novo,
      depois: ({ agora: t }) => {
        this.a.executar('UPDATE objetos SET estado = :novo, estado_em = :t WHERE id = :id', { novo, t, id: dep.id })
        if (novo === 'aceito') this.avisar(dep.autor, 'depoimento-aceito', { origem: obj.autor, objeto: dep.id }, t)
      }
    }
  }

  r_selo(obj, agora) {
    const alvo = this.exigirRover(obj.corpo.alvo, agora)
    this.exigirSemBloqueio(obj.autor, alvo.uid)
    const am = this.amizadeAtiva(obj.autor, alvo.uid)
    if (!am || am.atualizado_em + TEMPOS.amizadeParaSeloS > agora) {
      throw new ErroDoProtocolo('interacao_nao_permitida', { campo: 'objeto.corpo.alvo', detalhe: 'Só um amigo de pelo menos 7 dias dá selo.' })
    }
    if (this.a.um("SELECT 1 AS n FROM objetos WHERE tipo = 'selo' AND autor = :autor AND alvo = :alvo AND sub = :selo AND removido_em IS NULL", { autor: obj.autor, alvo: alvo.uid, selo: obj.corpo.selo })) {
      throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.selo' })
    }
    return {
      alvo: alvo.uid,
      ctx: alvo.uid,
      sub: obj.corpo.selo,
      depois: ({ agora: t }) => this.avisar(alvo.uid, 'selo-recebido', { origem: null, objeto: obj.id }, t)
    }
  }

  r_relacao(obj, agora) {
    const { alvo: alvoUid, acao } = obj.corpo
    const alvo = this.exigirRover(alvoUid, agora)
    const tipo = acao === 'bloquear' || acao === 'desbloquear' ? 'bloqueio' : 'silencio'
    const existe = this.a.um('SELECT 1 AS n FROM relacoes WHERE autor = :autor AND alvo = :alvo AND tipo = :tipo', { autor: obj.autor, alvo: alvo.uid, tipo }) !== null
    const desfazendo = acao === 'desbloquear' || acao === 'dessilenciar'
    if (desfazendo && !existe) throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.alvo' })
    if (!desfazendo && existe) throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.alvo' })
    if (!desfazendo) {
      if (this.contar('FROM relacoes WHERE autor = :autor AND tipo = :tipo', { autor: obj.autor, tipo }) >= ESTRUTURA.relacoesPorTipo) {
        throw new ErroDoProtocolo('limite_de_estrutura', { detalhe: `O limite é de ${ESTRUTURA.relacoesPorTipo}.` })
      }
    }
    return {
      depois: ({ agora: t }) => {
        if (desfazendo) return this.a.executar('DELETE FROM relacoes WHERE autor = :autor AND alvo = :alvo AND tipo = :tipo', { autor: obj.autor, alvo: alvo.uid, tipo })
        this.a.executar('INSERT INTO relacoes (autor, alvo, tipo, em) VALUES (:autor, :alvo, :tipo, :t)', { autor: obj.autor, alvo: alvo.uid, tipo, t })
        if (tipo === 'silencio') return undefined
        // Bloquear desfaz amizade e pedidos, os seguir nos dois sentidos e esconde os depoimentos pendentes entre os dois.
        const x = obj.autor
        const y = alvo.uid
        this.a.executar('DELETE FROM amizades WHERE par = :par', { par: parDe(x, y) })
        encerrarConversasDoPar(this.a, x, y, t) // 0.4.0: bloquear encerra a conversa entre os dois
        this.a.executar(
          "UPDATE objetos SET envelope = NULL, removido_em = :t WHERE tipo = 'seguir' AND removido_em IS NULL AND ((autor = :x AND alvo = :y) OR (autor = :y AND alvo = :x))",
          { t, x, y }
        )
        this.a.executar(
          "UPDATE objetos SET estado = 'recusado', estado_em = :t WHERE tipo = 'depoimento' AND estado = 'pendente' AND removido_em IS NULL AND ((autor = :x AND alvo = :y) OR (autor = :y AND alvo = :x))",
          { t, x, y }
        )
        return undefined
      }
    }
  }

  r_entrega(obj, agora) {
    if (this.contar("FROM objetos WHERE tipo = 'entrega' AND autor = :autor AND removido_em IS NULL", { autor: obj.autor }) >= ESTRUTURA.entregasPorRover) {
      throw new ErroDoProtocolo('limite_de_estrutura', { detalhe: `O limite é de ${ESTRUTURA.entregasPorRover} entregas.` })
    }
    return {
      ctx: obj.autor,
      depois: ({ agora: t }) => this.registrarTags(obj.id, obj.autor, null, this.tagsDe(obj.corpo.tags, obj.corpo.descricao, obj.corpo.resultado), t)
    }
  }

  // ====================================================================================================
  // COMUNIDADES
  // ====================================================================================================

  /** O nome de uma comunidade listada é único entre as listadas vivas (maiúsculas, acentos e pontuação não distinguem). */
  _nomeLivre(nome, acesso, exceto = null) {
    if (acesso === 'fechada') return
    const chave = chaveDeNome(nome)
    const outro = this.a.um("SELECT id FROM comunidades WHERE chave_nome = :chave AND acesso <> 'fechada' AND encerrada_em IS NULL AND id <> :exceto", { chave, exceto: exceto ?? '' })
    if (outro) throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.nome' })
  }

  r_comunidade_criar(obj) {
    const c = obj.corpo
    if (this.contar('FROM comunidades WHERE dono = :uid AND encerrada_em IS NULL', { uid: obj.autor }) >= ESTRUTURA.comunidadesComoDono) {
      throw new ErroDoProtocolo('limite_de_estrutura', { detalhe: `O limite é de ${ESTRUTURA.comunidadesComoDono} comunidades como dono.` })
    }
    this._exigirVagaEmComunidade(obj.autor)
    this._nomeLivre(c.nome, c.acesso)
    return {
      ctx: obj.id,
      depois: ({ seq, agora }) => {
        this.a.executar(
          `INSERT INTO comunidades (id, dono, nome, chave_nome, descricao, regras, tema, acesso, categorias, criada_em, seq, atividade_em, atividade_seq, versao_id)
           VALUES (:id, :dono, :nome, :chave, :descricao, :regras, :tema, :acesso, :categorias, :agora, :seq, :agora, :seq, :id)`,
          { id: obj.id, dono: obj.autor, nome: c.nome, chave: chaveDeNome(c.nome), descricao: c.descricao, regras: c.regras, tema: c.tema, acesso: c.acesso, categorias: JSON.stringify(c.categorias), agora, seq }
        )
        this.a.executar("INSERT INTO membros (comunidade, uid, papel, desde) VALUES (:id, :uid, 'dono', :agora)", { id: obj.id, uid: obj.autor, agora })
        this.indexar('comunidade', obj.id, obj.id, c.nome, `${c.descricao} ${c.tema}`)
      }
    }
  }

  _exigirVagaEmComunidade(uid) {
    if (this.contar('FROM membros WHERE uid = :uid', { uid }) >= ESTRUTURA.comunidadesComoMembro) {
      throw new ErroDoProtocolo('limite_de_estrutura', { detalhe: `O limite é de ${ESTRUTURA.comunidadesComoMembro} comunidades.` })
    }
  }

  r_comunidade_atualizar(obj) {
    const c = obj.corpo
    const { com, papel } = this.exigirPapel(c.comunidade, obj.autor, 'moderador')
    if (c.acesso !== com.acesso && papel !== 'dono') throw new ErroDoProtocolo('sem_permissao', { campo: 'objeto.corpo.acesso' })
    this._nomeLivre(c.nome, c.acesso, com.id)
    return {
      ctx: com.id,
      alvo: com.id,
      depois: () => {
        this.a.executar(
          'UPDATE comunidades SET nome = :nome, chave_nome = :chave, descricao = :descricao, regras = :regras, tema = :tema, acesso = :acesso, categorias = :categorias, versao_id = :versao WHERE id = :id',
          { id: com.id, nome: c.nome, chave: chaveDeNome(c.nome), descricao: c.descricao, regras: c.regras, tema: c.tema, acesso: c.acesso, categorias: JSON.stringify(c.categorias), versao: obj.id }
        )
        this.indexar('comunidade', com.id, com.id, c.nome, `${c.descricao} ${c.tema}`)
      }
    }
  }

  r_comunidade_adesao(obj, agora) {
    const { comunidade: id, acao } = obj.corpo
    const efeitoSimples = (resultado, depois) => ({ ctx: id, resultado, depois })
    switch (acao) {
      case 'entrar': {
        const com = this.comunidade(id)
        if (!com || com.acesso === 'fechada') throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.comunidade' })
        if (this.banido(id, obj.autor)) throw new ErroDoProtocolo('banido', { campo: 'objeto.corpo.comunidade' })
        if (this.papel(id, obj.autor) || this.a.um('SELECT 1 AS n FROM pedidos_de_entrada WHERE comunidade = :id AND uid = :uid', { id, uid: obj.autor })) {
          throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.comunidade' })
        }
        this._exigirVagaEmComunidade(obj.autor)
        const emRaid = com.acesso === 'aberta' &&
          this.contar("FROM membros WHERE comunidade = :id AND papel <> 'dono' AND desde > :desde", { id, desde: agora - TEMPOS.raidJanelaS }) >= RAID.entradasPorHora
        if (com.acesso === 'aberta' && !emRaid) {
          return efeitoSimples('membro', ({ agora: t }) => this.a.executar("INSERT INTO membros (comunidade, uid, papel, desde) VALUES (:id, :uid, 'membro', :t)", { id, uid: obj.autor, t }))
        }
        if (this.contar('FROM pedidos_de_entrada WHERE uid = :uid', { uid: obj.autor }) >= ESTRUTURA.pedidosDeEntradaPorRover ||
            this.contar('FROM pedidos_de_entrada WHERE comunidade = :id', { id }) >= ESTRUTURA.pedidosDeEntradaPorComunidade) {
          throw new ErroDoProtocolo('limite_de_estrutura', { detalhe: 'Há pedidos de entrada pendentes demais.' })
        }
        return efeitoSimples('pendente', ({ agora: t }) => {
          this.a.executar('INSERT INTO pedidos_de_entrada (comunidade, uid, em) VALUES (:id, :uid, :t)', { id, uid: obj.autor, t })
          for (const resp of this.responsaveis(id)) this.avisar(resp, 'pedido-de-entrada', { origem: obj.autor, objeto: obj.id, comunidade: id }, t)
        })
      }
      case 'sair': {
        const { papel } = this.exigirPapel(id, obj.autor, 'membro')
        if (papel === 'dono') throw new ErroDoProtocolo('sem_permissao', { campo: 'objeto.corpo.comunidade', detalhe: 'O dono transfere a posse antes de sair.' })
        return efeitoSimples('fora', () => this.a.executar('DELETE FROM membros WHERE comunidade = :id AND uid = :uid', { id, uid: obj.autor }))
      }
      case 'aceitar-convite': {
        const com = this.comunidade(id)
        if (!com || !this.convidado(id, obj.autor)) throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.comunidade' })
        // (quem foi banido perdeu o convite no ato, então aqui não há banido; já ser membro pode acontecer: entrou por `entrar`)
        if (this.papel(id, obj.autor)) throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.comunidade' })
        this._exigirVagaEmComunidade(obj.autor)
        return efeitoSimples('membro', ({ agora: t }) => {
          this.a.executar('DELETE FROM convites WHERE comunidade = :id AND uid = :uid', { id, uid: obj.autor })
          this.a.executar('DELETE FROM pedidos_de_entrada WHERE comunidade = :id AND uid = :uid', { id, uid: obj.autor })
          this.a.executar("INSERT OR IGNORE INTO membros (comunidade, uid, papel, desde) VALUES (:id, :uid, 'membro', :t)", { id, uid: obj.autor, t })
        })
      }
      case 'recusar-convite':
        if (!this.convidado(id, obj.autor)) throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.comunidade' })
        return efeitoSimples('fora', () => this.a.executar('DELETE FROM convites WHERE comunidade = :id AND uid = :uid', { id, uid: obj.autor }))
      default: {
        if (!this.a.um('SELECT 1 AS n FROM pedidos_de_entrada WHERE comunidade = :id AND uid = :uid', { id, uid: obj.autor })) throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.comunidade' })
        return efeitoSimples('fora', () => this.a.executar('DELETE FROM pedidos_de_entrada WHERE comunidade = :id AND uid = :uid', { id, uid: obj.autor }))
      }
    }
  }

  r_comunidade_gestao(obj, agora) {
    const { comunidade: id, alvo, acao, motivo } = obj.corpo
    const { papel } = this.exigirPapel(id, obj.autor, 'moderador')
    const sou = (p) => papel === p
    const papelDoAlvo = this.papel(id, alvo)
    const campo = 'objeto.corpo.alvo'
    const efeito = (resultado, depois) => ({ ctx: id, resultado, depois })
    const remover = (uid) => {
      this.a.executar('DELETE FROM membros WHERE comunidade = :id AND uid = :uid', { id, uid })
      this.a.executar('DELETE FROM convites WHERE comunidade = :id AND uid = :uid', { id, uid })
      this.a.executar('DELETE FROM pedidos_de_entrada WHERE comunidade = :id AND uid = :uid', { id, uid })
    }
    const registrar = (t, acaoPublica, tipoAlvo = null) => this.registrarModeracao({
      em: t, escopo: 'comunidade', contexto: id, acao: acaoPublica, alvoTipo: tipoAlvo, alvo: alvo, autorDoAlvo: alvo, motivo, papel, por: obj.autor
    })
    switch (acao) {
      case 'convidar': {
        this.exigirRover(alvo, agora)
        this.exigirSemBloqueio(obj.autor, alvo)
        if (papelDoAlvo) throw new ErroDoProtocolo('ja_existe', { campo })
        if (this.banido(id, alvo)) throw new ErroDoProtocolo('banido', { campo })
        if (this.convidado(id, alvo)) throw new ErroDoProtocolo('ja_existe', { campo })
        if (this.contar('FROM convites WHERE comunidade = :id', { id }) >= ESTRUTURA.convitesPorComunidade ||
            this.contar('FROM convites WHERE uid = :uid', { uid: alvo }) >= ESTRUTURA.convitesRecebidos) {
          throw new ErroDoProtocolo('limite_de_estrutura', { detalhe: 'Há convites pendentes demais.' })
        }
        return efeito(undefined, ({ agora: t }) => {
          this.a.executar('INSERT INTO convites (comunidade, uid, por, em) VALUES (:id, :alvo, :por, :t)', { id, alvo, por: obj.autor, t })
          this.avisar(alvo, 'convite-comunidade', { origem: obj.autor, objeto: obj.id, comunidade: id }, t)
        })
      }
      case 'cancelar-convite':
        if (!this.convidado(id, alvo)) throw new ErroDoProtocolo('nao_encontrado', { campo })
        return efeito(undefined, () => this.a.executar('DELETE FROM convites WHERE comunidade = :id AND uid = :alvo', { id, alvo }))
      case 'aprovar-pedido': {
        if (!this.a.um('SELECT 1 AS n FROM pedidos_de_entrada WHERE comunidade = :id AND uid = :alvo', { id, alvo })) throw new ErroDoProtocolo('nao_encontrado', { campo })
        this._exigirVagaEmComunidade(alvo)
        return efeito('membro', ({ agora: t }) => {
          this.a.executar('DELETE FROM pedidos_de_entrada WHERE comunidade = :id AND uid = :alvo', { id, alvo })
          this.a.executar("INSERT OR IGNORE INTO membros (comunidade, uid, papel, desde) VALUES (:id, :alvo, 'membro', :t)", { id, alvo, t })
          this.avisar(alvo, 'entrada-aprovada', { origem: obj.autor, objeto: obj.id, comunidade: id }, t)
        })
      }
      case 'recusar-pedido':
        if (!this.a.um('SELECT 1 AS n FROM pedidos_de_entrada WHERE comunidade = :id AND uid = :alvo', { id, alvo })) throw new ErroDoProtocolo('nao_encontrado', { campo })
        return efeito('fora', () => this.a.executar('DELETE FROM pedidos_de_entrada WHERE comunidade = :id AND uid = :alvo', { id, alvo }))
      case 'expulsar': {
        if (!papelDoAlvo) throw new ErroDoProtocolo('nao_encontrado', { campo })
        if (papelDoAlvo === 'dono' || (sou('moderador') && papelDoAlvo !== 'membro')) throw new ErroDoProtocolo('sem_permissao', { campo })
        return efeito('fora', ({ agora: t }) => {
          remover(alvo)
          registrar(t, 'expulsao')
          this.avisar(alvo, 'expulso', { origem: null, objeto: obj.id, comunidade: id }, t)
        })
      }
      case 'banir': {
        this.exigirRover(alvo, agora)
        if (this.banido(id, alvo)) throw new ErroDoProtocolo('ja_existe', { campo })
        if (papelDoAlvo === 'dono' || (sou('moderador') && papelDoAlvo && papelDoAlvo !== 'membro')) throw new ErroDoProtocolo('sem_permissao', { campo })
        return efeito('fora', ({ agora: t }) => {
          remover(alvo)
          this.a.executar(
            'INSERT INTO banidos (comunidade, uid, por, papel_de_quem_baniu, motivo, em) VALUES (:id, :alvo, :por, :papel, :motivo, :t)',
            { id, alvo, por: obj.autor, papel, motivo, t }
          )
          registrar(t, 'banimento')
          this.avisar(alvo, 'banido', { origem: null, objeto: obj.id, comunidade: id }, t)
        })
      }
      case 'desbanir':
        if (!this.banido(id, alvo)) throw new ErroDoProtocolo('nao_encontrado', { campo })
        return efeito('fora', () => this.a.executar('DELETE FROM banidos WHERE comunidade = :id AND uid = :alvo', { id, alvo }))
      case 'promover': {
        if (!sou('dono')) throw new ErroDoProtocolo('sem_permissao', { campo: 'objeto.corpo.acao' })
        if (!papelDoAlvo) throw new ErroDoProtocolo('nao_encontrado', { campo })
        if (papelDoAlvo !== 'membro') throw new ErroDoProtocolo('ja_existe', { campo })
        if (this.contar("FROM membros WHERE comunidade = :id AND papel = 'moderador'", { id }) >= ESTRUTURA.moderadoresPorComunidade) {
          throw new ErroDoProtocolo('limite_de_estrutura', { detalhe: `O limite é de ${ESTRUTURA.moderadoresPorComunidade} moderadores.` })
        }
        return efeito(undefined, () => this.a.executar("UPDATE membros SET papel = 'moderador' WHERE comunidade = :id AND uid = :alvo", { id, alvo }))
      }
      default: {
        if (!sou('dono')) throw new ErroDoProtocolo('sem_permissao', { campo: 'objeto.corpo.acao' })
        if (!papelDoAlvo) throw new ErroDoProtocolo('nao_encontrado', { campo })
        if (papelDoAlvo !== 'moderador') throw new ErroDoProtocolo('ja_existe', { campo })
        return efeito(undefined, () => this.a.executar("UPDATE membros SET papel = 'membro' WHERE comunidade = :id AND uid = :alvo", { id, alvo }))
      }
    }
  }

  r_comunidade_posse(obj, agora) {
    const { comunidade: id, acao, novoDono } = obj.corpo
    const { com } = this.exigirPapel(id, obj.autor, 'dono')
    if (acao === 'transferir') {
      if (!this.papel(id, novoDono)) throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.novoDono' })
      this.exigirRover(novoDono, agora, 'objeto.corpo.novoDono')
      return {
        ctx: id,
        depois: ({ agora: t }) => {
          const caberiaComoModerador = this.contar("FROM membros WHERE comunidade = :id AND papel = 'moderador'", { id }) < ESTRUTURA.moderadoresPorComunidade
          this.a.executar("UPDATE membros SET papel = 'dono' WHERE comunidade = :id AND uid = :novo", { id, novo: novoDono })
          this.a.executar('UPDATE membros SET papel = :papel WHERE comunidade = :id AND uid = :antigo', { id, antigo: obj.autor, papel: caberiaComoModerador ? 'moderador' : 'membro' })
          this.a.executar('UPDATE comunidades SET dono = :novo WHERE id = :id', { id, novo: novoDono })
          this.avisar(novoDono, 'posse-recebida', { origem: obj.autor, objeto: obj.id, comunidade: id }, t)
        }
      }
    }
    return { ctx: id, depois: ({ agora: t }) => this.encerrarComunidade(com.id, obj.autor, t) }
  }

  /** Encerrar: some de toda leitura; o conteúdo fica oculto e é apagado depois de 30 dias (ver `limpar`). */
  encerrarComunidade(id, por, agora) {
    this.a.executar('UPDATE comunidades SET encerrada_em = :agora WHERE id = :id', { id, agora })
    this.a.executar(
      'UPDATE objetos SET oculto_em = :agora, oculto_por = :por WHERE oculto_em IS NULL AND removido_em IS NULL AND (ctx = :id OR ctx IN (SELECT id FROM topicos WHERE comunidade = :id))',
      { id, agora, por }
    )
    this.desindexar('comunidade', id)
    this.a.executar("DELETE FROM busca WHERE tipo = 'topico' AND ctx = :id", { id })
    this.a.executar('DELETE FROM tags_uso WHERE ctx = :id', { id })
    this.a.executar('DELETE FROM convites WHERE comunidade = :id', { id })
    this.a.executar('DELETE FROM pedidos_de_entrada WHERE comunidade = :id', { id })
  }

  // ====================================================================================================
  // FÓRUM
  // ====================================================================================================

  _exigirCarencia(com, uid, segundos, agora) {
    const m = this.a.um('SELECT papel, desde FROM membros WHERE comunidade = :c AND uid = :uid', { c: com.id, uid })
    if (m.desde + segundos > agora) throw new ErroDoProtocolo('em_carencia', { retryAfterS: m.desde + segundos - agora })
  }

  r_topico(obj, agora) {
    const c = obj.corpo
    const { com, papel } = this.exigirPapel(c.comunidade, obj.autor, 'membro')
    if (papel === 'membro') this._exigirCarencia(com, obj.autor, TEMPOS.carenciaParaTopicoS, agora)
    if (c.categoria !== null && !JSON.parse(com.categorias).includes(c.categoria)) {
      throw new ErroDoProtocolo('esquema', { campo: 'objeto.corpo.categoria', detalhe: 'Campo objeto.corpo.categoria: não existe nesta comunidade.' })
    }
    const tags = this.tagsDe(c.tags, c.titulo, c.texto)
    return {
      ctx: com.id,
      depois: ({ seq, agora: t }) => {
        this.a.executar(
          `INSERT INTO topicos (id, comunidade, categoria, autor, titulo, texto, tags, seq, criado_em, atividade_seq, atividade_em, enquete)
           VALUES (:id, :comunidade, :categoria, :autor, :titulo, :texto, :tags, :seq, :criadoEm, :seq, :t, :enquete)`,
          {
            id: obj.id, comunidade: com.id, categoria: c.categoria, autor: obj.autor, titulo: c.titulo, texto: c.texto, tags: JSON.stringify(c.tags),
            seq, criadoEm: obj.criadoEm, t, enquete: c.enquete ? JSON.stringify(c.enquete) : null
          }
        )
        this.a.executar('UPDATE comunidades SET atividade_em = :t, atividade_seq = :seq WHERE id = :id', { id: com.id, t, seq })
        this.indexar('topico', obj.id, com.id, c.titulo, `${c.texto} ${tags.join(' ')}`)
        this.registrarTags(obj.id, obj.autor, com.id, tags, t)
        this.mencoes(`${c.titulo}\n${c.texto}`, { origem: obj.autor, objeto: obj.id, comunidade: com.id }, t)
      }
    }
  }

  /** O tópico, vivo, num lugar onde o autor participa. */
  _topicoParaAgir(id, autor, minimo = 'membro') {
    const t = this.topico(id)
    if (!t) throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.topico' })
    const { com, papel } = this.exigirPapel(t.comunidade, autor, minimo, 'objeto.corpo.topico')
    const o = this.a.objeto(id)
    if (o.removido_em !== null || o.oculto_em !== null || this.a.bloqueado('objeto', id)) throw new ErroDoProtocolo('alvo_removido', { campo: 'objeto.corpo.topico' })
    return { t, com, papel }
  }

  r_topico_editar(obj, agora) {
    const c = obj.corpo
    const { t, com } = this._topicoParaAgir(c.topico, obj.autor)
    if (t.autor !== obj.autor) throw new ErroDoProtocolo('sem_permissao', { campo: 'objeto.corpo.topico' })
    if (t.trancado) throw new ErroDoProtocolo('trancado', { campo: 'objeto.corpo.topico' })
    if (agora > t.criado_em + TEMPOS.janelaDeEdicaoDoTopicoS) throw new ErroDoProtocolo('fora_da_janela', { campo: 'objeto.corpo.topico' })
    if (t.versoes - 1 >= ESTRUTURA.edicoesDeTopico) throw new ErroDoProtocolo('limite_de_estrutura', { detalhe: `O limite é de ${ESTRUTURA.edicoesDeTopico} edições.` })
    const tags = this.tagsDe(c.tags, c.titulo, c.texto)
    return {
      alvo: t.id,
      ctx: t.id,
      depois: ({ agora: t2 }) => {
        this.a.executar('UPDATE topicos SET titulo = :titulo, texto = :texto, tags = :tags, versoes = versoes + 1 WHERE id = :id', { id: t.id, titulo: c.titulo, texto: c.texto, tags: JSON.stringify(c.tags) })
        this.indexar('topico', t.id, com.id, c.titulo, `${c.texto} ${tags.join(' ')}`)
        this.registrarTags(t.id, obj.autor, com.id, tags, t2)
        const antes = new Set(extrairMencoes(`${t.titulo}\n${t.texto}`))
        const novas = extrairMencoes(`${c.titulo}\n${c.texto}`).filter((h) => !antes.has(h))
        if (novas.length) this.mencoes(novas.map((h) => `@${h}`).join(' '), { origem: obj.autor, objeto: t.id, comunidade: com.id }, t2)
      }
    }
  }

  r_resposta_forum(obj, agora) {
    const c = obj.corpo
    const { t, com, papel } = this._topicoParaAgir(c.topico, obj.autor)
    if (t.trancado && papel === 'membro') throw new ErroDoProtocolo('trancado', { campo: 'objeto.corpo.topico' })
    if (papel === 'membro') this._exigirCarencia(com, obj.autor, TEMPOS.carenciaParaRespostaS, agora)
    const resposta = (id, campo) => {
      const l = id ? this.a.objeto(id) : null
      if (!l || l.tipo !== 'resposta-forum' || l.ctx !== t.id || l.removido_em !== null || l.oculto_em !== null) throw new ErroDoProtocolo('alvo_desconhecido', { campo })
      return l
    }
    let pai = null
    if (c.em !== null) {
      pai = resposta(c.em, 'objeto.corpo.em')
      if (pai.alvo !== t.id) throw new ErroDoProtocolo('resposta_funda', { campo: 'objeto.corpo.em' })
    }
    const citada = c.cita !== null ? resposta(c.cita, 'objeto.corpo.cita') : null
    this.exigirSemBloqueio(obj.autor, t.autor, 'objeto.corpo.topico')
    if (pai) this.exigirSemBloqueio(obj.autor, pai.autor, 'objeto.corpo.em')
    if (citada) this.exigirSemBloqueio(obj.autor, citada.autor, 'objeto.corpo.cita')
    return {
      alvo: pai ? pai.id : t.id,
      ctx: t.id,
      depois: ({ seq, agora: t2 }) => {
        this.a.executar('UPDATE topicos SET atividade_seq = :seq, atividade_em = :t WHERE id = :id', { id: t.id, seq, t: t2 })
        this.a.executar('UPDATE comunidades SET atividade_seq = :seq, atividade_em = :t WHERE id = :id', { id: com.id, seq, t: t2 })
        const info = { origem: obj.autor, objeto: obj.id, comunidade: com.id }
        const avisados = new Set()
        const aviso = (dest, tipo) => {
          if (!dest || avisados.has(dest) || !this.podeLerComunidade(com, dest)) return
          this.avisar(dest, tipo, info, t2)
          avisados.add(dest)
        }
        aviso(pai?.autor, 'resposta-a-voce')
        aviso(citada?.autor, 'citacao')
        aviso(t.autor, 'resposta-no-topico')
        this.mencoes(c.texto, { ...info, jaAvisados: avisados }, t2)
      }
    }
  }

  /**
   * 0.3.1 (proposta 0006): o moderador tira as denúncias abertas de um alvo da fila daquela comunidade. Não apaga conteúdo e não
   * libera quem denunciou para denunciar de novo (a linha fica). Uma denúncia nova, de outra pessoa, reabre o caso.
   */
  r_denuncia_dispensar(obj) {
    const { comunidade: id, alvo } = obj.corpo
    const { papel } = this.exigirPapel(id, obj.autor, 'moderador')
    const campo = 'objeto.corpo.alvo'
    const linha = this.a.objeto(alvo)
    const abertas = this.contar('FROM denuncias WHERE alvo = :alvo AND comunidade = :c AND dispensada_em IS NULL', { alvo, c: id })
    if (!linha || abertas === 0) throw new ErroDoProtocolo('nao_encontrado', { campo })
    return {
      ctx: id,
      depois: ({ agora: t }) => {
        this.a.executar('UPDATE denuncias SET dispensada_em = :t WHERE alvo = :alvo AND comunidade = :c AND dispensada_em IS NULL', { t, alvo, c: id })
        this.registrarModeracao({ em: t, escopo: 'comunidade', contexto: id, acao: 'dispensa', alvoTipo: linha.tipo, alvo, autorDoAlvo: linha.autor, motivo: 'dispensada', papel, por: obj.autor })
      }
    }
  }

  r_topico_gestao(obj) {
    const c = obj.corpo
    const { t, com, papel: papelOrigem } = this._topicoParaAgir(c.topico, obj.autor, 'moderador')
    const campo = 'objeto.corpo.acao'
    switch (c.acao) {
      case 'fixar':
        if (t.fixado) throw new ErroDoProtocolo('ja_existe', { campo })
        if (this.contar('FROM topicos WHERE comunidade = :c AND fixado = 1', { c: com.id }) >= ESTRUTURA.fixadosPorComunidade) {
          throw new ErroDoProtocolo('limite_de_estrutura', { detalhe: `O limite é de ${ESTRUTURA.fixadosPorComunidade} fixados.` })
        }
        return { ctx: t.id, depois: () => this.a.executar('UPDATE topicos SET fixado = 1 WHERE id = :id', { id: t.id }) }
      case 'desafixar':
        if (!t.fixado) throw new ErroDoProtocolo('ja_existe', { campo })
        return { ctx: t.id, depois: () => this.a.executar('UPDATE topicos SET fixado = 0 WHERE id = :id', { id: t.id }) }
      case 'trancar':
        if (t.trancado) throw new ErroDoProtocolo('ja_existe', { campo })
        return { ctx: t.id, depois: () => this.a.executar('UPDATE topicos SET trancado = 1 WHERE id = :id', { id: t.id }) }
      case 'destrancar':
        if (!t.trancado) throw new ErroDoProtocolo('ja_existe', { campo })
        return { ctx: t.id, depois: () => this.a.executar('UPDATE topicos SET trancado = 0 WHERE id = :id', { id: t.id }) }
      default: {
        const { com: destino } = this.exigirPapel(c.comunidade, obj.autor, 'moderador', 'objeto.corpo.comunidade')
        if (destino.id === com.id && c.categoria === t.categoria) throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.comunidade' })
        if (c.categoria !== null && !JSON.parse(destino.categorias).includes(c.categoria)) {
          throw new ErroDoProtocolo('esquema', { campo: 'objeto.corpo.categoria', detalhe: 'Campo objeto.corpo.categoria: não existe na comunidade de destino.' })
        }
        if (com.acesso === 'fechada' && destino.acesso !== 'fechada' && papelOrigem !== 'dono') {
          throw new ErroDoProtocolo('sem_permissao', { campo: 'objeto.corpo.comunidade', detalhe: 'Só o dono da comunidade fechada a torna pública movendo um tópico dela.' })
        }
        return {
          ctx: t.id,
          depois: () => {
            this.a.executar("UPDATE topicos SET comunidade = :destino, categoria = :categoria, fixado = 0, etiquetas = '[]', status = NULL WHERE id = :id", { id: t.id, destino: destino.id, categoria: c.categoria })
            this.a.executar('UPDATE objetos SET ctx = :destino WHERE id = :id', { id: t.id, destino: destino.id })
            this.a.executar('UPDATE tags_uso SET ctx = :destino WHERE objeto = :id', { id: t.id, destino: destino.id })
            this.a.executar("UPDATE busca SET ctx = :destino WHERE tipo = 'topico' AND ref = :id", { id: t.id, destino: destino.id })
          }
        }
      }
    }
  }

  // ---------- 0.3.2: vocabulário e marcas (proposta 0007) ----------

  /**
   * O dono ou um moderador define, de uma vez, o vocabulário fechado da comunidade (substitui o anterior). Os rótulos e as chaves já
   * foram conferidos pelo esquema: lista fechada de caracteres, sem campo livre. Aqui só o que depende do estado: o papel e as categorias.
   */
  r_comunidade_vocabulario(obj) {
    const c = obj.corpo
    const { com } = this.exigirPapel(c.comunidade, obj.autor, 'moderador')
    const categorias = JSON.parse(com.categorias)
    c.status.forEach((s, i) => {
      if (s.categorias === null) return
      for (const cat of s.categorias) {
        if (!categorias.includes(cat)) {
          throw new ErroDoProtocolo('esquema', { campo: `objeto.corpo.status[${i}].categorias`, detalhe: `Campo objeto.corpo.status[${i}].categorias: ${JSON.stringify(cat)} não é categoria da comunidade.` })
        }
      }
    })
    return {
      ctx: com.id,
      depois: () => {
        const vazio = c.etiquetas.length === 0 && c.status.length === 0
        const vocab = { etiquetas: c.etiquetas, status: c.status }
        this.a.executar('UPDATE comunidades SET vocabulario = :v WHERE id = :id', { v: vazio ? null : JSON.stringify(vocab), id: com.id })
        this._limparMarcasQueSobraram(com.id)
      }
    }
  }

  /** Depois de trocar o vocabulário, tira dos tópicos as chaves que deixaram de valer: a leitura nunca aponta para o que não existe. */
  _limparMarcasQueSobraram(comunidadeId) {
    const com = this.a.um('SELECT * FROM comunidades WHERE id = :id', { id: comunidadeId })
    const vocab = this.vocabularioDe(com)
    const etiquetas = new Set(vocab.etiquetas.map((e) => e.chave))
    const marcados = this.a.todos("SELECT id, categoria, etiquetas, status FROM topicos WHERE comunidade = :c AND (etiquetas <> '[]' OR status IS NOT NULL)", { c: comunidadeId })
    for (const t of marcados) {
      const antes = JSON.parse(t.etiquetas)
      const depois = antes.filter((k) => etiquetas.has(k))
      const status = t.status !== null && this.statusValeParaTopico(vocab, t.status, t.categoria) ? t.status : null
      if (depois.length !== antes.length || status !== t.status) {
        this.a.executar('UPDATE topicos SET etiquetas = :e, status = :s WHERE id = :id', { e: JSON.stringify(depois), s: status, id: t.id })
      }
    }
  }

  /**
   * As marcas de um tópico (até 3 etiquetas e um status), definidas de uma vez. O autor marca o PRÓPRIO tópico, e só enquanto ele não
   * está trancado; dono e moderador marcam qualquer tópico da comunidade. Chave fora do vocabulário é recusada.
   */
  r_topico_marca(obj) {
    const c = obj.corpo
    const { t, com, papel } = this._topicoParaAgir(c.topico, obj.autor)
    if (t.autor !== obj.autor && papel === 'membro') throw new ErroDoProtocolo('sem_permissao', { campo: 'objeto.corpo.topico' })
    if (t.trancado && papel === 'membro') throw new ErroDoProtocolo('trancado', { campo: 'objeto.corpo.topico' })
    const vocab = this.vocabularioDe(com)
    const chaves = new Set(vocab.etiquetas.map((e) => e.chave))
    for (const k of c.etiquetas) {
      if (!chaves.has(k)) throw new ErroDoProtocolo('esquema', { campo: 'objeto.corpo.etiquetas', detalhe: `Campo objeto.corpo.etiquetas: ${JSON.stringify(k)} não existe no vocabulário da comunidade.` })
    }
    if (c.status !== null && !this.statusValeParaTopico(vocab, c.status, t.categoria)) {
      throw new ErroDoProtocolo('esquema', { campo: 'objeto.corpo.status', detalhe: `Campo objeto.corpo.status: ${JSON.stringify(c.status)} não vale para este tópico.` })
    }
    const atuais = JSON.parse(t.etiquetas)
    const igual = c.status === t.status && c.etiquetas.length === atuais.length && c.etiquetas.every((k) => atuais.includes(k))
    if (igual) throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.topico' })
    return {
      ctx: t.id,
      depois: () => this.a.executar('UPDATE topicos SET etiquetas = :e, status = :s WHERE id = :id', { e: JSON.stringify(c.etiquetas), s: c.status, id: t.id })
    }
  }

  r_topico_resolvido(obj) {
    const c = obj.corpo
    const { t, papel } = this._topicoParaAgir(c.topico, obj.autor)
    if (t.autor !== obj.autor && papel === 'membro') throw new ErroDoProtocolo('sem_permissao', { campo: 'objeto.corpo.topico' })
    let resp = null
    if (c.resposta !== null) {
      resp = this.a.objeto(c.resposta)
      if (!resp || resp.tipo !== 'resposta-forum' || resp.ctx !== t.id || resp.removido_em !== null || resp.oculto_em !== null) {
        throw new ErroDoProtocolo('alvo_desconhecido', { campo: 'objeto.corpo.resposta' })
      }
    }
    return {
      ctx: t.id,
      depois: ({ agora: t2 }) => {
        this.a.executar(
          'UPDATE topicos SET resolvido_resposta = :resposta, resolvido_por = :por, resolvido_em = :t WHERE id = :id',
          { id: t.id, resposta: resp?.id ?? null, por: resp ? obj.autor : null, t: resp ? t2 : null }
        )
        if (resp) this.avisar(resp.autor, 'resolveu', { origem: obj.autor, objeto: resp.id, comunidade: t.comunidade }, t2)
      }
    }
  }

  r_voto(obj, agora) {
    const c = obj.corpo
    const { t, com } = this._topicoParaAgir(c.topico, obj.autor)
    const enquete = t.enquete ? JSON.parse(t.enquete) : null
    if (!enquete) throw new ErroDoProtocolo('esquema', { campo: 'objeto.corpo.topico', detalhe: 'Campo objeto.corpo.topico: este tópico não tem enquete.' })
    if (c.opcao >= enquete.opcoes.length) throw new ErroDoProtocolo('esquema', { campo: 'objeto.corpo.opcao', detalhe: 'Campo objeto.corpo.opcao: a enquete não tem essa opção.' })
    if (agora >= enquete.encerraEm) throw new ErroDoProtocolo('enquete_encerrada', { campo: 'objeto.corpo.topico' })
    this._exigirCarencia(com, obj.autor, TEMPOS.carenciaParaVotoS, agora)
    if (this.a.um('SELECT 1 AS n FROM votos WHERE topico = :t AND uid = :uid', { t: t.id, uid: obj.autor })) throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.topico' })
    return {
      ctx: t.id,
      sub: String(c.opcao),
      depois: ({ agora: t2 }) => this.a.executar('INSERT INTO votos (topico, uid, opcao, em) VALUES (:t, :uid, :opcao, :t2)', { t: t.id, uid: obj.autor, opcao: c.opcao, t2 })
    }
  }

  // ====================================================================================================
  // PÁGINAS
  // ====================================================================================================

  _nomeDePaginaLivre(nome, exceto = null) {
    const outro = this.a.um('SELECT id FROM paginas WHERE chave_nome = :chave AND encerrada_em IS NULL AND id <> :exceto', { chave: chaveDeNome(nome), exceto: exceto ?? '' })
    if (outro) throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.nome' })
  }

  r_pagina_criar(obj) {
    const c = obj.corpo
    if (this.contar('FROM paginas WHERE dono = :uid AND encerrada_em IS NULL', { uid: obj.autor }) >= ESTRUTURA.paginasComoDono) {
      throw new ErroDoProtocolo('limite_de_estrutura', { detalhe: `O limite é de ${ESTRUTURA.paginasComoDono} páginas como dono.` })
    }
    this._nomeDePaginaLivre(c.nome)
    return {
      ctx: obj.id,
      depois: ({ seq, agora }) => {
        this.a.executar(
          `INSERT INTO paginas (id, dono, nome, chave_nome, descricao, tema, criada_em, seq, atividade_em, atividade_seq, versao_id)
           VALUES (:id, :dono, :nome, :chave, :descricao, :tema, :agora, :seq, :agora, :seq, :id)`,
          { id: obj.id, dono: obj.autor, nome: c.nome, chave: chaveDeNome(c.nome), descricao: c.descricao, tema: c.tema, agora, seq }
        )
        this.a.executar('INSERT INTO pagina_admins (pagina, uid, desde) VALUES (:id, :uid, :agora)', { id: obj.id, uid: obj.autor, agora })
        this.indexar('pagina', obj.id, obj.id, c.nome, `${c.descricao} ${c.tema}`)
      }
    }
  }

  /** A página viva em que o autor administra (dono ou administrador). `nao_encontrado` se a página não existe. */
  _paginaParaAdministrar(id, autor, soDono = false) {
    const p = this.pagina(id)
    if (!p) throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.pagina' })
    const papel = this.papelNaPagina(id, autor)
    if (!papel || (soDono && papel !== 'dono')) throw new ErroDoProtocolo('sem_permissao', { campo: 'objeto.corpo.pagina' })
    return p
  }

  r_pagina_atualizar(obj) {
    const c = obj.corpo
    const p = this._paginaParaAdministrar(c.pagina, obj.autor)
    this._nomeDePaginaLivre(c.nome, p.id)
    return {
      alvo: p.id,
      ctx: p.id,
      depois: () => {
        this.a.executar(
          'UPDATE paginas SET nome = :nome, chave_nome = :chave, descricao = :descricao, tema = :tema, versao_id = :versao WHERE id = :id',
          { id: p.id, nome: c.nome, chave: chaveDeNome(c.nome), descricao: c.descricao, tema: c.tema, versao: obj.id }
        )
        this.indexar('pagina', p.id, p.id, c.nome, `${c.descricao} ${c.tema}`)
      }
    }
  }

  r_pagina_publicar(obj) {
    const c = obj.corpo
    const p = this._paginaParaAdministrar(c.pagina, obj.autor)
    return {
      ctx: p.id,
      depois: ({ seq, agora }) => {
        this.a.executar('UPDATE paginas SET atividade_seq = :seq, atividade_em = :agora WHERE id = :id', { id: p.id, seq, agora })
        this.registrarTags(obj.id, obj.autor, null, this.tagsDe(c.tags, c.texto, c.titulo ?? ''), agora)
        this.mencoes(`${c.titulo ?? ''}\n${c.texto}`, { origem: obj.autor, objeto: obj.id, pagina: p.id }, agora)
      }
    }
  }

  r_pagina_seguir(obj) {
    const { pagina: id, acao } = obj.corpo
    const p = this.pagina(id)
    if (!p) throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.pagina' })
    const segue = this.a.um('SELECT 1 AS n FROM pagina_seguidores WHERE pagina = :id AND uid = :uid', { id, uid: obj.autor }) !== null
    if (acao === 'deixar') {
      if (!segue) throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.pagina' })
      return { ctx: id, depois: () => this.a.executar('DELETE FROM pagina_seguidores WHERE pagina = :id AND uid = :uid', { id, uid: obj.autor }) }
    }
    if (segue) throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.pagina' })
    if (this.contar('FROM pagina_seguidores WHERE uid = :uid', { uid: obj.autor }) >= ESTRUTURA.paginasSeguidas) {
      throw new ErroDoProtocolo('limite_de_estrutura', { detalhe: `O limite é de ${ESTRUTURA.paginasSeguidas} páginas seguidas.` })
    }
    return {
      ctx: id,
      depois: ({ agora }) => {
        this.a.executar('INSERT INTO pagina_seguidores (pagina, uid, em) VALUES (:id, :uid, :agora)', { id, uid: obj.autor, agora })
        // O seguidor só é revelado ao dono se o grafo dele for público.
        const seguidor = this.a.rover(obj.autor)
        if (seguidor && this.rele._politicaDe(seguidor).grafo === 'publico') this.avisar(p.dono, 'novo-seguidor', { origem: obj.autor, pagina: id }, agora)
      }
    }
  }

  r_pagina_gestao(obj, agora) {
    const { pagina: id, alvo, acao } = obj.corpo
    const p = this._paginaParaAdministrar(id, obj.autor, true)
    const ehAdmin = this.a.um('SELECT 1 AS n FROM pagina_admins WHERE pagina = :id AND uid = :alvo', { id, alvo }) !== null
    if (acao === 'adicionar-admin') {
      this.exigirRover(alvo, agora)
      this.exigirSemBloqueio(obj.autor, alvo)
      if (ehAdmin) throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.alvo' })
      if (this.contar('FROM pagina_admins WHERE pagina = :id', { id }) >= ESTRUTURA.administradoresPorPagina) {
        throw new ErroDoProtocolo('limite_de_estrutura', { detalhe: `O limite é de ${ESTRUTURA.administradoresPorPagina} administradores.` })
      }
      return { ctx: id, depois: ({ agora: t }) => this.a.executar('INSERT INTO pagina_admins (pagina, uid, desde) VALUES (:id, :alvo, :t)', { id, alvo, t }) }
    }
    if (!ehAdmin || alvo === p.dono) throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.alvo' })
    return { ctx: id, depois: () => this.a.executar('DELETE FROM pagina_admins WHERE pagina = :id AND uid = :alvo', { id, alvo }) }
  }
}

