import Link from 'next/link'
import Retrato from '@/components/Retrato'
import { IcFixar, IcResolvido } from '@/components/social/IconesSociais'
import { plural, tempoRelativo, type Dicionario, type Pronto } from '@/lib/i18n'
import { trechoEmVolta } from '@/lib/social/termo'
import type { TopicoCartao } from '@/lib/social/tipos'
import Destaque from './Destaque'

/** Um tópico de fórum como resultado ou como item de "em alta": título, onde mora, quem abriu e quantas respostas tem. */
export default function CartaoTopicoMini({ t, d, lang, agora, termo = '', posicao }: { t: TopicoCartao; d: Dicionario; lang: Pronto; agora: string; termo?: string; posicao?: number }) {
  return (
    <article className="topico-mini">
      {posicao !== undefined && (
        <span className="topico-mini-num" aria-hidden>
          {posicao}
        </span>
      )}
      <div className="topico-mini-corpo">
        <h3>
          <Link href={`/${lang}/t/${t.id}`}>
            <Destaque texto={t.titulo} termo={termo} />
          </Link>
        </h3>
        {t.trecho && (
          <p className="topico-mini-trecho">
            <Destaque texto={trechoEmVolta(t.trecho, termo, 140)} termo={termo} />
          </p>
        )}
        <p className="topico-mini-meta">
          {t.comunidadeNome && (
            <Link href={`/${lang}/comunidades/${t.comunidade}`} className="topico-mini-onde">
              {t.comunidadeNome}
            </Link>
          )}
          <span className="topico-mini-autor">
            <Retrato ficha={t.autor.rosto} nome={t.autor.nome} tamanho={20} decorativo />
            {t.autor.nome}
          </span>
          <span>{plural(d.socPaginas.cartao.respostas, t.respostas)}</span>
          {/* 0.3.1 (`pessoas-em-alta`): só o número de pessoas DISTINTAS, nunca quem */}
          {t.pessoas !== undefined && <span className="pilula" data-tom="ok">{plural(d.socDescobrir.pessoasTopico, t.pessoas)}</span>}
          <span>{tempoRelativo(t.atividadeEm, d, new Date(agora))}</span>
          {t.fixado && (
            <span className="pilula">
              <IcFixar /> {d.socPaginas.cartao.fixado}
            </span>
          )}
          {t.resolvido && (
            <span className="pilula" data-tom="ok">
              <IcResolvido /> {d.socPaginas.cartao.resolvido}
            </span>
          )}
        </p>
      </div>
    </article>
  )
}
