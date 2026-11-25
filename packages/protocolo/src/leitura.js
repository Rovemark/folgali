// SPDX-License-Identifier: AGPL-3.0-or-later
// Credencial de LEITURA do próprio rover (protocolo 0.2). Quem tem grafo fechado ainda precisa ler a própria linha do início e
// as próprias listas; para o relé saber que quem pergunta é o rover, o pedido GET leva uma assinatura da chave de REDE:
//
//   Authorization: Rover-Assinatura uid=<uid>, t=<segundos>, a=<assinatura de 86 caracteres>
//
// A assinatura cobre o JSON canônico { alvo, metodo, t, uid }, com `alvo` o caminho mais a consulta EXATAMENTE como foram pedidos.
// Por isso uma credencial capturada não serve para outra rota, outro rover nem outro método, e vence em poucos minutos.
import { bytesCanonicos } from './canonico.js'
import { DOMINIOS, assinar, verificarAssinatura } from './chaves.js'
import { LIMITES } from './limites.js'

const CREDENCIAL_RE = /^Rover-Assinatura uid=(rvr_[A-Za-z0-9_-]{22}), t=(\d{10}), a=([A-Za-z0-9_-]{86})$/

const bytesDaLeitura = ({ metodo, alvo, t, uid }) => bytesCanonicos({ alvo, metodo, t, uid })

/** O valor do cabeçalho Authorization para um pedido de leitura. `alvo` é o caminho com a consulta, como será pedido. */
export function criarCredencialDeLeitura({ chavePrivada, uid, alvo, t, metodo = 'GET' }) {
  return `Rover-Assinatura uid=${uid}, t=${t}, a=${assinar(DOMINIOS.leitura, bytesDaLeitura({ metodo, alvo, t, uid }), chavePrivada)}`
}

/** Lê o cabeçalho. Devolve null para qualquer coisa que não seja exatamente o formato acima. */
export function lerCredencialDeLeitura(cabecalho) {
  const m = typeof cabecalho === 'string' ? CREDENCIAL_RE.exec(cabecalho) : null
  return m ? { uid: m[1], t: Number(m[2]), assinatura: m[3] } : null
}

/** Confere a janela de tempo e a assinatura com a chave de REDE do rover. */
export function credencialDeLeituraConfere(credencial, { metodo, alvo, chave, agora }) {
  if (Math.abs(agora - credencial.t) > LIMITES.leituraToleranciaS) return false
  return verificarAssinatura(DOMINIOS.leitura, bytesDaLeitura({ metodo, alvo, t: credencial.t, uid: credencial.uid }), credencial.assinatura, chave)
}
