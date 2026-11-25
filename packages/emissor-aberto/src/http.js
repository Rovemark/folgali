// SPDX-License-Identifier: AGPL-3.0-or-later
// A camada HTTP do serviço do emissor aberto (node:http, sem framework). As mesmas regras do relé:
//   - corpo com teto de bytes, JSON estrito, tipo de conteúdo exigido, rota por tabela fechada;
//   - erro sempre no formato { erro: { codigo, mensagem, campo? } }, sem pilha e sem eco do que foi enviado;
//   - o log recebe só método, rota (o padrão, nunca o caminho: o segredo do link mora no caminho), status e duração;
//   - rajada por origem em memória. Nenhum endereço vai a disco.
// Rotas: /v1/agentes/... (registro, eu, atos, info, emissores.json, reivindicacoes/:segredo, :uid) e /saude.
import { createServer } from 'node:http'
import { ErroDoProtocolo, LIMITES, RAJADA_PADRAO, VERSAO_PROTOCOLO } from '../../protocolo/src/index.js'

const LIMITE_DE_URL = 2048

const enviar = (res, status, corpo, extra = {}) => {
  const texto = JSON.stringify(corpo)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(texto),
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'",
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-rover-protocolo': VERSAO_PROTOCOLO,
    ...extra
  })
  res.end(texto)
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json\s*(;|$)/i.test(String(req.headers['content-type'] ?? ''))) return reject(new ErroDoProtocolo('tipo_de_conteudo'))
    const declarado = Number(req.headers['content-length'])
    if (Number.isFinite(declarado) && declarado > LIMITES.corpoHttpBytes) return reject(new ErroDoProtocolo('corpo_grande'))
    const pedacos = []
    let total = 0
    req.on('data', (p) => {
      total += p.length
      if (total > LIMITES.corpoHttpBytes) { reject(new ErroDoProtocolo('corpo_grande')); req.destroy(); return }
      pedacos.push(p)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(pedacos).toString('utf8'))) } catch { reject(new ErroDoProtocolo('json_invalido')) }
    })
    req.on('error', () => reject(new ErroDoProtocolo('json_invalido')))
  })
}

/** Balde de fichas por origem, só na memória: `capacidade` pedidos de uma vez, recarga de `porSegundo`. */
export function baldeDeFichas({ capacidade, porSegundo, relogio = () => Date.now() / 1000, teto = 50_000 }) {
  const mapa = new Map()
  return (origem) => {
    const agora = relogio()
    const antigo = mapa.get(origem)
    const fichas = antigo ? Math.min(capacidade, antigo.fichas + (agora - antigo.em) * porSegundo) : capacidade
    mapa.delete(origem)
    if (mapa.size >= teto) mapa.delete(mapa.keys().next().value)
    if (fichas < 1) { mapa.set(origem, { fichas, em: agora }); return Math.ceil((1 - fichas) / porSegundo) }
    mapa.set(origem, { fichas: fichas - 1, em: agora })
    return 0
  }
}

/** A origem de um pedido: o endereço da conexão, ou, atrás de um proxy seu, o último X-Forwarded-For. */
export const origemDireta = (req) => req.socket.remoteAddress ?? 'desconhecida'
export const origemPorProxy = (req) => {
  const xff = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return xff.at(-1) ?? origemDireta(req)
}

/**
 * O tratador de pedidos (req, res). Fica separado do servidor para um teste o pôr atrás de https.
 * @param {import('./emissor.js').EmissorAberto} emissor
 */
export function tratadorDoEmissor(emissor, { registrar = () => {}, rajada = RAJADA_PADRAO, origemDe = origemDireta, relogioDeRajada } = {}) {
  const tentar = baldeDeFichas({ ...rajada, relogio: relogioDeRajada })
  const credencialDe = (req) => (req.headers.authorization === undefined ? null : { cabecalho: req.headers.authorization, metodo: req.method, alvo: req.url })
  const rotas = [
    ['GET', /^\/saude$/, '/saude', () => [200, emissor.saude()]],
    ['POST', /^\/v1\/agentes\/registro$/, '/v1/agentes/registro', async (req) => [201, await emissor.registrar(await lerCorpo(req), { origem: origemDe(req) })]],
    ['GET', /^\/v1\/agentes\/eu$/, '/v1/agentes/eu', (req) => [200, emissor.eu(credencialDe(req))]],
    ['POST', /^\/v1\/agentes\/atos$/, '/v1/agentes/atos', async (req) => [200, await emissor.agir(await lerCorpo(req))]],
    ['GET', /^\/v1\/agentes\/info$/, '/v1/agentes/info', () => [200, emissor.info()]],
    ['GET', /^\/v1\/agentes\/emissores\.json$/, '/v1/agentes/emissores.json', () => [200, emissor.listaDeRevogados()]],
    ['GET', /^\/v1\/agentes\/reivindicacoes\/([^/]+)$/, '/v1/agentes/reivindicacoes/:segredo', (req, m) => [200, emissor.reivindicacao(m[1])]],
    ['GET', /^\/v1\/agentes\/([^/]+)$/, '/v1/agentes/:uid', (req, m) => [200, emissor.publico(m[1])]]
  ]
  return async (req, res) => {
    const inicio = process.hrtime.bigint()
    let nomeDaRota = '?'
    let status
    try {
      const espera = tentar(origemDe(req))
      if (espera > 0) throw new ErroDoProtocolo('limite_de_taxa', { retryAfterS: espera })
      if (req.url.length > LIMITE_DE_URL) throw new ErroDoProtocolo('nao_encontrado')
      let caminho
      try { caminho = new URL(req.url, 'http://emissor.local').pathname } catch { throw new ErroDoProtocolo('nao_encontrado') }
      const candidatas = rotas.filter(([, re]) => re.test(caminho))
      const rota = candidatas.find(([metodo]) => metodo === req.method)
      if (!rota) throw new ErroDoProtocolo(candidatas.length ? 'metodo_nao_permitido' : 'nao_encontrado')
      nomeDaRota = rota[2]
      const m = rota[1].exec(caminho).map((p, i) => {
        if (!i) return p
        try { return decodeURIComponent(p) } catch { throw new ErroDoProtocolo('nao_encontrado') }
      })
      const [codigo, corpo] = await rota[3](req, m)
      status = codigo
      enviar(res, codigo, corpo)
    } catch (e) {
      const erro = e instanceof ErroDoProtocolo ? e : null
      status = erro?.status ?? 500
      if (!erro) registrar({ nivel: 'erro', evento: 'erro_interno', tipo: e?.name ?? 'Error' })
      enviar(res, status, (erro ?? new ErroDoProtocolo('erro_interno')).paraJson(), erro?.retryAfterS ? { 'retry-after': String(erro.retryAfterS) } : {})
    } finally {
      registrar({ nivel: 'info', evento: 'pedido', metodo: req.method, rota: nomeDaRota, status, ms: Number((process.hrtime.bigint() - inicio) / 1_000_000n) })
    }
  }
}

export function criarServidorDoEmissor(emissor, opcoes = {}) {
  const servidor = createServer(tratadorDoEmissor(emissor, opcoes))
  servidor.requestTimeout = 10_000
  servidor.headersTimeout = 5_000
  servidor.keepAliveTimeout = 5_000
  return servidor
}
