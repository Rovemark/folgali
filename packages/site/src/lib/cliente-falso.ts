// ClienteFalso: a rede inteira em memória, com os dados de demonstração. Serve para mostrar o site
// ao Arquiteto, para os testes e para qualquer pessoa rodar o projeto sem relé. Tem as mesmas
// regras do cliente de verdade: não publica sem selo de aprovação válido, limpa texto invisível,
// recusa texto fora do limite e guarda denúncia sem saber quem denunciou.

import { bytesDeDemonstracao } from './social/falso/imagens'
import type { ClienteRede, PonteDoApp } from './cliente-rede'
import type { ClienteSocial } from './social/cliente-social'
import { RedeSocialFalsa } from './social/falso'
import { autorizacaoDaDemo, publicadosDaDemo } from './painel/falso'
import type { AcaoPublicada, AutorizacaoPermanente } from './painel/tipos'
import { ROVER_DA_DEMO, oid, resumoDe, semente, uidDe, type DadosDeDemonstracao } from './demo-dados'
import { FOLGA_AJUSTE, FOLGA_PADRAO, PECAS_DO_AVATAR } from './entrar/limites'
import { AGENTES_DE_FORA } from './folgali/demo'
import { rankear } from './dominio/alta'
import {
  aprovar as aprovarRascunho,
  editar as editarRascunho,
  ehTexto,
  recusar as recusarRascunho,
  selarToque,
  verificarSelo,
  type ObjetoDeRede,
  type Rascunho,
  type ResultadoAprovacao,
} from './dominio/aprovacao'
import { LivroDeDenuncias, validarDenuncia } from './dominio/denuncia'
import { termoDeBusca } from './dominio/handle'
import { validarTexto } from './dominio/limites'
import {
  ErroRede,
  REACOES,
  type AgenteDeFora,
  type InfoDosAgentes,
  type DetalhePostagem,
  type Descoberta,
  type EntradaDenuncia,
  type Pagina,
  type PerfilRover,
  type Postagem,
  type ResultadoBusca,
  type ResumoRover,
  type TipoPostagem,
  type TipoReacao,
} from './tipos'

export const TAMANHO_PAGINA = 8

const DELEGADOS = [
  'info', 'suporta', 'depoimentosEnviados', 'removidos', 'temasDePaginas', 'paginaDoRover', 'recados', 'depoimentos', 'entregas', 'amigos', 'amigosEmComum', 'comunidadesDoRover', 'paginasDoRover', 'amizadesPendentes', 'convites', 'relacoes',
  'notificacoes', 'contagemDeNotificacoes', 'comunidades', 'comunidade', 'membros', 'pedidosDeEntrada', 'convitesDaComunidade', 'banidos', 'topicos', 'filaDeModeracao',
  'registroDaComunidade', 'topico', 'topicoDeObjeto', 'respostas', 'historico', 'paginas', 'pagina', 'atualizacoes', 'seguidoresDaPagina', 'linhaMista', 'buscarTudo', 'buscarTipo', 'emAlta',
  'recemChegadosSociais', 'sugestoes', 'tendencias', 'registroDoRele', 'anuncios', 'inicio', 'agir', 'propor', 'rascunhosSociais', 'rascunhoSocial', 'editarSocial', 'recusarSocial', 'aprovarSocial',
  // 0.4.0: mensagens privadas
  'conversas', 'conversa', 'mensagensDaConversa',
] as const
/** Handle que simula um relé fora do ar, para a tela de erro. Só existe no cliente falso. */
export const HANDLE_FORA_DO_AR = 'fora_do_ar'

const clonar = <T>(x: T): T => structuredClone(x)
const recente = (a: Postagem, b: Postagem) => (a.criadaEm < b.criadaEm ? 1 : a.criadaEm > b.criadaEm ? -1 : a.id.localeCompare(b.id))

function lerCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0
  let n = NaN
  try {
    n = Number.parseInt(atob(cursor), 10)
  } catch {
    n = NaN
  }
  if (!Number.isInteger(n) || n < 0) throw new ErroRede('invalido', 'cursor inválido')
  return n
}
const criarCursor = (n: number) => btoa(String(n))

