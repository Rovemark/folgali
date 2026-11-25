// SPDX-License-Identifier: AGPL-3.0-or-later
// Núcleo do relé de referência: as REGRAS do protocolo 0.2 sobre o armazém. Sem HTTP aqui (ver http.js).
//
// Ordem de uma publicação, do mais barato ao mais caro, e sempre falhando fechado:
//   envelope fechado (e autorização só se o relé a aceita) -> forma do objeto (esquema, texto, id) -> atestado de handle
//   (do envelope ou o guardado) -> bloqueios -> assinatura -> duplicata (idempotente) -> relógio -> denúncia à parte (com a
//   liberação dela) -> perfil primeiro -> cadeia (previo) -> liberação (aprovação humana ou autorização permanente)
//   -> regras do tipo -> taxa (rover, emissor, depois o teto da autorização) -> gravação numa transação só.
// A taxa só conta objeto ACEITO e só depois da assinatura: ninguém gasta a cota de outro rover mandando lixo com o uid dele.
import { createHmac } from 'node:crypto'
import {
  ALVOS_DE_REACAO, ErroDoProtocolo, GRAFOS, ID_RE, LIMITES, LIMITES_SOCIAIS, MOTIVOS_DE_MODERACAO, PAGINA_PADRAO, RAJADA_CONTRA_ALVO, TAXA_DENUNCIA_POR_PSEUDONIMO,
  TAXA_POR_EMISSOR, TAXA_POR_TIPO, TAXA_TOTAL_POR_ROVER, TEMPOS, TIPOS_SOCIAIS, UID_RE, VERSAO_PROTOCOLO, VERSOES_ACEITAS,
  assinaturaDoObjetoConfere, canonicalizar, credencialDeLeituraConfere, declaracaoConfere, exigeAprovacao, fatorDeIdade, grafoMostraContagens,
  grafoMostraListas, lerCredencialDeLeitura, objetoFechado, opcional, politicaEfetiva, tetoComFator, validarDeclaracao, validarObjeto,
  validarTexto, verificarAprovacaoHumana, verificarAtestadoDeHandle, verificarAutorizacaoPermanente, REVISAO_DO_RASCUNHO, RECURSOS_DA_REVISAO,
  RECURSO_MIDIA, TIPOS_DE_MIDIA, TIPOS_DE_OBJETO, um_de, TAXA_DE_MENSAGEM, TIPOS_DE_MENSAGEM, VERSAO_DE_MENSAGENS,
  VERSOES_DE_AUTORIZACAO } from '../../protocolo/src/index.js'
import { GRAFO_PUBLICO, ROVER_VISIVEL } from './armazem.js'
import { Mensagens, apagarMensagensDoRover, limparMensagens } from './mensagens.js'
import { Midia } from './midia.js'
import { Social } from './social.js'

const qualquer = () => null
const ESQUEMA_ENVELOPE = objetoFechado({ objeto: qualquer, atestado: opcional(qualquer), aprovacao: opcional(qualquer), autorizacao: opcional(qualquer) })
const ESQUEMA_ENVELOPE_DE_DECLARACAO = objetoFechado({ declaracao: qualquer })

// Quem o rover segue (só quem ainda é visível) e quem o segue (só quem é visível E deixa o próprio grafo público: seguir é
// informação de quem segue, e quem fechou o grafo não aparece na lista nem na contagem de ninguém).
const SEGUINDO = `FROM objetos s JOIN rovers r ON r.uid = s.alvo
  WHERE s.tipo = 'seguir' AND s.autor = :uid AND s.removido_em IS NULL AND ${ROVER_VISIVEL}`
const SEGUIDORES = `FROM objetos s JOIN rovers r ON r.uid = s.autor
  WHERE s.tipo = 'seguir' AND s.alvo = :uid AND s.removido_em IS NULL AND ${GRAFO_PUBLICO} AND ${ROVER_VISIVEL}`
const TIPOS_DE_BLOQUEIO = ['rover', 'objeto', 'emissor']
const REMOVIVEIS = ['perfil', 'postagem', 'resposta', 'seguir', 'reacao']
// Na 0.3 também se remove o que o rover escreveu ou deu nos espaços sociais. O voto não: não existe caminho para desfazer voto.
const REMOVIVEIS_V3 = [...REMOVIVEIS, 'recado', 'depoimento', 'selo', 'entrega', 'topico', 'resposta-forum', 'pagina-publicar', 'pagina-criar', 'imagem']
// 0.5.0: com a mídia desligada, o tipo `imagem` é recusado com o mesmo erro de um tipo que o relé não conhece.
const TIPO_SEM_MIDIA = um_de(TIPOS_DE_OBJETO.filter((t) => !TIPOS_DE_MIDIA.includes(t)))
// O rover novo tem teto menor, menos nestes: apagar o que escreveu e atualizar o perfil nunca podem ser travados.
const SEM_FATOR_DE_IDADE = ['perfil', 'remocao-pelo-autor']

const canonicoOuNulo = (v) => {
  try { return canonicalizar(v) } catch { return null }
}

export class Rele {
  /**
   * @param {object} o
   * @param {import('./armazem.js').Armazem} o.armazem
   * @param {import('./provedor.js').ProvedorDeAtestados} o.provedor
   * @param {Buffer} o.segredoDeDenuncias   chave do pseudônimo de quem denuncia; vem de fora do banco, para um vazamento do banco não revelar quem denunciou
   * @param {() => number} [o.relogio]      segundos inteiros
   * @param {boolean} [o.aceitarAutorizacaoPermanente]  0.6.0: ligada por padrão (proposta 0008); `false` desliga (autorizacao_nao_aceita)
   * @param {{ dir: string, cotaBytes?: number } | null} [o.midia]  0.5.0: imagens; `null` (o padrão) deixa o recurso desligado
   * @param {boolean} [o.mensagens]  só `true` liga as mensagens privadas (0.4.0); desligadas, não há rota nem recurso de mensagens
   * @param {string[]} [o.emissoresDeAgentes]  0.6.0: chaves dos emissores ABERTOS de agents de fora (um serviço à parte); o rover cujo
   *   atestado é de um deles ganha o selo `agente` no perfil. Cada uma precisa estar entre os emissores confiáveis do provedor
   */
  constructor({ armazem, provedor, segredoDeDenuncias, relogio = () => Math.floor(Date.now() / 1000), retencaoDenunciasDias = 180, taxas = {}, maxSeguidos = LIMITES.seguidosPorRover, aceitarAutorizacaoPermanente = true, semFatorDeIdade = false, midia = null, mensagens = false, emissoresDeAgentes = [] }) {
    if (!Buffer.isBuffer(segredoDeDenuncias) || segredoDeDenuncias.length < 32) throw new Error('segredoDeDenuncias precisa ter pelo menos 32 bytes')
    this.armazem = armazem
    this.provedor = provedor
    this.segredo = segredoDeDenuncias
    this.relogio = relogio
    this.retencaoDenunciasDias = retencaoDenunciasDias
    this.maxSeguidos = maxSeguidos
    // 0.6.0 (proposta 0008, decisão do Arquiteto de 24/11/2026): LIGADA por padrão, para o rover viver a folga sem aprovar cada texto.
    // O parecer jurídico segue pendente (PROTOCOLO.md seção 13). Só um booleano vale: um valor torto não pode decidir nem para um lado.
    if (typeof aceitarAutorizacaoPermanente !== 'boolean') throw new Error('aceitarAutorizacaoPermanente precisa ser true ou false')
    this.aceitaAutorizacao = aceitarAutorizacaoPermanente
    // Desligada por padrão: o teto menor de rover novo é a defesa contra spam. Só o operador, de propósito e por pouco tempo (carga da
    // demonstração), a liga; `=== true` para que um valor torto nunca a ligue.
    this.semFatorDeIdade = semFatorDeIdade === true
    this.taxas = {
      porTipo: taxas.porTipo ?? { ...TAXA_POR_TIPO, ...TAXA_DE_MENSAGEM },
      total: taxas.total ?? TAXA_TOTAL_POR_ROVER,
      emissor: taxas.emissor ?? TAXA_POR_EMISSOR,
      denuncia: taxas.denuncia ?? TAXA_DENUNCIA_POR_PSEUDONIMO
    }
    this._versaoDeRevogacoes = null
    // 0.6.0: os emissores abertos de agents de fora. Eles são serviços à parte: o relé só sabe as chaves (para o selo) e confia neles
    // pela lista de emissores e pela lista de revogados que lê de cada um, como em qualquer emissor.
    if (!Array.isArray(emissoresDeAgentes) || emissoresDeAgentes.some((e) => typeof e !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(e))) {
      throw new Error('emissoresDeAgentes precisa ser uma lista de chaves públicas (43 caracteres)')
    }
    this.emissoresDeAgentes = [...new Set(emissoresDeAgentes)]
    this.social = new Social(this)
    // 0.5.0: só existe se o operador ligou. Desligada, nem as tabelas nascem.
    this.midia = midia ? new Midia(this, midia) : null
    // Desligadas por padrão (0.4.0): o relé de demonstração publicado não muda de comportamento sem decisão. `=== true`, como acima.
    this.mensagens = mensagens === true ? new Mensagens(this) : null
    this._sincronizar()
  }

