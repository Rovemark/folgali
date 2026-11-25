// O contrato da parte social com o relé. `ClienteRede` herda daqui. Cada método de leitura corresponde
// a UMA rota de docs/API-REDE-SOCIAL.md (a seção está no comentário). Erros usam `ErroRede` com os
// códigos do protocolo (`sem-permissao`, `grafo-privado`, `removido`...): a tela decide o que mostrar.
//
// O LEITOR: no relé real, toda leitura "própria" (notificações, pedidos, relações, convites, fila de
// moderação) exige a credencial do rover da pessoa, que só o app do Rover Hangar sabe assinar. O cliente
// recebe isso como `credencial` (veja cliente-http.ts); sem ela, essas leituras viram `proibido`. No
// cliente de demonstração, a leitora é sempre a Lumi (src/lib/social/demo-ids.ts).

import type { Pagina } from '../tipos'
import type {
  AmigoItem, Atualizacao, BanidoItem, Comunidade, ComunidadeCartao, ComunidadeMinima, ConviteEnviado, ConviteRecebido, Depoimento,
  Entrega, FilaDeModeracao, InfoDoRele, Janela, ItemDaLinha, ListaDeTopicos, MembroItem, Notificacao, OrdemListada, OrdemTopicos, PaginaCartao, PaginaDoRover,
  PaginaProjeto, PedidoDeEntrada, PedidosDeAmizade, RecemChegado, Recado, RegistroModeracao, RelacaoItem, RespostaForum, ResultadoBuscaSocial,
  RoverBuscado, Tendencia, TipoDeBusca, TipoDeEmAlta, TipoDeSugestao, Topico, VersaoDoTopico, Acesso, MotivoModeracao, EstadoRover, TipoSelo, ResumoRover,
  DepoimentoEnviado, Removido, TemaDePagina, Anuncio, InicioDoRele, OrdemBusca, OrdemRespostas,
} from './tipos'
import type { Conversa, FiltroDeConversas, MensagemClara } from './mensagens'

/** Os nomes de recurso das revisões 0.3.1 (15.1) e 0.3.2 (16.1) de docs/API-REDE-SOCIAL.md. Relé 0.3 não declara nenhum. */
export type RecursoDoRele =
  | 'voce-datas' | 'avisos-com-nomes' | 'depoimentos-enviados' | 'removidos' | 'fila-com-topico' | 'denuncia-dispensar' | 'reacoes-do-topico'
  | 'topicos-sem-categoria' | 'respostas-recentes' | 'lista-completa' | 'temas-de-paginas' | 'pessoas-em-alta' | 'postagem-detalhe'
  // 0.3.2 (docs/API-REDE-SOCIAL.md, 16.1)
  | 'inicio' | 'ordem-por-pessoas' | 'vocabulario' | 'anuncios'
  // 0.4.0 (docs/API-REDE-SOCIAL.md, 17.1): mensagens privadas, só quando o operador liga o recurso
  | 'mensagens'

export interface ClienteSocial {
  /** GET /v1/info (7.7): `social` falso esconde as telas sociais. */
  info(): Promise<InfoDoRele>
  /**
   * O relé declara este recurso da 0.3.1 em `/v1/info`? Falha ao ler o `info` vale "não": a tela cai no que a 0.3 já fazia
   * em vez de quebrar. O cliente de demonstração declara todos, para mostrar as telas.
   */
  suporta(recurso: RecursoDoRele): Promise<boolean>

