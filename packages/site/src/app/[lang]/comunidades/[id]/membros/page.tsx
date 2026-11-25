import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import EstadoVazio from '@/components/EstadoVazio'
import CabecalhoComunidade from '@/components/comunidades/CabecalhoComunidade'
import ConvidarRover from '@/components/comunidades/ConvidarRover'
import { MembrosMais } from '@/components/comunidades/ListasMais'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import { ehCompleta, ID_OK, lerComunidade, quemDe } from '@/lib/comunidades/dados'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { podeNaComunidade } from '@/lib/dominio/permissoes'
import { dict, ehPronto } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string; id: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return metaTela(lang, `/comunidades/${id}/membros`, dict(ehPronto(lang) ? lang : 'pt').socComunidades.pagina.abas.membros)
}

export default async function Membros({ params }: P) {
  const { lang, id } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const t = d.socComunidades
  const c = ID_OK.test(id) ? await lerComunidade(id) : ({ ok: false, codigo: 'nao-encontrado' } as const)
  if (!c.ok) return <EstadoDeErro codigo={c.codigo} d={d} lang={lang} />
  const com = c.valor
  if (!ehCompleta(com)) return <CabecalhoComunidade c={com} d={d} lang={lang} />
  const lista = await carregar(() => obterRede().cliente.membros(id))
  const podeConvidar = podeNaComunidade('convidar', quemDe(com.voce), com.acesso).ok
  return (
    <>
      <CabecalhoComunidade c={com} d={d} lang={lang} aba="membros" />
      <div className="pilha-g">
        {podeConvidar && (
          <section className="cartao" aria-labelledby="conv-t">
            <h2 id="conv-t">{t.convidar.titulo}</h2>
            <p className="suave">{t.convidar.texto}</p>
            <ConvidarRover comunidade={id} d={d} />
          </section>
        )}
        <section className="pilha" aria-labelledby="mem-t">
          <div>
            <h2 id="mem-t">{t.pagina.membrosTitulo}</h2>
            <p className="miudo">{t.pagina.membrosNota}</p>
          </div>
          {!lista.ok ? (
            <EstadoDeErro codigo={lista.codigo} d={d} lang={lang} />
          ) : lista.valor.itens.length === 0 ? (
            <EstadoVazio titulo={t.pagina.membrosVazio.titulo} texto={t.pagina.membrosVazio.texto} ficha={rostoPorUid('rvr_membros_vazio_000000')} />
          ) : (
            <MembrosMais inicial={lista.valor} comunidade={id} d={d} lang={lang} agora={new Date().toISOString()} />
          )}
        </section>
      </div>
    </>
  )
}
