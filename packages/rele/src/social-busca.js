// SPDX-License-Identifier: AGPL-3.0-or-later
// Busca e descoberta da 0.3. Nada aqui lê o histórico de leitura de ninguém (o relé não o guarda): a busca é texto, o "em alta" conta
// pessoas distintas, as sugestões partem só dos interesses DECLARADOS e as tendências exigem pelo menos 3 autores distintos.
// Toda consulta passa pela mesma regra de visibilidade das rotas de leitura: comunidade fechada não existe para quem não é membro.
import { ErroDoProtocolo, PAGINA_PADRAO, TEMPOS, TOPICO_RE } from '../../protocolo/src/index.js'
import { ROVER_VISIVEL } from './armazem.js'
import { Moderacao } from './social-moderacao.js'
import { ehPorPessoas, ordemInvalida, paramsDePontos, pontosSql } from './social-pontos.js'

const JANELAS = { '24h': 86400, '7d': 7 * 86400 }
const MAX_PALAVRAS = 8
const MAX_PALAVRA = 30
const ATE = 20

/** A expressão FTS5 para um texto livre: palavras entre aspas (nada de operadores), a última por prefixo. */
export function montarConsulta(q) {
  if (typeof q !== 'string' || [...q].length < 2 || [...q].length > 100) {
    throw new ErroDoProtocolo('esquema', { campo: 'q', detalhe: 'Parâmetro q: de 2 a 100 caracteres.' })
  }
  const palavras = (q.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, MAX_PALAVRAS).map((p) => [...p].slice(0, MAX_PALAVRA).join(''))
  if (!palavras.length) throw new ErroDoProtocolo('esquema', { campo: 'q', detalhe: 'Parâmetro q: precisa ter letras ou números.' })
  return palavras.map((p, i) => (i === palavras.length - 1 ? `"${p}"*` : `"${p}"`)).join(' ')
}

export const janelaDe = (valor) => {
  const j = valor ?? '24h'
  if (!(j in JANELAS)) throw new ErroDoProtocolo('esquema', { campo: 'janela', detalhe: 'Parâmetro janela: 24h ou 7d.' })
  return JANELAS[j]
}

export class Busca extends Moderacao {
  /** Fragmento: a comunidade `c` está aberta ao leitor `:leitor` (listada, ou fechada e ele é membro). */
  static get COMUNIDADE_LEGIVEL() {
    return `c.encerrada_em IS NULL AND c.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
      AND (c.acesso <> 'fechada' OR EXISTS (SELECT 1 FROM membros mm WHERE mm.comunidade = c.id AND mm.uid = :leitor))`
  }

  // ---------- busca ----------

  buscar({ q, tipo = 'todos', antes = null, limite = PAGINA_PADRAO, leitor = null, ordem = 'relevancia', janela = null }, agora) {
    const consulta = montarConsulta(q)
    if (!['todos', 'rovers', 'comunidades', 'topicos', 'paginas'].includes(tipo)) throw new ErroDoProtocolo('esquema', { campo: 'tipo', detalhe: 'Parâmetro tipo: rovers, comunidades, topicos, paginas ou todos.' })
    // 0.3.2: `ordem` só vale para tópicos; em outro tipo ela é erro (nunca ignorada em silêncio). O padrão é a relevância, como na 0.3.1.
    const ordens = ['relevancia', 'recentes', 'melhores', 'em-alta']
    if (!ordens.includes(ordem)) throw ordemInvalida(ordens)
    if (ordem !== 'relevancia' && tipo !== 'topicos') throw new ErroDoProtocolo('esquema', { campo: 'ordem', detalhe: 'Parâmetro ordem: só vale com tipo=topicos.' })
    if (tipo === 'todos') {
      return Object.fromEntries(['rovers', 'comunidades', 'topicos', 'paginas'].map((t) => [t, this._buscaDe(t, consulta, 0, 5, leitor, agora).itens]))
    }
    return this._buscaDe(tipo, consulta, antes ?? 0, limite, leitor, agora, ordem, ordem === 'em-alta' ? janelaDe(janela) : null)
  }