  // ---- página do rover (7.1) ----
  /** GET /v1/rovers/:uid/pagina */
  paginaDoRover(ref: string): Promise<PaginaDoRover>
  /** GET /v1/rovers/:uid/recados */
  recados(uid: string, cursor?: string): Promise<Pagina<Recado>>
  /** GET /v1/rovers/:uid/depoimentos?estado= (`pendentes` só para o próprio rover) */
  depoimentos(uid: string, opcoes?: { estado?: 'aceitos' | 'pendentes'; cursor?: string }): Promise<Pagina<Depoimento>>
  /** GET /v1/rovers/:uid/depoimentos?estado=enviados (0.3.1 `depoimentos-enviados`; só o próprio rover) */
  depoimentosEnviados(uid: string, cursor?: string): Promise<Pagina<DepoimentoEnviado>>
  /** GET /v1/rovers/:uid/removidos (0.3.1 `removidos`; só o próprio rover): o que a moderação escondeu do rover. */
  removidos(uid: string, cursor?: string): Promise<Pagina<Removido>>
  /** GET /v1/rovers/:uid/entregas */
  entregas(uid: string, cursor?: string): Promise<Pagina<Entrega>>
  /** GET /v1/rovers/:uid/amigos (403 `grafo-privado` quando fechado) */
  amigos(uid: string, cursor?: string): Promise<Pagina<AmigoItem>>
  /** GET /v1/rovers/:uid/amigos-em-comum?com= */
  amigosEmComum(uid: string, com: string, cursor?: string): Promise<Pagina<ResumoRover>>
  /** GET /v1/rovers/:uid/comunidades */
  comunidadesDoRover(uid: string, cursor?: string): Promise<Pagina<{ comunidade: ComunidadeCartao; papel: 'dono' | 'moderador' | 'membro' }>>
  /** GET /v1/rovers/:uid/paginas */
  paginasDoRover(uid: string, cursor?: string): Promise<Pagina<{ pagina: PaginaCartao; relacao: 'dono' | 'administrador' | 'seguidor' }>>
  /** GET /v1/rovers/:uid/amizades/pendentes (própria) */
  amizadesPendentes(uid: string): Promise<PedidosDeAmizade>
  /** GET /v1/rovers/:uid/convites (própria) */
  convites(uid: string): Promise<ConviteRecebido[]>
  /** GET /v1/rovers/:uid/relacoes (própria) */
  relacoes(uid: string, cursor?: string): Promise<Pagina<RelacaoItem>>
  /** GET /v1/rovers/:uid/notificacoes (própria) */
  notificacoes(uid: string, cursor?: string): Promise<Pagina<Notificacao>>
  /** GET /v1/rovers/:uid/notificacoes/contagem?desde= (própria) */
  contagemDeNotificacoes(uid: string, desde?: number): Promise<number>

  // ---- comunidades (7.2) ----
  /** GET /v1/comunidades */
  comunidades(opcoes?: { tema?: string; acesso?: Exclude<Acesso, 'fechada'>; ordem?: OrdemListada; cursor?: string }): Promise<Pagina<ComunidadeCartao>>
  /** GET /v1/comunidades/:id. Para o convidado de uma fechada devolve só o cartão mínimo. */
  comunidade(id: string): Promise<Comunidade | ComunidadeMinima>
  /** GET /v1/comunidades/:id/membros */
  membros(id: string, cursor?: string): Promise<Pagina<MembroItem>>
  /** GET /v1/comunidades/:id/pedidos (moderador) */
  pedidosDeEntrada(id: string): Promise<Pagina<PedidoDeEntrada>>
  /** GET /v1/comunidades/:id/convites (moderador) */
  convitesDaComunidade(id: string): Promise<Pagina<ConviteEnviado>>
  /** GET /v1/comunidades/:id/banidos (moderador) */
  banidos(id: string): Promise<Pagina<BanidoItem>>
  /** GET /v1/comunidades/:id/topicos */
  topicos(
    id: string,
    opcoes?: {
      categoria?: string; tag?: string; ordem?: OrdemTopicos; cursor?: string
      /** 0.3.2: `em-alta` olha só esta janela (padrão do relé: 24h) */
      janela?: Janela
      /** 0.3.2 (`vocabulario`): filtra por uma chave de status ou de etiqueta da comunidade */
      status?: string; etiqueta?: string
    },
  ): Promise<ListaDeTopicos>
  /** GET /v1/comunidades/:id/moderacao/fila (moderador) */
  filaDeModeracao(id: string): Promise<FilaDeModeracao>
  /** GET /v1/comunidades/:id/moderacao/registro */
  registroDaComunidade(id: string, cursor?: string): Promise<Pagina<RegistroModeracao>>

  // ---- fórum (7.3) ----
  /** GET /v1/topicos/:id (410 `removido` quando escondido) */
  topico(id: string): Promise<Topico>
  /** GET /v1/topicos/:id/respostas?em= (ordem crescente; 0.3.2: `ordem=melhores|em-alta` por pessoas distintas) */
  respostas(topico: string, opcoes?: { em?: string; cursor?: string; ordem?: OrdemRespostas; janela?: Janela }): Promise<Pagina<RespostaForum>>
  /**
   * O id do TÓPICO a que um objeto do fórum pertence (um tópico responde o próprio id; uma resposta, o do tópico dela).
   * Existe porque o aviso de resposta, citação e menção aponta para o id da RESPOSTA. GET /v1/objetos/:id.
   */
  topicoDeObjeto(id: string): Promise<string>
  /** GET /v1/topicos/:id/historico */
  historico(topico: string): Promise<VersaoDoTopico[]>

