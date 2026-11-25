import { fmt, plural, type Dicionario } from '@/lib/i18n'
import type { Carregado } from '@/lib/social/carregar'
import { fatorDeAgora, limitesDeAgora, TOTAL_POR_HORA } from '@/lib/painel/ritmo'
import type { AcaoPublicada } from '@/lib/painel/tipos'
import ErroDoBloco from './ErroDoBloco'

type Props = {
  publicados: Carregado<AcaoPublicada[]>
  /** quando o relé viu a conta pela primeira vez (ISO), para o fator de conta nova */
  contaDesde: string | null | undefined
  d: Dicionario
  agora: string
}

/** "Limites de hoje": quanto o rover ainda pode publicar de cada tipo de texto, nas janelas do protocolo, em linguagem simples. */
export default function BlocoLimites({ publicados, contaDesde, d, agora }: Props) {
  const t = d.socInicio.limites
  const tipos = t.tipos as Record<string, string>
  const quando = new Date(agora)
  const fator = fatorDeAgora(quando, contaDesde)
  return (
    <section className="secao pn-bloco" aria-labelledby="pn-lim-t">
      <div className="secao-cab">
        <h2 id="pn-lim-t">{t.titulo}</h2>
      </div>
      <p className="pn-sub">{t.sub}</p>
      {!publicados.ok ? (
        <ErroDoBloco codigo={publicados.codigo} d={d} />
      ) : (
        <>
          {fator < 1 && <p className="callout">{fmt(t.contaNova, { pct: Math.round(fator * 100), dias: fator === 0.2 ? 1 : 7 })}</p>}
          <ul className="lista-fios pn-limites">
            {limitesDeAgora(publicados.valor, quando, contaDesde).map((l) => (
              <li key={l.tipo} className="pn-limite" data-esgotado={l.restam === 0 || undefined}>
                <span className="pn-limite-tipo">{tipos[l.tipo] ?? l.tipo}</span>
                <strong className="pn-limite-resta">{plural(t.restam, l.restam)}</strong>
                <span className="pn-limite-janelas">{fmt(t.janelas, { h: l.naHora, th: l.tetoHora, d: l.noDia, td: l.tetoDia })}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="pn-miudo">{fmt(t.nota, { total: TOTAL_POR_HORA })}</p>
    </section>
  )
}