  _buscaDe(tipo, consulta, deslocamento, limite, leitor, agora, ordem = 'relevancia', duracao = null) {
    const base = { m: consulta, limite: limite + 1, desloc: deslocamento }
    const comLeitor = { ...base, leitor: leitor ?? '' }
    const comVisibilidade = { ...base, ...this.paramsDeVisibilidade(agora) }
    const linhas = {
      rovers: () => this.a.todos(
        `SELECT r.uid AS ref, r.descricao AS descricao FROM busca b JOIN rovers r ON r.uid = b.ref
         WHERE busca MATCH :m AND b.tipo = 'rover' AND r.listado = 1 AND r.perfil_id IS NOT NULL AND ${ROVER_VISIVEL}
         ORDER BY bm25(busca, 0, 0, 0, 5.0, 1.0), r.uid LIMIT :limite OFFSET :desloc`, comVisibilidade
      ).map((l) => ({ ...this.resumo(l.ref), descricao: l.descricao })),
      comunidades: () => this.a.todos(
        `SELECT c.* FROM busca b JOIN comunidades c ON c.id = b.ref
         WHERE busca MATCH :m AND b.tipo = 'comunidade' AND c.acesso <> 'fechada' AND ${Busca.COMUNIDADE_LEGIVEL}
         ORDER BY bm25(busca, 0, 0, 0, 5.0, 1.0), c.id LIMIT :limite OFFSET :desloc`, comLeitor
      ).map((c) => this.cartaoDeComunidade(c)),
      topicos: () => this.a.todos(
        `SELECT t.* FROM busca b JOIN topicos t ON t.id = b.ref
         JOIN comunidades c ON c.id = t.comunidade
         JOIN objetos o ON o.id = t.id AND o.removido_em IS NULL AND o.oculto_em IS NULL
         JOIN rovers r ON r.uid = t.autor
         WHERE busca MATCH :m AND b.tipo = 'topico' AND ${Busca.COMUNIDADE_LEGIVEL} AND ${ROVER_VISIVEL}
           AND t.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
         ORDER BY ${this._ordemDaBuscaDeTopicos(ordem, duracao)} LIMIT :limite OFFSET :desloc`,
        ehPorPessoas(ordem) ? paramsDePontos({ ...comLeitor, ...comVisibilidade }, agora, duracao) : { ...comLeitor, ...comVisibilidade }
      ).map((t) => ({ ...this.cartaoDeTopico(t), comunidadeNome: this.a.um('SELECT nome FROM comunidades WHERE id = :id', { id: t.comunidade }).nome })),
      paginas: () => this.a.todos(
        `SELECT pg.* FROM busca b JOIN paginas pg ON pg.id = b.ref
         WHERE busca MATCH :m AND b.tipo = 'pagina' AND pg.encerrada_em IS NULL AND pg.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
         ORDER BY bm25(busca, 0, 0, 0, 5.0, 1.0), pg.id LIMIT :limite OFFSET :desloc`, base
      ).map((pg) => this.cartaoDePagina(pg))
    }[tipo]()
    const itens = linhas.slice(0, limite)
    return { itens, proximo: linhas.length > limite ? deslocamento + limite : null }
  }

  /** O `ORDER BY` da busca de tópicos. A relevância é a de sempre (bm25); `recentes` e as ordens por pessoas desempatam pelo mais novo. */
  _ordemDaBuscaDeTopicos(ordem, duracao) {
    if (ordem === 'recentes') return 't.seq DESC'
    if (ehPorPessoas(ordem)) return `${pontosSql({ alias: 't', tipoResposta: 'resposta-forum', colunaResposta: 'ctx', janela: duracao !== null })} DESC, t.seq DESC`
    return 'bm25(busca, 0, 0, 0, 5.0, 1.0), t.id'
  }

  // ---------- descoberta ----------

