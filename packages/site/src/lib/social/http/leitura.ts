// As rotas de LEITURA da rede social (docs/API-REDE-SOCIAL.md, seção 7), uma por método de `ClienteSocial`.
// A classe é abstrata: quem a estende (ClienteHttp) sabe falar HTTP (`ler`) e buscar um rover (`obterRover`).
// Aqui só se monta o caminho (sempre com `URLSearchParams`, só com o que a especificação aceita), escolhe-se
// o nível de autenticação da rota e se passa a resposta pelo sanear. O que o relé diz é de estranhos.

import { ehIdObjeto, ehUid } from '../../dominio/ids'
import { filtrarInvisiveis } from '../../dominio/invisivel'
import { normalizar } from '../../dominio/limites'
import { ErroRede, type Pagina, type PerfilRover, type ResumoRover } from '../../tipos'
import type { ClienteSocial, RecursoDoRele } from '../cliente-social'
import * as S from '../sanear-social'
import type {
  Acesso, Atualizacao, ItemDaLinha, Janela, OrdemBusca, OrdemListada, OrdemRespostas, OrdemTopicos, TipoDeBusca, TipoDeEmAlta, TipoDeSugestao, InfoDoRele,
} from '../tipos'

/**
 * pública: o cabeçalho de leitura nem é mandado; opcional: vai se houver credencial; própria (e moderador): sem
 * credencial a chamada NEM SAI do computador e vira `proibido`.
 */
export type Nivel = 'publica' | 'opcional' | 'propria'

const INVALIDO = () => new ErroRede('invalido', 'pedido inválido')
const NAO_ACHEI = () => new ErroRede('nao-encontrado', 'não encontrado')

/** O cursor do site é um texto opaco; para o relé é um número. Qualquer outra coisa nem sai daqui. */
export function antesDe(cursor: string | undefined): string | undefined {
  if (cursor === undefined) return undefined
  if (!/^\d{1,15}$/.test(cursor)) throw INVALIDO()
  return cursor
}

export function consulta(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, v)
  return q.size ? `?${q}` : ''
}

const uidOuErro = (x: string): string => {
  if (!ehUid(x)) throw NAO_ACHEI()
  return x
}
const idOuErro = (x: string): string => {
  if (!ehIdObjeto(x)) throw NAO_ACHEI()
  return x
}

const ORDENS_LISTADA = ['recentes', 'ativas']
const ORDENS_TOPICOS = ['recentes', 'ativos', 'sem-resposta', 'melhores', 'em-alta']
const ORDENS_RESPOSTAS = ['antigas', 'recentes', 'melhores', 'em-alta']
const ORDENS_BUSCA = ['relevancia', 'recentes', 'melhores', 'em-alta']
const TAG = /^[a-z0-9][a-z0-9-]{1,23}$/
/** A chave de uma etiqueta ou de um status do vocabulário (0.3.2): ASCII, começa por letra, de 2 a 20 caracteres. */
const CHAVE_DE_VOCABULARIO = /^[a-z][a-z0-9-]{1,19}$/
const JANELAS = ['24h', '7d']

function termoDeBuscaSocial(q: string): string | null {
  const t = normalizar(filtrarInvisiveis(q).texto)
  const n = Array.from(t).length
  return n >= 2 && n <= 100 ? t : null
}

export abstract class LeituraSocialHttp implements ClienteSocial {
  protected abstract ler(caminho: string, nivel: Nivel): Promise<unknown>
  abstract obterRover(ref: string): Promise<PerfilRover>
  /** uid do rover da pessoa, quando o app está pareado (para `linha/inicio?rover=` e `sugestoes`). */
  protected leitor?: string

  private async resumoDe(uid: string, cache?: Map<string, ResumoRover>): Promise<ResumoRover> {
    const c = cache?.get(uid)
    if (c) return c
    const p = S.perfilSocial(await this.ler(`/v1/rovers/${uidOuErro(uid)}`, 'publica'))
    const r: ResumoRover = { uid: p.uid, handle: p.handle, nome: p.nome, rosto: p.rosto }
    cache?.set(uid, r)
    return r
  }

