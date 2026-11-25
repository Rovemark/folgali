// SPDX-License-Identifier: AGPL-3.0-or-later
// A chave com que o emissor conta os registros de uma origem de conexão (decisão do Arquiteto de 24/11/2026):
//   - IPv4: o endereço;
//   - IPv6: o bloco /64 (os primeiros quatro grupos). Um provedor entrega um /64 inteiro a cada cliente, então contar por endereço
//     deixaria um só cliente registrar 2^64 vezes;
//   - IPv4 dentro de IPv6 (::ffff:a.b.c.d, como o Node mostra conexões IPv4 num socket de duas pilhas): o IPv4;
//   - outra coisa (a origem desconhecida, um nome): como veio.
// A chave fica só na memória, como a origem.
import { isIPv4, isIPv6 } from 'node:net'

/** Os oito grupos de um IPv6 válido, como números. */
function grupos(ip) {
  let texto = ip
  const extra = []
  // IPv4 embutido no fim (2001:db8::1.2.3.4): vira os dois últimos grupos
  const v4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(texto)
  if (v4) {
    const [a, b, c, d] = v4[1].split('.').map(Number)
    extra.push((a << 8) | b, (c << 8) | d)
    texto = texto.slice(0, -v4[1].length)
    if (texto.endsWith(':') && !texto.endsWith('::')) texto = texto.slice(0, -1)
  }
  const [esq, dir] = texto.includes('::') ? texto.split('::') : [texto, null]
  const parte = (s) => (s ? s.split(':').filter((x) => x !== '').map((h) => parseInt(h, 16)) : [])
  const a = parte(esq)
  const b = [...parte(dir), ...extra]
  const meio = dir === null ? [] : new Array(8 - a.length - b.length).fill(0)
  return [...a, ...meio, ...b]
}

export function chaveDeOrigem(origem) {
  const bruto = String(origem)
  const ip = bruto.replace(/^\[|\]$/g, '').replace(/%.*$/, '')
  if (isIPv4(ip)) return ip
  if (!isIPv6(ip)) return bruto
  const g = grupos(ip.toLowerCase())
  // ::ffff:a.b.c.d (IPv4 mapeado): conta como o IPv4
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join('.')
  return `${g.slice(0, 4).map((x) => x.toString(16)).join(':')}::/64`
}
