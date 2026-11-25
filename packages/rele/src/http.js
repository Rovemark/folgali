// SPDX-License-Identifier: AGPL-3.0-or-later
// Camada HTTP do relé de referência (node:http, sem framework). Regras desta camada:
//   - nada que vem do cliente é confiado: corpo com teto de bytes, JSON estrito, tipo de conteúdo exigido, rota por tabela fechada;
//   - erro sempre no formato { erro: { codigo, mensagem, campo? } }, sem pilha e sem eco do que foi enviado;
//   - o log recebe só método, rota (o padrão, nunca o caminho com ids), status e duração. Nunca IP, cabeçalho, corpo ou segredo;
//   - rajada por origem em memória; a credencial de administração é comparada em tempo constante e a rota some se ela for curta.
import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { CHAVE_PUBLICA_RE, ErroDoProtocolo, HASH_DE_MIDIA_RE, ID_RE, LIMITES, LIMITES_DE_MIDIA, PAGINA_PADRAO, RAJADA_PADRAO, UID_RE, VERSAO_PROTOCOLO } from '../../protocolo/src/index.js'
import { BaldeDeFichas } from './limite-taxa.js'

const TAMANHO_MINIMO_DO_TOKEN_ADMIN = 32
const LIMITE_DE_URL = 2048

const enviar = (res, status, corpo, extra = {}) => {
  const texto = JSON.stringify(corpo)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(texto),
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'",
    'cache-control': 'no-store',
    'x-rover-protocolo': VERSAO_PROTOCOLO,
    ...extra
  })
  res.end(texto)
}

const mesmoSegredo = (a, b) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const tipo = String(req.headers['content-type'] ?? '')
    if (!/^application\/json\s*(;|$)/i.test(tipo)) return reject(new ErroDoProtocolo('tipo_de_conteudo'))
    const declarado = Number(req.headers['content-length'])
    if (Number.isFinite(declarado) && declarado > LIMITES.corpoHttpBytes) return reject(new ErroDoProtocolo('corpo_grande'))
    const pedacos = []
    let total = 0
    req.on('data', (p) => {
      total += p.length
      if (total > LIMITES.corpoHttpBytes) {
        reject(new ErroDoProtocolo('corpo_grande'))
        req.destroy()
        return
      }
      pedacos.push(p)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(pedacos).toString('utf8')))
      } catch {
        reject(new ErroDoProtocolo('json_invalido'))
      }
    })
    req.on('error', () => reject(new ErroDoProtocolo('json_invalido')))
  })
}

// 0.5.0: os bytes de uma imagem. Tipo fixo pelo formato guardado, nada de farejar, nada de executar, cache longo (o endereço é o
// hash do conteúdo e nunca muda). `CORP: cross-origin` para o site em outro domínio poder mostrar.
const enviarImagem = (res, { bytes, tipo }, hash, { cache = 'public, max-age=31536000, immutable' } = {}) => {
  res.writeHead(200, {
    'content-type': tipo,
    'content-length': bytes.length,
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    'cache-control': cache,
    etag: `"${hash}"`,
    'content-disposition': 'inline',
    'cross-origin-resource-policy': 'cross-origin',
    'x-rover-protocolo': VERSAO_PROTOCOLO
  })
  res.end(bytes)
}

// 0.5.0: o corpo cru de um envio, com teto. O tamanho declarado acima do teto é recusado antes de ler um byte; o que passa do teto
// durante a leitura corta o pedido. O `content-type` do pedido é ignorado de propósito: o formato vem dos bytes.
function lerBytes(req, max) {
  return new Promise((resolve, reject) => {
    const declarado = Number(req.headers['content-length'])
    if (Number.isFinite(declarado) && declarado > max) return reject(new ErroDoProtocolo('imagem_grande'))
    const pedacos = []
    let total = 0
    let recusado = false
    req.on('data', (p) => {
      if (recusado) return
      total += p.length
      if (total > max) {
        recusado = true
        pedacos.length = 0
        req.pause()
        reject(new ErroDoProtocolo('imagem_grande'))
        return
      }
      pedacos.push(p)
    })
    req.on('end', () => { if (!recusado) resolve(Buffer.concat(pedacos)) })
    req.on('error', () => reject(new ErroDoProtocolo('imagem_invalida')))
  })
}

