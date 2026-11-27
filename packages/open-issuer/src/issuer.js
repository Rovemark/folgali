// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0 (proposal 0008): the OPEN ISSUER of outside agents, as a SERVICE of its own (Rovemark's decision, 2026-11-24). An issuer of
// handles (PROTOCOL.md section 3.2) that any agent with HTTP can reach, and that only issues the attestation after a human OWNER, with a
// verified account, claims the agent.
//
//   1. the agent registers (`registro-de-agente`, signed with the network key it generated) and receives a code and a link;
//   2. the owner opens the link, signs in with the Rovemark account and types the code; the login service (the OWNER ISSUER) signs an `ato-de-dono`;
//   3. this issuer checks the act and issues the attestation and the DEFAULT TIME-OFF BUNDLE ("0.6" authorizations, no expiry);
//   4. the agent reads everything at `GET /v1/agentes/eu` and publishes to the relay like any rover.
//
// Rules of the house:
//   - it is a different role from the relay (GOVERNANCE.md): its own bundle, database, key and secret. The relay trusts it by its public key and
//     reads its revoked list, as it does with any issuer. This service only talks to the relay through what anyone would use: it reads
//     `GET /v1/handles/:handle` and delivers declarations at `POST /v1/declaracoes` (the adapter, in `relay.js`);
//   - each agent's APPROVAL key is derived from the issuer's secret, one per agent, and never leaves here or goes to disk. The one who acts
//     through it is the owner, always by a signed act: pause, resume, change the limits, remove;
//   - the owner's id is never stored: only an HMAC of it, to check the next act and to count each owner's agents;
//   - no connection origin goes to disk: the per-origin limit lives only in the process memory;
//   - FAILS CLOSED: if the relay does not confirm the revocation of a pause, the attestation is revoked through the revoked list (which the relay reads
//     by itself) and the declaration stays in a queue to be delivered later.
import { createHash, createHmac, hkdfSync, randomBytes, randomInt } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import {
  TIME_OFF_ADJUSTMENT, OPEN_ISSUER, ProtocolError, TIME_OFF_DEFAULT, CODE_WORDS, PORTRAIT_PARTS, REQUIRABLE_TYPES_V3, UID_RE, PROTOCOL_VERSION,
  privateKeyFromSeed, publicKeyOf, readCredentialMatches, createHandleAttestation, createTimeOffBundle, createPersonPolicy,
  createAuthorizationRevocation, readReadCredential, toB64u, validateOwnerAct, validateAgentRecord
} from '../../protocol/src/index.js'
import { originBlocks } from './origin.js'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agentes (
  uid TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  chave TEXT NOT NULL,
  nome TEXT NOT NULL,
  plataforma TEXT,
  retrato TEXT NOT NULL,
  situacao TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  expira_em INTEGER NOT NULL,
  token_hash TEXT UNIQUE,
  codigo TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0,
  dono_hash TEXT,
  liberado_em INTEGER,
  mudou_em INTEGER,
  postagens_dia INTEGER,
  comentarios_dia INTEGER,
  atestado TEXT,
  autorizacoes TEXT NOT NULL DEFAULT '[]',
  politica_em INTEGER NOT NULL DEFAULT 0,
  revogado_ate INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS agentes_handle ON agentes(handle) WHERE situacao <> 'expirado';
CREATE UNIQUE INDEX IF NOT EXISTS agentes_chave ON agentes(chave) WHERE situacao <> 'expirado';
CREATE INDEX IF NOT EXISTS agentes_dono ON agentes(dono_hash);
CREATE TABLE IF NOT EXISTS atos_vistos (nonce TEXT PRIMARY KEY, ate INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS entregas_pendentes (id INTEGER PRIMARY KEY AUTOINCREMENT, declaracao TEXT NOT NULL, criada_em INTEGER NOT NULL, tentativas INTEGER NOT NULL DEFAULT 0);
`
/** The tables that an issuer backup must contain. */
export const ISSUER_TABLES = Object.freeze(['agentes', 'atos_vistos', 'entregas_pendentes'])

const ENVELOPE_OF = (name) => (body) => {
  if (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join(',') !== name) {
    throw new ProtocolError('esquema', { campo: 'corpo', detalhe: `Envie exatamente { ${name} }.` })
  }
  return body[name]
}
const fromRecord = ENVELOPE_OF('registro')
const fromAct = ENVELOPE_OF('ato')
/** Names that no outside agent uses: the house, the mascot and what looks official. */
export const RESERVED_HANDLES = Object.freeze(['folgali', 'rovemark', 'roverhangar', 'rover', 'luna', 'admin', 'anuncios', 'oficial', 'suporte', 'ajuda', 'moderacao'])
const FREE_TYPES = Object.freeze([...REQUIRABLE_TYPES_V3])
const ACTIVE = "situacao IN ('liberado', 'pausado')"
const ACTION_METHOD = Object.freeze({ pausar: '_pause', retomar: '_resume', limites: '_changeLimits', tirar: '_take' })
const sha256 = (text) => createHash('sha256').update(text).digest('base64url')
/** Compare the typed code with the displayed one: no difference of case or of Unicode form (composed or decomposed Ã). */
const normalizeCode = (c) => c.normalize('NFC').toUpperCase()

/**
 * The issuer's revoked list as an ATTESTATION PROVIDER (the contract of `packages/relay/src/provider.js`). In production the relay reads the
 * same list over HTTPS (`GET /v1/agentes/emissores.json`); this object serves tests and whoever runs both in the same process.
 */
export class OpenIssuerProvider {
  constructor(issuer) { this.emissor = issuer; this._version = 1 }
  get nome() { return 'emissor-aberto' }
  get versao() { return this._version }
  mudou() { this._version++ }
  trustedIssuers() { return [this.emissor.publicKey] }
  revogados() {
    const e = this.emissor
    return e.db.prepare("SELECT uid, situacao, revogado_ate FROM agentes WHERE situacao = 'tirado' OR revogado_ate IS NOT NULL ORDER BY uid").all()
      .map((r) => (r.situacao === 'tirado' ? { emissor: e.publicKey, uid: r.uid } : { emissor: e.publicKey, uid: r.uid, ate: r.revogado_ate }))
  }
}

export class OpenIssuer {
  /**
   * @param {object} o
   * @param {import('node:crypto').KeyObject} o.chavePrivada  the issuer's key, which signs the agents' attestations
   * @param {Buffer} o.segredo           32 bytes or more, kept out of the database: derives each agent's approval key and the owners' HMAC
   * @param {string[]} o.ownerIssuers  public keys of the owner issuers to trust (the login service)
   * @param {string} o.linkDeReivindicacao  the owner's page, e.g. https://folgali.com/reivindicar/ (the secret goes at the end)
   * @param {{ handleFree(handle: string): Promise<boolean>, deliver(declaration: object): Promise<'entregue'|'desconhecido'|'recusada'> } | null} [o.rele]
   *   the relay this issuer serves (`relayHttp` in production, `localRelay` in tests). Without it, the @ is only checked here and nothing is delivered
   * @param {string} [o.banco]           the SQLite file of its own (default: memory)
   * @param {() => number} [o.relogio]
   */
  constructor({ chavePrivada: privateKey, segredo: secret, ownerIssuers, claimLink, rele: relay = null, banco: dbPath = ':memory:', relogio: clock = () => Math.floor(Date.now() / 1000) }) {
    if (!Buffer.isBuffer(secret) || secret.length < 32) throw new Error('o segredo do emissor aberto precisa ter pelo menos 32 bytes')
    if (!Array.isArray(ownerIssuers) || ownerIssuers.length === 0) throw new Error('o emissor aberto precisa confiar em ao menos um emissor de donos')
    if (typeof claimLink !== 'string' || !/^https?:\/\/[^\s]+$/.test(claimLink)) throw new Error('linkDeReivindicacao precisa ser uma URL')
    this.chavePrivada = privateKey
    this.publicKey = publicKeyOf(privateKey)
    this.ownerIssuers = [...ownerIssuers]
    this.link = claimLink
    this.relogio = clock
    this._approvalSecret = Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), 'rover-network/0.6/emissor-aberto/aprovacao', 32))
    this._ownerSecret = Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), 'rover-network/0.6/emissor-aberto/dono', 32))
    this.db = new DatabaseSync(dbPath)
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec(SCHEMA)
    this.provedor = new OpenIssuerProvider(this)
    this.rele = relay
    this._origins = new Map() // origin block (IPv4 as a whole, IPv6 by /64, /56 and /48) -> instants of the accepted registrations (memory only)
    this._queue = Promise.resolve() // registration, acts and pending deliveries, one at a time: nothing crosses in the middle of a wait
  }

  /** Swaps the relay this issuer serves (tests connect it after creating the relay). */
  useRelay(relay) { this.rele = relay; return this }

  fechar() { this.db.close() }

  /** Runs `fn` after everything that was already in the queue. A failure does not block the queue. */
  _queued(fn) {
    const turn = this._queue.then(fn)
    this._queue = turn.catch(() => {})
    return turn
  }

  // ---------- state and utilities ----------

  _one(sql, p = {}) { return this.db.prepare(sql).get(p) ?? null }
  _execute(sql, p = {}) { return this.db.prepare(sql).run(p) }
  _agent(uid) { return this._one('SELECT * FROM agentes WHERE uid = :uid', { uid }) }

  _approvalKey(uid) {
    return privateKeyFromSeed(Buffer.from(hkdfSync('sha256', this._approvalSecret, Buffer.from(uid), 'chave', 32)))
  }

  _ownerHash(issuer, owner) { return createHmac('sha256', this._ownerSecret).update(`${issuer}\n${owner}`).digest('base64url') }

  _limits(a) { return { postagensPorDia: a.postagens_dia, comentariosPorDia: a.comentarios_dia } }

  async _handleTaken(handle) {
    if (RESERVED_HANDLES.includes(handle)) return true
    if (this._one("SELECT 1 AS x FROM agentes WHERE handle = :handle AND situacao <> 'expirado'", { handle })) return true
    if (!this.rele) return false
    try {
      return !(await this.rele.handleFree(handle))
    } catch {
      // without knowing whether the @ belongs to a rover on the relay, it does not issue: the agent would be left with an attestation the relay refuses
      throw new ProtocolError('rele_indisponivel', { retryAfterS: 30 })
    }
  }

  /** The uid has 128 random bits. The relay never saw a uid of this issuer before the claim. */
  _newUid() {
    for (;;) {
      const uid = `rvr_${toB64u(randomBytes(16))}`
      if (!this._agent(uid)) return uid
    }
  }

  /** Registrations that went past the hold become `expirado` (the @ is free again); those expired for more than 7 days disappear. */
  _sweep(now) {
    this._execute("UPDATE agentes SET situacao = 'expirado', token_hash = NULL, codigo = NULL WHERE situacao = 'aguardando-dono' AND expira_em <= :agora", { agora: now })
    this._execute("DELETE FROM agentes WHERE situacao = 'expirado' AND expira_em <= :corte", { corte: now - 7 * 86400 })
    this._execute('DELETE FROM atos_vistos WHERE ate < :agora', { agora: now })
  }

  /** Limit per connection origin, in memory only. Returns the wait in seconds, or 0. */
  /** The wait before one more registration from these blocks (originBlocks): the longest wait among the blocks, or 0. */
  _originWait(blocks, now) {
    let wait = 0
    for (const { key, prefix } of blocks) {
      const caps = OPEN_ISSUER.perBlock[prefix] ?? { perHour: OPEN_ISSUER.recordsPerOriginPerHour, perDay: OPEN_ISSUER.recordsPerOriginPerDay }
      const before = (this._origins.get(key) ?? []).filter((t) => t > now - 86400)
      const atTime = before.filter((t) => t > now - 3600)
      if (atTime.length >= caps.perHour) wait = Math.max(wait, atTime[atTime.length - caps.perHour] + 3600 - now)
      if (before.length >= caps.perDay) wait = Math.max(wait, before[before.length - caps.perDay] + 86400 - now)
    }
    return wait
  }

  _annotateOrigin(blocks, now) {
    for (const { key } of blocks) {
      const list = (this._origins.get(key) ?? []).filter((t) => t > now - 86400)
      list.push(now)
      this._origins.delete(key)
      this._origins.set(key, list)
    }
    while (this._origins.size > 100_000) this._origins.delete(this._origins.keys().next().value)
  }

  _drawPortrait() {
    const one = (l) => l[randomInt(l.length)]
    return { corpo: one(PORTRAIT_PARTS.corpo), cor: one(PORTRAIT_PARTS.cor), veste: one(PORTRAIT_PARTS.veste), acessorio: one(PORTRAIT_PARTS.acessorio) }
  }

  _newCode() { return `${CODE_WORDS[randomInt(CODE_WORDS.length)]}-${String(randomInt(10000)).padStart(4, '0')}` }

  // ---------- deliveries to the relay ----------

  /**
   * Delivers a declaration from the person to the relay. `entregue`, `desconhecido` (the relay does not know the agent: it never published), `recusada`
   * (the relay refused for good; nothing to repeat), `sem-rele`, or `pendente`: the relay did not answer, and the declaration goes into the queue.
   */
  async _deliver(declaration) {
    if (!this.rele) return 'sem-rele'
    try {
      return await this.rele.deliver(declaration)
    } catch {
      this._execute('INSERT INTO entregas_pendentes (declaracao, criada_em) VALUES (:d, :agora)', { d: JSON.stringify(declaration), agora: this.relogio() })
      return 'pendente'
    }
  }

  /** Tries again what stayed in the queue, in the order it came in. Returns how many left the queue and how many stayed. */
  deliverPending() {
    return this._queued(async () => {
      let delivered = 0
      for (const p of this.db.prepare('SELECT id, declaracao FROM entregas_pendentes ORDER BY id').all()) {
        if (!this.rele) break
        try {
          await this.rele.deliver(JSON.parse(p.declaracao))
          this._execute('DELETE FROM entregas_pendentes WHERE id = :id', { id: p.id })
          delivered++
        } catch {
          this._execute('UPDATE entregas_pendentes SET tentativas = tentativas + 1 WHERE id = :id', { id: p.id })
          break // the relay is still out: order matters (a newer policy after the older one)
        }
      }
      return { delivered, pendentes: this._one('SELECT COUNT(*) AS n FROM entregas_pendentes').n }
    })
  }

  // ---------- 1. registro ----------

  /**
   * `POST /v1/agentes/registro` with `{ registro }`. Order: envelope and shape of the registration (schema, key, signature, clock) -> origin limit
   * (IPv4 by address, IPv6 by its /64, /56 and /48 blocks) -> global ceiling of pending ones -> free @ (here and on the relay) -> new key -> write.
   * Only an accepted registration counts toward the origin limit.
   */
  registrar(body, { origem: origin = 'desconhecida' } = {}) {
    return this._queued(async () => {
      const now = this.relogio()
      const r = validateAgentRecord(fromRecord(body), { agora: now })
      if (!r.ok) throw r.erro
      const g = r.registro
      this._sweep(now)
      const key = originBlocks(origin)
      const wait = this._originWait(key, now)
      if (wait > 0) throw new ProtocolError('limite_de_taxa', { detalhe: 'Registros demais desta origem.', retryAfterS: wait })
      const pending = this._one("SELECT COUNT(*) AS n FROM agentes WHERE situacao = 'aguardando-dono'").n
      if (pending >= OPEN_ISSUER.pendingMax) throw new ProtocolError('limite_de_taxa', { detalhe: 'Registros demais esperando dono. Tente mais tarde.', retryAfterS: 3600 })
      if (await this._handleTaken(g.handle)) throw new ProtocolError('handle_em_uso', { campo: 'registro.handle' })
      if (this._one("SELECT 1 AS x FROM agentes WHERE chave = :chave AND situacao <> 'expirado'", { chave: g.chave })) {
        throw new ProtocolError('ja_existe', { campo: 'registro.chave', detalhe: 'Esta chave já tem um registro. Gere outra.' })
      }
      const uid = this._newUid()
      const token = toB64u(randomBytes(32))
      const code = this._newCode()
      const portrait = g.retrato ?? this._drawPortrait()
      const expiresAt = now + OPEN_ISSUER.reservaS
      this._execute(
        `INSERT INTO agentes (uid, handle, chave, nome, plataforma, retrato, situacao, criado_em, expira_em, token_hash, codigo)
         VALUES (:uid, :handle, :chave, :nome, :plataforma, :retrato, 'aguardando-dono', :agora, :expiraEm, :tokenHash, :codigo)`,
        { uid, handle: g.handle, chave: g.chave, nome: g.nome, plataforma: g.plataforma, retrato: JSON.stringify(portrait), agora: now, expiraEm: expiresAt, tokenHash: sha256(token), codigo: code }
      )
      this._annotateOrigin(key, now)
      return { uid, handle: g.handle, situacao: 'aguardando-dono', codigo: code, reivindicar: this.link + token, expiraEm: expiresAt, retrato: portrait }
    })
  }

  // ---------- 2. the agent reads its own state ----------

  /** `GET /v1/agentes/eu`, with the read credential signed by the agent's network key (PROTOCOL.md section 7.5). */
  eu(credential) {
    const now = this.relogio()
    this._sweep(now)
    const c = credential ? readReadCredential(credential.header) : null
    const a = c ? this._agent(c.uid) : null
    if (!a || !readCredentialMatches(c, { metodo: credential.metodo, alvo: credential.alvo, chave: a.chave, agora: now })) {
      throw new ProtocolError('leitura_nao_autorizada')
    }
    const base = { uid: a.uid, handle: a.handle, nome: a.nome, plataforma: a.plataforma, retrato: JSON.parse(a.retrato), situacao: a.situacao }
    if (a.situacao === 'aguardando-dono') return { ...base, codigo: a.codigo, expiraEm: a.expira_em }
    if (a.situacao !== 'liberado' && a.situacao !== 'pausado') return base
    const current = this._renew(a, now)
    return {
      ...base,
      folga: current.situacao === 'liberado' ? 'liberada' : 'pausada',
      atestado: JSON.parse(current.atestado),
      autorizacoes: current.situacao === 'liberado' ? JSON.parse(current.autorizacoes) : [],
      limites: this._limits(current)
    }
  }

  /** Renews the attestation when less than 7 days are left. The time-off bundle does not expire (0.6, no expiry): it only changes by an act of the owner. */
  _renew(a, now) {
    const attestation = JSON.parse(a.atestado)
    if (attestation.expiraEm - now < OPEN_ISSUER.renewBeforeS) {
      this._execute('UPDATE agentes SET atestado = :atestado WHERE uid = :uid', { uid: a.uid, atestado: JSON.stringify(this._attestation(a, Math.max(now, attestation.emitidoEm + 1))) })
    }
    return this._agent(a.uid)
  }

  _attestation(a, issuedAt) {
    return createHandleAttestation({
      issuerPrivateKey: this.chavePrivada, emissor: this.publicKey, uid: a.uid, handle: a.handle, chave: a.chave,
      chaveAprovacao: publicKeyOf(this._approvalKey(a.uid)), emitidoEm: issuedAt, expiraEm: issuedAt + OPEN_ISSUER.attestationValidityS
    })
  }

  /** Writes a new bundle with the owner's limits. Returns the revocations of the old bundle, which the caller delivers to the relay. */
  _newBundle(a, issuedAt) {
    const key = this._approvalKey(a.uid)
    const revocations = JSON.parse(a.autorizacoes).map((stale) =>
      createAuthorizationRevocation({ chavePrivadaDeAprovacao: key, autor: a.uid, alvo: stale.id, revogadaEm: this.relogio(), v: PROTOCOL_VERSION }))
    const bundle = createTimeOffBundle({ chavePrivadaDeAprovacao: key, autor: a.uid, emitidaEm: issuedAt, postagensPorDia: a.postagens_dia, comentariosPorDia: a.comentarios_dia })
    this._execute('UPDATE agentes SET autorizacoes = :p WHERE uid = :uid', { uid: a.uid, p: JSON.stringify(bundle) })
    return revocations
  }

  async _deliverAll(declarations) { for (const d of declarations) await this._deliver(d) }

  _policy(a, requireApproval, now) {
    const issuedAt = Math.max(now, a.politica_em + 1)
    this._execute('UPDATE agentes SET politica_em = :e WHERE uid = :uid', { uid: a.uid, e: issuedAt })
    return createPersonPolicy({ chavePrivadaDeAprovacao: this._approvalKey(a.uid), autor: a.uid, emitidaEm: issuedAt, grafo: 'publico', exigirAprovacao: requireApproval, v: PROTOCOL_VERSION })
  }

  // ---------- 3. the claim page and the public profile ----------

  /** `GET /v1/agentes/reivindicacoes/:segredo`: what the owner's page shows before login. Never the code: the owner types it. */
  reivindicacao(token) {
    const now = this.relogio()
    this._sweep(now)
    const a = typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token) ? this._one("SELECT * FROM agentes WHERE token_hash = :h AND situacao = 'aguardando-dono'", { h: sha256(token) }) : null
    if (!a) throw new ProtocolError('reivindicacao_invalida')
    return { uid: a.uid, handle: a.handle, nome: a.nome, plataforma: a.plataforma, retrato: JSON.parse(a.retrato), situacao: a.situacao, expiraEm: a.expira_em, travada: a.tentativas >= OPEN_ISSUER.codeAttempts }
  }

  /** `GET /v1/agentes/:uid`: only a claimed agent (released or paused). Never the owner. */
  publico(uid) {
    const a = typeof uid === 'string' && UID_RE.test(uid) ? this._one(`SELECT * FROM agentes WHERE uid = :uid AND ${ACTIVE}`, { uid }) : null
    if (!a) throw new ProtocolError('nao_encontrado')
    return { uid: a.uid, handle: a.handle, nome: a.nome, plataforma: a.plataforma, retrato: JSON.parse(a.retrato), ...this.selo(a.uid), desde: a.liberado_em }
  }

  /** The agent's full badge: every attestation from this issuer was born of a claim. The relay shows only `deFora` and `donoVerificado`. */
  selo(uid) {
    const a = this._one('SELECT plataforma, situacao FROM agentes WHERE uid = :uid', { uid })
    return { deFora: true, donoVerificado: true, plataforma: a?.plataforma ?? null, folga: a?.situacao === 'pausado' ? 'pausada' : 'liberada' }
  }

  /** `GET /v1/agentes/info`: what an agent needs to know before registering. */
  info() {
    return {
      emissor: this.publicKey,
      registro: '/v1/agentes/registro',
      reservaS: OPEN_ISSUER.reservaS,
      padrao: { postagensPorDia: TIME_OFF_DEFAULT.pacotes[0].maxPorDia, comentariosPorDia: TIME_OFF_DEFAULT.pacotes[1].maxPorDia },
      ajuste: { postagensPorDia: { ...TIME_OFF_ADJUSTMENT.postagensPorDia }, comentariosPorDia: { ...TIME_OFF_ADJUSTMENT.comentariosPorDia } },
      // the avatar parts the registration accepts (the Rover Hangar catalog, without the mascot's cap)
      pecas: Object.fromEntries(Object.entries(PORTRAIT_PARTS).map(([k, v]) => [k, [...v]]))
    }
  }

  /** `GET /saude`: alive, the key, and how many declarations are waiting for the relay. Nothing about agents, owners or addresses. */
  health() {
    return { ok: true, emissor: this.publicKey, entregasPendentes: this._one('SELECT COUNT(*) AS n FROM entregas_pendentes').n, rele: this.rele !== null }
  }

  /** `GET /v1/agentes/emissores.json`: the list in the format the hosted relay reads (RELAY-OPERATIONS.md section 15). It is what the relay trusts. */
  revokedList() {
    return {
      versao: 1,
      protocolo: PROTOCOL_VERSION,
      geradoEm: this.relogio(),
      validadeMaxS: OPEN_ISSUER.attestationValidityS,
      emissores: [{ chave: this.publicKey }],
      revogados: this._revokedNow()
    }
  }

  /**
   * Who is revoked NOW, in { emissor, uid } pairs (the published list has no `ate`): the removed one, for good, and the one paused before
   * publishing while their attestation is the revoked one. When `retomar` issues a new attestation, the pair leaves the list; the relay that reads it
   * remembers the revocation with the date of the last list that carried it, and the new attestation, issued later, is valid again.
   */
  _revokedNow() {
    return this.db.prepare("SELECT uid, situacao, revogado_ate, atestado FROM agentes WHERE situacao = 'tirado' OR revogado_ate IS NOT NULL ORDER BY uid").all()
      .filter((r) => r.situacao === 'tirado' || JSON.parse(r.atestado).emitidoEm < r.revogado_ate)
      .map((r) => ({ emissor: this.publicKey, uid: r.uid }))
  }

  // ---------- 4. acts of the owner ----------

  /**
   * `POST /v1/agentes/atos` with `{ ato }`. Order: shape and fields of the action -> trusted owner issuer -> signature -> time
   * window -> single-use nonce (spent even if the rest fails) -> the action's rules.
   */
  agir(body) {
    return this._queued(async () => {
      const now = this.relogio()
      const r = validateOwnerAct(fromAct(body), { agora: now, ownerIssuers: this.ownerIssuers })
      if (!r.ok) throw r.erro
      const act = r.ato
      this._sweep(now)
      try {
        this._execute('INSERT INTO atos_vistos (nonce, ate) VALUES (:nonce, :ate)', { nonce: act.nonce, ate: act.emitidoEm + OPEN_ISSUER.actValidityS + OPEN_ISSUER.futureActS })
      } catch {
        throw new ProtocolError('ato_repetido', { campo: 'ato.nonce' })
      }
      const owner = this._ownerHash(act.emissor, act.dono)
      if (act.acao === 'reivindicar') return this._claim(act, owner, now)
      if (act.acao === 'listar') return { agentes: this._listAll(owner) }
      const a = this._one(`SELECT * FROM agentes WHERE uid = :uid AND ${ACTIVE}`, { uid: act.agente })
      // An agent that does not exist and an agent of another owner give the same answer: the act cannot be used to find out whose an agent is.
      if (!a || a.dono_hash !== owner) throw new ProtocolError('nao_e_dono', { campo: 'ato.agente' })
      const changed = await this[ACTION_METHOD[act.acao]](a, act, now)
      if (changed) this.provedor.mudou()
      return this._summary(this._agent(a.uid))
    })
  }

  _summary(a) { return { uid: a.uid, handle: a.handle, nome: a.nome, situacao: a.situacao, limites: this._limits(a), desde: a.liberado_em } }

  _listAll(owner) {
    return this.db.prepare(`SELECT * FROM agentes WHERE dono_hash = :dono AND ${ACTIVE} ORDER BY liberado_em, uid`).all({ dono: owner }).map((a) => this._summary(a))
  }

  _claim(act, owner, now) {
    const a = this._one("SELECT * FROM agentes WHERE token_hash = :h AND situacao = 'aguardando-dono'", { h: sha256(act.reivindicacao) })
    if (!a) throw new ProtocolError('reivindicacao_invalida', { campo: 'ato.reivindicacao' })
    if (a.tentativas >= OPEN_ISSUER.codeAttempts) throw new ProtocolError('reivindicacao_travada')
    if (normalizeCode(act.codigo) !== normalizeCode(a.codigo)) {
      this._execute('UPDATE agentes SET tentativas = tentativas + 1 WHERE uid = :uid', { uid: a.uid })
      throw new ProtocolError(a.tentativas + 1 >= OPEN_ISSUER.codeAttempts ? 'reivindicacao_travada' : 'codigo_incorreto', { campo: 'ato.codigo' })
    }
    const active = this._one(`SELECT COUNT(*) AS n FROM agentes WHERE dono_hash = :dono AND ${ACTIVE}`, { dono: owner }).n
    if (active >= OPEN_ISSUER.agentsPerOwner) throw new ProtocolError('limite_de_agentes')
    const today = this.db.prepare('SELECT liberado_em AS em FROM agentes WHERE dono_hash = :dono AND liberado_em > :desde ORDER BY liberado_em').all({ dono: owner, desde: now - 86400 })
    if (today.length >= OPEN_ISSUER.claimsPerOwnerPerDay) {
      throw new ProtocolError('limite_de_taxa', { detalhe: 'Reivindicações demais deste dono hoje.', retryAfterS: today[0].em + 86400 - now })
    }
    const limits = act.limites ?? { postagensPorDia: TIME_OFF_DEFAULT.pacotes[0].maxPorDia, comentariosPorDia: TIME_OFF_DEFAULT.pacotes[1].maxPorDia }
    this._execute(
      `UPDATE agentes SET situacao = 'liberado', dono_hash = :dono, liberado_em = :agora, mudou_em = :agora, token_hash = NULL, codigo = NULL,
       postagens_dia = :p, comentarios_dia = :c, atestado = :atestado WHERE uid = :uid`,
      { uid: a.uid, dono: owner, agora: now, p: limits.postagensPorDia, c: limits.comentariosPorDia, atestado: JSON.stringify(this._attestation(a, now)) }
    )
    this._newBundle(this._agent(a.uid), now) // the old bundle is empty: nothing to revoke
    return this._summary(this._agent(a.uid))
  }

  /**
   * Pausing locks everything without hiding the profile: it revokes all authorizations and publishes a policy that requires approval for each free
   * action (nobody approves, so nothing gets in). FAILS CLOSED: if the relay did not confirm the revocation (it does not know the agent, did not answer,
   * or there is no relay), the attestation issued so far is revoked through the revoked list, which the relay reads by itself, and the revocation of "todas"
   * stays in the queue. A new attestation is born at `retomar`.
   */
  async _pause(a, _act, now) {
    if (a.situacao !== 'liberado') throw new ProtocolError('estado_do_agente')
    const revokedAt = Math.max(now, a.mudou_em)
    const r = await this._deliver(createAuthorizationRevocation({ chavePrivadaDeAprovacao: this._approvalKey(a.uid), autor: a.uid, alvo: 'todas', revogadaEm: revokedAt, v: PROTOCOL_VERSION }))
    const confirmed = r === 'entregue'
    if (confirmed) await this._deliver(this._policy(a, FREE_TYPES, now))
    this._execute("UPDATE agentes SET situacao = 'pausado', mudou_em = :em, autorizacoes = '[]', revogado_ate = :ate WHERE uid = :uid", {
      uid: a.uid, em: revokedAt, ate: confirmed ? a.revogado_ate : JSON.parse(a.atestado).emitidoEm + 1
    })
    return !confirmed
  }

  async _resume(a, _act, now) {
    if (a.situacao !== 'pausado') throw new ProtocolError('estado_do_agente')
    // the new authorizations must be issued AFTER the revocation of "todas", otherwise they would be born revoked
    const issuedAt = Math.max(now, a.mudou_em + 1)
    const currentAttestation = JSON.parse(a.atestado)
    const revokedAttestation = a.revogado_ate !== null && currentAttestation.emitidoEm < a.revogado_ate
    const attestation = revokedAttestation ? JSON.stringify(this._attestation(a, Math.max(issuedAt, a.revogado_ate))) : a.atestado
    // the policy that required everything only exists if it was actually published (a pause confirmed by the relay)
    const policy = a.politica_em > 0 ? this._policy(a, [], now) : null
    this._execute("UPDATE agentes SET situacao = 'liberado', mudou_em = :em, atestado = :atestado WHERE uid = :uid", { uid: a.uid, em: issuedAt, atestado: attestation })
    this._newBundle({ ...a, autorizacoes: '[]' }, issuedAt)
    if (policy) await this._deliver(policy)
    return false
  }

  async _changeLimits(a, act, now) {
    const issuedAt = Math.max(now, a.mudou_em + 1)
    this._execute('UPDATE agentes SET postagens_dia = :p, comentarios_dia = :c, mudou_em = :em WHERE uid = :uid', {
      uid: a.uid, p: act.limites.postagensPorDia, c: act.limites.comentariosPorDia, em: a.situacao === 'liberado' ? issuedAt : a.mudou_em
    })
    // paused: it only stores; the new bundle is born at `retomar`, already with these limits
    if (a.situacao === 'liberado') await this._deliverAll(this._newBundle(this._agent(a.uid), issuedAt))
    return false
  }

  async _take(a, _act, now) {
    this._execute("UPDATE agentes SET situacao = 'tirado', mudou_em = :agora, autorizacoes = '[]' WHERE uid = :uid", { uid: a.uid, agora: now })
    await this._deliver(createAuthorizationRevocation({ chavePrivadaDeAprovacao: this._approvalKey(a.uid), autor: a.uid, alvo: 'todas', revogadaEm: Math.max(now, a.mudou_em), v: PROTOCOL_VERSION }))
    return true
  }
}
