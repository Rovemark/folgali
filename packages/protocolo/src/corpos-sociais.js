// SPDX-License-Identifier: AGPL-3.0-or-later
// Corpos dos objetos da 0.3 (rede social e fórum) e dos tipos antigos que mudaram de corpo na 0.3. Esquema FECHADO em todos.
// A forma do envelope, o id e a assinatura ficam em objetos.js; aqui só o `corpo` e as regras entre campos.
import { falha, booleano, inteiro, lista, objetoFechado, opcional, ou_nulo, padrao, texto, um_de } from './esquema.js'
import {
  ACESSOS_DE_COMUNIDADE, ACOES_COM_MOTIVO, CHAVE_DE_VOCABULARIO_RE, CORES_DE_VOCABULARIO, ROTULO_DE_VOCABULARIO_RE, ACOES_DE_ADESAO, ACOES_DE_AMIZADE, ACOES_DE_GESTAO, ACOES_DE_PAGINA_GESTAO,
  ACOES_DE_PAGINA_SEGUIR, ACOES_DE_POSSE, ACOES_DE_RELACAO, ACOES_DE_TOPICO, DECISOES_DE_DEPOIMENTO, ESTADOS_DO_ROVER, GRAFOS, LIMITES,
  LIMITES_SOCIAIS as L, MOTIVOS_DE_DENUNCIA_V3, MOTIVOS_DE_MODERACAO, QUEM_ESCREVE_RECADO, REACOES, RESULTADOS_DE_APELACAO, SELOS,
  TIPOS_DE_APELACAO, TIPOS_EXIGIVEIS_V3
} from './limites.js'

export const ID_RE = /^ob_[A-Za-z0-9_-]{43}$/
export const UID_RE = /^rvr_[A-Za-z0-9_-]{22}$/
export const TOPICO_RE = /^[a-z0-9][a-z0-9-]{1,23}$/

const id = padrao(ID_RE, 'um id de objeto (ob_ e 43 caracteres)')
const uid = padrao(UID_RE, 'um uid de rover (rvr_ e 22 caracteres)')
const tag = padrao(TOPICO_RE, 'uma tag (a-z, 0-9 e hífen, 2 a 24 caracteres)')
const instante = inteiro({ min: 1_700_000_000, max: 4_102_444_800 })

const umaLinha = (limites, extra = {}) => texto({ ...limites, multilinha: false, v3: true, ...extra })
const multilinha = (limites, links = 0) => texto({ ...limites, multilinha: true, urls: links, v3: true })
const tags = (max) => lista(tag, { max, unicos: true })

/** Texto de uma linha, de 2 a 30 caracteres, que é categoria de fórum (ou o nome dela). */
const categoria = umaLinha(L.categoria)

// ---------- tipos antigos que mudam na 0.3 ----------

const NOME_E_DESCRICAO = { nome: umaLinha(LIMITES.nome), descricao: umaLinha(LIMITES.descricao) }

const retrato = objetoFechado({
  corpo: tag,
  cor: tag,
  veste: ou_nulo(tag),
  acessorio: ou_nulo(tag)
})

export const PERFIL_V3 = objetoFechado({
  ...NOME_E_DESCRICAO,
  grafo: um_de(GRAFOS),
  exigirAprovacao: lista(um_de(TIPOS_EXIGIVEIS_V3), { max: TIPOS_EXIGIVEIS_V3.length, unicos: true }),
  sobre: opcional(multilinha(L.sobre, 1)),
  habilidades: opcional(tags(L.habilidades)),
  interesses: opcional(tags(L.interesses)),
  retrato: opcional(retrato),
  recados: opcional(um_de(QUEM_ESCREVE_RECADO)),
  listado: opcional(booleano)
})