function paginar<T>(itens: T[], cursor?: string): Pagina<T> {
  const ini = lerCursor(cursor)
  const fatia = itens.slice(ini, ini + TAMANHO_PAGINA)
  return { itens: fatia, proximo: ini + TAMANHO_PAGINA < itens.length ? criarCursor(ini + TAMANHO_PAGINA) : undefined }
}

export class ClienteFalso implements ClienteRede, PonteDoApp {
  readonly modo = 'falso' as const
  private dados: DadosDeDemonstracao
  private readonly livro = new LivroDeDenuncias()
  private readonly minhasReacoes = new Map<string, TipoReacao>()
  private contador = 0
  private seguidos: Set<string>
  /** A rede social inteira (comunidades, fórum, páginas, amizade...), em src/lib/social/falso. */
  readonly social: RedeSocialFalsa

  // ClienteSocial e a parte social da ponte: o ClienteFalso só delega para `social`.
  declare info: ClienteSocial['info']
  declare suporta: ClienteSocial['suporta']
  declare depoimentosEnviados: ClienteSocial['depoimentosEnviados']
  declare removidos: ClienteSocial['removidos']
  declare temasDePaginas: ClienteSocial['temasDePaginas']
  declare paginaDoRover: ClienteSocial['paginaDoRover']
  declare recados: ClienteSocial['recados']
  declare depoimentos: ClienteSocial['depoimentos']
  declare entregas: ClienteSocial['entregas']
  declare amigos: ClienteSocial['amigos']
  declare amigosEmComum: ClienteSocial['amigosEmComum']
  declare comunidadesDoRover: ClienteSocial['comunidadesDoRover']
  declare paginasDoRover: ClienteSocial['paginasDoRover']
  declare amizadesPendentes: ClienteSocial['amizadesPendentes']
  declare convites: ClienteSocial['convites']
  declare relacoes: ClienteSocial['relacoes']
  declare notificacoes: ClienteSocial['notificacoes']
  declare contagemDeNotificacoes: ClienteSocial['contagemDeNotificacoes']
  declare comunidades: ClienteSocial['comunidades']
  declare comunidade: ClienteSocial['comunidade']
  declare membros: ClienteSocial['membros']
  declare pedidosDeEntrada: ClienteSocial['pedidosDeEntrada']
  declare convitesDaComunidade: ClienteSocial['convitesDaComunidade']
  declare banidos: ClienteSocial['banidos']
  declare topicos: ClienteSocial['topicos']
  declare filaDeModeracao: ClienteSocial['filaDeModeracao']
  declare registroDaComunidade: ClienteSocial['registroDaComunidade']
  declare topico: ClienteSocial['topico']
  declare respostas: ClienteSocial['respostas']
  declare topicoDeObjeto: ClienteSocial['topicoDeObjeto']
  declare historico: ClienteSocial['historico']
  declare paginas: ClienteSocial['paginas']
  declare pagina: ClienteSocial['pagina']
  declare atualizacoes: ClienteSocial['atualizacoes']
  declare seguidoresDaPagina: ClienteSocial['seguidoresDaPagina']
  declare linhaMista: ClienteSocial['linhaMista']
  declare buscarTudo: ClienteSocial['buscarTudo']
  declare buscarTipo: ClienteSocial['buscarTipo']
  declare emAlta: ClienteSocial['emAlta']
  declare recemChegadosSociais: ClienteSocial['recemChegadosSociais']
  declare sugestoes: ClienteSocial['sugestoes']
  declare tendencias: ClienteSocial['tendencias']
  declare registroDoRele: ClienteSocial['registroDoRele']
  declare anuncios: ClienteSocial['anuncios']
  declare inicio: ClienteSocial['inicio']
  declare conversas: ClienteSocial['conversas']
  declare conversa: ClienteSocial['conversa']
  declare mensagensDaConversa: ClienteSocial['mensagensDaConversa']
  declare agir: PonteDoApp['agir']
  declare propor: PonteDoApp['propor']
  declare rascunhosSociais: PonteDoApp['rascunhosSociais']
  declare rascunhoSocial: PonteDoApp['rascunhoSocial']
  declare editarSocial: PonteDoApp['editarSocial']
  declare recusarSocial: PonteDoApp['recusarSocial']
  declare aprovarSocial: PonteDoApp['aprovarSocial']

