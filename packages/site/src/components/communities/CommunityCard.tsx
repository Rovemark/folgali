import Link from 'next/link'
import { plural, relativeTime, type Dictionary } from '@/lib/i18n'
import type { CommunityCardData, RoleInCommunity } from '@/lib/social/types'
import { shadeOf } from '@/lib/social/hue'
import Photo from '@/components/folgali/Photo'
import { themeCover } from '@/lib/folgali/demo'
import { legalDict } from '@/lib/legal-i18n'
import type { Locale } from '@/lib/i18n-base'

export function AccessPill({ acesso: access, d }: { acesso: CommunityCardData['acesso']; d: Dictionary }) {
  return (
    <span className="pill" data-tom={access === 'aberta' ? 'ok' : access === 'moderada' ? 'aviso' : 'acao'}>
      {d.socComum.acessos[access].nome}
    </span>
  )
}

/** The patch of a community in the list: the whole card is a link. */
export default function CommunityCard({ c, d, lang, agora: now, papel: role }: { c: CommunityCardData; d: Dictionary; lang: string; agora: string; papel?: RoleInCommunity }) {
  const t = d.socComunidades.cartao
  return (
    <article className="card card-community" style={{ ['--h' as string]: shadeOf(c.nome) }}>
      <Link href={`/${lang}/comunidades/${c.id}`} className="card-link" aria-label={t.ir.replace('{nome}', c.nome)}>
        <Photo foto={themeCover(c.tema, c.id)} alt="" className="cc-cover" />
        <span className="cc-top">
          <span className="cc-name">
            <strong>{c.nome}</strong> {c.adulto && <span className="brand-18" title={legalDict(lang as Locale).adulto.comunidadeAdulta}>{legalDict(lang as Locale).adulto.marca}</span>}
            <span className="fine">#{c.tema}</span>
          </span>
        </span>
        {c.descricao && <span className="cc-desc">{c.descricao}</span>}
      </Link>
      <div className="cc-foot">
        <AccessPill acesso={c.acesso} d={d} />
        {role && <span className="pill" data-tom="acao">{d.socComum.papeis[role]}</span>}
        <span className="fine">{plural(t.membros, c.membros)}</span>
        <span className="fine">{plural(t.topicos, c.topicos)}</span>
        <span className="fine">{t.ativa.replace('{quando}', relativeTime(c.atividadeEm, d, new Date(now)))}</span>
      </div>
    </article>
  )
}