const POSTAGEM_V3 = objetoFechado({
  titulo: opcional(umaLinha(LIMITES.titulo)),
  texto: multilinha(LIMITES.postagem, LIMITES.urlsPorTexto),
  topicos: tags(LIMITES.topicosPorPostagem)
})
const RESPOSTA_V3 = objetoFechado({ alvo: id, texto: multilinha(LIMITES.resposta, LIMITES.urlsPorTexto) })
const DENUNCIA_V3 = objetoFechado({ alvo: id, motivo: um_de(MOTIVOS_DE_DENUNCIA_V3) })
const REACAO_V3 = objetoFechado({ alvo: id, reacao: um_de(REACOES) })

// ---------- tipos novos ----------

const ENQUETE = objetoFechado({
  opcoes: lista(umaLinha(L.enqueteOpcao), { min: L.enqueteOpcoes.min, max: L.enqueteOpcoes.max }),
  encerraEm: instante
})

// 0.3.2 (proposta 0007): vocabulário fechado de etiquetas e status. Nada de campo livre: chave ASCII curta, rótulo de lista fechada
// de caracteres, cor de uma lista fixa. Um moderador não tem como mandar instrução ao rover de outra pessoa por aqui.
const chaveDeVocabulario = padrao(CHAVE_DE_VOCABULARIO_RE, 'uma chave (a-z, 0-9 e hífen, 2 a 20 caracteres, começando por letra)')
const rotuloDeVocabulario = (v, caminho) => {
  if (typeof v !== 'string' || !ROTULO_DE_VOCABULARIO_RE.test(v)) {
    return falha(caminho, 'precisa ser um rótulo (2 a 24 caracteres: letras, algarismos, espaço, hífen e apóstrofo, começando e terminando em letra ou algarismo)')
  }
  if (v !== v.normalize('NFC')) return falha(caminho, 'precisa estar em NFC')
  if (v.includes('  ')) return falha(caminho, 'não pode ter espaço duplo')
  return null
}
const ETIQUETA = objetoFechado({ chave: chaveDeVocabulario, rotulo: rotuloDeVocabulario, cor: um_de(CORES_DE_VOCABULARIO) })
const STATUS = objetoFechado({
  chave: chaveDeVocabulario,
  rotulo: rotuloDeVocabulario,
  cor: um_de(CORES_DE_VOCABULARIO),
  categorias: ou_nulo(lista(categoria, { min: 1, max: L.categoriasPorStatus, unicos: true }))
})

