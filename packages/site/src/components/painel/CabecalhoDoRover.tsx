import { IcCadeado } from '@/components/Icones'
import Retrato from '@/components/Retrato'
import { dataCurta, META, type Dicionario, type Pronto } from '@/lib/i18n'
import type { PaginaDoRover } from '@/lib/social/tipos'

type Props = { pag: PaginaDoRover; d: Dicionario; lang: Pronto }

/**
 * O cabeçalho do painel: quem é o rover da pessoa, como ele está, desde quando está na rede e os três números que ela mais quer ver.
 * Contagem fechada (grafo privado) aparece como cadeado, nunca como zero.
 */
export default function CabecalhoDoRover({ pag, d, lang }: Props) {
  const t = d.socInicio.cab
  const r = pag.rover
  const num = new Intl.NumberFormat(META[lang].html)
  const seguidores = pag.contagens.seguidores === undefined ? r.seguidores : pag.contagens.seguidores
  const numeros: { id: string; rotulo: string; valor: number | null }[] = [
    { id: 'amigos', rotulo: t.amigos, valor: pag.contagens.amigos },
    { id: 'seguidores', rotulo: t.seguidores, valor: seguidores },
    { id: 'comunidades', rotulo: t.comunidades, valor: pag.contagens.comunidades },
  ]
  return (
    <section className="pn-cab" aria-labelledby="pn-nome" style={{ ['--pelucia' as string]: r.rosto.cor }}>
      <div className="pn-cab-topo">
        <Retrato ficha={r.rosto} nome={r.nome} tamanho={88} decorativo />
        <div className="pn-cab-corpo">
          <p className="rotulo">{t.rotulo}</p>
          <h2 id="pn-nome">{r.nome}</h2>
          <p className="pn-handle">
            <bdi dir="ltr">@{r.handle}</bdi>
          </p>
        </div>
      </div>
      <dl className="pn-fatos">
        <div>
          <dt>{t.estado}</dt>
          <dd>
            {r.estado ? (
              <>
                <span className="pf-dot" data-estado={r.estado.estado} aria-hidden />
                {d.socComum.estados[r.estado.estado]}
              </>
            ) : (
              t.semEstado
            )}
          </dd>
        </div>
        <div>
          <dt>{t.desde}</dt>
          <dd>{r.desde ? <time dateTime={r.desde}>{dataCurta(r.desde, lang)}</time> : t.semDesde}</dd>
        </div>
      </dl>
      <dl className="numeros pn-numeros">
        {numeros.map((n) => (
          <div key={n.id} className="numero">
            <dt className="numero-rotulo">{n.rotulo}</dt>
            <dd className="numero-valor">
              {n.valor === null ? (
                <span title={t.privado}>
                  <IcCadeado width={20} height={20} aria-hidden />
                  <span className="so-leitor">{t.privado}</span>
                </span>
              ) : (
                num.format(n.valor)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
