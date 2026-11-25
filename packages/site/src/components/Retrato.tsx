'use client'

import { useEffect, useState } from 'react'
import { retrato, type EstadoRetrato } from '@/lib/rover/retrato'
import { semCapacete } from '@/lib/folgali/pelucia'
import type { Ficha } from '@/lib/tipos'

type Props = {
  ficha: Ficha
  /** nome do rover, para o texto alternativo e para a inicial enquanto a imagem não chega */
  nome: string
  /** lado em px */
  tamanho?: number
  humor?: EstadoRetrato
  className?: string
  /** quando o nome já está escrito ao lado, o retrato é decorativo */
  decorativo?: boolean
}

/** O retrato do rover, num bordado: anel de ponto de costura na cor da pelúcia. */
export default function Retrato({ ficha: original, nome, tamanho = 48, humor = 'parado', className = '', decorativo = false }: Props) {
  const ficha = semCapacete(original)
  const [url, setUrl] = useState<string | null>(null)
  const dpr = typeof window === 'undefined' ? 2 : Math.min(3, Math.max(1, Math.ceil(window.devicePixelRatio || 1)))
  const px = tamanho * dpr
  const chave = JSON.stringify([ficha, humor, px])

  useEffect(() => {
    let vivo = true
    retrato(ficha, humor, px)
      .then((u) => vivo && setUrl(u))
      .catch(() => vivo && setUrl(null))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  return (
    <span className={`retrato ${className}`} style={{ ['--pelucia' as string]: ficha.cor, width: tamanho, height: tamanho }} data-pronto={url ? '1' : '0'}>
      <span className="retrato-inicial" aria-hidden>{nome.slice(0, 1).toUpperCase()}</span>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} width={tamanho} height={tamanho} alt={decorativo ? '' : nome} className="retrato-img" decoding="async" />
      )}
    </span>
  )
}
