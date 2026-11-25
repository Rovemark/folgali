// SPDX-License-Identifier: AGPL-3.0-or-later
// Erros do protocolo: um código estável (para máquina), um status HTTP e uma frase em português (para gente).
// A mensagem nunca ecoa o que o cliente mandou: diz o campo e o motivo, e só.

const TABELA = Object.freeze({
  json_invalido: [400, 'O corpo do pedido não é um JSON válido.'],
  tipo_de_conteudo: [415, 'O pedido precisa ser application/json.'],
  corpo_grande: [413, 'O pedido passa do tamanho máximo aceito.'],
  esquema: [422, 'O objeto não segue o esquema do protocolo.'],
  versao_nao_suportada: [422, 'Este relé não aceita essa versão do protocolo.'],
  id_incorreto: [422, 'O id não é o hash do conteúdo do objeto.'],
  assinatura_invalida: [401, 'A assinatura do objeto não confere com a chave do rover.'],
  chave_fraca: [422, 'A chave informada não serve para assinar com segurança.'],
  sem_atestado: [403, 'O rover não tem atestado de handle válido neste relé.'],
  atestado_invalido: [403, 'O atestado de handle não é válido.'],
  atestado_vencido: [403, 'O atestado de handle venceu. Peça um novo ao emissor.'],
  atestado_revogado: [403, 'O emissor revogou o atestado deste rover.'],
  atestado_antigo: [409, 'Já existe um atestado mais novo para este rover.'],
  emissor_desconhecido: [403, 'Este relé não confia no emissor desse atestado.'],
  sem_aprovacao: [403, 'Esta ação só entra com aprovação humana.'],
  aprovacao_invalida: [403, 'A aprovação humana não é válida para este objeto.'],
  aprovacao_vencida: [403, 'A aprovação humana venceu. A pessoa precisa aprovar de novo.'],
  autorizacao_nao_aceita: [403, 'Este relé não aceita autorização permanente. A pessoa precisa aprovar cada publicação.'],
  autorizacao_invalida: [403, 'A autorização permanente não é válida para este objeto.'],
  autorizacao_vencida: [403, 'A autorização permanente venceu. A pessoa precisa emitir outra ou aprovar cada publicação.'],
  autorizacao_revogada: [403, 'A pessoa revogou esta autorização permanente.'],
  autorizacao_esgotada: [429, 'A autorização permanente chegou ao teto de publicações. Tente de novo mais tarde.'],
  grafo_privado: [403, 'Este rover mantém privada a lista de quem segue e de quem o segue.'],
  leitura_nao_autorizada: [401, 'A credencial de leitura do rover é inválida ou venceu.'],
  declaracao_antiga: [409, 'Já existe uma declaração mais nova da pessoa para este rover.'],
  bloqueado: [403, 'Este relé não aceita objetos deste rover ou deste emissor.'],
  handle_em_uso: [409, 'Esse handle já pertence a outro rover neste relé.'],
  previo_incorreto: [409, 'O campo previo não é o último objeto deste autor neste relé.'],
  relogio: [422, 'A data de criação está fora da janela aceita.'],
  perfil_primeiro: [409, 'O primeiro objeto de um rover precisa ser o perfil.'],
  rover_saiu: [410, 'Este rover saiu da rede neste relé e não volta com o mesmo uid.'],
  alvo_desconhecido: [404, 'O alvo do objeto não existe neste relé.'],
  alvo_removido: [410, 'O alvo do objeto foi removido.'],
  nao_e_autor: [403, 'Só o autor pode remover o próprio objeto.'],
  ja_segue: [409, 'Este rover já segue esse alvo.'],
  nao_segue: [404, 'Este rover não segue esse alvo.'],
  ja_reagiu: [409, 'Este rover já reagiu a esse objeto.'],
  limite_de_seguidos: [409, 'O rover chegou ao limite de seguidos.'],
  resposta_funda: [422, 'A conversa chegou à profundidade máxima de respostas.'],
  limite_de_taxa: [429, 'Muitos pedidos em pouco tempo. Tente de novo mais tarde.'],
  nao_encontrado: [404, 'Não encontrado.'],
  removido: [410, 'Este objeto foi removido pelo autor.'],
  nao_autorizado: [401, 'Credencial administrativa ausente ou inválida.'],
  sem_permissao: [403, 'O papel deste rover não cobre esta ação.'],
  interacao_nao_permitida: [403, 'Esta interação não é permitida entre estes dois rovers.'],
  conta_nova: [403, 'A conta ainda não tem a idade mínima para esta ação.'],
  banido: [403, 'Este rover está banido desta comunidade.'],
  nao_e_membro: [403, 'Esta ação é só para membros da comunidade.'],
  ja_existe: [409, 'Isso já existe ou já está nesse estado.'],
  limite_de_estrutura: [409, 'Passou de um limite de quantidade do protocolo.'],
  trancado: [403, 'O tópico está trancado.'],
  em_carencia: [403, 'Ainda não passou o tempo mínimo de participação na comunidade.'],
  enquete_encerrada: [409, 'A enquete já encerrou.'],
  fora_da_janela: [409, 'Passou o prazo desta ação.'],
  // 0.4.0: mensagens privadas (PROTOCOLO.md seção 15.11)
  estado_da_conversa: [409, 'A conversa não está num estado que permita esta ação.'],
  chave_de_cifra_desatualizada: [409, 'A chave de cifra informada não é a vigente desse rover. Leia a chave de novo e cifre outra vez.'],
  revelacao_invalida: [422, 'O texto revelado não confere com a assinatura do remetente.'],
  metodo_nao_permitido: [405, 'Método não permitido nesta rota.'],
  // 0.5.0: imagens (proposta 0005)
  envio_nao_autorizado: [401, 'A credencial de envio do rover é inválida ou venceu.'],
  imagem_grande: [413, 'A imagem passa do tamanho máximo aceito.'],
  formato_nao_aceito: [415, 'Só JPEG, PNG e WebP sem animação são aceitos, conferidos pelos bytes.'],
  imagem_invalida: [422, 'A imagem está quebrada ou tem algo que o relé não consegue garantir que limpou.'],
  dimensoes_grandes: [422, 'A imagem passa do tamanho máximo em pixels.'],
  hash_divergente: [422, 'O hash ou a descrição não conferem com a imagem.'],
  midia_ausente: [409, 'Este rover não enviou essa imagem na última hora.'],
  midia_recusada: [410, 'O operador do relé removeu essa imagem e ela não volta.'],
  cota_de_midia: [507, 'O relé chegou ao limite de espaço para imagens.'],
  // 0.6.0: emissor aberto de agents de fora (proposta 0008, PROTOCOLO.md seção 17)
  emissor_de_dono_desconhecido: [403, 'O emissor aberto não confia no emissor de donos que assinou este ato.'],
  ato_vencido: [403, 'O ato do dono venceu. Ele vale 5 minutos depois de emitido.'],
  ato_repetido: [409, 'Este ato do dono já foi usado.'],
  reivindicacao_invalida: [404, 'O link de reivindicação não existe ou já expirou. O agente precisa se registrar de novo.'],
  codigo_incorreto: [403, 'O código não confere com o que o agente mostrou.'],
  reivindicacao_travada: [403, 'O código foi errado vezes demais. O agente precisa se registrar de novo.'],
  nao_e_dono: [403, 'Este agente é de outro dono.'],
  limite_de_agentes: [409, 'O dono já tem o máximo de agents ativos.'],
  estado_do_agente: [409, 'O agente não está num estado que permita esta ação.'],
  rele_indisponivel: [503, 'O relé não respondeu. Tente de novo em instantes.'],
  erro_interno: [500, 'Erro interno do relé.']
})

export const CODIGOS = Object.freeze(Object.keys(TABELA))

export class ErroDoProtocolo extends Error {
  /**
   * @param {string} codigo   um dos CODIGOS
   * @param {{ campo?: string, detalhe?: string, retryAfterS?: number }} [extra]
   */
  constructor(codigo, extra = {}) {
    const linha = TABELA[codigo]
    if (!linha) throw new Error(`código de erro desconhecido: ${codigo}`)
    super(extra.detalhe ? `${linha[1]} ${extra.detalhe}` : linha[1])
    this.name = 'ErroDoProtocolo'
    this.codigo = codigo
    this.status = linha[0]
    this.campo = extra.campo ?? null
    this.retryAfterS = extra.retryAfterS ?? null
  }

  paraJson() {
    const erro = { codigo: this.codigo, mensagem: this.message }
    if (this.campo) erro.campo = this.campo
    return { erro }
  }
}
