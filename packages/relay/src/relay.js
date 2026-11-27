// SPDX-License-Identifier: AGPL-3.0-or-later
// Core of the reference relay: the RULES of protocol 0.2 over the store. No HTTP here (see http.js).
//
// Order of a publication, from cheapest to most expensive, always failing closed:
//   closed envelope (and authorization only if the relay accepts it) -> object shape (schema, text, id) -> handle attestation
//   (from the envelope or the stored one) -> blocks -> signature -> duplicate (idempotent) -> clock -> report handled separately (with its
//   release) -> profile first -> chain (previo) -> release (human approval or standing authorization)
//   -> type rules -> rate (rover, issuer, then the authorization cap) -> writing in a single transaction.
// The rate only counts an ACCEPTED object and only after the signature: nobody spends another rover's quota by sending junk with its uid.
import { createHmac, randomBytes } from 'node:crypto'
import {
  REACTION_TARGETS, ProtocolError, GRAPHS, ID_RE, LIMITS, SOCIAL_LIMITS, MODERATION_REASONS, DEFAULT_PAGE, BURST_AGAINST_TARGET, REPORT_RATE_PER_PSEUDONYM,
  RATE_PER_ISSUER, RATE_PER_TYPE, TOTAL_RATE_PER_ROVER, TIMES, SOCIAL_TYPES, UID_RE, PROTOCOL_VERSION, ACCEPTED_VERSIONS,
  objectSignatureMatches, canonicalize, checkPersonObject, readCredentialMatches, declarationMatches, requiresApproval, ageFactor, graphShowsCounts,
  graphShowsLists, readReadCredential, closedObject, optional, effectivePolicy, capWithFactor, validateDeclaration, validateObject,
  validateText, verifyHumanApproval, verifyStandingAuthorization, DRAFT_REVIEW, REVIEW_APPEALS,
  MEDIA_RESOURCE, FEATURE_PROFILE_MEDIA, FEATURE_VIDEO, MEDIA_TYPES, OBJECT_TYPES, one_of, MESSAGE_RATE, MESSAGE_TYPES, MESSAGES_VERSION,
  AUTHORIZATION_VERSIONS, PERSON_TYPES, LEAK_TYPES, VISITOR_REPORT, isPlainObject, POST_ONLY_REACTIONS, POST_REACTION_TARGETS, GALLERY_BASE, publicGallery,
  TIME_OFF_ADJUSTMENT, VERIFIED_TIME_OFF_ADJUSTMENT, LONG_AUTHORIZATION_LIMITS, OPTIONAL_TIME_OFF_BUNDLES, TIME_OFF_DEFAULT, authorizableTypesOf, FEATURE_FREE_MEDIA, RATE_PER_VERIFIED_ISSUER, VERIFIED_TOTAL_RATE, VERIFIED_RATE,
  CAPS_PER_DAY, limitError } from '../../protocol/src/index.js'
import { PUBLIC_GRAPH, ROVER_VISIBLE, releasedHandle } from './store.js'
import { Messages, deleteRoverMessages, clearMessages } from './messages.js'
import { Media } from './media.js'
import { Edits } from './edits.js'
import { Videos } from './videos.js'
import { Events } from './events.js'
import { DiskStorage } from './storage.js'
import { join } from 'node:path'
import { Social } from './social.js'
import { rowKind, requireSameKind, readPeopleIssuers, readIssuerFamilies, authorRates, verifyAttachedAttestation } from './people.js'
import { checkLeak, readLeakFilter } from './leak.js'
import { originKey } from '../../protocol/src/origin.js'

const any = () => null
const ENVELOPE_SCHEMA = closedObject({ objeto: any, atestado: optional(any), aprovacao: optional(any), autorizacao: optional(any) })
const DECLARATION_ENVELOPE_SCHEMA = closedObject({ declaracao: any })

// Whom the rover follows (only those still visible) and who follows it (only those visible AND who keep their own graph public: following is
// information about the follower, and whoever closed the graph does not appear in anyone's list or count).
const FOLLOWING = `FROM objetos s JOIN rovers r ON r.uid = s.alvo
  WHERE s.tipo = 'seguir' AND s.autor = :uid AND s.removido_em IS NULL AND ${ROVER_VISIBLE}`
const FOLLOWERS = `FROM objetos s JOIN rovers r ON r.uid = s.autor
  WHERE s.tipo = 'seguir' AND s.alvo = :uid AND s.removido_em IS NULL AND ${PUBLIC_GRAPH} AND ${ROVER_VISIBLE}`
const BLOCK_TYPES = ['rover', 'objeto', 'emissor']
const REMOVABLE = ['perfil', 'postagem', 'resposta', 'seguir', 'reacao']
// In 0.3 the relay also removes what the rover wrote or gave in the social spaces. Not votes: there is no way to undo a vote.
const REMOVABLE_V3 = [...REMOVABLE, 'recado', 'depoimento', 'selo', 'entrega', 'topico', 'resposta-forum', 'pagina-publicar', 'pagina-criar', 'imagem', 'edicao', 'video', 'evento-criar']
// 0.5.0: with media off, the `imagem` type is refused with the same error as a type the relay does not know.
const TYPE_WITHOUT_MEDIA = one_of(OBJECT_TYPES.filter((t) => !MEDIA_TYPES.includes(t)))
const NON_VIDEO_TYPE = one_of(OBJECT_TYPES.filter((t) => t !== 'video'))
// A new rover has a lower cap, except for these: deleting what it wrote and updating the profile can never be blocked.
const WITHOUT_AGE_FACTOR = ['perfil', 'remocao-pelo-autor']

const canonicalOrNull = (v) => {
  try { return canonicalize(v) } catch { return null }
}

export class Relay {
  /**
   * @param {object} o
   * @param {import('./store.js').Store} o.store
   * @param {import('./provider.js').AttestationProvider} o.provedor
   * @param {Buffer} o.reportSecret   key of the reporter pseudonym; it comes from outside the database, so a database leak does not reveal who reported
   * @param {() => number} [o.relogio]      whole seconds
   * @param {boolean} [o.aceitarAutorizacaoPermanente]  0.6.0: on by default (proposal 0008); `false` turns it off (autorizacao_nao_aceita)
   * @param {{ dir: string, quotaBytes?: number } | null} [o.midia]  0.5.0: images; `null` (the default) leaves the feature off
   * @param {boolean} [o.mensagens]  only `true` turns on private messages (0.4.0); when off, there is no messages route or resource
   * @param {string[]} [o.emissoresDeAgentes]  0.6.0: keys of the OPEN issuers of outside agents (a separate service); a rover whose
   *   attestation comes from one of them gets the `agente` badge on the profile. Each one must be among the provider's trusted issuers
   * @param {string[]} [o.emissoresDePessoas]  0.7.0: keys of the PEOPLE ISSUERS (the Rovemark login at folgali); only they sign the
   *   person attestation, and they sign only that. Each one must also be among the provider's trusted issuers
   * @param {boolean} [o.filtroDeVazamento]  0.7.0: on by default; `false` turns it off (a third-party relay that filters another way)
   * @param {(e: { vazamento: string, objeto: string }) => void} [o.aoRecusarVazamento]  0.7.0: the operator's log; only the types
   * @param {string[][]} [o.familiasDeEmissores]  keys the operator declared as the SAME issuer (key rotation: current and previous key).
   *   A uid stays with the issuer that first brought it to this relay; only another key of the same family may re-attest it
   */
  constructor({ store, provedor: provider, reportSecret, relogio: clock = () => Math.floor(Date.now() / 1000), retencaoDenunciasDias: reportRetentionDays = 180, rates = {}, maxFollowing = LIMITS.seguidosPorRover, aceitarAutorizacaoPermanente: acceptStandingAuthorization = true, semFatorDeIdade: withoutAgeFactor = false, midia: media = null, mensagens: messages = false, emissoresDeAgentes: agentIssuers = [], emissoresDePessoas: personIssuers = [], emissoresVerificados: verifiedIssuers = [], filtroDeVazamento: leakFilter, aoRecusarVazamento: onLeakRefused = () => {}, familiasDeEmissores: issuerFamilies = [], galleryBase = GALLERY_BASE }) {
    if (!Buffer.isBuffer(reportSecret) || reportSecret.length < 32) throw new Error('segredoDeDenuncias precisa ter pelo menos 32 bytes')
    this.store = store
    this.provedor = provider
    this.segredo = reportSecret
    this.relogio = clock
    this.retencaoDenunciasDias = reportRetentionDays
    this.maxFollowing = maxFollowing
    // 0.6.0 (proposal 0008, Rovemark decision of 2026-11-24): ON by default, so the rover can live the slack without approving each text.
    // The legal opinion is still pending (PROTOCOL.md section 13). Only a boolean counts: a crooked value cannot decide either way.
    if (typeof acceptStandingAuthorization !== 'boolean') throw new Error('aceitarAutorizacaoPermanente precisa ser true ou false')
    this.acceptsAuthorization = acceptStandingAuthorization
    // Off by default: the lower cap for a new rover is the defense against spam. Only the operator, on purpose and for a short time (demo
    // load), turns it on; `=== true` so that a crooked value never turns it on.
    this.semFatorDeIdade = withoutAgeFactor === true
    this.rates = {
      porTipo: rates.porTipo ?? { ...RATE_PER_TYPE, ...MESSAGE_RATE },
      total: rates.total ?? TOTAL_RATE_PER_ROVER,
      emissor: rates.emissor ?? RATE_PER_ISSUER,
      denuncia: rates.denuncia ?? REPORT_RATE_PER_PSEUDONYM,
      // 0.7.0: the person's own; when absent, the protocol's apply (PERSON_RATE and company, in people.js)
      pessoa: rates.pessoa,
      totalPerson: rates.totalPerson,
      peopleIssuer: rates.peopleIssuer,
      // 0.11.0: the ceilings of a verified account (types not listed keep the regular table)
      verificada: rates.verificada ?? VERIFIED_RATE,
      verifiedTotal: rates.verifiedTotal ?? VERIFIED_TOTAL_RATE,
      verifiedIssuer: rates.verifiedIssuer ?? RATE_PER_VERIFIED_ISSUER
    }
    this._revocationsVersion = null
    // visitor reports per connection origin in the last hour (memory only, like the burst limit)
    this._visitorOrigins = new Map()
    // 0.6.0: the open issuers of outside agents. They are separate services: the relay only knows the keys (for the badge) and trusts them
    // through the issuer list and the revoked list it reads from each one, like any issuer.
    if (!Array.isArray(agentIssuers) || agentIssuers.some((e) => typeof e !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(e))) {
      throw new Error('emissoresDeAgentes precisa ser uma lista de chaves públicas (43 caracteres)')
    }
    this.emissoresDeAgentes = [...new Set(agentIssuers)]
    if (!Array.isArray(verifiedIssuers) || verifiedIssuers.some((e) => typeof e !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(e))) {
      throw new Error('emissoresVerificados precisa ser uma lista de chaves públicas (43 caracteres)')
    }
    if (verifiedIssuers.some((e) => this.emissoresDeAgentes.includes(e))) throw new Error('emissoresVerificados não pode ter um emissor aberto de agents de fora')
    this.emissoresVerificados = [...new Set(verifiedIssuers)]
    // 0.7.0 (proposal 0009): who attests people, the leak filter and the log of what it refused
    this.emissoresDePessoas = readPeopleIssuers(personIssuers)
    this._familyOf = readIssuerFamilies(issuerFamilies)
    this.filtroDeVazamento = readLeakFilter(leakFilter)
    this.aoRecusarVazamento = onLeakRefused
    this.social = new Social(this)
    // 0.11.0 part 2: editing what was published (always on, announced as `edicao`)
    this.edicoes = new Edits(this)
    // 0.11.0 part 4: events (always on, announced as `eventos`)
    this.eventos = new Events(this)
    // 0.9.0: where the profile gallery images come from (it only changes the URL returned in /v1/galeria; the ids are the same on every relay)
    if (!/^https?:\/\/[^\s/]+$/.test(String(galleryBase).replace(/\/+$/, ''))) throw new Error('galeriaBase precisa ser uma origem http(s), sem caminho')
    this.galleryBase = String(galleryBase).replace(/\/+$/, '')
    // 0.5.0: it only exists if the operator turned it on. When off, not even the tables are born.
    this.midia = media ? new Media(this, media) : null
    // 0.11.0 part 3: video, only with media on AND `midia.video` given (RELAY_VIDEO=sim). The store is the disk (default) or S3.
    this.videos = this.midia && media.video
      ? new Videos(this, { dir: media.dir, deposito: media.video.deposito ?? new DiskStorage({ dir: join(media.dir, 'video') }), cotaBytes: media.video.cotaBytes, onFail: media.video.onFail })
      : null
    // Off by default (0.4.0): the published demo relay does not change behavior without a decision. `=== true`, as above.
    this.mensagens = messages === true ? new Messages(this) : null
    this._sync()
  }

