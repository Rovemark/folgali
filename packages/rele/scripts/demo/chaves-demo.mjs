// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaves da demonstração. A única coisa secreta é a SEMENTE do emissor de demonstração (32 bytes), que mora só no cofre de segredos de quem opera.
// Com ela se obtém o emissor (a chave privada Ed25519 é a própria semente) e, por derivação, as chaves de cada rover de pelúcia.
// Derivar em vez de guardar é o que torna a semeadura idempotente: rodar de novo reencontra os mesmos rovers e continua a cadeia
// de cada um, sem arquivo de chaves em lugar nenhum. Quem tem a semente já pode emitir atestado para qualquer um, então as chaves
// derivadas dos rovers não ampliam o que um vazamento da semente entrega.
import { createHmac, randomBytes } from 'node:crypto'
import { chavePrivadaDeSemente, chavePublicaDe, deB64u, paraB64u } from '../../../protocolo/src/index.js'

export const novaSemente = () => paraB64u(randomBytes(32))

/** Lê a semente (43 caracteres em base64url) do texto de um arquivo ou do cofre de segredos. Lança sem ecoar o conteúdo. */
export function lerSemente(texto) {
  let bytes
  try { bytes = deB64u(String(texto).trim()) } catch { bytes = null }
  if (!bytes || bytes.length !== 32) throw new Error('a semente do emissor precisa ter 32 bytes em base64url (43 caracteres)')
  return bytes
}

export function emissorDe(semente) {
  const chavePrivada = chavePrivadaDeSemente(semente)
  return { chavePrivada, chavePublica: chavePublicaDe(chavePrivada) }
}

const mestre = (semente) => createHmac('sha256', semente).update('rover-network/demo/rovers/v1').digest()
const derivar = (m, rotulo) => createHmac('sha256', m).update(rotulo).digest()

/** O rover de demonstração `slug` da `geracao`: uid e dois pares de chaves (rede e aprovação), sempre os mesmos para a mesma semente. */
export function roverDe(semente, slug, geracao = 1) {
  const m = mestre(semente)
  const base = `g${geracao}/${slug}`
  const par = (rotulo) => {
    const chavePrivada = chavePrivadaDeSemente(derivar(m, `${base}/${rotulo}`))
    return { chavePrivada, chavePublica: chavePublicaDe(chavePrivada) }
  }
  return { slug, uid: `rvr_${paraB64u(derivar(m, `${base}/uid`).subarray(0, 16))}`, rede: par('rede'), aprovacao: par('aprovacao') }
}