  /**
   * `autorizacao`: a demonstração passa a ter uma autorização permanente (só para fotografar o bloco do painel com ela). Desligada por
   * padrão, como no protocolo.
   */
  constructor(
    private readonly agora: () => Date = () => new Date(),
    private readonly opcoes: { autorizacao?: boolean } = {},
  ) {
    this.dados = semente(this.agora())
    this.seguidos = new Set(this.dados.segue.get(ROVER_DA_DEMO))
    this.minhasReacoes.set(oid('p05'), 'util')
    this.minhasReacoes.set(oid('p12'), 'curtir')
    this.social = new RedeSocialFalsa(this.agora, uidDe(ROVER_DA_DEMO), this.ganchos(), this.dados.rovers)
    const social = this.social as unknown as Record<string, (...a: unknown[]) => unknown>
    const eu = this as unknown as Record<string, unknown>
    for (const nome of DELEGADOS) eu[nome] = (...a: unknown[]) => social[nome](...a)
  }

  private ganchos() {
    return {
      perfilAntigo: (uid: string) => {
        const r = this.dados.rovers.find((x) => x.uid === uid)
        return r ? { seguindo: r.seguindo, seguidores: r.seguidores, euSigo: uid === uidDe(ROVER_DA_DEMO) ? undefined : this.seguidos.has(uid) } : undefined
      },
      postagensDaLinha: () => this.dados.postagens.filter((p) => p.tipo === 'postagem' && !p.removida).map((p) => this.comMinhaVisao(p)),
      desfazerSeguir: (a: string, b: string) => {
        if (a === uidDe(ROVER_DA_DEMO) && this.seguidos.has(b)) {
          this.seguidos.delete(b)
          const alvo = this.dados.rovers.find((r) => r.uid === b)
          const eu = this.dados.rovers.find((r) => r.uid === a)
          if (alvo) alvo.seguidores--
          if (eu) eu.seguindo--
        }
      },
      removerPostagemAntiga: (id: string, autor: string) => {
        if (!this.dados.postagens.some((p) => p.id === id)) return false
        void this.removerPeloAutor(id, autor)
        return true
      },
      denunciarAntiga: (alvo: string, motivo: string) => {
        if (!this.dados.postagens.some((p) => p.id === alvo)) return false
        const antigos = ['spam', 'assedio', 'ilegal', 'dados-pessoais', 'golpe', 'outro']
        if (!antigos.includes(motivo)) throw new ErroRede('invalido', 'motivo não vale para postagem')
        this.livro.receber({ alvo, motivo: motivo as never }, this.agora())
        return true
      },
    }
  }

  // ---- relé ----------------------------------------------------------------------------------

  private comMinhaVisao(p: Postagem): Postagem {
    const c = clonar(p)
    c.minhaReacao = this.minhasReacoes.get(p.id) ?? null
    return c
  }

  private perfil(uid: string): PerfilRover {
    const r = this.dados.rovers.find((x) => x.uid === uid)
    if (!r) {
      // os rovers que só existem na rede social também têm perfil da fase 1
      const extra = this.social?.perfilBasico(uid)
      if (!extra) throw new ErroRede('nao-encontrado', 'rover não encontrado')
      return extra
    }
    const c = clonar(r)
    if (uid !== uidDe(ROVER_DA_DEMO)) c.euSigo = this.seguidos.has(uid)
    return c
  }

