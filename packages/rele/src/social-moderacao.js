// SPDX-License-Identifier: AGPL-3.0-or-later
// Moderação da 0.3: remoção por quem é responsável por um espaço, registro público, apelação e a saída de um rover da rede.
// Regra de ouro: NENHUMA contagem de denúncias esconde ou remove conteúdo. Só uma pessoa com papel decide.
import { ErroDoProtocolo, TEMPOS, canonicalizar } from '../../protocolo/src/index.js'
import { Escrita } from './social-escrita.js'

export class Moderacao extends Escrita {
  /** Uma linha do registro. Remoção em mural de perfil não entra (`escopo: 'perfil'` é só do dono do mural). */
  registrarModeracao({ em, escopo, contexto, acao, alvoTipo, alvo, autorDoAlvo, motivo, papel, por }) {
    return Number(this.a.executar(
      `INSERT INTO remocoes (em, escopo, contexto, acao, alvo_tipo, alvo, autor_do_alvo, motivo, papel, por)
       VALUES (:em, :escopo, :contexto, :acao, :alvoTipo, :alvo, :autorDoAlvo, :motivo, :papel, :por)`,
      { em, escopo, contexto, acao, alvoTipo, alvo, autorDoAlvo, motivo, papel, por }
    ).lastInsertRowid)
  }

  // ====================================================================================================
  // REMOÇÃO POR RESPONSÁVEL
  // ====================================================================================================

  r_remocao_por_responsavel(obj) {
    const alvo = this.a.objeto(obj.corpo.alvo)
    if (!alvo || alvo.removido_em !== null) throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.alvo' })
    const sem = () => new ErroDoProtocolo('sem_permissao', { campo: 'objeto.corpo.alvo' })
    let escopo
    let contexto
    let papel
    switch (alvo.tipo) {
      case 'recado':
      case 'depoimento':
        if (alvo.alvo !== obj.autor) throw sem()
        escopo = 'perfil'
        contexto = null
        papel = 'dono'
        break
      case 'topico':
      case 'resposta-forum': {
        const comId = this.comunidadeDoCtx(alvo.ctx)
        const r = this.exigirPapel(comId, obj.autor, 'moderador', 'objeto.corpo.alvo')
        if (r.papel === 'moderador' && alvo.autor === r.com.dono) throw sem()
        escopo = 'comunidade'
        contexto = r.com.id
        papel = r.papel
        break
      }
      case 'pagina-publicar': {
        const p = this.pagina(alvo.ctx)
        if (!p || p.dono !== obj.autor || alvo.autor === obj.autor) throw sem()
        escopo = 'pagina'
        contexto = p.id
        papel = 'dono'
        break
      }
      default:
        throw sem()
    }
    if (alvo.oculto_em !== null) throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.alvo' })
    return {
      ctx: contexto,
      alvo: alvo.id,
      depois: ({ agora }) => {
        this.ocultar(alvo, obj.autor, agora)
        if (escopo !== 'perfil') {
          this.registrarModeracao({
            em: agora, escopo, contexto, acao: 'remocao', alvoTipo: alvo.tipo, alvo: alvo.id, autorDoAlvo: alvo.autor, motivo: obj.corpo.motivo, papel, por: obj.autor
          })
        }
        this.avisar(alvo.autor, 'removido-por-responsavel', { origem: null, objeto: alvo.id, comunidade: escopo === 'comunidade' ? contexto : null, pagina: escopo === 'pagina' ? contexto : null }, agora)
      }
    }
  }

  /** Esconde: o conteúdo some das leituras e da busca, mas o envelope fica retido para a apelação. */
  ocultar(linha, por, agora) {
    this.a.executar('UPDATE objetos SET oculto_em = :agora, oculto_por = :por WHERE id = :id', { id: linha.id, agora, por })
    this.limparDerivados(linha)
  }

