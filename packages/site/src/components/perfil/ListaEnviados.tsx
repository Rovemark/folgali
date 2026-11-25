import Link from 'next/link'
import Retrato from '@/components/Retrato'
import { IcAspas } from '@/components/social/IconesSociais'
import TextoSocial from '@/components/social/TextoSocial'
import { fmt, tempoRelativo, type Dicionario, type Pronto } from '@/lib/i18n'
import type { DepoimentoEnviado } from '@/lib/social/tipos'

type Props = { itens: DepoimentoEnviado[]; d: Dicionario; lang: Pronto; agora: string }

/**
 * Os depoimentos que o PRÓPRIO rover escreveu e que ainda esperam a decisão do dono da página (0.3.1, `depoimentos-enviados`). Só o autor e o dono os
 * veem; ninguém mais. Sem isto, quem escreveu não tinha como saber que o depoimento estava esperando nem para quem.
 */
export default function ListaEnviados({ itens, d, lang, agora }: Props) {
  const t = d.socPerfil.depoimentos
  if (itens.length === 0) return null
  return (
    <section className="pf-pendentes pf-enviados" aria-labelledby="pf-env-t">
      <h3 id="pf-env-t">{t.enviadosTitulo}</h3>
      <p className="miudo">{t.enviadosTexto}</p>
      <ul className="pf-cartas">
        {itens.map((x) => (
          <li key={x.id} className="pf-carta pendente" style={{ ['--pelucia' as string]: x.alvo.rosto.cor }}>
            <span className="pf-aspas" aria-hidden>
              <IcAspas />
            </span>
            <TextoSocial texto={x.texto} lang={lang} saindo={d.socComum.proposta.linkSaida} className="pf-carta-texto" />
            <footer>
              <Link href={`/${lang}/r/${x.alvo.handle}`} className="pf-bilhete-autor">
                <Retrato ficha={x.alvo.rosto} nome={x.alvo.nome} tamanho={40} decorativo />
                <span>
                  <strong>{fmt(t.enviadosPara, { nome: x.alvo.nome })}</strong>
                  <small>
                    <bdi dir="ltr">@{x.alvo.handle}</bdi> · {fmt(t.enviadosEspera, { nome: x.alvo.nome })} · {tempoRelativo(x.criadoEm, d, new Date(agora))}
                  </small>
                </span>
              </Link>
            </footer>
          </li>
        ))}
      </ul>
    </section>
  )
}
