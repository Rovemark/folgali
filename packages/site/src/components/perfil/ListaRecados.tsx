'use client'

import Link from 'next/link'
import Retrato from '@/components/Retrato'
import TextoSocial from '@/components/social/TextoSocial'
import { useMais } from '@/components/social/useMais'
import { tempoRelativo, type Dicionario, type Pronto } from '@/lib/i18n-base'
import type { Pagina } from '@/lib/tipos'
import type { Recado } from '@/lib/social/tipos'
import MenuConteudo from './MenuConteudo'

type Props = {
  inicial: Pagina<Recado>
  donoUid: string
  donoHandle: string
  /** uid do rover da pessoa que olha, quando houver */
  meuUid: string | null
  d: Dicionario
  lang: Pronto
  agora: string
}

/** O mural: bilhetes presos com ponto, um por recado. O dono tira qualquer um; o autor apaga o seu. */
export default function ListaRecados({ inicial, donoUid, donoHandle, meuUid, d, lang, agora }: Props) {
  const { itens, proximo, pendente, falhou, mais } = useMais(inicial, { lista: 'recados', de: donoUid }, (r) => r.id)
  const doDono = meuUid === donoUid
  return (
    <>
      <ul className="pf-mural" aria-busy={pendente}>
        {itens.map((r, i) => (
          <li key={r.id} className="pf-bilhete" style={{ ['--giro' as string]: `${((i * 7) % 5) - 2}deg`, ['--pelucia' as string]: r.autor.rosto.cor }}>
            <span className="pf-ponto" aria-hidden />
            <header>
              <Link href={`/${lang}/r/${r.autor.handle}`} className="pf-bilhete-autor">
                <Retrato ficha={r.autor.rosto} nome={r.autor.nome} tamanho={40} decorativo />
                <span>
                  <strong>{r.autor.nome}</strong>
                  <small><bdi dir="ltr">@{r.autor.handle}</bdi></small>
                </span>
              </Link>
              <time dateTime={r.criadoEm}>{tempoRelativo(r.criadoEm, d, new Date(agora))}</time>
              <MenuConteudo id={r.id} tipo="recado" autorHandle={r.autor.handle} donoHandle={donoHandle} lang={lang} d={d} meu={meuUid === r.autor.uid} doDono={doDono} />
            </header>
            <TextoSocial texto={r.texto} lang={lang} saindo={d.socComum.proposta.linkSaida} className="pf-bilhete-texto" />
          </li>
        ))}
      </ul>
      {proximo && (
        <div className="pf-mais-lista">
          <button type="button" className="btn btn-sec" onClick={mais} disabled={pendente}>
            {pendente ? d.comum.carregando : d.comum.carregarMais}
          </button>
          {falhou && <p className="erro-campo" role="alert">{d.erro.titulo}. {d.comum.tentarDeNovo}.</p>}
        </div>
      )}
    </>
  )
}
