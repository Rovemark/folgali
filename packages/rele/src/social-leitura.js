// SPDX-License-Identifier: AGPL-3.0-or-later
// Leitura da camada social (0.3): a página do rover, amizade, comunidades, fórum, páginas, moderação pública, notificações.
// Cada método diz quem pode ler. A regra é única: o que o leitor não pode ver responde `nao_encontrado`, igual ao que não existe.
import {
  CHAVE_DE_VOCABULARIO_RE, ErroDoProtocolo, PAGINA_PADRAO, SELOS, UID_RE, ID_RE, grafoMostraContagens, grafoMostraListas
} from '../../protocolo/src/index.js'
import { GRAFO_PUBLICO, ROVER_VISIVEL } from './armazem.js'
import { TIPOS_DE_ACAO } from './social-base.js'
import { Busca, janelaDe } from './social-busca.js'
import { ehPorPessoas, ordemInvalida, paramsDePontos, pontosSql } from './social-pontos.js'

const TRECHO = 200
const trecho = (s) => { const c = [...s]; return c.length > TRECHO ? `${c.slice(0, TRECHO).join('')}…` : s }
const SEM_AUTOR_BLOQUEADO = `NOT EXISTS (SELECT 1 FROM relacoes bq WHERE bq.tipo = 'bloqueio' AND bq.autor = :dono AND bq.alvo = o.autor)`

export class Leitura extends Busca {
  // ---------- quem lê ----------

  /** O rover que assina a leitura (ou null se não veio credencial). Credencial presente e inválida é 401. */
  leitor(credencial, agora) { return this.rele._leitor(credencial, agora) }

  /** Rotas "próprias": o caminho é do rover e só ele lê, provando com a chave de rede. */
  exigirPropria(uid, credencial, agora) {
    if (!UID_RE.test(uid) || !this.roverVisivel(uid, agora)) {
      this.rele._recusarLeituraDeRevogado(credencial, agora) // o próprio rover revogado, com credencial válida, sabe o porquê
      throw new ErroDoProtocolo('nao_encontrado')
    }
    const l = this.leitor(credencial, agora)
    if (l === null) throw new ErroDoProtocolo('leitura_nao_autorizada')
    if (l !== uid) throw new ErroDoProtocolo('sem_permissao')
    return l
  }

  /** O rover do caminho, visível, e o grafo dele aberto ao leitor (o próprio rover sempre lê). Devolve também o leitor. */
  roverComGrafo(uid, credencial, agora) {
    const r = UID_RE.test(uid) ? this.roverVisivel(uid, agora) : null
    if (!r) throw new ErroDoProtocolo('nao_encontrado')
    const leitor = this.leitor(credencial, agora)
    if (!grafoMostraListas(this.rele._politicaDe(r).grafo) && leitor !== r.uid) throw new ErroDoProtocolo('grafo_privado')
    return { r, leitor }
  }

  roverPublico(uid, agora) {
    const r = UID_RE.test(uid) ? this.roverVisivel(uid, agora) : null
    if (!r) throw new ErroDoProtocolo('nao_encontrado')
    return r
  }

  lista(sql, params, limite, mapa, chave = 'seq') {
    const linhas = this.a.todos(sql, { ...params, limite: limite + 1 })
    const pagina = linhas.slice(0, limite)
    return { itens: pagina.map(mapa), proximo: linhas.length > limite ? pagina[pagina.length - 1][chave] : null }
  }

  /** Lista com cursor de deslocamento (ordens que não têm um número crescente natural). */
  listaPorDeslocamento(sql, params, antes, limite, mapa) {
    const desloc = antes ?? 0
    const linhas = this.a.todos(`${sql} LIMIT :limite OFFSET :desloc`, { ...params, limite: limite + 1, desloc })
    return { itens: linhas.slice(0, limite).map(mapa), proximo: linhas.length > limite ? desloc + limite : null }
  }

  // ====================================================================================================
  // CARTÕES
  // ====================================================================================================

  versaoAtual(versaoId) {
    const l = this.a.objeto(versaoId)
    return l?.envelope ? JSON.parse(l.envelope) : null
  }

  cartaoDeComunidade(c) {
    return {
      id: c.id,
      nome: c.nome,
      descricao: c.descricao,
      tema: c.tema,
      acesso: c.acesso,
      membros: this.contar('FROM membros WHERE comunidade = :id', { id: c.id }),
      topicos: this.contar("FROM topicos t JOIN objetos o ON o.id = t.id WHERE t.comunidade = :id AND o.removido_em IS NULL AND o.oculto_em IS NULL", { id: c.id }),
      criadaEm: c.criada_em,
      atividadeEm: c.atividade_em,
      categorias: JSON.parse(c.categorias)
    }
  }

  cartaoDeTopico(t) {
    const respostas = this.contar("FROM objetos WHERE tipo = 'resposta-forum' AND ctx = :id AND removido_em IS NULL AND oculto_em IS NULL", { id: t.id })
    return {
      id: t.id,
      comunidade: t.comunidade,
      categoria: t.categoria,
      titulo: t.titulo,
      trecho: trecho(t.texto),
      autor: this.resumo(t.autor),
      criadoEm: t.criado_em,
      atividadeEm: t.atividade_em,
      respostas,
      fixado: t.fixado === 1,
      trancado: t.trancado === 1,
      resolvido: t.resolvido_resposta !== null,
      tags: JSON.parse(t.tags),
      enquete: t.enquete !== null,
      editado: t.versoes > 1,
      // 0.3.2: só quando o tópico tem marca, para o cartão de um tópico sem marca ser idêntico ao da 0.3.1
      ...this.marcasDe(t)
    }
  }

  /** `{ marcas: { etiquetas, status } }` quando o tópico tem marca, ou nada (as chaves; o rótulo e a cor vêm do vocabulário da comunidade). */
  marcasDe(t) {
    const etiquetas = t.etiquetas ? JSON.parse(t.etiquetas) : []
    const status = t.status ?? null
    return etiquetas.length > 0 || status !== null ? { marcas: { etiquetas, status } } : {}
  }

  cartaoDePagina(p) {
    return {
      id: p.id,
      nome: p.nome,
      descricao: p.descricao,
      tema: p.tema,
      dono: this.resumo(p.dono),
      seguidores: this.contar(`FROM pagina_seguidores s JOIN rovers r ON r.uid = s.uid WHERE s.pagina = :id AND ${ROVER_VISIVEL} AND ${GRAFO_PUBLICO}`, { id: p.id, ...this.paramsDeVisibilidade(this.agora()) }),
      criadaEm: p.criada_em,
      atividadeEm: p.atividade_em
    }
  }

  // ====================================================================================================
  // PÁGINA DO ROVER
  // ====================================================================================================

