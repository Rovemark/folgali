import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import CabecalhoComunidade from '@/components/comunidades/CabecalhoComunidade'
import CartaoRover from '@/components/social/CartaoRover'
import TextoSocial from '@/components/social/TextoSocial'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import { ehCompleta, ID_OK, lerComunidade } from '@/lib/comunidades/dados'
import { dataCurta, dict, ehPronto, plural } from '@/lib/i18n'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string; id: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return metaTela(lang, `/comunidades/${id}/sobre`, dict(ehPronto(lang) ? lang : 'pt').socComunidades.pagina.abas.sobre)
}

export default async function Sobre({ params }: P) {
  const { lang, id } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const t = d.socComunidades.pagina
  const c = ID_OK.test(id) ? await lerComunidade(id) : ({ ok: false, codigo: 'nao-encontrado' } as const)
  if (!c.ok) return <EstadoDeErro codigo={c.codigo} d={d} lang={lang} />
  const com = c.valor
  if (!ehCompleta(com)) return <CabecalhoComunidade c={com} d={d} lang={lang} />
  return (
    <>
      <CabecalhoComunidade c={com} d={d} lang={lang} aba="sobre" />
      <div className="pilha-g">
        <section className="cartao com-regras" aria-labelledby="regras-t">
          <h2 id="regras-t">{t.regras}</h2>
          {com.regras ? <TextoSocial texto={com.regras} lang={lang} saindo={d.socComum.proposta.linkSaida} className="com-regras-texto" /> : <p className="suave">{t.regrasVazio}</p>}
        </section>
        <section className="cartao" aria-labelledby="eq-t">
          <h2 id="eq-t">{t.equipe}</h2>
          <CartaoRover rover={com.dono} lang={lang} extra={<span className="pilula" data-tom="acao">{d.socComum.papeis.dono}</span>} />
          <p className="miudo">{plural(t.moderadores, com.moderadores)}</p>
        </section>
        <section className="cartao" aria-labelledby="det-t">
          <h2 id="det-t" className="so-leitor">
            {t.abas.sobre}
          </h2>
          <dl className="detalhes">
            <div>
              <dt>{t.tema}</dt>
              <dd>#{com.tema}</dd>
            </div>
            <div>
              <dt>{t.acesso}</dt>
              <dd>
                {d.socComum.acessos[com.acesso].nome}. <span className="suave">{d.socComum.acessos[com.acesso].texto}</span>
              </dd>
            </div>
            <div>
              <dt>{t.criadaRotulo}</dt>
              <dd>{dataCurta(com.criadaEm, lang)}</dd>
            </div>
            {com.categorias.length > 0 && (
              <div>
                <dt>{d.socComum.campos.categorias}</dt>
                <dd>{com.categorias.join(', ')}</dd>
              </div>
            )}
          </dl>
        </section>
      </div>
    </>
  )
}
