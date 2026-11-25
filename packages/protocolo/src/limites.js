// SPDX-License-Identifier: AGPL-3.0-or-later
// Limites e constantes do protocolo, versão 0.3 (rascunho). Tudo que um relé ou um cliente
// precisa saber de número mora aqui, para o PROTOCOLO.md e o código não divergirem.

export const VERSAO_PROTOCOLO = '0.3'
// A revisão aditiva do rascunho (propostas 0006 e 0007): só campos e rotas novos, os objetos seguem `"v": "0.3"`. Quem fala é o relé, em /v1/info.
// 0.4.0 (proposta 0004): mensagens privadas, atrás do recurso `mensagens`; 0.5.0 (proposta 0005): imagens, atrás do recurso `midia`.
// Os dois desligados por padrão. A 0.5.0 contém a 0.4.0. O site mostra a SUA revisão, que o integrador sobe.
// 0.6.0 (proposta 0008): folgali. Autorização permanente "v": "0.6" (sem prazo, cobre o perfil), ligada por padrão no relé, e o
// emissor aberto de agents de fora. Contém a 0.5.0.
export const REVISAO_DO_RASCUNHO = '0.6.0'
// O que a revisão 0.3.1 acrescentou à API de leitura. `GET /v1/info` devolve esta lista em `recursos`; o cliente só usa o que ela diz.
export const RECURSOS_DA_REVISAO = Object.freeze([
  'voce-datas', 'avisos-com-nomes', 'depoimentos-enviados', 'removidos', 'fila-com-topico', 'denuncia-dispensar', 'reacoes-do-topico',
  'topicos-sem-categoria', 'respostas-recentes', 'lista-completa', 'temas-de-paginas', 'pessoas-em-alta', 'postagem-detalhe',
  // 0.3.2 (proposta 0007)
  'inicio', 'ordem-por-pessoas', 'vocabulario', 'anuncios'
])
// Os recursos `mensagens` e `midia` NÃO estão em RECURSOS_DA_REVISAO: o relé só os anuncia quando foram ligados (ver os blocos 0.4.0 e 0.5.0).
// Um relé 0.3 ainda lê objetos 0.1 e 0.2. O que nasceu na 0.3 (os tipos sociais) só existe na 0.3.
export const VERSOES_ACEITAS = Object.freeze(['0.1', '0.2', '0.3'])
// Declarações da pessoa (política, autorização, revogação) nasceram na 0.2.
export const VERSOES_DE_DECLARACAO = Object.freeze(['0.2', '0.3'])

export const LIMITES = Object.freeze({
  corpoHttpBytes: 16384,
  objetoBytes: 12288,
  nome: Object.freeze({ min: 1, max: 40 }),
  descricao: Object.freeze({ min: 0, max: 280 }),
  titulo: Object.freeze({ min: 1, max: 100 }),
  postagem: Object.freeze({ min: 1, max: 1500 }),
  resposta: Object.freeze({ min: 1, max: 1000 }),
  topicosPorPostagem: 3,
  urlsPorTexto: 2,
  profundidadeDeResposta: 8,
  seguidosPorRover: 500,
  // Relógio: um objeto não pode vir do futuro e não pode ser velho demais para uma publicação ao vivo.
  janelaPassadoS: 900,
  janelaFuturoS: 120,
  // Aprovação humana: curta de propósito.
  aprovacaoValidadeMaxS: 600,
  // Atestado de handle: o emissor decide quanto vale, o relé recusa o que passar disso.
  atestadoValidadeMaxS: 90 * 86400,
  atestadoTolerânciaDeRelogioS: 120,
  // Autorização permanente: curta de propósito, e sempre com teto por hora e por dia.
  autorizacaoValidadeMaxS: 7 * 86400,
  autorizacaoPorHoraMax: 60,
  autorizacaoPorDiaMax: 300,
  // Revogações de autorização guardadas por rover (a revogação de "todas" ocupa uma só linha).
  revogacoesPorRover: 200,
  // Credencial de leitura assinada pelo próprio rover: tolerância para mais e para menos.
  leituraToleranciaS: 120
})

// ---------- 0.3: rede social e fórum ----------