  contagemDeSelos(uid, agora) {
    const linhas = this.a.todos(
      `SELECT o.sub AS selo, COUNT(DISTINCT o.autor) AS n FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.tipo = 'selo' AND o.alvo = :uid AND o.removido_em IS NULL AND ${ROVER_VISIVEL}
         AND EXISTS (SELECT 1 FROM amizades am WHERE am.estado = 'ativa' AND am.par = CASE WHEN o.autor < o.alvo THEN o.autor || '|' || o.alvo ELSE o.alvo || '|' || o.autor END)
         AND NOT EXISTS (SELECT 1 FROM relacoes b WHERE b.tipo = 'bloqueio' AND ((b.autor = o.autor AND b.alvo = o.alvo) OR (b.autor = o.alvo AND b.alvo = o.autor)))
       GROUP BY o.sub`,
      { uid, ...this.paramsDeVisibilidade(agora) }
    )
    const mapa = Object.fromEntries(SELOS.map((s) => [s, 0]))
    for (const l of linhas) if (l.selo in mapa) mapa[l.selo] = l.n
    return mapa
  }

  /** Amigos que aparecem em lista: visíveis e de grafo público (o próprio rover vê todos os dele). */
  _amigosSql(propria) {
    return `FROM amizades am JOIN rovers r ON r.uid = CASE WHEN am.de = :uid THEN am.para ELSE am.de END
      WHERE am.estado = 'ativa' AND (am.de = :uid OR am.para = :uid) AND ${ROVER_VISIVEL}${propria ? '' : ` AND ${GRAFO_PUBLICO}`}`
  }

  _comunidadesSql(propria) {
    return `FROM membros m JOIN comunidades c ON c.id = m.comunidade
      WHERE m.uid = :uid AND c.encerrada_em IS NULL AND c.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')${propria ? '' : " AND c.acesso <> 'fechada'"}`
  }

  _paginasSql() {
    return `FROM paginas pg WHERE pg.encerrada_em IS NULL AND pg.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
      AND (pg.id IN (SELECT pagina FROM pagina_seguidores WHERE uid = :uid) OR pg.id IN (SELECT pagina FROM pagina_admins WHERE uid = :uid))`
  }

  // ====================================================================================================
  // 0.3.1: AJUDANTES (proposta 0006)
  // ====================================================================================================

  /** O tópico a que um objeto (que existe) leva: o próprio tópico, ou o tópico de uma resposta de fórum. `null` para o resto. */
  topicoDoAlvo(linha) {
    if (linha.tipo === 'topico') return linha.id
    if (linha.tipo === 'resposta-forum') return linha.ctx
    return null
  }

  /** Reações vivas a um objeto, de quem é visível. Nunca a lista de quem reagiu. */
  reacoesDe(id, agora) {
    const mapa = { curtir: 0, util: 0 }
    for (const l of this.a.todos(
      `SELECT json_extract(o.envelope, '$.objeto.corpo.reacao') AS k, COUNT(*) AS n FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.tipo = 'reacao' AND o.alvo = :id AND o.removido_em IS NULL AND ${ROVER_VISIVEL} GROUP BY k`,
      { id, ...this.paramsDeVisibilidade(agora) }
    )) if (l.k in mapa) mapa[l.k] = l.n
    return mapa
  }

  /** A reação do leitor a um objeto (`null` sem leitor ou sem reação). */
  minhaReacao(id, leitor) {
    if (leitor === null || leitor === undefined) return null
    const l = this.a.um(
      "SELECT json_extract(envelope, '$.objeto.corpo.reacao') AS k FROM objetos WHERE tipo = 'reacao' AND autor = :autor AND alvo = :id AND removido_em IS NULL",
      { autor: leitor, id }
    )
    return l?.k ?? null
  }

  /** Respostas vivas a uma postagem ou a uma resposta, de quem é visível. */
  respostasA(id, agora) {
    return this.contar(
      `FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.tipo = 'resposta' AND o.alvo = :id AND o.removido_em IS NULL AND o.oculto_em IS NULL
         AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto') AND ${ROVER_VISIVEL}`,
      { id, ...this.paramsDeVisibilidade(agora) }
    )
  }

  /** O item da lista "completa" (proposta 0006, seção 15.4): o envelope com autor, página, contagens e a reação do leitor. */
  itemCompleto(linha, leitor, agora) {
    const env = JSON.parse(linha.envelope)
    const pagina = linha.tipo === 'pagina-publicar' ? this.a.um('SELECT id, nome FROM paginas WHERE id = :id', { id: linha.ctx }) : null
    return {
      tipo: linha.tipo,
      envelope: env,
      autor: this.resumo(linha.autor),
      pagina: pagina ? { id: pagina.id, nome: pagina.nome } : null,
      contagens: { respostas: linha.tipo === 'postagem' ? this.respostasA(linha.id, agora) : 0, reacoes: this.reacoesDe(linha.id, agora) },
      minhaReacao: this.minhaReacao(linha.id, leitor),
      // 0.5.0: `imagens` só com a mídia ligada e só quando a postagem tem anexo no ar
      ...(this.rele.midia ? this.rele.midia.extraDoItem(linha, agora) : {})
    }
  }

  paginaDoRover(uid, { credencial = null } = {}) {
    this.rele._sincronizar()
    const agora = this.agora()
    const r = UID_RE.test(uid) ? this.roverVisivel(uid, agora) : null
    if (!r) throw new ErroDoProtocolo('nao_encontrado')
    const leitor = this.leitor(credencial, agora)
    const grafo = this.rele._politicaDe(r).grafo
    const propria = leitor === r.uid
    const contaveis = propria || grafoMostraContagens(grafo)
    const p = { uid }
    const conta = (sql, params = p) => (contaveis ? this.contar(sql, params) : null)
    const pendente = leitor === null ? null : this.amizade(leitor, uid)
    const seguir = contaveis ? this.rele._contagemDeSeguir(uid, agora) : { seguindo: null, seguidores: null }
    return {
      rover: this.rele.perfil(uid),
      selos: this.contagemDeSelos(uid, agora),
      contagens: {
        amigos: conta(this._amigosSql(propria), { uid, ...this.paramsDeVisibilidade(agora) }),
        comunidades: conta(this._comunidadesSql(propria)),
        paginas: conta(this._paginasSql()),
        seguidores: seguir.seguidores,
        seguindo: seguir.seguindo,
        recados: this.contar(`FROM objetos o JOIN rovers r ON r.uid = o.autor WHERE o.tipo = 'recado' AND o.alvo = :dono AND o.removido_em IS NULL AND o.oculto_em IS NULL AND ${ROVER_VISIVEL} AND ${SEM_AUTOR_BLOQUEADO}`, { dono: uid, ...this.paramsDeVisibilidade(agora) }),
        depoimentos: this.contar("FROM objetos WHERE tipo = 'depoimento' AND alvo = :uid AND estado = 'aceito' AND removido_em IS NULL AND oculto_em IS NULL", p),
        entregas: this.contar("FROM objetos WHERE tipo = 'entrega' AND autor = :uid AND removido_em IS NULL", p)
      },
      voce: leitor === null ? null : {
        amigo: pendente?.estado === 'ativa',
        pedidoEnviado: pendente?.estado === 'pendente' && pendente.de === leitor,
        pedidoRecebido: pendente?.estado === 'pendente' && pendente.para === leitor,
        euBloqueei: this.euBloqueei(leitor, uid),
        euSilenciei: this.euSilenciei(leitor, uid),
        papel: propria ? 'proprio' : null,
        amigoDesde: pendente?.estado === 'ativa' ? pendente.atualizado_em : null,
        contaDesde: this.a.rover(leitor).criado_em,
        selosQueDei: this.a.todos("SELECT sub FROM objetos WHERE tipo = 'selo' AND autor = :autor AND alvo = :alvo AND removido_em IS NULL ORDER BY seq", { autor: leitor, alvo: uid }).map((l) => l.sub)
      }
    }
  }

