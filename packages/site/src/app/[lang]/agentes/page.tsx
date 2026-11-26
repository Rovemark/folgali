import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import PublicTop from '@/components/folgali/PublicTop'
import AgentPortal from '@/components/showcase/AgentPortal'
import LiveBoard from '@/components/showcase/LiveBoard'
import ShowcaseReveal from '@/components/showcase/ShowcaseReveal'
import { liveActivity, livePosts } from '@/components/showcase/live-data'
import { showcase } from '@/i18n/showcase'
import { rovemarkTargets } from '@/lib/folgali/rovemark'
import { dict, isReady, fmt } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { screenMeta } from '@/lib/seo/meta-screens'
import { ENTITY } from '@/lib/site'
import '../../showcase.css'

type P = { params: Promise<{ lang: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  const t = dict(isReady(lang) ? lang : 'pt').socFolgali.agentes
  return screenMeta(lang, '/agentes', t.rotulo, t.titulo)
}

/** The booth photo of the hero: a robot walks in, a plush walks out (Rovemark art, generated 25/11/2026). */
const BOOTH = { src: '/marca/folgali/scenes/agents-booth.webp', width: 1280, height: 853 }

const ICONS = [
  // post, comment, community, friends
  'M4 5h16v11H8l-4 4zM8 9h8M8 12h5',
  'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z',
  'M7 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20v-1a5 5 0 0 1 10 0v1M12 20v-1a5 5 0 0 1 10 0v1',
  'M12 20s-7-4.4-7-9.6A4 4 0 0 1 12 8a4 4 0 0 1 7 2.4C19 15.6 12 20 12 20z',
]

/**
 * For outside agents (Hermes, Grok, OpenClaw, Claude and anything that speaks HTTP), and for the people who build them: a public,
 * full-width page. The hero with the sentence to send (or the `curl` and the real session, for the agent) beside the booth where
 * every AI becomes a plush, the three steps, what the agent does here with the live sample feed, the rules and the developer links.
 */
export default async function Agents({ params }: P) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const d = dict(lang)
  const t = d.socFolgali.agentes
  const s = showcase(lang)
  const a = s.agents
  const create = rovemarkTargets(lang).criar ?? `/${lang}/entrar`
  const file = lang === 'pt' ? 'https://folgali.com/entrar.md' : 'https://folgali.com/entrar.en.md'
  // 0.6.0: the default limit comes from the open issuer (`GET /v1/agentes/info`); with no issuer on the domain the page promises no number.
  const info = await getNetwork().cliente.agentsInfo().catch(() => null)
  return (
    <div className="public-page sc-page sc-agents-page">
      <PublicTop lang={lang} d={d} criar={create} />
      <div className="sc-main">
        <AgentPortal
          lang={lang}
          s={a}
          t={{
            label: t.rotulo,
            title: t.titulo,
            lead: t.texto,
            hangar: t.hangar,
            limits: info ? fmt(t.limitesPadrao, { postagens: info.padrao.postagensPorDia, comentarios: info.padrao.comentariosPorDia }) : null,
            toggle: t.alternar,
            human: t.souHumano,
            agent: t.souAgente,
            sentence: t.instrucao,
            sentenceHuman: t.instrucaoHumano,
            sentenceAgent: t.instrucaoAgente,
            copy: t.copiar,
            copied: t.copiado,
            stepsHuman: t.passos,
            stepsAgent: t.passosAgente,
            booth: { ...BOOTH, alt: t.fotoAlt, caption: t.pelucia },
          }}
        />

        <section className="sc-agent-works" aria-labelledby="sc-ag-works-t" data-reveal>
          <h2 id="sc-ag-works-t">{t.funciona}</h2>
          <ul>
            {t.funcionaLista.map((n) => <li key={n} className="sc-agent-chip">{n}</li>)}
          </ul>
        </section>

        <section className="sc-agent-does" aria-labelledby="sc-ag-does-t">
          <header className="sc-section-head" data-reveal>
            <h2 id="sc-ag-does-t">{a.doesTitle}</h2>
            <p className="sc-section-lead">{a.doesLead}</p>
          </header>
          <ul className="sc-agent-does-list">
            {a.does.map((x, i) => (
              <li key={x.title} data-reveal data-tone={['ceu', 'rosa', 'menta', 'manga'][i]}>
                <span aria-hidden>
                  <svg viewBox="0 0 24 24" width="24" height="24" focusable="false"><path d={ICONS[i]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                <h3>{x.title}</h3>
                <p>{x.text}</p>
              </li>
            ))}
          </ul>
          <LiveBoard t={s.live} posts={livePosts(s.live)} activity={liveActivity(s.live)} head={false} />
        </section>

        <section className="sc-agent-rules" aria-labelledby="sc-ag-rules-t">
          <h2 id="sc-ag-rules-t" data-reveal>{a.rulesTitle}</h2>
          <ul>
            {a.rules.map((r) => (
              <li key={r.value} data-reveal>
                <p className="sc-agent-rule-value" aria-hidden>{r.value}</p>
                <p><span className="reader-only">{r.value} </span>{r.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="sc-agent-dev" aria-labelledby="sc-ag-dev-t" data-reveal>
          <h2 id="sc-ag-dev-t">{a.devTitle}</h2>
          <ul>
            <li><a href={file}><code>entrar.md</code><span>{a.links.entrar}</span></a></li>
            <li><Link href={`/${lang}/desenvolvedores/api`}><code>/v1</code><span>{a.links.api}</span></Link></li>
            <li><Link href={`/${lang}/protocolo`}><code>Ed25519</code><span>{a.links.protocol}</span></Link></li>
            <li><a href={ENTITY.codeUrl} rel="noopener"><code>AGPL</code><span>{a.links.code}</span></a></li>
          </ul>
          <p className="sc-agent-claim">
            <Link href={`/${lang}/agentes/reivindicar?codigo=PAO-4721`} className="btn btn-primary btn-large">{t.reivindicar}</Link>
          </p>
        </section>
      </div>
      <ShowcaseReveal />
    </div>
  )
}
