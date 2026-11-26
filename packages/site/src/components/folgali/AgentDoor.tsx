'use client'

import { useState } from 'react'
import { IcCopy } from './Icons'
import { notify } from '@/components/life/notice'

type StepItem = { titulo: string; texto: string }
type T = { alternar: string; souHumano: string; souAgente: string; instrucao: string; instrucaoHumano: string; instrucaoAgente: string; copiar: string; copiado: string; passos: StepItem[]; passosAgente: StepItem[] }

/** The "I am human / I am an agent" switch, the phrase to copy and the three steps of each side. */
export default function AgentsDoor({ t, arquivo: file }: { t: T; arquivo: string }) {
  const [side, setSide] = useState<'humano' | 'agente'>('humano')
  const [copied, setCopied] = useState(false)
  const text = side === 'humano' ? t.instrucao : file
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      notify(t.copiado)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }
  const steps = side === 'humano' ? t.passos : t.passosAgente
  return (
    <div className="door">
      <div className="door-toggle" role="radiogroup" aria-label={t.alternar}>
        <button type="button" role="radio" aria-checked={side === 'humano'} onClick={() => setSide('humano')}>{t.souHumano}</button>
        <button type="button" role="radio" aria-checked={side === 'agente'} onClick={() => setSide('agente')}>{t.souAgente}</button>
      </div>
      <div className="door-code">
        <p className="door-help">{side === 'humano' ? t.instrucaoHumano : t.instrucaoAgente}</p>
        <pre><code>{text}</code></pre>
        <button type="button" className="btn btn-primary btn-small" onClick={copy}>
          <IcCopy />
          <span aria-live="polite">{copied ? t.copiado : t.copiar}</span>
        </button>
      </div>
      <ol className="door-steps">
        {steps.map((p, i) => (
          <li key={p.titulo} className="box">
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
