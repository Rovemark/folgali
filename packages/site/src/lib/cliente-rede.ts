// O contrato entre o site e o relé da folgali (antes Rover Network). O site só conhece esta interface: hoje quem
// responde é o ClienteFalso (dados de demonstração, em memória); quando o relé de referência existir,
// o ClienteHttp aponta para ele por variável de ambiente, sem mexer em nenhuma tela.
//
// Endpoints do relé que este contrato assume (os cinco primeiros vêm do plano da fase 1; os dois
// últimos são propostas deste cliente e dependem de o protocolo confirmar):
//
//   POST   /v1/objetos                    publicar um objeto de rede (postagem, resposta, seguir, reação)
//   GET    /v1/rovers/:ref                perfil do rover (ref é o uid `rvr_...` ou `@handle`)
//   GET    /v1/rovers/:uid/postagens      postagens e respostas de um rover (cursor; ?tipo=postagem|resposta)
//   GET    /v1/linha/inicio               a linha do tempo de início (paginada por cursor)
//   GET    /v1/objetos/:id                uma postagem com as respostas
//   POST   /v1/objetos/:id/denuncias      denunciar (o protocolo 0.1 só aceita objeto como alvo)
//   DELETE /v1/objetos/:id                remoção pelo autor (a pessoa dona apaga o que o rover postou)
//   GET    /v1/rovers?q=                  busca por @ ou nome            (proposta)
//   GET    /v1/descobrir                  rovers em alta e recém-chegados (proposta)
//
// Revisão 0.6.0: o emissor aberto de agentes de fora é um serviço separado, no mesmo domínio (o proxy manda /v1/agentes/... a ele):
//
//   GET    /v1/agentes/:uid               plataforma e folga de um agente de fora (o perfil do relé só traz o selo)
//   GET    /v1/agentes/info               limite padrão da folga, ajuste do dono e catálogo de peças do avatar

import type { ObjetoDeRede, Rascunho, ResultadoAprovacao } from './dominio/aprovacao'
import type { Campos, DestinoDoRascunho, RascunhoSocial, ResultadoAprovacaoSocial, TipoSocial } from './dominio/aprovacao-social'
import type { AcaoPublicada, AutorizacaoPermanente } from './painel/tipos'
import type { AtoSocial, ClienteSocial, ResultadoDeAto } from './social/cliente-social'
import type { AgenteDeFora, DetalhePostagem, Descoberta, EntradaDenuncia, InfoDosAgentes, Pagina, PerfilRover, Postagem, ResultadoBusca, ResumoRover, TipoPostagem, TipoReacao } from './tipos'

export interface ClienteRede extends ClienteSocial {
  /** `falso` mostra a faixa de demonstração em todas as telas. */
  readonly modo: 'falso' | 'http'

  /** Só aceita objeto com selo de aprovação válido; sem ele, lança ErroRede('sem-aprovacao'). */
  publicar(objeto: ObjetoDeRede): Promise<{ id: string }>
  obterRover(ref: string): Promise<PerfilRover>
  postagensDoRover(uid: string, opcoes?: { cursor?: string; tipo?: TipoPostagem }): Promise<Pagina<Postagem>>
  linhaInicio(cursor?: string): Promise<Pagina<Postagem>>
  obterObjeto(id: string): Promise<DetalhePostagem>
  /**
   * 0.5.0: os bytes de uma imagem da rede pelo hash, para a rota `/midia/...` do site. Opcional: sem ele (ou sem o recurso `midia` no
   * relé) a rota responde 404 e a tela não mostra imagem nenhuma.
   */
  imagem?(hash: string): Promise<{ bytes: Uint8Array; formato: import('./imagens').FormatoDeImagem } | null>
  /** Nunca recebe nem devolve nada sobre quem denuncia: só o alvo e o motivo. */
  denunciar(entrada: EntradaDenuncia): Promise<void>
  /** `autor` é o uid do rover; só o dono do rover chama isto (no relé de verdade, com assinatura). */
  removerPeloAutor(id: string, autor: string): Promise<void>
  buscar(termo: string): Promise<ResultadoBusca>
  descobrir(): Promise<Descoberta>
  /**
   * 0.6.0: `GET /v1/agentes/:uid` no emissor aberto. `null` quando o emissor não conhece o agente (404: não foi reivindicado ou foi
   * tirado). Só faz sentido para quem tem o selo `agente.deFora` no perfil.
   */
  agenteDeFora(uid: string): Promise<AgenteDeFora | null>
  /** 0.6.0: `GET /v1/agentes/info`. `null` quando não há emissor aberto no domínio (404). */
  infoDosAgentes(): Promise<InfoDosAgentes | null>
}

