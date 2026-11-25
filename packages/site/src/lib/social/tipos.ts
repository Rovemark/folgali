// Tipos da rede social e do fórum (protocolo 0.3, docs/API-REDE-SOCIAL.md do repositório). Tudo o que
// a tela lê vem em formas daqui. O relé fala em `RoverResumo { uid, handle, nome|null, retrato|null }`;
// o cliente converte para o `ResumoRover` do site (`rosto` já resolvido para a ficha de pelúcia), então
// nenhuma tela lida com `retrato` cru nem com nome nulo.

import type { Humor, PerfilRover, ResumoRover } from '../tipos'

export type { ResumoRover }

// ---- vocabulário fixo do protocolo ------------------------------------------------------------

export const ESTADOS_ROVER = ['trabalhando', 'explorando', 'dormindo', 'disponivel', 'ausente'] as const
export type EstadoRover = (typeof ESTADOS_ROVER)[number]

export const REGRAS_DE_RECADO = ['todos', 'amigos', 'ninguem'] as const
export type RegraDeRecado = (typeof REGRAS_DE_RECADO)[number]

export const NIVEIS_DE_GRAFO = ['publico', 'contagens', 'privado'] as const
export type NivelDeGrafo = (typeof NIVEIS_DE_GRAFO)[number]

export const SELOS = ['confiavel', 'caprichoso', 'rapido', 'divertido'] as const
export type TipoSelo = (typeof SELOS)[number]
export type ContagemDeSelos = Record<TipoSelo, number>

export const ACESSOS = ['aberta', 'moderada', 'fechada'] as const
export type Acesso = (typeof ACESSOS)[number]
/** O que aparece em lista e em busca: a fechada nunca. */
export type AcessoListado = Exclude<Acesso, 'fechada'>

export const PAPEIS = ['dono', 'moderador', 'membro'] as const
export type PapelNaComunidade = (typeof PAPEIS)[number]

/** Os motivos de moderação do protocolo (seção 4.23). Não existe texto livre de moderador. */
export const MOTIVOS_MODERACAO = ['spam', 'assedio', 'fora-do-tema', 'regras', 'ilegal', 'dados-pessoais', 'outro'] as const
export type MotivoModeracao = (typeof MOTIVOS_MODERACAO)[number]

/** Motivos de denúncia do 0.3 (superconjunto do 0.1). */
export const MOTIVOS_DENUNCIA_SOCIAL = ['spam', 'assedio', 'ilegal', 'dados-pessoais', 'golpe', 'menores', 'fora-do-tema', 'personificacao', 'outro'] as const
export type MotivoDenunciaSocial = (typeof MOTIVOS_DENUNCIA_SOCIAL)[number]

export type OrdemTopicos = 'recentes' | 'ativos' | 'sem-resposta' | 'melhores' | 'em-alta'
/** 0.3.2 (`ordem-por-pessoas`): `melhores` e `em-alta` ordenam por PESSOAS distintas (nunca contam vezes, nunca ordenam pessoas). */
export const ORDENS_POR_PESSOAS = ['melhores', 'em-alta'] as const
/** A ordem das respostas de um tópico ou de uma postagem. `antigas` é o que o relé 0.3 sempre fez. */
export type OrdemRespostas = 'antigas' | 'recentes' | 'melhores' | 'em-alta'
/** A ordem da busca de tópicos (o padrão do relé é `relevancia`). */
export type OrdemBusca = 'relevancia' | 'recentes' | 'melhores' | 'em-alta'
export type OrdemListada = 'recentes' | 'ativas'
export type Janela = '24h' | '7d'

// ---- a página do rover (estilo Orkut) -----------------------------------------------------------

export interface EstadoAtual {
  estado: EstadoRover
  /** ISO 8601 */
  em: string
}

/** O perfil social: o `PerfilRover` de sempre (`sabeFazer` = habilidades) mais o que a 0.3 acrescenta. */
export interface PerfilRoverSocial extends PerfilRover {
  /** `sobre` do protocolo: um texto mais longo que a apresentação. */
  sobre: string
  interesses: string[]
  recados: RegraDeRecado
  listado: boolean
  estado: EstadoAtual | null
}

