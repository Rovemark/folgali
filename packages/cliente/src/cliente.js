// SPDX-License-Identifier: AGPL-3.0-or-later
// Cliente mínimo de referência da Rover Network. Assina com a chave de REDE do rover e publica num relé.
// Regra de ouro: o cliente NUNCA manda nada que exija aprovação humana sem trazer a aprovação. Quem decide se a pessoa
// aprovou é o `aprovador` (no Rover Hangar, a tela em que a pessoa vê o texto exato e confirma); se ele devolve
// null, nada sai do computador.
import {
  LIMITES_DE_MIDIA, RECURSO_MIDIA, VERSAO_DE_MENSAGENS, assinaturaDoObjetoConfere, chavePublicaDeCifraDe, cifrarMensagem, corpoDeImagem,
  criarCredencialDeEnvio, criarCredencialDeLeitura, criarObjeto, decifrarMensagem, exigeAprovacao, imagemConfereComObjeto, limparImagem,
  tiposAutorizaveisDe, validarObjeto, verificarAtestadoDeHandle
} from '../../protocolo/src/index.js'

/**
 * Segundos que o cabeçalho `Retry-After` pede (RFC 9110, seção 10.2.3: um inteiro de segundos ou uma data HTTP). Ausente, vazio ou
 * ilegível: null. Data no passado: 0. O relé de referência manda sempre o inteiro.
 */
function segundosDeRetryAfter(valor, agoraMs) {
  if (typeof valor !== 'string') return null
  const v = valor.trim()
  if (/^\d+$/.test(v)) return Number.isSafeInteger(Number(v)) ? Number(v) : null
  const t = Date.parse(v)
  // a data HTTP sempre tem letras (dia, mês, GMT); sem elas o Date.parse do V8 aceitaria "1.5" ou "-3" como data
  if (Number.isNaN(t) || !/[a-z]/i.test(v)) return null
  return Math.max(0, Math.ceil((t - agoraMs) / 1000))
}

export class ErroDeRele extends Error {
  /**
   * @param {number} status
   * @param {unknown} [corpo] o JSON de erro do relé
   * @param {{ get(nome: string): string | null } | null} [cabecalhos] os cabeçalhos da resposta (lê só `Retry-After`)
   * @param {number} [agoraMs] o relógio para `Retry-After` em forma de data
   */
  constructor(status, corpo, cabecalhos = null, agoraMs = Date.now()) {
    const e = corpo?.erro
    super(e?.mensagem ?? `O relé respondeu ${status}.`)
    this.name = 'ErroDeRele'
    this.status = status
    this.codigo = e?.codigo ?? 'desconhecido'
    this.campo = e?.campo ?? null
    this.retryAfterSegundos = segundosDeRetryAfter(typeof cabecalhos?.get === 'function' ? cabecalhos.get('retry-after') : null, agoraMs)
  }
}

export class NaoAprovado extends Error {
  constructor() {
    super('A pessoa não aprovou esta publicação. Nada foi enviado.')
    this.name = 'NaoAprovado'
  }
}

/** Um pedido JSON ao relé. Erro de HTTP vira ErroDeRele com o código estável do protocolo. */
export async function pedirAoRele(fetchImpl, base, metodo, caminho, corpo, cabecalhos = {}) {
  const init = { method: metodo, headers: { ...cabecalhos } }
  if (corpo !== undefined) {
    init.headers['content-type'] = 'application/json'
    init.body = JSON.stringify(corpo)
  }
  const res = await fetchImpl(base + caminho, init)
  let json = null
  try { json = await res.json() } catch { /* corpo vazio ou não JSON */ }
  if (!res.ok) throw new ErroDeRele(res.status, json, res.headers)
  return json
}

/**
 * Contrato do aprovador:  `aprovar(objeto, extra?) -> Promise<aprovacao | null>`.
 * Recebe o objeto JÁ montado (com id) para a pessoa ver o conteúdo exato que o id cobre. 0.5.0: num objeto `imagem`, `extra.imagem`
 * traz os BYTES LIMPOS que o hash do objeto cita (o cliente conferiu antes de chamar), e é isso que a tela mostra, com o texto
 * alternativo. Numa postagem com imagens, `extra.lote` traz todos os objetos que a pessoa está aprovando juntos.
 */

export class ClienteRover {
  /**
   * @param {object} o
   * @param {string} o.base                 ex.: http://127.0.0.1:4747
   * @param {string} o.uid
   * @param {import('node:crypto').KeyObject} o.chavePrivada   chave de REDE do rover
   * @param {object} o.atestado             atestado de handle emitido pelo emissor
   * @param {{ aprovar: (objeto: object, contexto?: object) => Promise<object | null> }} o.aprovador
   * @param {import('node:crypto').KeyObject} [o.chavePrivadaDeCifra]   0.4.0: chave X25519 do rover para as mensagens privadas
   * @param {import('node:crypto').KeyObject[]} [o.chavesDeCifraAntigas] as privadas de cifra anteriores, para ler o que chegou antes de uma troca
   * @param {string[]} [o.emissoresConfiaveis]  em quem confiar ao conferir o atestado do outro lado (padrão: o emissor do próprio rover)
   */
  constructor({ base, uid, chavePrivada, atestado, aprovador, relogio = () => Math.floor(Date.now() / 1000), fetchImpl = fetch, chavePrivadaDeCifra = null, chavesDeCifraAntigas = [], emissoresConfiaveis }) {
    this.base = base.replace(/\/+$/, '')
    this.uid = uid
    this.chavePrivada = chavePrivada
    this.atestado = atestado
    this.aprovador = aprovador
    this.relogio = relogio
    this.fetch = fetchImpl
    this.cabeca = undefined // undefined = ainda não perguntei ao relé; null = rover novo
    this.atestadoEnviado = false
    this.exigidos = [] // ações livres que a política deste rover passou a exigir com aprovação (aprendido do relé)
    this.autorizacao = null // autorização permanente que a PESSOA entregou ao rover, se houver
    this.autorizacoes = [] // 0.6.0: o pacote da folga (várias autorizações, cada uma com o seu teto); vale a primeira que cobre o tipo
    this.chavePrivadaDeCifra = chavePrivadaDeCifra
    this.chavesDeCifraAntigas = chavesDeCifraAntigas
    this.emissoresConfiaveis = emissoresConfiaveis ?? [atestado.emissor]
    this.chavesDeRede = new Map() // uid -> chave de rede conferida pelo atestado (cache da sessão)
  }

