import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Postagem from '@/components/Postagem'
import { IcSeta } from '@/components/Icones'
import PostagemAberta from '@/components/folgali/PostagemAberta'
import { ehIdObjeto } from '@/lib/dominio/ids'
import { ehPostagemDaFolga, postagemDaFolga } from '@/lib/folgali/demo'
import { dict, ehPronto } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { ErroRede } from '@/lib/tipos'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string; id: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return metaTela(lang, `/p/${id}`, dict(ehPronto(lang) ? lang : 'pt').post.conversa)
}

export default async function PaginaPostagem({ params }: P) {
  const { lang, id } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const { cliente, ponte } = obterRede()
  // As postagens da folga com foto ainda são da demonstração (o protocolo não tem foto de postagem pública com comentário em fio).
  if (ehPostagemDaFolga(id) && cliente.modo === 'falso') {
    const pf = postagemDaFolga(id, new Date())
    if (!pf) notFound()
    return <PostagemAberta p={pf} d={d} lang={lang} agora={new Date()} />
  }
  if (!ehIdObjeto(id)) notFound()
  let detalhe
  try {
    detalhe = await cliente.obterObjeto(id)
  } catch (e) {
    if (e instanceof ErroRede && (e.codigo === 'nao-encontrado' || e.codigo === 'invalido')) notFound()
    throw e
  }
  const eu = await ponte.quemSou()
  const agora = new Date().toISOString()
  const { postagem, pai, respostas } = detalhe
  return (
    <>
      <p style={{ marginBottom: 6 }}>
        <Link href={`/${lang}/linha`} className="btn btn-calmo btn-peq">
          <IcSeta width={20} height={20} />
          {d.comum.voltar}
        </Link>
      </p>
      <h1 className="so-leitor">{d.post.conversa}</h1>
      <div className="fio-lista">
        {pai && <Postagem p={pai} d={d} lang={lang} agora={agora} meuUid={eu?.uid} />}
        <Postagem p={postagem} d={d} lang={lang} agora={agora} meuUid={eu?.uid} solta />
      </div>
      <h2 className="sobrelinha" style={{ margin: '22px 0 0' }}>
        {d.post.respostasTitulo}
      </h2>
      {respostas.length > 0 ? (
        <div className="fio-lista" role="feed">
          {respostas.map((r, i) => (
            <Postagem key={r.id} p={r} d={d} lang={lang} agora={agora} meuUid={eu?.uid} i={i} solta />
          ))}
        </div>
      ) : (
        <p style={{ color: 'var(--tinta-3)', marginTop: 10 }}>{d.post.semRespostas}</p>
      )}
      <p className="so-voce" style={{ marginTop: 22 }}>
        {d.post.naoResponde}
      </p>
    </>
  )
}
