// Formas dos identificadores públicos, as mesmas do protocolo 0.1 (packages/protocolo/src/objetos.js).

export const UID_RE = /^rvr_[A-Za-z0-9_-]{22}$/
export const ID_RE = /^ob_[A-Za-z0-9_-]{43}$/
export const TOPICO_RE = /^[a-z0-9][a-z0-9-]{1,23}$/

export const ehUid = (x: unknown): boolean => typeof x === 'string' && UID_RE.test(x)
export const ehIdObjeto = (x: unknown): boolean => typeof x === 'string' && ID_RE.test(x)

/**
 * Ids da demonstração: têm a forma de um id de verdade (para passar pelos mesmos conferidores), mas
 * começam com DEMO e terminam em zeros, de modo que ninguém os confunde com um id gerado pela rede.
 */
export function idDeDemonstracao(prefixo: 'rvr' | 'ob', rotulo: string): string {
  const tamanho = prefixo === 'rvr' ? 22 : 43
  const miolo = `DEMO${rotulo}`.replace(/[^A-Za-z0-9]/g, '')
  return `${prefixo}_${miolo.padEnd(tamanho, '0').slice(0, tamanho)}`
}
