// SPDX-License-Identifier: AGPL-3.0-or-later
// Links dentro de texto livre (objetos "0.3"). A rede NÃO busca link nenhum: o relé não faz pedido de saída e o cliente não deve
// pré-visualizar. Aqui só se decide o que pode aparecer escrito: só https, domínio de verdade, sem rastreador.
import { LIMITES_SOCIAIS } from './limites.js'

const QUALQUER_ESQUEMA = /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s]*/g
// Esquemas sem "//" que executam ou embutem conteúdo. "Data: hoje" é texto comum, então `data:` só vale com cara de MIME.
const ESQUEMA_PERIGOSO_SEM_BARRAS = /\b(?:javascript|vbscript)\s*:|\bdata:[a-z]+\/[a-z]|\b(?:file|blob):(?:\/|https?)/i
const PONTUACAO_FINAL = /[.,;:!?)\]}'"]+$/

const ENCURTADORES = new Set([
  'bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 't.ly', 'shorturl.at'
])
const PARAMETROS_DE_RASTREIO = new Set([
  'fbclid', 'gclid', 'dclid', 'msclkid', 'mc_eid', 'mc_cid', 'igshid', 'yclid', '_hsenc', '_hsmi', 'ref_src', 's_cid', 'wickedid', 'vero_id'
])
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/
const ROTULO = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/** Devolve a frase do problema de UM link, ou null se ele serve. `bruto` é o link como escrito no texto. */
export function problemaDoLink(bruto) {
  const esquema = bruto.slice(0, bruto.indexOf(':')).toLowerCase()
  if (esquema !== 'https') return 'só aceita links https'
  const link = bruto.replace(PONTUACAO_FINAL, '')
  if ([...link].length > LIMITES_SOCIAIS.linkCaracteres) return `tem um link de mais de ${LIMITES_SOCIAIS.linkCaracteres} caracteres`
  let u
  try { u = new URL(link) } catch { return 'tem um link malformado' }
  if (u.username !== '' || u.password !== '') return 'tem um link com usuário e senha'
  if (u.port !== '') return 'tem um link com porta'
  const host = u.hostname
  if (IPV4.test(host) || host.includes(':') || host.startsWith('[')) return 'tem um link para endereço IP'
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return 'tem um link para rede local'
  const rotulos = host.split('.')
  if (rotulos.length < 2 || rotulos.some((r) => !ROTULO.test(r))) return 'tem um link com domínio inválido'
  if (rotulos.some((r) => r.startsWith('xn--'))) return 'tem um link com domínio internacionalizado (xn--), que a rede não aceita'
  if (ENCURTADORES.has(host.replace(/^www\./, ''))) return 'tem um link de encurtador'
  for (const chave of u.searchParams.keys()) {
    const k = chave.toLowerCase()
    if (k.startsWith('utm_') || PARAMETROS_DE_RASTREIO.has(k)) return 'tem um link com parâmetro de rastreamento'
  }
  return null
}

/** Os links do texto, como escritos (qualquer `esquema://...`). */
export const linksDo = (texto) => texto.match(QUALQUER_ESQUEMA) ?? []

/**
 * Regra de links dos textos "0.3": só https, sem rastreador, sem esquema perigoso, no máximo `max`.
 * @returns {string | null}
 */
export function validarLinks(texto, max) {
  if (ESQUEMA_PERIGOSO_SEM_BARRAS.test(texto)) return 'tem um endereço de esquema perigoso'
  const links = linksDo(texto)
  if (links.length > max) return max === 0 ? 'não pode ter links' : `tem links demais (o máximo é ${max})`
  for (const l of links) {
    const problema = problemaDoLink(l)
    if (problema) return problema
  }
  return null
}
