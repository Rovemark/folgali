import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import CommunityHeader from '@/components/communities/CommunityHeader'
import ErrorState from '@/components/social/ErrorState'
import ProposalForm from '@/components/social/ProposalForm'
import { isComplete, ID_OK, readCommunity, whoAmI } from '@/lib/communities/data'
import { daysLeftToAppeal, canAppeal } from '@/lib/domain/moderation'
import { dict, isReady, fmt, plural } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import { screenMeta } from '@/lib/seo/meta-screens'

type P = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<{ alvo?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return screenMeta(lang, `/comunidades/${id}/apelar`, dict(isReady(lang) ? lang : 'pt').socComunidades.apelar.titulo)
}

export default async function Appeal({ params, searchParams }: P) {
  const { lang, id } = await params
  if (!isReady(lang)) notFound()
  const { alvo: target } = await searchParams
  const d = dict(lang)
  const t = d.socComunidades.apelar
  const c = ID_OK.test(id) ? await readCommunity(id) : ({ ok: false, codigo: 'nao-encontrado' } as const)
  if (!c.ok) return <ErrorState codigo={c.codigo} d={d} lang={lang} />
  const using = c.valor
  if (!isComplete(using)) return <CommunityHeader c={using} d={d} lang={lang} />
  const me = await whoAmI()
  const isRemoval = !!target && ID_OK.test(target)
  const banned = using.voce?.banido ?? false
  if (!banned && !isRemoval) return <ErrorState codigo="sem-permissao" d={d} lang={lang} />

  // the ban date comes from the public record (the banned person reads it, the community being open)
  // (relay 0.3.1 sends the date in `voce.banidoEm`; the record is only checked without it)
  const record = banned && me && !using.voce?.banidoEm ? await load(() => getNetwork().cliente.registroDaComunidade(id)) : null
  const when = using.voce?.banidoEm ?? (record?.ok ? (record.valor.itens.find((r) => r.acao === 'banimento' && typeof r.alvo === 'object' && r.alvo.uid === me?.uid)?.em ?? null) : null)
  const now = new Date()
  const inside = when ? canAppeal(when, now) : true
  return (
    <>
      <CommunityHeader c={using} d={d} lang={lang} />
      <div className="page-title">
        <p className="overline">
          <Link href={`/${lang}/comunidades/${id}`}>{d.socForum.topico.voltar}</Link>
        </p>
        <h2 style={{ fontSize: 28 }}>{t.titulo}</h2>
        <p>{t.sub}</p>
      </div>
      <div className="stack">
        <p className="proposal-note">
          <span>{t.quemDecide}</span>
        </p>
        {when && <p className={inside ? 'fine' : 'error-field'}>{inside ? plural(t.janela, daysLeftToAppeal(when, now)) : t.expirou}</p>}
        {inside && (
          <section className="card">
            <ProposalForm
              tipo="apelacao"
              d={d}
              lang={lang}
              canWrite={me !== null}
              roverName={me?.nome}
              destino={{ rotulo: fmt(banned ? t.contexto : t.contextoRemocao, { nome: using.nome }) }}
              hide={['tipo', 'alvo']}
              enviar={t.titulo}
              campos={{ tipo: banned ? 'banimento' : 'remocao', alvo: banned ? id : target!, texto: '' }}
            />
          </section>
        )}
      </div>
    </>
  )
}
