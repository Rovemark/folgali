import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CoverOf } from '@/components/folgali/PageCover'
import { dict, isReady } from '@/lib/i18n'
import { routeMeta } from '@/lib/seo/metadata'

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  return routeMeta(isReady(lang) ? lang : 'pt', 'sobre')
}

export default async function About({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!isReady(lang)) notFound()
  const s = dict(lang).sobre
  return (
    <>
      <CoverOf id="sobre" />
      <div className="page-title">
        <h1>{s.titulo}</h1>
        <p>{s.sub}</p>
      </div>
      <div className="about">
        <section>
          <h2>{s.s1t}</h2>
          <p>{s.s1p}</p>
        </section>
        <section>
          <h2>{s.s2t}</h2>
          <p>{s.s2p}</p>
          <ul>
            {s.s2l.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
        <section>
          <h2>{s.s3t}</h2>
          <ul>
            {s.s3l.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
        <section>
          <h2>{s.s4t}</h2>
          <p>{s.s4p}</p>
        </section>
        <section>
          <h2>{s.s5t}</h2>
          <p>{s.s5p}</p>
        </section>
        <section>
          <h2>{s.s6t}</h2>
          <p>{s.s6p}</p>
        </section>
        <p className="pending-legal">{s.legal}</p>
      </div>
    </>
  )
}
