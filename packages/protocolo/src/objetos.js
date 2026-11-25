// SPDX-License-Identifier: AGPL-3.0-or-later
// Objetos assinados da rede: forma, id por conteúdo, assinatura.
//
//   { v, tipo, id, autor, criadoEm, previo, corpo, assinatura }
//
// id = "ob_" + base64url(SHA-256(canônico do objeto sem id e sem assinatura)).
// assinatura = Ed25519 sobre o prefixo de domínio da versão do objeto + canônico do objeto sem assinatura (com id), com a chave de REDE do rover.
import { createHash } from 'node:crypto'
import { bytesCanonicos, ehObjetoSimples, paraB64u } from './canonico.js'
import { ASSINATURA_RE, assinar, dominioDoObjeto, verificarAssinatura } from './chaves.js'
import { CORPOS_V3, ID_RE, TOPICO_RE, UID_RE, regrasEntreCampos } from './corpos-sociais.js'
import { CORPOS_V4, regrasDeMensagem } from './corpos-mensagens.js'
import { ErroDoProtocolo } from './erros.js'
import { CORPOS_DE_MIDIA, regrasDeMidia } from './midia.js'
import { inteiro, lista, objetoFechado, opcional, ou_nulo, padrao, texto, um_de } from './esquema.js'
import {
  GRAFOS, LIMITES, MOTIVOS_DE_DENUNCIA, REACOES, TIPOS_DE_MENSAGEM, TIPOS_DE_OBJETO, TIPOS_EXIGIVEIS, VERSAO_DE_MENSAGENS, VERSAO_PROTOCOLO, VERSOES_ACEITAS,
  tipoExisteNaVersao
} from './limites.js'

// 0.4.0 (mensagens privadas): a versão e os tipos novos entram aqui, sem mexer em VERSOES_ACEITAS nem em TIPOS_DE_OBJETO (que um relé com o
// recurso desligado continua anunciando). Na 0.4 só existem os tipos de mensagem, e eles só existem na 0.4.
const VERSOES_DE_OBJETO = Object.freeze([...VERSOES_ACEITAS, VERSAO_DE_MENSAGENS])
const TIPOS_COM_MENSAGEM = Object.freeze([...TIPOS_DE_OBJETO, ...TIPOS_DE_MENSAGEM])
const tipoExiste = (tipo, versao) =>
  versao === VERSAO_DE_MENSAGENS ? TIPOS_DE_MENSAGEM.includes(tipo) : !TIPOS_DE_MENSAGEM.includes(tipo) && tipoExisteNaVersao(tipo, versao)

export { ID_RE, TOPICO_RE, UID_RE }
export const HANDLE_RE = /^[a-z0-9._]{3,30}$/

const id = padrao(ID_RE, 'um id de objeto (ob_ e 43 caracteres)')
const uid = padrao(UID_RE, 'um uid de rover (rvr_ e 22 caracteres)')
const instante = inteiro({ min: 1_700_000_000, max: 4_102_444_800 })

const umaLinha = (limites) => texto({ ...limites, multilinha: false })

const NOME_E_DESCRICAO = { nome: umaLinha(LIMITES.nome), descricao: umaLinha(LIMITES.descricao) }

// O perfil muda a cada versão. A 0.2 acrescenta o grafo e a exigência de aprovação do rover; a 0.3, a página (sobre, habilidades...).
const PERFIL_POR_VERSAO = {
  '0.1': objetoFechado(NOME_E_DESCRICAO),
  '0.2': objetoFechado({
    ...NOME_E_DESCRICAO,
    grafo: um_de(GRAFOS),
    exigirAprovacao: lista(um_de(TIPOS_EXIGIVEIS), { max: TIPOS_EXIGIVEIS.length, unicos: true })
  }),
  '0.3': CORPOS_V3.perfil
}

// Corpos até a 0.2. Na 0.3 valem os de corpos-sociais.js (links, menções e filtro ampliado nos textos; tipos sociais).
const CORPOS_ATE_V2 = {
  postagem: objetoFechado({
    titulo: opcional(umaLinha(LIMITES.titulo)),
    texto: texto({ ...LIMITES.postagem, multilinha: true, urls: LIMITES.urlsPorTexto }),
    topicos: lista(padrao(TOPICO_RE, 'um tópico (a-z, 0-9 e hífen, 2 a 24 caracteres)'), {
      max: LIMITES.topicosPorPostagem, unicos: true
    })
  }),
  resposta: objetoFechado({
    alvo: id,
    texto: texto({ ...LIMITES.resposta, multilinha: true, urls: LIMITES.urlsPorTexto })
  }),
  seguir: objetoFechado({ alvo: uid }),
  'deixar-de-seguir': objetoFechado({ alvo: uid }),
  reacao: objetoFechado({ alvo: id, reacao: um_de(REACOES) }),
  denuncia: objetoFechado({ alvo: id, motivo: um_de(MOTIVOS_DE_DENUNCIA) }),
  'remocao-pelo-autor': objetoFechado({ alvo: id })
}

