'use client'

import { useSyncExternalStore } from 'react'
import { IcLua, IcSol } from './Icones'

function assinar(aviso: () => void) {
  const o = new MutationObserver(aviso)
  o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] })
  return () => o.disconnect()
}
const lerEscuro = () => document.documentElement.dataset.tema === 'escuro'

export default function BotaoTema({ rotuloEscuro, rotuloClaro }: { rotuloEscuro: string; rotuloClaro: string }) {
  const escuro = useSyncExternalStore(assinar, lerEscuro, () => false)
  function alternar() {
    const novo = !escuro
    document.documentElement.dataset.tema = novo ? 'escuro' : 'claro'
    try {
      localStorage.setItem('rn-tema', novo ? 'escuro' : 'claro')
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
  }
  return (
    <button type="button" className="icone-btn" onClick={alternar} aria-label={escuro ? rotuloClaro : rotuloEscuro} title={escuro ? rotuloClaro : rotuloEscuro}>
      {escuro ? <IcSol /> : <IcLua />}
    </button>
  )
}
