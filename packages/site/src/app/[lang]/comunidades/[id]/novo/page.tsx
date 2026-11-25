import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { IcCadeado } from '@/components/Icones'
import CabecalhoComunidade from '@/components/comunidades/CabecalhoComunidade'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import FormProposta from '@/components/social/FormProposta'
import { ehCompleta, ID_OK, lerComunidade, quemDe, quemSou } from '@/lib/comunidades/dados'
import { podeNaComunidade } from '@/lib/dominio/permissoes'
import { faltaDeCarencia, minutosParaMostrar } from '@/lib/dominio/prazos'
import { dict, ehPronto, fmt, plural } from '@/lib/i18n'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<{ categoria?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return metaTela(lang, `/comunidades/${id}/novo`, dict(ehPronto(lang) ? lang : 'pt').socForum.lista.novo)
}

export default async function NovoTopico({ params, searchParams }: P) {
  const { lang, id } = await params
  if (!ehPronto(lang)) notFound()
  const { categoria } = await searchParams
  const d = dict(lang)
  const t = d.socComunidades.novoTopico
  const c = ID_OK.test(id) ? await lerComunidade(id) : ({ ok: false, codigo: 'nao-encontrado' } as const)
  if (!c.ok) return <EstadoDeErro codigo={c.codigo} d={d} lang={lang} />
  const com = c.valor
  if (!ehCompleta(com)) return <CabecalhoComunidade c={com} d={d} lang={lang} />
  const eu = await quemSou()
  const agora = new Date()
  const pode = podeNaComunidade('postar-topico', quemDe(com.voce, agora), com.acesso)
  // carência de membro (relé 0.3.1 manda `membroDesde`): em vez de deixar o relé recusar depois, a tela diz quantos minutos faltam
  const faltam = !pode.ok && pode.motivo === 'conta-nova' ? faltaDeCarencia(com.voce?.membroDesde, 'topico', agora) : 0
  return (
    <>
      <CabecalhoComunidade c={com} d={d} lang={lang} aba="conversas" />
      <div className="titulo-pag">
        <p className="sobrelinha">
          <Link href={`/${lang}/comunidades/${id}`}>{t.voltar}</Link>
        </p>
        <h2 style={{ fontSize: 28 }}>{fmt(t.titulo, { nome: com.nome })}</h2>
      </div>
      {!pode.ok && pode.motivo !== 'conta-nova' ? (
        <EstadoDeErro codigo={pode.motivo === 'banido' ? 'banido' : pode.motivo === 'nao-e-membro' ? 'nao-e-membro' : 'sem-permissao'} d={d} lang={lang} semVoltar />
      ) : (
        <section className="cartao">
          {faltam > 0 && (
            <p className="aviso-comunidade" role="note">
              <IcCadeado />
              <span>{plural(t.carenciaFalta, minutosParaMostrar(faltam))}</span>
            </p>
          )}
          <FormProposta
            tipo="topico"
            d={d}
            lang={lang}
            podeEscrever={eu !== null}
            nomeDoRover={eu?.nome}
            destino={{ rotulo: com.nome, href: `/${lang}/comunidades/${id}` }}
            ocultar={['comunidade']}
            escolhas={com.categorias.length > 0 ? { categoria: com.categorias } : undefined}
            escolhaVazia={t.semCategoria}
            campos={{ comunidade: id, categoria: categoria && com.categorias.includes(categoria) ? categoria : null, titulo: '', texto: '', tags: [], enquete: [], enqueteDias: '3' }}
          />
        </section>
      )}
    </>
  )
}