/** O validador do corpo de um tipo numa versão. */
export const corpoDe = (tipo, versao) => {
  if (versao === VERSAO_DE_MENSAGENS) return CORPOS_V4[tipo]
  if (tipo === 'perfil') return PERFIL_POR_VERSAO[versao]
  return (versao === '0.3' ? CORPOS_V3[tipo] ?? CORPOS_DE_MIDIA[tipo] : undefined) ?? CORPOS_ATE_V2[tipo]
}

const ENVELOPE = objetoFechado({
  v: um_de(VERSOES_DE_OBJETO),
  tipo: um_de(TIPOS_COM_MENSAGEM),
  id,
  autor: uid,
  criadoEm: instante,
  previo: ou_nulo(id),
  corpo: () => null, // a forma do corpo é conferida pelo esquema do tipo, que exige objeto fechado
  assinatura: padrao(ASSINATURA_RE, 'uma assinatura Ed25519 em base64url (86 caracteres)')
})

export function calcularId(objeto) {
  const { id: _id, assinatura: _assinatura, ...resto } = objeto
  return `ob_${paraB64u(createHash('sha256').update(bytesCanonicos(resto)).digest())}`
}

const bytesParaAssinar = (objeto) => {
  const { assinatura: _assinatura, ...resto } = objeto
  return bytesCanonicos(resto)
}

/** Monta, calcula o id e assina. `chavePrivada` é a chave de REDE do rover. */
export function criarObjeto({ tipo, autor, criadoEm, previo = null, corpo, chavePrivada, v = VERSAO_PROTOCOLO }) {
  const base = { v, tipo, autor, criadoEm, previo, corpo }
  const comId = { ...base, id: calcularId(base) }
  return { ...comId, assinatura: assinar(dominioDoObjeto(v, tipo), bytesParaAssinar(comId), chavePrivada) }
}

/**
 * Confere a FORMA do objeto: versão, tipo, esquema fechado, regras entre campos, tamanho e id.
 * Não confere assinatura (precisa da chave) nem relógio (precisa do relógio de quem recebe).
 * @returns {{ ok: true, objeto: object } | { ok: false, erro: ErroDoProtocolo }}
 */
export function validarObjeto(valor) {
  const erro = (codigo, extra) => ({ ok: false, erro: new ErroDoProtocolo(codigo, extra) })
  if (!ehObjetoSimples(valor)) return erro('esquema', { campo: 'objeto', detalhe: 'O objeto precisa ser um objeto JSON.' })
  if (typeof valor.v === 'string' && !VERSOES_DE_OBJETO.includes(valor.v)) {
    return erro('versao_nao_suportada', { campo: 'objeto.v' })
  }
  const falhaEnvelope = ENVELOPE(valor, 'objeto')
  if (falhaEnvelope) return erro('esquema', { campo: falhaEnvelope.caminho, detalhe: `Campo ${falhaEnvelope.caminho}: ${falhaEnvelope.mensagem}.` })
  if (!tipoExiste(valor.tipo, valor.v)) {
    const detalhe = TIPOS_DE_MENSAGEM.includes(valor.tipo) || valor.v === VERSAO_DE_MENSAGENS
      ? 'Campo objeto.tipo: os tipos de mensagem só existem na versão 0.4, e a 0.4 só tem os tipos de mensagem.'
      : 'Campo objeto.tipo: este tipo só existe a partir da versão 0.3.'
    return erro('esquema', { campo: 'objeto.tipo', detalhe })
  }
  const falhaCorpo = corpoDe(valor.tipo, valor.v)(valor.corpo, 'objeto.corpo')
  if (falhaCorpo) return erro('esquema', { campo: falhaCorpo.caminho, detalhe: `Campo ${falhaCorpo.caminho}: ${falhaCorpo.mensagem}.` })
  const regra = valor.v === VERSAO_DE_MENSAGENS ? regrasDeMensagem(valor) : regrasEntreCampos(valor) ?? regrasDeMidia(valor)
  if (regra) return erro('esquema', { campo: regra.caminho, detalhe: `Campo ${regra.caminho}: ${regra.mensagem}.` })
  if (valor.tipo === 'denuncia' && valor.previo !== null) {
    return erro('esquema', { campo: 'objeto.previo', detalhe: 'Denúncia não entra na cadeia do autor: previo precisa ser null.' })
  }
  if (['seguir', 'deixar-de-seguir'].includes(valor.tipo) && valor.corpo.alvo === valor.autor) {
    return erro('esquema', { campo: 'objeto.corpo.alvo', detalhe: 'Um rover não segue a si mesmo.' })
  }
  if (calcularId(valor) !== valor.id) return erro('id_incorreto', { campo: 'objeto.id' })
  return { ok: true, objeto: valor }
}

export function assinaturaDoObjetoConfere(objeto, chavePublica) {
  return verificarAssinatura(dominioDoObjeto(objeto.v, objeto.tipo), bytesParaAssinar(objeto), objeto.assinatura, chavePublica)
}
