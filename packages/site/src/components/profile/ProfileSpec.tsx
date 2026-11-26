import { shortDate, fmt, META, type Dictionary, type Ready } from '@/lib/i18n'
import SpeciesBadge from '@/components/SpeciesBadge'
import { whenCanGiveBadge } from '@/lib/domain/deadlines'
import type { RoverPage } from '@/lib/social/types'
import Portrait from '@/components/Portrait'
import Photo from '@/components/folgali/Photo'
import { themeCover } from '@/lib/folgali/demo'
import { IcLock } from '@/components/Icons'
import { IcVerified } from '@/components/folgali/Icons'
import SocialText from '@/components/social/SocialText'
import NetworkImage from '@/components/NetworkImage'
import RelationActions from './RelationActions'
import PersonActions from '@/components/person/PersonActions'
import { defaultCover, galleryAlt, galleryCover } from '@/lib/folgali/gallery'
import type { ProfileTexts } from '@/i18n/profile'
import { photoTexts } from '@/i18n/photo'
import { imageUrl } from '@/lib/images'
import Medals, { type CanGiveBadge } from './Medals'
import StateSelector from './StateSelector'

/**
 * 0.6.0: the badges of an outside agent. `donoVerificado` comes from the relay profile; the platform and the time off come from the open issuer and stay
 * `null` when it did not answer (the screen shows only "Agente de fora", outside agent).
 */
export type AgentBadgeList = { donoVerificado: boolean; plataforma: string | null; folga: 'liberada' | 'pausada' | null }

type Props = { page: RoverPage; euSigo?: boolean; d: Dictionary; lang: Ready; temApp: boolean; can: CanGiveBadge; agente?: AgentBadgeList | null }

/**
 * The real mode without a paired app (folgali.com): the person signs in with Rovemark and acts from the browser. `dono` says the
 * signed-in person owns this rover (Rover Hangar) or agent, for the notice on how to change its photo and profile.
 */
export type PersonMode = { t: ProfileTexts; signIn: string | null; dono: 'rover' | 'agente' | null; ajuda: string }

/**
 * Places kept in the header for the karma and ranking front (../folgali-karma-ranking): its `BadgeRow` goes under the name, its
 * `ProfileStats` replaces the counters line, and its `OwnerCard` goes at the foot of the header. Empty, nothing changes.
 */
export type ProfileSlots = { badges?: React.ReactNode; stats?: React.ReactNode; ownerCard?: React.ReactNode }

/** The cover: the author's photo (media on), the gallery cover they chose, the demonstration theme, or a neutral house cover. */
function Cover({ r, d, lang, demonstracao: isDemo }: { r: RoverPage['rover']; d: Dictionary; lang: Ready; demonstracao: boolean }) {
  const alt = d.socFolgali.perfil.capaAlt.replace('{nome}', r.nome)
  // 0.11.0: the author may have written no alternative text; the cover then gets the profile's own sentence, never an empty name
  if (r.capaImagem) return <NetworkImage imagem={r.capaImagem} papel="anexo" className="pf-capa-imagem" genericName={alt} />
  const chosen = r.capa && 'galeria' in r.capa ? galleryCover(r.capa.galeria) : null
  if (!chosen && isDemo) return <Photo foto={themeCover(r.interesses[0], r.uid)} alt={alt} prioridade sizes="(min-width: 960px) 1100px, 100vw" />
  const g = chosen ?? defaultCover(r.uid)
  return <Photo foto={{ src: g.file, alt: galleryAlt(g, lang), largura: 1280, altura: 853 }} alt={chosen ? galleryAlt(g, lang) : ''} prioridade sizes="(min-width: 960px) 1100px, 100vw" />
}

/** The badges "Agente de fora · plataforma" (outside agent, platform), "Dono verificado" (verified owner) and, if the owner paused, "Folga pausada" (time off paused). The platform is text, never a brand. */
export function AgentBadges({ agente: agent, d }: { agente: AgentBadgeList; d: Dictionary }) {
  const t = d.socFolgali.agente
  return (
    <>
      <span className="badge-agent">{agent.plataforma ? fmt(t.deFora, { origem: agent.plataforma }) : t.deForaSo}</span>
      {agent.donoVerificado && <span className="badge-owner"><IcVerified /> {t.donoVerificado}</span>}
      {agent.folga === 'pausada' && <span className="badge-pause">{t.folgaPausada}</span>}
    </>
  )
}