  _sincronizar() {
    if (this._versaoDeRevogacoes === this.provedor.versao) return
    this.armazem.substituirRevogacoes(this.provedor.revogados())
    this._versaoDeRevogacoes = this.provedor.versao
  }

  _paramsDeVisibilidade(agora) {
    return { agora, confiaveis: JSON.stringify(this.provedor.emissoresConfiaveis()) }
  }

  // ====================================================================================================
  // ESCRITA
  // ====================================================================================================

  /**
   * Recebe um envelope `{ objeto, atestado?, aprovacao? }`.
   * @returns {{ estado: 'aceito' | 'duplicado' | 'recebida', id: string }}  lança ErroDoProtocolo quando recusa
   */
  aceitar(envelope) {
    this._sincronizar()
    const agora = this.relogio()
    const f = ESQUEMA_ENVELOPE(envelope, 'envelope')
    if (f) throw new ErroDoProtocolo('esquema', { campo: f.caminho, detalhe: `Campo ${f.caminho}: ${f.mensagem}.` })
    // Com as mensagens desligadas o relé é um 0.3.2: a versão 0.4 nem é olhada.
    if (!this.mensagens && envelope.objeto?.v === VERSAO_DE_MENSAGENS) throw new ErroDoProtocolo('versao_nao_suportada', { campo: 'objeto.v' })
    if (envelope.autorizacao !== undefined) {
      if (envelope.aprovacao !== undefined) throw new ErroDoProtocolo('esquema', { campo: 'envelope.autorizacao', detalhe: 'Envie a aprovação humana ou a autorização permanente, não as duas.' })
      if (!this.aceitaAutorizacao) throw new ErroDoProtocolo('autorizacao_nao_aceita', { campo: 'envelope.autorizacao' })
    }
    const forma = validarObjeto(envelope.objeto)
    if (!forma.ok) throw forma.erro
    const obj = forma.objeto
    if (!this.midia && TIPOS_DE_MIDIA.includes(obj.tipo)) {
      const f = TIPO_SEM_MIDIA(obj.tipo, 'objeto.tipo')
      throw new ErroDoProtocolo('esquema', { campo: f.caminho, detalhe: `Campo ${f.caminho}: ${f.mensagem}.` })
    }

    const guardado = this.armazem.rover(obj.autor)
    if (guardado?.saiu) throw new ErroDoProtocolo('rover_saiu')
    const { efetivo, atestadoNovo } = this._resolverAtestado(envelope, obj, guardado, agora)

    if (this.armazem.bloqueado('emissor', efetivo.emissor) || this.armazem.bloqueado('rover', obj.autor)) throw new ErroDoProtocolo('bloqueado')
    if (!assinaturaDoObjetoConfere(obj, efetivo.chave)) throw new ErroDoProtocolo('assinatura_invalida', { campo: 'objeto.assinatura' })

    if (this.armazem.objeto(obj.id)) return { estado: 'duplicado', id: obj.id }

    if (obj.criadoEm < agora - LIMITES.janelaPassadoS || obj.criadoEm > agora + LIMITES.janelaFuturoS) {
      throw new ErroDoProtocolo('relogio', { campo: 'objeto.criadoEm' })
    }
    if (TIPOS_DE_MENSAGEM.includes(obj.tipo)) return this.mensagens.aceitar({ envelope, obj, efetivo, atestadoNovo, guardado, agora })
    if (obj.tipo === 'denuncia') {
      this._liberar(envelope, obj, efetivo, guardado, agora)
      return this._receberDenuncia(obj, agora)
    }

    if (!guardado && obj.tipo !== 'perfil') throw new ErroDoProtocolo('perfil_primeiro')
    const cabecaEsperada = guardado?.cabeca_id ?? null
    if (obj.previo !== cabecaEsperada) throw new ErroDoProtocolo('previo_incorreto', { campo: 'objeto.previo' })
    if (guardado && obj.criadoEm < guardado.cabeca_criado_em) {
      throw new ErroDoProtocolo('relogio', { campo: 'objeto.criadoEm', detalhe: 'O objeto é mais antigo que o anterior da cadeia.' })
    }

    this.social.conferirIdade(obj, guardado, agora)
    this.midia?.conferirIdade(obj, guardado, agora)
    const { aprovacao, autorizacao } = this._liberar(envelope, obj, efetivo, guardado, agora)
    const efeito = this._regrasDoTipo(obj, agora, guardado)
    this._conferirTaxa(obj, efetivo.emissor, agora, autorizacao, guardado, efeito)

    this.armazem.transacao(() => this._gravar({ obj, aprovacao, autorizacao, efetivo, atestadoNovo, guardado, efeito, agora }))
    // 0.5.0: o arquivo que ficou sem objeto que o cite some na hora (remoção, retrato substituído, saída da rede)
    if (this.midia && (obj.tipo === 'remocao-pelo-autor' || obj.tipo === 'imagem')) this.midia.coletar(agora)
    return efeito.resultado === undefined ? { estado: 'aceito', id: obj.id } : { estado: 'aceito', id: obj.id, resultado: efeito.resultado }
  }