  async publicar(objeto: ObjetoDeRede): Promise<{ id: string }> {
    if (!verificarSelo(objeto)) throw new ErroRede('sem-aprovacao', 'objeto sem aprovação humana válida')
    const autor = this.dados.rovers.find((r) => r.uid === objeto.autor)
    if (!autor) throw new ErroRede('nao-encontrado', 'rover autor não encontrado')

    if (ehTexto(objeto)) {
      const v = validarTexto(objeto.texto, objeto.tipo)
      if (!v.ok) throw new ErroRede('invalido', v.motivo === 'vazio' ? 'texto vazio' : 'texto acima do limite')
      if (objeto.tipo === 'resposta') {
        const pai = this.dados.postagens.find((p) => p.id === objeto.respondeA)
        if (!pai || pai.removida) throw new ErroRede('nao-encontrado', 'a postagem respondida não existe')
        pai.respostas++
      }
      const id = oid(`n${++this.contador}`)
      this.dados.postagens.push({
        id, tipo: objeto.tipo, autor: resumoDe(autor.handle), texto: v.texto, topicos: [...objeto.topicos], idioma: objeto.idioma, humor: objeto.humor,
        criadaEm: this.agora().toISOString(), respondeA: objeto.respondeA, respostas: 0, reacoes: { curtir: 0, util: 0 },
      })
      return { id }
    }
    if (objeto.tipo === 'seguir' || objeto.tipo === 'deixar-de-seguir') {
      const alvo = this.dados.rovers.find((r) => r.uid === objeto.alvo)
      if (!alvo) throw new ErroRede('nao-encontrado', 'rover não encontrado')
      if (alvo.uid === objeto.autor) throw new ErroRede('invalido', 'um rover não segue a si mesmo')
      const ja = this.seguidos.has(alvo.uid)
      if (objeto.tipo === 'seguir' && !ja) {
        this.seguidos.add(alvo.uid)
        alvo.seguidores++
        autor.seguindo++
      } else if (objeto.tipo === 'deixar-de-seguir' && ja) {
        this.seguidos.delete(alvo.uid)
        alvo.seguidores--
        autor.seguindo--
      }
      return { id: oid(`n${++this.contador}`) }
    }
    if (objeto.tipo !== 'reacao') throw new ErroRede('invalido', 'tipo de objeto desconhecido')
    const alvo = this.dados.postagens.find((p) => p.id === objeto.alvo)
    if (!alvo || alvo.removida) throw new ErroRede('nao-encontrado', 'postagem não encontrada')
    const nova = objeto.reacao as TipoReacao
    if (!(REACOES as readonly string[]).includes(nova)) throw new ErroRede('invalido', 'reação inválida')
    const antiga = this.minhasReacoes.get(alvo.id)
    if (antiga) alvo.reacoes[antiga]--
    if (antiga === nova) this.minhasReacoes.delete(alvo.id)
    else {
      alvo.reacoes[nova]++
      this.minhasReacoes.set(alvo.id, nova)
    }
    return { id: oid(`n${++this.contador}`) }
  }

  /** 0.5.0: as imagens da demonstração são geradas em código (social/falso/imagens.ts); nenhuma vem de fora. */
  async imagem(hash: string): Promise<{ bytes: Uint8Array; formato: 'png' } | null> {
    return bytesDeDemonstracao(hash)
  }

  async obterRover(ref: string): Promise<PerfilRover> {
    const handle = ref.replace(/^@/, '').toLowerCase()
    if (handle === HANDLE_FORA_DO_AR) throw new ErroRede('indisponivel', 'o relé não respondeu')
    const r = this.dados.rovers.find((x) => x.uid === ref || x.handle === handle)
    if (!r) {
      const extra = this.social.perfilBasico(ref)
      if (!extra) throw new ErroRede('nao-encontrado', 'rover não encontrado')
      return extra
    }
    return this.perfil(r.uid)
  }

  async postagensDoRover(uid: string, opcoes: { cursor?: string; tipo?: TipoPostagem } = {}): Promise<Pagina<Postagem>> {
    this.perfil(uid)
    const lista = this.dados.postagens
      .filter((p) => p.autor.uid === uid && !p.removida && (!opcoes.tipo || p.tipo === opcoes.tipo))
      .sort(recente)
      .map((p) => this.comMinhaVisao(p))
    return paginar(lista, opcoes.cursor)
  }

  async linhaInicio(cursor?: string): Promise<Pagina<Postagem>> {
    const lista = this.dados.postagens
      .filter((p) => p.tipo === 'postagem' && !p.removida)
      .sort(recente)
      .map((p) => this.comMinhaVisao(p))
    return paginar(lista, cursor)
  }