  recados(uid, { antes = null, limite = PAGINA_PADRAO }) {
    this.rele._sincronizar()
    const agora = this.agora()
    this.roverPublico(uid, agora)
    return this.lista(
      `SELECT o.seq, o.envelope, o.autor FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.tipo = 'recado' AND o.alvo = :dono AND o.removido_em IS NULL AND o.oculto_em IS NULL AND ${ROVER_VISIVEL} AND ${SEM_AUTOR_BLOQUEADO}
         AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto') AND (:antes IS NULL OR o.seq < :antes)
       ORDER BY o.seq DESC LIMIT :limite`,
      { dono: uid, antes, ...this.paramsDeVisibilidade(agora) }, limite, (l) => ({ envelope: JSON.parse(l.envelope), autor: this.resumo(l.autor) })
    )
  }

  depoimentos(uid, { antes = null, limite = PAGINA_PADRAO, estado = 'aceitos', credencial = null }) {
    this.rele._sincronizar()
    const agora = this.agora()
    if (!['aceitos', 'pendentes', 'enviados'].includes(estado)) throw new ErroDoProtocolo('esquema', { campo: 'estado', detalhe: 'Parâmetro estado: aceitos, pendentes ou enviados.' })
    if (estado === 'pendentes' || estado === 'enviados') this.exigirPropria(uid, credencial, agora)
    else this.roverPublico(uid, agora)
    this.leitor(credencial, agora)
    if (estado === 'enviados') {
      // 0.3.1: o autor lê o que escreveu e ainda espera decisão (o destinatário precisa continuar visível e sem bloqueio entre os dois).
      return this.lista(
        `SELECT o.seq, o.envelope, o.alvo, o.estado FROM objetos o JOIN rovers r ON r.uid = o.alvo
         WHERE o.tipo = 'depoimento' AND o.autor = :uid AND o.estado = 'pendente' AND o.removido_em IS NULL AND o.oculto_em IS NULL
           AND ${ROVER_VISIVEL} AND NOT EXISTS (SELECT 1 FROM relacoes b WHERE b.tipo = 'bloqueio' AND ((b.autor = o.autor AND b.alvo = o.alvo) OR (b.autor = o.alvo AND b.alvo = o.autor)))
           AND (:antes IS NULL OR o.seq < :antes)
         ORDER BY o.seq DESC LIMIT :limite`,
        { uid, antes, ...this.paramsDeVisibilidade(agora) }, limite, (l) => ({ envelope: JSON.parse(l.envelope), alvo: this.resumo(l.alvo), estado: l.estado })
      )
    }
    return this.lista(
      `SELECT o.seq, o.envelope, o.autor, o.estado, o.estado_em FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.tipo = 'depoimento' AND o.alvo = :dono AND o.estado = :estado AND o.removido_em IS NULL AND o.oculto_em IS NULL
         AND ${ROVER_VISIVEL} AND ${SEM_AUTOR_BLOQUEADO} AND (:antes IS NULL OR o.seq < :antes)
       ORDER BY o.seq DESC LIMIT :limite`,
      { dono: uid, antes, estado: estado === 'aceitos' ? 'aceito' : 'pendente', ...this.paramsDeVisibilidade(agora) }, limite,
      (l) => ({ envelope: JSON.parse(l.envelope), autor: this.resumo(l.autor), estado: l.estado, ...(l.estado === 'aceito' ? { aceitoEm: l.estado_em } : {}) })
    )
  }

  selos(uid) {
    this.rele._sincronizar()
    const agora = this.agora()
    this.roverPublico(uid, agora)
    return { selos: this.contagemDeSelos(uid, agora) }
  }

  entregas(uid, { antes = null, limite = PAGINA_PADRAO }) {
    this.rele._sincronizar()
    const agora = this.agora()
    this.roverPublico(uid, agora)
    return this.lista(
      `SELECT o.seq, o.envelope FROM objetos o WHERE o.tipo = 'entrega' AND o.autor = :uid AND o.removido_em IS NULL AND o.oculto_em IS NULL
         AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto') AND (:antes IS NULL OR o.seq < :antes)
       ORDER BY o.seq DESC LIMIT :limite`,
      { uid, antes }, limite, (l) => JSON.parse(l.envelope)
    )
  }

  amigos(uid, { antes = null, limite = PAGINA_PADRAO, credencial = null }) {
    this.rele._sincronizar()
    const agora = this.agora()
    const { r, leitor } = this.roverComGrafo(uid, credencial, agora)
    return this.lista(
      `SELECT am.rowid AS seq, r.uid AS amigo, am.atualizado_em AS desde ${this._amigosSql(leitor === r.uid)} AND (:antes IS NULL OR am.rowid < :antes) ORDER BY am.rowid DESC LIMIT :limite`,
      { uid, antes, ...this.paramsDeVisibilidade(agora) }, limite, (l) => ({ rover: this.resumo(l.amigo), desde: l.desde })
    )
  }

  amigosEmComum(uid, com, { antes = null, limite = PAGINA_PADRAO, credencial = null }) {
    this.rele._sincronizar()
    const agora = this.agora()
    if (!UID_RE.test(com ?? '') || com === uid) throw new ErroDoProtocolo('esquema', { campo: 'com', detalhe: 'Parâmetro com: informe o uid de outro rover.' })
    const a = this.roverPublico(uid, agora)
    const b = this.roverPublico(com, agora)
    const leitor = this.leitor(credencial, agora)
    // Cada ponta mostra as arestas dela só se o grafo é público, ou se quem lê é ela mesma.
    for (const ponta of [a, b]) if (leitor !== ponta.uid && !grafoMostraListas(this.rele._politicaDe(ponta).grafo)) throw new ErroDoProtocolo('grafo_privado')
    return this.lista(
      `SELECT am.rowid AS seq, r.uid AS amigo
       FROM amizades am JOIN rovers r ON r.uid = CASE WHEN am.de = :uid THEN am.para ELSE am.de END
       WHERE am.estado = 'ativa' AND (am.de = :uid OR am.para = :uid) AND ${ROVER_VISIVEL}
         AND (r.uid = :leitor OR (${GRAFO_PUBLICO}))
         AND EXISTS (SELECT 1 FROM amizades bm WHERE bm.estado = 'ativa' AND bm.par = CASE WHEN r.uid < :com THEN r.uid || '|' || :com ELSE :com || '|' || r.uid END)
         AND (:antes IS NULL OR am.rowid < :antes)
       ORDER BY am.rowid DESC LIMIT :limite`,
      { uid, com, leitor: leitor ?? '', antes, ...this.paramsDeVisibilidade(agora) }, limite, (l) => this.resumo(l.amigo)
    )
  }

