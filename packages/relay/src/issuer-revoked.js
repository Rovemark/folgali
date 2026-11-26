// SPDX-License-Identifier: AGPL-3.0-or-later
// The list of REVOKED rovers that each trusted issuer publishes, read by the hosted relay (docs/RELAY-OPERATIONS.md, section 15).
//
// The Rover Hangar issuer publishes `/.well-known/rover-network` (discovery) and, at the path it points to,
// `/.well-known/rover-network/emissores.json`: `{ versao: 1, protocolo, geradoEm, validadeMaxS, emissores, revogados }`, with
// `revogados` as `{ emissor, uid }` pairs. This format is PROVISIONAL and NOT signed: the protocol does not define the list yet. The only
// guarantee of origin is the TLS of the configured address (the risk and the request for a signed list are in docs/REQUESTS-FOR-THE-SPECIFICATION.md).
//
// Rules of this reader:
//   - https only, no credential in the URL, no following redirects, response with a byte cap and a short deadline;
//   - a failed fetch NEVER empties what was already known: the last valid list stays in force and its age shows in /v1/info;
//   - a list only counts for the issuer keys the operator tied to that URL (one issuer does not revoke another issuer's rover);
//   - a list older than the last accepted one is refused (`lista_antiga`), and so is a list dated in the future (`lista_no_futuro`);
//   - revoking is MONOTONIC per attestation: a pair that leaves the list becomes "remembered" with the instant `ate` (the `geradoEm` of the last list
//     that carried it). An attestation of that pair issued BEFORE `ate` stays refused forever; one issued AFTER (the rover
//     rehabilitated by the issuer, or the @ changed and re-attested) counts again. Only the operator deletes a remembered pair (`limpar`).
//   - the state goes to a file next to the database (written by rename, mode 0600) and survives a restart. An unreadable
//     file stops the relay from starting: starting without it would forget revocations.
import { request } from 'node:https'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { PUBLIC_KEY_RE, UID_RE } from '../../protocol/src/index.js'
import { AttestationProvider } from './provider.js'

export const REVOKED = Object.freeze({
  defaultIntervalMin: 5,
  minIntervalMin: 1,
  maxIntervalMin: 1440,
  defaultMaxAgeMin: 60,
  maxAgeMaxMin: 43200, //       30 days
  prazoMs: 10_000, //                 each HTTP request, from start to end of the body
  maxResponseBytes: 16 * 1048576, //  100 thousand pairs fit in about 9 MiB
  maxUrlChars: 2048,
  maxFutureS: 300, //                 clock slack between issuer and relay
  maxRevoked: 100_000, //           the cap of the Rover Hangar issuer (contract 0.17.0, LIMITES_ATESTADO_REDE.maxRevoked)
  maxIssuers: 16
})

const FILE_FORMAT = 'rover-network/revogados-dos-emissores/1'
const INSTANT_MIN = 1_700_000_000
const INSTANT_MAX = 4_102_444_800

/** Error of this module: a short `codigo` (goes to the log and to /v1/info), never the URL or the received body. */
export class RevokedError extends Error {
  constructor(code, extra = {}) {
    super(`revogados: ${code}`)
    this.name = 'ErroDeRevogados'
    this.codigo = code
    if (extra.status !== undefined) this.status = extra.status
    if (extra.campo !== undefined) this.campo = extra.campo
  }
}
const error = (code, extra) => new RevokedError(code, extra)
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const hostOf = (url) => new URL(url).host

// ---------- configuration ----------

/** Checks ONE discovery URL: https, no user or password, no fragment, limited length. Returns the normalized form. */
export function validateDiscoveryUrl(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > REVOKED.maxUrlChars) throw new Error('URL de descoberta vazia ou longa demais.')
  let u
  try { u = new URL(text) } catch { throw new Error('URL de descoberta inválida.') }
  if (u.protocol !== 'https:') throw new Error('URL de descoberta precisa ser https (a lista de revogados não é assinada: o TLS é a única garantia de origem).')
  if (u.username !== '' || u.password !== '') throw new Error('URL de descoberta não pode levar usuário nem senha.')
  if (u.hash !== '') throw new Error('URL de descoberta não pode ter fragmento (#).')
  return u.href
}

/**
 * Reads `RELAY_ISSUERS_DISCOVERY`: `key=URL` pairs separated by commas. The key must be among the trusted ones (it makes no sense to read
 * revoked lists from whoever the relay does not even accept) and appear only once; two keys may share the same URL (the current and the previous key of an issuer).
 * Empty or absent: no source. Error messages never repeat the URL.
 */