  async obterObjeto(id: string): Promise<DetalhePostagem> {
    const p = this.dados.postagens.find((x) => x.id === id)
    if (!p) throw new ErroRede('nao-encontrado', 'postagem não encontrada')
    const pai = p.respondeA ? this.dados.postagens.find((x) => x.id === p.respondeA) : undefined
    const respostas = this.dados.postagens
      .filter((x) => x.respondeA === id && !x.removida)
      .sort((a, b) => (a.criadaEm < b.criadaEm ? -1 : 1))
      .map((x) => this.comMinhaVisao(x))
    return { postagem: this.comMinhaVisao(p), pai: pai ? this.comMinhaVisao(pai) : undefined, respostas }
  }

  async denunciar(entrada: EntradaDenuncia): Promise<void> {
    const v = validarDenuncia(entrada)
    if (!v.ok) throw new ErroRede('invalido', `denúncia inválida: ${v.erro}`)
    if (!this.dados.postagens.some((p) => p.id === v.denuncia.alvo)) {
      if (!this.social.conhece(v.denuncia.alvo)) throw new ErroRede('nao-encontrado', 'alvo não encontrado')
      // objeto da rede social: a denúncia anônima do 0.3 (descartada em silêncio se quem denuncia não podia ver)
      this.social.executar(uidDe(ROVER_DA_DEMO), { tipo: 'denuncia', alvo: v.denuncia.alvo, motivo: v.denuncia.motivo })
      return
    }
    const r = this.livro.receber(v.denuncia, this.agora())
    if (r === 'limite') throw new ErroRede('limite', 'muitas denúncias em pouco tempo')
  }

  async removerPeloAutor(id: string, autor: string): Promise<void> {
    const p = this.dados.postagens.find((x) => x.id === id)
    if (!p) {
      // não é uma postagem da fase 1: pode ser recado, depoimento, tópico, resposta de fórum, atualização...
      this.social.executar(autor, { tipo: 'remocao-pelo-autor', alvo: id })
      return
    }
    if (p.autor.uid !== autor) throw new ErroRede('proibido', 'só o dono do rover apaga o que ele postou')
    p.removida = true
    p.texto = ''
    if (p.respondeA) {
      const pai = this.dados.postagens.find((x) => x.id === p.respondeA)
      if (pai && pai.respostas > 0) pai.respostas--
    }
  }

  async buscar(termo: string): Promise<ResultadoBusca> {
    const t = termoDeBusca(termo)
    if (!t) return { rovers: [] }
    const norm = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
    const pontuados = this.dados.rovers
      .map((r) => {
        let pontos = 0
        if (r.handle === t) pontos = 5
        else if (r.handle.startsWith(t)) pontos = 4
        else if (norm(r.nome).startsWith(t)) pontos = 3
        else if (r.handle.includes(t) || norm(r.nome).includes(t)) pontos = 2
        else if (r.sabeFazer.some((s) => norm(s).includes(t))) pontos = 1
        return { r, pontos }
      })
      .filter((x) => x.pontos > 0)
      .sort((a, b) => b.pontos - a.pontos || a.r.handle.localeCompare(b.r.handle))
    return { rovers: pontuados.map((x) => this.perfil(x.r.uid)) }
  }

  async descobrir(): Promise<Descoberta> {
    const agora = this.agora()
    const ranking = rankear(this.dados.postagens, agora).slice(0, 5)
    const emAlta = ranking.map((x) => this.perfil(x.uid))
    const recemChegados = [...this.dados.rovers]
      .sort((a, b) => ((a.desde ?? '') < (b.desde ?? '') ? 1 : -1))
      .slice(0, 4)
      .map((r) => this.perfil(r.uid))
    return { emAlta, recemChegados }
  }

  // ---- 0.6.0: o emissor aberto de agentes de fora --------------------------------------------------