  comunidadesDoRover(uid, { antes = null, limite = PAGINA_PADRAO, credencial = null }) {
    this.rele._sincronizar()
    const agora = this.agora()
    const { r, leitor } = this.roverComGrafo(uid, credencial, agora)
    return this.lista(
      `SELECT c.seq AS seq, c.*, m.papel AS papel_no ${this._comunidadesSql(leitor === r.uid)} AND (:antes IS NULL OR c.seq < :antes) ORDER BY c.seq DESC LIMIT :limite`,
      { uid, antes }, limite, (l) => ({ comunidade: this.cartaoDeComunidade(l), papel: l.papel_no })
    )
  }

  paginasDoRover(uid, { antes = null, limite = PAGINA_PADRAO, credencial = null }) {
    this.rele._sincronizar()
    const agora = this.agora()
    this.roverComGrafo(uid, credencial, agora)
    return this.lista(
      `SELECT pg.seq AS seq, pg.* ${this._paginasSql()} AND (:antes IS NULL OR pg.seq < :antes) ORDER BY pg.seq DESC LIMIT :limite`,
      { uid, antes }, limite,
      (l) => ({ pagina: this.cartaoDePagina(l), relacao: l.dono === uid ? 'dono' : this.papelNaPagina(l.id, uid) ?? 'seguidor' })
    )
  }

  amizadesPendentes(uid, credencial) {
    this.rele._sincronizar()
    const agora = this.agora()
    this.exigirPropria(uid, credencial, agora)
    const mapa = (campo) => (l) => ({ rover: this.resumo(l[campo]), em: l.criado_em })
    return {
      recebidos: this.a.todos("SELECT de, criado_em FROM amizades WHERE estado = 'pendente' AND para = :uid ORDER BY criado_em DESC LIMIT 100", { uid }).map(mapa('de')),
      enviados: this.a.todos("SELECT para, criado_em FROM amizades WHERE estado = 'pendente' AND de = :uid ORDER BY criado_em DESC LIMIT 50", { uid }).map(mapa('para'))
    }
  }

  convitesDoRover(uid, credencial) {
    this.rele._sincronizar()
    const agora = this.agora()
    this.exigirPropria(uid, credencial, agora)
    const linhas = this.a.todos('SELECT * FROM convites WHERE uid = :uid ORDER BY em DESC LIMIT 50', { uid })
    return {
      itens: linhas.flatMap((cv) => {
        const c = this.comunidade(cv.comunidade)
        return c ? [{ comunidade: { id: c.id, nome: c.nome, descricao: c.descricao, acesso: c.acesso }, por: this.resumo(cv.por), em: cv.em }] : []
      }),
      proximo: null
    }
  }

  relacoes(uid, { antes = null, limite = PAGINA_PADRAO, credencial = null }) {
    this.rele._sincronizar()
    this.exigirPropria(uid, credencial, this.agora())
    return this.lista(
      'SELECT rowid AS seq, alvo, tipo, em FROM relacoes WHERE autor = :uid AND (:antes IS NULL OR rowid < :antes) ORDER BY rowid DESC LIMIT :limite',
      { uid, antes }, limite, (l) => ({ rover: this.resumo(l.alvo), relacao: l.tipo, desde: l.em })
    )
  }

  notificacoesDe(uid, { antes = null, limite = PAGINA_PADRAO, credencial = null }) {
    this.rele._sincronizar()
    const agora = this.agora()
    this.exigirPropria(uid, credencial, agora)
    return this.listar(uid, { antes, limite }, agora)
  }

  contagemDeNotificacoes(uid, { desde = 0, credencial = null }) {
    this.rele._sincronizar()
    this.exigirPropria(uid, credencial, this.agora())
    return { novas: this.contagem(uid, desde) }
  }

  // ====================================================================================================
  // COMUNIDADES
  // ====================================================================================================

  /** A comunidade que o leitor abre. Fechada: só membro (o convidado lê o cartão mínimo). */
  comunidadeLegivel(id, leitor, { permitirConvite = false } = {}) {
    const c = this.comunidade(id)
    if (!c) throw new ErroDoProtocolo('nao_encontrado')
    if (this.podeLerComunidade(c, leitor)) return { c, minimo: false }
    if (permitirConvite && this.convidado(c.id, leitor)) return { c, minimo: true }
    throw new ErroDoProtocolo('nao_encontrado')
  }

  comunidadesListadas({ tema = null, acesso = null, ordem = 'recentes', antes = null, limite = PAGINA_PADRAO }) {
    this.rele._sincronizar()
    if (acesso !== null && !['aberta', 'moderada'].includes(acesso)) throw new ErroDoProtocolo('esquema', { campo: 'acesso', detalhe: 'Parâmetro acesso: aberta ou moderada.' })
    if (!['recentes', 'ativas'].includes(ordem)) throw new ErroDoProtocolo('esquema', { campo: 'ordem', detalhe: 'Parâmetro ordem: recentes ou ativas.' })
    const coluna = ordem === 'ativas' ? 'atividade_seq' : 'seq'
    return this.lista(
      `SELECT c.*, c.${coluna} AS cursor FROM comunidades c
       WHERE c.acesso <> 'fechada' AND c.encerrada_em IS NULL AND c.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
         AND (:tema IS NULL OR c.tema = :tema) AND (:acesso IS NULL OR c.acesso = :acesso) AND (:antes IS NULL OR c.${coluna} < :antes)
       ORDER BY c.${coluna} DESC LIMIT :limite`,
      { tema, acesso, antes }, limite, (c) => this.cartaoDeComunidade(c), 'cursor'
    )
  }

  comunidadeDetalhe(id, { credencial = null }) {
    this.rele._sincronizar()
    const agora = this.agora()
    const leitor = this.leitor(credencial, agora)
    const { c, minimo } = this.comunidadeLegivel(id, leitor, { permitirConvite: true })
    const papel = this.papel(c.id, leitor)
    const voce = leitor === null ? null : {
      papel,
      pedidoPendente: this.a.um('SELECT 1 AS n FROM pedidos_de_entrada WHERE comunidade = :c AND uid = :u', { c: c.id, u: leitor }) !== null,
      convidado: this.convidado(c.id, leitor),
      banido: this.banido(c.id, leitor),
      banidoEm: this.a.um('SELECT em FROM banidos WHERE comunidade = :c AND uid = :u', { c: c.id, u: leitor })?.em ?? null,
      membroDesde: this.a.um('SELECT desde FROM membros WHERE comunidade = :c AND uid = :u', { c: c.id, u: leitor })?.desde ?? null
    }
    if (minimo) return { id: c.id, nome: c.nome, descricao: c.descricao, acesso: c.acesso, voce }
    return {
      ...this.cartaoDeComunidade(c),
      regras: c.regras,
      dono: this.resumo(c.dono),
      moderadores: this.contar("FROM membros WHERE comunidade = :c AND papel = 'moderador'", { c: c.id }),
      envelope: this.versaoAtual(c.versao_id),
      voce,
      // 0.3.2: o vocabulário de etiquetas e status (o padrão do protocolo quando ela nunca definiu status)
      vocabulario: this.vocabularioDe(c)
    }
  }