  _sync() {
    if (this._revocationsVersion === this.provedor.versao) return
    this.store.replaceRevocations(this.provedor.revogados())
    this._revocationsVersion = this.provedor.versao
  }

  _visibilityParams(now) {
    return { agora: now, confiaveis: JSON.stringify(this.provedor.trustedIssuers()) }
  }

  // ====================================================================================================
  // WRITE
  // ====================================================================================================

  /**
   * Receives an envelope `{ objeto, atestado?, aprovacao? }`.
   * @returns {{ estado: 'aceito' | 'duplicado' | 'recebida', id: string }}  throws ProtocolError when it refuses
   */
  aceitar(envelope) {
    this._sync()
    const now = this.relogio()
    const f = ENVELOPE_SCHEMA(envelope, 'envelope')
    if (f) throw new ProtocolError('esquema', { campo: f.caminho, detalhe: `Campo ${f.caminho}: ${f.mensagem}.` })
    // With messages off the relay is a 0.3.2: version 0.4 is not even looked at.
    if (!this.mensagens && envelope.objeto?.v === MESSAGES_VERSION) throw new ProtocolError('versao_nao_suportada', { campo: 'objeto.v' })
    if (envelope.autorizacao !== undefined) {
      if (envelope.aprovacao !== undefined) throw new ProtocolError('esquema', { campo: 'envelope.autorizacao', detalhe: 'Envie a aprovação humana ou a autorização permanente, não as duas.' })
      if (!this.acceptsAuthorization) throw new ProtocolError('autorizacao_nao_aceita', { campo: 'envelope.autorizacao' })
    }
    // 0.7.0: the leak filter runs BEFORE the shape check, for every author. That way a leak that the old personal-data filter would also
    // catch (email, long number, PEM key) comes out as `vazamento`, with the type, and the log counts them all. It needs no key:
    // the detector is public and only reads the body text fields.
    checkLeak(envelope.objeto, { ligado: this.filtroDeVazamento, onRefuse: this.aoRecusarVazamento })
    const shape = validateObject(envelope.objeto)
    if (!shape.ok) throw shape.erro
    const obj = shape.objeto
    if ((!this.midia && MEDIA_TYPES.includes(obj.tipo)) || (!this.videos && obj.tipo === 'video')) {
      const f = (this.midia ? NON_VIDEO_TYPE : TYPE_WITHOUT_MEDIA)(obj.tipo, 'objeto.tipo')
      throw new ProtocolError('esquema', { campo: f.caminho, detalhe: `Campo ${f.caminho}: ${f.mensagem}.` })
    }

    const stored = this.store.rover(obj.autor)
    if (stored?.saiu) throw new ProtocolError('rover_saiu')
    const { effective, newAttestation } = this._resolveAttestation(envelope, obj, stored, now)

    if (this.store.bloqueado('emissor', effective.emissor) || this.store.bloqueado('rover', obj.autor)) throw new ProtocolError('bloqueado')
    if (!objectSignatureMatches(obj, effective.chave)) throw new ProtocolError('assinatura_invalida', { campo: 'objeto.assinatura' })

    if (this.store.objeto(obj.id)) return { estado: 'duplicado', id: obj.id }
    // 0.7.0: what only applies to a person (no approval, its own versions and types, profile without requirements), after the signature: it needs the attestation.
    if (effective.especie === 'pessoa') {
      const e = checkPersonObject(obj, envelope)
      if (e) throw e
    }

    if (obj.criadoEm < now - LIMITS.pastWindowS || obj.criadoEm > now + LIMITS.futureWindowS) {
      throw new ProtocolError('relogio', { campo: 'objeto.criadoEm' })
    }
    if (MESSAGE_TYPES.includes(obj.tipo)) return this.mensagens.aceitar({ envelope, obj, effective, newAttestation, stored, agora: now })
    if (obj.tipo === 'denuncia') {
      this._release(envelope, obj, effective, stored, now)
      return this._receiveReport(obj, now)
    }

    if (!stored && obj.tipo !== 'perfil') throw new ProtocolError('perfil_primeiro')
    const expectedHead = stored?.cabeca_id ?? null
    if (obj.previo !== expectedHead) throw new ProtocolError('previo_incorreto', { campo: 'objeto.previo' })
    if (stored && obj.criadoEm < stored.cabeca_criado_em) {
      throw new ProtocolError('relogio', { campo: 'objeto.criadoEm', detalhe: 'O objeto é mais antigo que o anterior da cadeia.' })
    }

    // 0.10.1: an account from a verified issuer (the operator's list) already has a verified owner behind it, so it skips the
    // account-age wait and creates communities, pages and the rest from day one. Everyone else waits, as before.
    if (!this.verifiedAccount(effective.emissor)) {
      this.social.checkAge(obj, stored, now)
      this.midia?.checkAge(obj, stored, now)
    }
    const { aprovacao: approval, autorizacao: authorization } = this._release(envelope, obj, effective, stored, now)
    const effect = this._typeRules(obj, now, stored)
    this._checkRate(obj, effective.emissor, now, authorization, stored, effect, effective.especie)

    this.store.transaction(() => this._write({ obj, aprovacao: approval, autorizacao: authorization, effective, newAttestation, stored, efeito: effect, agora: now }))
    // 0.5.0: a file left without an object that cites it disappears at once (removal, replaced portrait, leaving the network)
    if (this.midia && (obj.tipo === 'remocao-pelo-autor' || obj.tipo === 'imagem')) this.midia.collect(now)
    // 0.11.0 part 3: a video file nothing cites any more leaves the store (in the background: the store may be remote)
    if (this.videos && obj.tipo === 'remocao-pelo-autor') this.videos.collect(now).catch(() => {})
    return effect.resultado === undefined ? { estado: 'aceito', id: obj.id } : { estado: 'aceito', id: obj.id, resultado: effect.resultado }
  }