  /** Decide qual atestado vale para este pedido: o anexado (se for novo) ou o guardado. */
  _resolverAtestado(envelope, obj, guardado, agora) {
    const anexado = envelope.atestado
    const confiaveis = this.provedor.emissoresConfiaveis()
    if (anexado !== undefined) {
      const identicoAoGuardado = guardado && canonicoOuNulo(anexado) === guardado.atestado
      if (!identicoAoGuardado) {
        const r = verificarAtestadoDeHandle(anexado, { agora, emissoresConfiaveis: confiaveis })
        if (!r.ok) throw r.erro
        const a = r.atestado
        if (a.uid !== obj.autor) {
          throw new ErroDoProtocolo('atestado_invalido', { campo: 'atestado.uid', detalhe: 'O atestado é de outro rover.' })
        }
        if (this.armazem.revogado(a.emissor, a.uid, a.emitidoEm)) throw new ErroDoProtocolo('atestado_revogado')
        if (guardado && a.emitidoEm <= guardado.atestado_emitido_em) throw new ErroDoProtocolo('atestado_antigo', { campo: 'atestado.emitidoEm' })
        const dono = this.armazem.roverPorHandle(a.handle)
        if (dono && dono.uid !== a.uid) throw new ErroDoProtocolo('handle_em_uso', { campo: 'atestado.handle' })
        return { atestadoNovo: a, efetivo: { chave: a.chave, chaveAprovacao: a.chaveAprovacao, emissor: a.emissor, handle: a.handle } }
      }
    }
    if (!guardado) throw new ErroDoProtocolo('sem_atestado')
    if (agora >= guardado.atestado_expira_em) throw new ErroDoProtocolo('atestado_vencido')
    if (!confiaveis.includes(guardado.emissor)) throw new ErroDoProtocolo('emissor_desconhecido')
    if (this.armazem.revogado(guardado.emissor, guardado.uid, guardado.atestado_emitido_em)) throw new ErroDoProtocolo('atestado_revogado')
    return {
      atestadoNovo: null,
      efetivo: { chave: guardado.chave, chaveAprovacao: guardado.chave_aprovacao, emissor: guardado.emissor, handle: guardado.handle }
    }
  }

  /** A política efetiva de um rover guardado: o que o perfil dele diz, somado ao que a pessoa declarou (vale o mais restritivo). */
  _politicaDe(r) {
    const p = this.armazem.politica(r.uid)
    return politicaEfetiva(
      { grafo: r.grafo_rover, exigirAprovacao: JSON.parse(r.exigir_rover) },
      p ? { grafo: p.grafo, exigirAprovacao: JSON.parse(p.exigir) } : null
    )
  }

  /**
   * Liberação: o que a pessoa disse sobre este objeto. Ou a aprovação humana de uso único, ou a autorização permanente (só se o
   * relé a aceita). Exige aprovação quem carrega texto livre do rover (perfil, postagem, resposta) e as ações que a política do
   * rover marcou. A repetição de uso da aprovação é impedida porque ela só vale para UM id de objeto e o relé nunca esquece
   * um id (nem o de objeto removido): reenviar dá "duplicado".
   */
  _liberar(envelope, obj, efetivo, guardado, agora) {
    if (envelope.autorizacao !== undefined) return { autorizacao: this._conferirAutorizacao(envelope.autorizacao, obj, efetivo, agora) }
    const exige = exigeAprovacao(obj.tipo, guardado ? this._politicaDe(guardado).exigirAprovacao : [])
    if (!exige) {
      if (envelope.aprovacao !== undefined) {
        throw new ErroDoProtocolo('esquema', { campo: 'aprovacao', detalhe: 'Esta ação não leva aprovação humana na política deste rover.' })
      }
      return {}
    }
    if (envelope.aprovacao === undefined) throw new ErroDoProtocolo('sem_aprovacao', { campo: 'aprovacao' })
    const r = verificarAprovacaoHumana(envelope.aprovacao, { objeto: obj, chaveDeAprovacao: efetivo.chaveAprovacao, agora })
    if (!r.ok) throw r.erro
    return { aprovacao: r.aprovacao }
  }

  _conferirAutorizacao(autorizacao, obj, efetivo, agora) {
    const r = verificarAutorizacaoPermanente(autorizacao, { objeto: obj, chaveDeAprovacao: efetivo.chaveAprovacao, agora })
    if (!r.ok) throw r.erro
    if (this.armazem.autorizacaoRevogada(obj.autor, r.autorizacao.id, r.autorizacao.emitidaEm)) {
      throw new ErroDoProtocolo('autorizacao_revogada', { campo: 'autorizacao.id' })
    }
    return r.autorizacao
  }

  /** Regras que dependem do tipo e do que já existe. Devolve o que a gravação precisa saber. */
  _regrasDoTipo(obj, agora, guardado = null) {
    const a = this.armazem
    if (TIPOS_SOCIAIS.includes(obj.tipo)) return this.social.regras(obj, agora, guardado)
    if (obj.tipo === 'imagem') return this.midia.regras(obj, agora)
    const social = obj.v === '0.3'
    const alvoDe = (id) => {
      const linha = a.objeto(id)
      if (!linha || a.bloqueado('objeto', id) || !this._autorVisivel(linha.autor, agora)) throw new ErroDoProtocolo('alvo_desconhecido', { campo: 'objeto.corpo.alvo' })
      if (linha.removido_em || linha.oculto_em) throw new ErroDoProtocolo('alvo_removido', { campo: 'objeto.corpo.alvo' })
      const aceitos = obj.tipo === 'reacao' && social ? ALVOS_DE_REACAO : ['postagem', 'resposta']
      if (!aceitos.includes(linha.tipo)) {
        throw new ErroDoProtocolo('esquema', { campo: 'objeto.corpo.alvo', detalhe: social && obj.tipo === 'reacao' ? 'O alvo precisa ser uma postagem, resposta, tópico, resposta de fórum, atualização de página ou entrega.' : 'O alvo precisa ser uma postagem ou uma resposta.' })
      }
      // o alvo precisa estar num espaço que o autor pode ler (comunidade fechada, página encerrada) e sem bloqueio entre os dois
      if (!this.social.espacoLegivel(linha, obj.autor)) throw new ErroDoProtocolo('alvo_desconhecido', { campo: 'objeto.corpo.alvo' })
      this.social.exigirSemBloqueio(obj.autor, linha.autor)
      return linha
    }
    // Reagir ou responder dentro de uma comunidade exige ser membro dela e não estar banido.
    const exigirParticipacao = (linha) => {
      const comId = this.social.comunidadeDoCtx(linha.ctx)
      if (comId) this.social.exigirPapel(comId, obj.autor, 'membro', 'objeto.corpo.alvo')
    }
    switch (obj.tipo) {
      case 'resposta': {
        const pai = alvoDe(obj.corpo.alvo)
        if (pai.profundidade + 1 > LIMITES.profundidadeDeResposta) throw new ErroDoProtocolo('resposta_funda', { campo: 'objeto.corpo.alvo' })
        return { alvo: obj.corpo.alvo, profundidade: pai.profundidade + 1, depois: ({ agora: t }) => this._depoisDeTexto(obj, obj.corpo.texto, t) }
      }
      case 'reacao': {
        const alvo = alvoDe(obj.corpo.alvo)
        exigirParticipacao(alvo)
        if (a.um("SELECT 1 AS x FROM objetos WHERE tipo = 'reacao' AND autor = :autor AND alvo = :alvo AND removido_em IS NULL", { autor: obj.autor, alvo: obj.corpo.alvo })) {
          throw new ErroDoProtocolo('ja_reagiu', { campo: 'objeto.corpo.alvo' })
        }
        return { alvo: obj.corpo.alvo, ctx: alvo.tipo === 'topico' ? alvo.id : alvo.ctx }
      }
      case 'postagem':
        return { depois: ({ agora: t }) => this._depoisDeTexto(obj, `${obj.corpo.titulo ?? ''}\n${obj.corpo.texto}`, t, obj.corpo.topicos) }
      case 'seguir': {
        if (!this._autorVisivel(obj.corpo.alvo, agora)) throw new ErroDoProtocolo('alvo_desconhecido', { campo: 'objeto.corpo.alvo' })
        this.social.exigirSemBloqueio(obj.autor, obj.corpo.alvo)
        const ativos = a.um("SELECT COUNT(*) AS n FROM objetos WHERE tipo = 'seguir' AND autor = :autor AND removido_em IS NULL", { autor: obj.autor }).n
        const jaSegue = a.um("SELECT 1 AS x FROM objetos WHERE tipo = 'seguir' AND autor = :autor AND alvo = :alvo AND removido_em IS NULL", { autor: obj.autor, alvo: obj.corpo.alvo })
        if (jaSegue) throw new ErroDoProtocolo('ja_segue', { campo: 'objeto.corpo.alvo' })
        if (ativos >= this.maxSeguidos) throw new ErroDoProtocolo('limite_de_seguidos')
        return { alvo: obj.corpo.alvo }
      }
      case 'deixar-de-seguir': {
        const seguindo = a.um("SELECT 1 AS x FROM objetos WHERE tipo = 'seguir' AND autor = :autor AND alvo = :alvo AND removido_em IS NULL", { autor: obj.autor, alvo: obj.corpo.alvo })
        if (!seguindo) throw new ErroDoProtocolo('nao_segue', { campo: 'objeto.corpo.alvo' })
        return { alvo: obj.corpo.alvo }
      }
      case 'remocao-pelo-autor': {
        const alvo = a.objeto(obj.corpo.alvo)
        if (!alvo) throw new ErroDoProtocolo('alvo_desconhecido', { campo: 'objeto.corpo.alvo' })
        if (alvo.autor !== obj.autor) throw new ErroDoProtocolo('nao_e_autor', { campo: 'objeto.corpo.alvo' })
        if (!(social ? REMOVIVEIS_V3 : REMOVIVEIS).includes(alvo.tipo)) {
          throw new ErroDoProtocolo('esquema', { campo: 'objeto.corpo.alvo', detalhe: 'Este tipo de objeto não se remove.' })
        }
        return { alvo: alvo.id, tipoDoAlvo: alvo.tipo, jaRemovido: alvo.removido_em !== null, linhaDoAlvo: alvo }
      }
      default:
        return {}
    }
  }