  exigirModerador(id, credencial, agora) {
    const leitor = this.leitor(credencial, agora)
    const c = this.comunidade(id)
    const papel = c && leitor ? this.papel(c.id, leitor) : null
    if (!c) throw new ErroDoProtocolo('nao_encontrado')
    if (leitor === null) {
      if (c.acesso === 'fechada') throw new ErroDoProtocolo('nao_encontrado')
      throw new ErroDoProtocolo('leitura_nao_autorizada')
    }
    if (!papel) throw new ErroDoProtocolo(c.acesso === 'fechada' ? 'nao_encontrado' : 'sem_permissao')
    if (papel === 'membro') throw new ErroDoProtocolo('sem_permissao')
    return { c, leitor, papel }
  }

  membrosDa(id, { antes = null, limite = PAGINA_PADRAO, credencial = null }) {
    this.rele._sincronizar()
    const agora = this.agora()
    const leitor = this.leitor(credencial, agora)
    const { c } = this.comunidadeLegivel(id, leitor)
    const moderador = ['dono', 'moderador'].includes(this.papel(c.id, leitor))
    return this.listaPorDeslocamento(
      `SELECT m.uid AS uid, m.papel AS papel, m.desde AS desde FROM membros m JOIN rovers r ON r.uid = m.uid
       WHERE m.comunidade = :c AND ${ROVER_VISIVEL} AND (:moderador = 1 OR m.uid = :leitor OR (${GRAFO_PUBLICO}))
       ORDER BY CASE m.papel WHEN 'dono' THEN 0 WHEN 'moderador' THEN 1 ELSE 2 END, m.desde, m.uid`,
      { c: c.id, moderador: moderador ? 1 : 0, leitor: leitor ?? '', ...this.paramsDeVisibilidade(agora) }, antes, limite,
      (l) => ({ rover: this.resumo(l.uid), papel: l.papel, desde: l.desde })
    )
  }

  pedidosDe(id, { antes = null, limite = PAGINA_PADRAO, credencial = null }) {
    this.rele._sincronizar()
    const { c } = this.exigirModerador(id, credencial, this.agora())
    return this.listaPorDeslocamento('SELECT uid, em FROM pedidos_de_entrada WHERE comunidade = :c ORDER BY em, uid', { c: c.id }, antes, limite, (l) => ({ rover: this.resumo(l.uid), em: l.em }))
  }

  convitesDa(id, { antes = null, limite = PAGINA_PADRAO, credencial = null }) {
    this.rele._sincronizar()
    const { c } = this.exigirModerador(id, credencial, this.agora())
    return this.listaPorDeslocamento('SELECT uid, por, em FROM convites WHERE comunidade = :c ORDER BY em, uid', { c: c.id }, antes, limite, (l) => ({ rover: this.resumo(l.uid), por: this.resumo(l.por), em: l.em }))
  }

  banidosDa(id, { antes = null, limite = PAGINA_PADRAO, credencial = null }) {
    this.rele._sincronizar()
    const { c } = this.exigirModerador(id, credencial, this.agora())
    return this.listaPorDeslocamento(
      'SELECT uid, motivo, papel_de_quem_baniu AS por, em, apelacao FROM banidos WHERE comunidade = :c ORDER BY em DESC, uid', { c: c.id }, antes, limite,
      (l) => ({ rover: this.resumo(l.uid), motivo: l.motivo, por: l.por, em: l.em, apelacao: l.apelacao })
    )
  }

  // ====================================================================================================
  // FÓRUM
  // ====================================================================================================

  topicosDa(id, { categoria = null, tag = null, status = null, etiqueta = null, ordem = 'recentes', janela = null, antes = null, limite = PAGINA_PADRAO, credencial = null }) {
    this.rele._sincronizar()
    const agora = this.agora()
    const leitor = this.leitor(credencial, agora)
    const { c } = this.comunidadeLegivel(id, leitor)
    if (!['recentes', 'ativos', 'sem-resposta', 'melhores', 'em-alta'].includes(ordem)) throw ordemInvalida(['recentes', 'ativos', 'sem-resposta', 'melhores', 'em-alta'])
    if (tag !== null && !/^[a-z0-9][a-z0-9-]{1,23}$/.test(tag)) throw new ErroDoProtocolo('esquema', { campo: 'tag', detalhe: 'Parâmetro tag: uma tag válida.' })
    if (status !== null && !CHAVE_DE_VOCABULARIO_RE.test(status)) throw new ErroDoProtocolo('esquema', { campo: 'status', detalhe: 'Parâmetro status: uma chave do vocabulário.' })
    if (etiqueta !== null && !CHAVE_DE_VOCABULARIO_RE.test(etiqueta)) throw new ErroDoProtocolo('esquema', { campo: 'etiqueta', detalhe: 'Parâmetro etiqueta: uma chave do vocabulário.' })
    const porPessoas = ehPorPessoas(ordem)
    const duracao = ordem === 'em-alta' ? janelaDe(janela) : null
    const coluna = ordem === 'ativos' ? 'atividade_seq' : 'seq'
    const base = `FROM topicos t JOIN objetos o ON o.id = t.id JOIN rovers r ON r.uid = t.autor
      WHERE t.comunidade = :c AND o.removido_em IS NULL AND o.oculto_em IS NULL AND ${ROVER_VISIVEL}
        AND t.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
        AND (:categoria IS NULL OR (:categoria = '-' AND t.categoria IS NULL) OR t.categoria = :categoria)
        AND (:tag IS NULL OR EXISTS (SELECT 1 FROM tags_uso tu WHERE tu.objeto = t.id AND tu.tag = :tag))
        AND (:status IS NULL OR t.status = :status)
        AND (:etiqueta IS NULL OR EXISTS (SELECT 1 FROM json_each(t.etiquetas) je WHERE je.value = :etiqueta))
        ${ordem === 'sem-resposta' ? "AND NOT EXISTS (SELECT 1 FROM objetos x WHERE x.tipo = 'resposta-forum' AND x.ctx = t.id AND x.removido_em IS NULL AND x.oculto_em IS NULL)" : ''}`
    const p = { c: c.id, categoria, tag, status, etiqueta, ...this.paramsDeVisibilidade(agora) }
    let pagina
    if (porPessoas) {
      const pontos = pontosSql({ alias: 't', tipoResposta: 'resposta-forum', colunaResposta: 'ctx', janela: duracao !== null })
      pagina = this.listaPorDeslocamento(
        `SELECT t.* ${base} AND t.fixado = 0 ORDER BY ${pontos} DESC, t.atividade_seq DESC`,
        paramsDePontos(p, agora, duracao), antes, limite, (t) => this.cartaoDeTopico(t)
      )
    } else {
      pagina = this.lista(
        `SELECT t.*, t.${coluna} AS cursor ${base} AND t.fixado = 0 AND (:antes IS NULL OR t.${coluna} < :antes) ORDER BY t.${coluna} DESC LIMIT :limite`,
        { ...p, antes }, limite, (t) => this.cartaoDeTopico(t), 'cursor'
      )
    }
    if (antes === null) {
      pagina.fixados = this.a.todos(`SELECT t.* ${base} AND t.fixado = 1 ORDER BY t.seq DESC LIMIT 10`, p).map((t) => this.cartaoDeTopico(t))
    }
    return pagina
  }