  /** Desfaz `ocultar` (apelação revertida). O envelope precisa ainda estar retido. */
  restaurar(linha) {
    if (linha.envelope === null) return false
    this.a.executar('UPDATE objetos SET oculto_em = NULL, oculto_por = NULL WHERE id = :id', { id: linha.id })
    const corpo = JSON.parse(linha.envelope).objeto.corpo
    if (linha.tipo === 'topico') {
      const t = this.topico(linha.id)
      const tags = this.tagsDe(JSON.parse(t.tags), t.titulo, t.texto)
      this.indexar('topico', t.id, t.comunidade, t.titulo, `${t.texto} ${tags.join(' ')}`)
      this.registrarTags(t.id, t.autor, t.comunidade, tags, linha.criado_em)
    }
    if (linha.tipo === 'pagina-publicar') this.registrarTags(linha.id, linha.autor, null, this.tagsDe(corpo.tags, corpo.texto, corpo.titulo ?? ''), linha.criado_em)
    return true
  }

  /** Apaga as cópias de leitura de um conteúdo que saiu do ar (índice de busca e tags). */
  limparDerivados(linha) {
    switch (linha.tipo) {
      case 'topico':
        this.desindexar('topico', linha.id)
        this.apagarTags(linha.id)
        break
      case 'pagina-publicar':
      case 'postagem':
      case 'entrega':
        this.apagarTags(linha.id)
        break
      default:
    }
  }

  /** Efeitos da `remocao-pelo-autor` sobre o estado derivado (o relé grava a remoção do objeto em si). */
  aoRemoverPeloAutor(linha, agora) {
    this.limparDerivados(linha)
    if (linha.tipo === 'topico') this.a.executar("UPDATE topicos SET titulo = '', texto = '', tags = '[]', enquete = NULL WHERE id = :id", { id: linha.id })
    // se a resposta apagada era a que resolveu, o "resolveu" cai (para qualquer outro tipo a condição não casa com nada)
    this.a.executar('UPDATE topicos SET resolvido_resposta = NULL, resolvido_por = NULL, resolvido_em = NULL WHERE resolvido_resposta = :id', { id: linha.id })
    if (linha.tipo === 'pagina-criar') this.encerrarPagina(linha.id, linha.autor, agora)
  }

  encerrarPagina(id, por, agora) {
    this.a.executar('UPDATE paginas SET encerrada_em = :agora WHERE id = :id', { id, agora })
    this.desindexar('pagina', id)
    this.a.executar("UPDATE objetos SET oculto_em = :agora, oculto_por = :por WHERE ctx = :id AND oculto_em IS NULL AND removido_em IS NULL", { id, agora, por })
    this.a.executar("DELETE FROM tags_uso WHERE objeto IN (SELECT id FROM objetos WHERE ctx = :id AND tipo = 'pagina-publicar')", { id })
    this.a.executar('DELETE FROM pagina_seguidores WHERE pagina = :id', { id })
  }

  // ====================================================================================================
  // APELAÇÃO
  // ====================================================================================================

  r_apelacao(obj, agora) {
    const { tipo, alvo } = obj.corpo
    let registro
    let decisor
    let contexto
    if (tipo === 'remocao') {
      const linha = this.a.objeto(alvo)
      const escondido = linha && (linha.oculto_em !== null || this.a.bloqueado('objeto', alvo))
      if (!linha || linha.autor !== obj.autor || !escondido) throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.alvo' })
      registro = this.a.um("SELECT * FROM remocoes WHERE alvo = :alvo AND acao = 'remocao' ORDER BY id DESC LIMIT 1", { alvo })
      // sem registro: foi a remoção de um mural de perfil (ou o encerramento de um espaço), que não tem apelação
      if (!registro) throw new ErroDoProtocolo('sem_permissao', { campo: 'objeto.corpo.alvo' })
      contexto = registro.contexto
      decisor = registro.papel === 'moderador' ? 'dono' : 'rele'
    } else {
      const b = this.a.um('SELECT * FROM banidos WHERE comunidade = :c AND uid = :uid', { c: alvo, uid: obj.autor })
      if (!b || !this.a.um('SELECT 1 AS n FROM comunidades WHERE id = :c AND encerrada_em IS NULL', { c: alvo })) throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.alvo' })
      registro = this.a.um("SELECT * FROM remocoes WHERE alvo = :uid AND contexto = :c AND acao = 'banimento' ORDER BY id DESC LIMIT 1", { uid: obj.autor, c: alvo })
      if (!registro) throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.alvo' })
      contexto = alvo
      decisor = b.papel_de_quem_baniu === 'moderador' ? 'dono' : 'rele'
    }
    if (registro.apelacao_id !== null) throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.alvo' })
    if (agora > registro.em + TEMPOS.janelaDeApelacaoS) throw new ErroDoProtocolo('fora_da_janela', { campo: 'objeto.corpo.alvo' })
    return {
      ctx: contexto,
      alvo,
      depois: ({ agora: t }) => {
        this.a.executar(
          `INSERT INTO apelacoes (id, tipo, alvo, contexto, autor, decisor, envelope, em, estado, remocao_id)
           VALUES (:id, :tipo, :alvo, :contexto, :autor, :decisor, :envelope, :t, 'aberta', :remocao)`,
          { id: obj.id, tipo, alvo, contexto, autor: obj.autor, decisor, envelope: canonicalizar({ objeto: obj }), t, remocao: registro.id }
        )
        this.a.executar("UPDATE remocoes SET apelacao_id = :id, apelacao_estado = 'aberta' WHERE id = :remocao", { id: obj.id, remocao: registro.id })
        if (tipo === 'banimento') this.a.executar("UPDATE banidos SET apelacao = 'aberta' WHERE comunidade = :c AND uid = :uid", { c: alvo, uid: obj.autor })
        if (decisor === 'dono' && contexto) {
          const com = this.a.um('SELECT dono FROM comunidades WHERE id = :c', { c: contexto })
          if (com) this.avisar(com.dono, 'apelacao-recebida', { origem: obj.autor, objeto: obj.id, comunidade: contexto }, t)
        }
      }
    }
  }

