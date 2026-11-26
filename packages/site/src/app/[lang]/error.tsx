'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import EmptyState from '@/components/EmptyState'
import { faceByUid } from '@/lib/domain/expression'
import { pathLanguage, clientTexts } from '@/lib/i18n-client'

export default function ErrorMessage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const lang = pathLanguage(usePathname())
  const d = clientTexts(lang)
  return (
    <>
      <EmptyState
        titulo={d.erro.titulo}
        texto={d.erro.texto}
        ficha={faceByUid('rvr_relay_fora_do_ar_000000')}
        estado="pensar"
        erro
        acoes={
          <>
            <button type="button" className="btn btn-primary" onClick={() => reset()}>
              {d.comum.tentarDeNovo}
            </button>
            <Link href={`/${lang}`} className="btn btn-secondary">
              {d.comum.irParaLinha}
            </Link>
          </>
        }
      />
      {error.digest && (
        <p className="mono" style={{ textAlign: 'center', color: 'var(--tinta-3)', marginTop: 12 }}>
          {d.erro.tecnico}: {error.digest}
        </p>
      )}
    </>
  )
}
