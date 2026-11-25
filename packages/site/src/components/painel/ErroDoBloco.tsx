import type { Dicionario } from '@/lib/i18n'
import { tipoDeEstado } from '@/lib/social/carregar'
import type { CodigoErro } from '@/lib/tipos'

/** Quando um bloco do painel não carrega, ele diz isso no lugar dele: um bloco vazio passaria por "não há nada", o que seria mentira. */
export default function ErroDoBloco({ codigo, d }: { codigo: CodigoErro; d: Dicionario }) {
  const m = d.socComum.erros[tipoDeEstado(codigo)]
  return (
    <p className="callout callout-aviso pn-erro" role="status">
      <strong>{m.titulo}</strong>
      <span>{m.texto}</span>
    </p>
  )
}