  r_apelacao_decisao(obj) {
    const ap = this.a.um('SELECT * FROM apelacoes WHERE id = :id', { id: obj.corpo.apelacao })
    if (!ap) throw new ErroDoProtocolo('nao_encontrado', { campo: 'objeto.corpo.apelacao' })
    const com = ap.contexto ? this.a.um('SELECT dono FROM comunidades WHERE id = :c AND encerrada_em IS NULL', { c: ap.contexto }) : null
    if (ap.decisor !== 'dono' || !com || com.dono !== obj.autor) throw new ErroDoProtocolo('sem_permissao', { campo: 'objeto.corpo.apelacao' })
    if (ap.estado !== 'aberta') throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.apelacao' })
    return { ctx: ap.contexto, depois: ({ agora }) => this.decidirApelacao(ap, obj.corpo.resultado, agora) }
  }

  /** Aplica a decisão (do dono por objeto, ou da administração por rota). */
  decidirApelacao(ap, resultado, agora) {
    this.a.executar('UPDATE apelacoes SET estado = :resultado, decidida_em = :agora WHERE id = :id', { id: ap.id, resultado, agora })
    this.a.executar('UPDATE remocoes SET apelacao_estado = :resultado WHERE apelacao_id = :id', { id: ap.id, resultado })
    if (ap.tipo === 'banimento') {
      if (resultado === 'revertida') this.a.executar('DELETE FROM banidos WHERE comunidade = :c AND uid = :uid', { c: ap.contexto, uid: ap.autor })
      else this.a.executar("UPDATE banidos SET apelacao = 'mantida' WHERE comunidade = :c AND uid = :uid", { c: ap.contexto, uid: ap.autor })
    } else if (resultado === 'revertida') {
      const linha = this.a.objeto(ap.alvo)
      if (linha) this.restaurar(linha)
      // remoção do próprio relé: reverter é desbloquear o objeto
      this.a.executar("DELETE FROM bloqueios WHERE tipo = 'objeto' AND alvo = :alvo", { alvo: ap.alvo })
    }
    this.avisar(ap.autor, 'apelacao-decidida', { origem: null, objeto: ap.id, comunidade: ap.contexto }, agora)
  }

  /** Decisão da administração do relé, para a apelação cujo decisor é `rele`. */
  decidirApelacaoDoRele(id, resultado) {
    const ap = this.a.um('SELECT * FROM apelacoes WHERE id = :id', { id })
    if (!ap || ap.decisor !== 'rele') throw new ErroDoProtocolo('nao_encontrado')
    if (ap.estado !== 'aberta') throw new ErroDoProtocolo('ja_existe')
    this.a.transacao(() => this.decidirApelacao(ap, resultado, this.agora()))
  }