  private async uidDe(ref: string): Promise<string> {
    if (ehUid(ref)) return ref
    const h = ref.replace(/^@/, '').toLowerCase()
    if (!/^[a-z0-9._]{3,30}$/.test(h)) throw NAO_ACHEI()
    return S.perfilSocial(await this.ler(`/v1/handles/${encodeURIComponent(h)}`, 'publica')).uid
  }

  // ---- GET /v1/info (7.7)
  async info(): Promise<InfoDoRele> {
    return S.info(await this.ler('/v1/info', 'publica'))
  }
  /** Os recursos da 0.3.1 do `info`, guardados por 60 s. Falha ao ler = "nenhum": a tela cai no que a 0.3 já fazia. */
  private recursosGuardados?: { ate: number; valor: Promise<ReadonlySet<string>> }
  async suporta(recurso: RecursoDoRele): Promise<boolean> {
    const agora = Date.now()
    if (!this.recursosGuardados || this.recursosGuardados.ate < agora) {
      this.recursosGuardados = { ate: agora + 60_000, valor: this.info().then((i) => new Set(i.recursos)).catch(() => new Set<string>()) }
    }
    return (await this.recursosGuardados.valor).has(recurso)
  }

  // ---- página do rover (7.1)
  async paginaDoRover(ref: string) {
    const uid = await this.uidDe(ref)
    return S.paginaDoRover(await this.ler(`/v1/rovers/${uid}/pagina`, 'opcional'))
  }
  async recados(uid: string, cursor?: string) {
    return S.paginaDe(await this.ler(`/v1/rovers/${uidOuErro(uid)}/recados${consulta({ antes: antesDe(cursor) })}`, 'opcional'), S.recado)
  }
  async depoimentos(uid: string, opcoes: { estado?: 'aceitos' | 'pendentes'; cursor?: string } = {}) {
    const pend = opcoes.estado === 'pendentes'
    const caminho = `/v1/rovers/${uidOuErro(uid)}/depoimentos${consulta({ estado: pend ? 'pendentes' : undefined, antes: antesDe(opcoes.cursor) })}`
    return S.paginaDe(await this.ler(caminho, pend ? 'propria' : 'opcional'), S.depoimento)
  }
  /** `estado=enviados` é só do próprio rover e só a 0.3.1 o entende: sem o recurso nem chama (devolve lista vazia). */
  async depoimentosEnviados(uid: string, cursor?: string) {
    if (!(await this.suporta('depoimentos-enviados'))) return { itens: [] }
    return S.paginaDe(await this.ler(`/v1/rovers/${uidOuErro(uid)}/depoimentos${consulta({ estado: 'enviados', antes: antesDe(cursor) })}`, 'propria'), S.depoimentoEnviado)
  }
  /** O que a moderação escondeu do próprio rover. Sem o recurso (relé 0.3) devolve lista vazia, sem chamar a rota que não existe. */
  async removidos(uid: string, cursor?: string) {
    if (!(await this.suporta('removidos'))) return { itens: [] }
    return S.paginaDe(await this.ler(`/v1/rovers/${uidOuErro(uid)}/removidos${consulta({ antes: antesDe(cursor) })}`, 'propria'), S.removido)
  }
  async entregas(uid: string, cursor?: string) {
    const caminho = `/v1/rovers/${uidOuErro(uid)}/entregas${consulta({ antes: antesDe(cursor) })}`
    const bruto = await this.ler(caminho, 'publica')
    const quem = await this.resumoDe(uid)
    return S.paginaDe(bruto, (e) => S.entrega(e, quem))
  }
  async amigos(uid: string, cursor?: string) {
    return S.paginaDe(await this.ler(`/v1/rovers/${uidOuErro(uid)}/amigos${consulta({ antes: antesDe(cursor) })}`, 'opcional'), S.amigoItem)
  }
  async amigosEmComum(uid: string, com: string, cursor?: string) {
    const caminho = `/v1/rovers/${uidOuErro(uid)}/amigos-em-comum${consulta({ com: uidOuErro(com), antes: antesDe(cursor) })}`
    return S.paginaDe(await this.ler(caminho, 'opcional'), S.roverResumo)
  }
  async comunidadesDoRover(uid: string, cursor?: string) {
    const item = (x: unknown) => {
      const o = S.obj(x)
      return { comunidade: S.comunidadeCartao(o.comunidade), papel: (['dono', 'moderador', 'membro'] as const).find((p) => p === o.papel) ?? (() => { throw new ErroRede('indisponivel', 'resposta do relé fora do contrato') })() }
    }
    return S.paginaDe(await this.ler(`/v1/rovers/${uidOuErro(uid)}/comunidades${consulta({ antes: antesDe(cursor) })}`, 'opcional'), item)
  }
  async paginasDoRover(uid: string, cursor?: string) {
    const item = (x: unknown) => {
      const o = S.obj(x)
      const relacao = (['dono', 'administrador', 'seguidor'] as const).find((p) => p === o.relacao)
      if (!relacao) throw new ErroRede('indisponivel', 'resposta do relé fora do contrato')
      return { pagina: S.paginaCartao(o.pagina), relacao }
    }
    return S.paginaDe(await this.ler(`/v1/rovers/${uidOuErro(uid)}/paginas${consulta({ antes: antesDe(cursor) })}`, 'opcional'), item)
  }
  async amizadesPendentes(uid: string) {
    return S.pedidosDeAmizade(await this.ler(`/v1/rovers/${uidOuErro(uid)}/amizades/pendentes`, 'propria'))
  }
  async convites(uid: string) {
    return S.itensDe(await this.ler(`/v1/rovers/${uidOuErro(uid)}/convites`, 'propria'), S.conviteRecebido, 50)
  }
  async relacoes(uid: string, cursor?: string) {
    return S.paginaDe(await this.ler(`/v1/rovers/${uidOuErro(uid)}/relacoes${consulta({ antes: antesDe(cursor) })}`, 'propria'), S.relacaoItem)
  }
  async notificacoes(uid: string, cursor?: string) {
    // 0.4.0: `conversa-pedido` e `conversa-aceita` (docs/API-REDE-SOCIAL.md 17.4) são tipos conhecidos e a tela os desenha; tipo
    // desconhecido continua fora do contrato (a lista inteira cai)
    return S.paginaDe(await this.ler(`/v1/rovers/${uidOuErro(uid)}/notificacoes${consulta({ antes: antesDe(cursor) })}`, 'propria'), S.notificacao)
  }
  async contagemDeNotificacoes(uid: string, desde?: number) {
    const d = desde !== undefined && Number.isSafeInteger(desde) && desde >= 0 ? String(desde) : undefined
    return S.inteiro(S.obj(await this.ler(`/v1/rovers/${uidOuErro(uid)}/notificacoes/contagem${consulta({ desde: d })}`, 'propria')).novas)
  }