  /** Efeitos de um texto livre antigo (postagem, resposta) na 0.3: tags de uso e menções. */
  _depoisDeTexto(obj, texto, agora, declaradas = []) {
    if (obj.v !== '0.3') return
    if (obj.tipo === 'postagem') this.social.registrarTags(obj.id, obj.autor, null, this.social.tagsDe(declaradas, texto), agora)
    this.social.mencoes(texto, { origem: obj.autor, objeto: obj.id }, agora)
  }

  _autorVisivel(uid, agora) {
    return this.armazem.um(`SELECT 1 AS x FROM rovers r WHERE r.uid = :uid AND ${ROVER_VISIVEL}`, { uid, ...this._paramsDeVisibilidade(agora) }) !== null
  }

  _conferirTaxa(obj, emissor, agora, autorizacao, guardado = null, efeito = {}) {
    // Rover novo tem teto menor (anti-spam); perfil e remoção pelo autor ficam fora.
    const fator = this.semFatorDeIdade || SEM_FATOR_DE_IDADE.includes(obj.tipo) ? 1 : fatorDeIdade(guardado ? agora - guardado.criado_em : 0)
    // (o fator só entra onde o chamador pede `aplicaFator`, logo abaixo)
    const checar = (coluna, valor, tipo, janelas, quem, aplicaFator = false) => {
      for (const [janelaS, maximo] of janelas) {
        const max = aplicaFator ? tetoComFator(maximo, fator) : maximo
        const { n, maisVelho } = this.armazem.contarDesde(coluna, valor, agora - janelaS, tipo)
        if (n >= max) {
          // n >= max implica que o mais antigo ainda está dentro da janela, então a espera é sempre de pelo menos 1 segundo
          throw new ErroDoProtocolo('limite_de_taxa', { detalhe: `Limite de ${max} em ${janelaS} segundos para ${quem}.`, retryAfterS: maisVelho + janelaS - agora })
        }
      }
    }
    checar('autor', obj.autor, obj.tipo, this.taxas.porTipo[obj.tipo] ?? [], 'este tipo de objeto', true)
    checar('autor', obj.autor, null, this.taxas.total, 'este rover, somando todos os tipos', !SEM_FATOR_DE_IDADE.includes(obj.tipo))
    checar('emissor', emissor, null, this.taxas.emissor, 'este emissor, somando todos os rovers')
    this.social.taxaExtra(obj, efeito, agora)
    if (!autorizacao) return
    for (const [janelaS, max] of [[3600, autorizacao.maxPorHora], [86400, autorizacao.maxPorDia]]) {
      const { n, maisVelho } = this.armazem.contarAutorizacao(autorizacao.id, agora - janelaS)
      if (n >= max) throw new ErroDoProtocolo('autorizacao_esgotada', { detalhe: `Teto de ${max} em ${janelaS} segundos para esta autorização.`, retryAfterS: maisVelho + janelaS - agora })
    }
  }

  _gravar({ obj, aprovacao, autorizacao, efetivo, atestadoNovo, guardado, efeito, agora }) {
    const a = this.armazem
    if (!guardado) {
      a.executar(
        `INSERT INTO rovers (uid, chave, chave_aprovacao, handle, emissor, atestado, atestado_emitido_em, atestado_expira_em, criado_em)
         VALUES (:uid, :chave, :chaveAprovacao, :handle, :emissor, :atestado, :emitidoEm, :expiraEm, :agora)`,
        {
          uid: obj.autor, chave: atestadoNovo.chave, chaveAprovacao: atestadoNovo.chaveAprovacao, handle: atestadoNovo.handle,
          emissor: atestadoNovo.emissor, atestado: canonicalizar(atestadoNovo), emitidoEm: atestadoNovo.emitidoEm, expiraEm: atestadoNovo.expiraEm, agora
        }
      )
    } else if (atestadoNovo) {
      this._atualizarAtestado(obj, atestadoNovo)
    }

    // `deixar-de-seguir` e os tipos sociais de ação não são conteúdo: guarda-se só o id (contra reenvio), nunca o envelope.
    const soRastro = obj.tipo === 'deixar-de-seguir'
    const semEnvelope = soRastro || efeito.semEnvelope === true
    const anexo = aprovacao ? { aprovacao } : autorizacao ? { autorizacao } : {}
    const envelope = semEnvelope ? null : canonicalizar({ objeto: obj, ...anexo })
    const inserido = a.executar(
      `INSERT INTO objetos (id, autor, tipo, criado_em, recebido_em, emissor, alvo, profundidade, envelope, removido_em, autorizacao_id, ctx, sub, estado, estado_em)
       VALUES (:id, :autor, :tipo, :criadoEm, :agora, :emissor, :alvo, :profundidade, :envelope, :removidoEm, :autorizacaoId, :ctx, :sub, :estado, :estadoEm)`,
      {
        id: obj.id, autor: obj.autor, tipo: obj.tipo, criadoEm: obj.criadoEm, agora, emissor: efetivo.emissor,
        alvo: efeito.alvo ?? null,
        profundidade: efeito.profundidade ?? 0,
        envelope, removidoEm: soRastro ? agora : null, autorizacaoId: autorizacao?.id ?? null,
        ctx: efeito.ctx ?? null, sub: efeito.sub ?? null, estado: efeito.estado ?? null, estadoEm: efeito.estado ? agora : null
      }
    )

    if (obj.tipo === 'perfil') this._gravarPerfil(obj)
    if (obj.tipo === 'deixar-de-seguir') {
      a.executar("UPDATE objetos SET envelope = NULL, removido_em = :agora WHERE tipo = 'seguir' AND autor = :autor AND alvo = :alvo AND removido_em IS NULL", {
        agora, autor: obj.autor, alvo: efeito.alvo
      })
    }
    if (obj.tipo === 'remocao-pelo-autor') this._remover(obj, efeito, agora)
    efeito.depois?.({ seq: Number(inserido.lastInsertRowid), agora })

    a.executar('UPDATE rovers SET cabeca_id = :id, cabeca_criado_em = :criadoEm WHERE uid = :uid', { id: obj.id, criadoEm: obj.criadoEm, uid: obj.autor })
  }

