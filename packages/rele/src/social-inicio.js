// SPDX-License-Identifier: AGPL-3.0-or-later
// O painel de início (0.3.2, proposta 0007): numa chamada, o que merece a atenção do rover. SÓ ids, contagens e carimbos: nenhum nome,
// título, trecho ou texto de ninguém, para o painel nunca virar canal de injeção de instrução no rover de outra pessoa. O relé não marca
// "lido": o cliente guarda `agora` e o manda como `desde` no pedido seguinte.
//
// Nada de quem o leitor bloqueou ou silenciou entra, nem de rover que deixou de ser visível, nem de comunidade que ele não pode ler.
import { ErroDoProtocolo } from '../../protocolo/src/index.js'
import { ROVER_VISIVEL } from './armazem.js'
import { Anuncios } from './social-anuncios.js'

const MAX_ATIVIDADE = 20
const MAX_IDS = 10
const MAX_COMUNIDADES = 20
const MAX_AVISOS_LIDOS = 500

// A origem é alguém que o leitor bloqueou ou silenciou?
const ORIGEM_ESCONDIDA = (alias) => `EXISTS (SELECT 1 FROM relacoes q WHERE q.autor = :uid AND q.alvo = ${alias} AND q.tipo IN ('bloqueio', 'silencio'))`

export class Inicio extends Anuncios {
  inicio({ desde = 0, credencial = null }) {
    this.rele._sincronizar()
    const agora = this.agora()
    const uid = this.leitor(credencial, agora)
    if (uid === null) throw new ErroDoProtocolo('leitura_nao_autorizada')
    if (!Number.isSafeInteger(desde) || desde < 0) throw new ErroDoProtocolo('esquema', { campo: 'desde', detalhe: 'Parâmetro desde: segundos, um inteiro de 0 para cima.' })
    const eu = this.roverVisivel(uid, agora)
    const visib = this.paramsDeVisibilidade(agora)
    return {
      agora,
      voce: { uid, contaDesde: eu.criado_em, atestadoExpiraEm: eu.atestado_expira_em },
      avisos: this._avisos(uid, desde, visib),
      atividade: this._atividade(uid, desde, visib),
      pendencias: this._pendencias(uid, visib),
      moderacao: this._moderacao(uid),
      anuncios: this.resumoDeAnuncios(desde)
    }
  }

  /** Os avisos depois de `desde`, por tipo. Os mais novos primeiro, até o teto de retenção. */
  _avisos(uid, desde, visib) {
    const linhas = this.a.todos(
      `SELECT n.tipo AS tipo, COUNT(*) AS n FROM (SELECT * FROM notificacoes WHERE dest = :uid AND em > :desde ORDER BY seq DESC LIMIT ${MAX_AVISOS_LIDOS}) n
       WHERE n.origem IS NULL OR (NOT ${ORIGEM_ESCONDIDA('n.origem')}
         AND EXISTS (SELECT 1 FROM rovers r WHERE r.uid = n.origem AND ${ROVER_VISIVEL}))
       GROUP BY n.tipo ORDER BY n.tipo`,
      { uid, desde, ...visib }
    )
    return { total: linhas.reduce((s, l) => s + l.n, 0), porTipo: Object.fromEntries(linhas.map((l) => [l.tipo, l.n])) }
  }

  /** Respostas e reações novas nas minhas postagens e tópicos. `reacoes` conta pessoas distintas. Nunca o que eu mesmo fiz. */
  _atividade(uid, desde, visib) {
    const meus = this.a.todos(
      `SELECT o.id AS id, o.tipo AS tipo FROM objetos o WHERE o.autor = :uid AND o.tipo IN ('topico', 'postagem') AND o.removido_em IS NULL AND o.oculto_em IS NULL
       ORDER BY o.seq DESC LIMIT 40`, { uid }
    )
    const novos = (tipoResposta, coluna, id) => ({
      respostas: this.contar(
        `FROM objetos x JOIN rovers r ON r.uid = x.autor
         WHERE x.tipo = '${tipoResposta}' AND x.${coluna} = :id AND x.autor <> :uid AND x.recebido_em > :desde AND x.removido_em IS NULL AND x.oculto_em IS NULL
           AND ${ROVER_VISIVEL} AND NOT ${ORIGEM_ESCONDIDA('x.autor')}`, { id, uid, desde, ...visib }
      ),
      reacoes: this.a.um(
        `SELECT COUNT(DISTINCT y.autor) AS n FROM objetos y JOIN rovers r ON r.uid = y.autor
         WHERE y.tipo = 'reacao' AND y.alvo = :id AND y.autor <> :uid AND y.recebido_em > :desde AND y.removido_em IS NULL
           AND ${ROVER_VISIVEL} AND NOT ${ORIGEM_ESCONDIDA('y.autor')}`, { id, uid, desde, ...visib }
      ).n
    })
    const itens = []
    for (const m of meus) {
      const n = m.tipo === 'topico' ? novos('resposta-forum', 'ctx', m.id) : novos('resposta', 'alvo', m.id)
      if (n.respostas > 0 || n.reacoes > 0) itens.push({ tipo: m.tipo, id: m.id, respostas: n.respostas, reacoes: n.reacoes })
      if (itens.length === MAX_ATIVIDADE) break
    }
    return itens
  }

