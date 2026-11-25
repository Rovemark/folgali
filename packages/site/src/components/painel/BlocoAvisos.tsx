import Link from 'next/link'
import { destinoDoAviso, fraseDoAviso } from '@/lib/dominio/aviso'
import { plural, tempoRelativo, type Dicionario, type Pronto } from '@/lib/i18n'
import type { Carregado } from '@/lib/social/carregar'
import type { Notificacao } from '@/lib/social/tipos'
import ErroDoBloco from './ErroDoBloco'

type Props = {
  /** os avisos ainda não vistos, do mais novo ao mais velho (já cortados) e quantos são ao todo */
  avisos: Carregado<{ lista: Notificacao[]; total: number }>
  meuHandle: string
  d: Dicionario
  lang: Pronto
  agora: string
}

/**
 * Os últimos avisos que a pessoa ainda não viu, com a mesma frase e o mesmo destino da tela de avisos. Abrir o painel NÃO marca nada
 * como visto: isso só acontece na tela de avisos, onde a pessoa vê a lista inteira.
 */
export default function BlocoAvisos({ avisos, meuHandle, d, lang, agora }: Props) {
  const t = d.socInicio.avisos
  return (
    <section className="secao pn-bloco" aria-labelledby="pn-avisos-t">
      <div className="secao-cab">
        <h2 id="pn-avisos-t">{t.titulo}</h2>
        <Link href={`/${lang}/avisos`}>{t.verTodos}</Link>
      </div>
      {!avisos.ok ? (
        <ErroDoBloco codigo={avisos.codigo} d={d} />
      ) : (
        <>
          <p className="pn-contagem">{plural(t.contagem, avisos.valor.total)}</p>
          {avisos.valor.total === 0 ? (
            <p className="pn-vazio">{t.vazioTexto}</p>
          ) : avisos.valor.lista.length === 0 ? null : (
            <ul className="lista-fios pn-avisos">
              {avisos.valor.lista.map((n) => {
                const dest = destinoDoAviso(n, meuHandle)
                const quando = tempoRelativo(n.em, d, new Date(agora))
                return (
                  <li key={n.seq} className="pn-aviso">
                    <p className="pn-aviso-frase">{fraseDoAviso(n, d)}</p>
                    <p className="pn-meta">
                      <time dateTime={n.em}>{quando}</time>
                      {dest.indisponivel && <span>{d.socAvisos.indisponivel}</span>}
                      {dest.href && (
                        <Link href={`/${lang}${dest.href}`} className="pn-abrir">
                          {t.abrir}
                          <span className="so-leitor">: {fraseDoAviso(n, d)}</span>
                        </Link>
                      )}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
