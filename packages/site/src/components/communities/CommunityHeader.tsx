import Link from 'next/link'
import { legalDict } from '@/lib/legal-i18n'
import type { Locale } from '@/lib/i18n-base'
import { shortDate, plural, type Dictionary, type Ready } from '@/lib/i18n'
import { canInCommunity } from '@/lib/domain/permissions'
import { whoOf } from '@/lib/communities/data'
import { shadeOf } from '@/lib/social/hue'
import type { Community, MinimalCommunity } from '@/lib/social/types'
import Photo from '@/components/folgali/Photo'
import Portrait from '@/components/Portrait'
import type { RoverSummary } from '@/lib/types'
import { themeCover } from '@/lib/folgali/demo'
import JoinActions from './EntryActions'
import { AccessPill } from './CommunityCard'

export type Tab = 'conversas' | 'membros' | 'sobre' | 'registro' | 'moderacao' | 'gerir'

/** The top of every community page: the patch, the name, who looks after it, the participation buttons and the tabs. */
export default function CommunityHeader({ c, d, lang, aba, faces = [] }: { c: Community | MinimalCommunity; d: Dictionary; lang: Ready; aba?: Tab; faces?: RoverSummary[] }) {
  const t = d.socComunidades
  const complete = 'regras' in c
  const who = whoOf(c.voce)
  const team = canInCommunity('ver-moderacao', who, c.acesso).ok
  const base = `/${lang}/comunidades/${c.id}`
  const tabs: { id: Tab; href: string; texto: string }[] = [
    { id: 'conversas', href: base, texto: t.pagina.abas.conversas },
    { id: 'membros', href: `${base}/membros`, texto: t.pagina.abas.membros },
    { id: 'sobre', href: `${base}/sobre`, texto: t.pagina.abas.sobre },
    { id: 'registro', href: `${base}/registro`, texto: t.pagina.abas.registro },
    ...(team ? [{ id: 'moderacao' as Tab, href: `${base}/moderacao`, texto: t.pagina.abas.moderacao }, { id: 'gerir' as Tab, href: `${base}/gerir`, texto: t.pagina.abas.gerir }] : []),
  ]
  return (
    <header className="com-head" style={{ ['--h' as string]: shadeOf(c.nome) }}>
      <div className="com-head-band" aria-hidden>
        <Photo foto={themeCover(complete ? c.tema : undefined, c.id)} alt="" prioridade />
      </div>
      <div className="com-head-body">
        <div className="com-head-name">
          <p className="overline">
            <Link href={`/${lang}/comunidades`}>{t.titulo}</Link>
          </p>
          <h1>{c.nome} {'adulto' in c && c.adulto && <span className="brand-18" title={legalDict(lang as Locale).adulto.comunidadeAdulta}>{legalDict(lang as Locale).adulto.marca}</span>}</h1>
          <div className="flex-row">
            <AccessPill acesso={c.acesso} d={d} />
            {complete && <span className="fine">#{c.tema}</span>}
            {complete && <span className="fine">{plural(d.socComunidades.cartao.membros, c.membros)}</span>}
            {c.voce?.papel && <span className="pill" data-tom="acao">{t.entrada.voceE.replace('{papel}', d.socComum.papeis[c.voce.papel].toLowerCase())}</span>}
          </div>
        </div>
        {faces.length > 0 && (
          <ul className="com-head-faces" aria-label={d.socFolgali.comunidade.quemParticipa}>
            {faces.map((r) => (
              <li key={r.uid}>
                <Link href={`/${lang}/r/${r.handle}`} title={r.nome}>
                  <Portrait ficha={r.rosto} nome={r.nome} tamanho={44} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {/* name, faces and the join button share one band on wide screens (reference screen tela-comunidade-desktop) */}
        {c.voce && (
          <div className="com-head-actions">
            <JoinActions id={c.id} acesso={c.acesso} voce={c.voce} d={d} />
          </div>
        )}
        <div className="com-head-rest">
          {c.descricao && <p className="com-head-desc">{c.descricao}</p>}
          {complete && <p className="fine">{t.pagina.criadaEm.replace('{data}', shortDate(c.criadaEm, lang))}</p>}
        </div>
      </div>
      {complete && (
        <nav className="sub-nav com-tabs" aria-label={t.pagina.navegacao}>
          {tabs.map((a) => (
            <Link key={a.id} href={a.href} aria-current={aba === a.id ? 'page' : undefined}>
              {a.texto}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}
