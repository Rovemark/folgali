import { dataCurta, fmt, META, type Dicionario, type Pronto } from '@/lib/i18n'
import type { Carregado } from '@/lib/social/carregar'
import { usoDaAutorizacao } from '@/lib/painel/ritmo'
import type { AcaoPublicada, AutorizacaoPermanente } from '@/lib/painel/tipos'
import ErroDoBloco from './ErroDoBloco'

type Props = {
  autorizacao: Carregado<AutorizacaoPermanente | null>
  /** o registro do app, para contar o que já saiu pela autorização */
  publicados: AcaoPublicada[]
  d: Dicionario
  lang: Pronto
  agora: string
}

/**
 * A autorização permanente (seção 6.6 do protocolo), SOMENTE LEITURA. Sem nenhum botão: dar, mudar ou revogar passa pelo app, que
 * assina com a chave de aprovação. Quando não há, o bloco diz que não há e por quê (na folgali ela é assinada no cadastro, sem prazo).
 */
export default function BlocoAutorizacao({ autorizacao, publicados, d, lang, agora }: Props) {
  const t = d.socInicio.autorizacao
  return (
    <section className="secao pn-bloco" aria-labelledby="pn-aut-t">
      <div className="secao-cab">
        <h2 id="pn-aut-t">{t.titulo}</h2>
      </div>
      {!autorizacao.ok ? (
        <ErroDoBloco codigo={autorizacao.codigo} d={d} />
      ) : autorizacao.valor === null ? (
        <div className="callout pn-nenhuma">
          <strong>{t.nenhumaTitulo}</strong>
          <span>{t.nenhumaTexto}</span>
        </div>
      ) : (
        <Existe a={autorizacao.valor} publicados={publicados} d={d} lang={lang} agora={agora} />
      )}
      <p className="pn-miudo">{t.somenteLeitura}</p>
    </section>
  )
}

function Existe({ a, publicados, d, lang, agora }: { a: AutorizacaoPermanente; publicados: AcaoPublicada[]; d: Dicionario; lang: Pronto; agora: string }) {
  const t = d.socInicio.autorizacao
  const nomes = t.nomes as Record<string, string>
  const uso = usoDaAutorizacao(a, publicados, new Date(agora))
  const lista = new Intl.ListFormat(META[lang].html, { style: 'long', type: 'conjunction' }).format(a.tipos.map((x) => nomes[x] ?? x))
  return (
    <>
      <p>{t.existeTexto}</p>
      {!uso.vigente && (
        <p className="callout callout-aviso" role="status">
          {fmt(t.venceu, { data: dataCurta(a.expiraEm, lang) })}
        </p>
      )}
      <dl className="pn-aut">
        <div>
          <dt>{t.cobre}</dt>
          <dd>{lista}</dd>
        </div>
        <div>
          <dt>{t.vale}</dt>
          <dd>
            <time dateTime={a.expiraEm}>{dataCurta(a.expiraEm, lang)}</time>
          </dd>
        </div>
        <div>
          <dt>{t.usoHora}</dt>
          <dd>{fmt(t.uso, { n: uso.naHora, max: a.maxPorHora })}</dd>
        </div>
        <div>
          <dt>{t.usoDia}</dt>
          <dd>{fmt(t.uso, { n: uso.noDia, max: a.maxPorDia })}</dd>
        </div>
      </dl>
    </>
  )
}
