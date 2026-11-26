// SPDX-License-Identifier: AGPL-3.0-or-later
// Builds an in-memory relay with a controllable clock and the test provider.
import { randomBytes } from 'node:crypto'
import { TestProvider } from '../../packages/relay/src/test-provider.js'
import { Store } from '../../packages/relay/src/store.js'
import { Relay } from '../../packages/relay/src/relay.js'
import { createRelayServer } from '../../packages/relay/src/http.js'
import { OpenIssuer } from '../../packages/open-issuer/src/issuer.js'
import { TestOwnerIssuer } from '../../packages/open-issuer/src/test-owners-issuer.js'
import { localRelay } from '../../packages/open-issuer/src/relay.js'
import { CompositeProvider } from './composite-provider.js'
import { TestPeopleIssuer } from '../../packages/relay/src/test-people-issuer.js'
import { StaticProvider } from '../../packages/relay/src/provider.js'
import { REQUIRES_APPROVAL, createReadCredential, generateKeyPair } from '../../packages/protocol/src/index.js'
import { NOW, newHandle, newUid, objectOf, approve } from './world.js'

export function newWorld(options = {}) {
  const provider = new TestProvider()
  const clock = { agora: options.agora ?? NOW }
  const store = new Store(':memory:')
  // By default every test rover starts with a 30-day-old account, so the rule tests do not hit the new-rover cap.
  // `newcomers: true` turns that off: the account starts now, with age zero (it is what the new-account tests use).
  if (!options.novatos) {
    store.db.exec('CREATE TRIGGER contas_adultas AFTER INSERT ON rovers BEGIN UPDATE rovers SET criado_em = criado_em - 2592000 WHERE uid = NEW.uid; END')
  }
  // 0.6.0: `openIssuer: true` starts an open issuer for outside agents in the same process (in production it is a separate service), with a
  // test owner issuer (the stand-in for the Rovemark login). The relay trusts its key and reads its revoked list through the composite provider;
  // the issuer talks to the relay through the local adapter (the same contract as the production HTTP adapter).
  let issuer = null
  let owners = null
  let relayProvider = provider
  if (options.openIssuer) {
    owners = new TestOwnerIssuer({ relogio: () => clock.agora })
    issuer = new OpenIssuer({
      chavePrivada: generateKeyPair().chavePrivada, segredo: randomBytes(32), ownerIssuers: [owners.publicKey],
      claimLink: 'https://folgali.test/reivindicar/', relogio: () => clock.agora
    })
    relayProvider = new CompositeProvider([provider, issuer.provedor])
  }
  // 0.7.0: `pessoas: true` turns on a test people issuer (the stand-in for the Rovemark login). Its key goes into the trusted issuers
  // through its own static provider (what the tests use to revoke a person) and into the relay list of people issuers.
  let people = null
  let personProvider = null
  if (options.pessoas) {
    people = new TestPeopleIssuer({ relogio: () => clock.agora })
    personProvider = new StaticProvider({ emissores: [people.publicKey], nome: 'pessoas' })
    relayProvider = new CompositeProvider([relayProvider, personProvider])
  }
  const relay = new Relay({
    store, provedor: relayProvider, relogio: () => clock.agora, reportSecret: randomBytes(32), rates: options.rates, maxFollowing: options.maxFollowing,
    aceitarAutorizacaoPermanente: options.aceitarAutorizacaoPermanente, semFatorDeIdade: options.semFatorDeIdade,
    midia: options.midia, // 0.5.0: absent = feature off
    mensagens: options.mensagens, // 0.4.0: absent = feature off
    emissoresDeAgentes: issuer ? [issuer.publicKey] : [],
    emissoresDePessoas: options.emissoresDePessoas ?? (people ? [people.publicKey] : []),
    // 0.10.1: `verificados: true` puts the test issuer on the verified list (accounts skip the account-age wait)
    // (0.11.0: with `pessoas` too, the person issuer is verified as well, as on folgali)
    emissoresVerificados: options.verificados ? [provider.publicKey, ...(people ? [people.publicKey] : [])] : [],
    filtroDeVazamento: options.filtroDeVazamento,
    aoRecusarVazamento: options.aoRecusarVazamento
  })
  issuer?.useRelay(localRelay(relay))
  return { provedor: provider, relogio: clock, store, rele: relay, emissor: issuer, donos: owners, pessoas: people, personProvider, novatos: Boolean(options.novatos), advance: (s) => { clock.agora += s } }
}

/** A test rover whose attestation comes from the world provider. Keeps the chain head for the next `previo`. */
export function newRoverInWorld(world, { handle = newHandle(), validadeS: validityS = 30 * 86400 } = {}) {
  const network = generateKeyPair()
  const approval = generateKeyPair()
  const uid = newUid()
  const attestation = world.provedor.issue({ uid, handle, chave: network.publicKey, chaveAprovacao: approval.publicKey, emitidoEm: world.relogio.agora - 10, validadeS: validityS })
  return { uid, handle, rede: network, aprovacao: approval, atestado: attestation, cabeca: null }
}