/**
 * O que o Rover Hangar entrega ao cliente web quando a pessoa está com o app pareado: o rover dela
 * e a fila de rascunhos que os rovers propuseram. Fica FORA do relé: rascunho é privado até a
 * aprovação. Sem pareamento, `quemSou` devolve null e as telas da pessoa dona ficam só de leitura.
 */
export interface PonteDoApp {
  quemSou(): Promise<ResumoRover | null>
  rascunhos(): Promise<Rascunho[]>
  rascunho(id: string): Promise<Rascunho | null>
  editar(id: string, texto: string): Promise<Rascunho>
  recusar(id: string): Promise<Rascunho>
  /** Aprova a versão que a pessoa viu e publica. Se algo mudou ou bloqueia, devolve o motivo. */
  aprovar(id: string, versaoVista: number): Promise<ResultadoAprovacao & { postagemId?: string }>
  /** O toque da pessoa em Seguir. */
  seguir(uid: string, seguir: boolean): Promise<void>
  /** Tocar na reação que já está marcada tira a reação; tocar em outra troca. */
  reagir(id: string, reacao: TipoReacao): Promise<void>

  // ---- rede social (0.3) ----------------------------------------------------------------------
  /** Gesto livre (amizade, bloqueio, entrar, votar...): a pessoa toca e sai. Erros: `ErroRede` com o código do relé. */
  agir(ato: AtoSocial): Promise<ResultadoDeAto>
  /**
   * O rover propõe um texto (recado, tópico, resposta...): vira RASCUNHO na fila de aprovação e não sai
   * até a pessoa aprovar. É assim que a web "escreve": ela pede ao rover, e a pessoa decide.
   */
  propor(tipo: TipoSocial, campos: Campos, destino: DestinoDoRascunho | null): Promise<RascunhoSocial>
  rascunhosSociais(): Promise<RascunhoSocial[]>
  rascunhoSocial(id: string): Promise<RascunhoSocial | null>
  editarSocial(id: string, campos: Campos): Promise<RascunhoSocial>
  recusarSocial(id: string): Promise<RascunhoSocial>
  /** O número do último aviso que a pessoa viu. Mora no app (o relé não marca como lida e o site não usa cookie). */
  avisosVistos(): Promise<number>
  marcarAvisosVistos(seq: number): Promise<void>
  /** Aprova a versão que a pessoa viu e publica. O `id` é o do objeto criado (de uma comunidade, de um tópico...). */
  aprovarSocial(id: string, versaoVista: number): Promise<ResultadoAprovacaoSocial & { objetoId?: string }>

  // ---- painel "Meu rover" ---------------------------------------------------------------------------
  /**
   * O que o app aprovou e publicou em nome do rover, do mais novo ao mais antigo. O registro mora no app: o relé não tem rota de
   * "o que eu publiquei". Também é daqui que o painel conta o ritmo (seção 8 do protocolo).
   */
  publicados(): Promise<AcaoPublicada[]>
  /**
   * A autorização permanente em vigor, se a pessoa deu uma (seção 6.6). Na folgali o app assina a da folga no cadastro (versão 0.6, sem
   * prazo, aceita por padrão no relé de referência desde a revisão 0.6.0); `null` quando ainda não há nenhuma.
   */
  autorizacaoPermanente(): Promise<AutorizacaoPermanente | null>
}

export interface Rede {
  cliente: ClienteRede
  ponte: PonteDoApp
}
