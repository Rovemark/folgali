// SPDX-License-Identifier: AGPL-3.0-or-later
// Regras de TEXTO LIVRE da rede. Todo texto que um rover escreve passa por aqui antes de existir.
// Devolve null quando serve, ou uma frase em português dizendo o que está errado (nunca ecoa o texto).
import { validarLinks } from './links.js'
import { validarMencoesETags } from './mencoes.js'
import { detectarDadoPessoal } from './pii.js'

// Controle (exceto quebra de linha), espaço que não é o espaço comum, formato invisível, separadores de linha e parágrafo,
// uso privado, não atribuído e surrogate solto.
const CONTROLE_OU_ESPACO_ESTRANHO = /[\p{Cc}\s]/u
const INVISIVEL = /[\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cn}\p{Cs}]/u
// Invisíveis que as categorias acima não pegam: junção de grafema, preenchimentos de Hangul e Khmer, Braille em branco,
// seletores de variação (menos o FE0F de emoji, tratado à parte), caractere de substituição.
const INVISIVEL_EXTRA = /[͏ᅟᅠ឴឵᠋-᠏⠀ㅤﾠ�︀-︎\u{E0100}-\u{E01EF}]/u
const FE0F_SOLTO = /(?<![\p{Extended_Pictographic}#*0-9])️/u
// O único invisível que a rede deixa passar: ZWJ ligando dois emojis (família, profissões, bandeiras compostas).
const ZWJ_DE_EMOJI = /(?<=\p{Extended_Pictographic}[️\u{1F3FB}-\u{1F3FF}]?)‍(?=\p{Extended_Pictographic})/gu
const MARCAS_DEMAIS = /\p{M}{4,}/u
const TAG_HTML = /<\s*[\/!?a-zA-Z]|&#|&[a-zA-Z]{2,10};/
const ESQUEMA_PERIGOSO = /\b(?:javascript|vbscript)\s*:/i
const URL_RE = /:\/\//g

export const contarCaracteres = (s) => [...s].length

/**
 * @param {unknown} valor
 * `v3` liga as regras dos textos "0.3": links só https e sem rastreador (`urls` vira o máximo de links), menções e hashtags com teto,
 * e o filtro de dado pessoal ampliado.
 * @param {{ min?: number, max: number, multilinha?: boolean, urls?: number, permitirDadoPessoal?: boolean, v3?: boolean }} regras
 * @returns {string | null}
 */
export function validarTexto(valor, { min = 0, max, multilinha = false, urls = 0, permitirDadoPessoal = false, v3 = false }) {
  if (typeof valor !== 'string') return 'precisa ser um texto'
  if (!valor.isWellFormed()) return 'tem caractere Unicode quebrado'
  const tamanho = contarCaracteres(valor)
  if (tamanho < min) return min === 1 ? 'não pode ficar vazio' : `precisa ter pelo menos ${min} caracteres`
  if (tamanho > max) return `passa de ${max} caracteres`
  if (valor.normalize('NFC') !== valor) return 'precisa estar normalizado em Unicode NFC'
  if (valor !== valor.trim()) return 'não pode começar nem terminar com espaço ou quebra de linha'

  const limpo = valor.replace(ZWJ_DE_EMOJI, '')
  const semQuebra = multilinha ? limpo.replace(/\n/g, '') : limpo
  const semEspacoComum = semQuebra.replace(/ /g, '')
  if (CONTROLE_OU_ESPACO_ESTRANHO.test(semEspacoComum)) return 'tem caractere de controle ou espaço que não é o comum'
  if (INVISIVEL.test(limpo) || INVISIVEL_EXTRA.test(limpo) || FE0F_SOLTO.test(limpo)) return 'tem caractere invisível'
  if (MARCAS_DEMAIS.test(limpo)) return 'tem marcas de acentuação empilhadas demais'
  if (/\n{4,}/.test(valor)) return 'tem quebras de linha demais em sequência'
  if (TAG_HTML.test(valor)) return 'não pode ter HTML'
  if (ESQUEMA_PERIGOSO.test(valor)) return 'tem um endereço de esquema perigoso'
  if (v3) {
    const problemaDeLink = validarLinks(valor, urls)
    if (problemaDeLink) return problemaDeLink
    const problemaDeMarca = validarMencoesETags(valor)
    if (problemaDeMarca) return problemaDeMarca
  } else if ((valor.match(URL_RE) ?? []).length > urls) return urls === 0 ? 'não pode ter links' : `tem links demais (o máximo é ${urls})`
  if (!permitirDadoPessoal) {
    const achado = detectarDadoPessoal(valor, { ampliado: v3 })
    if (achado) return `parece conter ${achado}, que nunca entra na rede`
  }
  return null
}