/** Publishes a rover object following the rules (previo, approval when required) and returns the relay result. */
export function publish(world, rover, type, body, { withAttestation = false, aprovada: approved = rover.especie !== 'pessoa' && REQUIRES_APPROVAL[type] === true, autorizacao: authorization, criadoEm: createdAt, v } = {}) {
  const obj = objectOf(rover, type, body, { criadoEm: createdAt ?? world.relogio.agora, previo: type === 'denuncia' ? null : rover.cabeca, v })
  const envelope = { objeto: obj }
  if (withAttestation) envelope.atestado = rover.atestado
  if (authorization) envelope.autorizacao = authorization
  else if (approved) envelope.aprovacao = approve(rover, obj, { aprovadoEm: world.relogio.agora })
  const r = world.rele.aceitar(envelope)
  if (type !== 'denuncia' && r.estado === 'aceito') rover.cabeca = obj.id
  return { ...r, objeto: obj }
}

export const DAY = 86400

/**
 * An already registered rover: profile published with the attestation attached. By default it is an ADULT rover (30-day account, see
 * `newWorld`); with `newcomer: true` the account starts now (age zero).
 */
export function registeredRover(world, { grafo: graph, exigirAprovacao: requireApproval, newcomer = false, perfil: profile = {}, ...options } = {}) {
  const rover = newRoverInWorld(world, options)
  const extra = { ...profile }
  if (graph !== undefined) extra.grafo = graph
  if (requireApproval !== undefined) extra.exigirAprovacao = requireApproval
  publish(world, rover, 'perfil', { nome: 'Pipa', descricao: 'Rover de teste.', ...extra }, { withAttestation: true })
  if (newcomer && !world.novatos) age(world, rover, -30 * DAY)
  return rover
}

/** Makes the rover account look older (the relay measures age from the first object seen). */
export function age(world, rover, seconds) {
  world.store.executar('UPDATE rovers SET criado_em = criado_em - :s WHERE uid = :uid', { s: seconds, uid: rover.uid })
}

/** Read credential of the rover for a GET. `alvo` is the path with the query, exactly as it will be requested. */
export function credentialOf(world, rover, target, { t = world.relogio.agora, metodo: method = 'GET' } = {}) {
  return createReadCredential({ chavePrivada: rover.rede.chavePrivada, uid: rover.uid, alvo: target, t, metodo: method })
}

/** Runs `fn` and returns the protocol error code, or 'ok'. Any other error is rethrown (it would be a bug). */
export function codeOf(fn) {
  try {
    fn()
    return 'ok'
  } catch (e) {
    if (e?.codigo) return e.codigo
    throw e
  }
}

export function errorOf(fn) {
  try {
    fn()
  } catch (e) {
    if (e?.codigo) return e
    throw e
  }
  throw new Error('deveria ter lançado ProtocolError')
}

/** Envelope without touching the rover chain: to test refusals by building the object by hand. */
export function envelopeOf(world, rover, type, body, { previo: previous = rover.cabeca, criadoEm: createdAt, atestado: attestation = false, aprovacao: approval = REQUIRES_APPROVAL[type] === true, aprovadoEm: approvedAt, autorizacao: authorization } = {}) {
  const obj = objectOf(rover, type, body, { criadoEm: createdAt ?? world.relogio.agora, previo: previous })
  const env = { objeto: obj }
  if (attestation) env.atestado = rover.atestado
  if (authorization) env.autorizacao = authorization
  else if (approval) env.aprovacao = approve(rover, obj, { aprovadoEm: approvedAt ?? world.relogio.agora })
  return env
}

/** Like `codeOf`, for what returns a promise (the open issuer). */
export async function codeAsync(fn) {
  try {
    await fn()
    return 'ok'
  } catch (e) {
    if (e?.codigo) return e.codigo
    throw e
  }
}

export async function errorAsync(fn) {
  try {
    await fn()
  } catch (e) {
    if (e?.codigo) return e
    throw e
  }
  throw new Error('deveria ter lançado ProtocolError')
}

// ---------- 0.7.0: people (proposal 0009) ----------

let personCounter = 0
/** The id of a person in the folgali scope, as the Rovemark login would give it: opaque, 16 to 64 base64url. */
export const newOwner = () => `pessoa_${(personCounter++).toString(36)}_${randomBytes(6).toString('hex')}`

/** A test person: a device key and the attestation from the world people issuer (`newWorld({ pessoas: true })`). */
export function newPersonInWorld(world, { handle = `pessoa.${newHandle().slice(6)}`, dono: owner = newOwner(), validadeS: validityS, emitidoEm: issuedAt = world.relogio.agora - 10 } = {}) {
  const network = generateKeyPair()
  const attestation = world.pessoas.issue({ dono: owner, chave: network.publicKey, handle, emitidoEm: issuedAt, ...(validityS ? { validadeS: validityS } : {}) })
  return { uid: attestation.uid, handle, dono: owner, rede: network, atestado: attestation, cabeca: null, especie: 'pessoa' }
}

/** A person already on the network: profile published with the attestation attached, without approval (they write for themselves). */
export function registeredPerson(world, { perfil: profile = {}, ...options } = {}) {
  const person = newPersonInWorld(world, options)
  publish(world, person, 'perfil', { nome: 'Ana', descricao: 'Pessoa de teste.', ...profile }, { withAttestation: true })
  return person
}
