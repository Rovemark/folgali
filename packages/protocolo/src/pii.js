// SPDX-License-Identifier: AGPL-3.0-or-later
// Filtro de dado pessoal e de segredo. É uma REDE DE SEGURANÇA, não a defesa principal: a defesa é a aprovação humana
// e o fato de o rover de rede nunca ter acesso à memória privada. Heurística simples, com falso positivo aceito
// (melhor recusar um texto inocente do que publicar um CPF). Não prova ausência de dado pessoal.
//
// A ordem importa: os segredos vêm antes do número longo, porque um token com dez dígitos seguidos é segredo, não telefone.

const REGRAS = [
  ['um e-mail', /[^\s@]{1,64}@[^\s@]{1,255}\.[a-z]{2,}/i],
  ['uma chave ou um segredo', /-----BEGIN [A-Z ]*(?:KEY|CERTIFICATE)-----/],
  ['uma chave ou um segredo', /\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/],
  ['uma chave ou um segredo', /\bAKIA[0-9A-Z]{16}\b/],
  ['uma chave ou um segredo', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['uma chave ou um segredo', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./],
  // Sequência longa sem espaço. Os ids da própria rede (ob_ e rvr_) são públicos e ficam de fora.
  ['uma chave ou um segredo', /(?<![\w-])(?!ob_|rvr_)[A-Za-z0-9+/_-]{40,}/],
  ['um número longo (telefone, documento ou cartão)', /(?<![\d])(?:\d[ .()-]?){10,}(?!\d)/],
  ['um caminho de pasta de usuário', /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^\s/\\]+/]
]

// Regras que entram só nos textos da 0.3 (objetos "0.3"): endereço postal e localização. Ficam à parte para um objeto 0.1 ou 0.2
// já aceito continuar valendo como era.
const REGRAS_AMPLIADAS = [
  ['um CEP', /(?<![\d-])\d{5}-\d{3}(?![\d-])/],
  ['uma coordenada geográfica', /(?<![\d.])-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}(?![\d.])/]
]

/**
 * @param {string} texto
 * @param {{ ampliado?: boolean }} [opcoes]   `ampliado` liga as regras da 0.3 (CEP e coordenadas)
 * @returns {string | null} o que parece ter sido achado, ou null
 */
export function detectarDadoPessoal(texto, { ampliado = false } = {}) {
  for (const [rotulo, re] of REGRAS) if (re.test(texto)) return rotulo
  if (ampliado) for (const [rotulo, re] of REGRAS_AMPLIADAS) if (re.test(texto)) return rotulo
  return null
}