export function readRevokedSources(text, trusted) {
  if (text === undefined || text === null || text.trim() === '') return []
  const sources = []
  const seen = new Set()
  for (const item of text.split(',').map((s) => s.trim()).filter(Boolean)) {
    const i = item.indexOf('=')
    if (i < 0) throw new Error('RELAY_ISSUERS_DISCOVERY: cada item é chave=URL, separados por vírgula.')
    const issuer = item.slice(0, i).trim()
    if (!PUBLIC_KEY_RE.test(issuer)) throw new Error('RELAY_ISSUERS_DISCOVERY: a chave antes do = precisa ser uma chave pública de 43 caracteres.')
    if (!trusted.includes(issuer)) throw new Error('RELAY_ISSUERS_DISCOVERY: toda chave precisa estar também em RELAY_ISSUERS.')
    if (seen.has(issuer)) throw new Error('RELAY_ISSUERS_DISCOVERY: a mesma chave aparece duas vezes.')
    seen.add(issuer)
    let url
    try { url = validateDiscoveryUrl(item.slice(i + 1).trim()) } catch (e) { throw new Error(`RELAY_ISSUERS_DISCOVERY: ${e.message}`) }
    sources.push({ emissor: issuer, url })
  }
  return sources
}

// ---------- fetching ----------

/**
 * GET of a JSON over https, with a total deadline and a byte cap. It does not follow redirects (a 3xx could lead to http or to another
 * owner), does not ask for compression and refuses a compressed response. `ca` exists only for tests (local certificate); in production the
 * system certificate store applies (and `NODE_EXTRA_CA_CERTS`).
 */
export function fetchJson(url, { prazoMs: deadlineMs = REVOKED.prazoMs, maxBytes = REVOKED.maxResponseBytes, ca } = {}) {
  return new Promise((ok, failure) => {
    let u
    try { u = new URL(url) } catch { failure(error('url')); return }
    if (u.protocol !== 'https:' || u.username !== '' || u.password !== '') { failure(error('url')); return }
    let finished = false
    let req = null
    const finish = (e, value) => {
      if (finished) return
      finished = true
      clearTimeout(deadline)
      if (e) { req?.destroy(); failure(e) } else ok(value)
    }
    const deadline = setTimeout(() => finish(error('prazo')), deadlineMs)
    req = request(u, { method: 'GET', headers: { accept: 'application/json', 'accept-encoding': 'identity', 'user-agent': 'rover-network-rele' }, ...(ca ? { ca } : {}) }, (res) => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400) return finish(error('redirecionamento', { status }))
      if (status !== 200) return finish(error('status', { status }))
      const encoding = String(res.headers['content-encoding'] ?? 'identity').toLowerCase()
      if (encoding !== 'identity') return finish(error('codificacao'))
      const declared = Number(res.headers['content-length'])
      if (Number.isFinite(declared) && declared > maxBytes) return finish(error('resposta_grande'))
      const parts = []
      let total = 0
      res.on('data', (part) => {
        total += part.length
        if (total > maxBytes) return finish(error('resposta_grande'))
        parts.push(part)
      })
      res.on('end', () => {
        if (finished) return
        let value
        try { value = JSON.parse(Buffer.concat(parts).toString('utf8')) } catch { return finish(error('json_invalido')) }
        finish(null, value)
      })
      res.on('error', () => finish(error('rede')))
      res.on('aborted', () => finish(error('rede')))
    })
    req.on('error', () => finish(error('rede')))
    req.end()
  })
}

/**
 * The SHAPE of the list the relay uses. It requires `versao: 1`, `geradoEm` (seconds), `emissores` (the keys the issuer publishes) and
 * `revogados` (pairs exactly `{ emissor, uid }`). The other top-level fields (`protocolo`, `validadeMaxS`) are not used and are not
 * required. One pair outside the shape discards the WHOLE list (the previous one stays): reading half would mean forgetting the other half.
 */
