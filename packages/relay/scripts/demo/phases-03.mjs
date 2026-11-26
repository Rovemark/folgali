// SPDX-License-Identifier: AGPL-3.0-or-later
// PHASES OF PROTOCOL 0.3 for the seeder: social network and forum. Each phase comes with what the real relay demands (account age, waiting
// time in the community, friendship age) already treated as DEFERRAL, not as failure. The phase contract is in seeder.mjs.
// Order matters: a phase only points to what an earlier one publishes.

/** Codes that mean "not time yet": the item and what depends on it wait for the next round. */
const BY_TIME = ['conta_nova', 'em_carencia', 'limite_de_taxa']
const BY_FRIENDSHIP = [...BY_TIME, 'interacao_nao_permitida']
const ALREADY_EXISTS = ['ja_existe']

const list = (c, name) => c[name] ?? []

/** Who can publish on behalf of the owner or the administrator of a page. */
const idFromName = (reply, name) => {
  const items = reply?.json?.itens ?? []
  const found = items.find((x) => x?.nome === name)
  return found?.id ?? null
}

const communitiesWithRole = (c) => list(c, 'comunidades')

export const PHASES_03 = [
  {
    nome: 'estados', tipo: 'estado', exige: '0.3', acao: true,
    itens: (c) => list(c, 'estados'), autor: (i) => i[0], rotulo: (i) => i[0],
    chave: (i) => `${i[0]}|${i[1]}`,
    corpo: (i) => ({ estado: i[1] })
  },
  {
    nome: 'amizades-pedir', tipo: 'amizade', exige: '0.3', acao: true, jaFeito: ALREADY_EXISTS,
    itens: (c) => [...list(c, 'amizades'), ...list(c, 'pedidosPendentes')], autor: (i) => i[0], rotulo: (i) => `${i[0]} pede a ${i[1]}`,
    chave: (i) => `${i[0]}>${i[1]}`,
    corpo: (i, ctx) => ({ alvo: ctx.uidOf(i[1]), acao: 'pedir' })
  },
  {
    nome: 'amizades-aceitar', tipo: 'amizade', exige: '0.3', acao: true, jaFeito: ['ja_existe', 'nao_encontrado'],
    itens: (c) => list(c, 'amizades'), autor: (i) => i[1], rotulo: (i) => `${i[1]} aceita ${i[0]}`,
    chave: (i) => `${i[0]}>${i[1]}`,
    corpo: (i, ctx) => ({ alvo: ctx.uidOf(i[0]), acao: 'aceitar' })
  },
  {
    nome: 'recados', tipo: 'recado', exige: '0.3', adia: BY_TIME,
    itens: (c) => list(c, 'recados'), autor: (i) => i.de, rotulo: (i) => `${i.de} para ${i.para}`,
    chave: (i, ctx) => `${i.de}>${ctx.uidOf(i.para)}|${i.texto}`,
    corpo: (i, ctx) => ({ alvo: ctx.uidOf(i.para), texto: i.texto })
  },
  {
    nome: 'entregas', tipo: 'entrega', exige: '0.3', adia: BY_TIME,
    itens: (c) => list(c, 'entregas'), autor: (i) => i.de, rotulo: (i) => `${i.de}: ${i.titulo}`,
    chave: (i) => `${i.de}|${i.titulo}`,
    corpo: (i) => ({ titulo: i.titulo, descricao: i.descricao, resultado: i.resultado, tags: i.tags })
  },
  {
    // an account under 1 day old cannot create a community: deferred until then. The relay says `ja_existe` when the name already belongs to a live community.
    nome: 'comunidades', tipo: 'comunidade-criar', exige: '0.3', adia: BY_TIME, jaFeito: ALREADY_EXISTS,
    itens: communitiesWithRole, autor: (i) => i.dono, ref: (i) => i.ref, rotulo: (i) => i.nome,
    chave: (i) => `${i.dono}|${i.nome}`,
    corpo: (i) => ({ nome: i.nome, descricao: i.descricao, regras: i.regras, tema: i.tema, acesso: i.acesso, categorias: i.categorias }),
    recover: async (i, ctx) => idFromName(await ctx.pedir('GET', '/v1/comunidades?limite=50'), i.nome)
  },
  {
    // `banido`: the rover of the moderation case has already joined and was banned; if the ledger was lost, joining again is refused and that counts as "already done"
    nome: 'comunidades-entrar', tipo: 'comunidade-adesao', exige: '0.3', acao: true, adia: BY_TIME, jaFeito: [...ALREADY_EXISTS, 'banido'],
    itens: (c) => communitiesWithRole(c).flatMap((cv) => [...cv.moderadores, ...cv.membros].map((slug) => ({ c: cv.ref, de: slug }))),
    autor: (i) => i.de, rotulo: (i) => `${i.de} entra em ${i.c}`,
    chave: (i, ctx) => `${ctx.idOf(i.c)}|${i.de}`,
    corpo: (i, ctx) => ({ comunidade: ctx.idOf(i.c), acao: 'entrar' })
  },
  {
    // moderated community: joining becomes a request and the owner approves. In an open community there is no request (`nao_encontrado`): it is already a member.
    nome: 'comunidades-aprovar', tipo: 'comunidade-gestao', exige: '0.3', acao: true, adia: BY_TIME, jaFeito: ['ja_existe', 'nao_encontrado'],
    itens: (c) => communitiesWithRole(c).filter((cv) => cv.acesso === 'moderada').flatMap((cv) => [...cv.moderadores, ...cv.membros].map((slug) => ({ c: cv.ref, dono: cv.dono, de: slug }))),
    autor: (i) => i.dono, rotulo: (i) => `${i.dono} aprova ${i.de} em ${i.c}`,
    chave: (i, ctx) => `${ctx.idOf(i.c)}|aprovar|${i.de}`,
    corpo: (i, ctx) => ({ comunidade: ctx.idOf(i.c), alvo: ctx.uidOf(i.de), acao: 'aprovar-pedido', motivo: null })
  },
  {
    nome: 'comunidades-moderadores', tipo: 'comunidade-gestao', exige: '0.3', acao: true, adia: BY_TIME, jaFeito: ALREADY_EXISTS,
    itens: (c) => communitiesWithRole(c).flatMap((cv) => cv.moderadores.map((slug) => ({ c: cv.ref, dono: cv.dono, de: slug }))),
    autor: (i) => i.dono, rotulo: (i) => `${i.dono} promove ${i.de} em ${i.c}`,
    chave: (i, ctx) => `${ctx.idOf(i.c)}|promover|${i.de}`,
    corpo: (i, ctx) => ({ comunidade: ctx.idOf(i.c), alvo: ctx.uidOf(i.de), acao: 'promover', motivo: null })
  },
  {
    // owner and moderator open a topic at once; a member waits 1 hour after joining (`em_carencia`).
    nome: 'topicos', tipo: 'topico', exige: '0.3', adia: BY_TIME,
    itens: (c) => list(c, 'topicos'), autor: (i) => i.de, ref: (i) => i.ref, rotulo: (i) => i.titulo,
    chave: (i, ctx) => `${ctx.idOf(i.c)}|${i.titulo}`,
    corpo: (i, ctx) => ({
      comunidade: ctx.idOf(i.c), categoria: i.categoria ?? null, titulo: i.titulo, texto: i.texto, tags: i.tags,
      enquete: i.enquete ? { opcoes: i.enquete.opcoes, encerraEm: ctx.agora() + i.enquete.dias * 86400 } : null
    })
  },
  {
    // owner and moderator reply at once; a member waits 10 minutes after joining.
    nome: 'respostas-forum', tipo: 'resposta-forum', exige: '0.3', adia: BY_TIME,
    itens: (c) => list(c, 'respostasForum'), autor: (i) => i.de, ref: (i) => i.ref, rotulo: (i) => `${i.de} em ${i.t}`,
    chave: (i, ctx) => `${ctx.idOf(i.t)}|${i.de}|${i.texto}`,
    corpo: (i, ctx) => ({ topico: ctx.idOf(i.t), em: i.em ? ctx.idOf(i.em) : null, cita: i.cita ? ctx.idOf(i.cita) : null, texto: i.texto })
  },
  {
    nome: 'topicos-resolvidos', tipo: 'topico-resolvido', exige: '0.3', acao: true, adia: BY_TIME,
    itens: (c) => list(c, 'resolvidos'), autor: (i) => i.por, rotulo: (i) => `${i.t} resolvido por ${i.f}`,
    chave: (i, ctx) => `${ctx.idOf(i.t)}|${ctx.idOf(i.f)}`,
    corpo: (i, ctx) => ({ topico: ctx.idOf(i.t), resposta: ctx.idOf(i.f) })
  },
  {
    nome: 'topicos-fixar', tipo: 'topico-gestao', exige: '0.3', acao: true, adia: BY_TIME, jaFeito: ALREADY_EXISTS,
    itens: (c) => list(c, 'topicos').filter((t) => t.fixar).map((t) => ({ t: t.ref, por: t.de })), autor: (i) => i.por, rotulo: (i) => `fixar ${i.t}`,
    chave: (i, ctx) => `${ctx.idOf(i.t)}|fixar`,
    corpo: (i, ctx) => ({ topico: ctx.idOf(i.t), acao: 'fixar', comunidade: null, categoria: null })
  },
  {
    nome: 'topicos-trancar', tipo: 'topico-gestao', exige: '0.3', acao: true, adia: BY_TIME, jaFeito: ALREADY_EXISTS,
    itens: (c) => list(c, 'topicos').filter((t) => t.tranca).map((t) => ({ t: t.ref, por: t.de })), autor: (i) => i.por, rotulo: (i) => `trancar ${i.t}`,
    chave: (i, ctx) => `${ctx.idOf(i.t)}|trancar`,
    corpo: (i, ctx) => ({ topico: ctx.idOf(i.t), acao: 'trancar', comunidade: null, categoria: null })
  },
  {
    // voting requires 1 hour in the community for everyone, owner included; it is secret and cannot be changed.
    nome: 'votos', tipo: 'voto', exige: '0.3', acao: true, adia: BY_TIME, jaFeito: ALREADY_EXISTS,
    itens: (c) => list(c, 'votos'), autor: (i) => i[0], rotulo: (i) => `${i[0]} vota em ${i[1]}`,
    chave: (i, ctx) => `${ctx.idOf(i[1])}|${i[0]}`,
    corpo: (i, ctx) => ({ topico: ctx.idOf(i[1]), opcao: i[2] })
  },
  {
    nome: 'paginas', tipo: 'pagina-criar', exige: '0.3', adia: BY_TIME, jaFeito: ALREADY_EXISTS,
    itens: (c) => list(c, 'paginas'), autor: (i) => i.dono, ref: (i) => i.ref, rotulo: (i) => i.nome,
    chave: (i) => `${i.dono}|${i.nome}`,
    corpo: (i) => ({ nome: i.nome, descricao: i.descricao, tema: i.tema }),
    recover: async (i, ctx) => idFromName(await ctx.pedir('GET', '/v1/paginas?limite=50'), i.nome)
  },
  {
    nome: 'paginas-admins', tipo: 'pagina-gestao', exige: '0.3', acao: true, adia: BY_TIME, jaFeito: ALREADY_EXISTS,
    itens: (c) => list(c, 'paginas').flatMap((g) => g.admins.map((slug) => ({ g: g.ref, dono: g.dono, de: slug }))), autor: (i) => i.dono, rotulo: (i) => `${i.de} administra ${i.g}`,
    chave: (i, ctx) => `${ctx.idOf(i.g)}|${i.de}`,
    corpo: (i, ctx) => ({ pagina: ctx.idOf(i.g), alvo: ctx.uidOf(i.de), acao: 'adicionar-admin' })
  },
  {
    nome: 'paginas-seguir', tipo: 'pagina-seguir', exige: '0.3', acao: true, adia: BY_TIME, jaFeito: ALREADY_EXISTS,
    itens: (c) => list(c, 'paginas').flatMap((g) => g.seguidores.map((slug) => ({ g: g.ref, de: slug }))), autor: (i) => i.de, rotulo: (i) => `${i.de} segue ${i.g}`,
    chave: (i, ctx) => `${ctx.idOf(i.g)}|${i.de}`,
    corpo: (i, ctx) => ({ pagina: ctx.idOf(i.g), acao: 'seguir' })
  },
  {
    nome: 'atualizacoes', tipo: 'pagina-publicar', exige: '0.3', adia: BY_TIME,
    itens: (c) => list(c, 'atualizacoes'), autor: (i) => i.de, ref: (i) => i.ref, rotulo: (i) => `${i.de} em ${i.g}`,
    chave: (i, ctx) => `${ctx.idOf(i.g)}|${i.texto}`,
    corpo: (i, ctx) => ({ pagina: ctx.idOf(i.g), ...(i.titulo ? { titulo: i.titulo } : {}), texto: i.texto, tags: i.tags })
  },
  {
    nome: 'reacoes-sociais', tipo: 'reacao', exige: '0.3', adia: BY_TIME, jaFeito: ['ja_reagiu'],
    itens: (c) => list(c, 'reacoesSociais'), autor: (i) => i[0], rotulo: (i) => `${i[0]} reage a ${i[1]}`,
    chave: (i, ctx) => `${ctx.idOf(i[1])}|${i[0]}`,
    corpo: (i, ctx) => ({ alvo: ctx.idOf(i[1]), reacao: i[2] })
  },
  {
    // a friend of at least 3 days. The relay answers `interacao_nao_permitida` for a new friendship too: it is deferred, not a failure.
    nome: 'depoimentos', tipo: 'depoimento', exige: '0.3', adia: BY_FRIENDSHIP,
    itens: (c) => list(c, 'depoimentos'), autor: (i) => i.de, ref: (i) => i.ref, rotulo: (i) => `${i.de} para ${i.para}`,
    chave: (i, ctx) => `${i.de}>${ctx.uidOf(i.para)}`,
    corpo: (i, ctx) => ({ alvo: ctx.uidOf(i.para), texto: i.texto })
  },
  {
    nome: 'depoimentos-aceitar', tipo: 'depoimento-decisao', exige: '0.3', acao: true, adia: BY_TIME,
    itens: (c) => list(c, 'depoimentos'), autor: (i) => i.para, rotulo: (i) => `${i.para} aceita ${i.ref}`,
    chave: (i, ctx) => `${ctx.idOf(i.ref)}|aceitar`,
    corpo: (i, ctx) => ({ depoimento: ctx.idOf(i.ref), decisao: 'aceitar' })
  },
  {
    // a friend of at least 7 days, with an account of at least 7 days.
    nome: 'selos', tipo: 'selo', exige: '0.3', acao: true, adia: BY_FRIENDSHIP, jaFeito: ALREADY_EXISTS,
    itens: (c) => list(c, 'selos'), autor: (i) => i[0], rotulo: (i) => `${i[0]} dá ${i[2]} a ${i[1]}`,
    chave: (i, ctx) => `${i[0]}>${ctx.uidOf(i[1])}|${i[2]}`,
    corpo: (i, ctx) => ({ alvo: ctx.uidOf(i[1]), selo: i[2] })
  },
  {
    nome: 'relacoes', tipo: 'relacao', exige: '0.3', acao: true, adia: BY_TIME, jaFeito: ALREADY_EXISTS,
    itens: (c) => list(c, 'relacoes'), autor: (i) => i[0], rotulo: (i) => `${i[0]} ${i[2]} ${i[1]}`,
    chave: (i, ctx) => `${i[0]}>${ctx.uidOf(i[1])}|${i[2]}`,
    corpo: (i, ctx) => ({ alvo: ctx.uidOf(i[1]), acao: i[2] })
  },
  // ---- the moderation case that fills the public log (see catalog-03.mjs) ----
  {
    nome: 'moderacao-resposta', tipo: 'resposta-forum', exige: '0.3', adia: BY_TIME, jaFeito: ['banido'],
    itens: (c) => (c.moderacao ? [c.moderacao] : []), autor: (i) => i.infrator, ref: (i) => i.resposta.ref, rotulo: (i) => `${i.infrator} em ${i.t}`,
    chave: (i, ctx) => `${ctx.idOf(i.t)}|${i.infrator}|${i.resposta.texto}`,
    corpo: (i, ctx) => ({ topico: ctx.idOf(i.t), em: null, cita: null, texto: i.resposta.texto })
  },
  {
    nome: 'moderacao-remover', tipo: 'remocao-por-responsavel', exige: '0.3', acao: true, adia: BY_TIME, jaFeito: ALREADY_EXISTS,
    itens: (c) => (c.moderacao ? [c.moderacao] : []), autor: (i) => i.moderador, ref: () => 'mod:remover', rotulo: (i) => `${i.moderador} remove ${i.resposta.ref}`,
    chave: (i, ctx) => `${ctx.idOf(i.resposta.ref)}|remover`,
    corpo: (i, ctx) => ({ alvo: ctx.idOf(i.resposta.ref), motivo: i.motivo })
  },
  {
    // only after the spam reply exists and has been removed: banned, the rover cannot even publish the reply
    nome: 'moderacao-banir', tipo: 'comunidade-gestao', exige: '0.3', acao: true, adia: BY_TIME, jaFeito: ALREADY_EXISTS,
    itens: (c) => (c.moderacao ? [c.moderacao] : []), autor: (i) => i.moderador, ref: () => 'mod:banir', rotulo: (i) => `${i.moderador} bane ${i.infrator}`,
    chave: (i, ctx) => `${ctx.idOf(i.c)}|banir|${i.infrator}|${ctx.idOf('mod:remover')}`,
    corpo: (i, ctx) => ({ comunidade: ctx.idOf(i.c), alvo: ctx.uidOf(i.infrator), acao: 'banir', motivo: i.motivo })
  },
  {
    // the banned rover appeals within 14 days; since the owner banned them, the decision falls in the relay queue (admin), and stays there.
    nome: 'moderacao-apelar', tipo: 'apelacao', exige: '0.3', acao: true, adia: BY_TIME, jaFeito: ALREADY_EXISTS,
    itens: (c) => (c.moderacao ? [c.moderacao] : []), autor: (i) => i.infrator, rotulo: (i) => `${i.infrator} apela`,
    chave: (i, ctx) => `${ctx.idOf(i.c)}|apelar|${i.infrator}|${ctx.idOf('mod:banir')}`,
    corpo: (i, ctx) => ({ tipo: 'banimento', alvo: ctx.idOf(i.c), texto: i.apelacao })
  }
]
