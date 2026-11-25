import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import FormDenuncia from '@/components/FormDenuncia'
import FormDenunciaSocial from '@/components/perfil/FormDenunciaSocial'
import { ehIdObjeto } from '@/lib/dominio/ids'
import { HANDLE_RE } from '@/lib/dominio/handle'
import { dict, ehPronto, fmt } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { ErroRede } from '@/lib/tipos'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<{ tipo?: string; de?: string; volta?: string }> }

const TIPOS = ['recado', 'depoimento', 'entrega', 'topico', 'resposta', 'atualizacao', 'comunidade', 'pagina', 'perfil'] as const
type Tipo = (typeof TIPOS)[number]

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return metaTela(lang, `/denunciar/${id}`, dict(ehPronto(lang) ? lang : 'pt').denuncia.titulo)
}

/** Só caminho interno da própria rede: nada de endereço de fora vindo da consulta. */
const voltarSeguro = (lang: string, v: string | undefined, padrao: string) => (v && /^\/[a-z0-9/_-]{1,160}$/i.test(v) && !v.startsWith('//') ? `/${lang}${v}` : padrao)

export default async function Denunciar({ params, searchParams }: P) {
  const { lang, id } = await params
  if (!ehPronto(lang) || !ehIdObjeto(id)) notFound()
  const sp = await searchParams
  const d = dict(lang)
  const { cliente, ponte } = obterRede()
  let alvo
  try {
    alvo = (await cliente.obterObjeto(id)).postagem
  } catch (e) {
    if (!(e instanceof ErroRede) || (e.codigo !== 'nao-encontrado' && e.codigo !== 'invalido')) throw e
  }
  if (alvo) {
    const trecho = alvo.removida ? d.post.apagada : alvo.texto.length > 160 ? `${alvo.texto.slice(0, 157)}...` : alvo.texto
    return (
      <>
        <div className="titulo-pag">
          <h1>{d.denuncia.titulo}</h1>
        </div>
        <FormDenuncia alvo={alvo.id} trecho={trecho} autor={`${alvo.autor.nome} @${alvo.autor.handle}`} d={d} voltar={`/${lang}/p/${alvo.id}`} />
      </>
    )
  }
  // Não é uma postagem: é um objeto da rede social. O relé responde igual exista o alvo ou não, então a
  // tela não confere nada além da forma; o `tipo` e o `de` só servem para dizer do que se trata.
  const tipo: Tipo | 'outro' = (TIPOS as readonly string[]).includes(sp.tipo ?? '') ? (sp.tipo as Tipo) : 'outro'
  const de = sp.de && HANDLE_RE.test(sp.de) ? sp.de : ''
  const descricao = fmt(d.socPerfil.denunciar.tipos[tipo], { de })
  const eu = await ponte.quemSou()
  return (
    <>
      <div className="titulo-pag">
        <h1>{d.socPerfil.denunciar.titulo}</h1>
      </div>
      <FormDenunciaSocial alvo={id} descricao={descricao} d={d} voltar={voltarSeguro(lang, sp.volta, `/${lang}`)} podeAgir={eu !== null} />
    </>
  )
}