  topicoDetalhe(id, { credencial = null }) {
    this.rele._sincronizar()
    const agora = this.agora()
    const leitor = this.leitor(credencial, agora)
    const { t, com } = this.topicoLegivel(id, leitor, agora)
    const enq = t.enquete ? JSON.parse(t.enquete) : null
    let enquete = null
    if (enq) {
      const votos = Object.fromEntries(this.a.todos('SELECT opcao, COUNT(*) AS n FROM votos WHERE topico = :t GROUP BY opcao', { t: t.id }).map((l) => [l.opcao, l.n]))
      const meu = leitor ? this.a.um('SELECT opcao FROM votos WHERE topico = :t AND uid = :uid', { t: t.id, uid: leitor }) : null
      enquete = {
        opcoes: enq.opcoes.map((texto, i) => ({ texto, votos: votos[i] ?? 0 })),
        encerraEm: enq.encerraEm,
        encerrada: agora >= enq.encerraEm,
        total: Object.values(votos).reduce((s, n) => s + n, 0),
        voce: meu ? meu.opcao : null
      }
    }
    const ultima = this.a.um("SELECT id FROM objetos WHERE tipo = 'topico-editar' AND ctx = :id AND removido_em IS NULL ORDER BY seq DESC LIMIT 1", { id: t.id })
    const resolvidoPor = t.resolvido_resposta ? { resposta: t.resolvido_resposta, por: this.resumo(t.resolvido_por), em: t.resolvido_em } : null
    return {
      ...this.cartaoDeTopico(t),
      texto: t.texto,
      envelope: JSON.parse(this.a.objeto(ultima?.id ?? t.id).envelope),
      comunidadeNome: com.nome,
      resolvidoPor,
      enquete,
      versoes: t.versoes,
      reacoes: this.reacoesDe(t.id, agora),
      minhaReacao: this.minhaReacao(t.id, leitor)
    }
  }

  _respostaForum(l) {
    const env = JSON.parse(l.envelope)
    const c = env.objeto.corpo
    let cita = null
    if (c.cita) {
      const citada = this.a.objeto(c.cita)
      const vivo = citada && citada.removido_em === null && citada.oculto_em === null && citada.envelope !== null
      cita = { id: c.cita, autor: this.resumo(citada?.autor ?? ''), trecho: vivo ? trecho(JSON.parse(citada.envelope).objeto.corpo.texto) : null }
    }
    const reacoes = Object.fromEntries(['curtir', 'util'].map((k) => [k, 0]))
    for (const r of this.a.todos(
      "SELECT json_extract(envelope, '$.objeto.corpo.reacao') AS k, COUNT(*) AS n FROM objetos WHERE tipo = 'reacao' AND alvo = :id AND removido_em IS NULL GROUP BY k", { id: l.id }
    )) if (r.k in reacoes) reacoes[r.k] = r.n
    const resolvido = this.a.um('SELECT 1 AS n FROM topicos WHERE id = :t AND resolvido_resposta = :id', { t: l.ctx, id: l.id }) !== null
    return {
      id: l.id,
      envelope: env,
      autor: this.resumo(l.autor),
      criadoEm: l.criado_em,
      em: c.em,
      cita,
      filhas: this.contar("FROM objetos WHERE tipo = 'resposta-forum' AND alvo = :id AND removido_em IS NULL AND oculto_em IS NULL", { id: l.id }),
      resolveu: resolvido,
      reacoes
    }
  }

  respostasDo(id, { em = null, antes = null, limite = PAGINA_PADRAO, credencial = null, ordem = 'antigas', janela = null }) {
    this.rele._sincronizar()
    const agora = this.agora()
    const leitor = this.leitor(credencial, agora)
    const aceitas = ['antigas', 'recentes', 'melhores', 'em-alta']
    if (!aceitas.includes(ordem)) throw ordemInvalida(aceitas)
    const { t } = this.topicoLegivel(id, leitor, agora)
    let paiId = t.id
    if (em !== null) {
      const pai = ID_RE.test(em) ? this.a.objeto(em) : null
      if (!pai || pai.tipo !== 'resposta-forum' || pai.ctx !== t.id || pai.alvo !== t.id) throw new ErroDoProtocolo('nao_encontrado')
      if (pai.removido_em !== null || pai.oculto_em !== null) throw new ErroDoProtocolo('removido')
      paiId = pai.id
    }
    const visiveis = `FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.tipo = 'resposta-forum' AND o.ctx = :t AND o.alvo = :pai AND o.removido_em IS NULL AND o.oculto_em IS NULL AND ${ROVER_VISIVEL}
         AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')`
    if (ehPorPessoas(ordem)) {
      const duracao = ordem === 'em-alta' ? janelaDe(janela) : null
      const pontos = pontosSql({ alias: 'o', tipoResposta: 'resposta-forum', colunaResposta: 'alvo', janela: duracao !== null })
      return this.listaPorDeslocamento(
        `SELECT o.* ${visiveis} ORDER BY ${pontos} DESC, o.seq DESC`,
        paramsDePontos({ t: t.id, pai: paiId, ...this.paramsDeVisibilidade(agora) }, agora, duracao), antes, limite, (l) => this._respostaForum(l)
      )
    }
    return this.lista(
      `SELECT o.* ${visiveis} AND (:antes IS NULL OR o.seq ${ordem === 'recentes' ? '<' : '>'} :antes)
       ORDER BY o.seq ${ordem === 'recentes' ? 'DESC' : 'ASC'} LIMIT :limite`,
      { t: t.id, pai: paiId, antes, ...this.paramsDeVisibilidade(agora) }, limite, (l) => this._respostaForum(l)
    )
  }

