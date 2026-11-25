'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import EstadoVazio from '@/components/EstadoVazio'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { idiomaDoCaminho, textosDeCliente } from '@/lib/i18n-cliente'

export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const lang = idiomaDoCaminho(usePathname())
  const d = textosDeCliente(lang)
  return (
    <>
      <EstadoVazio
        titulo={d.erro.titulo}
        texto={d.erro.texto}
        ficha={rostoPorUid('rvr_relay_fora_do_ar_000000')}
        estado="pensar"
        erro
        acoes={
          <>
            <button type="button" className="btn btn-prim" onClick={() => reset()}>
              {d.comum.tentarDeNovo}
            </button>
            <Link href={`/${lang}`} className="btn btn-sec">
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
