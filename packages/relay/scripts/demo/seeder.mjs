// SPDX-License-Identifier: AGPL-3.0-or-later
// Demo seeder: does what a real client would do, through the relay HTTP API (POST /v1/objetos), with signed objects,
// a handle attestation from the demo issuer and one-time human approval on the objects that require it.
//
// THE REAL RELAY SETS THE TIME. An account under 1 day old cannot create a community or a page, a friendship under 3 days old gives no
// testimonial, under 7 gives no badge, and whoever joined a community waits 10 minutes to reply and 1 hour to open a
// topic or vote. The relay measures this with its own clock and no operator option speeds up time. So the seeder forces
// nothing: it publishes what it already can, DEFERS what the relay refused for age or waiting period (and everything that depends on it) and says when
// it is worth trying again (`adiados` and `proximaRodada` in the report). Running again completes what has matured. See the calendar in
// docs/RELAY-OPERATIONS.md, "Seed the demo" (section 6).
//
// IDEMPOTENT, from two sources: (1) the LEDGER, a record of what was already published (phase, item key, id), which the caller keeps
// in a file; (2) the rover chain in the relay (only for the old types and only up to the first ACTION object, because the relay does not keep
// the action envelope and the chain stops being readable there). Without the ledger, a second round may repeat content.
//
// HOW TO ADD A TYPE: write the list in the catalog, add the phase to PHASES (here and in phases-03.mjs) after what it references.
import { createHumanApproval, createHandleAttestation, createObject, requiresApproval } from '../../../protocol/src/index.js'
import { CATALOG } from './catalog.mjs'
import { issuerOf, roverOf } from './demo-keys.mjs'
import { PHASES_03 } from './phases-03.mjs'

const DAY = 86400
const ATTESTATION_VALIDITY_S = 80 * DAY // the protocol accepts up to 90
const RENEW_WHEN_LESS_THAN_S = 30 * DAY
/** Above this, waiting for a 429 in place makes no sense: the phase defers the item and counts on the next round. */
const MAX_WAIT_IN_PLACE_S = 120
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))

export class SeedingError extends Error {}

/** Thrown by `ctx.idOf` when the item depended on was deferred in this round: the dependent item is deferred too. */
export class Deferred extends Error {
  constructor(reason, retryAt = null) { super(reason); this.motivo = reason; this.retryAt = retryAt }
}

/** The record of what seeding has already done. The caller keeps this object (JSON) between rounds. */
export const newLedger = () => ({ versao: 1, itens: {}, rovers: {} })

/**
 * Object types the seeder knows how to recognize in a rover chain so as not to repeat them: type -> identity key of the body.
 * Only the old CONTENT types: the relay keeps their envelope. The rest lives in the ledger.
 */
const IDENTITY = {
  postagem: (c) => c.texto,
  resposta: (c) => `${c.alvo}|${c.texto}`,
  seguir: (c) => c.alvo,
  reacao: (c) => c.alvo
}

/**
 * PHASES, in the order they are published. Each phase describes ONE object type of the catalog:
 *   nome       label in the report and key in the ledger
 *   tipo       object type in the protocol
 *   exige      minimum protocol version the relay must declare in /v1/info (null = any); a phase without support is skipped
 *   itens      (catalogo) => list of items
 *   autor      (item) => slug of the rover that publishes
 *   chave      (item, ctx) => identity of the item (stable between rounds: use ids, not times)
 *   corpo      (item, ctx) => body of the object
 *   ref        (item) => ref by which other items point to this one (optional)
 *   acao       true when the object is an ACTION (the relay does not keep the envelope): the ledger keeps only `true`
 *   adia       relay error codes that mean "not time yet": the item is deferred, not a failure
 *   jaFeito    error codes that mean "already done": the item counts as existing
 *   recuperar  async (item, ctx) => id; when the relay says `ja_existe` and the id is needed (community, page)
 *   rotulo     (item) => short text of the item for the deferred report
 * `ctx.idOf(ref)` returns the id of a ref already published (or existing); `ctx.uidOf(slug)` the uid of the rover; `ctx.agora()` the clock.
 */
