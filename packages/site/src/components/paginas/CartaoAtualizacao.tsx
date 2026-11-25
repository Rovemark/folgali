import Link from 'next/link'
import Reacoes from '@/components/Reacoes'
import Retrato from '@/components/Retrato'
import Emblema from '@/components/social/Emblema'
import { IcEtiqueta } from '@/components/social/IconesSociais'
import TextoSocial from '@/components/social/TextoSocial'
import { tempoRelativo, type Dicionario, type Pronto } from '@/lib/i18n'
import { matizDe } from '@/lib/social/matiz'
import type { Atualizacao } from '@/lib/social/tipos'
import MenuAtualizacao from './MenuAtualizacao'

type Props = {
  a: Atualizacao
  d: Dicionario
  lang: Pronto
  agora: string
  meuUid?: string | null
  /** o leitor é o dono da página (pode remover a atualização de outro) */
  souDonoDaPagina?: boolean
  /** na linha de início a atualização mostra de qual página veio; na página da etiqueta, não precisa */
  comPagina?: boolean
  /** na linha, o remendo da página já está no fio ao lado: o cabeçalho não repete */
  noFio?: boolean
  i?: number
}

/** Uma atualização de página: uma folha de caderno com a margem costurada na cor da página. */
export default function CartaoAtualizacao({ a, d, lang, agora, meuUid, souDonoDaPagina = false, comPagina = false, noFio = false, i = 0 }: Props) {
  const t = d.socPaginas.atualizacao
  const nomePagina = a.paginaNome ?? ''
  return (
    <article className="atu" style={{ ['--h' as string]: matizDe(nomePagina || a.pagina), ['--i' as string]: i }} aria-label={a.titulo ?? `${a.autor.nome}`}>
      <header className="atu-cab">
        {comPagina ? (
          <Link href={`/${lang}/paginas/${a.pagina}`} className="atu-pagina">
            {!noFio && <Emblema nome={nomePagina || '?'} forma="etiqueta" tamanho={40} />}
            <span className="atu-pagina-nome">
              <span className="pilula" data-tom="acao">
                <IcEtiqueta /> {t.deUmaPagina}
              </span>
              <strong>{nomePagina}</strong>
            </span>
          </Link>
        ) : (
          <span className="pilula" data-tom="acao">
            <IcEtiqueta /> {t.atualizacao}
          </span>
        )}
        <time className="miudo" dateTime={a.criadaEm}>
          {tempoRelativo(a.criadaEm, d, new Date(agora))}
        </time>
        <MenuAtualizacao id={a.id} d={d} souAutor={meuUid === a.autor.uid} souDonoDaPagina={souDonoDaPagina} nomeDaPagina={nomePagina} />
      </header>
      {a.titulo && <h3 className="atu-titulo">{a.titulo}</h3>}
      <TextoSocial texto={a.texto} lang={lang} saindo={t.saindo} className="atu-texto" />
      {a.tags.length > 0 && (
        <ul className="etiquetas" aria-label={t.tags}>
          {a.tags.map((tag) => (
            <li key={tag}>
              <Link href={`/${lang}/buscar?q=${encodeURIComponent('#' + tag)}`} className="etiqueta">
                {tag}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <footer className="atu-pe">
        <Link href={`/${lang}/r/${a.autor.handle}`} className="atu-autor">
          <Retrato ficha={a.autor.rosto} nome={a.autor.nome} tamanho={28} decorativo />
          <span>{t.por} {a.autor.nome}</span>
        </Link>
        <span className="acoes">
          <Reacoes id={a.id} reacoes={a.reacoes} minha={a.minhaReacao ?? null} rotulos={{ curtir: d.post.curtir, util: d.post.util }} />
        </span>
      </footer>
    </article>
  )
}
