import Link from 'next/link'
import { plural, tempoRelativo, type Dicionario } from '@/lib/i18n'
import type { TopicoCartao, Vocabulario } from '@/lib/social/tipos'
import Retrato from '@/components/Retrato'
import Marcas from './Marcas'
import { IcEditar, IcEnquete, IcFixar, IcResolvido, IcTrancar } from '@/components/social/IconesSociais'

/** Os selos de um tópico: só os que valem, com ícone e texto (a cor nunca é o único sinal). */
export function SelosDoTopico({ t, d }: { t: Pick<TopicoCartao, 'fixado' | 'trancado' | 'resolvido' | 'enquete' | 'editado'>; d: Dicionario }) {
  const s = d.socForum.selos
  return (
    <>
      {t.fixado && (
        <span className="pilula" data-tom="acao">
          <IcFixar /> {s.fixado}
        </span>
      )}
      {t.resolvido && (
        <span className="pilula" data-tom="ok">
          <IcResolvido /> {s.resolvido}
        </span>
      )}
      {t.trancado && (
        <span className="pilula" data-tom="aviso">
          <IcTrancar /> {s.trancado}
        </span>
      )}
      {t.enquete && (
        <span className="pilula">
          <IcEnquete /> {s.enquete}
        </span>
      )}
      {t.editado && (
        <span className="pilula">
          <IcEditar /> {s.editado}
        </span>
      )}
    </>
  )
}

/** Uma linha do fórum: o retrato de quem abriu, o título, o trecho e os números, presos pelo fio. */
/** `vocabulario` (0.3.2): o da comunidade do tópico. Sem ele (busca, em alta, outros lugares) as marcas não aparecem, em vez de aparecerem como código. */
export default function CartaoTopico({ t, d, lang, agora, comComunidade = false, vocabulario }: { t: TopicoCartao; d: Dicionario; lang: string; agora: string; comComunidade?: boolean; vocabulario?: Vocabulario }) {
  const c = d.socForum.cartao
  return (
    <article className={`topico-cartao${t.fixado ? ' fixado' : ''}`}>
      <div className="topico-trilha">
        <Retrato ficha={t.autor.rosto} nome={t.autor.nome} tamanho={44} decorativo />
      </div>
      <div className="topico-corpo">
        <div className="linha-flex topico-selos">
          <SelosDoTopico t={t} d={d} />
          <Marcas marcas={t.marcas} vocabulario={vocabulario} d={d} />
          {t.categoria && <span className="etiqueta">{t.categoria}</span>}
          {comComunidade && t.comunidadeNome && <span className="miudo">{t.comunidadeNome}</span>}
        </div>
        <h3>
          <Link href={`/${lang}/t/${t.id}`} aria-label={c.ir.replace('{titulo}', t.titulo)}>
            {t.titulo}
          </Link>
        </h3>
        <p className="topico-trecho">{t.trecho}</p>
        <p className="miudo topico-meta">
          <span>{c.por.replace('{nome}', t.autor.nome)}</span>
          <span>{plural(c.respostas, t.respostas)}</span>
          <span>{c.ativo.replace('{quando}', tempoRelativo(t.atividadeEm, d, new Date(agora)))}</span>
        </p>
      </div>
    </article>
  )
}
