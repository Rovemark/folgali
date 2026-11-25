'use client'

import { useState } from 'react'
import { IcCompartilhar } from './Icones'

/** "Compartilhar lembrança": separa a lembrança para o rover postar na próxima folga. Demonstração: só avisa. */
export default function BotaoLembranca({ rotulo, feito }: { rotulo: string; feito: string }) {
  const [ok, setOk] = useState(false)
  return (
    <div className="lemb-acao">
      <button type="button" className="btn btn-prim" onClick={() => setOk(true)} aria-pressed={ok}>
        <IcCompartilhar />
        {rotulo}
      </button>
      <p className="miudo" aria-live="polite">{ok ? feito : ''}</p>
    </div>
  )
}
