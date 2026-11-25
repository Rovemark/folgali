import { IcCadeado } from '@/components/Icones'
import type { Dicionario } from '@/lib/i18n-base'

/** O que a pessoa precisa saber antes de conversar: o que o relé vê (sempre) e que a demonstração é inventada (no cliente falso). */
export default function AvisosDeMensagens({ demo, d }: { demo: boolean; d: Dicionario }) {
  const t = d.socMensagens
  return (
    <div className="msg-avisos">
      {demo && (
        <p className="pf-nota" role="note">
          {t.demo}
        </p>
      )}
      <p className="msg-privacidade" role="note">
        <IcCadeado width={18} height={18} aria-hidden /> <span>{t.privacidade}</span>
      </p>
    </div>
  )
}