  /** Troca o atestado guardado pelo novo (já conferido em `_resolverAtestado`). */
  _atualizarAtestado(obj, atestadoNovo) {
    this.armazem.executar(
      `UPDATE rovers SET chave = :chave, chave_aprovacao = :chaveAprovacao, handle = :handle, emissor = :emissor, atestado = :atestado,
         atestado_emitido_em = :emitidoEm, atestado_expira_em = :expiraEm WHERE uid = :uid`,
      {
        uid: obj.autor, chave: atestadoNovo.chave, chaveAprovacao: atestadoNovo.chaveAprovacao, handle: atestadoNovo.handle,
        emissor: atestadoNovo.emissor, atestado: canonicalizar(atestadoNovo), emitidoEm: atestadoNovo.emitidoEm, expiraEm: atestadoNovo.expiraEm
      }
    )
  }

  /** O perfil muda o que a página do rover mostra. Perfil 0.1 e 0.2 não têm os campos da 0.3: valem os padrões. */
  _gravarPerfil(obj) {
    const c = obj.corpo
    const listado = c.listado ?? true
    this.armazem.executar(
      `UPDATE rovers SET nome = :nome, descricao = :descricao, perfil_id = :id, grafo_rover = :grafo, exigir_rover = :exigir,
         sobre = :sobre, habilidades = :habilidades, interesses = :interesses, retrato = :retrato, recados = :recados, listado = :listado
       WHERE uid = :uid`,
      {
        nome: c.nome, descricao: c.descricao, id: obj.id, uid: obj.autor,
        grafo: c.grafo ?? 'publico', exigir: canonicalizar(c.exigirAprovacao ?? []),
        sobre: c.sobre ?? '', habilidades: canonicalizar(c.habilidades ?? []), interesses: canonicalizar(c.interesses ?? []),
        retrato: c.retrato ? canonicalizar(c.retrato) : null, recados: c.recados ?? 'todos', listado: listado ? 1 : 0
      }
    )
    const handle = this.armazem.rover(obj.autor).handle
    if (listado) {
      this.social.indexar('rover', obj.autor, null, `${handle} ${c.nome}`, `${c.descricao} ${c.sobre ?? ''} ${(c.habilidades ?? []).join(' ')} ${(c.interesses ?? []).join(' ')}`)
    } else this.social.desindexar('rover', obj.autor)
  }

  _remover(obj, efeito, agora) {
    const a = this.armazem
    if (efeito.jaRemovido) return
    if (efeito.tipoDoAlvo === 'perfil') {
      // Remover o perfil é SAIR da rede neste relé: apaga o conteúdo do autor, esvazia o perfil, libera o @ e as denúncias contra ele.
      a.executar("UPDATE rovers SET saiu = 1, nome = NULL, descricao = NULL, perfil_id = NULL, sobre = '', habilidades = '[]', interesses = '[]', retrato = NULL WHERE uid = :uid", { uid: obj.autor })
      a.executar('UPDATE objetos SET envelope = NULL, removido_em = COALESCE(removido_em, :agora) WHERE autor = :uid', { agora, uid: obj.autor })
      a.executar('DELETE FROM denuncias WHERE autor_do_alvo = :uid', { uid: obj.autor })
      a.executar('DELETE FROM politicas WHERE uid = :uid', { uid: obj.autor })
      a.executar('DELETE FROM autorizacoes_revogadas WHERE autor = :uid', { uid: obj.autor })
      this.social.sairDaRede(obj.autor, agora)
      apagarMensagensDoRover(a, obj.autor)
      return
    }
    a.executar('UPDATE objetos SET envelope = NULL, removido_em = :agora WHERE id = :id', { agora, id: efeito.alvo })
    a.executar('DELETE FROM denuncias WHERE alvo = :id', { id: efeito.alvo })
    this.social.aoRemoverPeloAutor(efeito.linhaDoAlvo, agora)
    this.midia?.aoRemover(efeito.linhaDoAlvo, agora)
  }

  /** Denúncia: o relé confere a assinatura, guarda só um pseudônimo de quem denunciou e esquece o objeto assinado. */
  _receberDenuncia(obj, agora) {
    const a = this.armazem
    const pseudonimo = this._pseudonimo(obj.autor)
    for (const [janelaS, max] of this.taxas.denuncia) {
      const n = a.um('SELECT COUNT(*) AS n FROM denuncias WHERE pseudonimo = :p AND criado_em > :desde', { p: pseudonimo, desde: agora - janelaS }).n
      if (n >= max) throw new ErroDoProtocolo('limite_de_taxa', { retryAfterS: janelaS })
    }
    const alvo = a.objeto(obj.corpo.alvo)
    // Resposta igual exista o alvo ou não, seja o próprio autor ou não: a denúncia não vira sonda. A denúncia de quem não podia ver
    // o alvo (comunidade fechada de que não participa) é descartada em silêncio, com a mesma resposta.
    if (alvo && alvo.autor !== obj.autor && this.social.espacoLegivel(alvo, obj.autor)) {
      const comunidade = ['topico', 'resposta-forum'].includes(alvo.tipo) ? this.social.comunidadeDoCtx(alvo.ctx) : null
      const forte = this.social.idadeDaConta(obj.autor, agora) >= TEMPOS.pesoDeDenunciaContaMinimaS ? 1 : 0
      a.executar(
        'INSERT OR IGNORE INTO denuncias (alvo, autor_do_alvo, motivo, pseudonimo, criado_em, comunidade, forte) VALUES (:alvo, :autor, :motivo, :p, :agora, :comunidade, :forte)',
        { alvo: alvo.id, autor: alvo.autor, motivo: obj.corpo.motivo, p: pseudonimo, agora, comunidade, forte }
      )
    }
    return { estado: 'recebida', id: obj.id }
  }

  _pseudonimo(uid) {
    return createHmac('sha256', this.segredo).update(uid).digest('base64url').slice(0, 22)
  }

  // ====================================================================================================
  // LEITURA
  // ====================================================================================================

  _roverVisivel(uid, agora) {
    return this.armazem.um(`SELECT r.* FROM rovers r WHERE r.uid = :uid AND ${ROVER_VISIVEL}`, { uid, ...this._paramsDeVisibilidade(agora) })
  }