  // ====================================================================================================
  // SAIR DA REDE
  // ====================================================================================================

  /**
   * Remover o perfil é sair. Além do que o relé já apaga, tudo o que era relação some, e a posse do que o rover era dono passa
   * adiante (comunidade: moderador mais antigo, depois membro mais antigo; página: administrador mais antigo). Sem herdeiro,
   * o espaço se encerra.
   */
  sairDaRede(uid, agora) {
    for (const t of this.a.todos('SELECT * FROM topicos WHERE autor = :uid', { uid })) {
      this.desindexar('topico', t.id)
      this.a.executar("UPDATE topicos SET titulo = '', texto = '', tags = '[]', enquete = NULL WHERE id = :id", { id: t.id })
    }
    this.desindexar('rover', uid)
    this.a.executar('DELETE FROM tags_uso WHERE autor = :uid', { uid })
    this.a.executar('DELETE FROM amizades WHERE de = :uid OR para = :uid', { uid })
    this.a.executar('DELETE FROM relacoes WHERE autor = :uid OR alvo = :uid', { uid })
    this.a.executar('DELETE FROM votos WHERE uid = :uid', { uid })
    this.a.executar('DELETE FROM pagina_seguidores WHERE uid = :uid', { uid })
    this.a.executar('DELETE FROM notificacoes WHERE dest = :uid', { uid })
    this.a.executar('UPDATE notificacoes SET origem = NULL WHERE origem = :uid', { uid })
    this.a.executar('DELETE FROM convites WHERE uid = :uid OR por = :uid', { uid })
    this.a.executar('DELETE FROM pedidos_de_entrada WHERE uid = :uid', { uid })
    this.a.executar('DELETE FROM banidos WHERE uid = :uid', { uid })
    for (const c of this.a.todos('SELECT id FROM comunidades WHERE dono = :uid AND encerrada_em IS NULL', { uid })) {
      const herdeiro = this.a.um(
        "SELECT uid FROM membros WHERE comunidade = :c AND uid <> :uid ORDER BY CASE papel WHEN 'moderador' THEN 0 ELSE 1 END, desde, uid LIMIT 1",
        { c: c.id, uid }
      )
      if (!herdeiro) { this.encerrarComunidade(c.id, uid, agora); continue }
      this.a.executar("UPDATE membros SET papel = 'dono' WHERE comunidade = :c AND uid = :h", { c: c.id, h: herdeiro.uid })
      this.a.executar('UPDATE comunidades SET dono = :h WHERE id = :c', { c: c.id, h: herdeiro.uid })
      this.avisar(herdeiro.uid, 'posse-recebida', { origem: null, comunidade: c.id }, agora)
    }
    this.a.executar('DELETE FROM membros WHERE uid = :uid', { uid })
    for (const p of this.a.todos('SELECT id FROM paginas WHERE dono = :uid AND encerrada_em IS NULL', { uid })) {
      const herdeiro = this.a.um('SELECT uid FROM pagina_admins WHERE pagina = :p AND uid <> :uid ORDER BY desde, uid LIMIT 1', { p: p.id, uid })
      if (!herdeiro) { this.encerrarPagina(p.id, uid, agora); continue }
      this.a.executar('UPDATE paginas SET dono = :h WHERE id = :p', { p: p.id, h: herdeiro.uid })
    }
    this.a.executar('DELETE FROM pagina_admins WHERE uid = :uid', { uid })
  }

  // ====================================================================================================
  // RETENÇÃO
  // ====================================================================================================

  /** O que passou do prazo some: envelope retido de conteúdo oculto, texto de apelação, o autor das ações do registro. */
  limparModeracao(agora) {
    const corte = agora - TEMPOS.retencaoDeRemovidoS
    this.a.executar('UPDATE objetos SET envelope = NULL WHERE oculto_em IS NOT NULL AND oculto_em < :corte AND envelope IS NOT NULL', { corte })
    this.a.executar('UPDATE apelacoes SET envelope = NULL WHERE em < :corte AND envelope IS NOT NULL', { corte })
    this.a.executar('UPDATE remocoes SET por = NULL WHERE em < :corte AND por IS NOT NULL', { corte })
    this.limparNotificacoes(agora)
  }
}
