// SPDX-License-Identifier: AGPL-3.0-or-later
// Monta um relé em memória com relógio controlável e o provedor de teste.
import { randomBytes } from 'node:crypto'
import { ProvedorDeTeste } from '../../packages/rele/src/provedor-de-teste.js'
import { Armazem } from '../../packages/rele/src/armazem.js'
import { Rele } from '../../packages/rele/src/rele.js'
import { criarServidor } from '../../packages/rele/src/http.js'
import { EmissorAberto } from '../../packages/emissor-aberto/src/emissor.js'
import { EmissorDeDonosDeTeste } from '../../packages/emissor-aberto/src/emissor-de-donos-de-teste.js'
import { releLocal } from '../../packages/emissor-aberto/src/rele.js'
import { ProvedorComposto } from './provedor-composto.js'
import { EXIGE_APROVACAO, criarCredencialDeLeitura, gerarParDeChaves } from '../../packages/protocolo/src/index.js'
import { AGORA, novoHandle, novoUid, objetoDe, aprovar } from './mundo.js'

export function novoMundo(opcoes = {}) {
  const provedor = new ProvedorDeTeste()
  const relogio = { agora: opcoes.agora ?? AGORA }
  const armazem = new Armazem(':memory:')
  // Por padrão todo rover de teste nasce com conta de 30 dias, para os testes de regra não esbarrarem no teto de rover novo.
  // `novatos: true` desliga isso: a conta nasce agora, com idade zero (é o que os testes de conta nova usam).
  if (!opcoes.novatos) {
    armazem.db.exec('CREATE TRIGGER contas_adultas AFTER INSERT ON rovers BEGIN UPDATE rovers SET criado_em = criado_em - 2592000 WHERE uid = NEW.uid; END')
  }
  // 0.6.0: `emissorAberto: true` sobe um emissor aberto de agents de fora no mesmo processo (em produção é um serviço à parte), com um
  // emissor de donos de teste (o dublê do login Rovemark). O relé confia na chave dele e lê os revogados dele pelo provedor composto;
  // o emissor fala com o relé pelo adaptador local (o mesmo contrato do adaptador HTTP de produção).
  let emissor = null
  let donos = null
  let provedorDoRele = provedor
  if (opcoes.emissorAberto) {
    donos = new EmissorDeDonosDeTeste({ relogio: () => relogio.agora })
    emissor = new EmissorAberto({
      chavePrivada: gerarParDeChaves().chavePrivada, segredo: randomBytes(32), emissoresDeDonos: [donos.chavePublica],
      linkDeReivindicacao: 'https://folgali.test/reivindicar/', relogio: () => relogio.agora
    })
    provedorDoRele = new ProvedorComposto([provedor, emissor.provedor])
  }
  const rele = new Rele({
    armazem, provedor: provedorDoRele, relogio: () => relogio.agora, segredoDeDenuncias: randomBytes(32), taxas: opcoes.taxas, maxSeguidos: opcoes.maxSeguidos,
    aceitarAutorizacaoPermanente: opcoes.aceitarAutorizacaoPermanente, semFatorDeIdade: opcoes.semFatorDeIdade,
    midia: opcoes.midia, // 0.5.0: ausente = recurso desligado
    mensagens: opcoes.mensagens, // 0.4.0: ausente = recurso desligado
    emissoresDeAgentes: emissor ? [emissor.chavePublica] : []
  })
  emissor?.usarRele(releLocal(rele))
  return { provedor, relogio, armazem, rele, emissor, donos, novatos: Boolean(opcoes.novatos), avancar: (s) => { relogio.agora += s } }
}

/** Um rover de teste cujo atestado vem do provedor do mundo. Guarda a cabeça da cadeia para o próximo `previo`. */
export function novoRoverNoMundo(mundo, { handle = novoHandle(), validadeS = 30 * 86400 } = {}) {
  const rede = gerarParDeChaves()
  const aprovacao = gerarParDeChaves()
  const uid = novoUid()
  const atestado = mundo.provedor.emitir({ uid, handle, chave: rede.chavePublica, chaveAprovacao: aprovacao.chavePublica, emitidoEm: mundo.relogio.agora - 10, validadeS })
  return { uid, handle, rede, aprovacao, atestado, cabeca: null }
}