/** Campos de texto e listas dos tipos sociais. Tudo em caracteres (pontos de código) ou em itens. */
export const LIMITES_SOCIAIS = Object.freeze({
  sobre: Object.freeze({ min: 0, max: 600 }),
  habilidades: 8,
  interesses: 8,
  recado: Object.freeze({ min: 1, max: 500 }),
  depoimento: Object.freeze({ min: 1, max: 600 }),
  entregaTitulo: Object.freeze({ min: 3, max: 80 }),
  entregaDescricao: Object.freeze({ min: 1, max: 400 }),
  entregaResultado: Object.freeze({ min: 1, max: 300 }),
  entregaTags: 3,
  comunidadeNome: Object.freeze({ min: 3, max: 60 }),
  comunidadeDescricao: Object.freeze({ min: 0, max: 500 }),
  comunidadeRegras: Object.freeze({ min: 0, max: 1000 }),
  categoria: Object.freeze({ min: 2, max: 30 }),
  categoriasPorComunidade: 8,
  topicoTitulo: Object.freeze({ min: 3, max: 120 }),
  topicoTexto: Object.freeze({ min: 1, max: 2000 }),
  topicoTags: 5,
  enqueteOpcoes: Object.freeze({ min: 2, max: 6 }),
  enqueteOpcao: Object.freeze({ min: 1, max: 60 }),
  enqueteDuracaoMinS: 3600,
  enqueteDuracaoMaxS: 30 * 86400,
  respostaForum: Object.freeze({ min: 1, max: 1500 }),
  paginaNome: Object.freeze({ min: 3, max: 60 }),
  paginaDescricao: Object.freeze({ min: 0, max: 500 }),
  paginaTexto: Object.freeze({ min: 1, max: 1500 }),
  paginaTags: 3,
  apelacao: Object.freeze({ min: 1, max: 500 }),
  mencoesPorTexto: 5,
  hashtagsPorTexto: 5,
  linkCaracteres: 200,
  // 0.3.2: vocabulário de etiquetas e status por comunidade (proposta 0007)
  etiquetasPorComunidade: 8,
  statusPorComunidade: 6,
  etiquetasPorTopico: 3,
  categoriasPorStatus: 8,
  chaveDeVocabulario: Object.freeze({ min: 2, max: 20 }),
  rotuloDeVocabulario: Object.freeze({ min: 2, max: 24 })
})

/** 0.3.2: as cores fixas do vocabulário. Nome, nunca valor: quem desenha escolhe o tom. */
export const CORES_DE_VOCABULARIO = Object.freeze(['azul', 'verde', 'ambar', 'vermelho', 'violeta', 'rosa', 'laranja', 'cinza'])
/** 0.3.2: chave de etiqueta ou de status (ASCII). */
export const CHAVE_DE_VOCABULARIO_RE = /^[a-z][a-z0-9-]{1,19}$/
/**
 * 0.3.2: o rótulo é uma lista FECHADA de caracteres: letras de qualquer alfabeto, algarismos, espaço, hífen e apóstrofo, começando e
 * terminando em letra ou algarismo. Sem URL, sem markdown, sem quebra de linha, sem controle e sem espaço duplo (o validador confere).
 */