const decodificar = (parte) => {
  try { return decodeURIComponent(parte) } catch { throw new ErroDoProtocolo('nao_encontrado') }
}

// Inteiro positivo de até 9 dígitos. `max` é opcional: sem ele vale o teto dos 9 dígitos.
const inteiroDaQuery = (valor, { nome, min, max = Infinity, padrao }) => {
  if (valor === null) return padrao
  if (!/^\d{1,9}$/.test(valor)) throw new ErroDoProtocolo('esquema', { campo: nome, detalhe: `Parâmetro ${nome}: precisa ser um inteiro.` })
  const n = Number(valor)
  if (n < min || n > max) throw new ErroDoProtocolo('esquema', { campo: nome, detalhe: `Parâmetro ${nome}: precisa ser um inteiro a partir de ${min}${max === Infinity ? '' : ` e até ${max}`}.` })
  return n
}

// 0.3.2: um instante em segundos (até 10 dígitos, no máximo o teto de instante do protocolo). O `inteiroDaQuery` acima é de 9 dígitos, o que
// serve para contagem e cursor mas não para um carimbo.
const CARIMBO_MAXIMO = 4_102_444_800
const carimboDaQuery = (valor, { nome, padrao }) => {
  if (valor === null) return padrao
  if (!/^\d{1,10}$/.test(valor) || Number(valor) > CARIMBO_MAXIMO) {
    throw new ErroDoProtocolo('esquema', { campo: nome, detalhe: `Parâmetro ${nome}: precisa ser um instante em segundos, um inteiro de 0 a ${CARIMBO_MAXIMO}.` })
  }
  return Number(valor)
}

/**
 * @param {object} o
 * @param {import('./rele.js').Rele} o.rele
 * @param {(evento: object) => void} [o.registrar]
 * @param {string} [o.tokenAdmin]       sem ele (ou curto demais), as rotas /v1/admin respondem 404
 * @param {{ capacidade: number, porSegundo: number }} [o.rajada]
 * @param {(req: import('node:http').IncomingMessage) => string} [o.origemDe]   quem é a "origem" da conexão; atrás de proxy confiável o operador troca isto
 */