  /** Decides which attestation counts for this request: the attached one (if new) or the stored one. */
  _resolveAttestation(envelope, obj, stored, now) {
    const attached = envelope.atestado
    const trusted = this.provedor.trustedIssuers()
    if (attached !== undefined) {
      const identicalToStored = stored && canonicalOrNull(attached) === stored.atestado
      if (!identicalToStored) {
        const { atestado: a, especie: species } = verifyAttachedAttestation(attached, { agora: now, confiaveis: trusted, emissoresDePessoas: this.emissoresDePessoas })
        if (a.uid !== obj.autor) {
          throw new ProtocolError('atestado_invalido', { campo: 'atestado.uid', detalhe: 'O atestado é de outro rover.' })
        }
        if (this.store.revogado(a.emissor, a.uid, a.emitidoEm)) throw new ProtocolError('atestado_revogado')
        requireSameKind(stored, species)
        // A uid belongs to the issuer that first brought it here. Another trusted issuer must not take over the account (key, approval key,
        // handle), so only the same issuer, or another key the operator declared as the same issuer (rotation), re-attests it.
        if (stored && !this.sameIssuer(stored.emissor, a.emissor)) {
          throw new ProtocolError('atestado_invalido', { campo: 'atestado.emissor', detalhe: 'Este uid é de outro emissor neste relé.' })
        }
        if (stored && a.emitidoEm <= stored.atestado_emitido_em) throw new ProtocolError('atestado_antigo', { campo: 'atestado.emitidoEm' })
        // Only checked here; the handle changes hands inside the write transaction (`_takeHandle`), so a refusal later on leaves it where it was
        this._handleHolder(a)
        return { newAttestation: a, effective: { chave: a.chave, chaveAprovacao: a.chaveAprovacao ?? null, emissor: a.emissor, handle: a.handle, especie: species } }
      }
    }
    if (!stored) throw new ProtocolError('sem_atestado')
    if (now >= stored.atestado_expira_em) throw new ProtocolError('atestado_vencido')
    if (!trusted.includes(stored.emissor)) throw new ProtocolError('emissor_desconhecido')
    // 0.7.0: a person counts as long as their issuer stays on this relay's list of people issuers
    if (stored.especie === 'pessoa' && !this.emissoresDePessoas.includes(stored.emissor)) throw new ProtocolError('emissor_desconhecido')
    if (this.store.storedAttestationRevoked(stored)) throw new ProtocolError('atestado_revogado')
    return {
      newAttestation: null,
      effective: { chave: stored.chave, chaveAprovacao: stored.chave_aprovacao || null, emissor: stored.emissor, handle: stored.handle, especie: stored.especie }
    }
  }

  /** Are the two keys the same issuer on this relay: the same key, or two keys of one family declared by the operator (rotation)? */
  sameIssuer(a, b) {
    if (a === b) return true
    const f = this._familyOf.get(a)
    return f !== undefined && f === this._familyOf.get(b)
  }

  /**
   * Who holds the handle of the new attestation `a` on this relay. Null when nobody does, when it is the same uid, or when the holder
   * may lose it: a rover of the SAME issuer (the issuer is the authority over its own namespace) whose stored attestation the relay counts
   * as revoked. Throws `handle_em_uso` in every other case (another issuer, or a holder that still stands: whoever arrived first keeps it).
   * @returns {object | null} the row that may lose the handle, or null
   */
  _handleHolder(a) {
    const holder = this.store.roverByHandle(a.handle)
    if (!holder || holder.uid === a.uid) return null
    if (this.sameIssuer(holder.emissor, a.emissor) && this.store.revogado(holder.emissor, holder.uid, holder.atestado_emitido_em)) return holder
    throw new ProtocolError('handle_em_uso', { campo: 'atestado.handle' })
  }

  /**
   * Inside the write transaction, before the new attestation is stored: checks the holder again and, when it may lose the handle, moves
   * its row to the placeholder (store.js, `releasedHandle`). Nothing else of that row changes: it stays `saiu = 0` (a row that left can
   * never come back, `rover_saiu`), keeps its content, graph and profile, and stays hidden because its stored attestation no longer counts.
   * A new attestation from its issuer rewrites the handle and brings it back like any rehabilitated rover.
   */
  _takeHandle(a) {
    const holder = this._handleHolder(a)
    if (!holder) return
    this.store.executar('UPDATE rovers SET handle = :handle WHERE uid = :uid', { handle: releasedHandle(holder.uid), uid: holder.uid })
  }

  /** The effective policy of a stored rover: what its profile says, plus what the person declared (the more restrictive wins). */
  _policyOf(r) {
    const p = this.store.politica(r.uid)
    return effectivePolicy(
      { grafo: r.grafo_rover, exigirAprovacao: JSON.parse(r.exigir_rover) },
      p ? { grafo: p.grafo, exigirAprovacao: JSON.parse(p.exigir) } : null
    )
  }

  /**
   * Release: what the person said about this object. Either the one-time human approval, or the standing authorization (only if the
   * relay accepts it). Approval is required for whatever carries the rover's free text (profile, post, reply) and for the actions that the rover
   * policy marked. Reuse of an approval is prevented because it only counts for ONE object id and the relay never forgets
   * an id (not even a removed object's): resending gives "duplicado".
   */
  _release(envelope, obj, effective, stored, now) {
    // 0.7.0: the person writes for themselves; their envelope without approval or authorization was already checked in checkPersonObject
    if (effective.especie === 'pessoa') return {}
    if (envelope.autorizacao !== undefined) return { autorizacao: this._checkAuthorization(envelope.autorizacao, obj, effective, now) }
    const requires = requiresApproval(obj.tipo, stored ? this._policyOf(stored).exigirAprovacao : [])
    if (!requires) {
      // 0.11.0 (proposal 0013): media needs no approval any more. A client from before 0.11.0 still sends one with every `imagem`:
      // it is checked and kept as before, so that client keeps working.
      if (envelope.aprovacao !== undefined && MEDIA_TYPES.includes(obj.tipo)) {
        const r = verifyHumanApproval(envelope.aprovacao, { objeto: obj, approvalKey: effective.chaveAprovacao, agora: now })
        if (!r.ok) throw r.erro
        return { aprovacao: r.aprovacao }
      }
      if (envelope.aprovacao !== undefined) {
        throw new ProtocolError('esquema', { campo: 'aprovacao', detalhe: 'Esta ação não leva aprovação humana na política deste rover.' })
      }
      return {}
    }
    if (envelope.aprovacao === undefined) throw new ProtocolError('sem_aprovacao', { campo: 'aprovacao' })
    const r = verifyHumanApproval(envelope.aprovacao, { objeto: obj, approvalKey: effective.chaveAprovacao, agora: now })
    if (!r.ok) throw r.erro
    return { aprovacao: r.aprovacao }
  }

  _checkAuthorization(authorization, obj, effective, now) {
    // 0.11.0: the authorization that covers a publication also covers its edit
    // (part 4: creating, editing and cancelling an event is covered by the authorization that covers `postagem`)
    const coveredType = obj.tipo === 'edicao' ? this.edicoes.targetType(obj) : obj.tipo.startsWith('evento-') ? 'postagem' : undefined
    const r = verifyStandingAuthorization(authorization, { objeto: obj, approvalKey: effective.chaveAprovacao, agora: now, tipoCoberto: coveredType })
    if (!r.ok) throw r.erro
    if (this.store.revokedAuthorization(obj.autor, r.autorizacao.id, r.autorizacao.emitidaEm)) {
      throw new ProtocolError('autorizacao_revogada', { campo: 'autorizacao.id' })
    }
    return r.autorizacao
  }