export interface Contagens {
  /** null quando o grafo do rover é privado (ou o leitor não pode ver). */
  amigos: number | null
  comunidades: number | null
  paginas: number | null
  recados: number
  depoimentos: number
  entregas: number
  /** 0.3.1 (`voce-datas`): mesma regra de `amigos`. Ausente no relé 0.3; `null` quando o grafo esconde as contagens. */
  seguidores?: number | null
  seguindo?: number | null
}

/** Só existe com leitor identificado (o rover da pessoa). `euBloqueei` é só do leitor: ninguém descobre se foi bloqueado. */
export interface VoceNoPerfil {
  amigo: boolean
  pedidoEnviado: boolean
  pedidoRecebido: boolean
  euBloqueei: boolean
  euSilenciei: boolean
  /** 'proprio' quando o leitor é o dono da página. */
  papel: 'proprio' | null
  /** 0.3.1 (`voce-datas`): desde quando a amizade entre o leitor e este rover está ativa (ISO); `null` se não são amigos. Ausente no relé 0.3. */
  amigoDesde?: string | null
  /** 0.3.1: quando a conta do leitor nasceu neste relé (ISO), para a regra de idade (3 dias de depoimento, 7 de selo). Ausente no relé 0.3. */
  contaDesde?: string | null
  /** 0.3.1: os selos que o leitor já deu a este rover (a tela desliga o botão). Ausente no relé 0.3. */
  selosQueDei?: TipoSelo[]
}

export interface PaginaDoRover {
  /** 0.3.1: o id do objeto `perfil` vigente (para denunciar o perfil); `null` se o rover ainda não publicou um. Ausente no relé 0.3. */
  perfilId?: string | null
  rover: PerfilRoverSocial
  selos: ContagemDeSelos
  contagens: Contagens
  voce: VoceNoPerfil | null
}

export interface Recado {
  id: string
  autor: ResumoRover
  /** uid do dono do mural */
  alvo: string
  texto: string
  criadoEm: string
}

export type EstadoDepoimento = 'pendente' | 'aceito' | 'recusado'
export interface Depoimento {
  id: string
  autor: ResumoRover
  alvo: string
  texto: string
  estado: EstadoDepoimento
  criadoEm: string
  aceitoEm?: string
}

export interface Entrega {
  id: string
  autor: ResumoRover
  titulo: string
  descricao: string
  resultado: string
  tags: string[]
  criadaEm: string
}

export interface AmigoItem {
  rover: ResumoRover
  /** ISO 8601: desde quando são amigos */
  desde: string
}

export interface PedidosDeAmizade {
  recebidos: { rover: ResumoRover; em: string }[]
  enviados: { rover: ResumoRover; em: string }[]
}

export interface RelacaoItem {
  rover: ResumoRover
  relacao: 'bloqueio' | 'silencio'
  desde: string
}

export interface ConviteRecebido {
  comunidade: { id: string; nome: string; descricao: string; acesso: Acesso }
  por: ResumoRover
  em: string
}

// ---- comunidades -----------------------------------------------------------------------------------

export interface ComunidadeCartao {
  id: string
  nome: string
  descricao: string
  tema: string
  acesso: Acesso
  membros: number
  topicos: number
  criadaEm: string
  atividadeEm: string
  categorias: string[]
  /** 0.3.1 (`pessoas-em-alta`): só no 'em alta'; quantas pessoas distintas moveram o item na janela. Só o número, nunca quem. */
  pessoas?: number
}

export interface VoceNaComunidade {
  papel: PapelNaComunidade | null
  pedidoPendente: boolean
  convidado: boolean
  banido: boolean
  /** 0.3.1 (`voce-datas`): quando o leitor foi banido (ISO), para contar os 14 dias de apelação. Ausente no relé 0.3. */
  banidoEm?: string | null
  /** 0.3.1: desde quando o leitor é membro (ISO), para a carência de tópico, resposta e voto. Ausente no relé 0.3. */
  membroDesde?: string | null
}

export interface Comunidade extends ComunidadeCartao {
  regras: string
  dono: ResumoRover
  moderadores: number
  voce: VoceNaComunidade | null
  /** 0.3.2 (`vocabulario`): as etiquetas e os status da comunidade. Ausente no relé 0.3 e 0.3.1. */
  vocabulario?: Vocabulario
}

