// SPDX-License-Identifier: AGPL-3.0-or-later
// Corpos dos objetos de mensagem privada (revisão 0.4.0, PROTOCOLO.md seção 15). Esquema FECHADO em todos.
// Só existem com `"v": "0.4"` e sempre com `previo: null`. A cifra (carta, chave da mensagem) mora em mensagens.js.
import { deB64u } from './canonico.js'
import { ASSINATURA_RE } from './chaves.js'
import { ID_RE, UID_RE } from './corpos-sociais.js'
import { falha, objetoFechado, ou_nulo, padrao, texto, um_de } from './esquema.js'
import { DECISOES_DE_CONVERSA, LIMITES_DE_MENSAGEM as LM, MOTIVOS_DE_DENUNCIA_V3 } from './limites.js'

const id = padrao(ID_RE, 'um id de objeto (ob_ e 43 caracteres)')
const uid = padrao(UID_RE, 'um uid de rover (rvr_ e 22 caracteres)')

/** Bytes de um base64url ESTRITO com exatamente `n` bytes, ou null. */
export function bytesDeB64u(valor, n) {
  try {
    const b = deB64u(valor)
    return n === undefined || b.length === n ? b : null
  } catch {
    return null
  }
}

const bytesFixos = (n, descricao) => (v, caminho) =>
  typeof v === 'string' && bytesDeB64u(v, n) !== null ? null : falha(caminho, `precisa ser ${descricao}`)

const chaveDeCifra = bytesFixos(32, 'uma chave X25519 em base64url (32 bytes, 43 caracteres)')

/** O tamanho do `cifrado` revela só a faixa de 256 bytes: etiqueta de 16 bytes mais um múltiplo de 256, de 256 a 8192. */
export function tamanhoDeCifradoConfere(valor) {
  if (typeof valor !== 'string') return false
  const b = bytesDeB64u(valor)
  if (!b) return false
  const n = b.length - LM.etiquetaBytes
  return n >= LM.blocoBytes && n <= LM.textoClaroMaxBytes && n % LM.blocoBytes === 0
}

const cifrado = (v, caminho) => (tamanhoDeCifradoConfere(v) ? null : falha(caminho, `precisa ser o texto cifrado em base64url, com 16 bytes de etiqueta e um múltiplo de ${LM.blocoBytes} bytes, de ${LM.blocoBytes} a ${LM.textoClaroMaxBytes}`))

/**
 * O texto que o destinatário revela numa denúncia. NÃO passa pelo filtro de texto: precisa ser exatamente o que o remetente assinou,
 * inclusive o que o filtro recusaria (é o abusivo que se denuncia). Só se exige Unicode bem formado e o teto de bytes.
 */
const textoRevelado = (v, caminho) => {
  if (typeof v !== 'string' || v.length === 0) return falha(caminho, 'precisa ser o texto revelado, não vazio')
  if (!v.isWellFormed()) return falha(caminho, 'precisa ser Unicode bem formado')
  if (Buffer.byteLength(v, 'utf8') > LM.reveladoMaxBytes) return falha(caminho, `passa de ${LM.reveladoMaxBytes} bytes`)
  return null
}

export const CORPOS_V4 = Object.freeze({
  'chave-de-cifra': objetoFechado({ chave: chaveDeCifra }),
  'conversa-pedir': objetoFechado({ alvo: uid, texto: texto({ ...LM.pedido, multilinha: true, urls: 0, v3: true }) }),
  'conversa-decidir': objetoFechado({ conversa: id, decisao: um_de(DECISOES_DE_CONVERSA) }),
  mensagem: objetoFechado({
    conversa: id,
    para: uid,
    chaveDe: chaveDeCifra,
    chavePara: chaveDeCifra,
    sal: bytesFixos(LM.salBytes, `um sal de ${LM.salBytes} bytes em base64url`),
    iv: bytesFixos(LM.ivBytes, `um iv de ${LM.ivBytes} bytes em base64url`),
    cifrado
  }),
  'conversa-apagar': objetoFechado({ conversa: id, mensagem: ou_nulo(id) }),
  'mensagem-denuncia': objetoFechado({
    mensagem: id,
    motivo: um_de(MOTIVOS_DE_DENUNCIA_V3),
    texto: textoRevelado,
    assinatura: padrao(ASSINATURA_RE, 'a assinatura da carta (86 caracteres)')
  })
})

/**
 * Regras que o esquema não alcança. Fora da cadeia: `previo` é sempre null.
 * @returns {{ caminho: string, mensagem: string } | null}
 */
export function regrasDeMensagem(objeto) {
  const { tipo, autor, corpo } = objeto
  if (objeto.previo !== null) return falha('objeto.previo', 'os objetos de mensagem ficam fora da cadeia do autor: previo precisa ser null')
  if (tipo === 'conversa-pedir' && corpo.alvo === autor) return falha('objeto.corpo.alvo', 'um rover não pede conversa a si mesmo')
  if (tipo === 'mensagem' && corpo.para === autor) return falha('objeto.corpo.para', 'um rover não manda mensagem a si mesmo')
  return null
}
