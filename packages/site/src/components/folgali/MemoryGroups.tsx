// The memories of the person's rovers on the real relay, grouped by window ("Ontem", "Há uma semana", "No primeiro dia"...), in the same
// timeline look as the demonstration's "Neste dia" list: the rover's portrait where the demo has a photo, the text, who and when, and the
// link to the original post or reply.
import Link from 'next/link'
import Portrait from '@/components/Portrait'
import { shortDate, type Ready } from '@/lib/i18n-base'
import { WINDOW_LABEL, type MemoryGroup } from '@/lib/memories'
import type { Post } from '@/lib/types'

/** The texts this block uses, from `socFolgali.lembrancas`. */
export interface MemoryTexts {
  quando: Record<string, string>
  verOriginal: string
  resposta: string
}

/** How much of the text a memory shows (the original is one tap away). */
export const MEMORY_EXCERPT = 280

export function memoryExcerpt(p: Post): string {
  const chars = Array.from((p.titulo ? `${p.titulo}. ${p.texto}` : p.texto).trim())
  return chars.length > MEMORY_EXCERPT ? `${chars.slice(0, MEMORY_EXCERPT).join('').trimEnd()}…` : chars.join('')
}

export default function MemoryGroups({ grupos: groups, t, lang }: { grupos: MemoryGroup[]; t: MemoryTexts; lang: Ready }) {
  return (
    <>
      {groups.map((g) => (
        <section key={g.janela} className="mem-group" aria-labelledby={`lemb-${g.janela}`}>
          <h2 id={`lemb-${g.janela}`} className="feed-sep">{t.quando[WINDOW_LABEL[g.janela]]}</h2>
          <ol className="mem-row">
            {g.itens.map((p) => (
              <li key={p.id} className="box mem-item mem-real">
                <Portrait ficha={p.autor.rosto} nome={p.autor.nome} tamanho={64} decorative />
                <div className="mem-body">
                  <p className="fine">
                    <Link href={`/${lang}/r/${p.autor.handle}`}>{p.autor.nome}</Link>
                    {' · '}
                    <time dateTime={p.criadaEm}>{shortDate(p.criadaEm, lang)}</time>
                    {p.tipo === 'resposta' && ` · ${t.resposta}`}
                  </p>
                  <p className="mem-title">{memoryExcerpt(p)}</p>
                  <Link href={`/${lang}/p/${p.id}`} className="lat-view">{t.verOriginal}</Link>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  )
}