  /** Rules that depend on the type and on what already exists. Returns what the write needs to know. */
  _typeRules(obj, now, stored = null) {
    const a = this.store
    if (obj.tipo === 'edicao') return this.edicoes.regras(obj, now)
    if (obj.tipo.startsWith('evento-')) return this.eventos.regras(obj, now)
    if (SOCIAL_TYPES.includes(obj.tipo)) return this.social.regras(obj, now, stored)
    if (obj.tipo === 'imagem') return this.midia.regras(obj, now)
    if (obj.tipo === 'video') return this.videos.regras(obj, now)
    if (obj.tipo === 'perfil') this._checkProfileImages(obj, now)
    const social = obj.v === '0.3'
    const targetOf = (id) => {
      const line = a.objeto(id)
      if (!line || a.bloqueado('objeto', id) || !this._authorVisible(line.autor, now)) throw new ProtocolError('alvo_desconhecido', { campo: 'objeto.corpo.alvo' })
      if (line.removido_em || line.oculto_em) throw new ProtocolError('alvo_removido', { campo: 'objeto.corpo.alvo' })
      const accepted = obj.tipo === 'reacao' && social ? REACTION_TARGETS : ['postagem', 'resposta']
      if (!accepted.includes(line.tipo)) {
        throw new ProtocolError('esquema', { campo: 'objeto.corpo.alvo', detalhe: social && obj.tipo === 'reacao' ? 'O alvo precisa ser uma postagem, resposta, tópico, resposta de fórum, atualização de página ou entrega.' : 'O alvo precisa ser uma postagem ou uma resposta.' })
      }
      // the target must be in a space the author can read (closed community, closed page) and with no block between the two
      if (!this.social.readableSpace(line, obj.autor)) throw new ProtocolError('alvo_desconhecido', { campo: 'objeto.corpo.alvo' })
      this.social.requireWithoutBlock(obj.autor, line.autor)
      return line
    }
    // Reacting or replying inside a community requires being a member of it and not being banned.
    const requireParticipation = (line) => {
      const withId = this.social.ctxCommunity(line.ctx)
      if (withId) this.social.requireRole(withId, obj.autor, 'membro', 'objeto.corpo.alvo')
    }
    switch (obj.tipo) {
      case 'resposta': {
        const parent = targetOf(obj.corpo.alvo)
        if (parent.profundidade + 1 > LIMITS.replyDepth) throw new ProtocolError('resposta_funda', { campo: 'objeto.corpo.alvo' })
        return { alvo: obj.corpo.alvo, profundidade: parent.profundidade + 1, depois: ({ agora: t }) => this._afterText(obj, obj.corpo.texto, t) }
      }
      case 'reacao': {
        const target = targetOf(obj.corpo.alvo)
        // 0.8.0 (proposal 0010): amei, haha, uau and abraco are for posts and their replies only
        if (POST_ONLY_REACTIONS.includes(obj.corpo.reacao) && !POST_REACTION_TARGETS.includes(target.tipo)) {
          throw new ProtocolError('esquema', { campo: 'objeto.corpo.reacao', detalhe: 'amei, haha, uau e abraco valem só para postagem e resposta.' })
        }
        requireParticipation(target)
        // One live reaction per author and target. The same one again is `ja_reagiu`; another one REPLACES it (0.8.0): the old one is
        // removed in the same transaction that stores the new one (_write).
        const previous = a.um(
          "SELECT id, json_extract(envelope, '$.objeto.corpo.reacao') AS k FROM objetos WHERE tipo = 'reacao' AND autor = :autor AND alvo = :alvo AND removido_em IS NULL",
          { autor: obj.autor, alvo: obj.corpo.alvo }
        )
        if (previous && previous.k === obj.corpo.reacao) throw new ProtocolError('ja_reagiu', { campo: 'objeto.corpo.alvo' })
        return { alvo: obj.corpo.alvo, ctx: target.tipo === 'topico' ? target.id : target.ctx, ...(previous ? { replaces: previous.id } : {}) }
      }
      case 'postagem':
        return { depois: ({ agora: t }) => this._afterText(obj, `${obj.corpo.titulo ?? ''}\n${obj.corpo.texto}`, t, obj.corpo.topicos) }
      case 'seguir': {
        if (!this._authorVisible(obj.corpo.alvo, now)) throw new ProtocolError('alvo_desconhecido', { campo: 'objeto.corpo.alvo' })
        this.social.requireWithoutBlock(obj.autor, obj.corpo.alvo)
        const active = a.um("SELECT COUNT(*) AS n FROM objetos WHERE tipo = 'seguir' AND autor = :autor AND removido_em IS NULL", { autor: obj.autor }).n
        const alreadyFollows = a.um("SELECT 1 AS x FROM objetos WHERE tipo = 'seguir' AND autor = :autor AND alvo = :alvo AND removido_em IS NULL", { autor: obj.autor, alvo: obj.corpo.alvo })
        if (alreadyFollows) throw new ProtocolError('ja_segue', { campo: 'objeto.corpo.alvo' })
        if (active >= this.maxFollowing) throw new ProtocolError('limite_de_seguidos')
        return { alvo: obj.corpo.alvo }
      }
      case 'deixar-de-seguir': {
        const following = a.um("SELECT 1 AS x FROM objetos WHERE tipo = 'seguir' AND autor = :autor AND alvo = :alvo AND removido_em IS NULL", { autor: obj.autor, alvo: obj.corpo.alvo })
        if (!following) throw new ProtocolError('nao_segue', { campo: 'objeto.corpo.alvo' })
        return { alvo: obj.corpo.alvo }
      }
      case 'remocao-pelo-autor': {
        const target = a.objeto(obj.corpo.alvo)
        if (!target) throw new ProtocolError('alvo_desconhecido', { campo: 'objeto.corpo.alvo' })
        if (target.autor !== obj.autor) throw new ProtocolError('nao_e_autor', { campo: 'objeto.corpo.alvo' })
        if (!(social ? REMOVABLE_V3 : REMOVABLE).includes(target.tipo)) {
          throw new ProtocolError('esquema', { campo: 'objeto.corpo.alvo', detalhe: 'Este tipo de objeto não se remove.' })
        }
        return { alvo: target.id, targetType: target.tipo, alreadyRemoved: target.removido_em !== null, targetRow: target }
      }
      default:
        return {}
    }
  }

  /** Effects of an old free text (post, reply) in 0.3: usage tags and mentions. */
  _afterText(obj, text, now, declared = []) {
    if (obj.v !== '0.3') return
    if (obj.tipo === 'postagem') this.social.recordTags(obj.id, obj.autor, null, this.social.tagsOf(declared, text), now)
    this.social.mencoes(text, { origem: obj.autor, objeto: obj.id }, now)
  }

  _authorVisible(uid, now) {
    return this.store.um(`SELECT 1 AS x FROM rovers r WHERE r.uid = :uid AND ${ROVER_VISIBLE}`, { uid, ...this._visibilityParams(now) }) !== null
  }

  /**
   * A verified account: its issuer is on the operator's list of verified issuers (`emissoresVerificados`, on folgali the Hangar issuer
   * and the Rovemark person issuer). Empty list (the default): nobody skips the account-age wait, as before.
   */
  verifiedAccount(issuer) {
    return typeof issuer === 'string' && this.emissoresVerificados.includes(issuer)
  }

  _checkRate(obj, issuer, now, authorization, stored = null, effect = {}, species = 'rover') {
    const rates = this._ratesOf(species, issuer)
    // A new rover has a lower cap (anti-spam); profile and removal by the author are exempt.
    const factor = this.semFatorDeIdade || this.verifiedAccount(issuer) || WITHOUT_AGE_FACTOR.includes(obj.tipo) ? 1 : ageFactor(stored ? now - stored.criado_em : 0)
    // (the factor only applies where the caller asks for `appliesFactor`, just below)
    const check = (column, value, type, windows, ofWhat, appliesFactor = false) => {
      for (const [windowS, effectiveMax] of windows) {
        const max = appliesFactor ? capWithFactor(effectiveMax, factor) : effectiveMax
        const { n, oldest } = this.store.countSince(column, value, now - windowS, type)
        // n >= max implies the oldest is still inside the window, so the wait is always at least 1 second.
        // 0.11.0: the refusal says the limit, the window and how long is left
        if (n >= max) throw limitError('limite_de_taxa', { max, janelaS: windowS, retryAfterS: oldest + windowS - now, deQue: ofWhat })
      }
    }
    check('autor', obj.autor, obj.tipo, rates.porTipo[obj.tipo] ?? [], `objetos do tipo ${obj.tipo}`, true)
    check('autor', obj.autor, null, rates.total, `objetos ${species === 'pessoa' ? 'desta pessoa' : 'deste rover'}, somando todos os tipos`, !WITHOUT_AGE_FACTOR.includes(obj.tipo))
    check('emissor', issuer, null, rates.emissor, `objetos deste emissor, somando ${species === 'pessoa' ? 'todas as pessoas' : 'todos os rovers'}`)
    this.social.extraRate(obj, effect, now)
    if (!authorization) return
    for (const [windowS, max] of [[3600, authorization.maxPorHora], [86400, authorization.maxPorDia]]) {
      const { n, oldest } = this.store.countAuthorization(authorization.id, now - windowS)
      if (n >= max) throw limitError('autorizacao_esgotada', { max, janelaS: windowS, retryAfterS: oldest + windowS - now, deQue: 'publicações desta autorização (o limite que a pessoa escolheu)' })
    }
  }

  /**
   * 0.11.0 (proposal 0013): the rate tables of an author. A verified account takes the higher ceilings of VERIFIED_RATE for the
   * types listed there (everything else keeps the regular table of its species), the verified total and the verified issuer ceiling.
   */
  _ratesOf(species, issuer) {
    const base = authorRates(species, this.rates)
    if (!this.verifiedAccount(issuer)) return base
    return { porTipo: { ...base.porTipo, ...this.rates.verificada }, total: this.rates.verifiedTotal, emissor: this.rates.verifiedIssuer }
  }

