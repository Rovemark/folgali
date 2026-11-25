/* eslint-disable @typescript-eslint/no-explicit-any */
// A LEITURA do cliente falso social: uma função por rota de docs/API-REDE-SOCIAL.md, com as mesmas
// regras de visibilidade do relé (fechada não existe para quem está fora, grafo fechado, pendente só
// para o dono e o autor, nada de conteúdo escondido). A leitora é sempre a Lumi (`this.eu`).

import { visivelPara } from '../../dominio/depoimento'
import { ordenarFila, quemDecideApelacao } from '../../dominio/moderacao'
import { podeNaComunidade } from '../../dominio/permissoes'
import { STATUS_PADRAO } from '../../dominio/vocabulario'
import { extrairTags } from '../../dominio/texto-social'
import { ErroRede, type Pagina, type ResumoRover } from '../../tipos'
import type { ClienteSocial, RecursoDoRele } from '../cliente-social'
import type {
  AmigoItem, Atualizacao, BanidoItem, Comunidade, ComunidadeCartao, ComunidadeMinima, ConviteEnviado, ConviteRecebido, Depoimento, Entrega, FilaDeModeracao, InfoDoRele,
  ItemDaLinha, Janela, ListaDeTopicos, MembroItem, Notificacao, PaginaCartao, PaginaDoRover, PaginaProjeto, PedidoDeEntrada, PedidosDeAmizade, PerfilRoverSocial,
  RecemChegado, Recado, RegistroModeracao, RelacaoItem, RespostaForum, ResultadoBuscaSocial, RoverBuscado, Tendencia, TipoDeBusca, Topico, TopicoCartao, VersaoDoTopico,
  Anuncio, InicioDoRele, OrdemBusca, OrdemListada, OrdemRespostas, OrdemTopicos, Vocabulario, VoceNaComunidade, DepoimentoEnviado, Removido, TemaDePagina, TipoSelo, MotivoModeracao,
} from '../tipos'
import { Base, iso, paginar, semAcento } from './base'
import { DIA, HORA, type AtualizacaoS, type ComunidadeS, type PaginaS, type RespostaS, type RoverS, type TopicoS } from './interno'

/** Os 13 recursos da revisão 0.3.1 (15.1) e os 4 da 0.3.2 (16.1) de docs/API-REDE-SOCIAL.md: o cliente de demonstração faz de conta que o relé tem todos. */
export const RECURSOS_DA_DEMONSTRACAO: readonly RecursoDoRele[] = [
  'voce-datas', 'avisos-com-nomes', 'depoimentos-enviados', 'removidos', 'fila-com-topico', 'denuncia-dispensar', 'reacoes-do-topico',
  'topicos-sem-categoria', 'respostas-recentes', 'lista-completa', 'temas-de-paginas', 'pessoas-em-alta', 'postagem-detalhe',
  'inicio', 'ordem-por-pessoas', 'vocabulario', 'anuncios',
  // 0.4.0: a demonstração faz de conta que o operador ligou as mensagens privadas
  'mensagens',
]
const janelaMs = (j?: Janela) => (j === '7d' ? 7 * DIA : DIA)
const contarReacoes = (m: Map<string, 'curtir' | 'util'>) => {
  const r = { curtir: 0, util: 0 }
  for (const v of m.values()) r[v]++
  return r
}
const trecho = (t: string, n = 140) => (Array.from(t).length > n ? `${Array.from(t).slice(0, n - 1).join('')}…` : t)

export class Leitura extends Base implements ClienteSocial {
  // ---- construtores de visão --------------------------------------------------------------------------

  protected perfilSocial(r: RoverS): PerfilRoverSocial {
    const antigo = this.ganchos.perfilAntigo(r.uid)
    const p: PerfilRoverSocial = {
      uid: r.uid, handle: r.handle, nome: r.nome, rosto: r.rosto,
      apresentacao: r.apresentacao, sabeFazer: [...r.habilidades],
      seguindo: antigo?.seguindo ?? r.seguindoBase, seguidores: antigo?.seguidores ?? r.seguidoresBase,
      desde: iso(r.desde), idioma: r.idioma, sintetico: true,
      sobre: r.sobre, interesses: [...r.interesses], recados: r.recados, listado: r.listado, estado: r.estado ? { ...r.estado } : null,
    }
    if (antigo?.euSigo !== undefined && r.uid !== this.eu) p.euSigo = antigo.euSigo
    if (r.retratoImagem) p.retratoImagem = { ...r.retratoImagem }
    return p
  }

  /** O perfil no formato da fase 1 (para as telas e rotas antigas acharem os rovers novos). */
  perfilBasico(ref: string): import('../../tipos').PerfilRover | undefined {
    try {
      const { sobre, interesses, recados, listado, estado, ...p } = this.perfilSocial(this.roverPorRef(ref))
      void sobre
      void interesses
      void recados
      void listado
      void estado
      return p
    } catch {
      return undefined
    }
  }