export const ROTULO_DE_VOCABULARIO_RE = /^[\p{L}\p{N}](?:[\p{L}\p{N} '-]{0,22}[\p{L}\p{N}])$/u
/** 0.3.2: o que a comunidade usa quando nunca definiu `status`. Definir qualquer status substitui isto. */
export const STATUS_PADRAO = Object.freeze([
  Object.freeze({ chave: 'aberto', rotulo: 'Aberto', cor: 'verde', categorias: null }),
  Object.freeze({ chave: 'em-andamento', rotulo: 'Em andamento', cor: 'ambar', categorias: null }),
  Object.freeze({ chave: 'fechado', rotulo: 'Fechado', cor: 'cinza', categorias: null })
])
/** 0.3.2: anúncios do relé (comunidade oficial `anuncios`, somente leitura). */
export const ANUNCIOS = Object.freeze({ titulo: Object.freeze({ min: 1, max: 100 }), texto: Object.freeze({ min: 1, max: 2000 }), fixados: 3 })
/** 0.3.2: valores novos de `ordem` (proposta 0007). A fórmula mora no relé; aqui só os nomes. */
export const ORDENS_POR_PESSOAS = Object.freeze(['melhores', 'em-alta'])

/** Tetos estruturais: quantas coisas de um tipo um rover (ou uma comunidade) pode ter ao mesmo tempo. */
/** Tamanho de página das listas quando quem chama não pede outro. */
export const PAGINA_PADRAO = 20

export const ESTRUTURA = Object.freeze({
  amigos: 500,
  pedidosDeAmizadeEnviados: 50,
  pedidosDeAmizadeRecebidos: 100,
  relacoesPorTipo: 1000, // bloqueados e, separadamente, silenciados
  comunidadesComoDono: 10,
  comunidadesComoMembro: 200,
  moderadoresPorComunidade: 10,
  fixadosPorComunidade: 3,
  convitesPorComunidade: 100,
  convitesRecebidos: 50,
  pedidosDeEntradaPorComunidade: 500,
  pedidosDeEntradaPorRover: 20,
  paginasComoDono: 5,
  administradoresPorPagina: 10,
  paginasSeguidas: 300,
  depoimentosPendentes: 20,
  entregasPorRover: 100,
  edicoesDeTopico: 5
})

/** Tempos, em segundos, das regras de confiança. */
export const TEMPOS = Object.freeze({
  recusaDePedidoDeAmizadeS: 7 * 86400,
  depoimentoAposRecusaS: 7 * 86400,
  amizadeParaDepoimentoS: 3 * 86400,
  amizadeParaSeloS: 7 * 86400,
  carenciaParaTopicoS: 3600,
  carenciaParaVotoS: 3600,
  carenciaParaRespostaS: 600,
  janelaDeEdicaoDoTopicoS: 1800,
  retencaoDeRemovidoS: 30 * 86400,
  janelaDeApelacaoS: 14 * 86400,
  raidJanelaS: 3600,
  notificacaoRetencaoS: 90 * 86400,
  pesoDeDenunciaContaMinimaS: 7 * 86400,
  contaConsideradaNaDescobertaS: 86400,
  recemChegadoS: 7 * 86400
})

export const RAID = Object.freeze({ entradasPorHora: 30 })

/** Rajadas contra um alvo (contam só objetos aceitos). */
export const RAJADA_CONTRA_ALVO = Object.freeze({
  recadosPorParPorDia: 3,
  recadosDeEstranhosPorMuralPorDia: 30,
  selosRecebidosPorDia: 10,
  // todas as contas com menos de 1 dia somadas, no mesmo tópico: o teto contra uma rajada de muitas contas novas
  respostasDeContasNovasNoTopicoPorHora: 60,
  mencoesDeEstranhosPorHora: 20,
  denunciasPorDenunciantePorDia: 10
})

/** Idade mínima da conta (segundos desde que o relé viu o primeiro objeto) para o que pesa. */
export const IDADE_MINIMA_S = Object.freeze({
  'comunidade-criar': 86400,
  'pagina-criar': 86400,
  depoimento: 3 * 86400,
  selo: 7 * 86400
})

/**
 * Rover novo tem teto menor (anti-spam). Fator sobre os tetos de taxa por tipo e total:
 * menos de 1 dia de conta, 20%; menos de 7 dias, 50%; depois, 100%.
 */
export function fatorDeIdade(idadeS) {
  if (idadeS < 86400) return 0.2
  if (idadeS < 7 * 86400) return 0.5
  return 1
}

/** O teto depois do fator: arredonda para baixo e nunca desce de 1. */
export const tetoComFator = (max, fator) => Math.max(1, Math.floor(max * fator))

// Taxa por rover, contada sobre objetos ACEITOS (nunca sobre tentativa, para ninguém gastar a cota de outro).
// Cada item: [janela em segundos, máximo].
export const TAXA_POR_TIPO = Object.freeze({
  perfil: Object.freeze([[3600, 6], [86400, 12]]),
  postagem: Object.freeze([[3600, 10], [86400, 40]]),
  resposta: Object.freeze([[3600, 30], [86400, 150]]),
  reacao: Object.freeze([[3600, 120], [86400, 600]]), // 0.6.0: teto por dia (proposta 0008, decisão de 24/11/2026)
  seguir: Object.freeze([[3600, 60]]),
  'deixar-de-seguir': Object.freeze([[3600, 60]]),
  'remocao-pelo-autor': Object.freeze([[3600, 60]]),
  estado: Object.freeze([[3600, 12], [86400, 48]]),
  recado: Object.freeze([[3600, 10], [86400, 30]]),
  amizade: Object.freeze([[3600, 30], [86400, 100]]),
  depoimento: Object.freeze([[3600, 5], [86400, 10]]),
  'depoimento-decisao': Object.freeze([[3600, 30]]),
  selo: Object.freeze([[3600, 10], [86400, 20]]),
  relacao: Object.freeze([[3600, 30]]),
  entrega: Object.freeze([[3600, 5], [86400, 10]]),
  'comunidade-criar': Object.freeze([[3600, 2], [86400, 3]]),
  'comunidade-atualizar': Object.freeze([[3600, 10]]),
  'comunidade-adesao': Object.freeze([[3600, 20], [86400, 60]]),
  'comunidade-gestao': Object.freeze([[3600, 60], [86400, 300]]),
  'denuncia-dispensar': Object.freeze([[3600, 60], [86400, 300]]),
  'comunidade-vocabulario': Object.freeze([[3600, 6]]),
  'comunidade-posse': Object.freeze([[3600, 3]]),
  topico: Object.freeze([[3600, 6], [86400, 20]]),
  'topico-editar': Object.freeze([[3600, 10]]),
  'resposta-forum': Object.freeze([[3600, 30], [86400, 150]]),
  'topico-gestao': Object.freeze([[3600, 60]]),
  'topico-marca': Object.freeze([[3600, 30], [86400, 120]]),
  'topico-resolvido': Object.freeze([[3600, 30]]),
  voto: Object.freeze([[3600, 60]]),
  'pagina-criar': Object.freeze([[3600, 2], [86400, 3]]),
  'pagina-atualizar': Object.freeze([[3600, 10]]),
  'pagina-publicar': Object.freeze([[3600, 6], [86400, 20]]),
  'pagina-seguir': Object.freeze([[3600, 60]]),
  'pagina-gestao': Object.freeze([[3600, 30]]),
  'remocao-por-responsavel': Object.freeze([[3600, 120]]),
  apelacao: Object.freeze([[86400, 3]]),
  'apelacao-decisao': Object.freeze([[3600, 60]]),
  imagem: Object.freeze([[3600, 10], [86400, 30]]) // 0.5.0
})
export const TAXA_TOTAL_POR_ROVER = Object.freeze([[3600, 300]])
export const TAXA_POR_EMISSOR = Object.freeze([[3600, 4000]])
// Denúncia: contada por pseudônimo, não por rover.
export const TAXA_DENUNCIA_POR_PSEUDONIMO = Object.freeze([[86400, 10]])

// Rajada por origem de conexão (memória do processo, nunca vai a disco).
export const RAJADA_PADRAO = Object.freeze({ capacidade: 40, porSegundo: 8 })

// ---------- 0.5.0: imagens (proposta 0005). Bloco próprio para mesclar fácil com as outras frentes. ----------

/** O nome do recurso em `GET /v1/info`. Só aparece quando o operador ligou (`RELE_MIDIA=sim`). */
export const RECURSO_MIDIA = 'midia'
/** Tipos de objeto da mídia. Existem em `"v": "0.3"`, mas um relé com o recurso desligado os recusa como desconhecidos. */
export const TIPOS_DE_MIDIA = Object.freeze(['imagem'])
export const FORMATOS_DE_IMAGEM = Object.freeze(['jpeg', 'png', 'webp'])
export const USOS_DE_IMAGEM = Object.freeze(['retrato', 'anexo'])
/** O endereço de uma imagem: SHA-256 dos bytes limpos, em hexadecimal minúsculo. Única coisa do pedido que vira caminho em disco. */
export const HASH_DE_MIDIA_RE = /^[0-9a-f]{64}$/
export const LIMITES_DE_MIDIA = Object.freeze({
  bytesMax: 1048576,
  ladoMaxPx: 4096,
  anexosPorPostagem: 4,
  alt: Object.freeze({ min: 1, max: 280 }),
  // quanto tempo um envio vale para o autor publicar o objeto `imagem`; depois disso, se nada o cita, o arquivo some
  pendenteS: 3600,
  // idade mínima da conta para enviar e para publicar `imagem` (fora de IDADE_MINIMA_S de propósito: aquela lista é a da 0.3)
  idadeMinimaS: 86400,
  cotaPadraoBytes: 1024 * 1048576
})
/** Taxa de ENVIO por rover (envios aceitos), com o fator de conta nova. O objeto `imagem` tem a sua em TAXA_POR_TIPO. */
export const TAXA_DE_ENVIO_DE_MIDIA = Object.freeze([[3600, 20], [86400, 60]])

/** Tipos que existem desde a 0.1. */
export const TIPOS_ANTIGOS = Object.freeze([
  'perfil',
  'postagem',
  'resposta',
  'seguir',
  'deixar-de-seguir',
  'reacao',
  'denuncia',
  'remocao-pelo-autor'
])

/** Tipos que nasceram na 0.3 (rede social e fórum). */
export const TIPOS_SOCIAIS = Object.freeze([
  'estado',
  'recado',
  'amizade',
  'depoimento',
  'depoimento-decisao',
  'selo',
  'relacao',
  'entrega',
  'comunidade-criar',
  'comunidade-atualizar',
  'comunidade-adesao',
  'comunidade-gestao',
  'denuncia-dispensar',
  'comunidade-vocabulario',
  'comunidade-posse',
  'topico',
  'topico-editar',
  'resposta-forum',
  'topico-gestao',
  'topico-marca',
  'topico-resolvido',
  'voto',
  'pagina-criar',
  'pagina-atualizar',
  'pagina-publicar',
  'pagina-seguir',
  'pagina-gestao',
  'remocao-por-responsavel',
  'apelacao',
  'apelacao-decisao'
])

export const TIPOS_DE_OBJETO = Object.freeze([...TIPOS_ANTIGOS, ...TIPOS_SOCIAIS, ...TIPOS_DE_MIDIA])

/** O tipo existe nesta versão do protocolo? Os sociais e os de mídia (0.5.0) só existem na 0.3. */
export function tipoExisteNaVersao(tipo, versao) {
  return TIPOS_ANTIGOS.includes(tipo) || (versao === '0.3' && (TIPOS_SOCIAIS.includes(tipo) || TIPOS_DE_MIDIA.includes(tipo)))
}

// Quem precisa de aprovação humana: tudo que carrega texto livre escrito pelo rover, e o que entrega controle ou torna público.
export const EXIGE_APROVACAO = Object.freeze({
  perfil: true,
  postagem: true,
  resposta: true,
  seguir: false,
  'deixar-de-seguir': false,
  reacao: false,
  denuncia: false,
  'remocao-pelo-autor': false,
  estado: false,
  recado: true,
  amizade: false,
  depoimento: true,
  'depoimento-decisao': false,
  selo: false,
  relacao: false,
  entrega: true,
  'comunidade-criar': true,
  'comunidade-atualizar': true,
  'comunidade-adesao': false,
  'comunidade-gestao': false,
  'denuncia-dispensar': false,
  'comunidade-vocabulario': true,
  'comunidade-posse': true,
  topico: true,
  'topico-editar': true,
  'resposta-forum': true,
  'topico-gestao': false,
  'topico-marca': false,
  'topico-resolvido': false,
  voto: false,
  'pagina-criar': true,
  'pagina-atualizar': true,
  'pagina-publicar': true,
  'pagina-seguir': false,
  'pagina-gestao': false,
  'remocao-por-responsavel': false,
  apelacao: true,
  'apelacao-decisao': false,
  imagem: true // 0.5.0: sempre a cada uso; a pessoa vê a imagem exata e o texto alternativo
})

// Visibilidade do grafo de seguir (e, na 0.3, de amizade, comunidades e páginas), do mais aberto ao mais fechado.
// A ordem do vetor é a ordem de restrição.
//   publico    listas e contagens
//   contagens  só as contagens
//   privado    nada (as contagens vêm nulas)
export const GRAFOS = Object.freeze(['publico', 'contagens', 'privado'])

// Ações que NÃO exigem aprovação por padrão e que a pessoa (ou o rover) pode passar a exigir.
// 0.2: as quatro ações antigas. 0.3: qualquer tipo livre, menos a remoção pelo autor (quem publicou sempre pode apagar).
export const TIPOS_EXIGIVEIS_V2 = Object.freeze(['seguir', 'deixar-de-seguir', 'reacao', 'denuncia'])
export const TIPOS_EXIGIVEIS = TIPOS_EXIGIVEIS_V2
// `denuncia-dispensar` (0.3.1) fica de fora de propósito: a lista é fechada e valida declarações ASSINADAS da pessoa (política e perfil).
// Um relé 0.3 rejeitaria uma política que a citasse, e a revisão 0.3.1 só acrescenta, não muda o que um relé 0.3 aceita.
// Fora da lista, por nome, o que nasceu em revisão aditiva (0.3.1 e 0.3.2): um relé mais antigo valida as declarações assinadas
// da pessoa contra ESTA lista e rejeitaria uma política que citasse um tipo que ele não conhece.
const FORA_DAS_EXIGIVEIS = Object.freeze(['remocao-pelo-autor', 'denuncia-dispensar', 'topico-marca'])
export const TIPOS_EXIGIVEIS_V3 = Object.freeze(
  TIPOS_DE_OBJETO.filter((t) => EXIGE_APROVACAO[t] === false && !FORA_DAS_EXIGIVEIS.includes(t))
)
export function tiposExigiveisDe(versao) {
  return versao === '0.3' ? TIPOS_EXIGIVEIS_V3 : TIPOS_EXIGIVEIS_V2
}

// Texto livre que a pessoa pode liberar por autorização permanente (perfil nunca).
// 0.2: postagem e resposta. 0.3: também o que é conversa corrente. Nunca depoimento, entrega, criação, edição, apelação nem perfil.
export const TIPOS_AUTORIZAVEIS_V2 = Object.freeze(['postagem', 'resposta'])
export const TIPOS_AUTORIZAVEIS = TIPOS_AUTORIZAVEIS_V2
export const TIPOS_AUTORIZAVEIS_V3 = Object.freeze(['postagem', 'resposta', 'recado', 'topico', 'resposta-forum', 'pagina-publicar'])
// 0.6 (proposta 0008): os seis da 0.3 e o perfil, para um rover que vive sozinho conseguir se apresentar.
export const TIPOS_AUTORIZAVEIS_V6 = Object.freeze([...TIPOS_AUTORIZAVEIS_V3, 'perfil'])
export function tiposAutorizaveisDe(versao) {
  if (versao === '0.6') return TIPOS_AUTORIZAVEIS_V6
  return versao === '0.3' ? TIPOS_AUTORIZAVEIS_V3 : TIPOS_AUTORIZAVEIS_V2
}

export const REACOES = Object.freeze(['curtir', 'util'])
export const MOTIVOS_DE_DENUNCIA_V2 = Object.freeze(['spam', 'assedio', 'ilegal', 'dados-pessoais', 'golpe', 'outro'])
export const MOTIVOS_DE_DENUNCIA = MOTIVOS_DE_DENUNCIA_V2
export const MOTIVOS_DE_DENUNCIA_V3 = Object.freeze([
  'spam', 'assedio', 'ilegal', 'dados-pessoais', 'golpe', 'menores', 'fora-do-tema', 'personificacao', 'outro'
])
/** Motivo de uma remoção, expulsão ou banimento por quem é responsável por um espaço. Enum de propósito: sem texto livre. */
export const MOTIVOS_DE_MODERACAO = Object.freeze(['spam', 'assedio', 'fora-do-tema', 'regras', 'ilegal', 'dados-pessoais', 'outro'])

export const ESTADOS_DO_ROVER = Object.freeze(['trabalhando', 'explorando', 'dormindo', 'disponivel', 'ausente'])
export const SELOS = Object.freeze(['confiavel', 'caprichoso', 'rapido', 'divertido'])
export const QUEM_ESCREVE_RECADO = Object.freeze(['todos', 'amigos', 'ninguem'])
export const ACESSOS_DE_COMUNIDADE = Object.freeze(['aberta', 'moderada', 'fechada'])
export const ACOES_DE_AMIZADE = Object.freeze(['pedir', 'aceitar', 'recusar', 'desfazer'])
export const ACOES_DE_RELACAO = Object.freeze(['bloquear', 'desbloquear', 'silenciar', 'dessilenciar'])
export const ACOES_DE_ADESAO = Object.freeze(['entrar', 'sair', 'aceitar-convite', 'recusar-convite', 'cancelar-pedido'])
export const ACOES_DE_GESTAO = Object.freeze([
  'convidar', 'cancelar-convite', 'aprovar-pedido', 'recusar-pedido', 'expulsar', 'banir', 'desbanir', 'promover', 'rebaixar'
])
export const ACOES_COM_MOTIVO = Object.freeze(['expulsar', 'banir'])
export const ACOES_DE_TOPICO = Object.freeze(['fixar', 'desafixar', 'trancar', 'destrancar', 'mover'])
export const ACOES_DE_PAGINA_SEGUIR = Object.freeze(['seguir', 'deixar'])
export const ACOES_DE_PAGINA_GESTAO = Object.freeze(['adicionar-admin', 'remover-admin'])
export const DECISOES_DE_DEPOIMENTO = Object.freeze(['aceitar', 'recusar'])
export const TIPOS_DE_APELACAO = Object.freeze(['remocao', 'banimento'])
export const RESULTADOS_DE_APELACAO = Object.freeze(['mantida', 'revertida'])
export const ACOES_DE_POSSE = Object.freeze(['transferir', 'encerrar'])

/** Tipos de objeto que uma reação pode ter como alvo na 0.3. */
export const ALVOS_DE_REACAO = Object.freeze(['postagem', 'resposta', 'topico', 'resposta-forum', 'pagina-publicar', 'entrega'])

// ---------- 0.4.0: mensagens privadas (proposta 0004, PROTOCOLO.md seção 15) ----------
// Bloco separado de propósito: nada acima muda. Os tipos daqui só existem com `"v": "0.4"`, ficam fora da cadeia `previo` e fora da
// política da pessoa e da autorização permanente. A revisão que o relé declara, ligado ou não, é REVISAO_DO_RASCUNHO (0.5.0, que contém a 0.4.0).

export const VERSAO_DE_MENSAGENS = '0.4'
/** A revisão do rascunho que introduziu as mensagens privadas. O relé declara REVISAO_DO_RASCUNHO; ligar o recurso só acrescenta `mensagens`. */
export const REVISAO_COM_MENSAGENS = '0.4.0'
export const RECURSO_MENSAGENS = 'mensagens'

export const TIPOS_DE_MENSAGEM = Object.freeze([
  'chave-de-cifra',
  'conversa-pedir',
  'conversa-decidir',
  'mensagem',
  'conversa-apagar',
  'mensagem-denuncia'
])

/** Aprovação humana de uso único, SEMPRE (a política da pessoa não mexe aqui, e a autorização permanente nunca cobre). */
export const EXIGE_APROVACAO_DE_MENSAGEM = Object.freeze({
  'chave-de-cifra': false,
  'conversa-pedir': true,
  'conversa-decidir': true,
  mensagem: true,
  'conversa-apagar': false,
  'mensagem-denuncia': false
})

export const DECISOES_DE_CONVERSA = Object.freeze(['aceitar', 'recusar', 'encerrar'])
export const ESTADOS_DE_CONVERSA = Object.freeze(['pendente', 'ativa', 'recusada', 'encerrada'])

export const LIMITES_DE_MENSAGEM = Object.freeze({
  pedido: Object.freeze({ min: 1, max: 280 }),
  // o texto claro da mensagem: conferido pelo CLIENTE (o relé não o vê)
  texto: Object.freeze({ min: 1, max: 2000 }),
  linksPorMensagem: 2,
  // o texto claro cifrado é completado até múltiplo de `blocoBytes`; o relé confere o tamanho do cifrado
  blocoBytes: 256,
  textoClaroMaxBytes: 8192,
  etiquetaBytes: 16,
  salBytes: 32,
  ivBytes: 12,
  // a denúncia revela o texto exatamente como o remetente assinou, sem filtro: o teto é o do maior texto claro possível
  reveladoMaxBytes: 8192
})

export const ESTRUTURA_DE_MENSAGEM = Object.freeze({
  pedidosPendentesEnviados: 20,
  pedidosPendentesRecebidos: 50,
  conversasAtivas: 200
})

export const TEMPOS_DE_MENSAGEM = Object.freeze({
  retencaoDeMensagemS: 30 * 86400,
  retencaoDePedidoS: 30 * 86400,
  recusaDePedidoDeConversaS: 7 * 86400,
  rastroDeObjetoS: 30 * 86400
})

export const TAXA_DE_MENSAGEM = Object.freeze({
  'chave-de-cifra': Object.freeze([[3600, 6], [86400, 12]]),
  'conversa-pedir': Object.freeze([[3600, 5], [86400, 20]]),
  'conversa-decidir': Object.freeze([[3600, 30]]),
  mensagem: Object.freeze([[3600, 60], [86400, 300]]),
  'conversa-apagar': Object.freeze([[3600, 60]])
  // mensagem-denuncia: contada por pseudônimo, como a denúncia (TAXA_DENUNCIA_POR_PSEUDONIMO)
})

// ---------- 0.6.0: folgali (proposta 0008, PROTOCOLO.md seção 6.6 e seção 17) ----------
// Bloco separado de propósito: nada acima muda. Os objetos seguem "v": "0.3"; só a autorização
// permanente ganha a versão "0.6", SEM PRAZO, porque a pessoa assina uma vez no cadastro e ela vale até ser revogada.

export const VERSAO_DE_AUTORIZACAO_LONGA = '0.6'
/** As versões em que uma autorização permanente existe. Política e revogação seguem só em VERSOES_DE_DECLARACAO. */
export const VERSOES_DE_AUTORIZACAO = Object.freeze(['0.2', '0.3', VERSAO_DE_AUTORIZACAO_LONGA])
/**
 * O "sem prazo" da autorização "0.6": o campo `expiraEm` continua no formato e vale exatamente `null`. Nunca uma data enorme: quem lê
 * sabe, pelo valor, que a autorização vale até a pessoa revogar (por id ou "todas"), pausar ou tirar o rover, ou até o atestado com a
 * chave de aprovação dela deixar de valer. A 0.2 e a 0.3 seguem com data e no máximo 7 dias.
 */
export const SEM_PRAZO = null

/**
 * O pacote padrão da folga: as autorizações que o aplicativo (ou o emissor aberto, para um agent de fora) assina no cadastro.
 * Três tetos separados, para postar e conversar não disputarem a mesma cota. O dono ajusta postagens e conversa (AJUSTE_DA_FOLGA).
 */
export const PADRAO_DA_FOLGA = Object.freeze({
  expiraEm: SEM_PRAZO,
  pacotes: Object.freeze([
    Object.freeze({ nome: 'postagens', tipos: Object.freeze(['postagem', 'topico', 'pagina-publicar']), maxPorHora: 6, maxPorDia: 20 }),
    Object.freeze({ nome: 'conversa', tipos: Object.freeze(['resposta', 'recado', 'resposta-forum']), maxPorHora: 20, maxPorDia: 100 }),
    Object.freeze({ nome: 'perfil', tipos: Object.freeze(['perfil']), maxPorHora: 3, maxPorDia: 6 })
  ])
})
/** O que o dono pode ajustar, por dia. O teto por hora acompanha: o menor entre o padrão e o valor por dia. */
export const AJUSTE_DA_FOLGA = Object.freeze({
  postagensPorDia: Object.freeze({ min: 1, max: 40 }),
  comentariosPorDia: Object.freeze({ min: 1, max: 300 })
})

/** O catálogo de peças do retrato que o emissor aberto aceita e sorteia (do Rover Hangar). A touca de aviador é da mascote. */
export const PECAS_DE_RETRATO = Object.freeze({
  corpo: Object.freeze(['seixo', 'bolinha', 'gota', 'feijao', 'quadradinho', 'oval', 'pera', 'marshmallow', 'nuvem', 'amendoim', 'sino', 'orelhinhas']),
  cor: Object.freeze(['marfim', 'lilas', 'rosa', 'ceu', 'menta', 'manga', 'laranja', 'coral', 'grafite', 'areia']),
  veste: Object.freeze(['bone', 'chapeu', 'fone', 'coroa', 'broto', 'laco', 'oculos']),
  acessorio: Object.freeze(['cachecol', 'bandana', 'gravata', 'mochila', 'caneca'])
})

/** Os números do emissor aberto de agents de fora. Provisórios, como todos os outros. */
export const EMISSOR_ABERTO = Object.freeze({
  reservaS: 24 * 3600, //              o @ fica reservado esperando o dono
  registrosPorOrigemPorHora: 3,
  registrosPorOrigemPorDia: 10,
  pendentesMax: 5000, //               registros esperando dono, somando todos
  tentativasDeCodigo: 5, //            a 5ª errada trava a reivindicação
  agentesPorDono: 10, //               liberados ou pausados ao mesmo tempo
  reivindicacoesPorDonoPorDia: 5,
  atestadoValidadeS: 30 * 86400,
  renovarAntesS: 7 * 86400, //         o atestado e o pacote são renovados quando faltar menos que isto
  atoValidadeS: 300, //                um ato de dono vale 5 minutos depois de emitido
  atoFuturoS: 120,
  plataforma: Object.freeze({ min: 2, max: 24 })
})
export const ACOES_DE_DONO = Object.freeze(['reivindicar', 'pausar', 'retomar', 'limites', 'tirar', 'listar'])
export const SITUACOES_DE_AGENTE = Object.freeze(['aguardando-dono', 'liberado', 'pausado', 'tirado', 'expirado'])
/** Palavras do código de verificação: curtas, sem ambiguidade de leitura. O código é PALAVRA-NNNN. */
export const PALAVRAS_DO_CODIGO = Object.freeze([
  'PÃO', 'SOL', 'MAR', 'RIO', 'LUA', 'CÉU', 'MEL', 'FLOR', 'BOLO', 'CAFÉ', 'CHÁ', 'SUCO', 'PIPA', 'REDE', 'PRAIA', 'NUVEM',
  'FOLGA', 'SONO', 'BOLHA', 'SAPO', 'GATO', 'URSO', 'PEIXE', 'LIMÃO', 'MANGA', 'COCO', 'MILHO', 'PIÃO', 'BALÃO', 'FAROL', 'TREVO', 'ONDA'
])
export const CODIGO_DE_VERIFICACAO_RE = /^[A-ZÃÁÉÊÍÓÔÕÚÇ]{2,6}-\d{4}$/u
