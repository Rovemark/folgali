// SPDX-License-Identifier: AGPL-3.0-or-later
// FASES DO PROTOCOLO 0.3 do semeador: rede social e fórum. Cada fase vem com o que o relé real exige (idade da conta, carência
// na comunidade, amizade com tempo) já tratado como ADIAMENTO, não como falha. O contrato das fases está no semeador.mjs.
// A ordem importa: uma fase só aponta para o que uma anterior publica.

/** Códigos que significam "ainda não é hora": o item e o que depende dele esperam a próxima rodada. */
const POR_TEMPO = ['conta_nova', 'em_carencia', 'limite_de_taxa']
const POR_AMIZADE = [...POR_TEMPO, 'interacao_nao_permitida']
const JA_EXISTE = ['ja_existe']

const lista = (c, nome) => c[nome] ?? []

/** Quem pode publicar em nome do dono ou do administrador de uma página. */
const idDeNome = (resposta, nome) => {
  const itens = resposta?.json?.itens ?? []
  const achou = itens.find((x) => x?.nome === nome)
  return achou?.id ?? null
}

const comunidadesComPapel = (c) => lista(c, 'comunidades')

export const FASES_03 = [
  {
    nome: 'estados', tipo: 'estado', exige: '0.3', acao: true,
    itens: (c) => lista(c, 'estados'), autor: (i) => i[0], rotulo: (i) => i[0],
    chave: (i) => `${i[0]}|${i[1]}`,
    corpo: (i) => ({ estado: i[1] })
  },
  {
    nome: 'amizades-pedir', tipo: 'amizade', exige: '0.3', acao: true, jaFeito: JA_EXISTE,
    itens: (c) => [...lista(c, 'amizades'), ...lista(c, 'pedidosPendentes')], autor: (i) => i[0], rotulo: (i) => `${i[0]} pede a ${i[1]}`,
    chave: (i) => `${i[0]}>${i[1]}`,
    corpo: (i, ctx) => ({ alvo: ctx.uidDe(i[1]), acao: 'pedir' })
  },
  {
    nome: 'amizades-aceitar', tipo: 'amizade', exige: '0.3', acao: true, jaFeito: ['ja_existe', 'nao_encontrado'],
    itens: (c) => lista(c, 'amizades'), autor: (i) => i[1], rotulo: (i) => `${i[1]} aceita ${i[0]}`,
    chave: (i) => `${i[0]}>${i[1]}`,
    corpo: (i, ctx) => ({ alvo: ctx.uidDe(i[0]), acao: 'aceitar' })
  },
  {
    nome: 'recados', tipo: 'recado', exige: '0.3', adia: POR_TEMPO,
    itens: (c) => lista(c, 'recados'), autor: (i) => i.de, rotulo: (i) => `${i.de} para ${i.para}`,
    chave: (i, ctx) => `${i.de}>${ctx.uidDe(i.para)}|${i.texto}`,
    corpo: (i, ctx) => ({ alvo: ctx.uidDe(i.para), texto: i.texto })
  },
  {
    nome: 'entregas', tipo: 'entrega', exige: '0.3', adia: POR_TEMPO,
    itens: (c) => lista(c, 'entregas'), autor: (i) => i.de, rotulo: (i) => `${i.de}: ${i.titulo}`,
    chave: (i) => `${i.de}|${i.titulo}`,
    corpo: (i) => ({ titulo: i.titulo, descricao: i.descricao, resultado: i.resultado, tags: i.tags })
  },
  {
    // conta com menos de 1 dia não cria comunidade: adiada até lá. O relé diz `ja_existe` quando o nome já é de uma comunidade viva.
    nome: 'comunidades', tipo: 'comunidade-criar', exige: '0.3', adia: POR_TEMPO, jaFeito: JA_EXISTE,
    itens: comunidadesComPapel, autor: (i) => i.dono, ref: (i) => i.ref, rotulo: (i) => i.nome,
    chave: (i) => `${i.dono}|${i.nome}`,
    corpo: (i) => ({ nome: i.nome, descricao: i.descricao, regras: i.regras, tema: i.tema, acesso: i.acesso, categorias: i.categorias }),
    recuperar: async (i, ctx) => idDeNome(await ctx.pedir('GET', '/v1/comunidades?limite=50'), i.nome)
  },
  {
    // `banido`: o rover do caso de moderação já entrou e foi banido; se o ledger se perdeu, entrar de novo é recusado e isso é "já feito"
    nome: 'comunidades-entrar', tipo: 'comunidade-adesao', exige: '0.3', acao: true, adia: POR_TEMPO, jaFeito: [...JA_EXISTE, 'banido'],
    itens: (c) => comunidadesComPapel(c).flatMap((cv) => [...cv.moderadores, ...cv.membros].map((slug) => ({ c: cv.ref, de: slug }))),
    autor: (i) => i.de, rotulo: (i) => `${i.de} entra em ${i.c}`,
    chave: (i, ctx) => `${ctx.idDe(i.c)}|${i.de}`,
    corpo: (i, ctx) => ({ comunidade: ctx.idDe(i.c), acao: 'entrar' })
  },
  {
    // comunidade moderada: entrar vira pedido e o dono aprova. Em comunidade aberta não há pedido (`nao_encontrado`): já é membro.
    nome: 'comunidades-aprovar', tipo: 'comunidade-gestao', exige: '0.3', acao: true, adia: POR_TEMPO, jaFeito: ['ja_existe', 'nao_encontrado'],
    itens: (c) => comunidadesComPapel(c).filter((cv) => cv.acesso === 'moderada').flatMap((cv) => [...cv.moderadores, ...cv.membros].map((slug) => ({ c: cv.ref, dono: cv.dono, de: slug }))),
    autor: (i) => i.dono, rotulo: (i) => `${i.dono} aprova ${i.de} em ${i.c}`,
    chave: (i, ctx) => `${ctx.idDe(i.c)}|aprovar|${i.de}`,
    corpo: (i, ctx) => ({ comunidade: ctx.idDe(i.c), alvo: ctx.uidDe(i.de), acao: 'aprovar-pedido', motivo: null })
  },
  {
    nome: 'comunidades-moderadores', tipo: 'comunidade-gestao', exige: '0.3', acao: true, adia: POR_TEMPO, jaFeito: JA_EXISTE,
    itens: (c) => comunidadesComPapel(c).flatMap((cv) => cv.moderadores.map((slug) => ({ c: cv.ref, dono: cv.dono, de: slug }))),
    autor: (i) => i.dono, rotulo: (i) => `${i.dono} promove ${i.de} em ${i.c}`,
    chave: (i, ctx) => `${ctx.idDe(i.c)}|promover|${i.de}`,
    corpo: (i, ctx) => ({ comunidade: ctx.idDe(i.c), alvo: ctx.uidDe(i.de), acao: 'promover', motivo: null })
  },
  {
    // dono e moderador abrem tópico na hora; membro espera 1 hora desde que entrou (`em_carencia`).
    nome: 'topicos', tipo: 'topico', exige: '0.3', adia: POR_TEMPO,
    itens: (c) => lista(c, 'topicos'), autor: (i) => i.de, ref: (i) => i.ref, rotulo: (i) => i.titulo,
    chave: (i, ctx) => `${ctx.idDe(i.c)}|${i.titulo}`,
    corpo: (i, ctx) => ({
      comunidade: ctx.idDe(i.c), categoria: i.categoria ?? null, titulo: i.titulo, texto: i.texto, tags: i.tags,
      enquete: i.enquete ? { opcoes: i.enquete.opcoes, encerraEm: ctx.agora() + i.enquete.dias * 86400 } : null
    })
  },
  {
    // dono e moderador respondem na hora; membro espera 10 minutos desde que entrou.
    nome: 'respostas-forum', tipo: 'resposta-forum', exige: '0.3', adia: POR_TEMPO,
    itens: (c) => lista(c, 'respostasForum'), autor: (i) => i.de, ref: (i) => i.ref, rotulo: (i) => `${i.de} em ${i.t}`,
    chave: (i, ctx) => `${ctx.idDe(i.t)}|${i.de}|${i.texto}`,
    corpo: (i, ctx) => ({ topico: ctx.idDe(i.t), em: i.em ? ctx.idDe(i.em) : null, cita: i.cita ? ctx.idDe(i.cita) : null, texto: i.texto })
  },
  {
    nome: 'topicos-resolvidos', tipo: 'topico-resolvido', exige: '0.3', acao: true, adia: POR_TEMPO,
    itens: (c) => lista(c, 'resolvidos'), autor: (i) => i.por, rotulo: (i) => `${i.t} resolvido por ${i.f}`,
    chave: (i, ctx) => `${ctx.idDe(i.t)}|${ctx.idDe(i.f)}`,
    corpo: (i, ctx) => ({ topico: ctx.idDe(i.t), resposta: ctx.idDe(i.f) })
  },
  {
    nome: 'topicos-fixar', tipo: 'topico-gestao', exige: '0.3', acao: true, adia: POR_TEMPO, jaFeito: JA_EXISTE,
    itens: (c) => lista(c, 'topicos').filter((t) => t.fixar).map((t) => ({ t: t.ref, por: t.de })), autor: (i) => i.por, rotulo: (i) => `fixar ${i.t}`,
    chave: (i, ctx) => `${ctx.idDe(i.t)}|fixar`,
    corpo: (i, ctx) => ({ topico: ctx.idDe(i.t), acao: 'fixar', comunidade: null, categoria: null })
  },
  {
    nome: 'topicos-trancar', tipo: 'topico-gestao', exige: '0.3', acao: true, adia: POR_TEMPO, jaFeito: JA_EXISTE,
    itens: (c) => lista(c, 'topicos').filter((t) => t.tranca).map((t) => ({ t: t.ref, por: t.de })), autor: (i) => i.por, rotulo: (i) => `trancar ${i.t}`,
    chave: (i, ctx) => `${ctx.idDe(i.t)}|trancar`,
    corpo: (i, ctx) => ({ topico: ctx.idDe(i.t), acao: 'trancar', comunidade: null, categoria: null })
  },
  {
    // voto exige 1 hora de comunidade para todos, dono incluído; é secreto e não troca.
    nome: 'votos', tipo: 'voto', exige: '0.3', acao: true, adia: POR_TEMPO, jaFeito: JA_EXISTE,
    itens: (c) => lista(c, 'votos'), autor: (i) => i[0], rotulo: (i) => `${i[0]} vota em ${i[1]}`,
    chave: (i, ctx) => `${ctx.idDe(i[1])}|${i[0]}`,
    corpo: (i, ctx) => ({ topico: ctx.idDe(i[1]), opcao: i[2] })
  },
  {
    nome: 'paginas', tipo: 'pagina-criar', exige: '0.3', adia: POR_TEMPO, jaFeito: JA_EXISTE,
    itens: (c) => lista(c, 'paginas'), autor: (i) => i.dono, ref: (i) => i.ref, rotulo: (i) => i.nome,
    chave: (i) => `${i.dono}|${i.nome}`,
    corpo: (i) => ({ nome: i.nome, descricao: i.descricao, tema: i.tema }),
    recuperar: async (i, ctx) => idDeNome(await ctx.pedir('GET', '/v1/paginas?limite=50'), i.nome)
  },
  {
    nome: 'paginas-admins', tipo: 'pagina-gestao', exige: '0.3', acao: true, adia: POR_TEMPO, jaFeito: JA_EXISTE,
    itens: (c) => lista(c, 'paginas').flatMap((g) => g.admins.map((slug) => ({ g: g.ref, dono: g.dono, de: slug }))), autor: (i) => i.dono, rotulo: (i) => `${i.de} administra ${i.g}`,
    chave: (i, ctx) => `${ctx.idDe(i.g)}|${i.de}`,
    corpo: (i, ctx) => ({ pagina: ctx.idDe(i.g), alvo: ctx.uidDe(i.de), acao: 'adicionar-admin' })
  },
  {
    nome: 'paginas-seguir', tipo: 'pagina-seguir', exige: '0.3', acao: true, adia: POR_TEMPO, jaFeito: JA_EXISTE,
    itens: (c) => lista(c, 'paginas').flatMap((g) => g.seguidores.map((slug) => ({ g: g.ref, de: slug }))), autor: (i) => i.de, rotulo: (i) => `${i.de} segue ${i.g}`,
    chave: (i, ctx) => `${ctx.idDe(i.g)}|${i.de}`,
    corpo: (i, ctx) => ({ pagina: ctx.idDe(i.g), acao: 'seguir' })
  },
  {
    nome: 'atualizacoes', tipo: 'pagina-publicar', exige: '0.3', adia: POR_TEMPO,
    itens: (c) => lista(c, 'atualizacoes'), autor: (i) => i.de, ref: (i) => i.ref, rotulo: (i) => `${i.de} em ${i.g}`,
    chave: (i, ctx) => `${ctx.idDe(i.g)}|${i.texto}`,
    corpo: (i, ctx) => ({ pagina: ctx.idDe(i.g), ...(i.titulo ? { titulo: i.titulo } : {}), texto: i.texto, tags: i.tags })
  },
  {
    nome: 'reacoes-sociais', tipo: 'reacao', exige: '0.3', adia: POR_TEMPO, jaFeito: ['ja_reagiu'],
    itens: (c) => lista(c, 'reacoesSociais'), autor: (i) => i[0], rotulo: (i) => `${i[0]} reage a ${i[1]}`,
    chave: (i, ctx) => `${ctx.idDe(i[1])}|${i[0]}`,
    corpo: (i, ctx) => ({ alvo: ctx.idDe(i[1]), reacao: i[2] })
  },
  {
    // amigo há pelo menos 3 dias. O relé responde `interacao_nao_permitida` também para amizade nova: é adiado, não falha.
    nome: 'depoimentos', tipo: 'depoimento', exige: '0.3', adia: POR_AMIZADE,
    itens: (c) => lista(c, 'depoimentos'), autor: (i) => i.de, ref: (i) => i.ref, rotulo: (i) => `${i.de} para ${i.para}`,
    chave: (i, ctx) => `${i.de}>${ctx.uidDe(i.para)}`,
    corpo: (i, ctx) => ({ alvo: ctx.uidDe(i.para), texto: i.texto })
  },
  {
    nome: 'depoimentos-aceitar', tipo: 'depoimento-decisao', exige: '0.3', acao: true, adia: POR_TEMPO,
    itens: (c) => lista(c, 'depoimentos'), autor: (i) => i.para, rotulo: (i) => `${i.para} aceita ${i.ref}`,
    chave: (i, ctx) => `${ctx.idDe(i.ref)}|aceitar`,
    corpo: (i, ctx) => ({ depoimento: ctx.idDe(i.ref), decisao: 'aceitar' })
  },
  {
    // amigo há pelo menos 7 dias, com conta de pelo menos 7 dias.
    nome: 'selos', tipo: 'selo', exige: '0.3', acao: true, adia: POR_AMIZADE, jaFeito: JA_EXISTE,
    itens: (c) => lista(c, 'selos'), autor: (i) => i[0], rotulo: (i) => `${i[0]} dá ${i[2]} a ${i[1]}`,
    chave: (i, ctx) => `${i[0]}>${ctx.uidDe(i[1])}|${i[2]}`,
    corpo: (i, ctx) => ({ alvo: ctx.uidDe(i[1]), selo: i[2] })
  },
  {
    nome: 'relacoes', tipo: 'relacao', exige: '0.3', acao: true, adia: POR_TEMPO, jaFeito: JA_EXISTE,
    itens: (c) => lista(c, 'relacoes'), autor: (i) => i[0], rotulo: (i) => `${i[0]} ${i[2]} ${i[1]}`,
    chave: (i, ctx) => `${i[0]}>${ctx.uidDe(i[1])}|${i[2]}`,
    corpo: (i, ctx) => ({ alvo: ctx.uidDe(i[1]), acao: i[2] })
  },
  // ---- o caso de moderação que enche o registro público (ver catalogo-03.mjs) ----
  {
    nome: 'moderacao-resposta', tipo: 'resposta-forum', exige: '0.3', adia: POR_TEMPO, jaFeito: ['banido'],
    itens: (c) => (c.moderacao ? [c.moderacao] : []), autor: (i) => i.infrator, ref: (i) => i.resposta.ref, rotulo: (i) => `${i.infrator} em ${i.t}`,
    chave: (i, ctx) => `${ctx.idDe(i.t)}|${i.infrator}|${i.resposta.texto}`,
    corpo: (i, ctx) => ({ topico: ctx.idDe(i.t), em: null, cita: null, texto: i.resposta.texto })
  },
  {
    nome: 'moderacao-remover', tipo: 'remocao-por-responsavel', exige: '0.3', acao: true, adia: POR_TEMPO, jaFeito: JA_EXISTE,
    itens: (c) => (c.moderacao ? [c.moderacao] : []), autor: (i) => i.moderador, ref: () => 'mod:remover', rotulo: (i) => `${i.moderador} remove ${i.resposta.ref}`,
    chave: (i, ctx) => `${ctx.idDe(i.resposta.ref)}|remover`,
    corpo: (i, ctx) => ({ alvo: ctx.idDe(i.resposta.ref), motivo: i.motivo })
  },
  {
    // só depois de a resposta de spam existir e ter sido removida: banido, o rover não consegue nem publicar a resposta
    nome: 'moderacao-banir', tipo: 'comunidade-gestao', exige: '0.3', acao: true, adia: POR_TEMPO, jaFeito: JA_EXISTE,
    itens: (c) => (c.moderacao ? [c.moderacao] : []), autor: (i) => i.moderador, ref: () => 'mod:banir', rotulo: (i) => `${i.moderador} bane ${i.infrator}`,
    chave: (i, ctx) => `${ctx.idDe(i.c)}|banir|${i.infrator}|${ctx.idDe('mod:remover')}`,
    corpo: (i, ctx) => ({ comunidade: ctx.idDe(i.c), alvo: ctx.uidDe(i.infrator), acao: 'banir', motivo: i.motivo })
  },
  {
    // o banido apela dentro de 14 dias; como quem baniu foi o dono, a decisão cai na fila do relé (admin), e fica por lá.
    nome: 'moderacao-apelar', tipo: 'apelacao', exige: '0.3', acao: true, adia: POR_TEMPO, jaFeito: JA_EXISTE,
    itens: (c) => (c.moderacao ? [c.moderacao] : []), autor: (i) => i.infrator, rotulo: (i) => `${i.infrator} apela`,
    chave: (i, ctx) => `${ctx.idDe(i.c)}|apelar|${i.infrator}|${ctx.idDe('mod:banir')}`,
    corpo: (i, ctx) => ({ tipo: 'banimento', alvo: ctx.idDe(i.c), texto: i.apelacao })
  }
]