  protected cartaoComunidade(c: ComunidadeS): ComunidadeCartao {
    return {
      id: c.id, nome: c.nome, descricao: c.descricao, tema: c.tema, acesso: c.acesso, membros: c.membros.size + c.membrosExtras,
      topicos: [...this.bdTopicos.values()].filter((t) => t.comunidade === c.id && !t.removido && !t.apagado).length,
      criadaEm: iso(c.criadaEm), atividadeEm: iso(this.atividadeDaComunidade(c)), categorias: [...c.categorias],
    }
  }
  protected voceNaComunidade(c: ComunidadeS): VoceNaComunidade {
    const ban = c.banidos.find((b) => b.uid === this.eu)
    const mem = c.membros.get(this.eu)
    return {
      papel: this.papel(c, this.eu), pedidoPendente: c.pedidos.some((p) => p.uid === this.eu), convidado: c.convites.some((p) => p.uid === this.eu), banido: this.banido(c, this.eu),
      banidoEm: ban ? iso(ban.em) : null, membroDesde: mem ? iso(mem.desde) : null,
    }
  }
  protected cartaoTopico(t: TopicoS): TopicoCartao {
    const c = this.bdComunidades.get(t.comunidade)
    return {
      id: t.id, comunidade: t.comunidade, comunidadeNome: c?.nome, categoria: t.categoria, titulo: t.titulo, trecho: trecho(t.texto), autor: this.resumo(t.autor),
      criadoEm: iso(t.em), atividadeEm: iso(this.atividadeDoTopico(t)), respostas: this.respostasVivas(t.id).length, fixado: t.fixado, trancado: t.trancado,
      resolvido: !!t.resolvidoPor, tags: [...t.tags], enquete: !!t.enquete, editado: t.versoes.length > 1,
      // só quando o tópico tem marca, como no relé
      ...(t.marcas && (t.marcas.etiquetas.length > 0 || t.marcas.status !== null) ? { marcas: { etiquetas: [...t.marcas.etiquetas], status: t.marcas.status } } : {}),
    }
  }
  /** O vocabulário que o relé devolve: o definido pela moderação, ou nenhuma etiqueta e o status padrão (`padrao: true`). */
  protected vocabularioDe(c: ComunidadeS): Vocabulario {
    const v = c.vocabulario
    const tem = !!v && v.status.length > 0
    return { etiquetas: (v?.etiquetas ?? []).map((e) => ({ ...e })), status: (tem ? v!.status : STATUS_PADRAO).map((s) => ({ ...s, categorias: s.categorias ? [...s.categorias] : null })), padrao: !tem }
  }
  /**
   * Pontos da ordem por PESSOAS (0.3.2): 3 por pessoa distinta que respondeu, 1 por pessoa distinta que reagiu. O autor não pontua em si
   * mesmo, só conta rover que existe e tem conta de pelo menos um dia. Quem responde 25 vezes ou reage 500 vezes vale 1. `desde` limita ao
   * que veio na janela (o cliente falso não guarda a hora de cada reação: ela vale se o item teve vida na janela).
   */
  protected pontosPorPessoas(autor: string, respostas: { autor: string; em: number }[], reatores: Iterable<string>, vivoEm: number, desde: number | null): number {
    const vale = (u: string) => u !== autor && this.rovers.has(u) && this.contaDias(u) >= 1
    const quemRespondeu = new Set(respostas.filter((r) => (desde === null || r.em >= desde) && vale(r.autor)).map((r) => r.autor))
    const quemReagiu = desde === null || vivoEm >= desde ? new Set([...reatores].filter(vale)) : new Set<string>()
    return quemRespondeu.size * 3 + quemReagiu.size
  }
  protected pontosDoTopico(t: TopicoS, desde: number | null): number {
    return this.pontosPorPessoas(t.autor, this.respostasVivas(t.id), t.reatores.keys(), this.atividadeDoTopico(t), desde)
  }
  protected pontosDaResposta(r: RespostaS, desde: number | null): number {
    const filhas = this.respostasVivas(r.topico).filter((f) => f.paiId === r.id)
    return this.pontosPorPessoas(r.autor, filhas, r.reatores.keys(), Math.max(r.em, ...filhas.map((f) => f.em)), desde)
  }
  protected cartaoPagina(p: PaginaS): PaginaCartao {
    const ult = [...this.bdAtualizacoes.values()].filter((a) => a.pagina === p.id && !a.removida && !a.apagada).map((a) => a.em)
    return {
      id: p.id, nome: p.nome, descricao: p.descricao, tema: p.tema, dono: this.resumo(p.dono),
      seguidores: this.seguidoresPublicos(p).length + p.seguidoresExtras, criadaEm: iso(p.criadaEm), atividadeEm: iso(Math.max(p.criadaEm, ...ult)),
    }
  }
  protected viewAtualizacao(a: AtualizacaoS): Atualizacao {
    const p = this.bdPaginas.get(a.pagina)
    const r = { curtir: 0, util: 0 }
    for (const v of a.reatores.values()) r[v]++
    return { id: a.id, pagina: a.pagina, paginaNome: p?.nome, autor: this.resumo(a.autor), titulo: a.titulo, texto: a.texto, tags: [...a.tags], criadaEm: iso(a.em), reacoes: r, minhaReacao: a.reatores.get(this.eu) ?? null }
  }
  protected listadas(): ComunidadeS[] {
    return [...this.bdComunidades.values()].filter((c) => !c.encerrada && c.acesso !== 'fechada')
  }
  protected exigirPropria(uid: string): void {
    if (uid !== this.eu) throw new ErroRede('sem-permissao', 'só o próprio rover lê isto')
  }
  /** O grafo do rover permite ao leitor ver listas (seguindo, amigos, comunidades, páginas)? */
  protected exigirGrafo(r: RoverS): void {
    if (r.uid !== this.eu && r.grafo !== 'publico') throw new ErroRede('grafo-privado', 'o grafo desse rover não é público')
  }
  /** Um conteúdo existe e o leitor pode lê-lo agora? (para a notificação que aponta para ele) */
  protected objetoLegivel(id: string): boolean {
    const t = this.bdTopicos.get(id)
    if (t) return !t.apagado && !t.removido && this.podeLerTopico(t)
    const r = this.bdRespostas.get(id)
    if (r) {
      const tp = this.bdTopicos.get(r.topico)
      return !r.apagada && !r.removida && !!tp && !tp.apagado && !tp.removido && this.podeLerTopico(tp)
    }
    const c = this.bdComunidades.get(id)
    if (c) return !c.encerrada && this.podeLer(c, this.eu)
    const p = this.bdPaginas.get(id)
    if (p) return !p.encerrada
    const a = this.bdAtualizacoes.get(id)
    if (a) return !a.removida && !a.apagada
    const rc = this.bdRecados.find((x) => x.id === id)
    if (rc) return !rc.apagado && !rc.removido
    const d = this.bdDepoimentos.find((x) => x.id === id)
    if (d) return !d.apagado && visivelPara({ estado: d.estado, alvo: d.alvo, autor: { uid: d.autor } }, this.eu)
    return true
  }
  protected podeLerTopico(t: TopicoS): boolean {
    const c = this.bdComunidades.get(t.comunidade)
    return !!c && !c.encerrada && this.podeLer(c, this.eu)
  }

  // ---- info -------------------------------------------------------------------------------------------------

  /** A demonstração declara TODOS os recursos da 0.3.1, para as telas novas aparecerem. */
  async info(): Promise<InfoDoRele> {
    return { protocolo: ['0.1', '0.2', '0.3'], social: true, recursos: [...RECURSOS_DA_DEMONSTRACAO] }
  }
  async suporta(recurso: RecursoDoRele): Promise<boolean> {
    return (RECURSOS_DA_DEMONSTRACAO as readonly string[]).includes(recurso)
  }

  // ---- página do rover ---------------------------------------------------------------------------------------

  async paginaDoRover(ref: string): Promise<PaginaDoRover> {
    const r = this.roverPorRef(ref)
    const eu = this.eu
    const proprio = r.uid === eu
    const selos = this.contarSelos(r.uid)
    const amigosVisiveis = this.amigosDe(r.uid).filter((u) => proprio || this.grafoPublico(u))
    const escondeContagens = !proprio && r.grafo === 'privado'
    const comunidadesDe = [...this.bdComunidades.values()].filter((c) => !c.encerrada && c.membros.has(r.uid) && (proprio || c.acesso !== 'fechada'))
    const paginasDe = [...this.bdPaginas.values()].filter((p) => !p.encerrada && (p.dono === r.uid || p.admins.includes(r.uid) || p.seguidores.has(r.uid)))
    return {
      rover: this.perfilSocial(r),
      selos,
      contagens: {
        amigos: escondeContagens ? null : amigosVisiveis.length,
        comunidades: escondeContagens ? null : comunidadesDe.length,
        paginas: escondeContagens ? null : paginasDe.length,
        recados: this.recadosVisiveis(r.uid).length,
        depoimentos: this.depoimentosDe(r.uid, 'aceito').length,
        entregas: this.bdEntregas.filter((e) => e.autor === r.uid && !e.apagado).length,
        seguidores: escondeContagens ? null : this.perfilSocial(r).seguidores,
        seguindo: escondeContagens ? null : this.perfilSocial(r).seguindo,
      },
      voce: {
        amigoDesde: !proprio && this.ehAmigo(eu, r.uid) ? iso(this.amizade(eu, r.uid)!.desde) : null,
        contaDesde: iso(this.rover(eu).desde),
        selosQueDei: (['confiavel', 'caprichoso', 'rapido', 'divertido'] as TipoSelo[]).filter((k) => this.bdSelos.some((x) => x.doador === eu && x.alvo === r.uid && x.selo === k && !x.apagado)),
        amigo: !proprio && this.ehAmigo(eu, r.uid),
        pedidoEnviado: this.pedidos.some((p) => p.de === eu && p.para === r.uid),
        pedidoRecebido: this.pedidos.some((p) => p.de === r.uid && p.para === eu),
        euBloqueei: this.bloqueou(eu, r.uid),
        euSilenciei: this.silenciou(eu, r.uid),
        papel: proprio ? 'proprio' : null,
      },
    }
  }