  // ---- páginas (7.4) ----
  /** GET /v1/paginas */
  paginas(opcoes?: { tema?: string; ordem?: OrdemListada; cursor?: string }): Promise<Pagina<PaginaCartao>>
  /** GET /v1/paginas/temas (0.3.1 `temas-de-paginas`): os temas de páginas abertas, do mais usado para o menos. */
  temasDePaginas(): Promise<TemaDePagina[]>
  /** GET /v1/paginas/:id */
  pagina(id: string): Promise<PaginaProjeto>
  /** GET /v1/paginas/:id/atualizacoes */
  atualizacoes(id: string, cursor?: string): Promise<Pagina<Atualizacao>>
  /** GET /v1/paginas/:id/seguidores */
  seguidoresDaPagina(id: string, cursor?: string): Promise<Pagina<ResumoRover>>
  /** GET /v1/linha/inicio?tipos=postagem,pagina-publicar */
  linhaMista(cursor?: string): Promise<Pagina<ItemDaLinha>>

  // ---- busca e descoberta (7.5) ----
  /** GET /v1/busca?q=&tipo=todos (até 5 de cada) */
  buscarTudo(q: string): Promise<ResultadoBuscaSocial>
  /** GET /v1/busca?q=&tipo= (paginada) */
  buscarTipo(q: string, tipo: 'rovers', cursor?: string): Promise<Pagina<RoverBuscado>>
  buscarTipo(q: string, tipo: 'comunidades', cursor?: string): Promise<Pagina<ComunidadeCartao>>
  buscarTipo(q: string, tipo: 'topicos', cursor?: string, opcoes?: { ordem?: OrdemBusca; janela?: Janela }): Promise<Pagina<import('./tipos').TopicoCartao>>
  buscarTipo(q: string, tipo: 'paginas', cursor?: string): Promise<Pagina<PaginaCartao>>
  buscarTipo(q: string, tipo: TipoDeBusca, cursor?: string): Promise<Pagina<unknown>>
  /** GET /v1/descobrir/em-alta?tipo=&janela= */
  emAlta(tipo: 'topicos', janela?: Janela): Promise<import('./tipos').TopicoCartao[]>
  emAlta(tipo: 'comunidades', janela?: Janela): Promise<ComunidadeCartao[]>
  emAlta(tipo: 'paginas', janela?: Janela): Promise<PaginaCartao[]>
  emAlta(tipo: TipoDeEmAlta, janela?: Janela): Promise<unknown[]>
  /** GET /v1/descobrir/recem-chegados */
  recemChegadosSociais(limite?: number): Promise<RecemChegado[]>
  /** GET /v1/descobrir/sugestoes (só do declarado: o relé não sabe o que a pessoa leu) */
  sugestoes(tipo: 'comunidades', interesses?: string[]): Promise<ComunidadeCartao[]>
  sugestoes(tipo: 'paginas', interesses?: string[]): Promise<PaginaCartao[]>
  sugestoes(tipo: 'rovers', interesses?: string[]): Promise<RoverBuscado[]>
  sugestoes(tipo: TipoDeSugestao, interesses?: string[]): Promise<unknown[]>
  /** GET /v1/descobrir/tendencias */
  tendencias(janela?: Janela): Promise<Tendencia[]>
  /** GET /v1/moderacao/registro (do relé) */
  registroDoRele(cursor?: string): Promise<Pagina<RegistroModeracao>>

  // ---- 0.3.2 ----
  /** GET /v1/anuncios (`anuncios`): os anúncios do operador do relé, fixados primeiro. Sem o recurso (relé 0.3 e 0.3.1) vem vazio e a rota nem é chamada. */
  anuncios(cursor?: string): Promise<Pagina<Anuncio>>
  /**
   * GET /v1/inicio?desde= (`inicio`, rota própria): contagens e ids do que mudou para o rover da pessoa. `null` quando o relé não declara o
   * recurso ou o leitor não tem credencial. Nunca traz texto de ninguém.
   */
  inicio(desde?: number): Promise<InicioDoRele | null>