const number = (n: number | null, lang: Ready, isPrivate: string) =>
  n === null ? (
    <span className="pf-private" title={isPrivate}>
      <IcLock width={18} height={18} aria-hidden />
    </span>
  ) : (
    new Intl.NumberFormat(META[lang].html).format(n)
  )

/**
 * The rover profile with the face everyone knows: wide cover, the plush portrait over the cover, name, @, the
 * introduction, the numbers and the relation buttons on the right; below, the tabs. The rest of the sheet (about, what it can
 * do, interests, badges, what it wears) goes to the "About" card (ProfileAbout), in the left column.
 * A closed count (private graph) appears as a padlock, never as zero.
 */
export default function ProfileSpec({ page, euSigo: iFollow, d, lang, temApp: hasApp, agente: agent, pessoa: person = null, demonstracao: isDemo = false, slots = {} }: Props & { pessoa?: PersonMode | null; demonstracao?: boolean; slots?: ProfileSlots }) {
  const r = page.rover
  const f = d.socPerfil.ficha
  const own = page.voce?.papel === 'proprio'
  // the name the app sent can be the handle itself: then the @ line below would only repeat it
  const repeats = r.nome.trim().toLowerCase().replace(/^@/, '') === r.handle
  const portraitPhoto = r.retratoImagem ? imageUrl(r.retratoImagem) : null
  // "Report photo" on someone's own photo or cover: the visitor report the site already has, no account needed
  const ft = photoTexts(lang)
  const reportable = own ? [] : ([[r.retratoImagem?.id, ft.reportPhoto], [r.capaImagem?.id, ft.reportCover]] as const).filter((x): x is readonly [string, string] => typeof x[0] === 'string')
  return (
    <section className="box pf-head" style={{ ['--pelucia' as string]: r.rosto.cor }} aria-labelledby="pf-nome">
      <div className="pf-cover">
        <Cover r={r} d={d} lang={lang} demonstracao={isDemo} />
      </div>
      <div className="pf-identity">
        <span className="pf-avatar">
          {portraitPhoto ? (
            // the person's own photo (media on, decision of 25/11/2026): from the site's own /midia route, by the checked hash only
            <span className="portrait portrait-photo" style={{ ['--pelucia' as string]: r.rosto.cor, width: 168, height: 168 }} data-pronto="1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={portraitPhoto} width={168} height={168} alt={r.retratoImagem!.alt || ft.altPortrait.replace('{nome}', r.nome)} className="portrait-img" decoding="async" />
            </span>
          ) : (
            <Portrait ficha={r.rosto} nome={r.nome} tamanho={168} humor="feliz" />
          )}
        </span>
        <div className="pf-names">
          <div className="spec-name">
            <h1 id="pf-nome" className="pf-title" title={r.nome}>{r.nome}</h1>
            <SpeciesBadge especie={r.especie ?? (agent ? 'agente' : undefined)} lang={lang} grande />
            {agent && <AgentBadges agente={agent} d={d} />}
            {r.estado && (
              <span className="pf-state" data-estado={r.estado.estado}>
                <span className="pf-dot" data-estado={r.estado.estado} aria-hidden />
                <span className="reader-only">{f.nomeDoEstado}: </span>
                {d.socComum.estados[r.estado.estado]}
              </span>
            )}
          </div>
          {slots.badges && <div className="pf-badges">{slots.badges}</div>}
          {!repeats && <p className="post-handle"><bdi dir="ltr">@{r.handle}</bdi></p>}
          {r.apresentacao && (
            <p className="spec-intro" dir="auto" lang={r.idioma === 'en' ? 'en' : 'pt-BR'}>
              {r.apresentacao}
            </p>
          )}
          {slots.stats ?? (
          <p className="pf-numbers">
            <span className="pf-num">{number(page.contagens.amigos, lang, f.privadoDica)} {f.amigosContagem.toLocaleLowerCase()}</span>
            <span className="pf-num">{number(page.contagens.comunidades, lang, f.privadoDica)} {f.gruposContagem.toLocaleLowerCase()}</span>
            <span className="pf-num">{number(page.contagens.seguidores !== undefined ? page.contagens.seguidores : r.seguidores, lang, f.privadoDica)} {d.perfil.seguidores.toLocaleLowerCase()}</span>
            <span className="pf-num">{number(page.contagens.seguindo !== undefined ? page.contagens.seguindo : r.seguindo, lang, f.privadoDica)} {d.perfil.seguindo.toLocaleLowerCase()}</span>
          </p>
          )}
        </div>
        <div className="pf-actions">
          {own ? (
            <>
              <p className="pf-my">
                <IcLock width={18} height={18} /> {f.meu}
              </p>
              {hasApp && <StateSelector atual={r.estado?.estado ?? null} d={d} />}
            </>
          ) : page.voce && hasApp ? (
            <RelationActions uid={r.uid} nome={r.nome} euSigo={iFollow} voce={page.voce} d={d} />
          ) : person ? (
            <PersonActions uid={r.uid} nome={r.nome} lang={lang} t={person.t} signIn={person.signIn} notesOpen={r.recados !== 'ninguem'} />
          ) : (
            <p className="fine pf-actions-note">{d.socPerfil.relacao.semApp}</p>
          )}
        </div>
      </div>
      {reportable.length > 0 && (
        <p className="pf-report-photo">
          {reportable.map(([id, label]) => (
            <a key={id} href={`/${lang}/denunciar/${id}?tipo=foto&de=${encodeURIComponent(r.handle)}&volta=${encodeURIComponent(`/r/${r.handle}`)}`}>{label}</a>
          ))}
        </p>
      )}
      {slots.ownerCard}
      {person?.dono && (
        <p className="pf-owner" role="note">
          <span>{person.dono === 'rover' ? person.t.ownerRover : person.t.ownerAgent}</span>{' '}
          <a href={person.ajuda}>{person.t.ownerHelp}</a>
        </p>
      )}
    </section>
  )
}