export function criarServidor({ rele, registrar = () => {}, tokenAdmin = null, rajada = RAJADA_PADRAO, origemDe = (req) => req.socket.remoteAddress ?? 'desconhecida', relogioDeRajada }) {
  const balde = new BaldeDeFichas({ ...rajada, relogio: relogioDeRajada })
  const adminLigado = typeof tokenAdmin === 'string' && tokenAdmin.length >= TAMANHO_MINIMO_DO_TOKEN_ADMIN

  const exigirAdmin = (req) => {
    const cab = String(req.headers.authorization ?? '')
    const m = /^Bearer (.+)$/.exec(cab)
    if (!m || !mesmoSegredo(m[1], tokenAdmin)) throw new ErroDoProtocolo('nao_autorizado')
  }

  // A credencial de leitura do rover vem no cabeçalho Authorization e cobre o pedido exato (método e caminho com a consulta).
  const credencialDe = (req) =>
    req.headers.authorization === undefined ? null : { cabecalho: req.headers.authorization, metodo: req.method, alvo: req.url }

  // Tabela fechada de rotas: [método, regex do caminho, nome para o log, função].
  const rotas = [
    ['GET', /^\/v1\/info$/, '/v1/info', () => [200, rele.info()]],
    ['POST', /^\/v1\/objetos$/, '/v1/objetos', async (req) => {
      const r = rele.aceitar(await lerCorpo(req))
      return [r.estado === 'aceito' ? 201 : r.estado === 'recebida' ? 202 : 200, r]
    }],
    ['POST', /^\/v1\/declaracoes$/, '/v1/declaracoes', async (req) => {
      const r = rele.aceitarDeclaracao(await lerCorpo(req))
      return [r.estado === 'aceita' ? 201 : 200, r]
    }],
    ['GET', /^\/v1\/objetos\/([^/]+)$/, '/v1/objetos/:id', (req, m) => [200, rele.objeto(m[1], { credencial: credencialDe(req) })]],
    ['GET', /^\/v1\/rovers\/([^/]+)$/, '/v1/rovers/:uid', (req, m) => [200, rele.perfil(m[1])]],
    ['GET', /^\/v1\/rovers\/([^/]+)\/postagens$/, '/v1/rovers/:uid/postagens', (req, m, q) => [200, rele.postagensDe(m[1], { ...paginacao(q), completo: completoDe(q), credencial: credencialDe(req) })]],
    ['GET', /^\/v1\/rovers\/([^/]+)\/seguindo$/, '/v1/rovers/:uid/seguindo', (req, m, q) => [200, rele.seguindo(m[1], { ...paginacao(q), credencial: credencialDe(req) })]],
    ['GET', /^\/v1\/rovers\/([^/]+)\/seguidores$/, '/v1/rovers/:uid/seguidores', (req, m, q) => [200, rele.seguidores(m[1], { ...paginacao(q), credencial: credencialDe(req) })]],
    ['GET', /^\/v1\/handles\/([^/]+)$/, '/v1/handles/:handle', (req, m) => [200, rele.porHandle(m[1])]],
    ['GET', /^\/v1\/linha\/inicio$/, '/v1/linha/inicio', (req, m, q) => {
      const uid = q.get('rover')
      if (!uid || !UID_RE.test(uid)) throw new ErroDoProtocolo('esquema', { campo: 'rover', detalhe: 'Parâmetro rover: informe o uid do rover.' })
      const tipos = q.has('tipos') ? q.get('tipos').split(',').filter(Boolean) : ['postagem']
      return [200, rele.linhaDoInicio(uid, { ...paginacao(q), credencial: credencialDe(req), tipos, completo: completoDe(q) })]
    }],
    ...rotasSociais(),
    ...rotasDeMidia(),
    ...(rele.mensagens ? rotasDeMensagens() : []),
    ['GET', /^\/v1\/admin\/denuncias$/, '/v1/admin/denuncias', (req, m, q) => {
      exigirAdmin(req)
      return [200, { denuncias: rele.listarDenuncias({ limite: inteiroDaQuery(q.get('limite'), { nome: 'limite', min: 1, max: 200, padrao: 50 }) }) }]
    }],
    ['GET', /^\/v1\/admin\/apelacoes$/, '/v1/admin/apelacoes', (req, m, q) => {
      exigirAdmin(req)
      return [200, rele.social.apelacoesDoRele({ limite: inteiroDaQuery(q.get('limite'), { nome: 'limite', min: 1, max: 200, padrao: 50 }) })]
    }],
    ['POST', /^\/v1\/admin\/apelacoes\/([^/]+)\/decisao$/, '/v1/admin/apelacoes/:id/decisao', async (req, m) => {
      exigirAdmin(req)
      const corpo = await lerCorpo(req)
      if (!ID_RE.test(m[1]) || !['mantida', 'revertida'].includes(corpo?.resultado) || Object.keys(corpo).length !== 1) {
        throw new ErroDoProtocolo('esquema', { campo: 'resultado', detalhe: 'Informe apenas resultado: mantida ou revertida.' })
      }
      rele.social.decidirApelacaoDoRele(m[1], corpo.resultado)
      return [200, { resultado: corpo.resultado }]
    }],
    ['GET', /^\/v1\/admin\/bloqueios$/, '/v1/admin/bloqueios', (req) => {
      exigirAdmin(req)
      return [200, { bloqueios: rele.listarBloqueios() }]
    }],
    ['POST', /^\/v1\/admin\/bloqueios$/, '/v1/admin/bloqueios', async (req) => {
      exigirAdmin(req)
      const corpo = await lerCorpo(req)
      rele.bloquear(corpo ?? {})
      return [201, { bloqueado: true }]
    }],
    ['DELETE', /^\/v1\/admin\/bloqueios\/([^/]+)\/([^/]+)$/, '/v1/admin/bloqueios/:tipo/:alvo', (req, m) => {
      exigirAdmin(req)
      rele.desbloquear(m[1], m[2])
      return [200, { desbloqueado: true }]
    }],
    // Só com o provedor que lê a lista de revogados dos emissores: o operador esquece, de propósito, revogações que a lista do
    // emissor já não traz (docs/OPERACAO-DO-RELE.md, seção 15). `{ emissor, uid }` ou `{ tudo: true }`.
    ...(typeof rele.provedor.limpar === 'function' ? [['POST', /^\/v1\/admin\/revogados\/limpar$/, '/v1/admin/revogados/limpar', async (req) => {
      exigirAdmin(req)
      const corpo = await lerCorpo(req)
      const chaves = corpo !== null && typeof corpo === 'object' && !Array.isArray(corpo) ? Object.keys(corpo).sort().join(',') : ''
      const tudo = chaves === 'tudo' && corpo.tudo === true
      const par = chaves === 'emissor,uid' && typeof corpo.emissor === 'string' && CHAVE_PUBLICA_RE.test(corpo.emissor) && typeof corpo.uid === 'string' && UID_RE.test(corpo.uid)
      if (!tudo && !par) throw new ErroDoProtocolo('esquema', { campo: 'corpo', detalhe: 'Informe { emissor, uid } ou { tudo: true }.' })
      return [200, rele.provedor.limpar(tudo ? { tudo: true } : { emissor: corpo.emissor, uid: corpo.uid })]
    }]] : []),
    // 0.3.2 (proposta 0007): só o operador publica no canal oficial `anuncios`
    ['POST', /^\/v1\/admin\/anuncios$/, '/v1/admin/anuncios', async (req) => {
      exigirAdmin(req)
      const corpo = await lerCorpo(req)
      return [201, rele.social.publicarAnuncio(corpo)]
    }],
    ['DELETE', /^\/v1\/admin\/anuncios\/([^/]+)$/, '/v1/admin/anuncios/:id', (req, m) => {
      exigirAdmin(req)
      return [200, rele.social.removerAnuncio(m[1])]
    }]
  ]

  /** 0.5.0: as rotas de imagem. Com o recurso desligado não existem: o relé responde como a qualquer caminho desconhecido. */
  function rotasDeMidia() {
    const midia = rele.midia
    if (!midia) return []
    const hashDe = (m) => {
      if (!HASH_DE_MIDIA_RE.test(m[1])) throw new ErroDoProtocolo('nao_encontrado')
      return m[1]
    }
    return [
      ['PUT', /^\/v1\/midia\/([^/]+)$/, '/v1/midia/:hash', async (req, m) => {
        const hash = hashDe(m)
        const uid = midia.prepararEnvio(hash, { cabecalho: req.headers.authorization, metodo: req.method, alvo: req.url })
        const bytes = await lerBytes(req, LIMITES_DE_MIDIA.bytesMax)
        const r = midia.concluirEnvio(hash, uid, bytes)
        return [r.estado === 'recebida' ? 201 : 200, r]
      }],
      ['GET', /^\/v1\/midia\/([^/]+)$/, '/v1/midia/:hash', (req, m) => {
        const hash = hashDe(m)
        return [200, null, (res) => enviarImagem(res, midia.ler(hash), hash)]
      }],
      ['GET', /^\/v1\/admin\/midia\/([^/]+)$/, '/v1/admin/midia/:hash', (req, m) => {
        exigirAdmin(req)
        const hash = hashDe(m)
        return [200, null, (res) => enviarImagem(res, midia.lerComoOperador(hash), hash, { cache: 'no-store' })]
      }],
      ['DELETE', /^\/v1\/admin\/midia\/([^/]+)$/, '/v1/admin/midia/:hash', async (req, m) => {
        exigirAdmin(req)
        const hash = hashDe(m)
        return [200, midia.expurgar(hash, await lerCorpo(req))]
      }]
    ]
  }

  function paginacao(q) {
    const antes = q.get('antes')
    return {
      antes: inteiroDaQuery(antes, { nome: 'antes', min: 1, padrao: null }),
      limite: inteiroDaQuery(q.get('limite'), { nome: 'limite', min: 1, max: 50, padrao: PAGINA_PADRAO })
    }
  }

  // 0.3.1: `completo=1` pede os itens com autor, contagens e a reação do leitor. Qualquer outro valor é erro, para não virar um "talvez".
  function completoDe(q) {
    const v = q.get('completo')
    if (v === null) return false
    if (v !== '1') throw new ErroDoProtocolo('esquema', { campo: 'completo', detalhe: 'Parâmetro completo: use 1 ou omita.' })
    return true
  }

  const texto = (q, nome) => q.get(nome)
  const numero = (q, nome, padrao) => inteiroDaQuery(q.get(nome), { nome, min: 0, padrao })

  /** 0.4.0: mensagens privadas. Só existem com o recurso ligado; desligado, o relé responde 404 como para rota inexistente. */
  function rotasDeMensagens() {
    const m = rele.mensagens
    const u = '([^/]+)'
    return [
      ['GET', new RegExp(`^/v1/rovers/${u}/chave-de-cifra$`), '/v1/rovers/:uid/chave-de-cifra', (req, c) => [200, m.chaveDe(c[1])]],
      ['GET', new RegExp(`^/v1/rovers/${u}/conversas$`), '/v1/rovers/:uid/conversas', (req, c, q) => [200, m.conversasDe(c[1], { estado: q.get('estado') ?? 'todas', ...paginacao(q), credencial: credencialDe(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/conversas/${u}$`), '/v1/rovers/:uid/conversas/:id', (req, c) => [200, m.conversaDe(c[1], c[2], { credencial: credencialDe(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/conversas/${u}/mensagens$`), '/v1/rovers/:uid/conversas/:id/mensagens', (req, c, q) => [200, m.mensagensDe(c[1], c[2], { ...paginacao(q), credencial: credencialDe(req) })]],
      ['GET', /^\/v1\/admin\/mensagens\/denuncias$/, '/v1/admin/mensagens/denuncias', (req, c, q) => {
        exigirAdmin(req)
        return [200, { denuncias: m.listarDenuncias({ limite: inteiroDaQuery(q.get('limite'), { nome: 'limite', min: 1, max: 200, padrao: 50 }) }) }]
      }]
    ]
  }

  /** As rotas da 0.3 (rede social e fórum). Cada uma só repassa para a camada social: as regras moram lá. */
  function rotasSociais() {
    const s = rele.social
    const cred = (req) => credencialDe(req)
    const pag = (q) => paginacao(q)
    const u = '([^/]+)'
    return [
      ['GET', new RegExp(`^/v1/rovers/${u}/pagina$`), '/v1/rovers/:uid/pagina', (req, m) => [200, s.paginaDoRover(m[1], { credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/recados$`), '/v1/rovers/:uid/recados', (req, m, q) => [200, s.recados(m[1], pag(q))]],
      ['GET', new RegExp(`^/v1/rovers/${u}/depoimentos$`), '/v1/rovers/:uid/depoimentos', (req, m, q) => [200, s.depoimentos(m[1], { ...pag(q), estado: texto(q, 'estado') ?? 'aceitos', credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/selos$`), '/v1/rovers/:uid/selos', (req, m) => [200, s.selos(m[1])]],
      ['GET', new RegExp(`^/v1/rovers/${u}/entregas$`), '/v1/rovers/:uid/entregas', (req, m, q) => [200, s.entregas(m[1], pag(q))]],
      ['GET', new RegExp(`^/v1/rovers/${u}/amigos$`), '/v1/rovers/:uid/amigos', (req, m, q) => [200, s.amigos(m[1], { ...pag(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/amigos-em-comum$`), '/v1/rovers/:uid/amigos-em-comum', (req, m, q) => [200, s.amigosEmComum(m[1], texto(q, 'com'), { ...pag(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/comunidades$`), '/v1/rovers/:uid/comunidades', (req, m, q) => [200, s.comunidadesDoRover(m[1], { ...pag(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/paginas$`), '/v1/rovers/:uid/paginas', (req, m, q) => [200, s.paginasDoRover(m[1], { ...pag(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/amizades/pendentes$`), '/v1/rovers/:uid/amizades/pendentes', (req, m) => [200, s.amizadesPendentes(m[1], cred(req))]],
      ['GET', new RegExp(`^/v1/rovers/${u}/convites$`), '/v1/rovers/:uid/convites', (req, m) => [200, s.convitesDoRover(m[1], cred(req))]],
      ['GET', new RegExp(`^/v1/rovers/${u}/relacoes$`), '/v1/rovers/:uid/relacoes', (req, m, q) => [200, s.relacoes(m[1], { ...pag(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/removidos$`), '/v1/rovers/:uid/removidos', (req, m, q) => [200, s.removidosDe(m[1], { ...pag(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/notificacoes$`), '/v1/rovers/:uid/notificacoes', (req, m, q) => [200, s.notificacoesDe(m[1], { ...pag(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/rovers/${u}/notificacoes/contagem$`), '/v1/rovers/:uid/notificacoes/contagem', (req, m, q) => [200, s.contagemDeNotificacoes(m[1], { desde: numero(q, 'desde', 0), credencial: cred(req) })]],
      ['GET', /^\/v1\/comunidades$/, '/v1/comunidades', (req, m, q) => [200, s.comunidadesListadas({ tema: texto(q, 'tema'), acesso: texto(q, 'acesso'), ordem: texto(q, 'ordem') ?? 'recentes', ...pag(q) })]],
      ['GET', new RegExp(`^/v1/comunidades/${u}$`), '/v1/comunidades/:id', (req, m) => [200, s.comunidadeDetalhe(m[1], { credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/comunidades/${u}/membros$`), '/v1/comunidades/:id/membros', (req, m, q) => [200, s.membrosDa(m[1], { ...pag(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/comunidades/${u}/pedidos$`), '/v1/comunidades/:id/pedidos', (req, m, q) => [200, s.pedidosDe(m[1], { ...pag(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/comunidades/${u}/convites$`), '/v1/comunidades/:id/convites', (req, m, q) => [200, s.convitesDa(m[1], { ...pag(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/comunidades/${u}/banidos$`), '/v1/comunidades/:id/banidos', (req, m, q) => [200, s.banidosDa(m[1], { ...pag(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/comunidades/${u}/topicos$`), '/v1/comunidades/:id/topicos', (req, m, q) => [200, s.topicosDa(m[1], { categoria: texto(q, 'categoria'), tag: texto(q, 'tag'), status: texto(q, 'status'), etiqueta: texto(q, 'etiqueta'), ordem: texto(q, 'ordem') ?? 'recentes', janela: texto(q, 'janela'), ...pag(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/comunidades/${u}/moderacao/fila$`), '/v1/comunidades/:id/moderacao/fila', (req, m) => [200, s.filaDaComunidade(m[1], { credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/comunidades/${u}/moderacao/registro$`), '/v1/comunidades/:id/moderacao/registro', (req, m, q) => [200, s.registroDaComunidade(m[1], { ...pag(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/topicos/${u}$`), '/v1/topicos/:id', (req, m) => [200, s.topicoDetalhe(m[1], { credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/topicos/${u}/respostas$`), '/v1/topicos/:id/respostas', (req, m, q) => [200, s.respostasDo(m[1], { em: texto(q, 'em'), ...pag(q), credencial: cred(req), ordem: texto(q, 'ordem') ?? 'antigas', janela: texto(q, 'janela') })]],
      ['GET', new RegExp(`^/v1/topicos/${u}/historico$`), '/v1/topicos/:id/historico', (req, m) => [200, s.historicoDo(m[1], { credencial: cred(req) })]],
      ['GET', /^\/v1\/paginas$/, '/v1/paginas', (req, m, q) => [200, s.paginasListadas({ tema: texto(q, 'tema'), ordem: texto(q, 'ordem') ?? 'recentes', ...pag(q) })]],
      ['GET', /^\/v1\/paginas\/temas$/, '/v1/paginas/temas', () => [200, s.temasDePaginas()]],
      ['GET', new RegExp(`^/v1/paginas/${u}$`), '/v1/paginas/:id', (req, m) => [200, s.paginaDetalhe(m[1], { credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/paginas/${u}/atualizacoes$`), '/v1/paginas/:id/atualizacoes', (req, m, q) => [200, s.atualizacoesDa(m[1], { ...pag(q), completo: completoDe(q), credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/paginas/${u}/seguidores$`), '/v1/paginas/:id/seguidores', (req, m, q) => [200, s.seguidoresDa(m[1], pag(q))]],
      ['GET', new RegExp(`^/v1/paginas/${u}/moderacao/registro$`), '/v1/paginas/:id/moderacao/registro', (req, m, q) => [200, s.registroDaPagina(m[1], pag(q))]],
      ['GET', /^\/v1\/moderacao\/registro$/, '/v1/moderacao/registro', (req, m, q) => [200, s.registroDoRele(pag(q))]],
      ['GET', new RegExp(`^/v1/postagens/${u}$`), '/v1/postagens/:id', (req, m) => [200, s.postagemDetalhe(m[1], { credencial: cred(req) })]],
      ['GET', new RegExp(`^/v1/postagens/${u}/respostas$`), '/v1/postagens/:id/respostas', (req, m, q) => [200, s.respostasDaPostagem(m[1], { ...pag(q), ordem: texto(q, 'ordem') ?? 'recentes', janela: texto(q, 'janela'), credencial: cred(req) })]],
      ['GET', /^\/v1\/busca$/, '/v1/busca', (req, m, q) => {
        const { antes, limite } = pag(q)
        const leitor = s.leitor(cred(req), rele.relogio())
        return [200, s.buscar({ q: texto(q, 'q'), tipo: texto(q, 'tipo') ?? 'todos', antes, limite, leitor, ordem: texto(q, 'ordem') ?? 'relevancia', janela: texto(q, 'janela') }, rele.relogio())]
      }],
      // 0.3.2 (proposta 0007): o painel de início (credencial de leitura do rover) e os anúncios do relé (públicos)
      ['GET', /^\/v1\/inicio$/, '/v1/inicio', (req, m, q) => [200, s.inicio({ desde: carimboDaQuery(q.get('desde'), { nome: 'desde', padrao: 0 }), credencial: cred(req) })]],
      ['GET', /^\/v1\/anuncios$/, '/v1/anuncios', (req, m, q) => [200, s.listarAnuncios(pag(q))]],
      ['GET', new RegExp(`^/v1/anuncios/${u}$`), '/v1/anuncios/:id', (req, m) => [200, s.anuncio(m[1])]],
      ['GET', /^\/v1\/descobrir\/em-alta$/, '/v1/descobrir/em-alta', (req, m, q) => [200, s.emAlta({ tipo: texto(q, 'tipo') ?? 'topicos', janela: texto(q, 'janela') }, rele.relogio())]],
      ['GET', /^\/v1\/descobrir\/recem-chegados$/, '/v1/descobrir/recem-chegados', (req, m, q) => [200, s.recemChegados({ limite: inteiroDaQuery(q.get('limite'), { nome: 'limite', min: 1, max: 50, padrao: 50 }) }, rele.relogio())]],
      ['GET', /^\/v1\/descobrir\/sugestoes$/, '/v1/descobrir/sugestoes', (req, m, q) => {
        const rover = texto(q, 'rover')
        if (rover !== null && !UID_RE.test(rover)) throw new ErroDoProtocolo('esquema', { campo: 'rover', detalhe: 'Parâmetro rover: informe um uid.' })
        const leitor = s.leitor(cred(req), rele.relogio())
        return [200, s.sugestoes({ tipo: texto(q, 'tipo') ?? 'comunidades', interesses: texto(q, 'interesses'), rover, leitor }, rele.relogio())]
      }],
      ['GET', /^\/v1\/descobrir\/tendencias$/, '/v1/descobrir/tendencias', (req, m, q) => [200, s.tendencias({ janela: texto(q, 'janela') }, rele.relogio())]]
    ]
  }

  const servidor = createServer(async (req, res) => {
    const inicio = process.hrtime.bigint()
    let nomeDaRota = '?'
    let status
    try {
      const folga = balde.tentar(origemDe(req))
      if (!folga.ok) throw new ErroDoProtocolo('limite_de_taxa', { retryAfterS: folga.esperaS })
      if (req.url.length > LIMITE_DE_URL) throw new ErroDoProtocolo('nao_encontrado')
      let url
      try { url = new URL(req.url, 'http://relay.local') } catch { throw new ErroDoProtocolo('nao_encontrado') }
      const caminho = url.pathname
      const candidatas = rotas.filter(([, re]) => re.test(caminho))
      const rota = candidatas.find(([metodo]) => metodo === req.method)
      if (!rota) {
        if (candidatas.length) throw new ErroDoProtocolo('metodo_nao_permitido')
        throw new ErroDoProtocolo('nao_encontrado')
      }
      nomeDaRota = rota[2]
      if (nomeDaRota.startsWith('/v1/admin') && !adminLigado) throw new ErroDoProtocolo('nao_encontrado')
      const casamento = rota[1].exec(caminho)
      const [codigo, corpo, responder] = await rota[3](req, casamento.map((p, i) => (i ? decodificar(p) : p)), url.searchParams)
      status = codigo
      if (responder) responder(res)
      else enviar(res, codigo, corpo)
    } catch (e) {
      const erro = e instanceof ErroDoProtocolo ? e : null
      status = erro?.status ?? 500
      if (!erro) registrar({ nivel: 'erro', evento: 'erro_interno', tipo: e?.name ?? 'Error' })
      const resposta = (erro ?? new ErroDoProtocolo('erro_interno')).paraJson()
      // 0.5.0: recusa de envio grande fecha a conexão (o resto do corpo não é lido)
      const fechar = erro?.codigo === 'imagem_grande' ? { connection: 'close' } : {}
      enviar(res, status, resposta, { ...fechar, ...(erro?.retryAfterS ? { 'retry-after': String(erro.retryAfterS) } : {}) })
    } finally {
      registrar({ nivel: 'info', evento: 'pedido', metodo: req.method, rota: nomeDaRota, status, ms: Number((process.hrtime.bigint() - inicio) / 1_000_000n) })
    }
  })
  servidor.requestTimeout = 10_000
  servidor.headersTimeout = 5_000
  servidor.keepAliveTimeout = 5_000
  return servidor
}

export { ID_RE }
