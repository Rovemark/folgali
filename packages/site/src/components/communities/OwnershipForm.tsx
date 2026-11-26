'use client'

import { useId, useState } from 'react'
import { IcAlert } from '@/components/Icons'
import ProposalForm from '@/components/social/ProposalForm'
import type { Dictionary } from '@/lib/i18n-base'
import type { RoverSummary } from '@/lib/types'

type Step = null | 'transferir' | 'encerrar'

/**
 * Transfer ownership and close the community: the two actions that cannot be undone. First the clear text
 * and the "entendi, continuar" (understood, continue); only then the form that creates the draft in the approval queue.
 */
export default function OwnershipForm({ comunidade: community, communityName, membros: members, d, lang, roverName }: { comunidade: string; communityName: string; membros: RoverSummary[]; d: Dictionary; lang: string; roverName: string }) {
  const t = d.socComunidades.gerir
  const id = useId()
  const [step, setStep] = useState<Step>(null)
  const [understood, setUnderstood] = useState(false)
  const [newValue, setNew] = useState('')
  const chosen = members.find((m) => m.uid === newValue)

  const openAction = (e: Step) => {
    setStep(e)
    setUnderstood(false)
  }

  return (
    <div className="stack">
      <div className="ownership-options">
        <section className="card ownership-card">
          <h3>{t.transferir}</h3>
          <p className="soft">{t.transferirTexto}</p>
          {members.length === 0 ? (
            <p className="fine">{t.semMembros}</p>
          ) : (
            <div className="field">
              <label htmlFor={`${id}-novo`}>{t.escolherMembro}</label>
              <select id={`${id}-novo`} value={newValue} onChange={(e) => { setNew(e.target.value); if (step === 'transferir') setUnderstood(false) }}>
                <option value="">{t.escolherMembro}</option>
                {members.map((m) => (
                  <option key={m.uid} value={m.uid}>
                    {m.nome} (@{m.handle})
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="button" className="btn btn-secondary btn-small" disabled={!chosen} onClick={() => openAction('transferir')} aria-expanded={step === 'transferir'}>
            {t.transferir}
          </button>
        </section>
        <section className="card ownership-card danger">
          <h3>{t.encerrar}</h3>
          <p className="soft">{t.encerrarTexto}</p>
          <button type="button" className="btn btn-danger btn-small" onClick={() => openAction('encerrar')} aria-expanded={step === 'encerrar'}>
            {t.encerrar}
          </button>
        </section>
      </div>

      {step && (
        <section className="notice-community danger" aria-live="polite">
          <IcAlert />
          <div>
            <h3>{t.confirmarTitulo}</h3>
            <p>{step === 'transferir' ? t.confirmarTransferir : t.confirmarEncerrar}</p>
            {!understood ? (
              <div className="flex-row" style={{ marginTop: 10 }}>
                <button type="button" className="btn btn-danger btn-small" onClick={() => setUnderstood(true)}>
                  {t.continuar}
                </button>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setStep(null)}>
                  {d.comum.cancelar}
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <ProposalForm
                  key={`${step}-${newValue}`}
                  tipo="comunidade-posse"
                  d={d}
                  lang={lang}
                  canWrite
                  roverName={roverName}
                  destino={{ rotulo: step === 'transferir' && chosen ? `${communityName}: ${d.socComum.valores.acao.transferir.toLowerCase()} @${chosen.handle}` : `${communityName}: ${d.socComum.valores.acao.encerrar.toLowerCase()}` }}
                  hide={['acao', 'comunidade', 'novoDono']}
                  enviar={step === 'transferir' ? t.transferir : t.encerrar}
                  restartable={false}
                  campos={{ comunidade: community, acao: step, novoDono: step === 'transferir' ? newValue : null }}
                />
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
