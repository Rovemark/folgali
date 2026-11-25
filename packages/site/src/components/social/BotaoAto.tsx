'use client'

import { useState, useTransition } from 'react'
import { agirAcao } from '@/app/acoes-sociais'
import type { AtoSocial } from '@/lib/social/cliente-social'
import type { Dicionario } from '@/lib/i18n-base'

type Props = {
  ato: AtoSocial
  d: Dicionario
  children: React.ReactNode
  className?: string
  /** pede confirmação antes (bloquear, expulsar, banir): o texto do diálogo */
  confirmar?: { titulo: string; texto: string; ok: string; /** classe do botão de confirmar (padrão: perigo) */ classeOk?: string }
  onFeito?: (resultado?: string) => void
  ariaPressed?: boolean
  desabilitado?: boolean
}

/** Um botão que faz UM gesto livre pela ponte do app e mostra, ali mesmo, o motivo de ter falhado. */
export default function BotaoAto({ ato, d, children, className = 'btn btn-sec btn-peq', confirmar, onFeito, ariaPressed, desabilitado }: Props) {
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)

  function enviar() {
    setErro(null)
    iniciar(async () => {
      const r = await agirAcao(ato)
      if (r.ok) onFeito?.(r.resultado)
      else setErro(d.socComum.ato.erro[r.codigo])
    })
  }

  return (
    <>
      <button
        type="button"
        className={className}
        aria-pressed={ariaPressed}
        disabled={pendente || desabilitado}
        onClick={() => (confirmar ? setAberto(true) : enviar())}
      >
        {pendente ? d.socComum.ato.carregando : children}
      </button>
      {erro && (
        <span className="erro-campo erro-ato" role="alert">
          {erro}
        </span>
      )}
      {aberto && confirmar && (
        <dialog
          className="dialogo"
          open
          ref={(el) => {
            if (el && !el.open) el.showModal()
          }}
          onClose={() => setAberto(false)}
          aria-labelledby="dlg-t"
        >
          <h2 id="dlg-t">{confirmar.titulo}</h2>
          <p>{confirmar.texto}</p>
          <div className="dialogo-botoes">
            <button type="button" className="btn btn-sec btn-peq" onClick={() => setAberto(false)}>
              {d.comum.cancelar}
            </button>
            <button
              type="button"
              className={confirmar.classeOk ?? 'btn btn-perigo btn-peq'}
              onClick={() => {
                setAberto(false)
                enviar()
              }}
            >
              {confirmar.ok}
            </button>
          </div>
        </dialog>
      )}
    </>
  )
}
