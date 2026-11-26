import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import ReportForm from '@/components/ReportForm'
import SocialReportForm from '@/components/profile/SocialReportForm'
import { isObjectId } from '@/lib/domain/ids'
import { HANDLE_RE } from '@/lib/domain/handle'
import { dict, isReady, fmt } from '@/lib/i18n'
import { getNetwork } from '@/lib/get-network'
import { NetworkError } from '@/lib/types'
import { screenMeta } from '@/lib/seo/meta-screens'
import { attachTexts } from '@/i18n/attach'
import { photoTexts } from '@/i18n/photo'
import { videoTexts } from '@/i18n/video'

type P = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<{ tipo?: string; de?: string; volta?: string }> }

const TYPES = ['recado', 'depoimento', 'entrega', 'topico', 'resposta', 'atualizacao', 'comunidade', 'pagina', 'perfil'] as const
type Type = (typeof TYPES)[number]

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return screenMeta(lang, `/denunciar/${id}`, dict(isReady(lang) ? lang : 'pt').denuncia.titulo)
}

/** Internal paths of the network itself only: no outside address coming from the query. */
const safeBack = (lang: string, v: string | undefined, defaultValue: string) => (v && /^\/[a-z0-9/_-]{1,160}$/i.test(v) && !v.startsWith('//') ? `/${lang}${v}` : defaultValue)

export default async function Report({ params, searchParams }: P) {
  const { lang, id } = await params
  if (!isReady(lang) || !isObjectId(id)) notFound()
  const sp = await searchParams
  const d = dict(lang)
  const { cliente: client, ponte: bridge } = getNetwork()
  // a profile photo or cover (`imagem`): the visitor report, with no account, like a post's (decision of 25/11/2026)
  if (sp.tipo === 'foto') {
    const from = sp.de && HANDLE_RE.test(sp.de) ? sp.de : ''
    return (
      <>
        <div className="page-title">
          <h1>{d.denuncia.titulo}</h1>
        </div>
        <ReportForm alvo={id} targetLabel={photoTexts(lang).reportedPhoto} trecho={fmt(photoTexts(lang).reportTarget, { de: from })} d={d} voltar={safeBack(lang, sp.volta, `/${lang}`)} lang={lang} />
      </>
    )
  }
  // an image attached to a post, a reply, a forum topic or a forum reply (0.11.0, `midia-livre`): the same visitor report, on the
  // id of the `imagem` object; the page says it is an attachment and whose, never a profile photo
  if (sp.tipo === 'imagem') {
    const from = sp.de && HANDLE_RE.test(sp.de) ? sp.de : ''
    const t = attachTexts(lang).report
    return (
      <>
        <div className="page-title">
          <h1>{d.denuncia.titulo}</h1>
        </div>
        <ReportForm alvo={id} targetLabel={t.reportedImage} trecho={from ? fmt(t.target, { de: from }) : t.targetPlain} d={d} voltar={safeBack(lang, sp.volta, `/${lang}`)} lang={lang} />
      </>
    )
  }
  // the video of a post, a reply, a forum topic or a forum reply (0.11.0 part 3, `video`): the same visitor report, on the id of the
  // `video` object; the moderation takes the file down by that id
  if (sp.tipo === 'video') {
    const from = sp.de && HANDLE_RE.test(sp.de) ? sp.de : ''
    const t = videoTexts(lang).report
    return (
      <>
        <div className="page-title">
          <h1>{d.denuncia.titulo}</h1>
        </div>
        <ReportForm alvo={id} targetLabel={t.reportedVideo} trecho={from ? fmt(t.target, { de: from }) : t.targetPlain} d={d} voltar={safeBack(lang, sp.volta, `/${lang}`)} lang={lang} />
      </>
    )
  }
  let target
  try {
    target = (await client.getObject(id)).postagem
  } catch (e) {
    if (!(e instanceof NetworkError) || (e.codigo !== 'nao-encontrado' && e.codigo !== 'invalido')) throw e
  }
  if (target) {
    const excerpt = target.removida ? d.post.apagada : target.texto.length > 160 ? `${target.texto.slice(0, 157)}...` : target.texto
    return (
      <>
        <div className="page-title">
          <h1>{d.denuncia.titulo}</h1>
        </div>
        <ReportForm alvo={target.id} trecho={excerpt} autor={`${target.autor.nome} @${target.autor.handle}`} d={d} voltar={`/${lang}/p/${target.id}`} lang={lang} />
      </>
    )
  }
  // Not a post: it is an object of the social network. The relay answers the same whether the target exists or not, so the
  // screen checks nothing beyond the shape; the `tipo` and the `de` only say what it is about.
  const type: Type | 'outro' = (TYPES as readonly string[]).includes(sp.tipo ?? '') ? (sp.tipo as Type) : 'outro'
  const from = sp.de && HANDLE_RE.test(sp.de) ? sp.de : ''
  const description = fmt(d.socPerfil.denunciar.tipos[type], { de: from })
  const me = await bridge.whoAmI()
  return (
    <>
      <div className="page-title">
        <h1>{d.socPerfil.denunciar.titulo}</h1>
      </div>
      <SocialReportForm alvo={id} descricao={description} d={d} voltar={safeBack(lang, sp.volta, `/${lang}`)} canAct={me !== null} />
    </>
  )
}