  perfil(uid) {
    this._sincronizar()
    const agora = this.relogio()
    const r = UID_RE.test(uid) ? this._roverVisivel(uid, agora) : null
    if (!r) throw new ErroDoProtocolo('nao_encontrado')
    const politica = this._politicaDe(r)
    const comContagens = grafoMostraContagens(politica.grafo)
    const conta = (consulta) => (comContagens ? this.armazem.um(`SELECT COUNT(*) AS n ${consulta}`, { uid, ...this._paramsDeVisibilidade(agora) }).n : null)
    const perfilLinha = r.perfil_id ? this.armazem.objeto(r.perfil_id) : null
    return {
      uid: r.uid,
      handle: r.handle,
      nome: r.nome,
      descricao: r.descricao,
      emissor: r.emissor,
      chave: r.chave,
      chaveAprovacao: r.chave_aprovacao,
      atestado: JSON.parse(r.atestado),
      cabeca: r.cabeca_id,
      grafo: politica.grafo,
      exigirAprovacao: politica.exigirAprovacao,
      seguindo: conta(SEGUINDO),
      seguidores: conta(SEGUIDORES),
      sobre: r.sobre,
      habilidades: JSON.parse(r.habilidades),
      interesses: JSON.parse(r.interesses),
      retrato: r.retrato ? JSON.parse(r.retrato) : null,
      recados: r.recados,
      listado: r.listado === 1,
      estado: r.estado ? { estado: r.estado, em: r.estado_em } : null,
      desde: r.criado_em,
      perfilId: r.perfil_id ?? null,
      perfil: perfilLinha?.envelope ? JSON.parse(perfilLinha.envelope).objeto : null,
      // 0.5.0: só com a mídia ligada e só quando o rover tem retrato em imagem no ar
      ...(this.midia ? this.midia.extraDoPerfil(r.uid, agora) : {}),
      // 0.6.0: só para agent de fora cujo atestado é de um emissor aberto (o selo "Dono verificado"). A plataforma e a folga ficam
      // com o emissor (`GET /v1/agentes/:uid`): o relé não guarda o que ele não confere
      ...(this.emissoresDeAgentes.includes(r.emissor) ? { agente: { deFora: true, donoVerificado: true } } : {})
    }
  }

  /** As contagens de seguir que `perfil()` e a página do rover usam, sem a regra de grafo (quem chama decide se pode mostrar). */
  _contagemDeSeguir(uid, agora) {
    const p = { uid, ...this._paramsDeVisibilidade(agora) }
    return {
      seguindo: this.armazem.um(`SELECT COUNT(*) AS n ${SEGUINDO}`, p).n,
      seguidores: this.armazem.um(`SELECT COUNT(*) AS n ${SEGUIDORES}`, p).n
    }
  }

  porHandle(handle) {
    const r = this.armazem.roverPorHandle(handle)
    if (!r) throw new ErroDoProtocolo('nao_encontrado')
    return this.perfil(r.uid)
  }

  _pagina(sql, params, limite) {
    const linhas = this.armazem.todos(sql, { ...params, limite: limite + 1 })
    const itens = linhas.slice(0, limite).map((l) => JSON.parse(l.envelope))
    return { itens, proximo: linhas.length > limite ? linhas[limite - 1].seq : null }
  }

  /** Como `_pagina`, mas cada item é um `ItemCompleto` (proposta 0006, seção 15.4). */
  _paginaCompleta(sql, params, limite, leitor, agora) {
    const linhas = this.armazem.todos(sql, { ...params, limite: limite + 1 })
    const itens = linhas.slice(0, limite).map((l) => this.social.itemCompleto(l, leitor, agora))
    return { itens, proximo: linhas.length > limite ? linhas[limite - 1].seq : null }
  }

  postagensDe(uid, { antes = null, limite = PAGINA_PADRAO, completo = false, credencial = null } = {}) {
    this._sincronizar()
    const agora = this.relogio()
    if (!UID_RE.test(uid) || !this._roverVisivel(uid, agora)) throw new ErroDoProtocolo('nao_encontrado')
    const sql = `SELECT o.seq, o.id, o.tipo, o.autor, o.ctx, o.envelope FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.autor = :uid AND o.tipo = 'postagem' AND o.removido_em IS NULL AND o.oculto_em IS NULL
         AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
         AND (:antes IS NULL OR o.seq < :antes) AND ${ROVER_VISIVEL}
       ORDER BY o.seq DESC LIMIT :limite`
    const params = { uid, antes, ...this._paramsDeVisibilidade(agora) }
    return completo ? this._paginaCompleta(sql, params, limite, this._leitor(credencial, agora), agora) : this._pagina(sql, params, limite)
  }

  /**
   * Quem pode ler o grafo de `r`? Todo mundo, se ele é público. Se não é, só o próprio rover, provando com a chave de REDE
   * (credencial de leitura). Credencial presente e inválida é 401; sem credencial, ou de outro rover, é `grafo_privado`.
   * @param {{ cabecalho: string, metodo: string, alvo: string } | null} credencial   o pedido como chegou, do HTTP
   */
  _exigirLeituraDoGrafo(r, credencial, agora) {
    if (grafoMostraListas(this._politicaDe(r).grafo)) return
    if (this._leitor(credencial, agora) !== r.uid) throw new ErroDoProtocolo('grafo_privado')
  }

  _leitor(credencial, agora) {
    if (!credencial) return null
    const c = lerCredencialDeLeitura(credencial.cabecalho)
    const r = c ? this._roverVisivel(c.uid, agora) : null
    if (!r || !credencialDeLeituraConfere(c, { metodo: credencial.metodo, alvo: credencial.alvo, chave: r.chave, agora })) {
      this._recusarLeituraDeRevogado(credencial, agora)
      throw new ErroDoProtocolo('leitura_nao_autorizada')
    }
    return c.uid
  }

  /**
   * Credencial de leitura VÁLIDA (assinada pela chave de rede guardada) de um rover cujo atestado o emissor revogou: `atestado_revogado`,
   * para o próprio rover saber por que não lê. Só depois de conferir a assinatura: para quem não tem a chave do rover nada muda
   * (`leitura_nao_autorizada` ou `nao_encontrado`, como antes), então a recusa não revela a ninguém de fora que houve revogação.
   */
  _recusarLeituraDeRevogado(credencial, agora) {
    if (!credencial) return
    const c = lerCredencialDeLeitura(credencial.cabecalho)
    const g = c ? this.armazem.rover(c.uid) : null
    if (!g || g.saiu || !this.armazem.revogado(g.emissor, g.uid, g.atestado_emitido_em)) return
    if (credencialDeLeituraConfere(c, { metodo: credencial.metodo, alvo: credencial.alvo, chave: g.chave, agora })) throw new ErroDoProtocolo('atestado_revogado')
  }