export function validateRevokedList(l) {
  if (!isObject(l)) throw error('lista')
  if (l.versao !== 1) throw error('lista', { campo: 'versao' })
  if (!Number.isSafeInteger(l.geradoEm) || l.geradoEm < INSTANT_MIN || l.geradoEm > INSTANT_MAX) throw error('lista', { campo: 'geradoEm' })
  if (!Array.isArray(l.emissores) || l.emissores.length === 0 || l.emissores.length > REVOKED.maxIssuers) throw error('lista', { campo: 'emissores' })
  const issuers = l.emissores.map((e) => {
    if (!isObject(e) || typeof e.chave !== 'string' || !PUBLIC_KEY_RE.test(e.chave)) throw error('lista', { campo: 'emissores' })
    return e.chave
  })
  if (!Array.isArray(l.revogados) || l.revogados.length > REVOKED.maxRevoked) throw error('lista', { campo: 'revogados' })
  const pairs = new Map()
  for (const x of l.revogados) {
    if (!isObject(x) || Object.keys(x).length !== 2 || typeof x.emissor !== 'string' || !PUBLIC_KEY_RE.test(x.emissor) ||
        typeof x.uid !== 'string' || !UID_RE.test(x.uid)) throw error('lista', { campo: 'revogados' })
    pairs.set(`${x.emissor}|${x.uid}`, { emissor: x.emissor, uid: x.uid })
  }
  return { geradoEm: l.geradoEm, emissores: issuers, revogados: [...pairs.values()] }
}

/**
 * Fetches the list from the configured URL. If the response is the issuer's discovery document (`papel: 'emissor'`), it follows its
 * `lista` path, which must be on the SAME origin; if it is already the list, it uses it directly.
 */
export async function fetchIssuerList(url, options = {}) {
  const search = options.fetchJson ?? fetchJson
  let doc = await search(url, options)
  if (isObject(doc) && doc.papel === 'emissor') {
    if (doc.rede !== 'rover-network' || doc.formato !== 'provisorio-1' || typeof doc.lista !== 'string' || !doc.lista.startsWith('/') || doc.lista.startsWith('//')) {
      throw error('descoberta')
    }
    const target = new URL(doc.lista, url)
    if (target.origin !== new URL(url).origin) throw error('descoberta')
    doc = await search(target.href, options)
  }
  return validateRevokedList(doc)
}

// ---------- the provider ----------

/**
 * Attestation provider with fixed issuers (like `StaticProvider`) and the revoked list read from the configured sources.
 * `revogados()` returns `{ emissor, uid }` for the pair that the issuer's latest list carries (it counts against any attestation) and
 * `{ emissor, uid, ate }` for the remembered pair (it counts against an attestation with `emitidoEm < ate`).
 */
export class ProviderWithIssuerRevoked extends AttestationProvider {
  /**
   * @param {object} o
   * @param {string[]} o.emissores                        keys the relay trusts (RELAY_ISSUERS)
   * @param {Array<{ emissor: string, url: string }>} o.fontes  from readRevokedSources
   * @param {string | null} [o.arquivo]                   where to store the state (next to the database); null = memory only
   * @param {() => number} [o.relogio]                    whole seconds
   * @param {number} [o.idadeMaxS]                        above this the list is "old": alert in the log and in /v1/info
   * @param {number} [o.intervaloS]                       how often `ligar()` re-reads
   * @param {(evento: object) => void} [o.registrar]      log (never receives a uid or a whole URL)
   * @param {(url: string, opcoes: object) => Promise<object>} [o.buscar]  replaces the fetch (tests)
   * @param {object} [o.fetchOptions]                     passed on to the fetch (tests: `ca`, `prazoMs`, `maxBytes`)
   */
  constructor({ emissores: issuers, fontes: sources = [], arquivo: file = null, relogio: clock = () => Math.floor(Date.now() / 1000), idadeMaxS: maxAgeS = REVOKED.defaultMaxAgeMin * 60,
    intervaloS: intervalS = REVOKED.defaultIntervalMin * 60, registrar: register = () => {}, buscar: search = fetchIssuerList, fetchOptions = {} }) {
    super()
    this._issuers = [...issuers]
    const byUrl = new Map()
    for (const { emissor: issuer, url } of sources) {
      if (!byUrl.has(url)) byUrl.set(url, [])
      byUrl.get(url).push(issuer)
    }
    this._sources = [...byUrl].map(([url, keys]) => ({ url, emissores: keys, geradoEm: null, atualizadaEm: null, falhasSeguidas: 0, ultimoErro: null }))
    this._pairs = new Map()
    this._version = 1
    this.arquivo = file
    this.relogio = clock
    this.idadeMaxS = maxAgeS
    this.intervaloS = intervalS
    this.registrar = register
    this.buscar = search
    this.fetchOptions = fetchOptions
    this._inProgress = null
    if (file) this._load()
  }

