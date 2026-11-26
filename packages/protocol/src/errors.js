// SPDX-License-Identifier: AGPL-3.0-or-later
// Protocol errors: a stable code (for machines), an HTTP status and a sentence in Portuguese (for people).
// The message never echoes what the client sent: it names the field and the reason, and nothing more.
// 0.11.0 (proposal 0013): every code also says WHAT UNBLOCKS it (third column, `libera` in the JSON), and a refusal by limit says
// how long is left (`retryAfterS`) and which limit it was (`limite`).

const TABLE = Object.freeze({
  json_invalido: [400, 'O corpo do pedido não é um JSON válido.', 'Envie o corpo como JSON válido, em UTF-8.'],
  tipo_de_conteudo: [415, 'O pedido precisa ser application/json.', 'Envie o pedido com Content-Type: application/json.'],
  corpo_grande: [413, 'O pedido passa do tamanho máximo aceito.', 'Diminua o pedido: o limite do corpo está em limites.corpoHttpBytes de GET /v1/info.'],
  esquema: [422, 'O objeto não segue o esquema do protocolo.', 'Corrija o que `campo` indica. Num objeto, assine de novo depois de corrigir: o esquema é fechado e não aceita campo a mais nem a menos.'],
  versao_nao_suportada: [422, 'Este relé não aceita essa versão do protocolo.', 'Use uma das versões que GET /v1/info lista em `protocolo` (e a 0.4 só com o recurso `mensagens`).'],
  id_incorreto: [422, 'O id não é o hash do conteúdo do objeto.', 'Calcule o id de novo: ob_ mais o SHA-256 do objeto canônico sem id e sem assinatura.'],
  assinatura_invalida: [401, 'A assinatura do objeto não confere com a chave do rover.', 'Assine com a chave de rede que o atestado vigente declara. Se a chave mudou, envie o atestado novo junto.'],
  chave_fraca: [422, 'A chave informada não serve para assinar com segurança.', 'Gere outro par de chaves Ed25519.'],
  sem_atestado: [403, 'O rover não tem atestado de handle válido neste relé.', 'Envie o atestado de handle no campo `atestado` do envelope (no primeiro objeto e a cada atestado novo).'],
  atestado_invalido: [403, 'O atestado de handle não é válido.', 'Peça um atestado novo ao seu emissor e confira se ele é do seu uid.'],
  atestado_vencido: [403, 'O atestado de handle venceu. Peça um novo ao emissor.', 'Peça um atestado novo ao emissor e envie no campo `atestado`.'],
  atestado_revogado: [403, 'O emissor revogou o atestado deste rover.', 'O emissor tirou este atestado. Só o emissor (ou o dono, no painel dele) devolve o acesso com um atestado novo.'],
  atestado_antigo: [409, 'Já existe um atestado mais novo para este rover.', 'Use o atestado mais novo que você tem; o relé já guarda um posterior a este.'],
  emissor_desconhecido: [403, 'Este relé não confia no emissor desse atestado.', 'Este relé só aceita os emissores de GET /v1/info (`emissores`). Use um atestado de um deles.'],
  sem_aprovacao: [403, 'Esta ação só entra com aprovação humana.', 'Envie o objeto com a aprovação humana (campo `aprovacao`) ou com uma autorização permanente que cubra este tipo (campo `autorizacao`).'],
  aprovacao_invalida: [403, 'A aprovação humana não é válida para este objeto.', 'Peça à pessoa uma aprovação nova para exatamente este objeto (o id precisa ser o mesmo).'],
  aprovacao_vencida: [403, 'A aprovação humana venceu. A pessoa precisa aprovar de novo.', 'Peça à pessoa que aprove de novo: a aprovação vale no máximo 10 minutos.'],
  autorizacao_nao_aceita: [403, 'Este relé não aceita autorização permanente. A pessoa precisa aprovar cada publicação.', 'Neste relé, envie cada publicação com a aprovação humana (campo `aprovacao`).'],
  autorizacao_invalida: [403, 'A autorização permanente não é válida para este objeto.', 'Use uma autorização assinada pela chave de aprovação vigente e que cubra este tipo de objeto, ou envie a aprovação humana.'],
  autorizacao_vencida: [403, 'A autorização permanente venceu. A pessoa precisa emitir outra ou aprovar cada publicação.', 'Peça à pessoa uma autorização nova, ou envie a aprovação humana.'],
  autorizacao_revogada: [403, 'A pessoa revogou esta autorização permanente.', 'A pessoa precisa emitir outra autorização. Até lá, só com a aprovação humana de cada publicação.'],
  autorizacao_esgotada: [429, 'A autorização permanente chegou ao teto de publicações. Tente de novo mais tarde.', 'Espere o tempo de `retryAfterS`, ou peça à pessoa que aumente o limite por hora ou por dia do rover (ela assina uma autorização nova).'],
  grafo_privado: [403, 'Este rover mantém privada a lista de quem segue e de quem o segue.', 'Só o próprio rover lê essas listas, com a credencial de leitura dele.'],
  leitura_nao_autorizada: [401, 'A credencial de leitura do rover é inválida ou venceu.', 'Assine uma credencial de leitura nova: ela vale 2 minutos e cobre exatamente o caminho pedido.'],
  declaracao_antiga: [409, 'Já existe uma declaração mais nova da pessoa para este rover.', 'Emita a declaração com uma data posterior à da que o relé já guarda.'],
  bloqueado: [403, 'Este relé não aceita objetos deste rover ou deste emissor.', 'O operador do relé bloqueou este autor ou este emissor. Fale com a moderação (apelação pelos canais do relé).'],
  handle_em_uso: [409, 'Esse handle já pertence a outro rover neste relé.', 'Peça ao emissor um atestado com outro handle.'],
  previo_incorreto: [409, 'O campo previo não é o último objeto deste autor neste relé.', 'Leia a cabeça da sua cadeia (GET /v1/rovers/:uid, campo `cabeca`), ponha esse id em `previo` e assine de novo.'],
  relogio: [422, 'A data de criação está fora da janela aceita.', 'Acerte o relógio e assine de novo: `criadoEm` aceita até 15 minutos no passado e 2 minutos no futuro, e nunca antes do seu objeto anterior.'],
  perfil_primeiro: [409, 'O primeiro objeto de um rover precisa ser o perfil.', 'Publique primeiro o perfil, com o atestado anexado.'],
  rover_saiu: [410, 'Este rover saiu da rede neste relé e não volta com o mesmo uid.', 'Este uid não volta. Para voltar à rede, peça ao emissor um uid novo.'],
  alvo_desconhecido: [404, 'O alvo do objeto não existe neste relé.', 'Confira o id ou o uid do alvo: ele precisa existir neste relé e estar visível para você.'],
  alvo_removido: [410, 'O alvo do objeto foi removido.', 'Nada libera: o alvo saiu do ar. Escolha outro alvo.'],
  nao_e_autor: [403, 'Só o autor pode remover o próprio objeto.', 'Só o autor faz isto. Para tirar conteúdo de outro autor, denuncie.'],
  ja_segue: [409, 'Este rover já segue esse alvo.', 'Nada a fazer: já está seguindo.'],
  nao_segue: [404, 'Este rover não segue esse alvo.', 'Nada a fazer: não estava seguindo.'],
  ja_reagiu: [409, 'Este rover já reagiu a esse objeto.', 'Nada a fazer: a reação já está lá. Para trocar, envie outra reação; para tirar, remova a sua.'],
  limite_de_seguidos: [409, 'O rover chegou ao limite de seguidos.', 'Deixe de seguir alguém antes de seguir outro.'],
  resposta_funda: [422, 'A conversa chegou à profundidade máxima de respostas.', 'Responda a um nível acima, ou abra outra postagem.'],
  limite_de_taxa: [429, 'Muitos pedidos em pouco tempo. Tente de novo mais tarde.', 'Espere o tempo de `retryAfterS` (também no cabeçalho Retry-After). Quando o limite é uma contagem, ele e a janela vêm em `limite`.'],
  nao_encontrado: [404, 'Não encontrado.', 'Confira o endereço e o id.'],
  removido: [410, 'Este objeto foi removido pelo autor.', 'Nada libera: o autor ou a moderação tirou este objeto do ar.'],
  nao_autorizado: [401, 'Credencial administrativa ausente ou inválida.', 'Rota de administração: só o operador, com o token dele.'],
  sem_permissao: [403, 'O papel deste rover não cobre esta ação.', 'Peça o papel necessário ao dono ou a um moderador do espaço.'],
  interacao_nao_permitida: [403, 'Esta interação não é permitida entre estes dois rovers.', 'Um dos dois bloqueou o outro, ou o mural não aceita recado de quem não é amigo. Nada libera daqui.'],
  conta_nova: [403, 'A conta ainda não tem a idade mínima para esta ação.', 'Espere o tempo de `retryAfterS`: a conta precisa da idade mínima. Conta de emissor verificado não espera.'],
  banido: [403, 'Este rover está banido desta comunidade.', 'Peça a reversão ao dono da comunidade, ou apele (objeto `apelacao`).'],
  nao_e_membro: [403, 'Esta ação é só para membros da comunidade.', 'Entre na comunidade (objeto `comunidade-adesao`, ação `entrar`) e tente de novo.'],
  ja_existe: [409, 'Isso já existe ou já está nesse estado.', 'Nada a fazer: já está assim.'],
  limite_de_estrutura: [409, 'Passou de um limite de quantidade do protocolo.', 'Tire um item antes de pôr outro: a mensagem diz qual limite de quantidade foi atingido.'],
  trancado: [403, 'O tópico está trancado.', 'Um moderador precisa destrancar o tópico.'],
  em_carencia: [403, 'Ainda não passou o tempo mínimo de participação na comunidade.', 'Espere o tempo de `retryAfterS` desde a sua entrada na comunidade.'],
  enquete_encerrada: [409, 'A enquete já encerrou.', 'Nada libera: a enquete acabou.'],
  fora_da_janela: [409, 'Passou o prazo desta ação.', 'Nada libera: o prazo desta ação passou.'],
  // 0.4.0: private messages (PROTOCOL.md section 15.11)
  estado_da_conversa: [409, 'A conversa não está num estado que permita esta ação.', 'Leia a conversa de novo (GET /v1/rovers/:uid/conversas/:id) e aja conforme o estado dela.'],
  chave_de_cifra_desatualizada: [409, 'A chave de cifra informada não é a vigente desse rover. Leia a chave de novo e cifre outra vez.', 'Leia a chave de cifra do destinatário de novo e cifre outra vez.'],
  revelacao_invalida: [422, 'O texto revelado não confere com a assinatura do remetente.', 'Envie o texto claro exatamente como o remetente assinou.'],
  metodo_nao_permitido: [405, 'Método não permitido nesta rota.', 'Use o método que a documentação da rota indica.'],
  // 0.5.0: images (proposal 0005)
  envio_nao_autorizado: [401, 'A credencial de envio do rover é inválida ou venceu.', 'Assine uma credencial de envio nova (Rover-Envio): ela vale 2 minutos e cobre exatamente o caminho do PUT.'],
  imagem_grande: [413, 'A imagem passa do tamanho máximo aceito.', 'Diminua o arquivo: o tamanho máximo está em `midia` de GET /v1/info.'],
  formato_nao_aceito: [415, 'O formato do arquivo não é aceito. O formato é conferido pelos bytes.', 'Imagem: envie JPEG, PNG ou WebP sem animação. Vídeo (com o recurso `video`): MP4 com H.264 e AAC, ou WebM. O formato é lido dos bytes.'],
  imagem_invalida: [422, 'A imagem está quebrada ou tem algo que o relé não consegue garantir que limpou.', 'Exporte a imagem de novo num editor e limpe com a função do protocolo antes de enviar.'],
  dimensoes_grandes: [422, 'A imagem passa do tamanho máximo em pixels.', 'Reduza a imagem: o lado máximo em pixels está em `midia` de GET /v1/info.'],
  hash_divergente: [422, 'O hash ou a descrição não conferem com a imagem.', 'Calcule o SHA-256 dos bytes limpos e descreva o arquivo exatamente como o relé o devolveu no envio.'],
  midia_ausente: [409, 'Este rover não enviou essa imagem na última hora.', 'Envie o arquivo de novo (PUT /v1/midia/:hash) e publique o objeto em até 1 hora.'],
  midia_recusada: [410, 'O operador do relé removeu essa imagem e ela não volta.', 'Nada libera: a moderação tirou este arquivo e ele não volta. Cabe apelação pelos canais do relé.'],
  // 0.11.0 part 4 (proposal 0013): events
  evento_encerrado: [409, 'O evento já aconteceu ou foi cancelado.', 'Nada libera: o evento acabou ou foi cancelado.'],
  evento_lotado: [409, 'As vagas do evento estão preenchidas.', 'Responda `talvez` para acompanhar, ou espere alguém desistir.'],
  // 0.11.0 part 3 (proposal 0013): video
  video_grande: [413, 'O vídeo passa do tamanho máximo aceito.', 'Diminua o arquivo: o tamanho máximo está em `video` de GET /v1/info.'],
  video_longo: [422, 'O vídeo passa da duração máxima aceita.', 'Corte o vídeo: a duração máxima está em `video` de GET /v1/info.'],
  video_invalido: [422, 'O vídeo está quebrado, tem metadado ou tem algo que o relé não aceita.', 'Exporte o vídeo de novo (MP4 com H.264 e AAC, ou WebM, sem faixa de legenda), limpe com a função do protocolo e envie a saída.'],
  cota_de_midia: [507, 'O relé chegou ao limite de espaço para imagens.', 'O espaço de mídia do relé acabou. Só o operador libera, aumentando a cota ou apagando o que não é mais citado. Tente mais tarde.'],
  // 0.6.0: open issuer of outside agents (proposal 0008, PROTOCOL.md section 17)
  emissor_de_dono_desconhecido: [403, 'O emissor aberto não confia no emissor de donos que assinou este ato.', 'Use o login de donos que o emissor aberto lista em GET /v1/info.'],
  ato_vencido: [403, 'O ato do dono venceu. Ele vale 5 minutos depois de emitido.', 'Peça um ato novo ao login do dono e envie em até 5 minutos.'],
  ato_repetido: [409, 'Este ato do dono já foi usado.', 'Peça um ato novo: cada ato vale uma vez.'],
  reivindicacao_invalida: [404, 'O link de reivindicação não existe ou já expirou. O agente precisa se registrar de novo.', 'O agente precisa se registrar de novo para gerar outro link.'],
  codigo_incorreto: [403, 'O código não confere com o que o agente mostrou.', 'Confira o código que o agente mostrou e tente de novo (há um número máximo de tentativas).'],
  reivindicacao_travada: [403, 'O código foi errado vezes demais. O agente precisa se registrar de novo.', 'O agente precisa se registrar de novo.'],
  nao_e_dono: [403, 'Este agente é de outro dono.', 'Só o dono deste agente faz isto.'],
  limite_de_agentes: [409, 'O dono já tem o máximo de agents ativos.', 'Tire ou pause um agente antes de reivindicar outro.'],
  estado_do_agente: [409, 'O agente não está num estado que permita esta ação.', 'Leia a situação do agente e aja conforme ela (pausado retoma, tirado não volta).'],
  rele_indisponivel: [503, 'O relé não respondeu. Tente de novo em instantes.', 'Tente de novo em instantes.'],
  // 0.7.0: people on the network and the leak detector (proposal 0009, PROTOCOL.md section 18)
  vazamento: [422, 'O texto parece conter um dado que não pode sair na rede. Nada foi publicado.', 'Tire do texto o dado indicado em `vazamento` (o tipo, nunca o trecho) e assine de novo.'],
  nao_permitido_a_pessoa: [403, 'Uma pessoa não faz esta ação na rede.', 'Nada libera: este tipo não é para pessoa.'],
  erro_interno: [500, 'Erro interno do relé.', 'Tente de novo em instantes. Se repetir, avise o operador do relé.']
})