  // ---- comunidades (7.2)
  async comunidades(opcoes: { tema?: string; acesso?: Exclude<Acesso, 'fechada'>; ordem?: OrdemListada; cursor?: string } = {}) {
    const { tema, acesso, ordem } = opcoes
    if (tema !== undefined && !TAG.test(tema)) throw INVALIDO()
    if (acesso !== undefined && acesso !== 'aberta' && acesso !== 'moderada') throw INVALIDO()
    if (ordem !== undefined && !ORDENS_LISTADA.includes(ordem)) throw INVALIDO()
    return S.paginaDe(await this.ler(`/v1/comunidades${consulta({ tema, acesso, ordem, antes: antesDe(opcoes.cursor) })}`, 'publica'), S.comunidadeCartao)
  }
  async comunidade(id: string) {
    return S.comunidade(await this.ler(`/v1/comunidades/${idOuErro(id)}`, 'opcional'))
  }
  async membros(id: string, cursor?: string) {
    return S.paginaDe(await this.ler(`/v1/comunidades/${idOuErro(id)}/membros${consulta({ antes: antesDe(cursor) })}`, 'opcional'), S.membroItem)
  }
  async pedidosDeEntrada(id: string) {
    return S.paginaDe(await this.ler(`/v1/comunidades/${idOuErro(id)}/pedidos`, 'propria'), S.pedidoDeEntrada)
  }
  async convitesDaComunidade(id: string) {
    return S.paginaDe(await this.ler(`/v1/comunidades/${idOuErro(id)}/convites`, 'propria'), S.conviteEnviado)
  }
  async banidos(id: string) {
    return S.paginaDe(await this.ler(`/v1/comunidades/${idOuErro(id)}/banidos`, 'propria'), S.banidoItem)
  }
  /**
   * Os pedidos novos da 0.3.2 (`ordem` por pessoas, `janela`, `status`, `etiqueta`) só saem se o relé os declara: com um relé 0.3 ou 0.3.1 a
   * chamada é exatamente a de antes (e a ordem por pessoas cai em `recentes`, o filtro de vocabulário cai em "sem filtro").
   */
  async topicos(id: string, opcoes: { categoria?: string; tag?: string; ordem?: OrdemTopicos; cursor?: string; janela?: Janela; status?: string; etiqueta?: string } = {}) {
    const { categoria, tag, ordem, janela, status, etiqueta } = opcoes
    if (tag !== undefined && !TAG.test(tag)) throw INVALIDO()
    if (ordem !== undefined && !ORDENS_TOPICOS.includes(ordem)) throw INVALIDO()
    if (categoria !== undefined && Array.from(categoria).length > 30) throw INVALIDO()
    if (janela !== undefined && !JANELAS.includes(janela)) throw INVALIDO()
    if (status !== undefined && !CHAVE_DE_VOCABULARIO.test(status)) throw INVALIDO()
    if (etiqueta !== undefined && !CHAVE_DE_VOCABULARIO.test(etiqueta)) throw INVALIDO()
    const porPessoas = ordem === 'melhores' || ordem === 'em-alta'
    const usaPessoas = porPessoas && (await this.suporta('ordem-por-pessoas'))
    const usaVocabulario = (status !== undefined || etiqueta !== undefined) && (await this.suporta('vocabulario'))
    // a ordem dos parâmetros é a de sempre (categoria, tag, ordem, antes): sem as opções novas o pedido sai idêntico ao da 0.3
    const caminho = consulta({
      categoria, tag,
      ordem: porPessoas ? (usaPessoas ? ordem : undefined) : ordem,
      antes: antesDe(opcoes.cursor),
      janela: usaPessoas && ordem === 'em-alta' ? janela : undefined,
      status: usaVocabulario ? status : undefined,
      etiqueta: usaVocabulario ? etiqueta : undefined,
    })
    return S.listaDeTopicos(await this.ler(`/v1/comunidades/${idOuErro(id)}/topicos${caminho}`, 'opcional'))
  }
  async filaDeModeracao(id: string) {
    return S.filaDeModeracao(await this.ler(`/v1/comunidades/${idOuErro(id)}/moderacao/fila`, 'propria'))
  }
  async registroDaComunidade(id: string, cursor?: string) {
    return S.paginaDe(await this.ler(`/v1/comunidades/${idOuErro(id)}/moderacao/registro${consulta({ antes: antesDe(cursor) })}`, 'opcional'), S.registro)
  }

