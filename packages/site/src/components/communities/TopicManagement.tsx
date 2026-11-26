'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { actAction } from '@/app/social-actions'
import ActionButton from '@/components/social/ActButton'
import { IcPin, IcMod, IcMove, IcPadlock } from '@/components/social/SocialIcons'
import { canMoveTopic } from '@/lib/domain/permissions'
import type { Dictionary } from '@/lib/i18n-base'
import type { Access, RoleInCommunity } from '@/lib/social/types'
import ActionWithReason from './ActionWithReason'

export interface PossibleTarget {
  id: string
  nome: string
  acesso: Access
  papel: RoleInCommunity
  categorias: string[]
}

type Props = {
  topico: string
  fixado: boolean
  trancado: boolean
  origem: { id: string; acesso: Access; papel: RoleInCommunity }
  destinations: PossibleTarget[]
  /** the moderator does not remove what the owner wrote */
  canRemove: boolean
  d: Dictionary
}

/** The moderation bar of a topic: pin, lock, move and remove. Only staff see it. */
export default function TopicManagement({ topico: topic, fixado: pinned, trancado: locked, origem: origin, destinations, canRemove, d }: Props) {
  const t = d.socForum.gestao
  const id = useId()
  const ref = useRef<HTMLDialogElement>(null)
  const [target, setTarget] = useState('')
  const [cat, setCat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const possible = destinations.filter((x) => x.id !== origin.id && canMoveTopic({ papel: origin.papel, acesso: origin.acesso }, { papel: x.papel, acesso: x.acesso }).ok)
  const chosen = possible.find((x) => x.id === target)
  const makesPublic = !!chosen && origin.acesso === 'fechada' && chosen.acesso !== 'fechada'

  function move() {
    if (!chosen) return
    start(async () => {
      const r = await actAction({ tipo: 'topico-gestao', topico: topic, acao: 'mover', comunidade: chosen.id, categoria: cat || null })
      if (r.ok) ref.current?.close()
      else setError(d.socComum.ato.erro[r.codigo])
    })
  }

  return (
    <section className="management-topic" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="management-title">
        <IcMod /> {t.titulo}
      </h2>
      <div className="flex-row">
        <ActionButton ato={{ tipo: 'topico-gestao', topico: topic, acao: pinned ? 'desafixar' : 'fixar', comunidade: null, categoria: null }} d={d} className="btn btn-secondary btn-small">
          <IcPin /> {pinned ? t.desafixar : t.fixar}
        </ActionButton>
        <ActionButton ato={{ tipo: 'topico-gestao', topico: topic, acao: locked ? 'destrancar' : 'trancar', comunidade: null, categoria: null }} d={d} className="btn btn-secondary btn-small">
          <IcPadlock /> {locked ? t.destrancar : t.trancar}
        </ActionButton>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          disabled={possible.length === 0}
          onClick={() => {
            setTarget(possible[0]?.id ?? '')
            setCat('')
            setError(null)
            ref.current?.showModal()
          }}
        >
          <IcMove /> {t.mover}
        </button>
        {canRemove && (
          <ActionWithReason ato={{ tipo: 'remocao-por-responsavel', alvo: topic }} d={d} rotulo={t.remover} titulo={t.removerTitulo} texto={t.removerTexto} confirmar={t.confirmar} />
        )}
      </div>
      {possible.length === 0 && <p className="fine">{t.moverSemOpcao}</p>}
      <dialog ref={ref} className="dialog" aria-labelledby={`${id}-mt`}>
        <h2 id={`${id}-mt`}>{t.moverTitulo}</h2>
        <p>{t.moverTexto}</p>
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor={`${id}-dest`}>{t.destino}</label>
          <select id={`${id}-dest`} value={target} onChange={(e) => { setTarget(e.target.value); setCat('') }}>
            {possible.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </div>
        {chosen && chosen.categorias.length > 0 && (
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor={`${id}-cat`}>{t.destinoCategoria}</label>
            <select id={`${id}-cat`} value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">{t.moverSem}</option>
              {chosen.categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        {makesPublic && <p className="notice-field" role="note">{t.moverPublico}</p>}
        {error && (
          <p className="error-field" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-buttons">
          <button type="button" className="btn btn-secondary btn-small" onClick={() => ref.current?.close()}>
            {d.comum.cancelar}
          </button>
          <button type="button" className="btn btn-primary btn-small" disabled={!chosen || pending} onClick={move}>
            {pending ? d.socComum.ato.carregando : t.moverOk}
          </button>
        </div>
      </dialog>
    </section>
  )
}
