import type { ReactNode } from 'react'
import type { Spec } from '@/lib/types'
import type { State } from '@/lib/rover/engine'
import PhotoImage from '@/components/folgali/Photo'
import type { Photo } from '@/lib/folgali/demo'
import Luna from './life/Luna'

/**
 * Empty or error state with Luna, the mascot, breathing slowly: arms behind her head when there is nothing yet, napping
 * when the state asks for rest (`dormir`, sleep) or when something went wrong. `ficha` and `altura` stay for compatibility with existing callers.
 * `felt` swaps Luna for a felt illustration of the subject (empty net, tent, sleeping little bell...) and `scene` puts a wide photo
 * on top (the 404 page). Both are decorative: the title says what it is.
 */
export default function EmptyState({ titulo: title, texto: text, estado: state = 'dormir', erro: error = false, acoes: actions, felt, scene }: { titulo: string; texto: string; ficha: Spec; estado?: State; erro?: boolean; acoes?: ReactNode; altura?: number; felt?: string; scene?: Photo }) {
  return (
    <section className={`empty${error ? ' error' : ''}${felt || scene ? ' empty-art' : ''}`} role={error ? 'alert' : undefined}>
      {scene && <PhotoImage foto={scene} alt="" className="empty-scene" prioridade sizes="(min-width: 960px) 720px, 100vw" />}
      {felt ? (
        // eslint-disable-next-line @next/next/no-img-element -- felt illustration, decorative
        <img src={felt} alt="" width={320} height={320} className="empty-felt" decoding="async" />
      ) : (
        !scene && <Luna pose={error || state === 'dormir' ? 'cochilo' : 'bracos'} />
      )}
      <h2>{title}</h2>
      <p>{text}</p>
      {actions && <div className="btns">{actions}</div>}
    </section>
  )
}