  get nome() { return 'descoberta' }
  get versao() { return this._version }
  trustedIssuers() { return [...this._issuers] }
  revogados() {
    return [...this._pairs.values()].map((p) => (p.vigente ? { emissor: p.emissor, uid: p.uid } : { emissor: p.emissor, uid: p.uid, ate: p.ate }))
  }

  _sourceOf(issuer) { return this._sources.find((f) => f.emissores.includes(issuer)) ?? null }

  /** Re-reads all sources (in parallel). Never throws: each failure stays on the source and in the log. Two simultaneous calls become one. */
  atualizar() {
    if (this._inProgress) return this._inProgress
    this._inProgress = (async () => {
      try {
        const results = await Promise.all(this._sources.map((f) => this._updateSource(f)))
        if (results.some((r) => r.setChanged)) this._version++
        if (results.some((r) => r.aceita)) this._save()
        this._checkAge()
      } finally {
        this._inProgress = null
      }
    })()
    return this._inProgress
  }

  async _updateSource(f) {
    let list
    try {
      list = await this.buscar(f.url, this.fetchOptions)
      const now = this.relogio()
      if (!list.emissores.some((c) => f.emissores.includes(c))) throw error('emissor_ausente')
      if (list.geradoEm > now + REVOKED.maxFutureS) throw error('lista_no_futuro')
      if (f.geradoEm !== null && list.geradoEm < f.geradoEm) throw error('lista_antiga')
    } catch (e) {
      f.falhasSeguidas++
      f.ultimoErro = e instanceof RevokedError ? e.codigo : 'interno'
      this.registrar({ nivel: 'aviso', evento: 'revogados_falha', fonte: hostOf(f.url), erro: f.ultimoErro, ...(e?.status ? { status: e.status } : {}), falhasSeguidas: f.falhasSeguidas })
      return { aceita: false, setChanged: false }
    }
    let setChanged = false
    let newItems = 0
    let ignored = 0
    const inList = new Set()
    for (const { emissor: issuer, uid } of list.revogados) {
      if (!f.emissores.includes(issuer)) { ignored++; continue } // one issuer does not revoke another issuer's rover
      const k = `${issuer}|${uid}`
      inList.add(k)
      const p = this._pairs.get(k)
      if (!p) {
        this._pairs.set(k, { emissor: issuer, uid, ate: list.geradoEm, vigente: true })
        setChanged = true
        newItems++
        continue
      }
      if (!p.vigente) { p.vigente = true; setChanged = true }
      if (list.geradoEm > p.ate) p.ate = list.geradoEm
    }
    // What the new list does not carry stops counting against a NEW attestation, but stays remembered against the attestation it revoked.
    for (const [k, p] of this._pairs) {
      if (p.vigente && f.emissores.includes(p.emissor) && !inList.has(k)) { p.vigente = false; setChanged = true }
    }
    f.geradoEm = list.geradoEm
    f.atualizadaEm = this.relogio()
    f.falhasSeguidas = 0
    f.ultimoErro = null
    this.registrar({ nivel: 'info', evento: 'revogados_atualizados', fonte: hostOf(f.url), geradoEm: list.geradoEm, vigentes: inList.size, novos: newItems, ignorados: ignored })
    return { aceita: true, setChanged }
  }

  _sourceState(f, now) {
    const ageS = f.geradoEm === null ? null : Math.max(0, now - f.geradoEm)
    const state = f.geradoEm === null ? 'sem_lista' : ageS > this.idadeMaxS ? 'velha' : 'em_dia'
    return { idadeS: ageS, estado: state }
  }

  _checkAge() {
    const now = this.relogio()
    for (const f of this._sources) {
      const { idadeS: ageS, estado: state } = this._sourceState(f, now)
      if (state !== 'em_dia') {
        this.registrar({ nivel: 'alerta', evento: 'revogados_lista_velha', fonte: hostOf(f.url), estado: state, idadeS: ageS, idadeMaxS: this.idadeMaxS, falhasSeguidas: f.falhasSeguidas })
      }
    }
  }

  /** What goes to `GET /v1/info` (the `revogados` field). Public: keys and URLs the operator configured, dates and counts. */
  revokedState(now = this.relogio()) {
    let current = 0
    let remembered = 0
    for (const p of this._pairs.values()) { if (p.vigente) current++; else remembered++ }
    return {
      intervaloS: this.intervaloS,
      idadeMaxS: this.idadeMaxS,
      vigentes: current,
      lembrados: remembered,
      fontes: this._sources.map((f) => {
        const { idadeS: ageS, estado: state } = this._sourceState(f, now)
        return { emissores: [...f.emissores], url: f.url, estado: state, geradoEm: f.geradoEm, atualizadaEm: f.atualizadaEm, idadeS: ageS, falhasSeguidas: f.falhasSeguidas, ultimoErro: f.ultimoErro }
      })
    }
  }

