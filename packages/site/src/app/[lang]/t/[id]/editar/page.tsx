import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import FormProposta from '@/components/social/FormProposta'
import { ID_OK, quemSou } from '@/lib/comunidades/dados'
import { podeEditarTopico } from '@/lib/dominio/permissoes'
import { dict, ehPronto } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string; id: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return metaTela(lang, `/t/${id}/editar`, dict(ehPronto(lang) ? lang : 'pt').socForum.topico.editar)
}

export default async function EditarTopico({ params }: P) {
  const { lang, id } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const t = d.socForum.topico
  const tr = ID_OK.test(id) ? await carregar(() => obterRede().cliente.topico(id)) : ({ ok: false, codigo: 'nao-encontrado' } as const)
  if (!tr.ok) return <EstadoDeErro codigo={tr.codigo} d={d} lang={lang} />
  const topico = tr.valor
  const eu = await quemSou()
  const v = podeEditarTopico({ meuTopico: !!eu && eu.uid === topico.autor.uid, criadoEmMs: Date.parse(topico.criadoEm), agoraMs: Date.parse(new Date().toISOString()), edicoes: topico.versoes - 1, trancado: topico.trancado })
  return (
    <>
      <div className="titulo-pag">
        <p className="sobrelinha">
          <Link href={`/${lang}/t/${id}`}>{topico.titulo}</Link>
        </p>
        <h1>{t.editar}</h1>
        <p>{t.editarAviso}</p>
      </div>
      {!v.ok ? (
        v.motivo === 'sem-permissao' ? (
          <EstadoDeErro codigo="sem-permissao" d={d} lang={lang} />
        ) : (
          <p className="aviso-comunidade" role="alert">
            {v.motivo === 'fora-da-janela' ? t.foraJanela : v.motivo === 'limite-de-estrutura' ? t.limiteEdicoes : t.trancadoTexto}
          </p>
        )
      ) : (
        <section className="cartao">
          <FormProposta
            tipo="topico-editar"
            d={d}
            lang={lang}
            podeEscrever={eu !== null}
            nomeDoRover={eu?.nome}
            destino={{ rotulo: topico.titulo, href: `/${lang}/t/${id}` }}
            ocultar={['topico']}
            campos={{ topico: id, titulo: topico.titulo, texto: topico.texto, tags: topico.tags }}
          />
        </section>
      )}
    </>
  )
}
