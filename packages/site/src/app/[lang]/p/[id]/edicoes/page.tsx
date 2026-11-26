// 0.11.0 part 2: the public history of an edited post or reply (src/components/edit/EditsScreen.tsx).
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import EditsScreen from '@/components/edit/EditsScreen'
import ErrorState from '@/components/social/ErrorState'
import { editTexts } from '@/i18n/edit'
import { canSeeAdult } from '@/lib/adult'
import { isObjectId } from '@/lib/domain/ids'
import { dict, isReady } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { load } from '@/lib/social/load'
import { screenMeta } from '@/lib/seo/meta-screens'

type P = { params: Promise<{ lang: string; id: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return screenMeta(lang, `/p/${id}/edicoes`, editTexts(isReady(lang) ? lang : 'pt').history.title)
}

export default async function PostEdits({ params }: P) {
  const { lang, id } = await params
  if (!isReady(lang) || !isObjectId(id)) notFound()
  const r = await load(() => getNetwork().cliente.edicoes(id))
  // the relay out of the air is not "no history": the screen says what happened
  if (!r.ok && r.codigo !== 'nao-encontrado' && r.codigo !== 'removido') return <ErrorState codigo={r.codigo} d={dict(lang)} lang={lang} />
  // only a post or a reply here; a topic or a forum reply has its history under /t/
  const h = r.ok && (r.valor.tipo === 'postagem' || r.valor.tipo === 'resposta') ? r.valor : null
  return <EditsScreen h={h} d={dict(lang)} lang={lang} agora={new Date().toISOString()} canAdult={await canSeeAdult()} volta={`/${lang}/p/${id}`} />
}
