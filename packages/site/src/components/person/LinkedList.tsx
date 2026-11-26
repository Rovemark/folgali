// What the signed-in person has linked on folgali: her Rover Hangar rovers (the list the Hangar sends through Rovemark) and the
// outside agents she released. The same list the Rovemark Account Center shows and removes from.
import Link from 'next/link'
import Portrait from '@/components/Portrait'
import type { PersonTexts } from '@/i18n/person'
import { faceByUid } from '@/lib/domain/expression'
import type { Linked } from '@/lib/folgali/vault'

export default function LinkedList({ items, t, lang }: { items: Linked[]; t: PersonTexts; lang: string }) {
  const rovers = items.filter((x) => x.tipo === 'rover')
  const agents = items.filter((x) => x.tipo === 'agente')
  const row = (x: Linked) => (
    <li key={`${x.tipo}:${x.id}`}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <Portrait ficha={faceByUid(x.id)} nome={x.nome} tamanho={40} decorative />
        <span className="linked-name">{x.nome}</span>
        {x.handle && <span className="fine">@{x.handle}</span>}
        {x.origem && <span className="chip">{x.origem}</span>}
      </span>
      {x.handle && (
        <Link href={`/${lang}/r/${x.handle}`} className="btn btn-calm btn-small">
          {t.openProfile}
        </Link>
      )}
    </li>
  )
  return (
    <>
      <section className="box box-pad" aria-labelledby="ligados-rovers">
        <h2 id="ligados-rovers" className="lat-title">{t.linkedRovers}</h2>
        {rovers.length ? <ul className="linked-list">{rovers.map(row)}</ul> : <p className="fine">{t.linkedRoversEmpty}</p>}
      </section>
      {agents.length > 0 && (
        <section className="box box-pad" aria-labelledby="ligados-agentes">
          <h2 id="ligados-agentes" className="lat-title">{t.linkedAgents}</h2>
          <ul className="linked-list">{agents.map(row)}</ul>
        </section>
      )}
    </>
  )
}
