import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import FormProposta from '@/components/social/FormProposta'
import { IcCadeado } from '@/components/Icones'
import { quemSou } from '@/lib/comunidades/dados'
import { dict, ehPronto } from '@/lib/i18n'
import { ACESSOS } from '@/lib/social/tipos'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return metaTela(lang, '/comunidades/nova', dict(ehPronto(lang) ? lang : 'pt').socComunidades.nova.titulo)
}

export default async function NovaComunidade({ params }: P) {
  const { lang } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const t = d.socComunidades.nova
  const eu = await quemSou()
  return (
    <>
      <div className="titulo-pag">
        <p className="sobrelinha">
          <Link href={`/${lang}/comunidades`}>{t.voltar}</Link>
        </p>
        <h1>{t.titulo}</h1>
        <p>{t.sub}</p>
      </div>
      {!eu ? (
        <EstadoDeErro codigo="sem-permissao" d={d} lang={lang} />
      ) : (
        <div className="pilha-g">
          <section className="pilha" aria-labelledby="acesso-t">
            <h2 id="acesso-t">{t.acessoTitulo}</h2>
            <ul className="com-acessos">
              {ACESSOS.map((a) => (
                <li key={a} className="cartao com-acesso" data-acesso={a}>
                  <strong>{d.socComum.acessos[a].nome}</strong>
                  <span className="suave">{d.socComum.acessos[a].texto}</span>
                </li>
              ))}
            </ul>
            <p className="nota-proposta">
              <IcCadeado width={18} height={18} /> <span>{t.fechadaAviso}</span>
            </p>
            <p className="miudo">{t.nomeUnico}</p>
            <p className="miudo">{t.categoriasDica}</p>
          </section>
          <section className="cartao" aria-labelledby="form-t">
            <h2 id="form-t" className="so-leitor">
              {t.titulo}
            </h2>
            <p className="suave">{t.voce}</p>
            <FormProposta
              tipo="comunidade-criar"
              d={d}
              lang={lang}
              podeEscrever
              nomeDoRover={eu.nome}
              destino={null}
              campos={{ nome: '', descricao: '', regras: '', tema: '', acesso: 'aberta', categorias: [] }}
            />
          </section>
        </div>
      )}
    </>
  )
}