  emAlta({ tipo = 'topicos', janela }, agora) {
    const duracao = janelaDe(janela)
    const sem = { agora, corte: agora - duracao, idade: TEMPOS.contaConsideradaNaDescobertaS, leitor: '', limite: ATE }
    const p = { ...sem, ...this.paramsDeVisibilidade(agora) }
    if (tipo === 'topicos') {
      const linhas = this.a.todos(
        `SELECT t.*, (
            3 * (SELECT COUNT(DISTINCT x.autor) FROM objetos x JOIN rovers rx ON rx.uid = x.autor
                 WHERE x.tipo = 'resposta-forum' AND x.ctx = t.id AND x.removido_em IS NULL AND x.oculto_em IS NULL
                   AND x.recebido_em > :corte AND rx.saiu = 0 AND :agora - rx.criado_em >= :idade)
            + (SELECT COUNT(DISTINCT y.autor) FROM objetos y JOIN rovers ry ON ry.uid = y.autor
               WHERE y.tipo = 'reacao' AND y.alvo = t.id AND y.removido_em IS NULL
                 AND y.recebido_em > :corte AND ry.saiu = 0 AND :agora - ry.criado_em >= :idade)
          ) AS score,
          (SELECT COUNT(*) FROM (
             SELECT x.autor FROM objetos x JOIN rovers rx ON rx.uid = x.autor
              WHERE x.tipo = 'resposta-forum' AND x.ctx = t.id AND x.removido_em IS NULL AND x.oculto_em IS NULL
                AND x.recebido_em > :corte AND rx.saiu = 0 AND :agora - rx.criado_em >= :idade
             UNION
             SELECT y.autor FROM objetos y JOIN rovers ry ON ry.uid = y.autor
              WHERE y.tipo = 'reacao' AND y.alvo = t.id AND y.removido_em IS NULL
                AND y.recebido_em > :corte AND ry.saiu = 0 AND :agora - ry.criado_em >= :idade)) AS pessoas
         FROM topicos t JOIN comunidades c ON c.id = t.comunidade
         JOIN objetos o ON o.id = t.id AND o.removido_em IS NULL AND o.oculto_em IS NULL
         JOIN rovers r ON r.uid = t.autor
         WHERE c.acesso <> 'fechada' AND ${Busca.COMUNIDADE_LEGIVEL} AND ${ROVER_VISIVEL}
           AND t.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
         ORDER BY score DESC, t.atividade_seq DESC LIMIT :limite`, p
      ).filter((l) => l.score >= 2)
      return { itens: linhas.map((t) => ({ ...this.cartaoDeTopico(t), pessoas: t.pessoas, comunidadeNome: this.a.um('SELECT nome FROM comunidades WHERE id = :id', { id: t.comunidade }).nome })), proximo: null }
    }
    if (tipo === 'comunidades') {
      const linhas = this.a.todos(
        `SELECT c.*, (
            2 * (SELECT COUNT(DISTINCT m.uid) FROM membros m JOIN rovers rm ON rm.uid = m.uid
                 WHERE m.comunidade = c.id AND m.papel <> 'dono' AND m.desde > :corte AND rm.saiu = 0 AND :agora - rm.criado_em >= :idade)
            + 3 * (SELECT COUNT(DISTINCT a.autor) FROM objetos a JOIN rovers ra ON ra.uid = a.autor
                   WHERE a.recebido_em > :corte AND a.removido_em IS NULL AND a.oculto_em IS NULL AND ra.saiu = 0 AND :agora - ra.criado_em >= :idade
                     AND ((a.tipo = 'topico' AND a.ctx = c.id)
                          OR (a.tipo = 'resposta-forum' AND a.ctx IN (SELECT id FROM topicos WHERE comunidade = c.id))))
          ) AS score,
          (SELECT COUNT(*) FROM (
             SELECT m.uid FROM membros m JOIN rovers rm ON rm.uid = m.uid
              WHERE m.comunidade = c.id AND m.papel <> 'dono' AND m.desde > :corte AND rm.saiu = 0 AND :agora - rm.criado_em >= :idade
             UNION
             SELECT a.autor FROM objetos a JOIN rovers ra ON ra.uid = a.autor
              WHERE a.recebido_em > :corte AND a.removido_em IS NULL AND a.oculto_em IS NULL AND ra.saiu = 0 AND :agora - ra.criado_em >= :idade
                AND ((a.tipo = 'topico' AND a.ctx = c.id)
                     OR (a.tipo = 'resposta-forum' AND a.ctx IN (SELECT id FROM topicos WHERE comunidade = c.id))))) AS pessoas
         FROM comunidades c WHERE c.acesso <> 'fechada' AND ${Busca.COMUNIDADE_LEGIVEL}
         ORDER BY score DESC, c.atividade_seq DESC LIMIT :limite`, sem
      ).filter((l) => l.score >= 3)
      return { itens: linhas.map((c) => ({ ...this.cartaoDeComunidade(c), pessoas: c.pessoas })), proximo: null }
    }
    if (tipo === 'paginas') {
      const linhas = this.a.todos(
        `SELECT pg.*, (
            (SELECT COUNT(DISTINCT s.uid) FROM pagina_seguidores s JOIN rovers rs ON rs.uid = s.uid
             WHERE s.pagina = pg.id AND s.em > :corte AND rs.saiu = 0 AND :agora - rs.criado_em >= :idade)
            + 3 * (SELECT COUNT(*) FROM objetos u WHERE u.tipo = 'pagina-publicar' AND u.ctx = pg.id AND u.removido_em IS NULL AND u.oculto_em IS NULL AND u.recebido_em > :corte)
          ) AS score,
          (SELECT COUNT(DISTINCT s.uid) FROM pagina_seguidores s JOIN rovers rs ON rs.uid = s.uid
            WHERE s.pagina = pg.id AND s.em > :corte AND rs.saiu = 0 AND :agora - rs.criado_em >= :idade) AS pessoas
         FROM paginas pg WHERE pg.encerrada_em IS NULL AND pg.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
         ORDER BY score DESC, pg.atividade_seq DESC LIMIT :limite`, { agora, corte: sem.corte, idade: sem.idade, limite: ATE }
      ).filter((l) => l.score >= 2)
      return { itens: linhas.map((pg) => ({ ...this.cartaoDePagina(pg), pessoas: pg.pessoas })), proximo: null }
    }
    throw new ErroDoProtocolo('esquema', { campo: 'tipo', detalhe: 'Parâmetro tipo: topicos, comunidades ou paginas.' })
  }

