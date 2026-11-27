// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.7.0 (proposal 0009): what the relay does differently when the author is a PERSON. It lives outside relay.js on purpose: the rule lives in one
// place and mutation testing covers it with its own suite.
//
// A person enters through a person attestation, signed by an issuer that is on the relay's list of PEOPLE ISSUERS (and also on the list of
// trusted issuers, which decides who is visible). The relay stores the kind of a uid the first time and never changes it: a rover
// does not become a person by swapping attestations, nor the reverse.
import {
  ProtocolError, MESSAGE_RATE, PERSON_RATE, PEOPLE_RATE_PER_ISSUER, TOTAL_RATE_PER_PERSON, isPersonAttestation, verifyHandleAttestation,
  verifyPersonAttestation
} from '../../protocol/src/index.js'

const KEY_RE = /^[A-Za-z0-9_-]{43}$/

/** Checks the configured list of people issuers. Each one must be among the provider's trusted issuers. */
export function readPeopleIssuers(list) {
  if (!Array.isArray(list) || list.some((e) => typeof e !== 'string' || !KEY_RE.test(e))) {
    throw new Error('emissoresDePessoas precisa ser uma lista de chaves públicas (43 caracteres)')
  }
  return [...new Set(list)]
}

/**
 * Reads the issuer families: groups of keys that are the SAME issuer (its current and previous key during a rotation). A key belongs to
 * one family at most. Returns a map from key to family index; a key outside every family is only itself.
 */
export function readIssuerFamilies(families) {
  if (!Array.isArray(families) || families.some((f) => !Array.isArray(f) || f.some((e) => typeof e !== 'string' || !KEY_RE.test(e)))) {
    throw new Error('familiasDeEmissores precisa ser uma lista de listas de chaves públicas (43 caracteres)')
  }
  const map = new Map()
  families.forEach((f, i) => {
    for (const e of f) {
      if (map.has(e) && map.get(e) !== i) throw new Error('familiasDeEmissores: uma chave aparece em duas famílias')
      map.set(e, i)
    }
  })
  return map
}

/**
 * Checks the attached attestation, of a rover or of a person, and returns the attestation and the kind. A people issuer attests only people: a
 * handle attestation signed by it is refused, so no rover leaves it looking like a person, nor the reverse.
 * @param {unknown} anexado
 * @param {{ agora: number, confiaveis: string[], emissoresDePessoas: string[] }} ctx
 */
export function verifyAttachedAttestation(attached, { agora: now, confiaveis: trusted, emissoresDePessoas: personIssuers }) {
  if (isPersonAttestation(attached)) {
    const r = verifyPersonAttestation(attached, { agora: now, emissoresDePessoas: personIssuers.filter((e) => trusted.includes(e)) })
    if (!r.ok) throw r.erro
    return { atestado: r.atestado, especie: 'pessoa' }
  }
  const r = verifyHandleAttestation(attached, { agora: now, trustedIssuers: trusted })
  if (!r.ok) throw r.erro
  if (personIssuers.includes(r.atestado.emissor)) {
    throw new ProtocolError('atestado_invalido', { campo: 'atestado.tipo', detalhe: 'Este emissor só atesta pessoas.' })
  }
  return { atestado: r.atestado, especie: 'rover' }
}

/** Is the stored uid of another kind? A new attestation does not change what the author is. */
export function requireSameKind(stored, species) {
  if (stored && stored.especie !== species) {
    throw new ProtocolError('atestado_invalido', { campo: 'atestado.tipo', detalhe: 'Este uid já é de outra espécie de autor neste relé.' })
  }
}

/** The kind that read responses show: person, outside agent (open issuer, 0.6.0) or rover. */
export function rowKind(line, agentIssuers) {
  if (line.especie === 'pessoa') return 'pessoa'
  return agentIssuers.includes(line.emissor) ? 'agente' : 'rover'
}

/**
 * The rates that apply to the author: the person's own, or the relay's for rovers. Private messages (0.4.0), which a person
 * can also send since the decision of 2026-11-24 (evening), have their own table (MESSAGE_RATE), the same as the rover's.
 */
export function authorRates(species, rates) {
  if (species !== 'pessoa') return { porTipo: rates.porTipo, total: rates.total, emissor: rates.emissor }
  return { porTipo: { ...MESSAGE_RATE, ...(rates.pessoa ?? PERSON_RATE) }, total: rates.totalPerson ?? TOTAL_RATE_PER_PERSON, emissor: rates.peopleIssuer ?? PEOPLE_RATE_PER_ISSUER }
}