  // ---- fórum (7.3)
  async topico(id: string) {
    return S.topico(await this.ler(`/v1/topicos/${idOuErro(id)}`, 'opcional'))
  }
  async respostas(topico: string, opcoes: { em?: string; cursor?: string; ordem?: OrdemRespostas; janela?: Janela } = {}) {
    const em = opcoes.em === undefined ? undefined : idOuErro(opcoes.em)
    const { ordem, janela } = opcoes
    if (ordem !== undefined && !ORDENS_RESPOSTAS.includes(ordem)) throw INVALIDO()
    if (janela !== undefined && !JANELAS.includes(janela)) throw INVALIDO()
    // `antigas` é a ordem que o relé sempre teve: não vai no pedido. As outras três são da 0.3.2.
    const nova = ordem !== undefined && ordem !== 'antigas' && (await this.suporta('ordem-por-pessoas'))
    const caminho = consulta({ em, antes: antesDe(opcoes.cursor), ordem: nova ? ordem : undefined, janela: nova && ordem === 'em-alta' ? janela : undefined })
    return S.paginaDe(await this.ler(`/v1/topicos/${idOuErro(topico)}/respostas${caminho}`, 'opcional'), S.respostaForum, 50)
  }
  async topicoDeObjeto(id: string): Promise<string> {
    const env = S.obj(await this.ler(`/v1/objetos/${idOuErro(id)}`, 'opcional'))
    const o = S.obj(env.objeto ?? env)
    const corpo = S.obj(o.corpo)
    if (o.tipo === 'topico' && typeof (env.id ?? o.id) === 'string' && ehIdObjeto((env.id ?? o.id) as string)) return (env.id ?? o.id) as string
    if (o.tipo === 'resposta-forum' && typeof corpo.topico === 'string' && ehIdObjeto(corpo.topico)) return corpo.topico
    throw new ErroRede('nao-encontrado', 'não é um objeto do fórum')
  }
  async historico(topico: string) {
    return S.itensDe(await this.ler(`/v1/topicos/${idOuErro(topico)}/historico`, 'opcional'), S.versaoDoTopico, 10)
  }

