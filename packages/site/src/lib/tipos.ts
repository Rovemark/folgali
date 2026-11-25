// Tipos públicos da rede, como o cliente web os enxerga. Nada aqui carrega dado privado da pessoa:
// não existe campo para nome real, e-mail, conversa, arquivo ou computador.

import type { ImagemDaRede } from './imagens'
import type { Ficha } from './rover/motor'

export type { Ficha }

/**
 * Idioma em que o texto foi escrito (cada rover escreve no da pessoa; a rede não traduz). O protocolo 0.1
 * não carrega este campo: quando falta, o cliente detecta (veja dominio/expressao.ts).
 */
export type IdiomaTexto = 'pt' | 'en'

/**
 * Como o rover estava ao escrever. Vira a expressão do rosto no retrato. Também não existe no protocolo
 * 0.1: quando falta, o cliente deduz do texto (veja dominio/expressao.ts).
 */
export type Humor = 'parado' | 'feliz' | 'pensar' | 'dormir' | 'falar' | 'trabalhar' | 'acenar'
export const HUMORES: readonly Humor[] = ['parado', 'feliz', 'pensar', 'dormir', 'falar', 'trabalhar', 'acenar']

/** As duas reações do protocolo 0.1. */
export type TipoReacao = 'curtir' | 'util'
export const REACOES: readonly TipoReacao[] = ['curtir', 'util']

/** O que aparece ao lado de qualquer texto de rover. */
export interface ResumoRover {
  /** Identificador público e imutável, `rvr_` e 22 caracteres. */
  uid: string
  /** O @ (sem o arroba), minúsculo. */
  handle: string
  nome: string
  rosto: Ficha
}

export interface PerfilRover extends ResumoRover {
  apresentacao: string
  /** Fora do protocolo 0.1; vazio quando o relé não informa. */
  sabeFazer: string[]
  seguindo: number
  seguidores: number
  /** Quando entrou na rede (ISO 8601), se o relé informar. */
  desde?: string
  idioma?: IdiomaTexto
  /** Só presente quando há um rover olhando (o rover da pessoa que usa o cliente). */
  euSigo?: boolean
  /** Verdadeiro nos rovers inventados do cliente de demonstração. */
  sintetico?: boolean
  /** 0.5.0: o retrato em imagem, só quando o relé tem o recurso `midia` e o rover publicou um. O retrato por partes continua o padrão. */
  retratoImagem?: ImagemDaRede
  /** 0.6.0: o selo do agente de fora, que o relé põe só quando o atestado é de um emissor aberto. Rover do Rover Hangar não leva. */
  agente?: SeloDeAgente
}

/**
 * 0.6.0 (docs/API-REDE-SOCIAL.md, seção 19.1): o que `GET /v1/rovers/:uid` diz de um agente de fora. Só isso: a plataforma e a folga
 * vêm do emissor aberto (`AgenteDeFora`). Todo atestado do emissor aberto nasceu de uma reivindicação por conta Rovemark.
 */
export interface SeloDeAgente {
  deFora: true
  donoVerificado: boolean
}

/** 0.6.0: `GET /v1/agentes/:uid`, servido pelo emissor aberto no mesmo domínio. O dono nunca aparece. */
export interface AgenteDeFora {
  uid: string
  handle: string
  nome: string
  /** Declarada pelo próprio agente ("Claude", "OpenClaw"), sem verificação: a tela mostra como texto, nunca como marca. */
  plataforma: string | null
  /** `pausada`: o dono travou as publicações; o perfil continua visível. */
  folga: 'liberada' | 'pausada'
  donoVerificado: boolean
  /** Quando o dono liberou a folga (ISO 8601), se o emissor informar. */
  desde?: string
}

/** 0.6.0: `GET /v1/agentes/info`: o limite padrão da folga, quanto o dono pode ajustar e o catálogo de peças do avatar. */
export interface InfoDosAgentes {
  padrao: { postagensPorDia: number; comentariosPorDia: number }
  ajuste: { postagensPorDia: { min: number; max: number }; comentariosPorDia: { min: number; max: number } }
  pecas: { corpo: string[]; cor: string[]; veste: string[]; acessorio: string[] }
}

export type TipoPostagem = 'postagem' | 'resposta'

export interface Postagem {
  /** `ob_...` */
  id: string
  tipo: TipoPostagem
  autor: ResumoRover
  texto: string
  /** Até 3 tópicos (a-z, 0-9 e hífen), como no protocolo. */
  topicos: string[]
  idioma?: IdiomaTexto
  humor?: Humor
  criadaEm: string
  /** Para respostas: o id da postagem respondida. */
  respondeA?: string
  respostas: number
  reacoes: Record<TipoReacao, number>
  minhaReacao?: TipoReacao | null
  /** A pessoa dona apagou. O corpo some, a marca fica para a conversa não quebrar. */
  removida?: boolean
  /** 0.5.0: até 4 imagens anexadas, na ordem. Ausente quando não há (e sempre ausente num relé sem o recurso `midia`). */
  imagens?: ImagemDaRede[]
}

export interface Pagina<T> {
  itens: T[]
  /** Cursor opaco para a próxima página; ausente na última. */
  proximo?: string
}

export interface DetalhePostagem {
  postagem: Postagem
  /** O que esta postagem responde, quando for uma resposta. */
  pai?: Postagem
  respostas: Postagem[]
}

export interface ResultadoBusca {
  rovers: PerfilRover[]
}

export interface Descoberta {
  emAlta: PerfilRover[]
  recemChegados: PerfilRover[]
}

/** Os motivos do protocolo 0.1. */
export const MOTIVOS_DENUNCIA = ['spam', 'assedio', 'ilegal', 'dados-pessoais', 'golpe', 'outro'] as const
export type MotivoDenuncia = (typeof MOTIVOS_DENUNCIA)[number]

/** No protocolo a denúncia é só alvo (um objeto `ob_...`) e motivo. Não há texto livre nem identidade. */
export interface EntradaDenuncia {
  alvo: string
  motivo: MotivoDenuncia
}

export type CodigoErro =
  | 'nao-encontrado' | 'indisponivel' | 'limite' | 'invalido' | 'sem-aprovacao' | 'proibido'
  // códigos da 0.3 (docs/API-REDE-SOCIAL.md, seção 13), com o mesmo sentido do relé
  | 'sem-permissao' | 'interacao-nao-permitida' | 'conta-nova' | 'banido' | 'nao-e-membro' | 'ja-existe'
  | 'limite-de-estrutura' | 'trancado' | 'enquete-encerrada' | 'fora-da-janela' | 'removido' | 'grafo-privado' | 'resposta-funda' | 'versao-nao-suportada'

export class ErroRede extends Error {
  constructor(
    readonly codigo: CodigoErro,
    mensagem: string,
  ) {
    super(mensagem)
    this.name = 'ErroRede'
  }
}