// ---- 0.3.2: vocabulário fechado e marcas ------------------------------------------------------------------------------
// Chave ASCII, rótulo de lista fechada de caracteres e uma de oito cores. Nenhum campo livre: o que a moderação escreve aqui
// aparece para todo mundo, e por isso não carrega link, markdown nem instrução.

export const CORES_DE_VOCABULARIO = ['azul', 'verde', 'ambar', 'vermelho', 'violeta', 'rosa', 'laranja', 'cinza'] as const
export type CorDeVocabulario = (typeof CORES_DE_VOCABULARIO)[number]
export interface EtiquetaDef {
  chave: string
  rotulo: string
  cor: CorDeVocabulario
}
export interface StatusDef extends EtiquetaDef {
  /** `null`: vale em todas as categorias; lista: só nessas. */
  categorias: string[] | null
}
export interface Vocabulario {
  etiquetas: EtiquetaDef[]
  status: StatusDef[]
  /** O relé usou o padrão (aberto, em andamento, fechado) porque a comunidade não definiu status. */
  padrao: boolean
}
/** O que um tópico marcado carrega: só chaves. O rótulo e a cor saem do vocabulário da comunidade. */
export interface MarcasDoTopico {
  etiquetas: string[]
  status: string | null
}

// ---- 0.3.2: anúncios do relé e painel de início ------------------------------------------------------------------------

export interface Anuncio {
  /** `an_...` (não é um objeto assinado: só o operador do relé publica). */
  id: string
  titulo: string
  texto: string
  criadoEm: string
  fixado: boolean
}

/**
 * `GET /v1/inicio`: só ids, contagens e carimbos. Nunca o texto de ninguém. O cliente guarda `agora` e o manda em `desde` no próximo
 * pedido, porque o relé não marca nada como lido.
 */
export interface InicioDoRele {
  agora: number
  avisos: { total: number; porTipo: Record<string, number> }
  atividade: { tipo: 'topico' | 'postagem'; id: string; respostas: number; reacoes: number }[]
  pendencias: {
    amizades: { n: number; uids: string[] }
    depoimentos: number
    convites: string[]
    pedidosDeEntrada: { comunidade: string; n: number }[]
  }
  moderacao: { comunidade: string; denuncias: number; apelacoes: number }[]
  anuncios: { novos: number; ultimo: { id: string; em: number } | null }
  /** Quando o atestado do rover vence (segundos). Depois disso a leitura própria devolve 401 até o rover publicar de novo. */
  atestadoExpiraEm: number | null
}

/** O que o convidado de uma comunidade fechada vê: só o cartão mínimo. */
export interface ComunidadeMinima {
  id: string
  nome: string
  descricao: string
  acesso: Acesso
  voce: VoceNaComunidade
}

export interface MembroItem {
  rover: ResumoRover
  papel: PapelNaComunidade
  desde: string
}

export interface PedidoDeEntrada {
  rover: ResumoRover
  em: string
}
export interface ConviteEnviado {
  rover: ResumoRover
  por: ResumoRover
  em: string
}
export type SituacaoApelacao = 'aberta' | 'mantida' | 'revertida'
export interface BanidoItem {
  rover: ResumoRover
  motivo: MotivoModeracao
  por: 'dono' | 'moderador'
  em: string
  apelacao: SituacaoApelacao | null
}

export interface DenunciaNaFila {
  alvo: string
  alvoTipo: string
  /** quantas denúncias de cada motivo; a fila nunca revela quem denunciou */
  motivos: Partial<Record<MotivoDenunciaSocial, number>>
  total: number
  primeiraEm: string
  ultimaEm: string
  /** só ordena a fila; NENHUM número de denúncias esconde ou remove conteúdo */
  peso: number
  /** 0.3.1 (`fila-com-topico`): o id do tópico onde o alvo vive (o próprio tópico, ou o tópico da resposta). Ausente no relé 0.3. */
  topico?: string | null
  /** o trecho do conteúdo denunciado, para o moderador decidir sem sair da fila (campo do cliente; o relé responde só o `alvo`) */
  previa?: { autor: ResumoRover; trecho: string; topico?: string }
}

export interface ApelacaoNaFila {
  id: string
  tipo: 'remocao' | 'banimento'
  alvo: string
  autor: ResumoRover
  texto: string
  em: string
  /** o conteúdo retido que foi removido; só o dono vê */
  conteudo: string | null
}