  /**
   * The ONLY way to forget a revocation: the operator, on purpose. It deletes only the REMEMBERED pairs (pairs that the issuer's current list
   * no longer carries); a pair the current list carries would come back at the next read, so it stays. `{ emissor, uid }` or `{ tudo: true }`.
   * @returns {{ limpos: number, vigentesMantidos: number }}
   */
  limpar({ emissor: issuer, uid, tudo: all = false } = {}) {
    let clean = 0
    let keptCurrent = 0
    for (const [k, p] of this._pairs) {
      if (!all && !(p.emissor === issuer && p.uid === uid)) continue
      if (p.vigente) { keptCurrent++; continue }
      this._pairs.delete(k)
      clean++
    }
    if (clean) {
      this._version++
      this._save()
    }
    this.registrar({ nivel: 'info', evento: 'revogados_limpos', limpos: clean, vigentesMantidos: keptCurrent })
    return { limpos: clean, vigentesMantidos: keptCurrent }
  }

  /** Re-reads every `intervaloS` seconds. Returns whoever stops it. The timer does not hold the process open. */
  enable() {
    const t = setInterval(() => { this.atualizar().catch(() => {}) }, this.intervaloS * 1000)
    t.unref()
    return () => clearInterval(t)
  }

  // ---------- disk ----------

  _save() {
    if (!this.arquivo) return
    const data = {
      formato: FILE_FORMAT,
      fontes: this._sources.map((f) => ({ url: f.url, emissores: [...f.emissores], geradoEm: f.geradoEm, atualizadaEm: f.atualizadaEm })),
      pares: [...this._pairs.values()].map((p) => ({ emissor: p.emissor, uid: p.uid, ate: p.ate, vigente: p.vigente }))
    }
    const temporary = `${this.arquivo}.${process.pid}.novo`
    try {
      writeFileSync(temporary, JSON.stringify(data), { mode: 0o600 })
      renameSync(temporary, this.arquivo)
    } catch (e) {
      try { rmSync(temporary, { force: true }) } catch { /* nothing to clean up */ }
      // Memory stays correct; the disk keeps the previous version until the next write.
      this.registrar({ nivel: 'alerta', evento: 'revogados_falha_ao_gravar', erro: e?.code ?? 'desconhecido' })
    }
  }

  _load() {
    if (!existsSync(this.arquivo)) return
    const unreadable = () => new Error(`O arquivo de revogados (${this.arquivo}) está ilegível. O relé não sobe sem ele, porque subir vazio esqueceria revogações. Confira o arquivo; para recomeçar a memória de propósito, mova-o de lado (docs/RELAY-OPERATIONS.md, seção 15).`)
    let d
    try { d = JSON.parse(readFileSync(this.arquivo, 'utf8')) } catch { throw unreadable() }
    if (!isObject(d) || d.formato !== FILE_FORMAT || !Array.isArray(d.fontes) || !Array.isArray(d.pares)) throw unreadable()
    const instantOrNull = (n) => n === null || (Number.isSafeInteger(n) && n >= 0)
    for (const f of d.fontes) {
      if (!isObject(f) || typeof f.url !== 'string' || !instantOrNull(f.geradoEm) || !instantOrNull(f.atualizadaEm)) throw unreadable()
      const current = this._sources.find((x) => x.url === f.url)
      if (current) { current.geradoEm = f.geradoEm; current.atualizadaEm = f.atualizadaEm }
    }
    for (const p of d.pares) {
      if (!isObject(p) || typeof p.emissor !== 'string' || !PUBLIC_KEY_RE.test(p.emissor) || typeof p.uid !== 'string' || !UID_RE.test(p.uid) ||
          !Number.isSafeInteger(p.ate) || typeof p.vigente !== 'boolean') throw unreadable()
      // A current pair of an issuer that no longer has a configured source: nobody would update it, so it becomes remembered.
      const current = p.vigente && this._sourceOf(p.emissor) !== null
      this._pairs.set(`${p.emissor}|${p.uid}`, { emissor: p.emissor, uid: p.uid, ate: p.ate, vigente: current })
    }
  }
}