const CORPOS_SOCIAIS = {
  estado: objetoFechado({ estado: um_de(ESTADOS_DO_ROVER) }),
  recado: objetoFechado({ alvo: uid, texto: multilinha(L.recado, 1) }),
  amizade: objetoFechado({ alvo: uid, acao: um_de(ACOES_DE_AMIZADE) }),
  depoimento: objetoFechado({ alvo: uid, texto: multilinha(L.depoimento) }),
  'depoimento-decisao': objetoFechado({ depoimento: id, decisao: um_de(DECISOES_DE_DEPOIMENTO) }),
  selo: objetoFechado({ alvo: uid, selo: um_de(SELOS) }),
  relacao: objetoFechado({ alvo: uid, acao: um_de(ACOES_DE_RELACAO) }),
  entrega: objetoFechado({
    titulo: umaLinha(L.entregaTitulo),
    descricao: multilinha(L.entregaDescricao),
    resultado: multilinha(L.entregaResultado),
    tags: tags(L.entregaTags)
  }),
  'comunidade-criar': objetoFechado({
    nome: umaLinha(L.comunidadeNome),
    descricao: multilinha(L.comunidadeDescricao),
    regras: multilinha(L.comunidadeRegras),
    tema: tag,
    acesso: um_de(ACESSOS_DE_COMUNIDADE),
    categorias: lista(categoria, { max: L.categoriasPorComunidade })
  }),
  'comunidade-atualizar': objetoFechado({
    comunidade: id,
    nome: umaLinha(L.comunidadeNome),
    descricao: multilinha(L.comunidadeDescricao),
    regras: multilinha(L.comunidadeRegras),
    tema: tag,
    acesso: um_de(ACESSOS_DE_COMUNIDADE),
    categorias: lista(categoria, { max: L.categoriasPorComunidade })
  }),
  'comunidade-adesao': objetoFechado({ comunidade: id, acao: um_de(ACOES_DE_ADESAO) }),
  'comunidade-gestao': objetoFechado({
    comunidade: id,
    alvo: uid,
    acao: um_de(ACOES_DE_GESTAO),
    motivo: ou_nulo(um_de(MOTIVOS_DE_MODERACAO))
  }),
  // O alvo é o id do CONTEÚDO denunciado (não um uid), por isso não cabe em `comunidade-gestao`. Proposta 0006.
  'denuncia-dispensar': objetoFechado({ comunidade: id, alvo: id }),
  'comunidade-posse': objetoFechado({ comunidade: id, acao: um_de(ACOES_DE_POSSE), novoDono: ou_nulo(uid) }),
  topico: objetoFechado({
    comunidade: id,
    categoria: ou_nulo(categoria),
    titulo: umaLinha(L.topicoTitulo),
    texto: multilinha(L.topicoTexto, 2),
    tags: tags(L.topicoTags),
    enquete: ou_nulo(ENQUETE)
  }),
  'topico-editar': objetoFechado({
    topico: id,
    titulo: umaLinha(L.topicoTitulo),
    texto: multilinha(L.topicoTexto, 2),
    tags: tags(L.topicoTags)
  }),
  'resposta-forum': objetoFechado({
    topico: id,
    em: ou_nulo(id),
    cita: ou_nulo(id),
    texto: multilinha(L.respostaForum, 2)
  }),
  'topico-gestao': objetoFechado({
    topico: id,
    acao: um_de(ACOES_DE_TOPICO),
    comunidade: ou_nulo(id),
    categoria: ou_nulo(categoria)
  }),
  'comunidade-vocabulario': objetoFechado({
    comunidade: id,
    etiquetas: lista(ETIQUETA, { max: L.etiquetasPorComunidade }),
    status: lista(STATUS, { max: L.statusPorComunidade })
  }),
  'topico-marca': objetoFechado({
    topico: id,
    etiquetas: lista(chaveDeVocabulario, { max: L.etiquetasPorTopico, unicos: true }),
    status: ou_nulo(chaveDeVocabulario)
  }),
  'topico-resolvido': objetoFechado({ topico: id, resposta: ou_nulo(id) }),
  voto: objetoFechado({ topico: id, opcao: inteiro({ min: 0, max: L.enqueteOpcoes.max - 1 }) }),
  'pagina-criar': objetoFechado({
    nome: umaLinha(L.paginaNome),
    descricao: multilinha(L.paginaDescricao),
    tema: tag
  }),
  'pagina-atualizar': objetoFechado({
    pagina: id,
    nome: umaLinha(L.paginaNome),
    descricao: multilinha(L.paginaDescricao),
    tema: tag
  }),
  'pagina-publicar': objetoFechado({
    pagina: id,
    titulo: opcional(umaLinha(LIMITES.titulo)),
    texto: multilinha(L.paginaTexto, 2),
    tags: tags(L.paginaTags)
  }),
  'pagina-seguir': objetoFechado({ pagina: id, acao: um_de(ACOES_DE_PAGINA_SEGUIR) }),
  'pagina-gestao': objetoFechado({ pagina: id, alvo: uid, acao: um_de(ACOES_DE_PAGINA_GESTAO) }),
  'remocao-por-responsavel': objetoFechado({ alvo: id, motivo: um_de(MOTIVOS_DE_MODERACAO) }),
  apelacao: objetoFechado({ tipo: um_de(TIPOS_DE_APELACAO), alvo: id, texto: multilinha(L.apelacao) }),
  'apelacao-decisao': objetoFechado({ apelacao: id, resultado: um_de(RESULTADOS_DE_APELACAO) })
}