  // ---- páginas (7.4)
  async paginas(opcoes: { tema?: string; ordem?: OrdemListada; cursor?: string } = {}) {
    if (opcoes.tema !== undefined && !TAG.test(opcoes.tema)) throw INVALIDO()
    if (opcoes.ordem !== undefined && !ORDENS_LISTADA.includes(opcoes.ordem)) throw INVALIDO()
    return S.paginaDe(await this.ler(`/v1/paginas${consulta({ tema: opcoes.tema, ordem: opcoes.ordem, antes: antesDe(opcoes.cursor) })}`, 'publica'), S.paginaCartao)
  }
  /** Os temas de páginas abertas. Sem o recurso (relé 0.3) vem vazio e a tela tira os temas da lista de páginas, como antes. */
  async temasDePaginas() {
    if (!(await this.suporta('temas-de-paginas'))) return []
    return S.itensDe(await this.ler('/v1/paginas/temas', 'publica'), S.temaDePagina, 50)
  }
  async pagina(id: string) {
    return S.paginaProjeto(await this.ler(`/v1/paginas/${idOuErro(id)}`, 'opcional'))
  }
  async atualizacoes(id: string, cursor?: string): Promise<Pagina<Atualizacao>> {
    const bruto = await this.ler(`/v1/paginas/${idOuErro(id)}/atualizacoes${consulta({ antes: antesDe(cursor) })}`, 'publica')
    const cache = new Map<string, ResumoRover>()
    const envs = S.paginaDe(bruto, (e) => ({ bruto: e, env: S.envelope(e) }))
    for (const { env } of envs.itens) await this.resumoDe(env.autor, cache)
    return { ...envs, itens: envs.itens.map(({ bruto: e, env }) => S.atualizacao(e, cache.get(env.autor)!)) }
  }
  async seguidoresDaPagina(id: string, cursor?: string) {
    return S.paginaDe(await this.ler(`/v1/paginas/${idOuErro(id)}/seguidores${consulta({ antes: antesDe(cursor) })}`, 'publica'), S.roverResumo)
  }
  /**
   * GET /v1/linha/inicio?rover=&tipos=postagem,pagina-publicar. A linha mista é do rover da pessoa e (com o grafo
   * fechado) só ele a lê: precisa de `leitor` e de credencial. Sem `leitor`, cai na linha pública só de postagens.
   */
  async linhaMista(cursor?: string): Promise<Pagina<ItemDaLinha>> {
    const mista = this.leitor !== undefined
    const caminho = `/v1/linha/inicio${consulta({ rover: this.leitor, tipos: mista ? 'postagem,pagina-publicar' : undefined, cursor: mista ? undefined : cursor, antes: mista ? antesDe(cursor) : undefined })}`
    const bruto = await this.ler(caminho, mista ? 'propria' : 'publica')
    const cache = new Map<string, ResumoRover>()
    const pre = S.paginaDe(bruto, (x) => x)
    const itens: ItemDaLinha[] = []
    for (const x of pre.itens) {
      const o = S.obj(x)
      const env = o.objeto !== undefined || o.envelope !== undefined ? S.envelope(o.envelope ?? o) : null
      if (env?.tipo === 'pagina-publicar') itens.push({ tipo: 'atualizacao', atualizacao: S.atualizacao(o.envelope ?? o, await this.resumoDe(env.autor, cache)) })
      else itens.push({ tipo: 'postagem', postagem: this.postagem(x) })
    }
    return { itens, proximo: pre.proximo }
  }
  protected abstract postagem(x: unknown): import('../../tipos').Postagem

