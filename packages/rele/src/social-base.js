// SPDX-License-Identifier: AGPL-3.0-or-later
// Base da camada social do relé 0.3: quem é visível, quem é amigo, quem bloqueou quem, qual o papel numa comunidade e o que um
// leitor pode ler. Toda rota de leitura e toda regra de escrita passam por estas funções, de propósito: uma regra de visibilidade
// só existe num lugar (ver docs/API-REDE-SOCIAL.md, seção 9).
import { ErroDoProtocolo, STATUS_PADRAO } from '../../protocolo/src/index.js'

/** Os papéis numa comunidade, do menor para o maior. */
export const PAPEIS = Object.freeze(['membro', 'moderador', 'dono'])
/** Tipos que são AÇÃO, não conteúdo: o relé guarda só o id e o envelope é descartado. */
export const TIPOS_DE_ACAO = Object.freeze([
  'estado', 'amizade', 'selo', 'relacao', 'voto', 'comunidade-adesao', 'comunidade-gestao', 'denuncia-dispensar', 'comunidade-vocabulario', 'comunidade-posse', 'topico-gestao', 'topico-marca',
  'topico-resolvido', 'depoimento-decisao', 'pagina-seguir', 'pagina-gestao', 'remocao-por-responsavel', 'apelacao', 'apelacao-decisao'
])

