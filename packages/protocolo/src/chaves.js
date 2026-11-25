// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaves Ed25519 do protocolo. A chave pública viaja como base64url dos 32 bytes crus (43 caracteres),
// a assinatura como base64url dos 64 bytes (86 caracteres). Toda assinatura leva um prefixo de DOMÍNIO,
// para uma assinatura feita para um fim (objeto) nunca valer em outro (atestado, aprovação).
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto'
import { deB64u, paraB64u } from './canonico.js'

/** Prefixo de domínio de um uso de assinatura numa versão do protocolo. Objeto e atestado 0.1 seguem assinados com o prefixo 0.1. */
export const dominioDe = (versao, uso) => `rover-network/${versao}/${uso}\n`

/**
 * Prefixo de domínio de um OBJETO. Na 0.3 (e na 0.4, das mensagens) cada tipo tem o seu (`rover-network/0.3/objeto/<tipo>\n`), para uma assinatura feita
 * para um recado nunca valer como tópico. Na 0.1 e na 0.2 o prefixo é um só para todos os tipos.
 */
export const dominioDoObjeto = (versao, tipo) => dominioDe(versao, versao === '0.1' || versao === '0.2' ? 'objeto' : `objeto/${tipo}`)

// Os domínios dos artefatos da 0.2, que a 0.3 mantém (a credencial de leitura não mudou). Para as demais versões use `dominioDe`.
const V02 = '0.2'
export const DOMINIOS = Object.freeze({
  objeto: dominioDe(V02, 'objeto'),
  atestadoHandle: dominioDe(V02, 'atestado-handle'),
  aprovacao: dominioDe(V02, 'aprovacao-humana'),
  autorizacao: dominioDe(V02, 'autorizacao-permanente'),
  politica: dominioDe(V02, 'politica-da-pessoa'),
  revogacao: dominioDe(V02, 'revogar-autorizacao'),
  leitura: dominioDe(V02, 'leitura')
})

const PREFIXO_SPKI = Buffer.from('302a300506032b6570032100', 'hex')
const PREFIXO_PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex')

export const CHAVE_PUBLICA_RE = /^[A-Za-z0-9_-]{43}$/
export const ASSINATURA_RE = /^[A-Za-z0-9_-]{86}$/

/** Gera um par novo. A pública vai para a rede; a privada é um KeyObject que nunca sai do processo. */
export function gerarParDeChaves() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return { chavePublica: publicaDeKeyObject(publicKey), chavePrivada: privateKey }
}

export function publicaDeKeyObject(keyObject) {
  const der = keyObject.export({ format: 'der', type: 'spki' })
  return paraB64u(der.subarray(der.length - 32))
}

export function chavePrivadaDeSemente(semente32) {
  if (!Buffer.isBuffer(semente32) || semente32.length !== 32) throw new TypeError('a semente tem 32 bytes')
  return createPrivateKey({ key: Buffer.concat([PREFIXO_PKCS8, semente32]), format: 'der', type: 'pkcs8' })
}

export function chavePublicaDe(privada) {
  return publicaDeKeyObject(createPublicKey(privada))
}

const cacheDePublicas = new Map()
const TETO_DO_CACHE = 2000

/** Importa a chave pública crua. Devolve null se não for base64url canônico de exatamente 32 bytes. */
export function importarPublica(texto) {
  const guardada = cacheDePublicas.get(texto)
  if (guardada) return guardada
  let obj
  try {
    const cru = deB64u(texto)
    if (cru.length !== 32) return null
    obj = createPublicKey({ key: Buffer.concat([PREFIXO_SPKI, cru]), format: 'der', type: 'spki' })
  } catch {
    return null
  }
  if (cacheDePublicas.size >= TETO_DO_CACHE) cacheDePublicas.delete(cacheDePublicas.keys().next().value)
  cacheDePublicas.set(texto, obj)
  return obj
}

export function assinar(dominio, bytes, chavePrivada) {
  return paraB64u(sign(null, Buffer.concat([Buffer.from(dominio, 'utf8'), bytes]), chavePrivada))
}

/** Qualquer entrada malformada (tipo errado, base64 torto, tamanho errado, chave inválida) dá false, nunca exceção. */
export function verificarAssinatura(dominio, bytes, assinaturaB64u, chavePublicaB64u) {
  try {
    return verify(
      null,
      Buffer.concat([Buffer.from(dominio, 'utf8'), bytes]),
      importarPublica(chavePublicaB64u),
      deB64u(assinaturaB64u)
    )
  } catch {
    return false
  }
}

// Chave de ordem pequena (identidade, ordem 2, 4 ou 8) deixa qualquer um forjar assinatura "dela".
// Teste empírico: a assinatura com R = ponto identidade e S = 0 só passa quando k*A = 0, o que acontece
// com chance de pelo menos 1/8 por mensagem numa chave de ordem pequena e nunca numa chave comum.
// Com 128 mensagens, o falso negativo fica abaixo de 1 em 10^7.
const ASSINATURA_DA_IDENTIDADE = Buffer.concat([Buffer.from([1]), Buffer.alloc(63)])
const MENSAGENS_DE_SONDA = Array.from({ length: 128 }, (_, i) => Buffer.from(`sonda-chave-fraca-${i}`))

export function chaveDeOrdemPequena(chavePublicaB64u) {
  const pub = importarPublica(chavePublicaB64u)
  for (const m of MENSAGENS_DE_SONDA) {
    try {
      if (verify(null, m, pub, ASSINATURA_DA_IDENTIDADE)) return true
    } catch {
      return true
    }
  }
  return false
}
