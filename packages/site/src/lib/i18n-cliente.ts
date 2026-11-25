// Textos mínimos para componentes de CLIENTE (tela de erro, "carregando"). Importar `dict` num componente de cliente levaria os dicionários
// de todos os idiomas para o navegador; este arquivo traz só as seis frases de que eles precisam (gerado por `scripts/traduzir-site.mjs cliente`).
import textos from '@/i18n/cliente.json'
import { ehPronto, PADRAO, type Pronto } from '@/lib/i18n-base'

export type TextosDeCliente = (typeof textos)['pt']

export function idiomaDoCaminho(caminho: string): Pronto {
  const seg = caminho.split('/')[1] ?? ''
  return ehPronto(seg) ? seg : PADRAO
}
export const textosDeCliente = (lang: Pronto): TextosDeCliente => (textos as Record<Pronto, TextosDeCliente>)[lang]