  // ---- 0.4.0: mensagens privadas (docs/API-REDE-SOCIAL.md, 17.3; rotas próprias) ----
  // O texto chega em claro porque quem decifra é o app da pessoa. Sem o recurso `mensagens` (ou sem o app), estas leituras
  // lançam `versao-nao-suportada` e a tela explica.
  /** GET /v1/rovers/:uid/conversas?estado= */
  conversas(uid: string, opcoes?: { estado?: FiltroDeConversas; cursor?: string }): Promise<Pagina<Conversa>>
  /** GET /v1/rovers/:uid/conversas/:id (`nao-encontrado` quando o leitor não é um dos lados) */
  conversa(uid: string, id: string): Promise<Conversa>
  /** GET /v1/rovers/:uid/conversas/:id/mensagens, já decifradas pelo app, da mais antiga para a mais nova */
  mensagensDaConversa(uid: string, id: string, cursor?: string): Promise<Pagina<MensagemClara>>
}

// ---- escrita (passa sempre pela ponte do app, onde mora a chave e a aprovação) ----------------------

/** Gestos livres: a pessoa toca e sai (com selo de toque), salvo se ela exigiu aprovação para o tipo. */
export type AtoSocial =
  | { tipo: 'estado'; estado: EstadoRover }
  | { tipo: 'amizade'; alvo: string; acao: 'pedir' | 'aceitar' | 'recusar' | 'desfazer' }
  | { tipo: 'relacao'; alvo: string; acao: 'bloquear' | 'desbloquear' | 'silenciar' | 'dessilenciar' }
  | { tipo: 'selo'; alvo: string; selo: TipoSelo }
  | { tipo: 'depoimento-decisao'; depoimento: string; decisao: 'aceitar' | 'recusar' }
  | { tipo: 'comunidade-adesao'; comunidade: string; acao: 'entrar' | 'sair' | 'aceitar-convite' | 'recusar-convite' | 'cancelar-pedido' }
  | {
      tipo: 'comunidade-gestao'
      comunidade: string
      alvo: string
      acao: 'convidar' | 'cancelar-convite' | 'aprovar-pedido' | 'recusar-pedido' | 'expulsar' | 'banir' | 'desbanir' | 'promover' | 'rebaixar'
      /** obrigatório em expulsar e banir; nulo nas demais */
      motivo: MotivoModeracao | null
    }
  | { tipo: 'topico-gestao'; topico: string; acao: 'fixar' | 'desafixar' | 'trancar' | 'destrancar' | 'mover'; comunidade: string | null; categoria: string | null }
  | { tipo: 'topico-resolvido'; topico: string; resposta: string | null }
  | { tipo: 'voto'; topico: string; opcao: number }
  | { tipo: 'pagina-seguir'; pagina: string; acao: 'seguir' | 'deixar' }
  | { tipo: 'pagina-gestao'; pagina: string; alvo: string; acao: 'adicionar-admin' | 'remover-admin' }
  | { tipo: 'remocao-por-responsavel'; alvo: string; motivo: MotivoModeracao }
  | { tipo: 'remocao-pelo-autor'; alvo: string }
  | { tipo: 'apelacao-decisao'; apelacao: string; resultado: 'mantida' | 'revertida' }
  | { tipo: 'denuncia'; alvo: string; motivo: import('./tipos').MotivoDenunciaSocial }
  /** 0.3.1 (`denuncia-dispensar`): a moderação conclui que não há o que fazer. Só tira a denúncia da fila; o conteúdo continua visível. */
  | { tipo: 'denuncia-dispensar'; comunidade: string; alvo: string }
  /**
   * 0.4.0: a decisão sobre um pedido de conversa. EXIGE aprovação da pessoa (o toque dela, com confirmação, é a aprovação no app):
   * aceitar e recusar só por quem recebeu; encerrar pelos dois lados (no pendente, só quem pediu: é cancelar).
   */
  | { tipo: 'conversa-decidir'; conversa: string; decisao: 'aceitar' | 'recusar' | 'encerrar' }
  /** 0.4.0: apaga a cópia DESTE lado de uma mensagem, ou de todas (`mensagem: null`). Livre. */
  | { tipo: 'conversa-apagar'; conversa: string; mensagem: string | null }
  /** 0.4.0: o destinatário denuncia revelando ao operador o texto e a assinatura da carta (quem revela é o app). Livre. */
  | { tipo: 'mensagem-denuncia'; mensagem: string; motivo: import('./tipos').MotivoDenunciaSocial }

export type TipoDeAto = AtoSocial['tipo']

/** O que o relé devolve em `resultado` quando o efeito não é óbvio (seção 1.3). */
export type ResultadoDeAto = { resultado?: 'pendente' | 'ativa' | 'nenhuma' | 'membro' | 'fora' | 'aceito' | 'recusado' | 'recusada' | 'encerrada' }
