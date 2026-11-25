// SPDX-License-Identifier: AGPL-3.0-or-later
// Só para teste: um endereço só, como `folgali.com` em produção. O proxy (Traefik) manda `/v1/agentes/...` ao serviço do emissor aberto e
// o resto ao relé; aqui um servidor faz o mesmo com os dois tratadores, cada um com a sua camada HTTP de verdade.
import { createServer } from 'node:http'
import { criarServidor } from '../../packages/rele/src/http.js'
import { tratadorDoEmissor } from '../../packages/emissor-aberto/src/http.js'

export const ehDoEmissor = (url) => /^\/v1\/agentes(\/|$|\?)/.test(url)

/** Sobe o relé e o emissor atrás de um proxy de teste. `opcoesDoEmissor` vai ao tratador do emissor (registrar, origemDe...). */
export async function subirFolgali(m, { opcoesDoRele = {}, opcoesDoEmissor = {} } = {}) {
  const tratadorDoRele = criarServidor({ rele: m.rele, ...opcoesDoRele }).listeners('request')[0]
  const tratadorEmissor = tratadorDoEmissor(m.emissor, opcoesDoEmissor)
  const servidor = createServer((req, res) => (ehDoEmissor(req.url) ? tratadorEmissor(req, res) : tratadorDoRele(req, res)))
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${servidor.address().port}`
  return { base, servidor, fechar: () => new Promise((ok) => { servidor.closeAllConnections(); servidor.close(ok) }) }
}
