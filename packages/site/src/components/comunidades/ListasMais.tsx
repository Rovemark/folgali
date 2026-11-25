'use client'

import Link from 'next/link'
import { IcBandeira } from '@/components/Icones'
import CartaoRover from '@/components/social/CartaoRover'
import { useMais } from '@/components/social/useMais'
import type { Dicionario } from '@/lib/i18n-base'
import { tempoRelativo } from '@/lib/i18n-base'
import type { MembroItem, RegistroModeracao, TopicoCartao, Vocabulario } from '@/lib/social/tipos'
import type { Pagina } from '@/lib/tipos'
import CartaoTopico from './CartaoTopico'

function Rodape({ proximo, pendente, falhou, mais, d }: { proximo?: string; pendente: boolean; falhou: boolean; mais: () => void; d: Dicionario }) {
  if (!proximo && !falhou) return null
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 8, marginTop: 12 }}>
      {proximo && (
        <button type="button" className="btn btn-sec" onClick={mais} disabled={pendente}>
          {pendente ? d.comum.carregando : d.comum.carregarMais}
        </button>
      )}
      {falhou && (
        <p className="erro-campo" role="alert">
          {d.socComum.erros.outro.titulo}. {d.comum.tentarDeNovo}.
        </p>
      )}
    </div>
  )
}

/** Mais tópicos da lista de uma comunidade, com o mesmo filtro da primeira página. */
export function TopicosMais({ inicial, comunidade, opcoes, d, lang, agora, vocabulario }: { inicial: Pagina<TopicoCartao>; comunidade: string; opcoes: Record<string, string>; d: Dicionario; lang: string; agora: string; vocabulario?: Vocabulario }) {
  const { itens, proximo, pendente, falhou, mais } = useMais(inicial, { lista: 'topicos', de: comunidade, opcoes }, (t) => t.id)
  return (
    <>
      <div className="topicos-lista" role="feed" aria-busy={pendente}>
        {itens.map((t) => (
          <CartaoTopico key={t.id} t={t} d={d} lang={lang} agora={agora} vocabulario={vocabulario} />
        ))}
      </div>
      <Rodape proximo={proximo} pendente={pendente} falhou={falhou} mais={mais} d={d} />
    </>
  )
}


export function MembrosMais({ inicial, comunidade, d, lang, agora }: { inicial: Pagina<MembroItem>; comunidade: string; d: Dicionario; lang: string; agora: string }) {
  const { itens, proximo, pendente, falhou, mais } = useMais(inicial, { lista: 'membros', de: comunidade }, (m) => m.rover.uid)
  return (
    <>
      <ul className="membros-lista">
        {itens.map((m) => (
          <li key={m.rover.uid}>
            <CartaoRover
              rover={m.rover}
              lang={lang}
              extra={
                <>
                  <span className="pilula" data-tom={m.papel === 'membro' ? undefined : 'acao'}>
                    {d.socComum.papeis[m.papel]}
                  </span>
                  <span className="miudo">{d.socComunidades.pagina.desde.replace('{quando}', tempoRelativo(m.desde, d, new Date(agora)))}</span>
                </>
              }
            />
          </li>
        ))}
      </ul>
      <Rodape proximo={proximo} pendente={pendente} falhou={falhou} mais={mais} d={d} />
    </>
  )
}

export function RegistroItem({ r, d, lang, agora }: { r: RegistroModeracao; d: Dicionario; lang: string; agora: string }) {
  const t = d.socModeracao.registro
  const alvoRover = typeof r.alvo === 'object' ? r.alvo : null
  return (
    <li className="registro-item">
      <span className="registro-ico" aria-hidden>
        <IcBandeira />
      </span>
      <div className="registro-corpo">
        <p>
          <strong>{t.acao[r.acao]}</strong>
          {alvoRover ? (
            <>
              {': '}
              <Link href={`/${lang}/r/${alvoRover.handle}`}>
                {alvoRover.nome} <span className="miudo"><bdi dir="ltr">@{alvoRover.handle}</bdi></span>
              </Link>
            </>
          ) : (
            r.alvoTipo && (
              <>
                {': '}
                {r.acao === 'dispensa' ? ((t.tipos as Record<string, string>)[r.alvoTipo] ?? r.alvoTipo) : t.alvoConteudo.replace('{tipo}', (t.tipos as Record<string, string>)[r.alvoTipo] ?? r.alvoTipo)}
              </>
            )
          )}
        </p>
        <p className="miudo">
          {d.socComum.motivosModeracao[r.motivo]} · {t.por.replace('{papel}', t.papel[r.por])} · {tempoRelativo(r.em, d, new Date(agora))}
          {r.apelacao && <> · <span className="pilula" data-tom={r.apelacao === 'revertida' ? 'ok' : r.apelacao === 'aberta' ? 'aviso' : undefined}>{t.apelacao[r.apelacao]}</span></>}
        </p>
      </div>
    </li>
  )
}

export function RegistroMais({ inicial, comunidade, d, lang, agora }: { inicial: Pagina<RegistroModeracao>; comunidade: string; d: Dicionario; lang: string; agora: string }) {
  const { itens, proximo, pendente, falhou, mais } = useMais(inicial, { lista: 'registroDaComunidade', de: comunidade }, (r) => r.id)
  return (
    <>
      <ol className="registro-lista">
        {itens.map((r) => (
          <RegistroItem key={r.id} r={r} d={d} lang={lang} agora={agora} />
        ))}
      </ol>
      <Rodape proximo={proximo} pendente={pendente} falhou={falhou} mais={mais} d={d} />
    </>
  )
}

