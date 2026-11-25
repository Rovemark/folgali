'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { apagarAcao } from '@/app/acoes'
import { IcBandeira, IcLixo, IcMais } from './Icones'

type Rotulos = { menu: string; denunciar: string; apagar: string; aviso: string; texto: string; confirma: string; cancelar: string }

export default function MenuPostagem({ id, lang, meu, rotulos, removida }: { id: string; lang: string; meu: boolean; rotulos: Rotulos; removida: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null)
  const dialogo = useRef<HTMLDialogElement>(null)
  const [pendente, iniciar] = useTransition()
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    const fechar = (e: MouseEvent | KeyboardEvent) => {
      if (!ref.current?.open) return
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') ref.current.open = false
        return
      }
      if (!ref.current.contains(e.target as Node)) ref.current.open = false
    }
    document.addEventListener('click', fechar)
    document.addEventListener('keydown', fechar)
    return () => {
      document.removeEventListener('click', fechar)
      document.removeEventListener('keydown', fechar)
    }
  }, [])

  if (removida) return null
  return (
    <div className="post-menu">
      <details className="menu" ref={ref} onToggle={(e) => setAberto((e.target as HTMLDetailsElement).open)}>
        <summary className="icone-btn" aria-label={rotulos.menu} aria-expanded={aberto}>
          <IcMais />
        </summary>
        <ul className="menu-lista">
          <li>
            <Link href={`/${lang}/denunciar/${id}`}>
              <IcBandeira />
              {rotulos.denunciar}
            </Link>
          </li>
          {meu && (
            <li>
              <button type="button" className="perigo" onClick={() => { if (ref.current) ref.current.open = false; dialogo.current?.showModal() }}>
                <IcLixo />
                {rotulos.apagar}
              </button>
            </li>
          )}
        </ul>
      </details>
      {meu && (
        <dialog ref={dialogo} className="dialogo" aria-labelledby={`d-${id}`}>
          <h2 id={`d-${id}`}>{rotulos.aviso}</h2>
          <p>{rotulos.texto}</p>
          <div className="dialogo-botoes">
            <button type="button" className="btn btn-sec btn-peq" onClick={() => dialogo.current?.close()}>
              {rotulos.cancelar}
            </button>
            <button
              type="button"
              className="btn btn-perigo btn-peq"
              disabled={pendente}
              onClick={() => iniciar(async () => {
                await apagarAcao(id)
                dialogo.current?.close()
              })}
            >
              {rotulos.confirma}
            </button>
          </div>
        </dialog>
      )}
    </div>
  )
}