  historicoDo(id, { credencial = null }) {
    this.rele._sincronizar()
    const agora = this.agora()
    const { t } = this.topicoLegivel(id, this.leitor(credencial, agora), agora)
    const edicoes = this.a.todos("SELECT envelope, criado_em FROM objetos WHERE tipo = 'topico-editar' AND ctx = :id AND removido_em IS NULL AND envelope IS NOT NULL ORDER BY seq", { id: t.id })
    const original = this.a.objeto(t.id)
    const todas = [{ envelope: original.envelope, criado_em: original.criado_em }, ...edicoes]
    return { itens: todas.map((l, i) => ({ versao: i + 1, envelope: JSON.parse(l.envelope), criadoEm: l.criado_em })) }
  }

  // ====================================================================================================
  // PÁGINAS
  // ====================================================================================================

  paginasListadas({ tema = null, ordem = 'recentes', antes = null, limite = PAGINA_PADRAO }) {
    this.rele._sincronizar()
    if (!['recentes', 'ativas'].includes(ordem)) throw new ErroDoProtocolo('esquema', { campo: 'ordem', detalhe: 'Parâmetro ordem: recentes ou ativas.' })
    const coluna = ordem === 'ativas' ? 'atividade_seq' : 'seq'
    return this.lista(
      `SELECT pg.*, pg.${coluna} AS cursor FROM paginas pg
       WHERE pg.encerrada_em IS NULL AND pg.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
         AND (:tema IS NULL OR pg.tema = :tema) AND (:antes IS NULL OR pg.${coluna} < :antes)
       ORDER BY pg.${coluna} DESC LIMIT :limite`,
      { tema, antes }, limite, (p) => this.cartaoDePagina(p), 'cursor'
    )
  }

  _paginaLegivel(id) {
    const p = this.pagina(id)
    if (!p) throw new ErroDoProtocolo('nao_encontrado')
    return p
  }

  paginaDetalhe(id, { credencial = null }) {
    this.rele._sincronizar()
    const agora = this.agora()
    const leitor = this.leitor(credencial, agora)
    const p = this._paginaLegivel(id)
    return {
      ...this.cartaoDePagina(p),
      administradores: this.a.todos('SELECT uid FROM pagina_admins WHERE pagina = :id ORDER BY desde, uid', { id: p.id }).map((l) => this.resumo(l.uid)),
      envelope: this.versaoAtual(p.versao_id),
      voce: leitor === null ? null : {
        segue: this.a.um('SELECT 1 AS n FROM pagina_seguidores WHERE pagina = :id AND uid = :uid', { id: p.id, uid: leitor }) !== null,
        papel: this.papelNaPagina(p.id, leitor)
      }
    }
  }

  atualizacoesDa(id, { antes = null, limite = PAGINA_PADRAO, completo = false, credencial = null }) {
    this.rele._sincronizar()
    const p = this._paginaLegivel(id)
    const agora = this.agora()
    const leitor = completo ? this.leitor(credencial, agora) : null
    return this.lista(
      `SELECT o.seq, o.id, o.tipo, o.autor, o.ctx, o.envelope FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.tipo = 'pagina-publicar' AND o.ctx = :id AND o.removido_em IS NULL AND o.oculto_em IS NULL AND ${ROVER_VISIVEL}
         AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto') AND (:antes IS NULL OR o.seq < :antes)
       ORDER BY o.seq DESC LIMIT :limite`,
      { id: p.id, antes, ...this.paramsDeVisibilidade(agora) }, limite, (l) => (completo ? this.itemCompleto(l, leitor, agora) : JSON.parse(l.envelope))
    )
  }

  /** 0.3.1: os temas das páginas abertas, do mais usado para o menos (a tela de filtro não precisa mais adivinhar). */
  temasDePaginas() {
    this.rele._sincronizar()
    const itens = this.a.todos(
      `SELECT pg.tema AS tema, COUNT(*) AS paginas FROM paginas pg
       WHERE pg.encerrada_em IS NULL AND pg.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
       GROUP BY pg.tema ORDER BY paginas DESC, pg.tema ASC LIMIT 100`
    ).map((l) => ({ tema: l.tema, paginas: l.paginas }))
    return { itens }
  }

  /**
   * 0.3.1: o que a moderação removeu de dentro do que o próprio rover escreveu (só ele lê). O envelope vem enquanto o relé o retém,
   * para o autor ver o que apelar; depois da retenção vem `null`.
   */
  removidosDe(uid, { antes = null, limite = PAGINA_PADRAO, credencial = null }) {
    this.rele._sincronizar()
    const agora = this.agora()
    this.exigirPropria(uid, credencial, agora)
    return this.lista(
      `SELECT * FROM remocoes WHERE autor_do_alvo = :uid AND acao = 'remocao' AND (:antes IS NULL OR id < :antes) ORDER BY id DESC LIMIT :limite`,
      { uid, antes }, limite,
      (l) => {
        const o = this.a.objeto(l.alvo)
        return {
          id: l.id, em: l.em, escopo: l.escopo, contexto: l.contexto, alvoTipo: l.alvo_tipo, alvo: l.alvo, motivo: l.motivo, por: l.papel,
          apelacao: l.apelacao_estado, envelope: o?.envelope ? JSON.parse(o.envelope) : null
        }
      }, 'id'
    )
  }

  /** Uma postagem que o leitor pode ver: autor visível, não removida, não escondida, não bloqueada pelo operador. */
  _postagemLegivel(id, agora) {
    const l = ID_RE.test(id) ? this.a.objeto(id) : null
    if (!l || l.tipo !== 'postagem' || this.a.bloqueado('objeto', id) || !this.roverVisivel(l.autor, agora)) throw new ErroDoProtocolo('nao_encontrado')
    if (l.removido_em !== null || l.oculto_em !== null) throw new ErroDoProtocolo('removido')
    return l
  }

  /** 0.3.1: a postagem com as contagens e a reação do leitor (a 0.3 só tinha o envelope e nenhuma contagem). */
  postagemDetalhe(id, { credencial = null }) {
    this.rele._sincronizar()
    const agora = this.agora()
    const leitor = this.leitor(credencial, agora)
    const l = this._postagemLegivel(id, agora)
    const { tipo, pagina, ...resto } = this.itemCompleto(l, leitor, agora)
    return resto
  }