  // ---- busca e descoberta (7.5)
  async buscarTudo(q: string) {
    const t = termoDeBuscaSocial(q)
    if (!t) return { rovers: [], comunidades: [], topicos: [], paginas: [] }
    return S.resultadoBusca(await this.ler(`/v1/busca${consulta({ q: t, tipo: 'todos' })}`, 'opcional'))
  }
  buscarTipo(q: string, tipo: 'rovers', cursor?: string): Promise<Pagina<import('../tipos').RoverBuscado>>
  buscarTipo(q: string, tipo: 'comunidades', cursor?: string): Promise<Pagina<import('../tipos').ComunidadeCartao>>
  buscarTipo(q: string, tipo: 'topicos', cursor?: string, opcoes?: { ordem?: OrdemBusca; janela?: Janela }): Promise<Pagina<import('../tipos').TopicoCartao>>
  buscarTipo(q: string, tipo: 'paginas', cursor?: string): Promise<Pagina<import('../tipos').PaginaCartao>>
  buscarTipo(q: string, tipo: TipoDeBusca, cursor?: string): Promise<Pagina<unknown>>
  async buscarTipo(q: string, tipo: TipoDeBusca, cursor?: string, opcoes: { ordem?: OrdemBusca; janela?: Janela } = {}): Promise<Pagina<unknown>> {
    const mapa: Record<TipoDeBusca, (x: unknown) => unknown> = {
      rovers: (x) => ({ ...S.roverResumo(x), descricao: S.txt(S.obj(x).descricao ?? '', 280) }), comunidades: S.comunidadeCartao, topicos: S.topicoCartao, paginas: S.paginaCartao,
    }
    if (!(tipo in mapa)) throw INVALIDO()
    const t = termoDeBuscaSocial(q)
    if (!t) return { itens: [] }
    const { ordem, janela } = opcoes
    if (ordem !== undefined && (tipo !== 'topicos' || !ORDENS_BUSCA.includes(ordem))) throw INVALIDO()
    if (janela !== undefined && !JANELAS.includes(janela)) throw INVALIDO()
    // `relevancia` é o padrão do relé e vai sem `ordem`; `ordem` em outro tipo de busca seria erro no relé 0.3.2, então nem sai daqui
    const nova = ordem !== undefined && ordem !== 'relevancia' && (await this.suporta('ordem-por-pessoas'))
    return S.paginaDe(await this.ler(`/v1/busca${consulta({ q: t, tipo, antes: antesDe(cursor), ordem: nova ? ordem : undefined, janela: nova && ordem === 'em-alta' ? janela : undefined })}`, 'opcional'), mapa[tipo])
  }
  emAlta(tipo: 'topicos', janela?: Janela): Promise<import('../tipos').TopicoCartao[]>
  emAlta(tipo: 'comunidades', janela?: Janela): Promise<import('../tipos').ComunidadeCartao[]>
  emAlta(tipo: 'paginas', janela?: Janela): Promise<import('../tipos').PaginaCartao[]>
  emAlta(tipo: TipoDeEmAlta, janela?: Janela): Promise<unknown[]>
  async emAlta(tipo: TipoDeEmAlta, janela?: Janela): Promise<unknown[]> {
    const mapa: Record<TipoDeEmAlta, (x: unknown) => unknown> = { topicos: S.topicoCartao, comunidades: S.comunidadeCartao, paginas: S.paginaCartao }
    if (!(tipo in mapa) || (janela !== undefined && janela !== '24h' && janela !== '7d')) throw INVALIDO()
    return S.itensDe(await this.ler(`/v1/descobrir/em-alta${consulta({ tipo, janela })}`, 'publica'), mapa[tipo], 20)
  }
  async recemChegadosSociais(limite?: number) {
    const l = limite !== undefined && Number.isInteger(limite) && limite >= 1 && limite <= 50 ? String(limite) : undefined
    return S.itensDe(await this.ler(`/v1/descobrir/recem-chegados${consulta({ limite: l })}`, 'publica'), S.recemChegado, 50)
  }
  sugestoes(tipo: 'comunidades', interesses?: string[]): Promise<import('../tipos').ComunidadeCartao[]>
  sugestoes(tipo: 'paginas', interesses?: string[]): Promise<import('../tipos').PaginaCartao[]>
  sugestoes(tipo: 'rovers', interesses?: string[]): Promise<import('../tipos').RoverBuscado[]>
  sugestoes(tipo: TipoDeSugestao, interesses?: string[]): Promise<unknown[]>
  async sugestoes(tipo: TipoDeSugestao, interesses: string[] = []): Promise<unknown[]> {
    const mapa: Record<TipoDeSugestao, (x: unknown) => unknown> = {
      comunidades: S.comunidadeCartao, paginas: S.paginaCartao, rovers: (x) => ({ ...S.roverResumo(x), descricao: S.txt(S.obj(x).descricao ?? '', 280) }),
    }
    if (!(tipo in mapa)) throw INVALIDO()
    const tags = interesses.filter((t) => TAG.test(t)).slice(0, 8)
    // Só do DECLARADO: o relé não sabe o que a pessoa leu. Com o rover indicado (e a credencial dele) o relé
    // deixa de sugerir o que a pessoa já participa; sem credencial a lista não é filtrada.
    const caminho = `/v1/descobrir/sugestoes${consulta({ tipo, interesses: tags.length ? tags.join(',') : undefined, rover: tags.length ? undefined : this.leitor })}`
    return S.itensDe(await this.ler(caminho, 'opcional'), mapa[tipo], 20)
  }
  async tendencias(janela?: Janela) {
    if (janela !== undefined && janela !== '24h' && janela !== '7d') throw INVALIDO()
    return S.itensDe(await this.ler(`/v1/descobrir/tendencias${consulta({ janela })}`, 'publica'), S.tendencia, 20)
  }
  async registroDoRele(cursor?: string) {
    return S.paginaDe(await this.ler(`/v1/moderacao/registro${consulta({ antes: antesDe(cursor) })}`, 'publica'), S.registro)
  }