  recemChegados({ limite = 50 }, agora) {
    const linhas = this.a.todos(
      `SELECT r.uid, r.criado_em FROM rovers r
       WHERE r.listado = 1 AND r.perfil_id IS NOT NULL AND r.criado_em > :corte AND ${ROVER_VISIVEL}
       ORDER BY r.criado_em DESC, r.uid LIMIT :limite`,
      { corte: agora - TEMPOS.recemChegadoS, limite, ...this.paramsDeVisibilidade(agora) }
    )
    return { itens: linhas.map((l) => ({ ...this.resumo(l.uid), desde: l.criado_em })), proximo: null }
  }

  /** Interesses vindos do pedido (lista de tags) ou do perfil público de um rover. */
  interessesDe({ interesses, rover }, agora) {
    const tags = new Set()
    const pedidos = (interesses ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (pedidos.length > 8) throw new ErroDoProtocolo('esquema', { campo: 'interesses', detalhe: 'Parâmetro interesses: no máximo 8.' })
    for (const t of pedidos) {
      if (!TOPICO_RE.test(t)) throw new ErroDoProtocolo('esquema', { campo: 'interesses', detalhe: 'Parâmetro interesses: tags de 2 a 24 caracteres (a-z, 0-9 e hífen).' })
      tags.add(t)
    }
    if (rover) {
      const r = this.roverVisivel(rover, agora)
      if (!r) throw new ErroDoProtocolo('nao_encontrado')
      for (const t of [...JSON.parse(r.interesses), ...JSON.parse(r.habilidades)]) tags.add(t)
    }
    return [...tags]
  }

  /**
   * Sugestões pelos interesses declarados. Só com a credencial DO PRÓPRIO rover a lista deixa de sugerir o que ele já faz parte:
   * filtrar para qualquer outro leitor revelaria as participações dele.
   */
  sugestoes({ tipo = 'comunidades', interesses, rover, leitor }, agora) {
    const tags = this.interessesDe({ interesses, rover }, agora)
    if (!['comunidades', 'paginas', 'rovers'].includes(tipo)) throw new ErroDoProtocolo('esquema', { campo: 'tipo', detalhe: 'Parâmetro tipo: comunidades, paginas ou rovers.' })
    const eu = rover && leitor === rover ? rover : ''
    const p = { tags: JSON.stringify(tags), eu, limite: ATE }
    if (tipo === 'comunidades') {
      const linhas = this.a.todos(
        `SELECT c.* FROM comunidades c
         WHERE c.acesso <> 'fechada' AND ${Busca.COMUNIDADE_LEGIVEL} AND c.tema IN (SELECT value FROM json_each(:tags))
           AND (:eu = '' OR (NOT EXISTS (SELECT 1 FROM membros mm WHERE mm.comunidade = c.id AND mm.uid = :eu)
                             AND NOT EXISTS (SELECT 1 FROM banidos bb WHERE bb.comunidade = c.id AND bb.uid = :eu)))
         ORDER BY c.atividade_seq DESC LIMIT :limite`, { ...p, leitor: '' }
      )
      return { itens: linhas.map((c) => this.cartaoDeComunidade(c)), proximo: null }
    }
    if (tipo === 'paginas') {
      const linhas = this.a.todos(
        `SELECT pg.* FROM paginas pg
         WHERE pg.encerrada_em IS NULL AND pg.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto') AND pg.tema IN (SELECT value FROM json_each(:tags))
           AND (:eu = '' OR (NOT EXISTS (SELECT 1 FROM pagina_seguidores ps WHERE ps.pagina = pg.id AND ps.uid = :eu)
                             AND NOT EXISTS (SELECT 1 FROM pagina_admins pa WHERE pa.pagina = pg.id AND pa.uid = :eu)))
         ORDER BY pg.atividade_seq DESC LIMIT :limite`, p
      )
      return { itens: linhas.map((pg) => this.cartaoDePagina(pg)), proximo: null }
    }
    const linhas = this.a.todos(
      `SELECT r.uid, (
          SELECT COUNT(DISTINCT j.value) FROM (SELECT value FROM json_each(r.interesses) UNION SELECT value FROM json_each(r.habilidades)) j
          WHERE j.value IN (SELECT value FROM json_each(:tags))
        ) AS comum
       FROM rovers r
       WHERE r.listado = 1 AND r.perfil_id IS NOT NULL AND r.uid <> :eu AND ${ROVER_VISIVEL}
         AND (:eu = '' OR (NOT EXISTS (SELECT 1 FROM amizades am WHERE am.par = CASE WHEN am.de < am.para THEN am.de || '|' || am.para ELSE am.para || '|' || am.de END
                                         AND (am.de = :eu OR am.para = :eu) AND (am.de = r.uid OR am.para = r.uid))
                           AND NOT EXISTS (SELECT 1 FROM relacoes b WHERE b.tipo = 'bloqueio' AND ((b.autor = :eu AND b.alvo = r.uid) OR (b.autor = r.uid AND b.alvo = :eu)))))
       ORDER BY comum DESC, r.criado_em DESC LIMIT :limite`, { ...p, ...this.paramsDeVisibilidade(agora) }
    ).filter((l) => l.comum > 0)
    return { itens: linhas.map((l) => ({ ...this.resumo(l.uid), emComum: l.comum })), proximo: null }
  }

  tendencias({ janela }, agora) {
    const duracao = janelaDe(janela)
    const linhas = this.a.todos(
      `SELECT tu.tag AS tag, COUNT(DISTINCT tu.autor) AS autores, COUNT(*) AS usos
       FROM tags_uso tu
       JOIN objetos o ON o.id = tu.objeto AND o.removido_em IS NULL AND o.oculto_em IS NULL
       JOIN rovers r ON r.uid = tu.autor
       WHERE tu.em > :corte AND ${ROVER_VISIVEL} AND :agora - r.criado_em >= :idade
         AND (tu.ctx IS NULL OR EXISTS (SELECT 1 FROM comunidades c WHERE c.id = tu.ctx AND c.acesso <> 'fechada' AND c.encerrada_em IS NULL))
         AND tu.objeto NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
       GROUP BY tu.tag HAVING COUNT(DISTINCT tu.autor) >= 3
       ORDER BY autores DESC, usos DESC, tu.tag LIMIT :limite`,
      { corte: agora - duracao, idade: TEMPOS.contaConsideradaNaDescobertaS, limite: ATE, ...this.paramsDeVisibilidade(agora) }
    )
    return { itens: linhas.map((l) => ({ tag: l.tag, autores: l.autores, usos: l.usos })), proximo: null }
  }
}