export const parDe = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export class Base {
  /** @param {import('./rele.js').Rele} rele */
  constructor(rele) {
    this.rele = rele
    this.a = rele.armazem
  }

  agora() { return this.rele.relogio() }

  // ---------- rovers ----------

  /** A linha do rover se ele é visível (atestado vigente, emissor confiável, não bloqueado, não saiu). */
  roverVisivel(uid, agora) { return this.rele._roverVisivel(uid, agora) }

  /** Cartão curto de um rover para as respostas. Quem saiu da rede vira um cartão sem handle e sem nome. */
  resumo(uid) {
    const r = this.a.rover(uid)
    if (!r || r.saiu) return { uid, handle: null, nome: null, retrato: null }
    return { uid, handle: r.handle, nome: r.nome, retrato: r.retrato ? JSON.parse(r.retrato) : null }
  }

  idadeDaConta(uid, agora) {
    const r = this.a.rover(uid)
    return r ? Math.max(0, agora - r.criado_em) : 0
  }

  /** O alvo de uma ação precisa ser um rover visível. */
  exigirRover(uid, agora, campo = 'objeto.corpo.alvo') {
    const r = this.roverVisivel(uid, agora)
    if (!r) throw new ErroDoProtocolo('alvo_desconhecido', { campo })
    return r
  }

  // ---------- relações entre dois rovers ----------

  /** Existe bloqueio de um dos lados? */
  bloqueioEntre(x, y) {
    return this.a.um("SELECT 1 AS n FROM relacoes WHERE tipo = 'bloqueio' AND ((autor = :x AND alvo = :y) OR (autor = :y AND alvo = :x))", { x, y }) !== null
  }

  euBloqueei(autor, alvo) { return this.a.um("SELECT 1 AS n FROM relacoes WHERE tipo = 'bloqueio' AND autor = :autor AND alvo = :alvo", { autor, alvo }) !== null }
  euSilenciei(autor, alvo) { return this.a.um("SELECT 1 AS n FROM relacoes WHERE tipo = 'silencio' AND autor = :autor AND alvo = :alvo", { autor, alvo }) !== null }

  exigirSemBloqueio(x, y, campo = 'objeto.corpo.alvo') {
    if (this.bloqueioEntre(x, y)) throw new ErroDoProtocolo('interacao_nao_permitida', { campo })
  }

  amizade(x, y) { return this.a.um('SELECT * FROM amizades WHERE par = :par', { par: parDe(x, y) }) }

  /** A amizade ativa entre os dois, ou null. */
  amizadeAtiva(x, y) {
    const l = this.amizade(x, y)
    return l?.estado === 'ativa' ? l : null
  }

  // ---------- comunidades ----------

  /** A comunidade, se existe, não foi encerrada nem bloqueada pelo operador. Não olha quem pergunta. */
  comunidade(id) {
    if (typeof id !== 'string') return null
    const c = this.a.um('SELECT * FROM comunidades WHERE id = :id', { id })
    if (!c || c.encerrada_em !== null || this.a.bloqueado('objeto', id)) return null
    return c
  }

  /**
   * 0.3.2 (proposta 0007): o vocabulário vigente de uma comunidade. As etiquetas são as que ela definiu (nenhuma, se nunca definiu);
   * os status são os que ela definiu, ou os três do protocolo quando não definiu nenhum (`padrao: true`).
   */
  vocabularioDe(com) {
    const v = com.vocabulario ? JSON.parse(com.vocabulario) : null
    const definidos = v && v.status.length > 0 ? v.status : null
    return { etiquetas: v ? v.etiquetas : [], status: definidos ?? STATUS_PADRAO.map((s) => ({ ...s })), padrao: definidos === null }
  }

  /** Um status vale para um tópico quando existe no vocabulário e, se ele é de certas categorias, o tópico é de uma delas. */
  statusValeParaTopico(vocab, chave, categoria) {
    const s = vocab.status.find((x) => x.chave === chave)
    return s !== undefined && (s.categorias === null || (categoria !== null && s.categorias.includes(categoria)))
  }

  papel(comunidade, uid) {
    return this.a.um('SELECT papel FROM membros WHERE comunidade = :comunidade AND uid = :uid', { comunidade, uid: uid ?? null })?.papel ?? null
  }

  banido(comunidade, uid) {
    return this.a.um('SELECT 1 AS n FROM banidos WHERE comunidade = :comunidade AND uid = :uid', { comunidade, uid }) !== null
  }

  convidado(comunidade, uid) {
    return this.a.um('SELECT 1 AS n FROM convites WHERE comunidade = :comunidade AND uid = :uid', { comunidade, uid: uid ?? null }) !== null
  }

  /** Quem pode LER o fórum e o cartão: `fechada` só os membros; as outras, qualquer um. */
  podeLerComunidade(com, leitor) {
    return com.acesso !== 'fechada' || this.papel(com.id, leitor) !== null
  }

  /** A comunidade que contém um espaço (a própria comunidade ou um tópico), ou null se o espaço não é de comunidade. */
  comunidadeDoCtx(ctx) {
    const c = this.a.um('SELECT id FROM comunidades WHERE id = :ctx', { ctx: ctx ?? null })
    if (c) return c.id
    return this.a.um('SELECT comunidade FROM topicos WHERE id = :ctx', { ctx: ctx ?? null })?.comunidade ?? null
  }

  /**
   * O papel que o autor precisa ter numa comunidade para agir. Quem não pode nem ler a comunidade recebe `nao_encontrado`
   * (ela não existe para essa pessoa); quem lê mas não participa, `nao_e_membro`; o banido, `banido`.
   * @returns {{ com: object, papel: string }}
   */
  exigirPapel(comunidadeId, autor, minimo = 'membro', campo = 'objeto.corpo.comunidade') {
    const com = this.comunidade(comunidadeId)
    if (!com) throw new ErroDoProtocolo('nao_encontrado', { campo })
    const papel = this.papel(com.id, autor)
    if (!papel) {
      if (com.acesso === 'fechada') throw new ErroDoProtocolo('nao_encontrado', { campo })
      throw new ErroDoProtocolo(this.banido(com.id, autor) ? 'banido' : 'nao_e_membro', { campo })
    }
    if (PAPEIS.indexOf(papel) < PAPEIS.indexOf(minimo)) throw new ErroDoProtocolo('sem_permissao', { campo })
    return { com, papel }
  }

  /** Dono e até 20 moderadores, para avisar de pedidos de entrada e apelações. */
  responsaveis(comunidade) {
    return this.a.todos("SELECT uid FROM membros WHERE comunidade = :comunidade AND papel IN ('dono', 'moderador') ORDER BY CASE papel WHEN 'dono' THEN 0 ELSE 1 END, desde, uid LIMIT 21", { comunidade }).map((l) => l.uid)
  }

  // ---------- tópicos e páginas ----------

  topico(id) { return typeof id === 'string' ? this.a.um('SELECT * FROM topicos WHERE id = :id', { id }) : null }

  pagina(id) {
    if (typeof id !== 'string') return null
    const p = this.a.um('SELECT * FROM paginas WHERE id = :id', { id })
    if (!p || p.encerrada_em !== null || this.a.bloqueado('objeto', id)) return null
    return p
  }

  papelNaPagina(pagina, uid) {
    const quem = uid ?? null
    const p = this.a.um('SELECT dono FROM paginas WHERE id = :pagina', { pagina })
    if (p?.dono === quem) return 'dono'
    return this.a.um('SELECT 1 AS n FROM pagina_admins WHERE pagina = :pagina AND uid = :uid', { pagina, uid: quem }) ? 'administrador' : null
  }

  // ---------- o que um leitor pode ler ----------

  /**
   * Um tópico que o leitor pode abrir. `nao_encontrado` quando a comunidade é fechada para ele, o autor não é visível ou o
   * operador bloqueou; `removido` (410) quando foi apagado ou escondido e o leitor poderia ler a comunidade.
   * @returns {{ t: object, com: object, obj: object }}
   */
  topicoLegivel(id, leitor, agora) {
    const t = this.topico(id)
    const obj = t ? this.a.objeto(id) : null
    const com = t ? this.comunidade(t.comunidade) : null
    if (!t || !com || !this.podeLerComunidade(com, leitor) || this.a.bloqueado('objeto', id) || !this.roverVisivel(t.autor, agora)) {
      throw new ErroDoProtocolo('nao_encontrado')
    }
    if (obj.removido_em !== null || obj.oculto_em !== null) throw new ErroDoProtocolo('removido')
    return { t, com, obj }
  }

  /**
   * O espaço (comunidade, tópico ou página) que contém um objeto está aberto a este leitor? `true` para o que não vive em espaço.
   * Não diferencia apagado de inexistente: serve de filtro para listas.
   */
  espacoLegivel(linha, leitor) {
    const ctx = linha.ctx
    const comId = this.comunidadeDoCtx(ctx)
    if (comId) {
      const com = this.comunidade(comId)
      if (!com || !this.podeLerComunidade(com, leitor)) return false
      if (ctx !== comId) {
        const o = this.a.objeto(ctx)
        if (!o || o.removido_em !== null || o.oculto_em !== null || this.a.bloqueado('objeto', ctx)) return false
      }
      return true
    }
    if (linha.tipo === 'pagina-publicar' || linha.tipo === 'pagina-atualizar') return this.pagina(ctx) !== null
    return true
  }

  // ---------- consultas prontas ----------

  contar(sql, params = {}) { return this.a.um(`SELECT COUNT(*) AS n ${sql}`, params).n }

  paramsDeVisibilidade(agora) { return this.rele._paramsDeVisibilidade(agora) }
}