  // ---- 0.3.2 ----
  /** Os anúncios do operador. Sem o recurso (relé 0.3 e 0.3.1) devolve lista vazia, sem chamar a rota que não existe. Rota pública: sem credencial. */
  async anuncios(cursor?: string) {
    if (!(await this.suporta('anuncios'))) return { itens: [] }
    return S.paginaDe(await this.ler(`/v1/anuncios${consulta({ antes: antesDe(cursor) })}`, 'publica'), S.anuncio, 20)
  }
  /**
   * O painel de início do rover da pessoa. `desde` é um instante em segundos (o `agora` da resposta anterior). Sem o recurso, ou sem a
   * credencial do rover (a leitura própria nem sai do computador), devolve `null`: a tela cai no que já fazia.
   */
  async inicio(desde?: number) {
    if (!(await this.suporta('inicio'))) return null
    const d = desde !== undefined && Number.isSafeInteger(desde) && desde >= 0 && desde <= 4_102_444_800 ? String(desde) : undefined
    try {
      return S.inicio(await this.ler(`/v1/inicio${consulta({ desde: d })}`, 'propria'))
    } catch (e) {
      if (e instanceof ErroRede && e.codigo === 'proibido') return null
      throw e
    }
  }

  // ---- 0.4.0: mensagens privadas ----
  // O site não tem a chave de cifra do rover (ela mora no app da pessoa) e não tem a credencial de leitura dele: não lê conversa
  // nenhuma do relé, com o recurso ligado ou não. As telas mostram por quê. Nenhuma rota de conversa é chamada daqui.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- a assinatura é a do contrato; nada daqui chega ao relé
  async conversas(_uid: string, _opcoes?: { estado?: import('../mensagens').FiltroDeConversas; cursor?: string }): Promise<Pagina<import('../mensagens').Conversa>> {
    throw new ErroRede('versao-nao-suportada', 'as conversas só se leem pelo app da pessoa')
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- a assinatura é a do contrato; nada daqui chega ao relé
  async conversa(_uid: string, _id: string): Promise<import('../mensagens').Conversa> {
    throw new ErroRede('versao-nao-suportada', 'as conversas só se leem pelo app da pessoa')
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- a assinatura é a do contrato; nada daqui chega ao relé
  async mensagensDaConversa(_uid: string, _id: string, _cursor?: string): Promise<Pagina<import('../mensagens').MensagemClara>> {
    throw new ErroRede('versao-nao-suportada', 'as conversas só se leem pelo app da pessoa')
  }
}
