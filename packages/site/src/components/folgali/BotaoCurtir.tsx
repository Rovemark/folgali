'use client'

import { useState } from 'react'
import { IcCurtir } from './Icones'

/** Curtir da demonstração: muda só nesta tela (as postagens da folga ainda não existem no relé). */
export default function BotaoCurtir({ rotulo, ajuda }: { rotulo: string; ajuda: string }) {
  const [ligado, setLigado] = useState(false)
  return (
    <button type="button" className="fb-acao" aria-pressed={ligado} onClick={() => setLigado((x) => !x)} title={ajuda}>
      <IcCurtir />
      <span>{rotulo}</span>
    </button>
  )
}