/** Publica um objeto do rover seguindo as regras (previo, aprovação quando exigida) e devolve o resultado do relé. */
export function publicar(mundo, rover, tipo, corpo, { comAtestado = false, aprovada = EXIGE_APROVACAO[tipo] === true, autorizacao, criadoEm, v } = {}) {
  const obj = objetoDe(rover, tipo, corpo, { criadoEm: criadoEm ?? mundo.relogio.agora, previo: tipo === 'denuncia' ? null : rover.cabeca, v })
  const envelope = { objeto: obj }
  if (comAtestado) envelope.atestado = rover.atestado
  if (autorizacao) envelope.autorizacao = autorizacao
  else if (aprovada) envelope.aprovacao = aprovar(rover, obj, { aprovadoEm: mundo.relogio.agora })
  const r = mundo.rele.aceitar(envelope)
  if (tipo !== 'denuncia' && r.estado === 'aceito') rover.cabeca = obj.id
  return { ...r, objeto: obj }
}

export const DIA = 86400

/**
 * Rover já registrado: perfil publicado com o atestado anexado. Por padrão ele é um rover ADULTO (conta de 30 dias, ver
 * `novoMundo`); com `novato: true` a conta nasce agora (idade zero).
 */
export function roverRegistrado(mundo, { grafo, exigirAprovacao, novato = false, perfil = {}, ...opcoes } = {}) {
  const rover = novoRoverNoMundo(mundo, opcoes)
  const extra = { ...perfil }
  if (grafo !== undefined) extra.grafo = grafo
  if (exigirAprovacao !== undefined) extra.exigirAprovacao = exigirAprovacao
  publicar(mundo, rover, 'perfil', { nome: 'Pipa', descricao: 'Rover de teste.', ...extra }, { comAtestado: true })
  if (novato && !mundo.novatos) envelhecer(mundo, rover, -30 * DIA)
  return rover
}

/** Faz a conta do rover parecer mais velha (o relé mede a idade desde o primeiro objeto visto). */
export function envelhecer(mundo, rover, segundos) {
  mundo.armazem.executar('UPDATE rovers SET criado_em = criado_em - :s WHERE uid = :uid', { s: segundos, uid: rover.uid })
}

/** Credencial de leitura do rover para um GET. `alvo` é o caminho com a consulta, exatamente como será pedido. */
export function credencialDe(mundo, rover, alvo, { t = mundo.relogio.agora, metodo = 'GET' } = {}) {
  return criarCredencialDeLeitura({ chavePrivada: rover.rede.chavePrivada, uid: rover.uid, alvo, t, metodo })
}

/** Roda `fn` e devolve o código do erro do protocolo, ou 'ok'. Qualquer outro erro sobe (seria bug). */
export function codigoDe(fn) {
  try {
    fn()
    return 'ok'
  } catch (e) {
    if (e?.codigo) return e.codigo
    throw e
  }
}

export function erroDe(fn) {
  try {
    fn()
  } catch (e) {
    if (e?.codigo) return e
    throw e
  }
  throw new Error('deveria ter lançado ErroDoProtocolo')
}

/** Envelope sem tocar na cadeia do rover: para testar recusas montando o objeto à mão. */
export function envelopeDe(mundo, rover, tipo, corpo, { previo = rover.cabeca, criadoEm, atestado = false, aprovacao = EXIGE_APROVACAO[tipo] === true, aprovadoEm, autorizacao } = {}) {
  const obj = objetoDe(rover, tipo, corpo, { criadoEm: criadoEm ?? mundo.relogio.agora, previo })
  const env = { objeto: obj }
  if (atestado) env.atestado = rover.atestado
  if (autorizacao) env.autorizacao = autorizacao
  else if (aprovacao) env.aprovacao = aprovar(rover, obj, { aprovadoEm: aprovadoEm ?? mundo.relogio.agora })
  return env
}

/** Como `codigoDe`, para o que devolve promessa (o emissor aberto). */
export async function codigoAsync(fn) {
  try {
    await fn()
    return 'ok'
  } catch (e) {
    if (e?.codigo) return e.codigo
    throw e
  }
}

export async function erroAsync(fn) {
  try {
    await fn()
  } catch (e) {
    if (e?.codigo) return e
    throw e
  }
  throw new Error('deveria ter lançado ErroDoProtocolo')
}
