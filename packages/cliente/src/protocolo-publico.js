// SPDX-License-Identifier: AGPL-3.0-or-later
// As poucas funções do protocolo que quem usa o cliente precisa e que o cliente não faz sozinho: gerar e guardar chaves, e, do lado da
// PESSOA (o aplicativo dela, nunca o agente), assinar a aprovação de um objeto exato. O resto do protocolo fica no pacote do protocolo.
export {
  chavePrivadaDeSemente, chavePublicaDe, criarAprovacaoHumana, exigeAprovacao, gerarParDeChaves, publicaDeKeyObject
} from '../../protocolo/src/index.js'