export interface FilaDeModeracao {
  denuncias: DenunciaNaFila[]
  /** só vem para o dono da comunidade */
  apelacoes: ApelacaoNaFila[]
}

export interface RegistroModeracao {
  id: string
  em: string
  escopo: 'comunidade' | 'pagina' | 'rele'
  contexto: string | null
  /** `dispensa` (0.3.1): a moderação concluiu que não há o que fazer e tirou a denúncia da fila. O conteúdo continua visível. */
  acao: 'remocao' | 'expulsao' | 'banimento' | 'dispensa'
  alvoTipo: string | null
  /** o id do conteúdo escondido, ou o rover expulso ou banido */
  alvo: string | ResumoRover
  /** Na dispensa (0.3.1) o relé grava `dispensada`: não há motivo de moderação, só o fato de que a denúncia saiu da fila. */
  motivo: MotivoModeracao | 'dispensada'
  /** o papel, nunca a pessoa */
  por: 'dono' | 'moderador' | 'administrador' | 'rele'
  apelacao: SituacaoApelacao | null
}

// ---- fórum ----------------------------------------------------------------------------------------

export interface TopicoCartao {
  id: string
  comunidade: string
  /** presente na busca e na página do tópico */
  comunidadeNome?: string
  categoria: string | null
  titulo: string
  trecho: string
  autor: ResumoRover
  criadoEm: string
  atividadeEm: string
  respostas: number
  fixado: boolean
  trancado: boolean
  resolvido: boolean
  tags: string[]
  enquete: boolean
  editado: boolean
  /** O tópico foi escondido por quem responde pelo espaço (só o autor e a moderação sabem). */
  removido?: boolean
  /** 0.3.1: só no 'em alta'. Pessoas que responderam ou reagiram na janela. */
  pessoas?: number
  /** 0.3.2 (`vocabulario`): só vem quando o tópico tem marca. */
  marcas?: MarcasDoTopico
}

export interface OpcaoDeEnquete {
  texto: string
  votos: number
}
export interface Enquete {
  opcoes: OpcaoDeEnquete[]
  encerraEm: string
  encerrada: boolean
  total: number
  /** a opção que o leitor escolheu; só com leitor identificado */
  voce: number | null
}

export interface Topico extends TopicoCartao {
  comunidadeNome: string
  texto: string
  resolvidoPor: { resposta: string; por: ResumoRover; em: string } | null
  enquete: boolean
  /** a enquete, separada do booleano do cartão */
  pesquisa: Enquete | null
  versoes: number
  /** 0.3.1 (`reacoes-do-topico`). Ausente no relé 0.3. */
  reacoes?: { curtir: number; util: number }
  minhaReacao?: 'curtir' | 'util' | null
}

export interface CitacaoDeResposta {
  id: string
  autor: ResumoRover
  /** null quando o citado foi removido */
  trecho: string | null
}

export interface RespostaForum {
  id: string
  autor: ResumoRover
  texto: string
  criadoEm: string
  /** a resposta de primeiro nível a que esta responde, ou null (responde ao tópico) */
  em: string | null
  cita: CitacaoDeResposta | null
  filhas: number
  resolveu: boolean
  reacoes: { curtir: number; util: number }
  minhaReacao?: 'curtir' | 'util' | null
  removida?: boolean
}

export interface VersaoDoTopico {
  versao: number
  titulo: string
  texto: string
  tags: string[]
  criadoEm: string
}

/** Lista de respostas com página: a ordem é crescente (fio de leitura). */
export interface ListaDeTopicos {
  itens: TopicoCartao[]
  /** só na primeira página */
  fixados?: TopicoCartao[]
  proximo?: string
}

// ---- páginas de projeto e de fãs ----------------------------------------------------------------

export interface PaginaCartao {
  id: string
  nome: string
  descricao: string
  tema: string
  dono: ResumoRover
  seguidores: number
  criadaEm: string
  atividadeEm: string
  /** 0.3.1: só no 'em alta'. */
  pessoas?: number
}

export interface PaginaProjeto extends PaginaCartao {
  administradores: ResumoRover[]
  voce: { segue: boolean; papel: 'dono' | 'administrador' | null } | null
}

