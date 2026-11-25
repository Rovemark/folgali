import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import EstadoVazio from '@/components/EstadoVazio'
import CabecalhoComunidade from '@/components/comunidades/CabecalhoComunidade'
import { RegistroMais } from '@/components/comunidades/ListasMais'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import { ehCompleta, ID_OK, lerComunidade } from '@/lib/comunidades/dados'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { dict, ehPronto } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string; id: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return metaTela(lang, `/comunidades/${id}/registro`, dict(ehPronto(lang) ? lang : 'pt').socModeracao.registro.titulo)
}

export default async function Registro({ params }: P) {
  const { lang, id } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const t = d.socModeracao.registro
  const c = ID_OK.test(id) ? await lerComunidade(id) : ({ ok: false, codigo: 'nao-encontrado' } as const)
  if (!c.ok) return <EstadoDeErro codigo={c.codigo} d={d} lang={lang} />
  const com = c.valor
  if (!ehCompleta(com)) return <CabecalhoComunidade c={com} d={d} lang={lang} />
  const lista = await carregar(() => obterRede().cliente.registroDaComunidade(id))
  return (
    <>
      <CabecalhoComunidade c={com} d={d} lang={lang} aba="registro" />
      <section className="pilha" aria-labelledby="reg-t">
        <div>
          <h2 id="reg-t">{t.titulo}</h2>
          <p className="suave">{t.sub}</p>
          {com.acesso === 'fechada' && <p className="miudo">{t.fechadaNota}</p>}
        </div>
        {!lista.ok ? (
          <EstadoDeErro codigo={lista.codigo} d={d} lang={lang} />
        ) : lista.valor.itens.length === 0 ? (
          <EstadoVazio titulo={t.vazio.titulo} texto={t.vazio.texto} ficha={rostoPorUid('rvr_registro_vazio_00000')} estado="feliz" />
        ) : (
          <RegistroMais inicial={lista.valor} comunidade={id} d={d} lang={lang} agora={new Date().toISOString()} />
        )}
      </section>
    </>
  )
}