export const PHASES = [
  {
    nome: 'postagens', tipo: 'postagem', exige: null,
    itens: (c) => c.postagens, autor: (i) => i.de, ref: (i) => i.ref,
    chave: (i) => i.texto,
    corpo: (i) => ({ ...(i.titulo ? { titulo: i.titulo } : {}), texto: i.texto, topicos: i.topicos })
  },
  {
    nome: 'respostas', tipo: 'resposta', exige: null,
    itens: (c) => c.respostas, autor: (i) => i.de, ref: (i) => i.ref,
    chave: (i, ctx) => `${ctx.idOf(i.a)}|${i.texto}`,
    corpo: (i, ctx) => ({ alvo: ctx.idOf(i.a), texto: i.texto })
  },
  {
    nome: 'seguir', tipo: 'seguir', exige: null, jaFeito: ['ja_segue'],
    itens: (c) => c.seguir, autor: (i) => i[0],
    chave: (i, ctx) => ctx.uidOf(i[1]),
    corpo: (i, ctx) => ({ alvo: ctx.uidOf(i[1]) })
  },
  {
    nome: 'reacoes', tipo: 'reacao', exige: null, jaFeito: ['ja_reagiu'],
    itens: (c) => c.reacoes, autor: (i) => i[0],
    chave: (i, ctx) => ctx.idOf(i[1]),
    corpo: (i, ctx) => ({ alvo: ctx.idOf(i[1]), reacao: i[2] })
  },
  ...PHASES_03
]

/** Minimal HTTP client: pacing between requests, waiting on 429 and a retry on network failure or 5xx. */
function createClient({ url, fetchFn, wait: waitFn, intervalMs, registrar: register }) {
  const base = url.replace(/\/+$/, '')
  let last = 0
  return async function ask(method, path, body) {
    for (let attempt = 1; ; attempt++) {
      // safety net: the normal exits (network failure, 5xx, 429) stop well before this; this only prevents an endless loop
      if (attempt > 50) throw new SeedingError(`o relé não respondeu depois de ${attempt - 1} tentativas em ${method} ${path.split('?')[0].replace(/rvr_[\\w-]+|ob_[\\w-]+/g, ':id')}`)
      const missing = intervalMs - (Date.now() - last)
      if (missing > 0) await waitFn(missing)
      last = Date.now()
      let res
      try {
        res = await fetchFn(base + path, {
          method: method,
          headers: body === undefined ? {} : { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(20_000)
        })
      } catch (e) {
        if (attempt >= 4) throw new SeedingError(`sem resposta do relé em ${method} ${path.split('?')[0].replace(/rvr_[\w-]+|ob_[\w-]+/g, ':id')}`)
        await waitFn(500 * attempt)
        continue
      }
      const text = await res.text()
      let json = null
      try { json = JSON.parse(text) } catch { /* body is not JSON */ }
      const retryAfter = Number(res.headers.get('retry-after')) || null
      if (res.status === 429 && attempt <= 12 && (retryAfter ?? 1) <= MAX_WAIT_IN_PLACE_S) {
        const wait = Math.min(30, Math.max(1, retryAfter || 1))
        register({ evento: 'espera_429', segundos: wait })
        await waitFn(wait * 1000)
        continue
      }
      if (res.status >= 500 && attempt < 4) { await waitFn(500 * attempt); continue }
      return { status: res.status, json, retryAfter }
    }
  }
}

/** Same profile body? Compares by content, without depending on key order. */
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x))

/**
 * @param {object} o
 * @param {string} o.url              base address of the relay (https://... or http://127.0.0.1:port)
 * @param {Buffer} o.semente          seed of the demo issuer (32 bytes)
 * @param {object} [o.catalogo]
 * @param {object} [o.ledger]         the record of what was already done (newLedger()); the caller keeps it between rounds
 * @param {(ledger: object) => void} [o.onProgress] called after each phase and at the end (to write the ledger to disk)
 * @param {number} [o.geracao]        changes the rover uids (only to start over when a relay stored rovers that can no longer be continued)
 * @param {boolean} [o.simulate]      only reads and counts; publishes nothing
 * @param {boolean} [o.acceptWithoutLedger] continues even when the relay already has rovers of this seeding and the ledger is empty (repeats content)
 * @param {() => number} [o.relogio]  seconds
 * @param {number} [o.intervalMs]     minimum pace between requests (the relay has a burst limit per origin)
 */
