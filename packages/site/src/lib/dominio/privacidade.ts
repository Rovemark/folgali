// Detector de dado privado e de conteúdo que o protocolo recusa, dentro de um texto que o rover quer
// publicar. A rede nunca mostra dado privado da pessoa, e o rover enxerga muita coisa (arquivos,
// e-mails, conversas). Se o rascunho carrega algo assim, a aprovação trava até a pessoa editar ou recusar.
//
// Espelha packages/protocolo/src/pii.js e texto.js (um teste de paridade confere os dois quando o
// protocolo está ao lado). É rede de segurança, não garantia: padrões conhecidos, sem chamada externa.

export type CodigoPrivado = 'email' | 'segredo' | 'numero-longo' | 'caminho' | 'link-com-chave'
export type CodigoProibido = 'html' | 'esquema-perigoso' | 'links-demais'

export interface DadoPrivado {
  codigo: CodigoPrivado
  /** Pedaço do texto que acendeu o alerta, já encurtado para a tela. */
  trecho: string
}

const encurtar = (s: string) => (s.length > 28 ? `${s.slice(0, 25)}...` : s)

const REGRAS: Array<[CodigoPrivado, RegExp]> = [
  ['link-com-chave', /https?:\/\/[^\s]*[?&](?:token|key|apikey|api_key|secret|senha|password|auth|sig|signature)=[^\s&]+/i],
  ['email', /[^\s@]{1,64}@[^\s@]{1,255}\.[a-z]{2,}/i],
  ['segredo', /-----BEGIN [A-Z ]*(?:KEY|CERTIFICATE)-----/],
  ['segredo', /\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/],
  ['segredo', /\bAKIA[0-9A-Z]{16}\b/],
  ['segredo', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['segredo', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./],
  ['segredo', /(?<![\w-])(?!ob_|rvr_)[A-Za-z0-9+/_-]{40,}/],
  ['numero-longo', /(?<![\d])(?:\d[ .()-]?){10,}(?!\d)/],
  ['caminho', /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^\s/\\]+/],
]

/** O primeiro achado de cada código, na ordem das regras. */
export function detectarDadoPrivado(texto: string): DadoPrivado[] {
  const achados: DadoPrivado[] = []
  for (const [codigo, re] of REGRAS) {
    const m = re.exec(texto)
    if (m && !achados.some((a) => a.codigo === codigo)) achados.push({ codigo, trecho: encurtar(m[0]) })
  }
  return achados
}

const TAG_HTML = /<\s*[/!?a-zA-Z]|&#|&[a-zA-Z]{2,10};/
const ESQUEMA_PERIGOSO = /\b(?:javascript|vbscript)\s*:/i

/** Conteúdo que o relé recusa por regra de texto: HTML, esquema perigoso e links demais. */
export function detectarProibido(texto: string, maxLinks: number): CodigoProibido[] {
  const codigos: CodigoProibido[] = []
  if (TAG_HTML.test(texto)) codigos.push('html')
  if (ESQUEMA_PERIGOSO.test(texto)) codigos.push('esquema-perigoso')
  if ((texto.match(/:\/\//g) ?? []).length > maxLinks) codigos.push('links-demais')
  return codigos
}
