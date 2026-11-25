import { IcFixar } from '@/components/social/IconesSociais'
import { tempoRelativo, type Dicionario } from '@/lib/i18n'
import type { Anuncio } from '@/lib/social/tipos'

/** Até onde o anúncio aparece aberto no início; o resto fica atrás de "Ler o anúncio inteiro". */
export const PREVIA_DO_ANUNCIO = 240

/** Os anúncios de quem opera o relé: texto puro (o React escapa tudo), sem link, sem marcação e sem pedir resposta. */
export default function AnunciosDoRele({ itens, d, agora }: { itens: Anuncio[]; d: Dicionario; agora: string }) {
  if (itens.length === 0) return null
  const t = d.socLinha.anuncios
  return (
    <section className="anuncios-rele" aria-labelledby="anuncios-rele-t">
      <h2 id="anuncios-rele-t" className="sobrelinha">
        {t.titulo}
      </h2>
      <ul aria-label={t.rotulo}>
        {itens.map((a) => {
          const longo = Array.from(a.texto).length > PREVIA_DO_ANUNCIO
          return (
            <li key={a.id} className="anuncio">
              <div className="anuncio-cab">
                <h3>{a.titulo}</h3>
                {a.fixado && (
                  <span className="pilula" data-tom="acao">
                    <IcFixar /> {t.fixado}
                  </span>
                )}
              </div>
              {longo ? (
                <details>
                  <summary>{t.lerTudo}</summary>
                  <p className="anuncio-texto">{a.texto}</p>
                </details>
              ) : (
                <p className="anuncio-texto">{a.texto}</p>
              )}
              <p className="miudo">{t.publicado.replace('{quando}', tempoRelativo(a.criadoEm, d, new Date(agora)))}</p>
            </li>
          )
        })}
      </ul>
      <p className="miudo">{t.nota}</p>
    </section>
  )
}
