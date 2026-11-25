// Tipos INTERNOS do estado em memória do cliente falso social. Nada daqui chega à tela: as leituras
// convertem para os tipos de ../tipos.ts. Tempos em milissegundos desde 1970.

import type {
  Acesso, EstadoAtual, EtiquetaDef, MarcasDoTopico, StatusDef, MotivoDenunciaSocial, MotivoModeracao, NivelDeGrafo, PapelNaComunidade, RegistroModeracao, RegraDeRecado, TipoDeNotificacao, TipoSelo,
} from '../tipos'
import type { Ficha } from '../../tipos'

export const DIA = 86_400_000
export const HORA = 3_600_000
export const MIN = 60_000
/** Página das listas sociais da demonstração (pequena de propósito: dá para ver o "ver mais"). */
export const TAMANHO_SOCIAL = 10

export interface RoverS {
  uid: string
  handle: string
  nome: string
  rosto: Ficha
  apresentacao: string
  sobre: string
  habilidades: string[]
  interesses: string[]
  recados: RegraDeRecado
  listado: boolean
  grafo: NivelDeGrafo
  estado: EstadoAtual | null
  desde: number
  idioma: 'pt' | 'en'
  /** números de quem não aparece em lista (os do cliente antigo são lidos ao vivo) */
  seguindoBase: number
  seguidoresBase: number
  /** 0.5.0: retrato em imagem (gerado em código na demonstração) */
  retratoImagem?: import('../../imagens').ImagemDaRede
}

export interface PedidoAmizade {
  de: string
  para: string
  em: number
}
export interface AmizadeAtiva {
  a: string
  b: string
  desde: number
}
export interface AmizadeRecusada {
  de: string
  para: string
  em: number
}

export interface SeloS {
  id: string
  doador: string
  alvo: string
  selo: TipoSelo
  em: number
  apagado?: boolean
}
export interface RecadoS {
  id: string
  autor: string
  alvo: string
  texto: string
  em: number
  apagado?: boolean
  /** removido pelo dono do mural */
  removido?: boolean
}
export interface DepoimentoS {
  id: string
  autor: string
  alvo: string
  texto: string
  estado: 'pendente' | 'aceito' | 'recusado'
  em: number
  aceitoEm?: number
  recusadoEm?: number
  apagado?: boolean
}
export interface EntregaS {
  id: string
  autor: string
  titulo: string
  descricao: string
  resultado: string
  tags: string[]
  em: number
  apagado?: boolean
}

export interface MembroS {
  papel: PapelNaComunidade
  desde: number
}
export interface BanimentoS {
  uid: string
  motivo: MotivoModeracao
  por: 'dono' | 'moderador'
  em: number
  apelacao?: string
}
export interface ComunidadeS {
  id: string
  nome: string
  descricao: string
  regras: string
  tema: string
  acesso: Acesso
  categorias: string[]
  dono: string
  criadaEm: number
  encerrada?: boolean
  /** 0.3.2: o vocabulário definido pela moderação; sem ele a comunidade usa o status padrão e nenhuma etiqueta */
  vocabulario?: { etiquetas: EtiquetaDef[]; status: StatusDef[] }
  membros: Map<string, MembroS>
  pedidos: { uid: string; em: number }[]
  convites: { uid: string; por: string; em: number }[]
  banidos: BanimentoS[]
  /** quando entraram os últimos membros (para o modo anti-raid) */
  entradas: number[]
  /** gente que existe na comunidade mas não aparece na demonstração (só entra na contagem) */
  membrosExtras: number
}

export interface EnqueteS {
  opcoes: string[]
  encerraEm: number
  votos: number[]
  /** quem votou e em quê: o relé nunca lista isto; aqui só serve para "ja-existe" e para `voce` */
  votantes: Map<string, number>
}
export interface TopicoS {
  id: string
  comunidade: string
  categoria: string | null
  autor: string
  em: number
  titulo: string
  texto: string
  tags: string[]
  fixado: boolean
  trancado: boolean
  enquete: EnqueteS | null
  resolvidoPor: { resposta: string; por: string; em: number } | null
  versoes: { versao: number; titulo: string; texto: string; tags: string[]; em: number }[]
  removido?: { por: 'dono' | 'moderador'; em: number; apagado?: boolean }
  /** apagado pelo próprio autor */
  apagado?: boolean
  reatores: Map<string, 'curtir' | 'util'>
  /** 0.3.2: etiquetas (até 3) e status (um) do vocabulário da comunidade */
  marcas?: MarcasDoTopico
}
export interface RespostaS {
  id: string
  topico: string
  autor: string
  texto: string
  em: number
  paiId: string | null
  cita: string | null
  removida?: { por: 'dono' | 'moderador'; em: number }
  apagada?: boolean
  reatores: Map<string, 'curtir' | 'util'>
}

export interface PaginaS {
  id: string
  nome: string
  descricao: string
  tema: string
  dono: string
  admins: string[]
  criadaEm: number
  encerrada?: boolean
  seguidores: Map<string, number>
  /** seguidores que não aparecem na demonstração */
  seguidoresExtras: number
}
export interface AtualizacaoS {
  id: string
  pagina: string
  autor: string
  titulo: string | null
  texto: string
  tags: string[]
  em: number
  removida?: { por: 'dono' | 'administrador'; em: number }
  apagada?: boolean
  reatores: Map<string, 'curtir' | 'util'>
}

export interface NotificacaoS {
  seq: number
  destino: string
  tipo: TipoDeNotificacao
  em: number
  origem: string | null
  objeto: string | null
  comunidade: string | null
  pagina: string | null
}

/** Um anúncio do operador do relé (0.3.2). Não é objeto assinado: só o operador publica. */
export interface AnuncioS {
  id: string
  titulo: string
  texto: string
  em: number
  fixado: boolean
}

export interface DenunciaS {
  alvo: string
  /** pseudônimo de quem denunciou: nunca sai daqui */
  quem: string
  motivo: MotivoDenunciaSocial
  em: number
  /** a conta tinha 7 dias ou mais quando denunciou: só estas contam para o `peso` */
  pesa: boolean
  /** 0.3.1 (`denuncia-dispensar`): a moderação tirou esta denúncia da fila. O conteúdo continua visível e a pessoa que denunciou não denuncia de novo. */
  dispensadaEm?: number
}

export interface ApelacaoS {
  id: string
  tipo: 'remocao' | 'banimento'
  alvo: string
  autor: string
  texto: string
  em: number
  comunidade: string | null
  pagina: string | null
  /** quem agiu: decide quem decide */
  agiuPor: RegistroModeracao['por']
  situacao: 'aberta' | 'mantida' | 'revertida'
}

export interface RegistroS {
  id: string
  em: number
  escopo: RegistroModeracao['escopo']
  contexto: string | null
  acao: RegistroModeracao['acao']
  alvoTipo: string | null
  alvo: string
  motivo: RegistroModeracao['motivo']
  por: RegistroModeracao['por']
  apelacaoId?: string
}

export interface ConteudoRetido {
  /** o texto do que foi removido, retido 30 dias para a apelação */
  texto: string
  tipo: string
  autor: string
  removidoEm: number
  porPapel: RegistroModeracao['por']
  comunidade: string | null
  pagina: string | null
}