  /** Selos: contagem de doadores DISTINTOS que ainda são amigos do dono (e não bloqueados). */
  protected contarSelos(uid: string) {
    const c = { confiavel: 0, caprichoso: 0, rapido: 0, divertido: 0 }
    const vistos = new Set<string>()
    for (const s of this.bdSelos) {
      if (s.alvo !== uid || s.apagado || !this.ehAmigo(s.doador, uid) || this.bloqueio(s.doador, uid)) continue
      const k = `${s.doador}|${s.selo}`
      if (vistos.has(k)) continue
      vistos.add(k)
      c[s.selo]++
    }
    return c
  }

  protected recadosVisiveis(uid: string) {
    return this.bdRecados.filter((x) => x.alvo === uid && !x.apagado && !x.removido && this.rovers.has(x.autor) && !this.bloqueou(uid, x.autor)).sort((a, b) => b.em - a.em)
  }
  protected depoimentosDe(uid: string, estado: 'aceito' | 'pendente') {
    return this.bdDepoimentos
      .filter((d) => d.alvo === uid && !d.apagado && d.estado === estado && !this.bloqueou(uid, d.autor))
      .sort((a, b) => (b.aceitoEm ?? b.em) - (a.aceitoEm ?? a.em))
  }

  async recados(uid: string, cursor?: string): Promise<Pagina<Recado>> {
    const r = this.rover(uid)
    const itens = this.recadosVisiveis(r.uid).map<Recado>((x) => ({ id: x.id, autor: this.resumo(x.autor), alvo: x.alvo, texto: x.texto, criadoEm: iso(x.em) }))
    return paginar(itens, cursor)
  }

  async depoimentos(uid: string, opcoes: { estado?: 'aceitos' | 'pendentes'; cursor?: string } = {}): Promise<Pagina<Depoimento>> {
    const r = this.rover(uid)
    const pendentes = opcoes.estado === 'pendentes'
    if (pendentes) this.exigirPropria(uid)
    const lista = this.depoimentosDe(r.uid, pendentes ? 'pendente' : 'aceito')
    const itens = lista.map<Depoimento>((d) => ({
      id: d.id, autor: this.resumo(d.autor), alvo: d.alvo, texto: d.texto, estado: d.estado, criadoEm: iso(d.em), aceitoEm: d.aceitoEm ? iso(d.aceitoEm) : undefined,
    }))
    return paginar(itens, opcoes.cursor)
  }

  /** Os depoimentos que o próprio rover escreveu e que ainda esperam a decisão do dono da página. Só o próprio. */
  async depoimentosEnviados(uid: string, cursor?: string): Promise<Pagina<DepoimentoEnviado>> {
    const r = this.rover(uid)
    this.exigirPropria(uid)
    const itens = this.bdDepoimentos
      .filter((d) => d.autor === r.uid && !d.apagado && d.estado === 'pendente' && this.rovers.has(d.alvo))
      .sort((a, b) => b.em - a.em)
      .map<DepoimentoEnviado>((d) => ({ id: d.id, alvo: this.resumo(d.alvo), texto: d.texto, criadoEm: iso(d.em), estado: 'pendente' }))
    return paginar(itens, cursor)
  }

  /** O que a moderação escondeu do próprio rover (o trecho vem do conteúdo retido, enquanto o relé o retém). Só o próprio. */
  async removidos(uid: string, cursor?: string): Promise<Pagina<Removido>> {
    const r = this.rover(uid)
    this.exigirPropria(uid)
    const itens = this.registro
      .filter((x) => x.acao === 'remocao' && this.retidos.get(x.alvo)?.autor === r.uid)
      .sort((a, b) => b.em - a.em)
      .map<Removido>((x) => ({
        id: x.id, em: iso(x.em), escopo: x.escopo, contexto: x.contexto, alvoTipo: x.alvoTipo, alvo: x.alvo, motivo: x.motivo as MotivoModeracao, por: x.por,
        apelacao: x.apelacaoId ? (this.apelacoes.find((a) => a.id === x.apelacaoId)?.situacao ?? null) : null, trecho: this.retidos.get(x.alvo)?.texto ?? null,
      }))
    return paginar(itens, cursor)
  }

  async entregas(uid: string, cursor?: string): Promise<Pagina<Entrega>> {
    const r = this.rover(uid)
    const itens = this.bdEntregas
      .filter((e) => e.autor === r.uid && !e.apagado)
      .sort((a, b) => b.em - a.em)
      .map<Entrega>((e) => ({ id: e.id, autor: this.resumo(e.autor), titulo: e.titulo, descricao: e.descricao, resultado: e.resultado, tags: [...e.tags], criadaEm: iso(e.em) }))
    return paginar(itens, cursor)
  }

  async amigos(uid: string, cursor?: string): Promise<Pagina<AmigoItem>> {
    const r = this.rover(uid)
    this.exigirGrafo(r)
    // a aresta é dos dois: quem fechou o grafo não aparece na lista de ninguém (só na do próprio)
    const itens = this.amizades
      .filter((a) => a.a === r.uid || a.b === r.uid)
      .map((a) => ({ outro: a.a === r.uid ? a.b : a.a, desde: a.desde }))
      .filter((x) => this.rovers.has(x.outro) && (r.uid === this.eu || this.grafoPublico(x.outro)))
      .sort((a, b) => b.desde - a.desde)
      .map<AmigoItem>((x) => ({ rover: this.resumo(x.outro), desde: iso(x.desde) }))
    return paginar(itens, cursor)
  }

  async amigosEmComum(uid: string, com: string, cursor?: string): Promise<Pagina<ResumoRover>> {
    if (!com || com === uid) throw new ErroRede('invalido', 'esquema')
    const a = this.rover(uid)
    const b = this.rover(com)
    for (const x of [a, b]) if (x.uid !== this.eu && x.grafo !== 'publico') throw new ErroRede('grafo-privado', 'o grafo desse rover não é público')
    const deB = new Set(this.amigosDe(b.uid))
    const itens = this.amigosDe(a.uid)
      .filter((u) => deB.has(u) && this.grafoPublico(u))
      .map((u) => this.resumo(u))
    return paginar(itens, cursor)
  }

  async comunidadesDoRover(uid: string, cursor?: string) {
    const r = this.rover(uid)
    this.exigirGrafo(r)
    const proprio = r.uid === this.eu
    const itens = [...this.bdComunidades.values()]
      .filter((c) => !c.encerrada && c.membros.has(r.uid) && (proprio || c.acesso !== 'fechada'))
      .sort((a, b) => b.membros.get(r.uid)!.desde - a.membros.get(r.uid)!.desde)
      .map((c) => ({ comunidade: this.cartaoComunidade(c), papel: c.membros.get(r.uid)!.papel }))
    return paginar(itens, cursor)
  }

  async paginasDoRover(uid: string, cursor?: string) {
    const r = this.rover(uid)
    this.exigirGrafo(r)
    const itens = [...this.bdPaginas.values()]
      .filter((p) => !p.encerrada && (p.dono === r.uid || p.admins.includes(r.uid) || p.seguidores.has(r.uid)))
      .map((p) => ({ pagina: this.cartaoPagina(p), relacao: (p.dono === r.uid ? 'dono' : p.admins.includes(r.uid) ? 'administrador' : 'seguidor') as 'dono' | 'administrador' | 'seguidor' }))
    return paginar(itens, cursor)
  }

  async amizadesPendentes(uid: string): Promise<PedidosDeAmizade> {
    this.exigirPropria(uid)
    return {
      recebidos: this.pedidos.filter((p) => p.para === uid).sort((a, b) => b.em - a.em).slice(0, 100).map((p) => ({ rover: this.resumo(p.de), em: iso(p.em) })),
      enviados: this.pedidos.filter((p) => p.de === uid).sort((a, b) => b.em - a.em).slice(0, 50).map((p) => ({ rover: this.resumo(p.para), em: iso(p.em) })),
    }
  }