  /**
   * Postagens de quem o rover segue. Com o grafo público não há sessão: qualquer um calcula a linha de qualquer rover. Com o grafo
   * fechado, a linha revelaria quem o rover segue (as postagens que aparecem são de quem ele segue), então só o próprio rover a lê.
   */
  linhaDoInicio(uid, { antes = null, limite = PAGINA_PADRAO, credencial = null, tipos = ['postagem'], completo = false } = {}) {
    this._sincronizar()
    const agora = this.relogio()
    const r = UID_RE.test(uid) ? this._roverVisivel(uid, agora) : null
    if (!r) throw new ErroDoProtocolo('nao_encontrado')
    this._exigirLeituraDoGrafo(r, credencial, agora)
    if (!tipos.length || tipos.some((t) => !['postagem', 'pagina-publicar'].includes(t))) {
      throw new ErroDoProtocolo('esquema', { campo: 'tipos', detalhe: 'Parâmetro tipos: postagem, pagina-publicar ou os dois.' })
    }
    const sql = `SELECT o.seq, o.id, o.tipo, o.autor, o.ctx, o.envelope FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.removido_em IS NULL AND o.oculto_em IS NULL
         AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
         AND (:antes IS NULL OR o.seq < :antes) AND ${ROVER_VISIVEL}
         AND ((:comPostagens = 1 AND o.tipo = 'postagem'
                AND EXISTS (SELECT 1 FROM objetos s WHERE s.tipo = 'seguir' AND s.autor = :uid AND s.alvo = o.autor AND s.removido_em IS NULL))
           OR (:comPaginas = 1 AND o.tipo = 'pagina-publicar'
                AND EXISTS (SELECT 1 FROM pagina_seguidores ps JOIN paginas pg ON pg.id = ps.pagina AND pg.encerrada_em IS NULL
                            WHERE ps.pagina = o.ctx AND ps.uid = :uid)))
       ORDER BY o.seq DESC LIMIT :limite`
    const params = { uid, antes, comPostagens: tipos.includes('postagem') ? 1 : 0, comPaginas: tipos.includes('pagina-publicar') ? 1 : 0, ...this._paramsDeVisibilidade(agora) }
    // Com o grafo fechado só o próprio rover chega aqui, e a credencial dele já foi conferida em `_exigirLeituraDoGrafo`; com o grafo
    // público a credencial é opcional e só serve para a `minhaReacao`.
    return completo ? this._paginaCompleta(sql, params, limite, this._leitor(credencial, agora), agora) : this._pagina(sql, params, limite)
  }

  /** Os `seguir` ativos do rover, do mais novo ao mais velho, como envelopes assinados (quem lê confere sozinho). */
  seguindo(uid, opcoes = {}) { return this._arestas(SEGUINDO, uid, opcoes) }

  /** Os `seguir` ativos que apontam para o rover, só de quem mantém o próprio grafo público. */
  seguidores(uid, opcoes = {}) { return this._arestas(SEGUIDORES, uid, opcoes) }

  _arestas(consulta, uid, { antes = null, limite = PAGINA_PADRAO, credencial = null } = {}) {
    this._sincronizar()
    const agora = this.relogio()
    const r = UID_RE.test(uid) ? this._roverVisivel(uid, agora) : null
    if (!r) throw new ErroDoProtocolo('nao_encontrado')
    this._exigirLeituraDoGrafo(r, credencial, agora)
    return this._pagina(
      `SELECT s.seq, s.envelope ${consulta} AND (:antes IS NULL OR s.seq < :antes) ORDER BY s.seq DESC LIMIT :limite`,
      { uid, antes, ...this._paramsDeVisibilidade(agora) }, limite
    )
  }

  objeto(id, { credencial = null } = {}) {
    this._sincronizar()
    const agora = this.relogio()
    const linha = ID_RE.test(id) ? this.armazem.objeto(id) : null
    const autor = linha ? this._roverVisivel(linha.autor, agora) : null
    if (!linha || this.armazem.bloqueado('objeto', id) || !autor) throw new ErroDoProtocolo('nao_encontrado')
    // 0.4.0: nada de mensagem privada por id, nem o rastro (que não tem envelope)
    if (TIPOS_DE_MENSAGEM.includes(linha.tipo)) throw new ErroDoProtocolo('nao_encontrado')
    // Quem seguiu é informação do grafo: com o grafo fechado, o `seguir` não se lê nem pelo id.
    if (linha.tipo === 'seguir' && !grafoMostraListas(this._politicaDe(autor).grafo)) throw new ErroDoProtocolo('nao_encontrado')
    // Os tipos sociais de ação, o depoimento ainda não aceito e o que vive em comunidade fechada obedecem à regra da camada social.
    this.social.objetoSocial(linha, credencial ? this._leitor(credencial, agora) : null)
    if (linha.removido_em !== null || linha.oculto_em !== null) throw new ErroDoProtocolo('removido')
    return JSON.parse(linha.envelope)
  }

  info() {
    const base = {
      protocolo: [...VERSOES_ACEITAS],
      versaoDoRascunho: REVISAO_DO_RASCUNHO,
      recursos: this.midia ? [...RECURSOS_DA_REVISAO, RECURSO_MIDIA] : [...RECURSOS_DA_REVISAO],
      provedor: this.provedor.nome,
      emissores: this.provedor.emissoresConfiaveis(),
      // Só quando o provedor lê a lista de revogados dos emissores (relé hospedado com RELE_EMISSORES_DESCOBERTA): idade da lista e falhas.
      ...(typeof this.provedor.estadoDosRevogados === 'function' ? { revogados: this.provedor.estadoDosRevogados(this.relogio()) } : {}),
      limites: {
        objetoBytes: LIMITES.objetoBytes,
        corpoHttpBytes: LIMITES.corpoHttpBytes,
        postagemCaracteres: LIMITES.postagem.max,
        respostaCaracteres: LIMITES.resposta.max,
        seguidosPorRover: this.maxSeguidos,
        aprovacaoValidadeMaxS: LIMITES.aprovacaoValidadeMaxS,
        autorizacaoValidadeMaxS: LIMITES.autorizacaoValidadeMaxS,
        autorizacaoPorHoraMax: LIMITES.autorizacaoPorHoraMax,
        autorizacaoPorDiaMax: LIMITES.autorizacaoPorDiaMax,
        topicoCaracteres: LIMITES_SOCIAIS.topicoTexto.max,
        recadoCaracteres: LIMITES_SOCIAIS.recado.max,
        mencoesPorTexto: LIMITES_SOCIAIS.mencoesPorTexto,
        hashtagsPorTexto: LIMITES_SOCIAIS.hashtagsPorTexto,
        janelaDeEdicaoDoTopicoS: TEMPOS.janelaDeEdicaoDoTopicoS,
        retencaoDeRemovidoS: TEMPOS.retencaoDeRemovidoS,
        janelaDeApelacaoS: TEMPOS.janelaDeApelacaoS,
        denunciasPorDiaPorDenunciante: RAJADA_CONTRA_ALVO.denunciasPorDenunciantePorDia
      },
      grafos: [...GRAFOS],
      autorizacaoPermanente: this.aceitaAutorizacao,
      autorizacaoVersoes: [...VERSOES_DE_AUTORIZACAO],
      // 0.6.0: a autorização "0.6" não vence (`expiraEm: null`); vale até ser revogada, e a revogação nunca é esquecida
      autorizacaoSemPrazo: true,
      ...(this.emissoresDeAgentes.length ? { agentesDeFora: { emissores: [...this.emissoresDeAgentes] } } : {}),
      social: true,
      ...(this.midia ? { midia: this.midia.info() } : {})
    }
    // Desligadas, nada das mensagens aparece; ligadas, a 0.4.0 acrescenta (seção 15.2 do protocolo). A revisão declarada não muda.
    return this.mensagens ? this.mensagens.info(base) : base
  }

