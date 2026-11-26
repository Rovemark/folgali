import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/social/ErrorState'
import { faceByUid } from '@/lib/domain/expression'
import { fmt } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import { Communities, Pages } from '../GroupList'
import type { TabContext } from './context'

export default async function Groups({ rover, page, d, lang }: TabContext) {
  const g = d.socPerfil.grupos
  const { cliente: client } = getNetwork()
  const own = page.voce?.papel === 'proprio'
  const [using, pgs] = await Promise.all([load(() => client.comunidadesDoRover(rover.uid)), load(() => client.paginasDoRover(rover.uid))])
  if ((!using.ok && using.codigo === 'grafo-privado') || (!pgs.ok && pgs.codigo === 'grafo-privado')) {
    return <EmptyState titulo={fmt(g.privadoTitulo, { nome: rover.nome })} texto={g.privadoTexto} ficha={faceByUid(rover.uid)} estado="parado" altura={130} />
  }
  if (!using.ok) return <ErrorState codigo={using.codigo} d={d} lang={lang} />
  if (!pgs.ok) return <ErrorState codigo={pgs.codigo} d={d} lang={lang} />
  return (
    <div className="pf-tab stack-large">
      <section aria-labelledby="pf-com-t">
        <h2 id="pf-com-t">{g.comunidades}</h2>
        {using.valor.itens.length > 0 ? <Communities initial={using.valor} roverUid={rover.uid} proprio={own} d={d} lang={lang} /> : <p className="soft">{g.vazioComunidades}</p>}
      </section>
      <section aria-labelledby="pf-pag-t">
        <h2 id="pf-pag-t">{g.paginas}</h2>
        {pgs.valor.itens.length > 0 ? <Pages initial={pgs.valor} roverUid={rover.uid} d={d} lang={lang} /> : <p className="soft">{g.vazioPaginas}</p>}
      </section>
    </div>
  )
}