  /** Os agentes de fora da demonstração (src/lib/folgali/demo.ts), como o emissor aberto os devolve. Nunca o dono. */
  async agenteDeFora(uid: string): Promise<AgenteDeFora | null> {
    const a = Object.values(AGENTES_DE_FORA).find((x) => x.uid === uid)
    if (!a) return null
    return { uid: a.uid, handle: a.handle, nome: a.nome, plataforma: a.origem ?? null, folga: a.folga, donoVerificado: true, desde: new Date(this.agora().getTime() - a.dias * 86_400_000).toISOString() }
  }

  /** O que o emissor aberto diz em `GET /v1/agentes/info`, pela cópia conferida com o protocolo (src/lib/entrar/limites.ts). */
  async infoDosAgentes(): Promise<InfoDosAgentes> {
    return {
      padrao: { ...FOLGA_PADRAO },
      ajuste: { postagensPorDia: { ...FOLGA_AJUSTE.postagensPorDia }, comentariosPorDia: { ...FOLGA_AJUSTE.comentariosPorDia } },
      pecas: { corpo: [...PECAS_DO_AVATAR.corpo], cor: [...PECAS_DO_AVATAR.cor], veste: [...PECAS_DO_AVATAR.veste], acessorio: [...PECAS_DO_AVATAR.acessorio] },
    }
  }

  // ---- ponte do app ---------------------------------------------------------------------------

  async quemSou(): Promise<ResumoRover | null> {
    return resumoDe(ROVER_DA_DEMO)
  }

  async rascunhos(): Promise<Rascunho[]> {
    return clonar(this.dados.rascunhos.filter((r) => r.estado === 'pendente'))
  }

  async rascunho(id: string): Promise<Rascunho | null> {
    const r = this.dados.rascunhos.find((x) => x.id === id)
    return r ? clonar(r) : null
  }

  private achar(id: string): { r: Rascunho; i: number } {
    const i = this.dados.rascunhos.findIndex((x) => x.id === id)
    if (i < 0) throw new ErroRede('nao-encontrado', 'rascunho não encontrado')
    return { r: this.dados.rascunhos[i], i }
  }

  async editar(id: string, texto: string): Promise<Rascunho> {
    const { r, i } = this.achar(id)
    this.dados.rascunhos[i] = editarRascunho(r, texto)
    return clonar(this.dados.rascunhos[i])
  }

  async recusar(id: string): Promise<Rascunho> {
    const { r, i } = this.achar(id)
    this.dados.rascunhos[i] = recusarRascunho(r, this.agora())
    return clonar(this.dados.rascunhos[i])
  }

  async aprovar(id: string, versaoVista: number): Promise<ResultadoAprovacao & { postagemId?: string }> {
    const { r, i } = this.achar(id)
    const res = aprovarRascunho(r, versaoVista, this.agora())
    if (!res.ok) return res
    const { id: postagemId } = await this.publicar(res.objeto)
    this.dados.rascunhos[i] = res.rascunho
    return { ...res, postagemId }
  }

  private avisoVisto = 0
  async avisosVistos(): Promise<number> {
    return this.avisoVisto
  }
  async marcarAvisosVistos(seq: number): Promise<void> {
    this.avisoVisto = Math.max(this.avisoVisto, seq)
  }

  // ---- painel "Meu rover" (o que o app sabe e o relé não responde) ------------------------------------

  async autorizacaoPermanente(): Promise<AutorizacaoPermanente | null> {
    return this.opcoes.autorizacao ? autorizacaoDaDemo(this.agora()) : null
  }

  async publicados(): Promise<AcaoPublicada[]> {
    return publicadosDaDemo(resumoDe(ROVER_DA_DEMO), this.dados.postagens, this.social, await this.autorizacaoPermanente())
  }

  async seguir(uid: string, seguir: boolean): Promise<void> {
    await this.publicar(selarToque({ tipo: seguir ? 'seguir' : 'deixar-de-seguir', autor: uidDe(ROVER_DA_DEMO), alvo: uid }, this.agora()))
  }

  async reagir(id: string, reacao: TipoReacao): Promise<void> {
    if (this.social.reagirSocial(uidDe(ROVER_DA_DEMO), id, reacao)) return
    await this.publicar(selarToque({ tipo: 'reacao', autor: uidDe(ROVER_DA_DEMO), alvo: id, reacao }, this.agora()))
  }
}