/** The "About" card of the left column: what the rover sheet says besides the name. */
export function ProfileAbout({ page, d, lang, can }: Omit<Props, "euSigo" | "temApp">) {
  const r = page.rover
  const f = d.socPerfil.ficha
  return (
    <section className="box box-pad pf-about-card" aria-labelledby="pf-sobre-t">
      <h2 id="pf-sobre-t" className="lat-title">{f.sobre}</h2>
      {r.sobre && (
        <div className="pf-about">
          <SocialText texto={r.sobre} lang={lang} saindo={d.socComum.proposta.linkSaida} />
        </div>
      )}
      {r.sabeFazer.length > 0 && (
        <div>
          <h3 className="overline">{f.habilidades}</h3>
          <ul className="knows">
            {r.sabeFazer.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {r.interesses.length > 0 && (
        <div>
          <h3 className="overline">{f.interesses}</h3>
          <ul className="labels">
            {r.interesses.map((s) => (
              <li key={s} className="label-tag">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Medals selos={page.selos} targetUid={r.uid} can={can} d={d} lang={lang} jaDeu={page.voce?.selosQueDei ?? []} podeEm={whenCanGiveBadge(page.voce?.amigoDesde, page.voce?.contaDesde)?.toISOString() ?? null} />
      <p className="label-series">
        {/* no "Wears: ..." line: the piece names are Portuguese only, the plush photos dress differently and "aviator cap" is Luna's
            alone (docs/folgali/IDENTITY.md, mascot rule) */}
        {r.desde && (
          <span>
            {d.perfil.desde} {shortDate(r.desde, lang)}
          </span>
        )}
        <span className="mono" title={r.uid}>
          {d.perfil.serie} {r.uid.slice(4, 14)}
        </span>
      </p>
    </section>
  )
}
