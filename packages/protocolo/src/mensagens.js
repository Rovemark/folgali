// SPDX-License-Identifier: AGPL-3.0-or-later
// A cifra das mensagens privadas (revisão 0.4.0, PROTOCOLO.md seção 15.5). Tudo com node:crypto, sem dependência.
//
//   carta      = canônico({ conversa, criadoEm, de, iv, para, texto })
//   assinatura = Ed25519(chave de REDE do remetente, "rover-network/0.4/carta\n" || carta)
//   claro      = canônico({ assinatura, texto }) completado com espaços até múltiplo de 256 bytes
//   Z          = X25519(privada de cifra própria, pública de cifra do outro)            (Z todo zero é recusado)
//   contexto   = canônico({ chaveDe, chavePara, conversa, criadoEm, de, para })
//   K          = HKDF-SHA256(Z, sal, "rover-network/0.4/mensagem\n" || contexto, 32)
//   cifrado    = AES-256-GCM(K, iv, claro, AAD = contexto) || etiqueta
//
// O segredo Z é o mesmo dos dois lados: o remetente também decifra o que enviou. A carta assinada dentro da cifra é o que deixa o
// destinatário denunciar provando a autoria sem o relé ter chave nenhuma.
import { createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { bytesCanonicos, canonicalizar, ehObjetoSimples, paraB64u } from './canonico.js'
import { assinar, dominioDe, verificarAssinatura } from './chaves.js'
import { bytesDeB64u } from './corpos-mensagens.js'
import { ErroDoProtocolo } from './erros.js'
import { LIMITES_DE_MENSAGEM as LM, VERSAO_DE_MENSAGENS } from './limites.js'
import { validarTexto } from './texto.js'

export const DOMINIO_DA_CARTA = dominioDe(VERSAO_DE_MENSAGENS, 'carta')
export const DOMINIO_DA_CHAVE_DA_MENSAGEM = dominioDe(VERSAO_DE_MENSAGENS, 'mensagem')

const SPKI_X25519 = Buffer.from('302a300506032b656e032100', 'hex')
const PKCS8_X25519 = Buffer.from('302e020100300506032b656e04220420', 'hex')

/** As regras de texto do corpo de uma mensagem (as da 0.3), aplicadas pelo CLIENTE antes de cifrar e depois de decifrar. */
export const REGRAS_DO_TEXTO_DA_MENSAGEM = Object.freeze({ ...LM.texto, multilinha: true, urls: LM.linksPorMensagem, v3: true })

// ---------- chaves X25519 ----------

const publicaCrua = (keyObject) => {
  const der = keyObject.export({ format: 'der', type: 'spki' })
  return paraB64u(der.subarray(der.length - 32))
}

/** Par novo de CIFRA (X25519), separado das chaves de rede e de aprovação. A privada é um KeyObject que nunca sai do processo. */
export function gerarParDeCifra() {
  const { publicKey, privateKey } = generateKeyPairSync('x25519')
  return { chavePublica: publicaCrua(publicKey), chavePrivada: privateKey }
}

export function chavePrivadaDeCifraDeSemente(semente32) {
  if (!Buffer.isBuffer(semente32) || semente32.length !== 32) throw new TypeError('a semente tem 32 bytes')
  return createPrivateKey({ key: Buffer.concat([PKCS8_X25519, semente32]), format: 'der', type: 'pkcs8' })
}

export const chavePublicaDeCifraDe = (privada) => publicaCrua(createPublicKey(privada))

function importarPublicaDeCifra(texto) {
  const cru = bytesDeB64u(texto, 32)
  if (!cru) return null
  try {
    return createPublicKey({ key: Buffer.concat([SPKI_X25519, cru]), format: 'der', type: 'spki' })
  } catch {
    return null
  }
}

/** Z = X25519(privada, pública). Chave inválida ou de ordem pequena (Z todo zero) é `chave_fraca`. */
export function segredoDeCifra(chavePrivada, chavePublicaB64u) {
  const publica = importarPublicaDeCifra(chavePublicaB64u)
  let z = null
  try {
    z = publica ? diffieHellman({ privateKey: chavePrivada, publicKey: publica }) : null
  } catch {
    z = null
  }
  if (!z || z.every((b) => b === 0)) throw new ErroDoProtocolo('chave_fraca', { campo: 'chave' })
  return z
}

/** A chave pública de cifra serve? Fraca é a que não importa ou que, com qualquer outra, dá segredo todo zero (ordem pequena). */
export function chaveDeCifraFraca(chavePublicaB64u) {
  try {
    segredoDeCifra(gerarParDeCifra().chavePrivada, chavePublicaB64u)
    return false
  } catch {
    return true
  }
}

// ---------- a carta ----------

const camposDaCarta = ({ conversa, criadoEm, de, iv, para, texto }) => ({ conversa, criadoEm, de, iv, para, texto })

/** Assina a carta com a chave de REDE do remetente. */
export const assinarCarta = (campos, chavePrivadaDeRede) => assinar(DOMINIO_DA_CARTA, bytesCanonicos(camposDaCarta(campos)), chavePrivadaDeRede)

/** A carta confere com a chave de REDE do remetente? Entrada torta dá false, nunca exceção. */
export function cartaConfere(campos, assinatura, chavePublicaDeRede) {
  try {
    return verificarAssinatura(DOMINIO_DA_CARTA, bytesCanonicos(camposDaCarta(campos)), assinatura, chavePublicaDeRede)
  } catch {
    return false
  }
}

// ---------- a chave da mensagem e a cifra ----------

const contextoDe = ({ chaveDe, chavePara, conversa, criadoEm, de, para }) => bytesCanonicos({ chaveDe, chavePara, conversa, criadoEm, de, para })

function chaveDaMensagem(z, sal, contexto) {
  return Buffer.from(hkdfSync('sha256', z, sal, Buffer.concat([Buffer.from(DOMINIO_DA_CHAVE_DA_MENSAGEM, 'utf8'), contexto]), 32))
}

function completar(bytes) {
  const tamanho = Math.max(LM.blocoBytes, Math.ceil(bytes.length / LM.blocoBytes) * LM.blocoBytes)
  return Buffer.concat([bytes, Buffer.alloc(tamanho - bytes.length, 0x20)])
}

function aesGcm(k, iv, claro, contexto) {
  const c = createCipheriv('aes-256-gcm', k, iv, { authTagLength: LM.etiquetaBytes })
  c.setAAD(contexto)
  return Buffer.concat([c.update(claro), c.final(), c.getAuthTag()])
}

/**
 * Monta o corpo de uma `mensagem`. Aplica as regras de texto ANTES de cifrar (o relé não as vê) e lança `esquema` se o texto não passa.
 * Devolve também a chave da mensagem e a assinatura da carta: o aplicativo da pessoa usa as duas para conferir, com `cifraConfere`, que o
 * `cifrado` que ela aprova contém o texto que ela leu.
 * @returns {{ corpo: object, chaveDaMensagem: Buffer, assinatura: string }}
 */
export function cifrarMensagem({ texto, conversa, de, para, criadoEm, chavePrivadaDeRede, chavePrivadaDeCifra, chavePublicaDeCifraDoOutro, sal = randomBytes(LM.salBytes), iv = randomBytes(LM.ivBytes) }) {
  const m = validarTexto(texto, REGRAS_DO_TEXTO_DA_MENSAGEM)
  if (m) throw new ErroDoProtocolo('esquema', { campo: 'texto', detalhe: `Campo texto: ${m}.` })
  const chaveDe = chavePublicaDeCifraDe(chavePrivadaDeCifra)
  const chavePara = chavePublicaDeCifraDoOutro
  const ivB64u = paraB64u(iv)
  const assinatura = assinarCarta({ conversa, criadoEm, de, iv: ivB64u, para, texto }, chavePrivadaDeRede)
  const contexto = contextoDe({ chaveDe, chavePara, conversa, criadoEm, de, para })
  const k = chaveDaMensagem(segredoDeCifra(chavePrivadaDeCifra, chavePara), sal, contexto)
  const claro = completar(bytesCanonicos({ assinatura, texto }))
  const cifrado = paraB64u(aesGcm(k, iv, claro, contexto))
  return { corpo: { conversa, para, chaveDe, chavePara, sal: paraB64u(sal), iv: ivB64u, cifrado }, chaveDaMensagem: k, assinatura }
}

const decodificador = new TextDecoder('utf-8', { fatal: true })

/** Do texto claro completado ao `{ assinatura, texto }`, exigindo a forma canônica exata. null se não for. */
function lerClaro(claro) {
  let fim = claro.length
  while (fim > 0 && claro[fim - 1] === 0x20) fim--
  let s
  let v
  try {
    s = decodificador.decode(claro.subarray(0, fim))
    v = JSON.parse(s)
  } catch {
    return null
  }
  if (!ehObjetoSimples(v) || Object.keys(v).sort().join(',') !== 'assinatura,texto') return null
  if (typeof v.assinatura !== 'string' || typeof v.texto !== 'string') return null
  try {
    if (canonicalizar(v) !== s) return null
  } catch {
    return null
  }
  return { assinatura: v.assinatura, texto: v.texto }
}

/**
 * Decifra uma `mensagem` com a privada de cifra de um dos dois lados (quem recebeu ou quem enviou) e confere a carta com a chave de REDE do
 * remetente. Qualquer falha é "ilegível": quem chama não mostra nada da mensagem.
 * @returns {{ ok: true, texto: string, assinatura: string, dentroDasRegras: boolean } | { ok: false, motivo: string }}
 */
export function decifrarMensagem(objeto, { chavePrivadaDeCifra, chavePublicaDeRedeDoRemetente }) {
  const falhou = (motivo) => ({ ok: false, motivo })
  if (objeto?.tipo !== 'mensagem' || !ehObjetoSimples(objeto.corpo)) return falhou('nao_e_mensagem')
  const { conversa, para, chaveDe, chavePara, sal, iv, cifrado } = objeto.corpo
  const de = objeto.autor
  const minha = chavePublicaDeCifraDe(chavePrivadaDeCifra)
  const doOutro = minha === chavePara ? chaveDe : minha === chaveDe ? chavePara : null
  if (doOutro === null) return falhou('outra_chave')
  const salB = bytesDeB64u(sal, LM.salBytes)
  const ivB = bytesDeB64u(iv, LM.ivBytes)
  const cifradoB = bytesDeB64u(cifrado)
  if (!salB || !ivB || !cifradoB || cifradoB.length <= LM.etiquetaBytes) return falhou('forma')
  const contexto = contextoDe({ chaveDe, chavePara, conversa, criadoEm: objeto.criadoEm, de, para })
  let claro
  try {
    const k = chaveDaMensagem(segredoDeCifra(chavePrivadaDeCifra, doOutro), salB, contexto)
    const d = createDecipheriv('aes-256-gcm', k, ivB, { authTagLength: LM.etiquetaBytes })
    d.setAAD(contexto)
    d.setAuthTag(cifradoB.subarray(cifradoB.length - LM.etiquetaBytes))
    claro = Buffer.concat([d.update(cifradoB.subarray(0, cifradoB.length - LM.etiquetaBytes)), d.final()])
  } catch {
    return falhou('cifra')
  }
  const lido = lerClaro(claro)
  if (!lido) return falhou('forma_do_claro')
  if (!cartaConfere({ conversa, criadoEm: objeto.criadoEm, de, iv, para, texto: lido.texto }, lido.assinatura, chavePublicaDeRedeDoRemetente)) {
    return falhou('carta')
  }
  return { ok: true, texto: lido.texto, assinatura: lido.assinatura, dentroDasRegras: validarTexto(lido.texto, REGRAS_DO_TEXTO_DA_MENSAGEM) === null }
}

/**
 * Para o aplicativo da pessoa, antes de aprovar: o `cifrado` deste objeto é a cifra deste texto e desta assinatura com esta chave da
 * mensagem? Se o rover mentir sobre a chave, o destinatário não decifra (vê "ilegível"), nunca um texto diferente do aprovado.
 */
export function cifraConfere(objeto, { texto, assinatura, chaveDaMensagem: k }) {
  try {
    const { conversa, para, chaveDe, chavePara, iv, cifrado } = objeto.corpo
    const contexto = contextoDe({ chaveDe, chavePara, conversa, criadoEm: objeto.criadoEm, de: objeto.autor, para })
    const esperado = aesGcm(k, bytesDeB64u(iv, LM.ivBytes), completar(bytesCanonicos({ assinatura, texto })), contexto)
    const recebido = bytesDeB64u(cifrado)
    return recebido !== null && recebido.length === esperado.length && timingSafeEqual(recebido, esperado)
  } catch {
    return false
  }
}
