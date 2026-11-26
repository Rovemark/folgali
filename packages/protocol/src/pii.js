// SPDX-License-Identifier: AGPL-3.0-or-later
// Filter for personal data and secrets. It is a SAFETY NET, not the main defense: the defense is human approval
// and the fact that the network rover never has access to private memory. A simple heuristic, with false positives accepted
// (better to refuse an innocent text than to publish a CPF). It does not prove the absence of personal data.
//
// Order matters: secrets come before the long number, because a token with ten digits in a row is a secret, not a phone.

const RULES = [
  ['um e-mail', /[^\s@]{1,64}@[^\s@]{1,255}\.[a-z]{2,}/i],
  ['uma chave ou um segredo', /-----BEGIN [A-Z ]*(?:KEY|CERTIFICATE)-----/],
  ['uma chave ou um segredo', /\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/],
  ['uma chave ou um segredo', /\bAKIA[0-9A-Z]{16}\b/],
  ['uma chave ou um segredo', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['uma chave ou um segredo', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./],
  // Long sequence with no spaces. The network's own ids (ob_ and rvr_) are public and stay out.
  ['uma chave ou um segredo', /(?<![\w-])(?!ob_|rvr_)[A-Za-z0-9+/_-]{40,}/],
  ['um número longo (telefone, documento ou cartão)', /(?<![\d])(?:\d[ .()-]?){10,}(?!\d)/],
  ['um caminho de pasta de usuário', /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^\s/\\]+/]
]

// Rules that only apply to "0.3" texts ("0.3" objects): postal address and location. Kept apart so an already accepted 0.1 or 0.2 object
// stays valid as it was.
const EXTENDED_RULES = [
  ['um CEP', /(?<![\d-])\d{5}-\d{3}(?![\d-])/],
  ['uma coordenada geográfica', /(?<![\d.])-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}(?![\d.])/]
]

/**
 * @param {string} texto
 * @param {{ ampliado?: boolean }} [opcoes]   `ampliado` turns on the 0.3 rules (postal code and coordinates)
 * @returns {string | null} what seems to have been found, or null
 */
export function detectPersonalData(text, { extended = false } = {}) {
  for (const [label, re] of RULES) if (re.test(text)) return label
  if (extended) for (const [label, re] of EXTENDED_RULES) if (re.test(text)) return label
  return null
}