export async function seedNetwork({
  url, semente: seed, catalogo: catalog = CATALOG, ledger = newLedger(), onProgress = () => {}, geracao: generation = 1, simulate = false, acceptWithoutLedger = false,
  relogio: clock = () => Math.floor(Date.now() / 1000), fetchFn = fetch, wait: waitFn = sleep, intervalMs = 130, registrar: register = () => {}
}) {
  const ask = createClient({ url, fetchFn, wait: waitFn, intervalMs, registrar: register })
  const issuer = issuerOf(seed)
  const reportDocument = { criados: {}, existentes: {}, pulados: [], adiados: [], proximaRodada: null, simulado: simulate }
  const account = (group, name) => { reportDocument[group][name] = (reportDocument[group][name] ?? 0) + 1 }

  const info = await ask('GET', '/v1/info')
  if (info.status !== 200 || !Array.isArray(info.json?.protocolo)) throw new SeedingError('o endereço não respondeu como um relé da Rover Network (/v1/info)')
  if (!info.json.emissores?.includes(issuer.publicKey)) {
    throw new SeedingError('este relé não confia no emissor de demonstração desta semente: ele recusaria todos os rovers. Confira RELAY_ISSUERS.')
  }
  const versions = info.json.protocolo

  // ---------- rover state ----------
  const rovers = new Map()
  for (const r of catalog.rovers) {
    const keys = roverOf(seed, r.slug, generation)
    rovers.set(r.slug, { ...r, ...keys, cabeca: null, ultimoCriado: 0, estado: null, indice: {} })
  }
  const uidOf = (slug) => {
    const r = rovers.get(slug)
    if (!r) throw new SeedingError(`o catálogo cita o rover "${slug}", que não existe em rovers`)
    return r.uid
  }

  async function readState(r) {
    const p = await ask('GET', `/v1/rovers/${r.uid}`)
    if (p.status === 404) return null
    if (p.status !== 200) throw new SeedingError(`não consegui ler o rover ${r.slug} (status ${p.status})`)
    const state = { perfil: p.json, profileBody: p.json.perfil?.corpo ?? null }
    r.cabeca = p.json.cabeca
    r.ultimoCriado = ledger.rovers[r.slug]?.ultimoCriado ?? 0
    r.indice = {}
    for (const t of Object.keys(IDENTITY)) r.indice[t] = new Map()
    // The chain is only readable up to the first ACTION object (the relay does not keep its envelope): the read stops there, and the ledger covers the rest.
    let id = p.json.cabeca
    let first = true
    let steps = 0
    while (id) {
      if (++steps > 2000) throw new SeedingError(`a cadeia do rover ${r.slug} é longa demais para ler`)
      const o = await ask('GET', `/v1/objetos/${id}`)
      if (o.status === 404 || o.status === 410) {
        // action (no stored envelope) or removed object: reading the chain stops here. If the head was not even read and the ledger does not know its
        // time, the next object takes the current time (it never goes backward in the chain: the relay would refuse it for the clock).
        if (first && !ledger.rovers[r.slug]) r.ultimoCriado = clock()
        break
      }
      if (o.status !== 200) throw new SeedingError(`não consegui ler um objeto da cadeia do rover ${r.slug} (status ${o.status}); recomece com --geracao novo`)
      const obj = o.json.objeto
      if (first) { r.ultimoCriado = Math.max(r.ultimoCriado, obj.criadoEm); first = false }
      const identity = IDENTITY[obj.tipo]
      if (identity) {
        const key = identity(obj.corpo)
        if (!r.indice[obj.tipo].has(key)) r.indice[obj.tipo].set(key, obj.id)
      }
      id = obj.previo
    }
    return state
  }

  for (const r of rovers.values()) r.estado = await readState(r)
  // A relay that already has the rovers of this seeding and an empty ledger: the record was lost. Continuing would repeat posts, replies and everything
  // the relay does not recognize on its own. Better to stop and say so than to fill the demo with duplicates.
  if (!simulate && !acceptWithoutLedger && Object.keys(ledger.itens).length === 0 && [...rovers.values()].some((r) => r.estado)) {
    throw new SeedingError('o relé já tem rovers desta semeadura, mas o registro do que foi feito (o arquivo de estado) está vazio: uma nova rodada repetiria o conteúdo. Recupere o arquivo, recomece com --geracao novo, ou use --aceitar-sem-estado se sabe o que faz.')
  }

  // ---------- publishing ----------
  let counter = 0
  const refs = new Map() // ref -> object id (published now or already existing)
  const deferredRefs = new Set() // refs of items deferred in this round: whoever depends on them waits too
  const ctx = {
    uidOf,
    agora: clock,
    idOf: (ref) => {
      const id = refs.get(ref)
      if (id) return id
      if (deferredRefs.has(ref)) throw new Deferred(`depende de ${ref}, que ainda não pôde ser publicado`)
      if (simulate) return `pendente:${ref}`
      throw new SeedingError(`o catálogo aponta para "${ref}", que não foi publicado nem existe no relé`)
    },
    pedir: ask
  }

  /** @returns {Promise<{ id?: string, jaFeito?: boolean, adiado?: { motivo: string, tentarEm: number | null } }>} */
  async function publish(r, phase, body, { attachAttestation = false } = {}) {
    const type = phase.tipo
    if (simulate) return { id: `simulado:${type}:${++counter}` }
    const now = clock()
    // Inside the relay clock window (15 minutes back) and never going backward in the rover chain.
    const createdAt = Math.min(now, Math.max(r.ultimoCriado, now - 300 + counter++))
    const object = createObject({ tipo: type, autor: r.uid, criadoEm: createdAt, previo: r.cabeca, corpo: body, chavePrivada: r.rede.chavePrivada })
    const envelope = { objeto: object }
    if (attachAttestation) {
      envelope.atestado = createHandleAttestation({
        issuerPrivateKey: issuer.chavePrivada, emissor: issuer.publicKey, uid: r.uid, handle: r.handle,
        chave: r.rede.publicKey, chaveAprovacao: r.aprovacao.publicKey, emitidoEm: now - 10, expiraEm: now - 10 + ATTESTATION_VALIDITY_S
      })
    }
    if (requiresApproval(type, [])) {
      envelope.aprovacao = createHumanApproval({
        chavePrivadaDeAprovacao: r.aprovacao.chavePrivada, objeto: object.id, autor: r.uid, aprovadoEm: Math.max(now, createdAt), validadeS: 300
      })
    }
    const res = await ask('POST', '/v1/objetos', envelope)
    const code = res.json?.erro?.codigo
    if (res.status === 201 || res.status === 200) {
      r.cabeca = object.id
      r.ultimoCriado = createdAt
      ledger.rovers[r.slug] = { ultimoCriado: createdAt }
      return { id: object.id }
    }
    // Already done by an earlier round that the relay accepted and whose response was lost: not an error.
    if (phase.jaFeito?.includes(code)) return { jaFeito: true }
    // Not time yet: account age, waiting period in the community, a friendship that is too new, or a rate cap that only clears much later.
    if (phase.adia?.includes(code) || (res.status === 429 && (res.retryAfter ?? 0) > MAX_WAIT_IN_PLACE_S) || (res.status === 429 && code === 'limite_de_taxa')) {
      const wait = res.retryAfter ?? res.json?.erro?.retryAfterS ?? null
      return { deferred: { motivo: code ?? `status ${res.status}`, retryAt: wait ? now + wait : null } }
    }
    throw new SeedingError(`o relé recusou ${type} do rover ${r.slug}: ${code ?? res.status}`)
  }

  // 1. profiles (with the attestation when the rover is new or the attestation is about to expire)
  for (const r of rovers.values()) {
    const body = { nome: r.nome, descricao: r.descricao, grafo: r.grafo ?? 'publico', exigirAprovacao: [], ...(r.perfil03 ?? {}) }
    const now = clock()
    const attestationNearExpiry = r.estado && r.estado.perfil.atestado.expiraEm - now < RENEW_WHEN_LESS_THAN_S
    const current = r.estado?.profileBody
    const equal = current && canon({ ...current, exigirAprovacao: current.exigirAprovacao ?? [] }) === canon(body)
    if (equal && !attestationNearExpiry) { account('existentes', 'perfis'); continue }
    const res = await publish(r, { tipo: 'perfil' }, body, { attachAttestation: !r.estado || attestationNearExpiry })
    if (res.deferred) throw new SeedingError(`o relé adiou o perfil do rover ${r.slug} (${res.deferred.motivo}); o perfil não deve ter idade mínima`)
    account('criados', 'perfis')
  }
  onProgress(ledger)

  // 2. the rest, phase by phase, in catalog order
  const recordDeferred = (phase, item, reason, retryAt) => {
    const label = phase.rotulo ? phase.rotulo(item) : phase.autor(item)
    reportDocument.adiados.push({ phase: phase.nome, item: label, motivo: reason, retryAt })
    if (retryAt && (reportDocument.proximaRodada === null || retryAt < reportDocument.proximaRodada)) reportDocument.proximaRodada = retryAt
    if (phase.ref) deferredRefs.add(phase.ref(item))
  }
  try {
    for (const phase of PHASES) {
      if (phase.exige && !versions.includes(phase.exige)) {
        reportDocument.pulados.push({ phase: phase.nome, motivo: `o relé declara o protocolo ${versions.join(', ')} e esta fase precisa da ${phase.exige}` })
        continue
      }
      for (const item of phase.itens(catalog)) {
        const r = rovers.get(phase.autor(item))
        if (!r) throw new SeedingError(`o catálogo cita o rover "${phase.autor(item)}", que não existe em rovers`)
        try {
          const key = phase.chave(item, ctx)
          // the ledger covers all rovers: the key carries the author, otherwise "follow so-and-so" from one rover would count for all
          const ledgerKey = `${r.slug}|${key}`
          const stored = ledger.itens[phase.nome]?.[ledgerKey]
          const existing = stored ?? r.indice[phase.tipo]?.get(key)
          if (existing) {
            if (phase.ref) refs.set(phase.ref(item), existing === true ? 'feito' : existing)
            account('existentes', phase.nome)
            continue
          }
          const body = phase.corpo(item, ctx)
          const res = await publish(r, phase, body)
          if (res.deferred) { recordDeferred(phase, item, res.deferred.motivo, res.deferred.retryAt); continue }
          if (res.jaFeito) {
            // the relay already had it: counts as existing; if other items point to this one, the id comes from reading (community, page)
            const id = phase.recover ? await phase.recover(item, ctx) : null
            if (phase.recover && !id) throw new SeedingError(`o relé diz que "${phase.nome}" já existe, mas não achei o id para continuar`)
            if (!simulate) (ledger.itens[phase.nome] ??= {})[ledgerKey] = phase.acao ? true : (id ?? true)
            if (phase.ref) refs.set(phase.ref(item), id ?? 'feito')
            account('existentes', phase.nome)
            continue
          }
          if (!simulate) (ledger.itens[phase.nome] ??= {})[ledgerKey] = phase.acao ? true : res.id
          // the ref of an action counts as 'done' both now and in later rounds: whoever points to it (the ban key points
          // to the removal) needs an equal key in both, otherwise the next round would try to publish again
          if (phase.ref) refs.set(phase.ref(item), phase.acao ? 'feito' : res.id)
          account('criados', phase.nome)
        } catch (e) {
          if (!(e instanceof Deferred)) throw e
          recordDeferred(phase, item, e.motivo, e.retryAt)
        }
      }
      onProgress(ledger)
    }
  } finally {
    onProgress(ledger)
  }

  reportDocument.rovers = [...rovers.values()].map((r) => ({ slug: r.slug, handle: r.handle, uid: r.uid }))
  return reportDocument
}