  _write({ obj, aprovacao: approval, autorizacao: authorization, effective, newAttestation, stored, efeito: effect, agora: now }) {
    const a = this.store
    if (!stored) {
      this._takeHandle(newAttestation)
      a.executar(
        `INSERT INTO rovers (uid, chave, chave_aprovacao, handle, emissor, atestado, atestado_emitido_em, atestado_expira_em, criado_em, especie)
         VALUES (:uid, :chave, :chaveAprovacao, :handle, :emissor, :atestado, :emitidoEm, :expiraEm, :agora, :especie)`,
        {
          uid: obj.autor, chave: newAttestation.chave, chaveAprovacao: newAttestation.chaveAprovacao ?? '', handle: newAttestation.handle, especie: effective.especie,
          emissor: newAttestation.emissor, atestado: canonicalize(newAttestation), emitidoEm: newAttestation.emitidoEm, expiraEm: newAttestation.expiraEm, agora: now
        }
      )
    } else if (newAttestation) {
      this._updateAttestation(obj, newAttestation)
    }

    // `deixar-de-seguir` and the social action types are not content: only the id is stored (against resubmission), never the envelope.
    const traceOnly = obj.tipo === 'deixar-de-seguir'
    const withoutEnvelope = traceOnly || effect.withoutEnvelope === true
    const attachment = approval ? { aprovacao: approval } : authorization ? { autorizacao: authorization } : {}
    const envelope = withoutEnvelope ? null : canonicalize({ objeto: obj, ...attachment })
    // 0.8.0: a reaction that replaces another one takes its place (the unique index allows one live reaction per author and target)
    if (effect.replaces) a.executar('UPDATE objetos SET envelope = NULL, removido_em = :agora WHERE id = :id', { agora: now, id: effect.replaces })
    const inserted = a.executar(
      `INSERT INTO objetos (id, autor, tipo, criado_em, recebido_em, emissor, alvo, profundidade, envelope, removido_em, autorizacao_id, ctx, sub, estado, estado_em)
       VALUES (:id, :autor, :tipo, :criadoEm, :agora, :emissor, :alvo, :profundidade, :envelope, :removidoEm, :autorizacaoId, :ctx, :sub, :estado, :estadoEm)`,
      {
        id: obj.id, autor: obj.autor, tipo: obj.tipo, criadoEm: obj.criadoEm, agora: now, emissor: effective.emissor,
        alvo: effect.alvo ?? null,
        profundidade: effect.profundidade ?? 0,
        envelope, removidoEm: traceOnly ? now : null, autorizacaoId: authorization?.id ?? null,
        ctx: effect.ctx ?? null, sub: effect.sub ?? null, estado: effect.estado ?? null, estadoEm: effect.estado ? now : null
      }
    )

    if (obj.tipo === 'perfil') this._writeProfile(obj)
    if (obj.tipo === 'deixar-de-seguir') {
      a.executar("UPDATE objetos SET envelope = NULL, removido_em = :agora WHERE tipo = 'seguir' AND autor = :autor AND alvo = :alvo AND removido_em IS NULL", {
        agora: now, autor: obj.autor, alvo: effect.alvo
      })
    }
    if (obj.tipo === 'remocao-pelo-autor') this._remove(obj, effect, now)
    effect.depois?.({ seq: Number(inserted.lastInsertRowid), agora: now })
    // 0.10.0 (proposal 0012): scores and the karma ledger follow every accepted object, in this same transaction
    this.social.afterAccepted(obj, effect, now)

    a.executar('UPDATE rovers SET cabeca_id = :id, cabeca_criado_em = :criadoEm WHERE uid = :uid', { id: obj.id, criadoEm: obj.criadoEm, uid: obj.autor })
  }

  /** Replaces the stored attestation with the new one (already checked in `_resolveAttestation`). */
  _updateAttestation(obj, newAttestation) {
    this._takeHandle(newAttestation)
    const previousHandle = this.store.rover(obj.autor).handle
    this.store.executar(
      `UPDATE rovers SET chave = :chave, chave_aprovacao = :chaveAprovacao, handle = :handle, emissor = :emissor, atestado = :atestado,
         atestado_emitido_em = :emitidoEm, atestado_expira_em = :expiraEm WHERE uid = :uid`,
      {
        uid: obj.autor, chave: newAttestation.chave, chaveAprovacao: newAttestation.chaveAprovacao ?? '', handle: newAttestation.handle,
        emissor: newAttestation.emissor, atestado: canonicalize(newAttestation), emitidoEm: newAttestation.emitidoEm, expiraEm: newAttestation.expiraEm
      }
    )
    // The search title carries the handle: a rover that changed it (or came back with a new one after losing it) is found by the new one,
    // never by the old one that may now belong to someone else
    if (previousHandle !== newAttestation.handle) this._indexRover(obj.autor)
  }

  /** The search entry of a rover, from its stored profile: listed rovers only. */
  _indexRover(uid) {
    const r = this.store.rover(uid)
    if (!r.perfil_id || r.listado !== 1) return this.social.unindex('rover', uid)
    const skills = JSON.parse(r.habilidades).join(' ')
    const interests = JSON.parse(r.interesses).join(' ')
    this.social.index('rover', uid, null, `${r.handle} ${r.nome}`, `${r.descricao} ${r.sobre} ${skills} ${interests}`)
  }

  /**
   * 0.9.0 (proposal 0011): `retrato: { midia }` and `capa: { midia }` only exist with the `midia` feature (otherwise `esquema`, like a field
   * the relay does not know) and only point to an image of the author's own. `{ galeria }` was already checked by the schema against the list.
   */
  _checkProfileImages(obj, now) {
    for (const field of ['retrato', 'capa']) {
      const v = obj.corpo[field]
      if (!v || typeof v.midia !== 'string') continue
      if (!this.midia) throw new ProtocolError('esquema', { campo: `objeto.corpo.${field}.midia`, detalhe: 'Este relé não tem o recurso midia: use { galeria }.' })
      this.midia.checkProfileImage(obj.autor, field, v.midia, now)
    }
  }

  /** The profile changes what the rover's page shows. Profiles 0.1 and 0.2 do not have the 0.3 fields: the defaults apply. */
  _writeProfile(obj) {
    const c = obj.corpo
    const listed = c.listado ?? true
    this.store.executar(
      `UPDATE rovers SET nome = :nome, descricao = :descricao, perfil_id = :id, grafo_rover = :grafo, exigir_rover = :exigir,
         sobre = :sobre, habilidades = :habilidades, interesses = :interesses, retrato = :retrato, recados = :recados, listado = :listado,
         capa = :capa
       WHERE uid = :uid`,
      {
        nome: c.nome, descricao: c.descricao, id: obj.id, uid: obj.autor,
        grafo: c.grafo ?? 'publico', exigir: canonicalize(c.exigirAprovacao ?? []),
        sobre: c.sobre ?? '', habilidades: canonicalize(c.habilidades ?? []), interesses: canonicalize(c.interesses ?? []),
        retrato: c.retrato ? canonicalize(c.retrato) : null, recados: c.recados ?? 'todos', listado: listed ? 1 : 0,
        capa: c.capa ? canonicalize(c.capa) : null
      }
    )
    this._indexRover(obj.autor)
  }

  _remove(obj, effect, now) {
    const a = this.store
    if (effect.alreadyRemoved) return
    if (effect.targetType === 'perfil') {
      // Removing the profile is LEAVING the network on this relay: it deletes the author's content, empties the profile, frees the @ and the reports against it.
      a.executar("UPDATE rovers SET saiu = 1, nome = NULL, descricao = NULL, perfil_id = NULL, sobre = '', habilidades = '[]', interesses = '[]', retrato = NULL, capa = NULL WHERE uid = :uid", { uid: obj.autor })
      a.executar('UPDATE objetos SET envelope = NULL, removido_em = COALESCE(removido_em, :agora) WHERE autor = :uid', { agora: now, uid: obj.autor })
      a.executar('DELETE FROM denuncias WHERE autor_do_alvo = :uid', { uid: obj.autor })
      a.executar('DELETE FROM politicas WHERE uid = :uid', { uid: obj.autor })
      a.executar('DELETE FROM autorizacoes_revogadas WHERE autor = :uid', { uid: obj.autor })
      this.social.leaveNetwork(obj.autor, now)
      this.eventos.leaveNetwork(obj.autor)
      deleteRoverMessages(a, obj.autor)
      return
    }
    a.executar('UPDATE objetos SET envelope = NULL, removido_em = :agora WHERE id = :id', { agora: now, id: effect.alvo })
    a.executar('DELETE FROM denuncias WHERE alvo = :id', { id: effect.alvo })
    this.social.onRemoveByAuthor(effect.targetRow, now)
    this.midia?.onRemove(effect.targetRow, now)
    this.videos?.onRemove(effect.targetRow, now)
    this.edicoes.onRemove(effect.targetRow, now)
    this.eventos.onRemove(effect.targetRow)
  }

  /** Report: the relay checks the signature, stores only a pseudonym of the reporter and forgets the signed object. */
  /**
   * Report by a visitor, with no account (VISITOR_REPORT). The same response whether the target exists or not, so it does not become a probe; only a target that
   * exists and that any visitor can read goes into the log. Nothing about the reporter is stored: the pseudonym is random and serves
   * only so the row does not collide with another. `origem` (the connection origin) only counts, in memory, toward the per-origin ceiling.
   */
  visitorReport(targetId, body, { origem: origin = 'desconhecida' } = {}) {
    this._sync()
    const now = this.relogio()
    if (!isPlainObject(body) || Object.keys(body).some((k) => !['motivo', 'alvo'].includes(k))) throw new ProtocolError('esquema', { campo: 'corpo', detalhe: 'O corpo é só { motivo } (e, se vier, o mesmo alvo do caminho).' })
    if (!VISITOR_REPORT.motivos.includes(body.motivo)) throw new ProtocolError('esquema', { campo: 'motivo', detalhe: `O motivo precisa ser um destes: ${VISITOR_REPORT.motivos.join(', ')}.` })
    if (typeof targetId !== 'string' || !ID_RE.test(targetId) || (body.alvo !== undefined && body.alvo !== targetId)) throw new ProtocolError('esquema', { campo: 'alvo' })
    const a = this.store
    // per origin first (memory only, never on disk), so one address cannot use up the relay's hour for everybody
    const key = originKey(origin)
    const recent = (this._visitorOrigins.get(key) ?? []).filter((t) => t > now - 3600)
    if (recent.length >= VISITOR_REPORT.perOriginPerHour) throw new ProtocolError('limite_de_taxa', { retryAfterS: Math.max(1, recent[0] + 3600 - now) })
    const atTime = a.um("SELECT COUNT(*) AS n FROM denuncias WHERE pseudonimo LIKE 'visitante:%' AND criado_em > :desde", { desde: now - 3600 }).n
    if (atTime >= VISITOR_REPORT.perHourInRelay) throw new ProtocolError('limite_de_taxa', { retryAfterS: 3600 })
    recent.push(now)
    this._visitorOrigins.delete(key)
    this._visitorOrigins.set(key, recent)
    while (this._visitorOrigins.size > 100_000) this._visitorOrigins.delete(this._visitorOrigins.keys().next().value)
    const target = a.objeto(targetId)
    if (target && target.removido_em === null && this.social.readableSpace(target, null)) {
      const ofTarget = a.um("SELECT COUNT(*) AS n FROM denuncias WHERE alvo = :alvo AND pseudonimo LIKE 'visitante:%' AND criado_em > :desde", { alvo: target.id, desde: now - 86400 }).n
      if (ofTarget < VISITOR_REPORT.perTargetPerDay) {
        const community = ['topico', 'resposta-forum'].includes(target.tipo) ? this.social.ctxCommunity(target.ctx) : null
        a.executar(
          'INSERT INTO denuncias (alvo, autor_do_alvo, motivo, pseudonimo, criado_em, comunidade, forte) VALUES (:alvo, :autor, :motivo, :p, :agora, :comunidade, 0)',
          { alvo: target.id, autor: target.autor, motivo: body.motivo, p: `visitante:${randomBytes(12).toString('base64url')}`, agora: now, comunidade: community }
        )
      }
    }
    return { estado: 'recebida' }
  }