  async convites(uid: string): Promise<ConviteRecebido[]> {
    this.exigirPropria(uid)
    const itens: ConviteRecebido[] = []
    for (const c of this.bdComunidades.values()) {
      if (c.encerrada) continue
      for (const cv of c.convites) if (cv.uid === uid) itens.push({ comunidade: { id: c.id, nome: c.nome, descricao: c.descricao, acesso: c.acesso }, por: this.resumo(cv.por), em: iso(cv.em) })
    }
    return itens.sort((a, b) => (a.em < b.em ? 1 : -1)).slice(0, 50)
  }

  async relacoes(uid: string, cursor?: string): Promise<Pagina<RelacaoItem>> {
    this.exigirPropria(uid)
    const itens: RelacaoItem[] = []
    for (const [k, v] of this.bdRelacoes) {
      const [de, alvo] = k.split('>')
      if (de === uid && this.rovers.has(alvo)) itens.push({ rover: this.resumo(alvo), relacao: v.relacao, desde: iso(v.desde) })
    }
    return paginar(itens.sort((a, b) => (a.desde < b.desde ? 1 : -1)), cursor)
  }

  async notificacoes(uid: string, cursor?: string): Promise<Pagina<Notificacao>> {
    this.exigirPropria(uid)
    const itens = this.bdNotificacoes
      .filter((n) => n.destino === uid && this.agora().getTime() - n.em < 90 * DIA)
      .sort((a, b) => b.seq - a.seq)
      .map<Notificacao>((n) => {
        const legivel = n.objeto ? this.objetoLegivel(n.objeto) : false
        const c = n.comunidade ? this.bdComunidades.get(n.comunidade) : undefined
        const pg = n.pagina ? this.bdPaginas.get(n.pagina) : undefined
        const t = n.objeto ? (this.bdTopicos.get(n.objeto) ?? (this.bdRespostas.get(n.objeto) ? this.bdTopicos.get(this.bdRespostas.get(n.objeto)!.topico) : undefined)) : undefined
        const lugarLegivel = c ? this.podeLer(c, uid) || c.convites.some((x) => x.uid === uid) : true
        return {
          seq: n.seq, tipo: n.tipo, em: iso(n.em), origem: n.tipo === 'selo-recebido' || !n.origem ? null : this.resumo(n.origem),
          objeto: legivel ? n.objeto : null, comunidade: lugarLegivel ? n.comunidade : null, pagina: n.pagina,
          nomeDoLugar: lugarLegivel ? (c?.nome ?? pg?.nome ?? null) : null,
          nomeDoTopico: legivel && t ? t.titulo : null,
        }
      })
    return paginar(itens, cursor)
  }

  async contagemDeNotificacoes(uid: string, desde = 0): Promise<number> {
    this.exigirPropria(uid)
    return this.bdNotificacoes.filter((n) => n.destino === uid && n.seq > desde).length
  }

  // ---- comunidades --------------------------------------------------------------------------------------------

  async comunidades(opcoes: { tema?: string; acesso?: 'aberta' | 'moderada'; ordem?: OrdemListada; cursor?: string } = {}): Promise<Pagina<ComunidadeCartao>> {
    let l = this.listadas()
    if (opcoes.tema) l = l.filter((c) => c.tema === opcoes.tema)
    if (opcoes.acesso) l = l.filter((c) => c.acesso === opcoes.acesso)
    const cartoes = l.map((c) => this.cartaoComunidade(c))
    cartoes.sort(opcoes.ordem === 'ativas' ? (a, b) => (a.atividadeEm < b.atividadeEm ? 1 : -1) : (a, b) => (a.criadaEm < b.criadaEm ? 1 : -1))
    return paginar(cartoes, opcoes.cursor)
  }

  async comunidade(id: string): Promise<Comunidade | ComunidadeMinima> {
    const c = this.comunidade_(id)
    const voce = this.voceNaComunidade(c)
    if (c.acesso === 'fechada' && !this.podeLer(c, this.eu)) {
      // o convidado lê só o cartão mínimo; para todos os outros, a fechada não existe
      if (voce.convidado && !voce.banido) return { id: c.id, nome: c.nome, descricao: c.descricao, acesso: c.acesso, voce }
      throw new ErroRede('nao-encontrado', 'comunidade não encontrada')
    }
    return {
      ...this.cartaoComunidade(c), regras: c.regras, dono: this.resumo(c.dono),
      moderadores: [...c.membros.values()].filter((m) => m.papel === 'moderador').length, voce, vocabulario: this.vocabularioDe(c),
    }
  }
  /** Comunidade existente (o `comunidade()` público é a rota; este é o nome interno livre). */
  protected comunidade_(id: string): ComunidadeS {
    const c = this.bdComunidades.get(id)
    if (!c || c.encerrada) throw new ErroRede('nao-encontrado', 'comunidade não encontrada')
    return c
  }
  protected legivel(id: string): ComunidadeS {
    const c = this.comunidade_(id)
    if (!this.podeLer(c, this.eu)) throw new ErroRede('nao-encontrado', 'comunidade não encontrada')
    return c
  }
  protected exigirEquipe(c: ComunidadeS): void {
    if (!podeNaComunidade('ver-moderacao', this.quem(c, this.eu), c.acesso).ok) throw new ErroRede('sem-permissao', 'só a moderação lê isto')
  }

  async membros(id: string, cursor?: string): Promise<Pagina<MembroItem>> {
    const c = this.legivel(id)
    const equipe = this.ehEquipe(c, this.eu)
    const ordem = { dono: 0, moderador: 1, membro: 2 } as const
    const itens = [...c.membros.entries()]
      .filter(([u]) => this.rovers.has(u) && (equipe || u === this.eu || this.grafoPublico(u)))
      .sort((a, b) => ordem[a[1].papel] - ordem[b[1].papel] || a[1].desde - b[1].desde)
      .map<MembroItem>(([u, m]) => ({ rover: this.resumo(u), papel: m.papel, desde: iso(m.desde) }))
    return paginar(itens, cursor)
  }

  async pedidosDeEntrada(id: string): Promise<Pagina<PedidoDeEntrada>> {
    const c = this.legivel(id)
    this.exigirEquipe(c)
    return paginar(c.pedidos.map((p) => ({ rover: this.resumo(p.uid), em: iso(p.em) })))
  }
  async convitesDaComunidade(id: string): Promise<Pagina<ConviteEnviado>> {
    const c = this.legivel(id)
    this.exigirEquipe(c)
    return paginar(c.convites.map((p) => ({ rover: this.resumo(p.uid), por: this.resumo(p.por), em: iso(p.em) })))
  }
  async banidos(id: string): Promise<Pagina<BanidoItem>> {
    const c = this.legivel(id)
    this.exigirEquipe(c)
    const itens = c.banidos.map<BanidoItem>((b) => ({
      rover: this.resumo(b.uid), motivo: b.motivo, por: b.por, em: iso(b.em),
      apelacao: b.apelacao ? (this.apelacoes.find((a) => a.id === b.apelacao)?.situacao ?? null) : null,
    }))
    return paginar(itens)
  }

