'use client'

import Link from 'next/link'
import Retrato from '@/components/Retrato'
import { useMais } from '@/components/social/useMais'
import { tempoRelativo, type Dicionario, type Pronto } from '@/lib/i18n-base'
import type { RegistroModeracao } from '@/lib/social/tipos'
import type { Pagina } from '@/lib/tipos'

type Props = { inicial: Pagina<RegistroModeracao>; d: Dicionario; lang: Pronto; agora: string; /** de uma comunidade: o id; sem id, é o registro do relé */ comunidade?: string }

export function ItemRegistro({ x, d, lang, agora }: { x: RegistroModeracao; d: Dicionario; lang: Pronto; agora: string }) {
  const t = d.socPaginas.registro
  const quem = typeof x.alvo === 'string' ? null : x.alvo
  return (
    <li className="registro-item">
      <span className={`registro-marca ${x.acao}`} aria-hidden />
      <div className="registro-corpo">
        <p className="registro-linha">
          <strong>{t.acoes[x.acao]}</strong>
          {x.alvoTipo && <span className="pilula">{t.tiposDeAlvo[x.alvoTipo as keyof typeof t.tiposDeAlvo] ?? x.alvoTipo}</span>}
          <span className="pilula" data-tom="aviso">
            {d.socComum.motivosModeracao[x.motivo]}
          </span>
        </p>
        <p className="registro-meta">
          <span>{t.por}: {t.papeis[x.por]}</span>
          <time dateTime={x.em}>{tempoRelativo(x.em, d, new Date(agora))}</time>
          {x.apelacao && <span className="pilula" data-tom={x.apelacao === 'revertida' ? 'ok' : undefined}>{t.apelacao[x.apelacao]}</span>}
        </p>
        {quem && (
          <Link href={`/${lang}/r/${quem.handle}`} className="registro-rover">
            <Retrato ficha={quem.rosto} nome={quem.nome} tamanho={28} decorativo />
            <span>{quem.nome} <span className="post-handle"><bdi dir="ltr">@{quem.handle}</bdi></span></span>
          </Link>
        )}
      </div>
    </li>
  )
}

export default function ListaRegistro({ inicial, d, lang, agora, comunidade }: Props) {
  const { itens, proximo, falhou, pendente, mais } = useMais(inicial, comunidade ? { lista: 'registroDaComunidade', de: comunidade } : { lista: 'registroDoRele' }, (x) => x.id)
  return (
    <>
      <ol className="registro" aria-busy={pendente}>
        {itens.map((x) => (
          <ItemRegistro key={x.id} x={x} d={d} lang={lang} agora={agora} />
        ))}
      </ol>
      {proximo && (
        <div className="mais">
          <button type="button" className="btn btn-sec" onClick={mais} disabled={pendente}>
            {pendente ? d.comum.carregando : d.comum.carregarMais}
          </button>
          {falhou && <p className="erro-campo" role="alert">{d.erro.titulo}</p>}
        </div>
      )}
    </>
  )
}
