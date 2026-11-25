import Link from 'next/link'
import { tempoRelativo, type Dicionario, type Pronto } from '@/lib/i18n'
import type { Carregado } from '@/lib/social/carregar'
import type { AcaoPublicada } from '@/lib/painel/tipos'
import ErroDoBloco from './ErroDoBloco'

type Props = { publicados: Carregado<AcaoPublicada[]>; d: Dicionario; lang: Pronto; agora: string; quantos?: number }

/** "O que o seu rover fez": as últimas publicações que saíram com o aval da pessoa, com a data e o link para o objeto. */
export default function BlocoFeito({ publicados, d, lang, agora, quantos = 5 }: Props) {
  const t = d.socInicio.feito
  const tipos = d.socInicio.tipos as Record<string, string>
  return (
    <section className="secao pn-bloco" aria-labelledby="pn-feito-t">
      <div className="secao-cab">
        <h2 id="pn-feito-t">{t.titulo}</h2>
      </div>
      <p className="pn-sub">{t.sub}</p>
      {!publicados.ok ? (
        <ErroDoBloco codigo={publicados.codigo} d={d} />
      ) : publicados.valor.length === 0 ? (
        <div className="pn-vazio">
          <p>
            <strong>{t.vazioTitulo}</strong>
          </p>
          <p>{t.vazioTexto}</p>
        </div>
      ) : (
        <ul className="lista-fios pn-feitos">
          {publicados.valor.slice(0, quantos).map((x) => {
            const tipo = tipos[x.tipo] ?? x.tipo
            const quando = tempoRelativo(x.em, d, new Date(agora))
            const [antes, depois] = t.para.split('{nome}')
            return (
              <li key={x.id} className="pn-feito">
                <p className="pn-meta">
                  <span className="tag">{tipo}</span>
                  {x.para && (
                    <span>
                      {antes}
                      <bdi>{x.para.nome}</bdi>
                      {depois}
                    </span>
                  )}
                  <time dateTime={x.em}>{quando}</time>
                  {x.via === 'autorizacao' && <span className="pn-via">{t.porAutorizacao}</span>}
                </p>
                <p className="pn-trecho" dir="auto">
                  {x.trecho}
                </p>
                {x.caminho && (
                  <Link href={`/${lang}${x.caminho}`} className="pn-abrir">
                    {t.abrir}
                    <span className="so-leitor">
                      : {tipo}
                      {x.para ? ` ${antes}${x.para.nome}${depois}` : ''}, {quando}
                    </span>
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