  async topicos(id: string, opcoes: { categoria?: string; tag?: string; ordem?: OrdemTopicos; cursor?: string; janela?: Janela; status?: string; etiqueta?: string } = {}): Promise<ListaDeTopicos> {
    const c = this.legivel(id)
    let l = [...this.bdTopicos.values()].filter((t) => t.comunidade === c.id && !t.removido && !t.apagado)
    if (opcoes.categoria) l = l.filter((t) => t.categoria === opcoes.categoria)
    if (opcoes.tag) l = l.filter((t) => t.tags.includes(opcoes.tag!))
    if (opcoes.status) l = l.filter((t) => t.marcas?.status === opcoes.status)
    if (opcoes.etiqueta) l = l.filter((t) => t.marcas?.etiquetas.includes(opcoes.etiqueta!))
    const fixados = l.filter((t) => t.fixado)
    let resto = l.filter((t) => !t.fixado)
    if (opcoes.ordem === 'sem-resposta') resto = resto.filter((t) => this.respostasVivas(t.id).length === 0)
    if (opcoes.ordem === 'melhores' || opcoes.ordem === 'em-alta') {
      const desde = opcoes.ordem === 'em-alta' ? this.now() - janelaMs(opcoes.janela) : null
      const pontos = new Map(resto.map((t) => [t.id, this.pontosDoTopico(t, desde)]))
      resto.sort((a, b) => pontos.get(b.id)! - pontos.get(a.id)! || this.atividadeDoTopico(b) - this.atividadeDoTopico(a))
    } else {
      resto.sort(opcoes.ordem === 'ativos' ? (a, b) => this.atividadeDoTopico(b) - this.atividadeDoTopico(a) : (a, b) => b.em - a.em)
    }
    const pag = paginar(resto.map((t) => this.cartaoTopico(t)), opcoes.cursor)
    return opcoes.cursor === undefined ? { ...pag, fixados: fixados.sort((a, b) => b.em - a.em).map((t) => this.cartaoTopico(t)) } : pag
  }

  async filaDeModeracao(id: string): Promise<FilaDeModeracao> {
    const c = this.legivel(id)
    this.exigirEquipe(c)
    const alvos = new Map<string, DenunciaNaFilaS>()
    for (const d of this.denuncias) {
      if (d.dispensadaEm !== undefined) continue
      const t = this.bdTopicos.get(d.alvo)
      const r = this.bdRespostas.get(d.alvo)
      const topicoId = t ? t.id : r?.topico
      const tp = topicoId ? this.bdTopicos.get(topicoId) : undefined
      if (!tp || tp.comunidade !== c.id || t?.removido || r?.removida || t?.apagado || r?.apagada) continue
      const x = alvos.get(d.alvo) ?? { alvo: d.alvo, alvoTipo: t ? 'topico' : 'resposta-forum', motivos: {}, total: 0, primeiraEm: d.em, ultimaEm: d.em, quem: new Set<string>(), tp, autor: t ? t.autor : r!.autor, texto: t ? t.titulo : r!.texto }
      x.motivos[d.motivo] = (x.motivos[d.motivo] ?? 0) + 1
      x.total++
      x.primeiraEm = Math.min(x.primeiraEm, d.em)
      x.ultimaEm = Math.max(x.ultimaEm, d.em)
      if (d.pesa) x.quem.add(d.quem)
      alvos.set(d.alvo, x)
    }
    const denuncias = ordenarFila(
      [...alvos.values()].map((x) => ({
        alvo: x.alvo, alvoTipo: x.alvoTipo, motivos: x.motivos, total: x.total, primeiraEm: iso(x.primeiraEm), ultimaEm: iso(x.ultimaEm), peso: x.quem.size, topico: x.tp.id,
        previa: { autor: this.resumo(x.autor), trecho: trecho(x.texto, 160), topico: x.tp.titulo },
      })),
    ).slice(0, 50)
    const dono = this.papel(c, this.eu) === 'dono'
    const apelacoes = dono
      ? this.apelacoes
          .filter((a) => a.comunidade === c.id && a.situacao === 'aberta' && quemDecideApelacao(a.agiuPor) === 'dono')
          .map((a) => ({ id: a.id, tipo: a.tipo, alvo: a.alvo, autor: this.resumo(a.autor), texto: a.texto, em: iso(a.em), conteudo: a.tipo === 'remocao' ? (this.retidos.get(a.alvo)?.texto ?? null) : null }))
      : []
    return { denuncias, apelacoes }
  }

  protected viewRegistro(r: import('./interno').RegistroS): RegistroModeracao {
    return {
      id: r.id, em: iso(r.em), escopo: r.escopo, contexto: r.contexto, acao: r.acao, alvoTipo: r.alvoTipo,
      alvo: r.acao === 'remocao' || r.acao === 'dispensa' ? r.alvo : this.resumo(r.alvo), motivo: r.motivo, por: r.por,
      apelacao: r.apelacaoId ? (this.apelacoes.find((a) => a.id === r.apelacaoId)?.situacao ?? null) : null,
    }
  }
  async registroDaComunidade(id: string, cursor?: string): Promise<Pagina<RegistroModeracao>> {
    const c = this.legivel(id)
    const itens = this.registro.filter((r) => r.escopo === 'comunidade' && r.contexto === c.id).sort((a, b) => b.em - a.em).map((r) => this.viewRegistro(r))
    return paginar(itens, cursor)
  }
  async registroDoRele(cursor?: string): Promise<Pagina<RegistroModeracao>> {
    return paginar(this.registro.filter((r) => r.escopo === 'rele').sort((a, b) => b.em - a.em).map((r) => this.viewRegistro(r)), cursor)
  }

  // ---- 0.3.2: anúncios do relé e painel de início -----------------------------------------------------------------

  async anuncios(cursor?: string): Promise<Pagina<Anuncio>> {
    const itens = [...this.bdAnuncios]
      .sort((a, b) => Number(b.fixado) - Number(a.fixado) || b.em - a.em)
      .map<Anuncio>((a) => ({ id: a.id, titulo: a.titulo, texto: a.texto, criadoEm: iso(a.em), fixado: a.fixado }))
    return paginar(itens, cursor)
  }

  /** Só ids, contagens e carimbos da leitora (a Lumi). Não conta o que o próprio leitor fez nem o de quem ele bloqueou ou silenciou. */
  async inicio(desde = 0): Promise<InicioDoRele | null> {
    const seg = (ms: number) => Math.floor(ms / 1000)
    const eu = this.eu
    const calado = (u: string | null) => u !== null && (this.bloqueou(eu, u) || this.silenciou(eu, u))
    const porTipo: Record<string, number> = {}
    let total = 0
    for (const n of this.bdNotificacoes) {
      if (n.destino !== eu || seg(n.em) <= desde || calado(n.origem)) continue
      porTipo[n.tipo] = (porTipo[n.tipo] ?? 0) + 1
      total++
    }
    const atividade: InicioDoRele['atividade'] = []
    for (const t of this.bdTopicos.values()) {
      if (t.autor !== eu || t.removido || t.apagado) continue
      const respostas = new Set(this.respostasVivas(t.id).filter((r) => seg(r.em) > desde && r.autor !== eu && !calado(r.autor)).map((r) => r.autor)).size
      const reacoes = seg(this.atividadeDoTopico(t)) > desde ? [...t.reatores.keys()].filter((u) => u !== eu && !calado(u)).length : 0
      if (respostas > 0 || reacoes > 0) atividade.push({ tipo: 'topico', id: t.id, respostas, reacoes })
    }
    const minhas = [...this.bdComunidades.values()].filter((c) => !c.encerrada)
    const pedidosDeEntrada: InicioDoRele['pendencias']['pedidosDeEntrada'] = []
    const moderacao: InicioDoRele['moderacao'] = []
    for (const c of minhas) {
      const papel = this.papel(c, eu)
      if (papel !== 'dono' && papel !== 'moderador') continue
      if (c.pedidos.length > 0) pedidosDeEntrada.push({ comunidade: c.id, n: c.pedidos.length })
      const fila = await this.filaDeModeracao(c.id)
      if (fila.denuncias.length > 0 || fila.apelacoes.length > 0) moderacao.push({ comunidade: c.id, denuncias: fila.denuncias.length, apelacoes: fila.apelacoes.length })
    }
    const novos = this.bdAnuncios.filter((a) => seg(a.em) > desde)
    const ultimo = [...novos].sort((a, b) => b.em - a.em)[0]
    const pedidosDeAmizade = this.pedidos.filter((p) => p.para === eu && !calado(p.de))
    return {
      agora: seg(this.now()),
      avisos: { total, porTipo },
      atividade: atividade.slice(0, 20),
      pendencias: {
        amizades: { n: pedidosDeAmizade.length, uids: pedidosDeAmizade.slice(0, 10).map((p) => p.de) },
        depoimentos: this.bdDepoimentos.filter((d) => d.alvo === eu && d.estado === 'pendente' && !d.apagado && !calado(d.autor)).length,
        convites: minhas.filter((c) => c.convites.some((v) => v.uid === eu)).slice(0, 10).map((c) => c.id),
        pedidosDeEntrada: pedidosDeEntrada.slice(0, 20),
      },
      moderacao: moderacao.slice(0, 20),
      anuncios: { novos: novos.length, ultimo: ultimo ? { id: ultimo.id, em: seg(ultimo.em) } : null },
      atestadoExpiraEm: seg(this.now() + 7 * DIA),
    }
  }