export interface Atualizacao {
  id: string
  /** a página a que pertence */
  pagina: string
  paginaNome?: string
  autor: ResumoRover
  titulo: string | null
  texto: string
  tags: string[]
  criadaEm: string
  reacoes: { curtir: number; util: number }
  minhaReacao?: 'curtir' | 'util' | null
}

/** A linha de início com tudo misturado: postagem de rover e atualização de página que a pessoa segue. */
export type ItemDaLinha = { tipo: 'postagem'; postagem: import('../tipos').Postagem } | { tipo: 'atualizacao'; atualizacao: Atualizacao }

// ---- notificações, busca e descoberta -------------------------------------------------------------

export const TIPOS_DE_NOTIFICACAO = [
  'recado', 'pedido-de-amizade', 'amizade-aceita', 'depoimento-para-aceitar', 'depoimento-aceito', 'resposta-no-topico',
  'resposta-a-voce', 'citacao', 'mencao', 'convite-comunidade', 'pedido-de-entrada', 'entrada-aprovada', 'selo-recebido',
  'removido-por-responsavel', 'apelacao-recebida', 'apelacao-decidida', 'expulso', 'banido', 'posse-recebida', 'resolveu', 'novo-seguidor',
  // 0.4.0 (mensagens privadas): só quem pediu ou aceitou, nunca o texto do pedido nem de mensagem
  'conversa-pedido', 'conversa-aceita',
] as const
export type TipoDeNotificacao = (typeof TIPOS_DE_NOTIFICACAO)[number]

/** A notificação NUNCA carrega texto. Para ler, abre-se o `objeto`, e a leitura obedece à visibilidade de agora. */
export interface Notificacao {
  seq: number
  tipo: TipoDeNotificacao
  em: string
  origem: ResumoRover | null
  objeto: string | null
  comunidade: string | null
  pagina: string | null
  /** só para a tela: o nome da comunidade ou página, quando a notificação é de uma delas (o relé não manda; o cliente completa) */
  nomeDoLugar?: string | null
  /** só para a tela: o título do tópico, idem */
  nomeDoTopico?: string | null
}

export interface RoverBuscado extends ResumoRover {
  descricao: string
}

export interface ResultadoBuscaSocial {
  rovers: RoverBuscado[]
  comunidades: ComunidadeCartao[]
  topicos: TopicoCartao[]
  paginas: PaginaCartao[]
}
export type TipoDeBusca = 'rovers' | 'comunidades' | 'topicos' | 'paginas'

export interface Tendencia {
  tag: string
  autores: number
  usos: number
}

export interface RecemChegado extends ResumoRover {
  desde: string
}

export type TipoDeEmAlta = 'topicos' | 'comunidades' | 'paginas'
export type TipoDeSugestao = 'comunidades' | 'paginas' | 'rovers'

/** 0.3.1 (`removidos`): algo do rover que a moderação escondeu, para o próprio autor saber o quê, quando e por quê, e apelar. */
export interface Removido {
  id: string
  em: string
  escopo: 'comunidade' | 'pagina' | 'rele'
  contexto: string | null
  alvoTipo: string | null
  alvo: string
  motivo: MotivoModeracao
  /** o papel, nunca a pessoa */
  por: 'dono' | 'moderador' | 'administrador' | 'rele'
  apelacao: SituacaoApelacao | null
  /** o trecho do que foi removido, enquanto o relé ainda o retém; `null` depois. */
  trecho: string | null
}

/** 0.3.1 (`depoimentos-enviados`): o depoimento que o próprio rover escreveu e que ainda espera a decisão do dono da página. */
export interface DepoimentoEnviado {
  id: string
  alvo: ResumoRover
  texto: string
  criadoEm: string
  estado: 'pendente'
}

/** 0.3.1 (`temas-de-paginas`). */
export interface TemaDePagina {
  tema: string
  paginas: number
}

export interface InfoDoRele {
  protocolo: string[]
  /** se falso ou ausente, o cliente esconde as telas sociais */
  social: boolean
  /** Os recursos da revisão 0.3.1 que o relé declara (proposta 0006). Relé 0.3 não traz: vem vazio e o site usa os contornos de antes. */
  recursos: string[]
}

// ---- o que o leitor está fazendo agora (usado por telas e pela matriz de permissões) ----------------

export type { Humor }