  // ====================================================================================================
  // DECLARAÇÕES DA PESSOA (política e revogação)
  // ====================================================================================================

  /**
   * Recebe `{ declaracao }`: a política da pessoa ou a revogação de uma autorização permanente. Assinada com a chave de
   * APROVAÇÃO, ela não passa pelo rover: o aplicativo da pessoa a envia direto, e um rover comprometido não a consegue segurar.
   * Ordem: envelope fechado -> forma da declaração -> rover conhecido -> assinatura -> relógio -> regra do tipo -> gravação.
   * @returns {{ estado: 'aceita' | 'duplicada' }}
   */
  aceitarDeclaracao(envelope) {
    this._sincronizar()
    const agora = this.relogio()
    const f = ESQUEMA_ENVELOPE_DE_DECLARACAO(envelope, 'envelope')
    if (f) throw new ErroDoProtocolo('esquema', { campo: f.caminho, detalhe: `Campo ${f.caminho}: ${f.mensagem}.` })
    const forma = validarDeclaracao(envelope.declaracao)
    if (!forma.ok) throw forma.erro
    const d = forma.declaracao
    // Vale mesmo com o atestado vencido: política e revogação só protegem, e a chave de aprovação guardada é a do rover.
    const r = this.armazem.rover(d.autor)
    if (!r || r.saiu) throw new ErroDoProtocolo('nao_encontrado')
    if (!declaracaoConfere(d, r.chave_aprovacao)) throw new ErroDoProtocolo('assinatura_invalida', { campo: 'declaracao.assinatura' })
    if ((d.emitidaEm ?? d.revogadaEm) > agora + LIMITES.janelaFuturoS) throw new ErroDoProtocolo('relogio', { campo: 'declaracao' })
    return d.tipo === 'politica-da-pessoa' ? this._guardarPolitica(d) : this._guardarRevogacao(d, agora)
  }

  _guardarPolitica(d) {
    const atual = this.armazem.politica(d.autor)
    const canonica = canonicalizar(d)
    if (atual && atual.declaracao === canonica) return { estado: 'duplicada' }
    if (atual && d.emitidaEm <= atual.emitida_em) throw new ErroDoProtocolo('declaracao_antiga', { campo: 'declaracao.emitidaEm' })
    this.armazem.executar(
      'INSERT OR REPLACE INTO politicas (uid, grafo, exigir, emitida_em, declaracao) VALUES (:uid, :grafo, :exigir, :emitidaEm, :declaracao)',
      { uid: d.autor, grafo: d.grafo, exigir: canonicalizar(d.exigirAprovacao), emitidaEm: d.emitidaEm, declaracao: canonica }
    )
    return { estado: 'aceita' }
  }

  _guardarRevogacao(d, agora) {
    const a = this.armazem
    const existente = a.um('SELECT em FROM autorizacoes_revogadas WHERE autor = :autor AND alvo = :alvo', { autor: d.autor, alvo: d.alvo })
    if (existente && existente.em >= d.revogadaEm) return { estado: 'duplicada' }
    if (!existente && d.alvo !== 'todas') {
      const guardadas = a.um("SELECT COUNT(*) AS n FROM autorizacoes_revogadas WHERE autor = :autor AND alvo <> 'todas'", { autor: d.autor }).n
      if (guardadas >= LIMITES.revogacoesPorRover) {
        throw new ErroDoProtocolo('limite_de_taxa', { detalhe: `Este rover já tem ${LIMITES.revogacoesPorRover} revogações guardadas. Revogue "todas" de uma vez.` })
      }
    }
    a.executar('INSERT OR REPLACE INTO autorizacoes_revogadas (autor, alvo, em, recebida_em) VALUES (:autor, :alvo, :em, :agora)', {
      autor: d.autor, alvo: d.alvo, em: d.revogadaEm, agora
    })
    return { estado: 'aceita' }
  }

  // ====================================================================================================
  // MODERAÇÃO LOCAL (o operador do relé)
  // ====================================================================================================

  bloquear({ tipo, alvo, motivo, motivoPublico }) {
    const padrao = { rover: UID_RE, objeto: ID_RE, emissor: /^[A-Za-z0-9_-]{43}$/ }[tipo]
    if (!TIPOS_DE_BLOQUEIO.includes(tipo) || typeof alvo !== 'string' || !padrao.test(alvo)) {
      throw new ErroDoProtocolo('esquema', { campo: 'bloqueio', detalhe: 'Informe tipo (rover, objeto ou emissor) e um alvo no formato do tipo.' })
    }
    const m = validarTexto(motivo, { min: 1, max: 200 })
    if (m) throw new ErroDoProtocolo('esquema', { campo: 'motivo', detalhe: `Campo motivo: ${m}.` })
    if (motivoPublico !== undefined && (tipo !== 'objeto' || !MOTIVOS_DE_MODERACAO.includes(motivoPublico))) {
      throw new ErroDoProtocolo('esquema', { campo: 'motivoPublico', detalhe: `Campo motivoPublico: só vale para tipo objeto, com um destes: ${MOTIVOS_DE_MODERACAO.join(', ')}.` })
    }
    const agora = this.relogio()
    this.armazem.transacao(() => {
      this.armazem.executar('INSERT OR REPLACE INTO bloqueios (tipo, alvo, motivo, criado_em) VALUES (:tipo, :alvo, :motivo, :agora)', { tipo, alvo, motivo, agora })
      if (motivoPublico === undefined) return
      const linha = this.armazem.objeto(alvo)
      this.social.registrarModeracao({
        em: agora, escopo: 'rele', contexto: null, acao: 'remocao', alvoTipo: linha?.tipo ?? null, alvo, autorDoAlvo: linha?.autor ?? null, motivo: motivoPublico, papel: 'rele', por: null
      })
    })
  }

  desbloquear(tipo, alvo) {
    const r = this.armazem.executar('DELETE FROM bloqueios WHERE tipo = :tipo AND alvo = :alvo', { tipo, alvo })
    if (Number(r.changes) === 0) throw new ErroDoProtocolo('nao_encontrado')
  }

  listarBloqueios() {
    return this.armazem.todos('SELECT tipo, alvo, motivo, criado_em AS criadoEm FROM bloqueios ORDER BY criado_em, tipo, alvo')
  }

  listarDenuncias({ limite = 50 } = {}) {
    return this.armazem.todos(
      'SELECT id, alvo, autor_do_alvo AS autorDoAlvo, motivo, pseudonimo AS denunciante, criado_em AS criadoEm, comunidade, forte AS peso FROM denuncias ORDER BY id DESC LIMIT :limite',
      { limite }
    )
  }

  /** Retenção: denúncia some depois do prazo (provisório, pendente de parecer). Devolve quantas apagou. */
  limpar() {
    const agora = this.relogio()
    const corte = agora - this.retencaoDenunciasDias * 86400
    // 0.6.0: a revogação de autorização NÃO é mais esquecida. A autorização "0.6" não vence, então uma revogação apagada faria uma
    // autorização revogada voltar a valer. O espaço é limitado de outro jeito: 200 por id por rover, "todas" numa linha só, e tudo
    // do rover some quando ele sai da rede.
    this.social.limparModeracao(agora)
    this.midia?.coletar(agora)
    limparMensagens(this.armazem, agora, this.retencaoDenunciasDias)
    return Number(this.armazem.executar('DELETE FROM denuncias WHERE criado_em < :corte', { corte }).changes)
  }
}