  // ---- fórum ---------------------------------------------------------------------------------------------------

  async topico(id: string): Promise<Topico> {
    const t = this.topicoLegivel(id)
    if (t.removido) throw new ErroRede('removido', 'tópico escondido pela moderação')
    const c = this.bdComunidades.get(t.comunidade)!
    const e = t.enquete
    const resolvida = t.resolvidoPor
    return {
      ...this.cartaoTopico(t), comunidadeNome: c.nome, texto: t.texto, enquete: !!e,
      resolvidoPor: resolvida ? { resposta: resolvida.resposta, por: this.resumo(resolvida.por), em: iso(resolvida.em) } : null,
      pesquisa: e
        ? {
            opcoes: e.opcoes.map((texto, i) => ({ texto, votos: e.votos[i] })), encerraEm: iso(e.encerraEm), encerrada: this.now() >= e.encerraEm,
            total: e.votos.reduce((a, b) => a + b, 0), voce: e.votantes.get(this.eu) ?? null,
          }
        : null,
      versoes: t.versoes.length,
      reacoes: contarReacoes(t.reatores), minhaReacao: t.reatores.get(this.eu) ?? null,
    }
  }

  async respostas(topico: string, opcoes: { em?: string; cursor?: string; ordem?: OrdemRespostas; janela?: Janela } = {}): Promise<Pagina<RespostaForum>> {
    const t = this.topicoLegivel(topico)
    if (t.removido) throw new ErroRede('removido', 'tópico escondido pela moderação')
    const vivas = this.respostasVivas(t.id)
    let nivel = opcoes.em ? vivas.filter((r) => r.paiId === opcoes.em) : vivas.filter((r) => r.paiId === null)
    if (opcoes.em && !this.bdRespostas.get(opcoes.em)) throw new ErroRede('nao-encontrado', 'resposta não encontrada')
    if (opcoes.ordem === 'recentes') nivel = [...nivel].sort((a, b) => b.em - a.em)
    if (opcoes.ordem === 'melhores' || opcoes.ordem === 'em-alta') {
      const desde = opcoes.ordem === 'em-alta' ? this.now() - janelaMs(opcoes.janela) : null
      const pontos = new Map(nivel.map((r) => [r.id, this.pontosDaResposta(r, desde)]))
      nivel = [...nivel].sort((a, b) => pontos.get(b.id)! - pontos.get(a.id)! || b.em - a.em)
    }
    const itens = nivel.map<RespostaForum>((r) => {
      const cita = r.cita ? this.bdRespostas.get(r.cita) : undefined
      const reacoes = { curtir: 0, util: 0 }
      for (const v of r.reatores.values()) reacoes[v]++
      return {
        id: r.id, autor: this.resumo(r.autor), texto: r.texto, criadoEm: iso(r.em), em: r.paiId,
        cita: r.cita && cita ? { id: cita.id, autor: this.resumo(cita.autor), trecho: cita.removida || cita.apagada ? null : trecho(cita.texto, 120) } : r.cita ? { id: r.cita, autor: this.resumo(r.autor), trecho: null } : null,
        filhas: vivas.filter((f) => f.paiId === r.id).length, resolveu: t.resolvidoPor?.resposta === r.id, reacoes, minhaReacao: r.reatores.get(this.eu) ?? null,
      }
    })
    return paginar(itens, opcoes.cursor)
  }

  async topicoDeObjeto(id: string): Promise<string> {
    if (this.bdTopicos.has(id)) return id
    const r = this.bdRespostas.get(id)
    if (!r) throw new ErroRede('nao-encontrado', 'objeto não encontrado')
    return r.topico
  }

  async historico(topico: string): Promise<VersaoDoTopico[]> {
    const t = this.topicoLegivel(topico)
    if (t.removido) throw new ErroRede('removido', 'tópico escondido pela moderação')
    return t.versoes.map((v) => ({ versao: v.versao, titulo: v.titulo, texto: v.texto, tags: [...v.tags], criadoEm: iso(v.em) }))
  }

  // ---- páginas -----------------------------------------------------------------------------------------------------

  async paginas(opcoes: { tema?: string; ordem?: OrdemListada; cursor?: string } = {}): Promise<Pagina<PaginaCartao>> {
    let l = [...this.bdPaginas.values()].filter((p) => !p.encerrada)
    if (opcoes.tema) l = l.filter((p) => p.tema === opcoes.tema)
    const cartoes = l.map((p) => this.cartaoPagina(p))
    cartoes.sort(opcoes.ordem === 'ativas' ? (a, b) => (a.atividadeEm < b.atividadeEm ? 1 : -1) : (a, b) => (a.criadaEm < b.criadaEm ? 1 : -1))
    return paginar(cartoes, opcoes.cursor)
  }

  /** Os temas de páginas abertas, do mais usado para o menos (empate: ordem alfabética, para a demonstração ser estável). */
  async temasDePaginas(): Promise<TemaDePagina[]> {
    const n = new Map<string, number>()
    for (const p of this.bdPaginas.values()) if (!p.encerrada) n.set(p.tema, (n.get(p.tema) ?? 0) + 1)
    return [...n.entries()].map(([tema, paginas]) => ({ tema, paginas })).sort((a, b) => b.paginas - a.paginas || a.tema.localeCompare(b.tema)).slice(0, 50)
  }

  async pagina(id: string): Promise<PaginaProjeto> {
    const p = this.paginaOuErro(id)
    const papel = this.papelNaPagina(p, this.eu)
    return { ...this.cartaoPagina(p), administradores: p.admins.map((u) => this.resumo(u)), voce: { segue: p.seguidores.has(this.eu), papel } }
  }
  protected paginaOuErro(id: string): PaginaS {
    const p = this.bdPaginas.get(id)
    if (!p || p.encerrada) throw new ErroRede('nao-encontrado', 'página não encontrada')
    return p
  }

  async atualizacoes(id: string, cursor?: string): Promise<Pagina<Atualizacao>> {
    const p = this.paginaOuErro(id)
    const itens = [...this.bdAtualizacoes.values()].filter((a) => a.pagina === p.id && !a.removida && !a.apagada).sort((a, b) => b.em - a.em).map((a) => this.viewAtualizacao(a))
    return paginar(itens, cursor)
  }

