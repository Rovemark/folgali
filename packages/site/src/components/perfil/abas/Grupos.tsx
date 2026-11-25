import EstadoVazio from '@/components/EstadoVazio'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { fmt } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import { Comunidades, Paginas } from '../ListaGrupos'
import type { ContextoAba } from './contexto'

export default async function Grupos({ rover, pag, d, lang }: ContextoAba) {
  const g = d.socPerfil.grupos
  const { cliente } = obterRede()
  const proprio = pag.voce?.papel === 'proprio'
  const [com, pgs] = await Promise.all([carregar(() => cliente.comunidadesDoRover(rover.uid)), carregar(() => cliente.paginasDoRover(rover.uid))])
  if ((!com.ok && com.codigo === 'grafo-privado') || (!pgs.ok && pgs.codigo === 'grafo-privado')) {
    return <EstadoVazio titulo={fmt(g.privadoTitulo, { nome: rover.nome })} texto={g.privadoTexto} ficha={rostoPorUid(rover.uid)} estado="parado" altura={130} />
  }
  if (!com.ok) return <EstadoDeErro codigo={com.codigo} d={d} lang={lang} />
  if (!pgs.ok) return <EstadoDeErro codigo={pgs.codigo} d={d} lang={lang} />
  return (
    <div className="pf-aba pilha-g">
      <section aria-labelledby="pf-com-t">
        <h2 id="pf-com-t">{g.comunidades}</h2>
        {com.valor.itens.length > 0 ? <Comunidades inicial={com.valor} roverUid={rover.uid} proprio={proprio} d={d} lang={lang} /> : <p className="suave">{g.vazioComunidades}</p>}
      </section>
      <section aria-labelledby="pf-pag-t">
        <h2 id="pf-pag-t">{g.paginas}</h2>
        {pgs.valor.itens.length > 0 ? <Paginas inicial={pgs.valor} roverUid={rover.uid} d={d} lang={lang} /> : <p className="suave">{g.vazioPaginas}</p>}
      </section>
    </div>
  )
}