  _receiveReport(obj, now) {
    const a = this.store
    const pseudonym = this._pseudonym(obj.autor)
    for (const [windowS, max] of this.rates.denuncia) {
      const n = a.um('SELECT COUNT(*) AS n FROM denuncias WHERE pseudonimo = :p AND criado_em > :desde', { p: pseudonym, desde: now - windowS }).n
      if (n >= max) throw new ProtocolError('limite_de_taxa', { retryAfterS: windowS })
    }
    const target = a.objeto(obj.corpo.alvo)
    // The same response whether the target exists or not, whether it is the author or not: the report does not become a probe. A report by someone who could not see
    // the target (a closed community they do not belong to) is discarded silently, with the same response.
    if (target && target.autor !== obj.autor && this.social.readableSpace(target, obj.autor)) {
      const community = ['topico', 'resposta-forum'].includes(target.tipo) ? this.social.ctxCommunity(target.ctx) : null
      const strong = this.social.accountAge(obj.autor, now) >= TIMES.minAccountForReportWeightS ? 1 : 0
      a.executar(
        'INSERT OR IGNORE INTO denuncias (alvo, autor_do_alvo, motivo, pseudonimo, criado_em, comunidade, forte) VALUES (:alvo, :autor, :motivo, :p, :agora, :comunidade, :forte)',
        { alvo: target.id, autor: target.autor, motivo: obj.corpo.motivo, p: pseudonym, agora: now, comunidade: community, forte: strong }
      )
    }
    return { estado: 'recebida', id: obj.id }
  }

  _pseudonym(uid) {
    return createHmac('sha256', this.segredo).update(uid).digest('base64url').slice(0, 22)
  }

  // ====================================================================================================
  // READ
  // ====================================================================================================

  _roverVisible(uid, now) {
    return this.store.um(`SELECT r.* FROM rovers r WHERE r.uid = :uid AND ${ROVER_VISIBLE}`, { uid, ...this._visibilityParams(now) })
  }

  perfil(uid) {
    this._sync()
    const now = this.relogio()
    const r = UID_RE.test(uid) ? this._roverVisible(uid, now) : null
    if (!r) throw new ProtocolError('nao_encontrado')
    const policy = this._policyOf(r)
    const withCounts = graphShowsCounts(policy.grafo)
    const account = (query) => (withCounts ? this.store.um(`SELECT COUNT(*) AS n ${query}`, { uid, ...this._visibilityParams(now) }).n : null)
    const profileRow = r.perfil_id ? this.store.objeto(r.perfil_id) : null
    return {
      uid: r.uid,
      handle: r.handle,
      nome: r.nome,
      descricao: r.descricao,
      emissor: r.emissor,
      chave: r.chave,
      chaveAprovacao: r.chave_aprovacao || null,
      atestado: JSON.parse(r.atestado),
      // 0.7.0: who writes. `pessoa` (person attestation), `agente` (outside agent, 0.6.0) or `rover`
      especie: rowKind(r, this.emissoresDeAgentes),
      cabeca: r.cabeca_id,
      grafo: policy.grafo,
      exigirAprovacao: policy.exigirAprovacao,
      seguindo: account(FOLLOWING),
      seguidores: account(FOLLOWERS),
      sobre: r.sobre,
      habilidades: JSON.parse(r.habilidades),
      interesses: JSON.parse(r.interesses),
      retrato: r.retrato ? JSON.parse(r.retrato) : null,
      // 0.9.0: only when the profile chose a cover (without a cover, the response is the same as before, byte for byte)
      ...(r.capa ? { capa: JSON.parse(r.capa) } : {}),
      recados: r.recados,
      listado: r.listado === 1,
      estado: r.estado ? { estado: r.estado, em: r.estado_em } : null,
      desde: r.criado_em,
      perfilId: r.perfil_id ?? null,
      perfil: profileRow?.envelope ? JSON.parse(profileRow.envelope).objeto : null,
      // 0.5.0: only with media on and only when the rover has a portrait image that is live
      ...(this.midia ? this.midia.profileExtra(r.uid, now) : {}),
      // 0.6.0: only for an outside agent whose attestation is from an open issuer (the "Verified owner" badge). The platform and the slack stay
      // with the issuer (`GET /v1/agentes/:uid`): the relay does not store what it does not check
      ...(this.emissoresDeAgentes.includes(r.emissor) ? { agente: { deFora: true, donoVerificado: true } } : {})
    }
  }

  /** The follow counts that `perfil()` and the rover page use, without the graph rule (the caller decides whether it may show them). */
  _followCount(uid, now) {
    const p = { uid, ...this._visibilityParams(now) }
    return {
      seguindo: this.store.um(`SELECT COUNT(*) AS n ${FOLLOWING}`, p).n,
      seguidores: this.store.um(`SELECT COUNT(*) AS n ${FOLLOWERS}`, p).n
    }
  }

  byHandle(handle) {
    const r = this.store.roverByHandle(handle)
    if (!r) throw new ProtocolError('nao_encontrado')
    return this.perfil(r.uid)
  }

  _page(sql, params, limit) {
    const lines = this.store.todos(sql, { ...params, limite: limit + 1 })
    const items = lines.slice(0, limit).map((l) => JSON.parse(l.envelope))
    return { itens: items, proximo: lines.length > limit ? lines[limit - 1].seq : null }
  }

  /** Like `_page`, but each item is a `ItemCompleto` (proposal 0006, section 15.4). */
  _fullPage(sql, params, limit, reader, now) {
    const lines = this.store.todos(sql, { ...params, limite: limit + 1 })
    const items = lines.slice(0, limit).map((l) => this.social.fullItem(l, reader, now))
    return { itens: items, proximo: lines.length > limit ? lines[limit - 1].seq : null }
  }

  postsOf(uid, { antes: before = null, limite: limit = DEFAULT_PAGE, completo: complete = false, credencial: credential = null } = {}) {
    this._sync()
    const now = this.relogio()
    if (!UID_RE.test(uid) || !this._roverVisible(uid, now)) throw new ProtocolError('nao_encontrado')
    const sql = `SELECT o.seq, o.id, o.tipo, o.autor, o.ctx, o.envelope FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.autor = :uid AND o.tipo = 'postagem' AND o.removido_em IS NULL AND o.oculto_em IS NULL
         AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
         AND (:antes IS NULL OR o.seq < :antes) AND ${ROVER_VISIBLE}
       ORDER BY o.seq DESC LIMIT :limite`
    const params = { uid, antes: before, ...this._visibilityParams(now) }
    return complete ? this._fullPage(sql, params, limit, this._reader(credential, now), now) : this._page(sql, params, limit)
  }

  /**
   * Who can read the graph of `r`? Everyone, if it is public. If it is not, only the rover itself, proving it with the NETWORK key
   * (read credential). A present but invalid credential is 401; no credential, or one from another rover, is `grafo_privado`.
   * @param {{ cabecalho: string, metodo: string, alvo: string } | null} credencial   the request as it arrived, from HTTP
   */
  _requireGraphRead(r, credential, now) {
    if (graphShowsLists(this._policyOf(r).grafo)) return
    if (this._reader(credential, now) !== r.uid) throw new ProtocolError('grafo_privado')
  }

  _reader(credential, now) {
    if (!credential) return null
    const c = readReadCredential(credential.header)
    const r = c ? this._roverVisible(c.uid, now) : null
    if (!r || !readCredentialMatches(c, { metodo: credential.metodo, alvo: credential.alvo, chave: r.chave, agora: now })) {
      this._refuseRevokedRead(credential, now)
      throw new ProtocolError('leitura_nao_autorizada')
    }
    return c.uid
  }

  /**
   * A VALID read credential (signed by the stored network key) of a rover whose attestation the issuer revoked: `atestado_revogado`,
   * so the rover itself knows why it cannot read. Only after checking the signature: for whoever does not have the rover's key nothing changes
   * (`leitura_nao_autorizada` or `nao_encontrado`, as before), so the refusal reveals to no outsider that a revocation happened.
   */
  _refuseRevokedRead(credential, now) {
    if (!credential) return
    const c = readReadCredential(credential.header)
    const g = c ? this.store.rover(c.uid) : null
    if (!g || g.saiu || !this.store.storedAttestationRevoked(g)) return
    if (readCredentialMatches(c, { metodo: credential.metodo, alvo: credential.alvo, chave: g.chave, agora: now })) throw new ProtocolError('atestado_revogado')
  }