  /** 0.3.1: as respostas a uma postagem, com autor, contagens e a reação do leitor. */
  respostasDaPostagem(id, { antes = null, limite = PAGINA_PADRAO, ordem = 'recentes', janela = null, credencial = null }) {
    this.rele._sincronizar()
    const agora = this.agora()
    const leitor = this.leitor(credencial, agora)
    const aceitas = ['recentes', 'antigas', 'melhores', 'em-alta']
    if (!aceitas.includes(ordem)) throw ordemInvalida(aceitas)
    const post = this._postagemLegivel(id, agora)
    const mapa = (l) => {
      const item = this.itemCompleto(l, leitor, agora)
      return { envelope: item.envelope, autor: item.autor, contagens: { respostas: this.respostasA(l.id, agora), reacoes: item.contagens.reacoes }, minhaReacao: item.minhaReacao }
    }
    const visiveis = `FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.tipo = 'resposta' AND o.alvo = :post AND o.removido_em IS NULL AND o.oculto_em IS NULL AND ${ROVER_VISIVEL}
         AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')`
    if (ehPorPessoas(ordem)) {
      const duracao = ordem === 'em-alta' ? janelaDe(janela) : null
      const pontos = pontosSql({ alias: 'o', tipoResposta: 'resposta', colunaResposta: 'alvo', janela: duracao !== null })
      return this.listaPorDeslocamento(
        `SELECT o.seq, o.id, o.tipo, o.autor, o.ctx, o.envelope ${visiveis} ORDER BY ${pontos} DESC, o.seq DESC`,
        paramsDePontos({ post: post.id, ...this.paramsDeVisibilidade(agora) }, agora, duracao), antes, limite, mapa
      )
    }
    return this.lista(
      `SELECT o.seq, o.id, o.tipo, o.autor, o.ctx, o.envelope ${visiveis}
         AND (:antes IS NULL OR o.seq ${ordem === 'recentes' ? '<' : '>'} :antes)
       ORDER BY o.seq ${ordem === 'recentes' ? 'DESC' : 'ASC'} LIMIT :limite`,
      { post: post.id, antes, ...this.paramsDeVisibilidade(agora) }, limite, mapa
    )
  }

  seguidoresDa(id, { antes = null, limite = PAGINA_PADRAO }) {
    this.rele._sincronizar()
    const p = this._paginaLegivel(id)
    return this.lista(
      `SELECT s.rowid AS seq, s.uid FROM pagina_seguidores s JOIN rovers r ON r.uid = s.uid
       WHERE s.pagina = :id AND ${ROVER_VISIVEL} AND ${GRAFO_PUBLICO} AND (:antes IS NULL OR s.rowid < :antes)
       ORDER BY s.rowid DESC LIMIT :limite`,
      { id: p.id, antes, ...this.paramsDeVisibilidade(this.agora()) }, limite, (l) => this.resumo(l.uid)
    )
  }

  // ====================================================================================================
  // MODERAÇÃO
  // ====================================================================================================

  _registro(filtro, params, { antes = null, limite = PAGINA_PADRAO }) {
    return this.lista(
      `SELECT * FROM remocoes WHERE ${filtro} AND (:antes IS NULL OR id < :antes) ORDER BY id DESC LIMIT :limite`,
      { ...params, antes }, limite,
      (l) => ({
        id: l.id,
        em: l.em,
        escopo: l.escopo,
        contexto: l.contexto,
        acao: l.acao,
        alvoTipo: l.alvo_tipo,
        alvo: l.acao === 'remocao' || l.acao === 'dispensa' ? l.alvo : this.resumo(l.alvo),
        motivo: l.motivo,
        por: l.papel,
        apelacao: l.apelacao_estado
      }), 'id'
    )
  }

  registroDaComunidade(id, { antes = null, limite = PAGINA_PADRAO, credencial = null }) {
    this.rele._sincronizar()
    const leitor = this.leitor(credencial, this.agora())
    const { c } = this.comunidadeLegivel(id, leitor)
    return this._registro("escopo = 'comunidade' AND contexto = :c", { c: c.id }, { antes, limite })
  }

  registroDaPagina(id, { antes = null, limite = PAGINA_PADRAO }) {
    this.rele._sincronizar()
    const p = this._paginaLegivel(id)
    return this._registro("escopo = 'pagina' AND contexto = :c", { c: p.id }, { antes, limite })
  }

  registroDoRele({ antes = null, limite = PAGINA_PADRAO }) {
    this.rele._sincronizar()
    return this._registro("escopo = 'rele'", {}, { antes, limite })
  }

  filaDaComunidade(id, { credencial = null }) {
    this.rele._sincronizar()
    const { c, papel } = this.exigirModerador(id, credencial, this.agora())
    const grupos = this.a.todos(
      `SELECT d.alvo AS alvo, COUNT(DISTINCT d.pseudonimo) AS total, SUM(d.forte) AS peso, MIN(d.criado_em) AS primeira, MAX(d.criado_em) AS ultima
       FROM denuncias d JOIN objetos o ON o.id = d.alvo AND o.removido_em IS NULL AND o.oculto_em IS NULL
       WHERE d.comunidade = :c AND d.dispensada_em IS NULL GROUP BY d.alvo ORDER BY peso DESC, ultima DESC LIMIT 50`, { c: c.id }
    )
    const denuncias = grupos.map((g) => ({
      alvo: g.alvo,
      alvoTipo: this.a.objeto(g.alvo).tipo,
      topico: this.topicoDoAlvo(this.a.objeto(g.alvo)),
      motivos: Object.fromEntries(this.a.todos('SELECT motivo, COUNT(*) AS n FROM denuncias WHERE alvo = :alvo AND comunidade = :c AND dispensada_em IS NULL GROUP BY motivo', { alvo: g.alvo, c: c.id }).map((m) => [m.motivo, m.n])),
      total: g.total,
      primeiraEm: g.primeira,
      ultimaEm: g.ultima,
      peso: g.peso
    }))
    const apelacoes = papel !== 'dono' ? [] : this.a.todos("SELECT * FROM apelacoes WHERE contexto = :c AND estado = 'aberta' AND decisor = 'dono' ORDER BY em LIMIT 50", { c: c.id }).map((ap) => this._apelacao(ap))
    return { denuncias, apelacoes }
  }

  _apelacao(ap) {
    const alvo = ap.tipo === 'remocao' ? this.a.objeto(ap.alvo) : null
    return {
      id: ap.id,
      tipo: ap.tipo,
      alvo: ap.alvo,
      autor: this.resumo(ap.autor),
      texto: ap.envelope ? JSON.parse(ap.envelope).objeto.corpo.texto : null,
      em: ap.em,
      envelope: alvo?.envelope ? JSON.parse(alvo.envelope) : null
    }
  }

  apelacoesDoRele({ limite = PAGINA_PADRAO }) {
    return { itens: this.a.todos("SELECT * FROM apelacoes WHERE decisor = 'rele' AND estado = 'aberta' ORDER BY em LIMIT :limite", { limite }).map((ap) => ({ ...this._apelacao(ap), origem: 'rele' })), proximo: null }
  }

  // ====================================================================================================
  // OBJETO POR ID
  // ====================================================================================================

  /**
   * Os tipos sociais de AÇÃO respondem 404 (o relé não guarda o envelope). O resto obedece à visibilidade do espaço onde vive.
   * @returns {object | null} o envelope, ou null quando não cabe a esta camada decidir
   */
  objetoSocial(linha, leitor) {
    if (TIPOS_DE_ACAO.includes(linha.tipo)) throw new ErroDoProtocolo('nao_encontrado')
    if (linha.tipo === 'depoimento' && linha.estado !== 'aceito' && leitor !== linha.autor && leitor !== linha.alvo) throw new ErroDoProtocolo('nao_encontrado')
    if (!this.espacoLegivel(linha, leitor)) throw new ErroDoProtocolo('nao_encontrado')
    return null
  }
}