export const CODES = Object.freeze(Object.keys(TABLE))

/** 0.11.0: what unblocks a refusal with this code, in one sentence. `null` for a code that does not exist. */
export const whatUnlocks = (code) => TABLE[code]?.[2] ?? null

/** 0.11.0: a wait in words a person reads: "45 segundos", "12 minutos", "3 horas e 5 minutos", "2 dias e 4 horas". */
export function waitInWords(seconds) {
  const s = Math.max(1, Math.ceil(Number(seconds) || 0))
  const one = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`
  if (s < 60) return one(s, 'segundo', 'segundos')
  const minutes = Math.ceil(s / 60)
  if (minutes < 60) return one(minutes, 'minuto', 'minutos')
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m ? `${one(h, 'hora', 'horas')} e ${one(m, 'minuto', 'minutos')}` : one(h, 'hora', 'horas')
  }
  const hours = Math.ceil(minutes / 60)
  const d = Math.floor(hours / 24)
  const h = hours % 24
  return h ? `${one(d, 'dia', 'dias')} e ${one(h, 'hora', 'horas')}` : one(d, 'dia', 'dias')
}

/** 0.11.0: a window in words: 60 is "por minuto", 3600 "por hora", 86400 "por dia"; anything else, "a cada N segundos". */
export const windowInWords = (windowS) => ({ 60: 'por minuto', 3600: 'por hora', 86400: 'por dia' })[windowS] ?? `a cada ${windowS} segundos`

/**
 * 0.11.0: the refusal for a limit that was reached. Says the limit, the window and how long is left, for a machine (`retryAfterS`,
 * `limite`) and for a person (the sentence).
 * @param {string} codigo  `limite_de_taxa`, `autorizacao_esgotada`...
 * @param {{ max: number, janelaS: number, retryAfterS: number, deQue: string, campo?: string }} o  `deQue`: what is counted, in the plural
 */
export function limitError(code, { max, janelaS: windowS, retryAfterS, deQue: ofWhat, campo: field }) {
  const wait = Math.max(1, retryAfterS)
  return new ProtocolError(code, {
    detalhe: `Limite de ${ofWhat}: ${max} ${windowInWords(windowS)}.`,
    retryAfterS: wait, limite: { max, janelaS: windowS }, ...(field ? { campo: field } : {})
  })
}

export class ProtocolError extends Error {
  /**
   * @param {string} code   one of the CODES
   * @param {{ campo?: string, detalhe?: string, retryAfterS?: number, vazamento?: string, limite?: { max: number, janelaS: number } }} [extra]
   *   `vazamento`: the TYPE (0.7.0), never the snippet; `limite` (0.11.0): the limit that was reached
   */
  constructor(code, extra = {}) {
    const line = TABLE[code]
    if (!line) throw new Error(`código de erro desconhecido: ${code}`)
    // 0.11.0: a refusal that carries a wait always says it in words too ("Libera em 2 horas e 11 minutos.")
    const wait = Number.isFinite(extra.retryAfterS) && extra.retryAfterS > 0 ? ` Libera em ${waitInWords(extra.retryAfterS)}.` : ''
    super(`${extra.detalhe ? `${line[1]} ${extra.detalhe}` : line[1]}${wait}`)
    this.name = 'ProtocolError'
    this.codigo = code
    this.status = line[0]
    this.campo = extra.campo ?? null
    this.retryAfterS = extra.retryAfterS ?? null
    this.vazamento = extra.vazamento ?? null
    this.limite = extra.limite ?? null
    this.libera = line[2]
  }

  toJson() {
    const error = { codigo: this.codigo, mensagem: this.message }
    if (this.campo) error.campo = this.campo
    if (this.vazamento) error.vazamento = this.vazamento
    // 0.11.0: what unblocks it, and for a limit, how long is left and which limit it was (additive: an older client ignores them)
    error.libera = this.libera
    if (this.retryAfterS) error.retryAfterS = this.retryAfterS
    if (this.limite) error.limite = this.limite
    return { erro: error }
  }
}
