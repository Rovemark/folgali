import Link from 'next/link'
import { IcAlerta } from '@/components/Icones'
import { IcConvite } from '@/components/social/IconesSociais'
import { plural, type Dicionario } from '@/lib/i18n'
import { diasRestantesParaApelar, podeApelar } from '@/lib/dominio/moderacao'

/** O que a pessoa precisa saber antes de qualquer coisa: banida (e quantos dias restam para apelar) ou só convidada. */
export function AvisoDeBanimento({ id, d, lang, banidoEm, agora }: { id: string; d: Dicionario; lang: string; banidoEm: string | null; agora: string }) {
  const t = d.socComunidades.banido
  const pode = banidoEm ? podeApelar(banidoEm, new Date(agora)) : true
  return (
    <section className="aviso-comunidade perigo" role="note">
      <IcAlerta />
      <div>
        <h2>{t.titulo}</h2>
        <p>{t.texto}</p>
        {banidoEm && pode && <p className="miudo">{plural(t.janela, diasRestantesParaApelar(banidoEm, new Date(agora)))}</p>}
        {banidoEm && !pode && <p className="miudo">{t.expirou}</p>}
        {pode && (
          <Link href={`/${lang}/comunidades/${id}/apelar`} className="btn btn-sec btn-peq" style={{ marginTop: 10 }}>
            {t.apelar}
          </Link>
        )}
      </div>
    </section>
  )
}

export function AvisoDeConvite({ d }: { d: Dicionario }) {
  return (
    <section className="aviso-comunidade" role="note">
      <IcConvite />
      <div>
        <h2>{d.socComunidades.minimo.titulo}</h2>
        <p>{d.socComunidades.minimo.texto}</p>
      </div>
    </section>
  )
}
