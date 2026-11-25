// O ELENCO FIXO DA DEMONSTRAÇÃO SOCIAL: os ids que o cliente falso cria e que as fotos, os testes e os
// atalhos usam. Tudo é inventado. Quem escreve o cliente falso cria exatamente estes ids com estes
// papéis; quem escreve tela e prova visual os usa por aqui (nunca digita um id à mão).
// Ids têm a forma dos de verdade e o miolo DEMO (veja dominio/ids.ts). A leitora é sempre a `lumi`.

import { idDeDemonstracao } from '../dominio/ids'

const oid = (rotulo: string) => idDeDemonstracao('ob', rotulo)

/** Comunidades. O papel da Lumi em cada uma é o que dá a cada tela um caso para mostrar. */
export const COMUNIDADES = {
  /** Cinema de Sofá · aberta · Lumi MODERADORA · fórum cheio: fixado, enquete, "resolveu", tópico trancado, tópico sem resposta */
  cinema: oid('ccinema'),
  /** Cochilo da Tarde · aberta · Lumi NÃO é membro (pode entrar na hora) */
  cochilo: oid('ccochilo'),
  /** Clube do Tabuleiro · moderada · Lumi com PEDIDO DE ENTRADA pendente */
  tabuleiro: oid('ctabuleiro'),
  /** Cozinha de Domingo · moderada · Lumi MEMBRO · pedidos e conversa comuns */
  cozinha: oid('ccozinha'),
  /** Vitrola · FECHADA · Lumi DONA · fila de denúncias, pedidos, convites, banidos, apelação, registro: a moderação toda */
  vitrola: oid('cvitrola'),
  /** Jardim de Varanda · FECHADA · Lumi CONVIDADA (só vê o cartão mínimo; aceitar ou recusar o convite) */
  jardim: oid('cjardim'),
  /** Praia e Piquenique · aberta · Lumi BANIDA (vê o fórum, não entra nem posta; pode apelar dentro de 14 dias) */
  praia: oid('cpraia'),
} as const

/** Tópicos importantes, por comunidade. */
export const TOPICOS = {
  /** cinema: FIXADO, "regras e boas-vindas" */
  cinemaBoasVindas: oid('tcinemaboasvindas'),
  /** cinema: conversa longa em fio com citação, resposta que RESOLVEU, tópico da Lumi editado (histórico) */
  cinemaPipoca: oid('tcinemapipoca'),
  /** cinema: ENQUETE aberta, a Lumi ainda não votou */
  cinemaEnquete: oid('tcinemaenquete'),
  /** cinema: ENQUETE encerrada */
  cinemaEnqueteFim: oid('tcinemaenqueteencerrada'),
  /** cinema: tópico TRANCADO */
  cinemaTrancado: oid('tcinematrancado'),
  /** cinema: SEM RESPOSTA */
  cinemaSemResposta: oid('tcinemasemresposta'),
  /** cochilo: conversa ativa */
  cochiloHora: oid('tcochilohora'),
  /** cozinha: conversa comum */
  cozinhaPao: oid('tcozinhapao'),
  /** vitrola (fechada): tópico da Lumi */
  vitrolaLadoB: oid('tvitroladob'),
  /** tabuleiro (moderada, Lumi de fora): tópico que a Lumi lê mesmo sem ser membro */
  tabuleiroDamas: oid('ttabuleirodamas'),
} as const

export const PAGINAS = {
  /** Caçadores de Nuvens · dono: Pipa; administrador: Seixo; a Lumi SEGUE */
  nuvens: oid('gnuvens'),
  /** Fãs do Marshmallow · dono: Biscoito; a Lumi NÃO segue */
  marshmallow: oid('gmarshmallow'),
  /** Disco da Semana · dona: LUMI (a página da Lumi: ela publica, gerencia administradores e remove) */
  disco: oid('gdisco'),
  /** Clube do Café da Tuca · dona: Tuca; a Lumi é ADMINISTRADORA */
  cafe: oid('gcafe'),
} as const

/** Depoimentos e recados que as telas do perfil precisam achar. */
export const OBJETOS = {
  /** depoimento PENDENTE para a Lumi aceitar ou recusar (escrito por um amigo dela) */
  depoimentoPendente: oid('dpendente1'),
  depoimentoPendente2: oid('dpendente2'),
  /** um recado da Lumi no mural da Pipa, que ela pode apagar */
  recadoDaLumi: oid('rdalumi'),
  /** uma resposta de fórum de OUTRO rover, para o teste de denunciar/remover */
  respostaParaModerar: oid('fparamoderar'),
} as const

/**
 * Quem é o quê, por @handle (os 12 de antes mais os que o cliente falso social acrescenta). `amigoDaLumi`:
 * amizade ativa (com tempo para depoimento e selo); `pedidoRecebido`: pediu amizade à Lumi; `pedidoEnviado`:
 * a Lumi pediu; `bloqueado`: a Lumi bloqueou; `grafoPrivado`: mantém o grafo fechado (amigos e grupos escondidos);
 * `recadosAmigos` e `recadosNinguem`: só amigos escrevem no mural, ou ninguém.
 */
export const ELENCO = {
  amigoDaLumi: ['pipa', 'nina', 'max', 'tuca'],
  pedidoRecebido: ['zeca'],
  pedidoEnviado: ['lola'],
  bloqueado: ['bento'],
  grafoPrivado: ['didi'],
  recadosAmigos: ['nina'],
  recadosNinguem: ['biscoito'],
  semNadaAinda: ['nuvem'],
} as const

/** Rovers que só existem na demonstração social (os 12 de antes vêm do cliente falso da fase 1). */
export const NOVOS_ROVERS = ['juju', 'fiapo', 'mimi', 'bolota', 'otto', 'ziza', 'pingo', 'teco', 'capim'] as const
/** Amizade recém-criada: a Lumi ainda não pode receber selo de quem é amigo há menos de 7 dias. */
export const AMIGO_NOVO_DA_LUMI = 'teco'
/** Cada resposta do tópico da pipoca que a tela de moderação e os testes procuram. */
export const RESPOSTAS = {
  /** cinemaPipoca: a resposta que RESOLVEU (do Seixo) */
  pipocaResolveu: oid('fpipocaseixo'),
  /** cinemaPipoca: uma resposta de primeiro nível com filhas (da Pipa) */
  pipocaComFilhas: oid('fpipocapipa'),
  /** cinemaPipoca: resposta que CITA outra */
  pipocaCitando: oid('fpipocanina'),
} as const
export const APELACOES = {
  /** Vitrola: o Fiapo apela da remoção feita pela moderadora; a dona (Lumi) decide */
  fiapoRemocao: oid('apelfiapo'),
  /** Vitrola: o Pingo apela do banimento feito pela dona; vai para a fila do relé */
  pingoBanimento: oid('apelpingo'),
} as const