  async seguidoresDaPagina(id: string, cursor?: string): Promise<Pagina<ResumoRover>> {
    const p = this.paginaOuErro(id)
    return paginar(this.seguidoresPublicos(p).map((u) => this.resumo(u)), cursor)
  }

  async linhaMista(cursor?: string): Promise<Pagina<ItemDaLinha>> {
    const seguidas = new Set([...this.bdPaginas.values()].filter((p) => !p.encerrada && p.seguidores.has(this.eu)).map((p) => p.id))
    const posts = this.ganchos.postagensDaLinha().map((p) => ({ em: new Date(p.criadaEm).getTime(), item: { tipo: 'postagem', postagem: p } as ItemDaLinha }))
    const ats = [...this.bdAtualizacoes.values()].filter((a) => seguidas.has(a.pagina) && !a.removida && !a.apagada).map((a) => ({ em: a.em, item: { tipo: 'atualizacao', atualizacao: this.viewAtualizacao(a) } as ItemDaLinha }))
    const todos = [...posts, ...ats].sort((a, b) => b.em - a.em).map((x) => x.item)
    return paginar(todos, cursor, 8)
  }

  // ---- busca e descoberta -----------------------------------------------------------------------------------

  /** A pergunta vira até 8 palavras de até 30 letras; todas precisam casar, a última por prefixo. */
  protected palavras(q: string): string[] {
    return semAcento(q).split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 8).map((p) => p.slice(0, 30))
  }
  protected casa(tokens: string[], campos: { texto: string; peso: number }[]): number {
    const bolsa = campos.map((c) => ({ ps: semAcento(c.texto).split(/[^\p{L}\p{N}]+/u).filter(Boolean), peso: c.peso }))
    let total = 0
    for (let i = 0; i < tokens.length; i++) {
      const ultimo = i === tokens.length - 1
      let melhor = 0
      for (const b of bolsa) if (b.ps.some((p) => (ultimo ? p.startsWith(tokens[i]) : p === tokens[i]))) melhor = Math.max(melhor, b.peso)
      if (melhor === 0) return 0
      total += melhor
    }
    return total
  }
  protected buscaRovers(tokens: string[]): RoverBuscado[] {
    return [...this.rovers.values()]
      .filter((r) => r.listado)
      .map((r) => ({ r, p: this.casa(tokens, [{ texto: r.nome, peso: 4 }, { texto: r.handle.replace(/[._]/g, ' '), peso: 4 }, { texto: r.habilidades.join(' '), peso: 2 }, { texto: `${r.interesses.join(' ')} ${r.apresentacao}`, peso: 1 }]) }))
      .filter((x) => x.p > 0)
      .sort((a, b) => b.p - a.p || a.r.handle.localeCompare(b.r.handle))
      .map((x) => ({ ...this.resumo(x.r.uid), descricao: x.r.apresentacao }))
  }
  protected buscaComunidades(tokens: string[]): ComunidadeCartao[] {
    return this.listadas()
      .map((c) => ({ c, p: this.casa(tokens, [{ texto: c.nome, peso: 4 }, { texto: c.tema, peso: 3 }, { texto: c.descricao, peso: 1 }]) }))
      .filter((x) => x.p > 0)
      .sort((a, b) => b.p - a.p || b.c.criadaEm - a.c.criadaEm)
      .map((x) => this.cartaoComunidade(x.c))
  }
  protected buscaTopicos(tokens: string[]): TopicoCartao[] {
    return [...this.bdTopicos.values()]
      .filter((t) => !t.removido && !t.apagado && this.podeLerTopico(t))
      .map((t) => ({ t, p: this.casa(tokens, [{ texto: t.titulo, peso: 4 }, { texto: t.tags.join(' '), peso: 3 }, { texto: t.texto, peso: 1 }]) }))
      .filter((x) => x.p > 0)
      .sort((a, b) => b.p - a.p || this.atividadeDoTopico(b.t) - this.atividadeDoTopico(a.t))
      .map((x) => this.cartaoTopico(x.t))
  }
  protected buscaPaginas(tokens: string[]): PaginaCartao[] {
    return [...this.bdPaginas.values()]
      .filter((p) => !p.encerrada)
      .map((p) => ({ p, s: this.casa(tokens, [{ texto: p.nome, peso: 4 }, { texto: p.tema, peso: 3 }, { texto: p.descricao, peso: 1 }]) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || b.p.criadaEm - a.p.criadaEm)
      .map((x) => this.cartaoPagina(x.p))
  }

  async buscarTudo(q: string): Promise<ResultadoBuscaSocial> {
    const t = this.palavras(q)
    if (t.length === 0 || Array.from(q.trim()).length < 2) return { rovers: [], comunidades: [], topicos: [], paginas: [] }
    return { rovers: this.buscaRovers(t).slice(0, 5), comunidades: this.buscaComunidades(t).slice(0, 5), topicos: this.buscaTopicos(t).slice(0, 5), paginas: this.buscaPaginas(t).slice(0, 5) }
  }
  async buscarTipo(q: string, tipo: TipoDeBusca, cursor?: string, opcoes: { ordem?: OrdemBusca; janela?: Janela } = {}): Promise<Pagina<any>> {
    const t = this.palavras(q)
    if (t.length === 0 || Array.from(q.trim()).length < 2) return { itens: [] }
    let l: any[] = tipo === 'rovers' ? this.buscaRovers(t) : tipo === 'comunidades' ? this.buscaComunidades(t) : tipo === 'topicos' ? this.buscaTopicos(t) : this.buscaPaginas(t)
    // 0.3.2: `ordem` só vale na busca de tópicos. `relevancia` é o padrão e mantém a ordem do texto.
    if (tipo === 'topicos' && opcoes.ordem && opcoes.ordem !== 'relevancia') {
      const cartoes = l as TopicoCartao[]
      if (opcoes.ordem === 'recentes') l = [...cartoes].sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : a.criadoEm > b.criadoEm ? -1 : 0))
      else {
        const desde = opcoes.ordem === 'em-alta' ? this.now() - janelaMs(opcoes.janela) : null
        const pontos = new Map(cartoes.map((c) => [c.id, this.pontosDoTopico(this.bdTopicos.get(c.id)!, desde)]))
        l = [...cartoes].sort((a, b) => pontos.get(b.id)! - pontos.get(a.id)! || (a.atividadeEm < b.atividadeEm ? 1 : a.atividadeEm > b.atividadeEm ? -1 : 0))
      }
    }
    return paginar(l, cursor)
  }

  async emAlta(tipo: 'topicos' | 'comunidades' | 'paginas', janela?: Janela): Promise<any[]> {
    const ini = this.now() - janelaMs(janela)
    const dentro = (ms: number) => ms >= ini
    const vale = (u: string) => this.rovers.has(u) && this.contaDias(u) >= 1
    if (tipo === 'topicos') {
      return [...this.bdTopicos.values()]
        .filter((t) => !t.removido && !t.apagado && this.bdComunidades.get(t.comunidade)?.acesso !== 'fechada' && !this.bdComunidades.get(t.comunidade)?.encerrada)
        .map((t) => {
          const resp = new Set(this.respostasVivas(t.id).filter((r) => dentro(r.em) && vale(r.autor)).map((r) => r.autor))
          // o relé guarda a hora de cada reação; aqui a reação vale se o tópico teve vida na janela
          const reat = dentro(this.atividadeDoTopico(t)) ? [...t.reatores.keys()].filter(vale) : []
          // `pessoas` (0.3.1): quantas pessoas DISTINTAS responderam ou reagiram. Só o número, nunca quem.
          return { t, pontos: resp.size * 3 + reat.length, pessoas: new Set([...resp, ...reat]).size }
        })
        .filter((x) => x.pontos >= 2)
        .sort((a, b) => b.pontos - a.pontos)
        .slice(0, 20)
        .map((x) => ({ ...this.cartaoTopico(x.t), pessoas: x.pessoas }))
    }
    if (tipo === 'comunidades') {
      return this.listadas()
        .map((c) => {
          const novosUids = [...c.membros.entries()].filter(([u, m]) => dentro(m.desde) && vale(u)).map(([u]) => u)
          const novos = [...c.membros.values()].filter((m) => dentro(m.desde)).length
          const autores = new Set<string>()
          for (const t of this.bdTopicos.values()) {
            if (t.comunidade !== c.id || t.removido || t.apagado) continue
            if (dentro(t.em) && vale(t.autor)) autores.add(t.autor)
            for (const r of this.respostasVivas(t.id)) if (dentro(r.em) && vale(r.autor)) autores.add(r.autor)
          }
          return { c, pontos: novos * 2 + autores.size * 3, pessoas: new Set([...novosUids, ...autores]).size }
        })
        .filter((x) => x.pontos >= 3)
        .sort((a, b) => b.pontos - a.pontos)
        .slice(0, 20)
        .map((x) => ({ ...this.cartaoComunidade(x.c), pessoas: x.pessoas }))
    }
    return [...this.bdPaginas.values()]
      .filter((p) => !p.encerrada)
      .map((p) => {
        const novos = [...p.seguidores.values()].filter(dentro).length
        const novosUids = [...p.seguidores.entries()].filter(([u, em]) => dentro(em) && vale(u)).map(([u]) => u)
        const ats = [...this.bdAtualizacoes.values()].filter((a) => a.pagina === p.id && !a.removida && !a.apagada && dentro(a.em))
        const reat = ats.flatMap((a) => [...a.reatores.keys()]).filter(vale)
        return { p, pontos: novos + ats.length * 3, pessoas: new Set([...novosUids, ...reat]).size }
      })
      .filter((x) => x.pontos >= 2)
      .sort((a, b) => b.pontos - a.pontos)
      .slice(0, 20)
      .map((x) => ({ ...this.cartaoPagina(x.p), pessoas: x.pessoas }))
  }

  async recemChegadosSociais(limite = 50): Promise<RecemChegado[]> {
    const lim = this.now() - 7 * DIA
    return [...this.rovers.values()]
      .filter((r) => r.listado && r.desde >= lim)
      .sort((a, b) => b.desde - a.desde)
      .slice(0, Math.min(50, Math.max(1, limite)))
      .map((r) => ({ ...this.resumo(r.uid), desde: iso(r.desde) }))
  }

  async sugestoes(tipo: 'comunidades' | 'paginas' | 'rovers', interesses?: string[]): Promise<any[]> {
    // só do declarado: os interesses e as habilidades do perfil, ou os que vierem na chamada.
    const eu = this.rover(this.eu)
    const meus = new Set((interesses && interesses.length ? interesses : [...eu.interesses, ...eu.habilidades.map((h) => semAcento(h).replace(/\s+/g, '-'))]).map((i) => semAcento(i)))
    const comum = (tags: string[]) => tags.filter((t) => meus.has(semAcento(t))).length
    if (tipo === 'comunidades') {
      return this.listadas()
        .filter((c) => !c.membros.has(this.eu) && !this.banido(c, this.eu))
        .map((c) => ({ c, s: comum([c.tema]) }))
        .sort((a, b) => b.s - a.s || b.c.criadaEm - a.c.criadaEm)
        .slice(0, 20)
        .map((x) => this.cartaoComunidade(x.c))
    }
    if (tipo === 'paginas') {
      return [...this.bdPaginas.values()]
        .filter((p) => !p.encerrada && !p.seguidores.has(this.eu) && p.dono !== this.eu && !p.admins.includes(this.eu))
        .map((p) => ({ p, s: comum([p.tema]) }))
        .sort((a, b) => b.s - a.s || b.p.criadaEm - a.p.criadaEm)
        .slice(0, 20)
        .map((x) => this.cartaoPagina(x.p))
    }
    return [...this.rovers.values()]
      .filter((r) => r.uid !== this.eu && r.listado && !this.ehAmigo(this.eu, r.uid) && !this.bloqueio(this.eu, r.uid))
      .map((r) => ({ r, s: comum([...r.interesses, ...r.habilidades.map((h) => semAcento(h).replace(/\s+/g, '-'))]) }))
      .sort((a, b) => b.s - a.s || b.r.desde - a.r.desde)
      .slice(0, 20)
      .map((x) => ({ ...this.resumo(x.r.uid), descricao: x.r.apresentacao }))
  }

  async tendencias(janela?: Janela): Promise<Tendencia[]> {
    const ini = this.now() - janelaMs(janela)
    const mapa = new Map<string, { autores: Set<string>; usos: number }>()
    const marcar = (tag: string, autor: string) => {
      if (!this.rovers.has(autor) || this.contaDias(autor) < 1) return
      const x = mapa.get(tag) ?? { autores: new Set<string>(), usos: 0 }
      x.autores.add(autor)
      x.usos++
      mapa.set(tag, x)
    }
    for (const t of this.bdTopicos.values()) {
      const c = this.bdComunidades.get(t.comunidade)
      if (!c || c.acesso === 'fechada' || c.encerrada || t.removido || t.apagado) continue
      if (t.em >= ini) for (const tag of new Set([...t.tags, ...extrairTags(t.texto).tags])) marcar(tag, t.autor)
      for (const r of this.respostasVivas(t.id)) if (r.em >= ini) for (const tag of extrairTags(r.texto).tags) marcar(tag, r.autor)
    }
    for (const a of this.bdAtualizacoes.values()) {
      const p = this.bdPaginas.get(a.pagina)
      if (!p || p.encerrada || a.removida || a.apagada || a.em < ini) continue
      for (const tag of new Set([...a.tags, ...extrairTags(a.texto).tags])) marcar(tag, a.autor)
    }
    return [...mapa.entries()]
      .filter(([, v]) => v.autores.size >= 3)
      .map(([tag, v]) => ({ tag, autores: v.autores.size, usos: v.usos }))
      .sort((a, b) => b.autores - a.autores || b.usos - a.usos || a.tag.localeCompare(b.tag))
      .slice(0, 20)
  }

  // ---- 0.4.0: mensagens privadas. As regras e os dados moram em ./mensagens.ts, a camada de cima; aqui só o lugar no contrato. ----
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- gancho: a camada de mensagens (./mensagens.ts) sobrescreve
  async conversas(_uid: string, _opcoes?: { estado?: import('../mensagens').FiltroDeConversas; cursor?: string }): Promise<Pagina<import('../mensagens').Conversa>> {
    throw new ErroRede('versao-nao-suportada', 'este relé não tem mensagens privadas')
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- gancho: a camada de mensagens (./mensagens.ts) sobrescreve
  async conversa(_uid: string, _id: string): Promise<import('../mensagens').Conversa> {
    throw new ErroRede('versao-nao-suportada', 'este relé não tem mensagens privadas')
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- gancho: a camada de mensagens (./mensagens.ts) sobrescreve
  async mensagensDaConversa(_uid: string, _id: string, _cursor?: string): Promise<Pagina<import('../mensagens').MensagemClara>> {
    throw new ErroRede('versao-nao-suportada', 'este relé não tem mensagens privadas')
  }
}

interface DenunciaNaFilaS {
  alvo: string
  alvoTipo: string
  motivos: Partial<Record<import('../tipos').MotivoDenunciaSocial, number>>
  total: number
  primeiraEm: number
  ultimaEm: number
  quem: Set<string>
  tp: TopicoS
  autor: string
  texto: string
}
void HORA