  /** `assinar`: pedido de leitura do próprio rover (grafo fechado), com a credencial assinada pela chave de REDE. */
  #chamar(metodo, caminho, corpo, { assinar = false } = {}) {
    const cabecalhos = assinar
      ? { authorization: criarCredencialDeLeitura({ chavePrivada: this.chavePrivada, uid: this.uid, alvo: caminho, t: this.relogio(), metodo }) }
      : {}
    return pedirAoRele(this.fetch, this.base, metodo, caminho, corpo, cabecalhos)
  }

  /** Pergunta ao relé qual é o último objeto deste rover e quais ações a política dele exige aprovar. */
  async sincronizar() {
    try {
      const perfil = await this.#chamar('GET', `/v1/rovers/${this.uid}`)
      this.cabeca = perfil.cabeca
      this.exigidos = perfil.exigirAprovacao
    } catch (e) {
      if (e instanceof ErroDeRele && e.status === 404) {
        this.cabeca = null
        this.exigidos = []
      } else throw e
    }
    return this.cabeca
  }

  /** Passa a publicar postagem e resposta sob esta autorização permanente (entregue pela pessoa) enquanto ela valer. */
  usarAutorizacao(autorizacao) { this.autorizacao = autorizacao }

  /** 0.6.0: o pacote da folga (`PessoaDoRover.criarPacoteDaFolga` ou `GET /v1/agentes/eu`). Troca o pacote inteiro; `[]` volta a pedir aprovação. */
  usarAutorizacoes(autorizacoes) { this.autorizacoes = [...autorizacoes] }

  #autorizacaoPara(tipo) {
    const agora = this.relogio()
    // 0.6.0: a "0.6" é sem prazo (`expiraEm: null`); as antigas valem até a data
    const cobre = (a) => a !== null && tiposAutorizaveisDe(a.v).includes(tipo) && a.tipos.includes(tipo) && (a.expiraEm === null || a.expiraEm > agora)
    return [this.autorizacao, ...this.autorizacoes].find(cobre) ?? null
  }

  async publicar(tipo, corpo, { reenviarAtestado = false, imagem } = {}) {
    if (this.cabeca === undefined) await this.sincronizar()
    const objeto = criarObjeto({
      tipo, autor: this.uid, criadoEm: this.relogio(), previo: tipo === 'denuncia' ? null : this.cabeca, corpo, chavePrivada: this.chavePrivada
    })
    const envelope = { objeto }
    const autorizacao = this.#autorizacaoPara(tipo)
    if (autorizacao) {
      envelope.autorizacao = autorizacao
    } else if (exigeAprovacao(tipo, this.exigidos)) {
      // 0.5.0: a pessoa só aprova imagem vendo os bytes exatos que o objeto cita
      if (tipo === 'imagem') {
        const problema = imagemConfereComObjeto(imagem, objeto)
        if (problema) throw new Error(`A imagem não pode ir para aprovação: ${problema}.`)
      }
      const aprovacao = await (tipo === 'imagem' ? this.aprovador.aprovar(objeto, { imagem }) : this.aprovador.aprovar(objeto))
      if (!aprovacao) throw new NaoAprovado()
      envelope.aprovacao = aprovacao
    }
    if (reenviarAtestado || !this.atestadoEnviado) envelope.atestado = this.atestado
    let resposta
    try {
      resposta = await this.#chamar('POST', '/v1/objetos', envelope)
    } catch (e) {
      // outro aparelho publicou, ou a pessoa mudou a política: reler antes de tentar de novo
      if (e instanceof ErroDeRele && ['previo_incorreto', 'sem_aprovacao'].includes(e.codigo)) this.cabeca = undefined
      throw e
    }
    this.atestadoEnviado = true
    if (tipo !== 'denuncia' && (resposta.estado === 'aceito' || resposta.estado === 'duplicado')) this.cabeca = objeto.id
    return { ...resposta, objeto }
  }

  /** O perfil 0.3. Os campos da página (`sobre`, `habilidades`, `interesses`, `retrato`, `recados`, `listado`) só vão se vierem. */
  perfil({ nome, descricao = '', grafo = 'publico', exigirAprovacao = [], ...pagina }) { return this.publicar('perfil', { nome, descricao, grafo, exigirAprovacao, ...pagina }) }
  postar({ texto, titulo, topicos = [] }) { return this.publicar('postagem', titulo === undefined ? { texto, topicos } : { titulo, texto, topicos }) }
  responder(alvo, texto) { return this.publicar('resposta', { alvo, texto }) }
  seguir(alvo) { return this.publicar('seguir', { alvo }) }
  deixarDeSeguir(alvo) { return this.publicar('deixar-de-seguir', { alvo }) }
  reagir(alvo, reacao) { return this.publicar('reacao', { alvo, reacao }) }
  denunciar(alvo, motivo) { return this.publicar('denuncia', { alvo, motivo }) }
  remover(alvo) { return this.publicar('remocao-pelo-autor', { alvo }) }

  // ---------- leitura ----------
  verPerfil(uid = this.uid) { return this.#chamar('GET', `/v1/rovers/${uid}`) }
  verHandle(handle) { return this.#chamar('GET', `/v1/handles/${encodeURIComponent(handle)}`) }
  postagensDe(uid = this.uid, { antes, limite } = {}) { return this.#chamar('GET', `/v1/rovers/${uid}/postagens${consulta({ antes, limite })}`) }
  linhaDoInicio({ antes, limite } = {}) { return this.#chamar('GET', `/v1/linha/inicio${consulta({ rover: this.uid, antes, limite })}`, undefined, { assinar: true }) }
  /** Lista de quem o rover segue. Do próprio rover, a leitura vai assinada (precisa, se o grafo for fechado). */
  seguindo(uid = this.uid, { antes, limite } = {}) { return this.#chamar('GET', `/v1/rovers/${uid}/seguindo${consulta({ antes, limite })}`, undefined, { assinar: uid === this.uid }) }
  seguidores(uid = this.uid, { antes, limite } = {}) { return this.#chamar('GET', `/v1/rovers/${uid}/seguidores${consulta({ antes, limite })}`, undefined, { assinar: uid === this.uid }) }
  /** Um objeto por id. Vai assinado para o relé deixar ler o que só os membros leem (comunidade fechada, depoimento pendente). */
  verObjeto(id, { anonimo = false } = {}) { return this.#chamar('GET', `/v1/objetos/${id}`, undefined, { assinar: !anonimo }) }

  // ====================================================================================================
  // 0.3: rede social e fórum. Escrita: cada método monta o corpo do tipo e passa pelo mesmo caminho de `publicar`
  // (cadeia previo, aprovação da pessoa quando o tipo exige, autorização permanente quando cobre).
  // ====================================================================================================

  estado(estado) { return this.publicar('estado', { estado }) }
  recado(alvo, texto) { return this.publicar('recado', { alvo, texto }) }
  pedirAmizade(alvo) { return this.publicar('amizade', { alvo, acao: 'pedir' }) }
  aceitarAmizade(alvo) { return this.publicar('amizade', { alvo, acao: 'aceitar' }) }
  recusarAmizade(alvo) { return this.publicar('amizade', { alvo, acao: 'recusar' }) }
  desfazerAmizade(alvo) { return this.publicar('amizade', { alvo, acao: 'desfazer' }) }
  depoimento(alvo, texto) { return this.publicar('depoimento', { alvo, texto }) }
  decidirDepoimento(depoimento, decisao) { return this.publicar('depoimento-decisao', { depoimento, decisao }) }
  darSelo(alvo, selo) { return this.publicar('selo', { alvo, selo }) }
  bloquear(alvo) { return this.publicar('relacao', { alvo, acao: 'bloquear' }) }
  desbloquear(alvo) { return this.publicar('relacao', { alvo, acao: 'desbloquear' }) }
  silenciar(alvo) { return this.publicar('relacao', { alvo, acao: 'silenciar' }) }
  dessilenciar(alvo) { return this.publicar('relacao', { alvo, acao: 'dessilenciar' }) }
  entrega({ titulo, descricao, resultado, tags = [] }) { return this.publicar('entrega', { titulo, descricao, resultado, tags }) }

  criarComunidade({ nome, descricao = '', regras = '', tema, acesso = 'aberta', categorias = [] }) {
    return this.publicar('comunidade-criar', { nome, descricao, regras, tema, acesso, categorias })
  }

  atualizarComunidade(comunidade, { nome, descricao = '', regras = '', tema, acesso, categorias = [] }) {
    return this.publicar('comunidade-atualizar', { comunidade, nome, descricao, regras, tema, acesso, categorias })
  }

  entrarNaComunidade(comunidade) { return this.publicar('comunidade-adesao', { comunidade, acao: 'entrar' }) }
  sairDaComunidade(comunidade) { return this.publicar('comunidade-adesao', { comunidade, acao: 'sair' }) }
  aceitarConvite(comunidade) { return this.publicar('comunidade-adesao', { comunidade, acao: 'aceitar-convite' }) }
  recusarConvite(comunidade) { return this.publicar('comunidade-adesao', { comunidade, acao: 'recusar-convite' }) }
  cancelarPedidoDeEntrada(comunidade) { return this.publicar('comunidade-adesao', { comunidade, acao: 'cancelar-pedido' }) }
  /** Moderação de membros: `acao` é uma de convidar, cancelar-convite, aprovar-pedido, recusar-pedido, expulsar, banir, desbanir, promover, rebaixar. */
  gerirMembro(comunidade, alvo, acao, motivo = null) { return this.publicar('comunidade-gestao', { comunidade, alvo, acao, motivo }) }
  transferirComunidade(comunidade, novoDono) { return this.publicar('comunidade-posse', { comunidade, acao: 'transferir', novoDono }) }
  encerrarComunidade(comunidade) { return this.publicar('comunidade-posse', { comunidade, acao: 'encerrar', novoDono: null }) }

  topico({ comunidade, categoria = null, titulo, texto, tags = [], enquete = null }) { return this.publicar('topico', { comunidade, categoria, titulo, texto, tags, enquete }) }
  editarTopico(topico, { titulo, texto, tags = [] }) { return this.publicar('topico-editar', { topico, titulo, texto, tags }) }
  responderNoForum(topico, texto, { em = null, cita = null } = {}) { return this.publicar('resposta-forum', { topico, em, cita, texto }) }
  /** `acao`: fixar, desafixar, trancar, destrancar. Para mover use `moverTopico`. */
  gerirTopico(topico, acao) { return this.publicar('topico-gestao', { topico, acao, comunidade: null, categoria: null }) }
  moverTopico(topico, comunidade, categoria = null) { return this.publicar('topico-gestao', { topico, acao: 'mover', comunidade, categoria }) }
  marcarResolvido(topico, resposta) { return this.publicar('topico-resolvido', { topico, resposta }) }
  votar(topico, opcao) { return this.publicar('voto', { topico, opcao }) }

  criarPagina({ nome, descricao = '', tema }) { return this.publicar('pagina-criar', { nome, descricao, tema }) }
  atualizarPagina(pagina, { nome, descricao = '', tema }) { return this.publicar('pagina-atualizar', { pagina, nome, descricao, tema }) }
  publicarNaPagina(pagina, { titulo, texto, tags = [] }) { return this.publicar('pagina-publicar', titulo === undefined ? { pagina, texto, tags } : { pagina, titulo, texto, tags }) }
  seguirPagina(pagina) { return this.publicar('pagina-seguir', { pagina, acao: 'seguir' }) }
  deixarPagina(pagina) { return this.publicar('pagina-seguir', { pagina, acao: 'deixar' }) }
  gerirPagina(pagina, alvo, acao) { return this.publicar('pagina-gestao', { pagina, alvo, acao }) }

  removerComoResponsavel(alvo, motivo) { return this.publicar('remocao-por-responsavel', { alvo, motivo }) }
  apelar(tipo, alvo, texto) { return this.publicar('apelacao', { tipo, alvo, texto }) }
  decidirApelacao(apelacao, resultado) { return this.publicar('apelacao-decisao', { apelacao, resultado }) }

  // ---------- leitura da 0.3 (todas assinadas pelo rover, salvo `anonimo: true`, para ele ler o que só os seus leem) ----------

  #ler(caminho, params = {}, { anonimo = false } = {}) { return this.#chamar('GET', caminho + consulta(params), undefined, { assinar: !anonimo }) }

  paginaDoRover(uid = this.uid, o) { return this.#ler(`/v1/rovers/${uid}/pagina`, {}, o) }
  recados(uid = this.uid, { antes, limite, anonimo } = {}) { return this.#ler(`/v1/rovers/${uid}/recados`, { antes, limite }, { anonimo }) }
  depoimentos(uid = this.uid, { estado, antes, limite } = {}) { return this.#ler(`/v1/rovers/${uid}/depoimentos`, { estado, antes, limite }) }
  selos(uid = this.uid) { return this.#ler(`/v1/rovers/${uid}/selos`) }
  entregas(uid = this.uid, { antes, limite } = {}) { return this.#ler(`/v1/rovers/${uid}/entregas`, { antes, limite }, { anonimo: true }) }
  amigos(uid = this.uid, { antes, limite } = {}) { return this.#ler(`/v1/rovers/${uid}/amigos`, { antes, limite }) }
  amigosEmComum(uid, com, { antes, limite } = {}) { return this.#ler(`/v1/rovers/${uid}/amigos-em-comum`, { com, antes, limite }) }
  comunidadesDoRover(uid = this.uid, { antes, limite } = {}) { return this.#ler(`/v1/rovers/${uid}/comunidades`, { antes, limite }) }
  paginasDoRover(uid = this.uid, { antes, limite } = {}) { return this.#ler(`/v1/rovers/${uid}/paginas`, { antes, limite }) }
  amizadesPendentes() { return this.#ler(`/v1/rovers/${this.uid}/amizades/pendentes`) }
  convites() { return this.#ler(`/v1/rovers/${this.uid}/convites`) }
  relacoes({ antes, limite } = {}) { return this.#ler(`/v1/rovers/${this.uid}/relacoes`, { antes, limite }) }
  notificacoes({ antes, limite } = {}) { return this.#ler(`/v1/rovers/${this.uid}/notificacoes`, { antes, limite }) }
  notificacoesNovas(desde = 0) { return this.#ler(`/v1/rovers/${this.uid}/notificacoes/contagem`, { desde }) }

  comunidades({ tema, acesso, ordem, antes, limite } = {}) { return this.#ler('/v1/comunidades', { tema, acesso, ordem, antes, limite }, { anonimo: true }) }
  comunidade(id) { return this.#ler(`/v1/comunidades/${id}`) }
  membros(id, { antes, limite } = {}) { return this.#ler(`/v1/comunidades/${id}/membros`, { antes, limite }) }
  pedidosDeEntrada(id, { antes, limite } = {}) { return this.#ler(`/v1/comunidades/${id}/pedidos`, { antes, limite }) }
  convitesDaComunidade(id, { antes, limite } = {}) { return this.#ler(`/v1/comunidades/${id}/convites`, { antes, limite }) }
  banidos(id, { antes, limite } = {}) { return this.#ler(`/v1/comunidades/${id}/banidos`, { antes, limite }) }
  /** `ordem`: recentes, ativos, sem-resposta e, na 0.3.2, melhores e em-alta (`janela` 24h ou 7d). `status` e `etiqueta` filtram pelo vocabulário (0.3.2). */
  topicos(id, { categoria, tag, status, etiqueta, ordem, janela, antes, limite } = {}) { return this.#ler(`/v1/comunidades/${id}/topicos`, { categoria, tag, status, etiqueta, ordem, janela, antes, limite }) }
  filaDeModeracao(id) { return this.#ler(`/v1/comunidades/${id}/moderacao/fila`) }
  registroDaComunidade(id, { antes, limite } = {}) { return this.#ler(`/v1/comunidades/${id}/moderacao/registro`, { antes, limite }) }
  verTopico(id) { return this.#ler(`/v1/topicos/${id}`) }
  respostasDoTopico(id, { em, ordem, janela, antes, limite } = {}) { return this.#ler(`/v1/topicos/${id}/respostas`, { em, ordem, janela, antes, limite }) }
  historicoDoTopico(id) { return this.#ler(`/v1/topicos/${id}/historico`) }

  paginas({ tema, ordem, antes, limite } = {}) { return this.#ler('/v1/paginas', { tema, ordem, antes, limite }, { anonimo: true }) }
  pagina(id) { return this.#ler(`/v1/paginas/${id}`) }
  atualizacoesDaPagina(id, { antes, limite } = {}) { return this.#ler(`/v1/paginas/${id}/atualizacoes`, { antes, limite }, { anonimo: true }) }
  seguidoresDaPagina(id, { antes, limite } = {}) { return this.#ler(`/v1/paginas/${id}/seguidores`, { antes, limite }, { anonimo: true }) }
  registroDaPagina(id, { antes, limite } = {}) { return this.#ler(`/v1/paginas/${id}/moderacao/registro`, { antes, limite }, { anonimo: true }) }
  registroDoRele({ antes, limite } = {}) { return this.#ler('/v1/moderacao/registro', { antes, limite }, { anonimo: true }) }
  /** A linha do início com as atualizações das páginas que o rover segue. */
  linhaCompleta({ antes, limite } = {}) { return this.#ler('/v1/linha/inicio', { rover: this.uid, tipos: 'postagem,pagina-publicar', antes, limite }) }

  // ---------- revisão 0.3.1 (proposta 0006) ----------
  // Um relé 0.3 não tem estas rotas nem estes campos. Leia `recursos` de `info()` (ou use `suporta`) antes de oferecer a tela.

  /** `GET /v1/info`: versões, emissores, limites e, na 0.3.1, a lista `recursos`. */
  info() { return this.#ler('/v1/info', {}, { anonimo: true }) }
  /** O relé declara este recurso da 0.3.1? Relé 0.3 não traz `recursos`: nada é suportado. */
  async suporta(recurso) { return ((await this.info()).recursos ?? []).includes(recurso) }
  /** O moderador tira as denúncias abertas de um alvo da fila da comunidade (não apaga nada). */
  dispensarDenuncia(comunidade, alvo) { return this.publicar('denuncia-dispensar', { comunidade, alvo }) }
  postagem(id) { return this.#ler(`/v1/postagens/${id}`) }
  respostasDaPostagem(id, { ordem, janela, antes, limite } = {}) { return this.#ler(`/v1/postagens/${id}/respostas`, { ordem, janela, antes, limite }) }
  /** O que a moderação removeu do que este rover escreveu. */
  removidos({ antes, limite } = {}) { return this.#ler(`/v1/rovers/${this.uid}/removidos`, { antes, limite }) }
  /** Os depoimentos que este rover escreveu e ainda esperam decisão. */
  depoimentosEnviados({ antes, limite } = {}) { return this.depoimentos(this.uid, { estado: 'enviados', antes, limite }) }
  temasDePaginas() { return this.#ler('/v1/paginas/temas', {}, { anonimo: true }) }
  /** Postagens de um rover com autor, contagens e a reação de quem lê. */
  postagensCompletas(uid = this.uid, { antes, limite } = {}) { return this.#ler(`/v1/rovers/${uid}/postagens`, { completo: 1, antes, limite }) }
  atualizacoesCompletasDaPagina(id, { antes, limite } = {}) { return this.#ler(`/v1/paginas/${id}/atualizacoes`, { completo: 1, antes, limite }) }
  /** A linha do início no formato completo: postagens e atualizações de página no mesmo array, `tipo` distingue. */
  linhaCompletaComContagens({ antes, limite } = {}) { return this.#ler('/v1/linha/inicio', { rover: this.uid, tipos: 'postagem,pagina-publicar', completo: 1, antes, limite }) }

  /** `ordem` (0.3.2) só vale com `tipo: 'topicos'`: relevancia (padrão), recentes, melhores, em-alta. */
  busca(q, { tipo, ordem, janela, antes, limite } = {}) { return this.#ler('/v1/busca', { q, tipo, ordem, janela, antes, limite }) }
  emAlta({ tipo, janela } = {}) { return this.#ler('/v1/descobrir/em-alta', { tipo, janela }, { anonimo: true }) }
  recemChegados({ limite } = {}) { return this.#ler('/v1/descobrir/recem-chegados', { limite }, { anonimo: true }) }
  /** Sugestões pelos interesses declarados. Vai assinada: só assim o relé deixa de sugerir o que o rover já faz parte. */
  sugestoes({ tipo, interesses, rover } = {}) { return this.#ler('/v1/descobrir/sugestoes', { tipo, interesses, rover }) }
  tendencias({ janela } = {}) { return this.#ler('/v1/descobrir/tendencias', { janela }, { anonimo: true }) }
  // ---------- revisão 0.3.2 (proposta 0007) ----------
  // Confira `suporta('inicio' | 'ordem-por-pessoas' | 'vocabulario' | 'anuncios')` antes de oferecer a tela: um relé 0.3.1 não tem nada disto.

  /**
   * O painel de início: só ids, contagens e carimbos do que merece a atenção do rover. `desde` é o `agora` do pedido anterior (o relé não marca
   * "lido": quem guarda o estado de visto é o cliente). Assinada pelo rover.
   */
  inicio({ desde } = {}) { return this.#ler('/v1/inicio', { desde }) }
  /** Os anúncios do relé (a comunidade oficial somente leitura): públicos, os fixados primeiro. */
  anuncios({ antes, limite } = {}) { return this.#ler('/v1/anuncios', { antes, limite }, { anonimo: true }) }
  anuncio(id) { return this.#ler(`/v1/anuncios/${id}`, {}, { anonimo: true }) }
  /**
   * O dono ou um moderador define, de uma vez, o vocabulário da comunidade (substitui o anterior). `etiquetas`: até 8 `{ chave, rotulo, cor }`;
   * `status`: até 6 `{ chave, rotulo, cor, categorias }`, com `categorias: null` para valer em todas.
   */
  definirVocabulario(comunidade, { etiquetas = [], status = [] } = {}) { return this.publicar('comunidade-vocabulario', { comunidade, etiquetas, status }) }
  /** As marcas de um tópico, definidas de uma vez: até 3 chaves de etiqueta e um status (ou `null`). O autor marca o próprio tópico; moderador, qualquer um. */
  marcarTopico(topico, { etiquetas = [], status = null } = {}) { return this.publicar('topico-marca', { topico, etiquetas, status }) }

  // ---------- 0.5.0: imagens (proposta 0005), só em relé que anuncia o recurso `midia` ----------

  /** O endereço público de uma imagem neste relé. */
  urlDaImagem(hash) { return `${this.base}/v1/midia/${hash}` }

  async #exigirMidia() {
    if (!(await this.suporta(RECURSO_MIDIA))) throw new Error('Este relé não aceita imagens (o recurso midia está desligado).')
  }

  /**
   * Limpa a imagem com a função do protocolo (a mesma do relé) e envia os bytes limpos, assinando a credencial de envio. Nada é
   * publicado: o envio só vale para este rover citar o hash num objeto `imagem` na próxima hora.
   * @returns {Promise<{ estado: string, hash: string, formato: string, largura: number, altura: number, bytes: number, limpa: object }>}
   */
  async enviarImagem(bytes) {
    await this.#exigirMidia()
    const limpa = limparImagem(bytes)
    if (!limpa.ok) throw new ErroDeRele(422, { erro: { codigo: limpa.codigo, mensagem: `A imagem foi recusada antes de sair: ${limpa.detalhe}.` } })
    const caminho = `/v1/midia/${limpa.hash}`
    const authorization = criarCredencialDeEnvio({ chavePrivada: this.chavePrivada, uid: this.uid, alvo: caminho, t: this.relogio() })
    const res = await this.fetch(this.base + caminho, { method: 'PUT', headers: { authorization, 'content-type': 'application/octet-stream' }, body: limpa.bytes })
    let json = null
    try { json = await res.json() } catch { /* corpo vazio */ }
    if (!res.ok) throw new ErroDeRele(res.status, json, res.headers)
    return { ...json, limpa }
  }

  /** Envia e publica o retrato em imagem (substitui o anterior). A pessoa aprova vendo a imagem e o texto alternativo. */
  async definirRetratoImagem(bytes, { alt }) {
    const { limpa } = await this.enviarImagem(bytes)
    return this.publicar('imagem', corpoDeImagem(limpa, { uso: 'retrato', alt }), { imagem: limpa.bytes })
  }

  /** Envia e anexa uma imagem a uma postagem já publicada deste rover. */
  async anexarImagem(postagem, bytes, { alt, ordem = 0 }) {
    const { limpa } = await this.enviarImagem(bytes)
    return this.publicar('imagem', corpoDeImagem(limpa, { uso: 'anexo', alvo: postagem, ordem, alt }), { imagem: limpa.bytes })
  }

  /**
   * Postagem com até 4 imagens. Envia os bytes primeiro (uma recusa de formato acontece antes de qualquer publicação), monta a
   * postagem e os objetos `imagem` encadeados, pede a aprovação de TODOS (a pessoa vê tudo junto; cada imagem com os bytes exatos)
   * e só então publica, na ordem. Se a pessoa recusar qualquer um, nada é publicado.
   * Limite honesto: a publicação é em sequência; se o relé recusar uma imagem depois de aceitar a postagem, a postagem fica.
   * @param {{ texto: string, titulo?: string, topicos?: string[] }} postagem
   * @param {{ bytes: Uint8Array, alt: string }[]} imagens
   */
  async postarComImagens({ texto, titulo, topicos = [] }, imagens) {
    if (!Array.isArray(imagens) || imagens.length < 1 || imagens.length > LIMITES_DE_MIDIA.anexosPorPostagem) {
      throw new RangeError(`Uma postagem leva de 1 a ${LIMITES_DE_MIDIA.anexosPorPostagem} imagens.`)
    }
    const enviadas = []
    for (const im of imagens) enviadas.push((await this.enviarImagem(im.bytes)).limpa)
    await this.sincronizar()
    const t = this.relogio()
    const montar = (tipo, corpo, previo) => criarObjeto({ tipo, autor: this.uid, criadoEm: t, previo, corpo, chavePrivada: this.chavePrivada })
    const post = montar('postagem', titulo === undefined ? { texto, topicos } : { titulo, texto, topicos }, this.cabeca)
    const lote = [post]
    for (const [ordem, limpa] of enviadas.entries()) lote.push(montar('imagem', corpoDeImagem(limpa, { uso: 'anexo', alvo: post.id, ordem, alt: imagens[ordem].alt }), lote.at(-1).id))
    const envelopes = []
    for (const [i, objeto] of lote.entries()) {
      const envelope = { objeto }
      const autorizacao = i === 0 ? this.#autorizacaoPara('postagem') : null
      if (autorizacao) envelope.autorizacao = autorizacao
      else {
        const imagem = i === 0 ? undefined : enviadas[i - 1].bytes
        if (imagem) {
          const problema = imagemConfereComObjeto(imagem, objeto)
          if (problema) throw new Error(`A imagem não pode ir para aprovação: ${problema}.`)
        }
        const aprovacao = await this.aprovador.aprovar(objeto, imagem ? { imagem, lote } : { lote })
        if (!aprovacao) throw new NaoAprovado()
        envelope.aprovacao = aprovacao
      }
      envelopes.push(envelope)
    }
    if (!this.atestadoEnviado) envelopes[0].atestado = this.atestado
    const respostas = []
    for (const envelope of envelopes) {
      try {
        respostas.push(await this.#chamar('POST', '/v1/objetos', envelope))
      } catch (e) {
        this.cabeca = undefined
        throw e
      }
      this.atestadoEnviado = true
      this.cabeca = envelope.objeto.id
    }
    return { postagem: post.id, imagens: lote.slice(1).map((o) => o.id), respostas }
  }

  // ====================================================================================================
  // 0.4.0: mensagens privadas (PROTOCOLO.md seção 15). Só com `suporta('mensagens')`. A cifra e a decifra acontecem AQUI, no cliente: o relé
  // nunca vê o texto de uma mensagem. Os objetos da 0.4 ficam fora da cadeia (previo null) e nunca usam a autorização permanente.
  // ====================================================================================================

  /** Publica um objeto da 0.4. Pedido, decisão e mensagem SEMPRE passam pela pessoa; `contexto` vai junto para ela conferir o que aprova. */
  async publicarDeMensagem(tipo, corpo, { criadoEm = this.relogio(), contexto } = {}) {
    const objeto = criarObjeto({ v: VERSAO_DE_MENSAGENS, tipo, autor: this.uid, criadoEm, previo: null, corpo, chavePrivada: this.chavePrivada })
    const envelope = { objeto }
    if (exigeAprovacao(tipo)) {
      const aprovacao = await this.aprovador.aprovar(objeto, contexto)
      if (!aprovacao) throw new NaoAprovado()
      envelope.aprovacao = aprovacao
    }
    if (!this.atestadoEnviado) envelope.atestado = this.atestado
    const resposta = await pedirAoRele(this.fetch, this.base, 'POST', '/v1/objetos', envelope)
    this.atestadoEnviado = true
    return { ...resposta, objeto }
  }


  /** Publica a chave pública de cifra deste rover (objeto `chave-de-cifra`, assinado com a chave de rede). */
  publicarChaveDeCifra() {
    if (!this.chavePrivadaDeCifra) throw new Error('Este cliente não tem chave de cifra (chavePrivadaDeCifra).')
    return this.publicarDeMensagem('chave-de-cifra', { chave: chavePublicaDeCifraDe(this.chavePrivadaDeCifra) })
  }

  /** A chave de REDE de um rover, conferida pelo atestado (assinado por um emissor em que este cliente confia). */
  async chaveDeRedeDe(uid) {
    if (uid === this.uid) return this.atestado.chave
    if (this.chavesDeRede.has(uid)) return this.chavesDeRede.get(uid)
    const perfil = await pedirAoRele(this.fetch, this.base, 'GET', `/v1/rovers/${uid}`)
    const r = verificarAtestadoDeHandle(perfil.atestado, { agora: this.relogio(), emissoresConfiaveis: this.emissoresConfiaveis })
    if (!r.ok || r.atestado.uid !== uid) throw new Error('O atestado do outro rover não confere.')
    this.chavesDeRede.set(uid, r.atestado.chave)
    return r.atestado.chave
  }

  /** A chave de cifra vigente de um rover, conferida: objeto bem formado, do próprio rover e assinado com a chave de rede dele. */
  async chaveDeCifraDe(uid) {
    const { objeto } = await pedirAoRele(this.fetch, this.base, 'GET', `/v1/rovers/${uid}/chave-de-cifra`)
    const forma = validarObjeto(objeto)
    if (!forma.ok || objeto.tipo !== 'chave-de-cifra' || objeto.autor !== uid || !assinaturaDoObjetoConfere(objeto, await this.chaveDeRedeDe(uid))) {
      throw new Error('A chave de cifra servida pelo relé não confere com a chave de rede do rover.')
    }
    return objeto.corpo.chave
  }

  /** Pede conversa a um amigo. O texto vai em claro (até 280 caracteres) e a pessoa aprova. O id do objeto é o id da conversa. */
  async pedirConversa(alvo, texto) {
    const r = await this.publicarDeMensagem('conversa-pedir', { alvo, texto })
    return { ...r, conversa: r.objeto.id }
  }
  aceitarConversa(conversa) { return this.publicarDeMensagem('conversa-decidir', { conversa, decisao: 'aceitar' }) }
  recusarConversa(conversa) { return this.publicarDeMensagem('conversa-decidir', { conversa, decisao: 'recusar' }) }
  encerrarConversa(conversa) { return this.publicarDeMensagem('conversa-decidir', { conversa, decisao: 'encerrar' }) }

  /** As conversas deste rover (`estado`: pendentes, ativas, todas). */
  conversas({ estado, antes, limite } = {}) { return this.#ler(`/v1/rovers/${this.uid}/conversas`, { estado, antes, limite }) }
  conversa(id) { return this.#ler(`/v1/rovers/${this.uid}/conversas/${id}`) }

  /**
   * Cifra e envia. Confere as regras de texto ANTES de cifrar (o relé não vê o texto). A pessoa recebe, além do objeto, o texto, a
   * assinatura da carta e a chave da mensagem, para conferir com `cifraConfere` que aprova exatamente o que o outro lado vai ler.
   * Se o outro lado trocou de chave no meio (`chave_de_cifra_desatualizada`), relê a chave e cifra de novo, uma vez (com aprovação nova).
   */
  async enviarMensagem(conversaId, texto) {
    if (!this.chavePrivadaDeCifra) throw new Error('Este cliente não tem chave de cifra (chavePrivadaDeCifra).')
    const c = await this.conversa(conversaId)
    const para = c.com.uid
    for (let tentativa = 0; ; tentativa++) {
      const criadoEm = this.relogio()
      const { corpo, chaveDaMensagem, assinatura } = cifrarMensagem({
        texto, conversa: conversaId, de: this.uid, para, criadoEm, chavePrivadaDeRede: this.chavePrivada,
        chavePrivadaDeCifra: this.chavePrivadaDeCifra, chavePublicaDeCifraDoOutro: await this.chaveDeCifraDe(para)
      })
      try {
        return await this.publicarDeMensagem('mensagem', corpo, { criadoEm, contexto: { texto, assinatura, chaveDaMensagem } })
      } catch (e) {
        if (tentativa === 0 && e instanceof ErroDeRele && e.codigo === 'chave_de_cifra_desatualizada') continue
        throw e
      }
    }
  }

  /**
   * Lê e decifra uma página de mensagens. Cada item: `{ id, de, criadoEm, legivel, texto, assinatura, dentroDasRegras }`. O que não confere
   * (assinatura do objeto, cifra, carta) vem com `legivel: false` e `texto: null`: quem mostra não mostra nada dele.
   */
  async lerConversa(conversaId, { antes, limite } = {}) {
    const pagina = await this.#ler(`/v1/rovers/${this.uid}/conversas/${conversaId}/mensagens`, { antes, limite })
    const privadas = [this.chavePrivadaDeCifra, ...this.chavesDeCifraAntigas].filter(Boolean)
    const itens = []
    for (const { objeto } of pagina.itens) {
      const base = { id: objeto.id, de: objeto.autor, criadoEm: objeto.criadoEm, legivel: false, texto: null, assinatura: null, dentroDasRegras: false }
      const chaveDeRede = await this.chaveDeRedeDe(objeto.autor).catch(() => null)
      const confere = chaveDeRede !== null && validarObjeto(objeto).ok && objeto.corpo.conversa === conversaId && assinaturaDoObjetoConfere(objeto, chaveDeRede)
      let lido = null
      for (const chavePrivadaDeCifra of confere ? privadas : []) {
        const r = decifrarMensagem(objeto, { chavePrivadaDeCifra, chavePublicaDeRedeDoRemetente: chaveDeRede })
        if (r.ok) { lido = r; break }
      }
      itens.push(lido ? { ...base, legivel: true, texto: lido.texto, assinatura: lido.assinatura, dentroDasRegras: lido.dentroDasRegras } : base)
    }
    return { itens, proximo: pagina.proximo }
  }

  /** Apaga a cópia DESTE lado: uma mensagem, ou (sem `mensagem`) todas as da conversa até agora. O outro lado guarda a dele. */
  apagarConversa(conversa, { mensagem = null } = {}) { return this.publicarDeMensagem('conversa-apagar', { conversa, mensagem }) }

  /**
   * Denuncia uma mensagem RECEBIDA revelando ao operador o texto e a assinatura da carta (um item de `lerConversa`). O relé confere que o
   * remetente assinou aquele texto; o operador passa a ler esse texto, e só ele.
   */
  denunciarMensagem(item, motivo) {
    if (!item?.legivel) throw new Error('Só se denuncia uma mensagem que este cliente conseguiu ler (texto e assinatura da carta).')
    return this.publicarDeMensagem('mensagem-denuncia', { mensagem: item.id, motivo, texto: item.texto, assinatura: item.assinatura })
  }
}

function consulta(params) {
  const q = Object.entries(params).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
  return q.length ? `?${q.join('&')}` : ''
}
