// SPDX-License-Identifier: AGPL-3.0-or-later
// Camada de OPERAÇÃO do relé hospedado: o que o relé de referência deixa para quem o coloca atrás de um proxy.
// Não mexe nas regras do protocolo nem em http.js. Envolve o servidor que `criarServidor` devolve e acrescenta:
//   - a origem de cada pedido pelo X-Forwarded-For do proxy, para a rajada por origem não cair num balde único (o do proxy);
//   - CORS fechado: só as origens listadas recebem permissão do navegador; o resto do mundo (outros servidores, o app)
//     não depende de CORS e segue normal;
//   - cabeçalhos de segurança em toda resposta;
//   - a administração (/v1/admin) some para quem chega pelo proxy: ela só responde a quem fala direto com o contêiner;
//   - o documento de descoberta /.well-known/rover-network.
// Nada aqui lê corpo, grava log ou guarda endereço.
import { ErroDoProtocolo, VERSAO_PROTOCOLO } from '../../protocolo/src/index.js'

const ORIGEM_RE = /^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i
const CAMINHO_DE_DESCOBERTA = '/.well-known/rover-network'
const SEIS_MESES_S = 15_552_000

/** Lê uma lista de origens separadas por vírgula. Origem é esquema, host e porta: sem barra, sem caminho, sem curinga. */
export function lerOrigens(texto) {
  const lista = String(texto ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  for (const o of lista) {
    if (!ORIGEM_RE.test(o)) throw new Error(`origem de CORS inválida: "${o}". Use esquema e host, como https://rede.exemplo.com, sem barra no fim e sem curinga.`)
  }
  return [...new Set(lista.map((o) => o.toLowerCase()))]
}

/**
 * Quem é o autor do pedido, para a rajada. Atrás de um proxy confiável, é o ÚLTIMO endereço de X-Forwarded-For (o que o proxy
 * mais próximo acrescentou: o que veio antes pode ter sido escrito pelo cliente). Sem o cabeçalho, vale a conexão.
 */
export function origemPorProxy(req) {
  const cab = req.headers['x-forwarded-for']
  if (typeof cab === 'string') {
    const ultimo = cab.split(',').pop().trim()
    if (ultimo && ultimo.length <= 64) return ultimo
  }
  return req.socket.remoteAddress ?? 'desconhecida'
}

/** Quem chegou por proxy leva pelo menos um destes cabeçalhos; quem fala direto com o contêiner não leva nenhum. */
const veioPorProxy = (req) => ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'forwarded'].some((h) => req.headers[h] !== undefined)

const CABECALHOS_DE_SEGURANCA = Object.freeze({
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-resource-policy': 'same-site',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()'
})

const json = (res, status, corpo, extra = {}) => {
  const texto = JSON.stringify(corpo)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(texto),
    'cache-control': 'no-store',
    'x-rover-protocolo': VERSAO_PROTOCOLO,
    ...extra
  })
  res.end(texto)
}

/**
 * Envolve `servidor` (o `http.Server` de criarServidor). Chame DEPOIS de criarServidor e antes ou depois de listen().
 * @param {import('node:http').Server} servidor
 * @param {object} o
 * @param {string[]} [o.origensPermitidas]   origens com permissão de CORS; vazio = ninguém (nenhum cabeçalho de CORS sai)
 * @param {boolean} [o.atrasDeProxy]          true quando o TLS e a porta pública são de um proxy que controlamos
 * @param {() => object} [o.descoberta]       devolve o documento de /.well-known/rover-network; sem ele a rota não existe
 */
export function operar(servidor, { origensPermitidas = [], atrasDeProxy = false, descoberta = null } = {}) {
  const permitidas = new Set(origensPermitidas)
  const originais = servidor.listeners('request')
  servidor.removeAllListeners('request')

  servidor.on('request', (req, res) => {
    for (const [nome, valor] of Object.entries(CABECALHOS_DE_SEGURANCA)) res.setHeader(nome, valor)
    if (atrasDeProxy) res.setHeader('strict-transport-security', `max-age=${SEIS_MESES_S}`)
    if (permitidas.size) res.setHeader('vary', 'Origin')

    const origem = typeof req.headers.origin === 'string' ? req.headers.origin.toLowerCase() : null
    const origemOk = origem !== null && permitidas.has(origem)

    // Pré-voo do navegador: responde aqui, sem tocar no relé e sem gastar a rajada.
    if (req.method === 'OPTIONS' && origem !== null && req.headers['access-control-request-method'] !== undefined) {
      if (!origemOk) {
        return json(res, 403, { erro: { codigo: 'origem_nao_permitida', mensagem: 'Esta origem não pode chamar o relé pelo navegador.' } })
      }
      res.writeHead(204, {
        'access-control-allow-origin': origem,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-max-age': '600',
        vary: 'Origin'
      })
      return res.end()
    }
    if (origemOk) {
      res.setHeader('access-control-allow-origin', origem)
      res.setHeader('access-control-expose-headers', 'retry-after, x-rover-protocolo')
    }

    const caminho = (req.url ?? '').split('?')[0]

    if (atrasDeProxy && (caminho === '/v1/admin' || caminho.startsWith('/v1/admin/')) && veioPorProxy(req)) {
      return json(res, 404, new ErroDoProtocolo('nao_encontrado').paraJson())
    }

    if (descoberta && caminho === CAMINHO_DE_DESCOBERTA) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, new ErroDoProtocolo('metodo_nao_permitido').paraJson(), { allow: 'GET, HEAD' })
      const texto = JSON.stringify(descoberta())
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(texto),
        'cache-control': 'public, max-age=300',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'"
      })
      return res.end(req.method === 'HEAD' ? undefined : texto)
    }

    for (const ouvinte of originais) ouvinte.call(servidor, req, res)
  })
  return servidor
}

/** 0.6.0: `RELE_AUTORIZACAO_PERMANENTE`: ausente ou `sim` liga (o padrão da 0.6.0), `nao` desliga, outro valor é erro. */
export function autorizacaoPermanenteDe(env) {
  if (!['', undefined, 'sim', 'nao'].includes(env.RELE_AUTORIZACAO_PERMANENTE)) throw new Error('RELE_AUTORIZACAO_PERMANENTE aceita só `sim` ou `nao` (ou fique de fora: ligada).')
  return env.RELE_AUTORIZACAO_PERMANENTE !== 'nao'
}

/**
 * 0.6.0: `RELE_EMISSORES_DE_AGENTES`: as chaves dos emissores ABERTOS (serviços de agents de fora), por vírgula. Cada uma precisa estar em
 * `RELE_EMISSORES`: o selo de agent de fora só vale para quem o relé já confia. Ausente ou vazia: nenhum.
 */
export function emissoresDeAgentesDe(env, emissores) {
  const lista = (env.RELE_EMISSORES_DE_AGENTES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  for (const e of lista) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(e)) throw new Error('RELE_EMISSORES_DE_AGENTES tem uma chave que não é uma chave pública em base64url (43 caracteres).')
    if (!emissores.includes(e)) throw new Error('RELE_EMISSORES_DE_AGENTES tem uma chave que não está em RELE_EMISSORES.')
  }
  return [...new Set(lista)]
}