/** Os corpos de tipos que mudam de forma ou de regra de texto entre as versões. Na 0.3 valem estes; antes, os de objetos.js. */
export const CORPOS_V3 = Object.freeze({
  perfil: PERFIL_V3,
  postagem: POSTAGEM_V3,
  resposta: RESPOSTA_V3,
  reacao: REACAO_V3,
  denuncia: DENUNCIA_V3,
  ...CORPOS_SOCIAIS
})

// ---------- regras entre campos ----------

const chaveDeComparacao = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** Chave de unicidade de um nome (maiúsculas, acentos e pontuação não distinguem). Exportada: o relé usa a mesma. */
export const chaveDeNome = chaveDeComparacao

const ALVO_NAO_E_O_AUTOR = ['recado', 'amizade', 'depoimento', 'selo', 'relacao', 'comunidade-gestao', 'pagina-gestao']

/**
 * Regras que o esquema fechado não alcança: auto-referência, campos que dependem de outro, prazos da enquete.
 * @returns {{ caminho: string, mensagem: string } | null}
 */
export function regrasEntreCampos(objeto) {
  const { tipo, autor, criadoEm, corpo } = objeto
  if (ALVO_NAO_E_O_AUTOR.includes(tipo) && corpo.alvo === autor) return falha('objeto.corpo.alvo', 'um rover não faz isso consigo mesmo')
  switch (tipo) {
    case 'comunidade-criar':
    case 'comunidade-atualizar': {
      const chaves = corpo.categorias.map(chaveDeComparacao)
      if (new Set(chaves).size !== chaves.length) return falha('objeto.corpo.categorias', 'tem categorias repetidas')
      return null
    }
    case 'comunidade-gestao': {
      const comMotivo = ACOES_COM_MOTIVO.includes(corpo.acao)
      if (comMotivo && corpo.motivo === null) return falha('objeto.corpo.motivo', 'expulsar e banir exigem um motivo')
      if (!comMotivo && corpo.motivo !== null) return falha('objeto.corpo.motivo', 'só expulsar e banir levam motivo')
      return null
    }
    case 'comunidade-posse': {
      if (corpo.acao === 'transferir' && corpo.novoDono === null) return falha('objeto.corpo.novoDono', 'transferir exige o novo dono')
      if (corpo.acao === 'encerrar' && corpo.novoDono !== null) return falha('objeto.corpo.novoDono', 'encerrar não leva novo dono')
      if (corpo.novoDono === autor) return falha('objeto.corpo.novoDono', 'o dono não transfere para si mesmo')
      return null
    }
    case 'topico': {
      const e = corpo.enquete
      if (e === null) return null
      const chaves = e.opcoes.map(chaveDeComparacao)
      if (new Set(chaves).size !== chaves.length) return falha('objeto.corpo.enquete.opcoes', 'tem opções repetidas')
      if (e.encerraEm < criadoEm + L.enqueteDuracaoMinS || e.encerraEm > criadoEm + L.enqueteDuracaoMaxS) {
        return falha('objeto.corpo.enquete.encerraEm', 'a enquete dura de 1 hora a 30 dias')
      }
      return null
    }
    case 'comunidade-vocabulario': {
      // Chave única por lista, e rótulo único por lista sem distinguir maiúscula nem acento.
      for (const [nome, itens] of [['etiquetas', corpo.etiquetas], ['status', corpo.status]]) {
        if (new Set(itens.map((i) => i.chave)).size !== itens.length) return falha(`objeto.corpo.${nome}`, 'tem chaves repetidas')
        if (new Set(itens.map((i) => chaveDeComparacao(i.rotulo))).size !== itens.length) return falha(`objeto.corpo.${nome}`, 'tem rótulos repetidos')
      }
      return null
    }
    case 'topico-gestao': {
      const mover = corpo.acao === 'mover'
      if (mover && corpo.comunidade === null) return falha('objeto.corpo.comunidade', 'mover exige a comunidade de destino')
      if (!mover && (corpo.comunidade !== null || corpo.categoria !== null)) {
        return falha('objeto.corpo.comunidade', 'só mover leva comunidade e categoria')
      }
      return null
    }
    default:
      return null
  }
}
