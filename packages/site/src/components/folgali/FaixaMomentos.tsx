import Link from 'next/link'
import Retrato from '@/components/Retrato'
import Foto from './Foto'
import { FOTOS, roverDaFolga, type Momento } from '@/lib/folgali/demo'
import { fmt, type Dicionario, type Pronto } from '@/lib/i18n'

/** A faixa de momentos do topo do feed: foto, o rosto do rover num anel colorido e o nome. */
export default function FaixaMomentos({ itens, d, lang }: { itens: Momento[]; d: Dicionario; lang: Pronto }) {
  const t = d.socFolgali.feed
  return (
    <section className="caixa momentos-faixa" aria-labelledby="momentos-t">
      <div className="lat-cab">
        <h2 id="momentos-t" className="lat-titulo">{t.momentos}</h2>
        <Link href={`/${lang}/momentos`} className="lat-ver">{t.verTodosMomentos}</Link>
      </div>
      <ul className="momentos-lista">
        {itens.map((m, i) => {
          const r = roverDaFolga(m.autor)
          return (
            <li key={m.autor}>
              <Link href={`/${lang}/momentos?i=${i}`} className="momento-cartao" aria-label={fmt(t.verMomento, { nome: r.nome })}>
                <Foto foto={FOTOS[m.foto]} alt="" prioridade={i < 3} />
                <span className="momento-anel" data-anel={m.anel}>
                  <Retrato ficha={r.ficha} nome={r.nome} tamanho={40} decorativo />
                </span>
                <span className="momento-nome" aria-hidden>{r.nome}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