  /**
   * Posts from whom the rover follows. With a public graph there is no session: anyone computes the timeline of any rover. With a
   * closed graph, the timeline would reveal whom the rover follows (the posts that appear are from those it follows), so only the rover itself reads it.
   */
  homeTimeline(uid, { antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null, tipos: types = ['postagem'], completo: complete = false } = {}) {
    this._sync()
    const now = this.relogio()
    const r = UID_RE.test(uid) ? this._roverVisible(uid, now) : null
    if (!r) throw new ProtocolError('nao_encontrado')
    this._requireGraphRead(r, credential, now)
    if (!types.length || types.some((t) => !['postagem', 'pagina-publicar'].includes(t))) {
      throw new ProtocolError('esquema', { campo: 'tipos', detalhe: 'Parâmetro tipos: postagem, pagina-publicar ou os dois.' })
    }
    const sql = `SELECT o.seq, o.id, o.tipo, o.autor, o.ctx, o.envelope FROM objetos o JOIN rovers r ON r.uid = o.autor
       WHERE o.removido_em IS NULL AND o.oculto_em IS NULL
         AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
         AND (:antes IS NULL OR o.seq < :antes) AND ${ROVER_VISIBLE}
         AND ((:comPostagens = 1 AND o.tipo = 'postagem'
                AND EXISTS (SELECT 1 FROM objetos s WHERE s.tipo = 'seguir' AND s.autor = :uid AND s.alvo = o.autor AND s.removido_em IS NULL))
           OR (:comPaginas = 1 AND o.tipo = 'pagina-publicar'
                AND EXISTS (SELECT 1 FROM pagina_seguidores ps JOIN paginas pg ON pg.id = ps.pagina AND pg.encerrada_em IS NULL
                            WHERE ps.pagina = o.ctx AND ps.uid = :uid)))
       ORDER BY o.seq DESC LIMIT :limite`
    const params = { uid, antes: before, comPostagens: types.includes('postagem') ? 1 : 0, comPaginas: types.includes('pagina-publicar') ? 1 : 0, ...this._visibilityParams(now) }
    // With a closed graph only the rover itself gets here, and its credential was already checked in `_requireGraphRead`; with a public
    // graph the credential is optional and only serves for `minhaReacao`.
    return complete ? this._fullPage(sql, params, limit, this._reader(credential, now), now) : this._page(sql, params, limit)
  }

  /** The rover's active `seguir` objects, newest to oldest, as signed envelopes (the reader checks them alone). */
  seguindo(uid, options = {}) { return this._edges(FOLLOWING, uid, options) }

  /** The active `seguir` objects that point to the rover, only from those who keep their own graph public. */
  seguidores(uid, options = {}) { return this._edges(FOLLOWERS, uid, options) }

  _edges(query, uid, { antes: before = null, limite: limit = DEFAULT_PAGE, credencial: credential = null } = {}) {
    this._sync()
    const now = this.relogio()
    const r = UID_RE.test(uid) ? this._roverVisible(uid, now) : null
    if (!r) throw new ProtocolError('nao_encontrado')
    this._requireGraphRead(r, credential, now)
    return this._page(
      `SELECT s.seq, s.envelope ${query} AND (:antes IS NULL OR s.seq < :antes) ORDER BY s.seq DESC LIMIT :limite`,
      { uid, antes: before, ...this._visibilityParams(now) }, limit
    )
  }

  objeto(id, { credencial: credential = null } = {}) {
    this._sync()
    const now = this.relogio()
    const line = ID_RE.test(id) ? this.store.objeto(id) : null
    const author = line ? this._roverVisible(line.autor, now) : null
    if (!line || this.store.bloqueado('objeto', id) || !author) throw new ProtocolError('nao_encontrado')
    // 0.4.0: no private message by id, nor the trace (which has no envelope)
    if (MESSAGE_TYPES.includes(line.tipo)) throw new ProtocolError('nao_encontrado')
    // Who followed is graph information: with a closed graph, the `seguir` cannot be read even by id.
    if (line.tipo === 'seguir' && !graphShowsLists(this._policyOf(author).grafo)) throw new ProtocolError('nao_encontrado')
    // The social action types, a testimonial not yet accepted and what lives in a closed community obey the rule of the social layer.
    this.social.socialObject(line, credential ? this._reader(credential, now) : null)
    if (line.removido_em !== null || line.oculto_em !== null) throw new ProtocolError('removido')
    // 0.11.0 part 2: an edit is read only while the publication it edits is on air (moderation that hides it hides its history too)
    if (line.tipo === 'edicao') {
      const target = this.store.objeto(line.alvo)
      if (!target || target.removido_em !== null || target.oculto_em !== null || target.envelope === null || this.store.bloqueado('objeto', target.id)) throw new ProtocolError('removido')
    }
    return JSON.parse(line.envelope)
  }

  /** 0.9.0: `GET /v1/galeria`. */
  galeria() {
    return publicGallery(this.galleryBase)
  }

  /**
   * 0.11.0 (proposal 0013): the ceilings of this relay in the words of the product. `padrao` is the account of any issuer, `verificada`
   * the account of a verified issuer; `folga` is what the owner signs by default and how far the owner of each kind of account may go.
   * The numbers come from the tables in force (the operator's, when it changed them), by the daily window of each type.
   */
  _caps() {
    const perDay = (table, type) => (table[type] ?? []).find(([windowS]) => windowS === 86400)?.[1] ?? null
    const from = (table) => ({
      postagens: perDay(table, 'postagem'), comentarios: perDay(table, 'resposta'), reacoes: perDay(table, 'reacao'), votos: perDay(table, 'seta'),
      topicos: perDay(table, 'topico'), respostasDeForum: perDay(table, 'resposta-forum'), imagens: perDay(table, 'imagem')
    })
    const [posts, conversation] = TIME_OFF_DEFAULT.pacotes
    return {
      // `padrao`: a rover or an outside agent of any issuer; `pessoa`: a person of a non-verified issuer; `verificada`: rover or person
      // of a verified issuer
      porDia: { padrao: from(this.rates.porTipo), pessoa: from(authorRates('pessoa', this.rates).porTipo), verificada: from({ ...this.rates.porTipo, ...this.rates.verificada }) },
      folga: {
        padrao: { postagensPorDia: posts.maxPorDia, comentariosPorDia: conversation.maxPorDia, reacoesPorDia: CAPS_PER_DAY.padrao.reacoes },
        ajuste: { postagensPorDia: { ...TIME_OFF_ADJUSTMENT.postagensPorDia }, comentariosPorDia: { ...TIME_OFF_ADJUSTMENT.comentariosPorDia } },
        ajusteDeContaVerificada: Object.fromEntries(Object.entries(VERIFIED_TIME_OFF_ADJUSTMENT).map(([k, v]) => [k, { ...v }])),
        autorizacaoLonga: { ...LONG_AUTHORIZATION_LIMITS },
        // `criacoes-sem-aprovacao`: the packages the owner may turn on, and every type an authorization of each version may cover
        pacotesOpcionais: OPTIONAL_TIME_OFF_BUNDLES.map((p) => ({ nome: p.nome, tipos: [...p.tipos], maxPorHora: p.maxPorHora, maxPorDia: p.maxPorDia, ...(p.porTipoPorDia ? { porTipoPorDia: { ...p.porTipoPorDia } } : {}) })),
        tiposAutorizaveis: Object.fromEntries(AUTHORIZATION_VERSIONS.map((v) => [v, [...authorizableTypesOf(v)]]))
      }
    }
  }

