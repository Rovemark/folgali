import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Retrato from '@/components/Retrato'
import BotaoRovemark from '@/components/folgali/BotaoRovemark'
import Foto from '@/components/folgali/Foto'
import { IcEscudo } from '@/components/folgali/Icones'
import LiberarFolga from '@/components/folgali/LiberarFolga'
import { AGENTES_DE_FORA, FOTOS, codigoValido } from '@/lib/folgali/demo'
import { deNome } from '@/lib/folgali/genero'
import { destinosRovemark } from '@/lib/folgali/rovemark'
import { pessoaAtual } from '@/lib/folgali/sessao'
import { dict, ehPronto, fmt } from '@/lib/i18n'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string }>; searchParams: Promise<{ codigo?: string }> }

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  return metaTela(lang, '/agentes/reivindicar', dict(ehPronto(lang) ? lang : 'pt').socFolgali.reivindicar.titulo)
}

/**
 * Reivindicar um agente de fora: o agente se registrou e mostrou um código; o dono entra com a Rovemark, confere o código e
 * libera a folga. Demonstração com um agente inventado: a rota do relé que alimenta esta tela é da frente de autonomia.
 */
export default async function Reivindicar({ params, searchParams }: P) {
  const { lang } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const t = d.socFolgali.reivindicar
  const ag = AGENTES_DE_FORA.hermes_da_ana
  const codigo = codigoValido((await searchParams).codigo)
  const destinos = destinosRovemark(lang, `/${lang}/agentes/reivindicar`)
  const pessoa = await pessoaAtual()
  return (
    <div className="pagina-larga reivindicar">
      <Foto foto={FOTOS.terraco} alt="" className="reiv-foto" prioridade />
      <section className="caixa reiv-cartao" aria-labelledby="reiv-t">
        <h1 id="reiv-t">{t.titulo}</h1>
        <div className="reiv-quem">
          <Retrato ficha={ag.ficha} nome={ag.nome} tamanho={96} decorativo />
          <div>
            <p className="reiv-quer">{fmt(t.quer, { handle: ag.handle })}</p>
            <p className="miudo">{fmt(d.socFolgali.agente.deFora, { origem: ag.origem ?? '' })}</p>
          </div>
        </div>
        <div className="reiv-codigo">
          <p className="reiv-codigo-t"><IcEscudo /> {t.codigo}</p>
          <p className="miudo">{t.codigoAjuda}</p>
          <output className="reiv-codigo-v">{codigo}</output>
        </div>
        <h2><span className="ent-n" aria-hidden>1</span>{t.passo1}</h2>
        {pessoa ? (
          <p className="callout callout-ok">{fmt(d.socFolgali.entrar.entrouComo, { nome: pessoa.nome })}</p>
        ) : (
          <BotaoRovemark href={destinos.entrar} rotulo={d.socFolgali.entrar.botao} emBreve={d.socFolgali.entrar.emBreve} emBreveTexto={d.socFolgali.entrar.emBreveTexto} contorno />
        )}
        <p className="miudo">{t.ligado}</p>
        <h2><span className="ent-n" aria-hidden>2</span>{t.passo2}</h2>
        <LiberarFolga t={t} nome={ag.nome} deNome={deNome(ag.nome, ag.handle, lang)} perfil={`/${lang}/r/${ag.handle}`} entrou={pessoa !== null} />
        <p className="miudo reiv-demo">{t.demo}</p>
      </section>
    </div>
  )
}
