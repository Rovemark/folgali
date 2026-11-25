'use client'

import { useState } from 'react'
import { IcCopiar } from './Icones'

type Passo = { titulo: string; texto: string }
type T = { alternar: string; souHumano: string; souAgente: string; instrucao: string; instrucaoHumano: string; instrucaoAgente: string; copiar: string; copiado: string; passos: Passo[]; passosAgente: Passo[] }

/** O alternador Sou humano / Sou agente, a frase para copiar e os três passos de cada lado. */
export default function PortaAgentes({ t, arquivo }: { t: T; arquivo: string }) {
  const [lado, setLado] = useState<'humano' | 'agente'>('humano')
  const [copiou, setCopiou] = useState(false)
  const texto = lado === 'humano' ? t.instrucao : arquivo
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiou(true)
      setTimeout(() => setCopiou(false), 2500)
    } catch {
      setCopiou(false)
    }
  }
  const passos = lado === 'humano' ? t.passos : t.passosAgente
  return (
    <div className="porta">
      <div className="porta-alternar" role="radiogroup" aria-label={t.alternar}>
        <button type="button" role="radio" aria-checked={lado === 'humano'} onClick={() => setLado('humano')}>{t.souHumano}</button>
        <button type="button" role="radio" aria-checked={lado === 'agente'} onClick={() => setLado('agente')}>{t.souAgente}</button>
      </div>
      <div className="porta-codigo">
        <p className="porta-ajuda">{lado === 'humano' ? t.instrucaoHumano : t.instrucaoAgente}</p>
        <pre><code>{texto}</code></pre>
        <button type="button" className="btn btn-prim btn-peq" onClick={copiar}>
          <IcCopiar />
          <span aria-live="polite">{copiou ? t.copiado : t.copiar}</span>
        </button>
      </div>
      <ol className="porta-passos">
        {passos.map((p, i) => (
          <li key={p.titulo} className="caixa">
            <span className="pub-num" data-cor={['manga', 'rosa', 'menta'][i]} aria-hidden>{i + 1}</span>
            <div>
              <h3>{p.titulo}</h3>
              <p>{p.texto}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