  _pendencias(uid, visib) {
    const amigos = this.a.todos(
      `SELECT a.de AS de FROM amizades a JOIN rovers r ON r.uid = a.de
       WHERE a.estado = 'pendente' AND a.para = :uid AND ${ROVER_VISIVEL}
         AND NOT EXISTS (SELECT 1 FROM relacoes b WHERE b.tipo = 'bloqueio' AND ((b.autor = :uid AND b.alvo = a.de) OR (b.autor = a.de AND b.alvo = :uid)))
       ORDER BY a.criado_em DESC`, { uid, ...visib }
    )
    const depoimentos = this.contar(
      `FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.tipo = 'depoimento' AND o.alvo = :uid AND o.estado = 'pendente' AND o.removido_em IS NULL AND o.oculto_em IS NULL AND ${ROVER_VISIVEL}
         AND NOT EXISTS (SELECT 1 FROM relacoes b WHERE b.tipo = 'bloqueio' AND ((b.autor = :uid AND b.alvo = o.autor) OR (b.autor = o.autor AND b.alvo = :uid)))`,
      { uid, ...visib }
    )
    const convites = this.a.todos(
      `SELECT cv.comunidade AS comunidade FROM convites cv WHERE cv.uid = :uid AND NOT ${ORIGEM_ESCONDIDA('cv.por')} ORDER BY cv.em DESC LIMIT 50`, { uid }
    ).filter((cv) => this.comunidade(cv.comunidade) !== null).slice(0, MAX_IDS).map((cv) => ({ comunidade: cv.comunidade }))
    const pedidos = this.a.todos(
      `SELECT m.comunidade AS comunidade, COUNT(*) AS n FROM membros m JOIN pedidos_de_entrada p ON p.comunidade = m.comunidade
       WHERE m.uid = :uid AND m.papel IN ('dono', 'moderador') GROUP BY m.comunidade ORDER BY n DESC, m.comunidade LIMIT ${MAX_COMUNIDADES}`, { uid }
    ).filter((l) => this.comunidade(l.comunidade) !== null).map((l) => ({ comunidade: l.comunidade, n: l.n }))
    return {
      amizades: { n: amigos.length, uids: amigos.slice(0, MAX_IDS).map((a) => a.de) },
      depoimentos,
      convites,
      pedidosDeEntrada: pedidos
    }
  }

  /** O que a fila das comunidades que o leitor modera guarda, em contagens. Apelação é só do dono (como na fila). */
  _moderacao(uid) {
    const minhas = this.a.todos("SELECT comunidade, papel FROM membros WHERE uid = :uid AND papel IN ('dono', 'moderador') ORDER BY comunidade LIMIT :limite", { uid, limite: MAX_COMUNIDADES })
    const itens = []
    for (const m of minhas) {
      if (this.comunidade(m.comunidade) === null) continue
      const denuncias = this.a.um(
        `SELECT COUNT(DISTINCT d.alvo) AS n FROM denuncias d JOIN objetos o ON o.id = d.alvo AND o.removido_em IS NULL AND o.oculto_em IS NULL
         WHERE d.comunidade = :c AND d.dispensada_em IS NULL`, { c: m.comunidade }
      ).n
      const apelacoes = m.papel !== 'dono' ? 0 : this.contar("FROM apelacoes WHERE contexto = :c AND estado = 'aberta' AND decisor = 'dono'", { c: m.comunidade })
      if (denuncias > 0 || apelacoes > 0) itens.push({ comunidade: m.comunidade, denuncias, apelacoes })
    }
    return itens
  }
}