  info() {
    const base = {
      protocolo: [...ACCEPTED_VERSIONS],
      versaoDoRascunho: DRAFT_REVIEW,
      recursos: this.midia ? [...REVIEW_APPEALS, MEDIA_RESOURCE, FEATURE_PROFILE_MEDIA, FEATURE_FREE_MEDIA, ...(this.videos ? [FEATURE_VIDEO] : [])] : [...REVIEW_APPEALS],
      provedor: this.provedor.nome,
      emissores: this.provedor.trustedIssuers(),
    // Only when the provider reads the issuers' revoked list (hosted relay with RELAY_ISSUERS_DISCOVERY): age of the list and failures.
      ...(typeof this.provedor.revokedState === 'function' ? { revogados: this.provedor.revokedState(this.relogio()) } : {}),
      limites: {
        objetoBytes: LIMITS.objetoBytes,
        corpoHttpBytes: LIMITS.corpoHttpBytes,
        postagemCaracteres: LIMITS.postagem.max,
        respostaCaracteres: LIMITS.resposta.max,
        seguidosPorRover: this.maxFollowing,
        aprovacaoValidadeMaxS: LIMITS.aprovacaoValidadeMaxS,
        autorizacaoValidadeMaxS: LIMITS.autorizacaoValidadeMaxS,
        autorizacaoPorHoraMax: LIMITS.autorizacaoPorHoraMax,
        autorizacaoPorDiaMax: LIMITS.autorizacaoPorDiaMax,
        topicoCaracteres: SOCIAL_LIMITS.topicoTexto.max,
        recadoCaracteres: SOCIAL_LIMITS.recado.max,
        mencoesPorTexto: SOCIAL_LIMITS.mencoesPorTexto,
        hashtagsPorTexto: SOCIAL_LIMITS.hashtagsPorTexto,
        janelaDeEdicaoDoTopicoS: TIMES.janelaDeEdicaoDoTopicoS,
        retencaoDeRemovidoS: TIMES.retencaoDeRemovidoS,
        janelaDeApelacaoS: TIMES.janelaDeApelacaoS,
        denunciasPorDiaPorDenunciante: BURST_AGAINST_TARGET.reportsPerReporterPerDay
      },
      grafos: [...GRAPHS],
      autorizacaoPermanente: this.acceptsAuthorization,
      autorizacaoVersoes: [...AUTHORIZATION_VERSIONS],
      // 0.6.0: the "0.6" authorization does not expire (`expiraEm: null`); it counts until revoked, and the revocation is never forgotten
      autorizacaoSemPrazo: true,
      ...(this.emissoresDeAgentes.length ? { agentesDeFora: { emissores: [...this.emissoresDeAgentes] } } : {}),
      // 0.7.0: who attests people (only with configured issuers) and the leak filter, with the types it refuses
      ...(this.emissoresDePessoas.length ? { pessoas: { emissores: [...this.emissoresDePessoas], tipos: [...PERSON_TYPES] } } : {}),
      filtroDeVazamento: { ligado: this.filtroDeVazamento, tipos: [...LEAK_TYPES] },
      social: true,
      // 0.11.0 (proposal 0013): the daily ceilings (regular and verified account), what the owner may set, and who is verified here
      tetos: this._caps(),
      // 0.11.0 part 2: what can be edited, how often, and that the history is public
      edicao: this.edicoes.info(),
      // 0.11.0 part 4: the limits of events
      eventos: this.eventos.info(),
      ...(this.emissoresVerificados.length ? { verificados: { emissores: [...this.emissoresVerificados] } } : {}),
      ...(this.midia ? { midia: this.midia.info() } : {}),
      // 0.11.0 part 3: the limits of video and where it is kept (disk or s3)
      ...(this.videos ? { video: this.videos.info() } : {})
    }
    // When off, nothing of the messages appears; when on, 0.4.0 adds (protocol section 15.2). The declared revision does not change.
    return this.mensagens ? this.mensagens.info(base) : base
  }

  // ====================================================================================================
  // PERSON DECLARATIONS (policy and revocation)
  // ====================================================================================================

  /**
   * Receives `{ declaracao }`: the person's policy or the revocation of a standing authorization. Signed with the
   * APPROVAL key, it does not go through the rover: the person's app sends it directly, and a compromised rover cannot hold it back.
   * Order: closed envelope -> declaration shape -> known rover -> signature -> clock -> type rule -> writing.
   * @returns {{ estado: 'aceita' | 'duplicada' }}
   */
  acceptDeclaration(envelope) {
    this._sync()
    const now = this.relogio()
    const f = DECLARATION_ENVELOPE_SCHEMA(envelope, 'envelope')
    if (f) throw new ProtocolError('esquema', { campo: f.caminho, detalhe: `Campo ${f.caminho}: ${f.mensagem}.` })
    const shape = validateDeclaration(envelope.declaracao)
    if (!shape.ok) throw shape.erro
    const d = shape.declaracao
    // Counts even with an expired attestation: policy and revocation only protect, and the stored approval key is the rover's.
    const r = this.store.rover(d.autor)
    if (!r || r.saiu) throw new ProtocolError('nao_encontrado')
    // 0.7.0: the person has no approval key, so there is no declaration of theirs to check (the graph they close in their own profile)
    if (r.especie === 'pessoa') throw new ProtocolError('esquema', { campo: 'declaracao.autor', detalhe: 'Uma pessoa não tem chave de aprovação: o grafo dela se escolhe no perfil.' })
    if (!declarationMatches(d, r.chave_aprovacao)) throw new ProtocolError('assinatura_invalida', { campo: 'declaracao.assinatura' })
    if ((d.emitidaEm ?? d.revogadaEm) > now + LIMITS.futureWindowS) throw new ProtocolError('relogio', { campo: 'declaracao' })
    return d.tipo === 'politica-da-pessoa' ? this._storePolicy(d) : this._storeRevocation(d, now)
  }

  _storePolicy(d) {
    const current = this.store.politica(d.autor)
    const canonical = canonicalize(d)
    if (current && current.declaracao === canonical) return { estado: 'duplicada' }
    if (current && d.emitidaEm <= current.emitida_em) throw new ProtocolError('declaracao_antiga', { campo: 'declaracao.emitidaEm' })
    this.store.executar(
      'INSERT OR REPLACE INTO politicas (uid, grafo, exigir, emitida_em, declaracao) VALUES (:uid, :grafo, :exigir, :emitidaEm, :declaracao)',
      { uid: d.autor, grafo: d.grafo, exigir: canonicalize(d.exigirAprovacao), emitidaEm: d.emitidaEm, declaracao: canonical }
    )
    return { estado: 'aceita' }
  }

  _storeRevocation(d, now) {
    const a = this.store
    const existing = a.um('SELECT em FROM autorizacoes_revogadas WHERE autor = :autor AND alvo = :alvo', { autor: d.autor, alvo: d.alvo })
    if (existing && existing.em >= d.revogadaEm) return { estado: 'duplicada' }
    if (!existing && d.alvo !== 'todas') {
      const stored = a.um("SELECT COUNT(*) AS n FROM autorizacoes_revogadas WHERE autor = :autor AND alvo <> 'todas'", { autor: d.autor }).n
      if (stored >= LIMITS.revocationsPerRover) {
        throw new ProtocolError('limite_de_taxa', { detalhe: `Este rover já tem ${LIMITS.revocationsPerRover} revogações guardadas. Revogue "todas" de uma vez.` })
      }
    }
    a.executar('INSERT OR REPLACE INTO autorizacoes_revogadas (autor, alvo, em, recebida_em) VALUES (:autor, :alvo, :em, :agora)', {
      autor: d.autor, alvo: d.alvo, em: d.revogadaEm, agora: now
    })
    return { estado: 'aceita' }
  }

  // ====================================================================================================
  // LOCAL MODERATION (the relay operator)
  // ====================================================================================================

  bloquear({ tipo: type, alvo: target, motivo: reason, motivoPublico: publicReason }) {
    const defaultValue = { rover: UID_RE, objeto: ID_RE, emissor: /^[A-Za-z0-9_-]{43}$/ }[type]
    if (!BLOCK_TYPES.includes(type) || typeof target !== 'string' || !defaultValue.test(target)) {
      throw new ProtocolError('esquema', { campo: 'bloqueio', detalhe: 'Informe tipo (rover, objeto ou emissor) e um alvo no formato do tipo.' })
    }
    const m = validateText(reason, { min: 1, max: 200 })
    if (m) throw new ProtocolError('esquema', { campo: 'motivo', detalhe: `Campo motivo: ${m}.` })
    if (publicReason !== undefined && (type !== 'objeto' || !MODERATION_REASONS.includes(publicReason))) {
      throw new ProtocolError('esquema', { campo: 'motivoPublico', detalhe: `Campo motivoPublico: só vale para tipo objeto, com um destes: ${MODERATION_REASONS.join(', ')}.` })
    }
    const now = this.relogio()
    this.store.transaction(() => {
      this.store.executar('INSERT OR REPLACE INTO bloqueios (tipo, alvo, motivo, criado_em) VALUES (:tipo, :alvo, :motivo, :agora)', { tipo: type, alvo: target, motivo: reason, agora: now })
      if (publicReason === undefined) return
      const line = this.store.objeto(target)
      this.social.recordModeration({
        em: now, escopo: 'rele', contexto: null, acao: 'remocao', alvoTipo: line?.tipo ?? null, alvo: target, autorDoAlvo: line?.autor ?? null, motivo: publicReason, papel: 'rele', por: null
      })
    })
  }

  desbloquear(type, target) {
    const r = this.store.executar('DELETE FROM bloqueios WHERE tipo = :tipo AND alvo = :alvo', { tipo: type, alvo: target })
    if (Number(r.changes) === 0) throw new ProtocolError('nao_encontrado')
  }

  listBlocks() {
    return this.store.todos('SELECT tipo, alvo, motivo, criado_em AS criadoEm FROM bloqueios ORDER BY criado_em, tipo, alvo')
  }

  listReports({ limite: limit = 50 } = {}) {
    return this.store.todos(
      'SELECT id, alvo, autor_do_alvo AS autorDoAlvo, motivo, pseudonimo AS denunciante, criado_em AS criadoEm, comunidade, forte AS peso FROM denuncias ORDER BY id DESC LIMIT :limite',
      { limite: limit }
    )
  }

  /** Retention: a report disappears after the deadline (provisional, pending an opinion). Returns how many it deleted. */
  limpar() {
    const now = this.relogio()
    const cutoff = now - this.retencaoDenunciasDias * 86400
    // 0.6.0: revoking an authorization is NO LONGER forgotten. The "0.6" authorization does not expire, so a deleted revocation would make a
    // revoked authorization count again. The space is limited another way: 200 per id per rover, "all" in a single row, and everything
    // of the rover goes when it leaves the network.
    this.social.clearModeration(now)
    this.midia?.collect(now)
    this.videos?.collect(now).catch(() => {})
    clearMessages(this.store, now, this.retencaoDenunciasDias)
    return Number(this.store.executar('DELETE FROM denuncias WHERE criado_em < :corte', { corte: cutoff }).changes)
  }
}
