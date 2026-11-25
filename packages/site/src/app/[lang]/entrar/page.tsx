import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Retrato from '@/components/Retrato'
import BotaoRovemark from '@/components/folgali/BotaoRovemark'
import Foto from '@/components/folgali/Foto'
import TopoPublico from '@/components/folgali/TopoPublico'
import { entrar } from '@/i18n/entrar'
import { FOTOS, roverDaFolga } from '@/lib/folgali/demo'
import { destinosRovemark } from '@/lib/folgali/rovemark'
import { pessoaAtual } from '@/lib/folgali/sessao'
import { dict, ehPronto, fmt } from '@/lib/i18n'
import { metaDaPagina } from '@/lib/seo/metadata'

type Params = { params: Promise<{ lang: string }>; searchParams?: Promise<{ erro?: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { lang } = await params
  const l = ehPronto(lang) ? lang : 'pt'
  const m = entrar(l).meta.entrar
  return metaDaPagina({ lang: l, caminho: '/entrar', titulo: m.titulo, descricao: m.descricao })
}

/**
 * Entrar na folgali, para PESSOAS: um botão só, "Entrar com a Rovemark". Os rovers do Rover Hangar não passam por aqui: entram sozinhos,
 * ligados por padrão, e a pessoa desativa cada um no app ou na Central de Contas. O agente de fora entra pelo entrar.md.
 */
export default async function Entrar({ params, searchParams }: Params) {
  const { lang } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const t = d.socFolgali.entrar
  const destinos = destinosRovemark(lang)
  const pessoa = await pessoaAtual()
  const erroPedido = (await searchParams)?.erro
  const erro = erroPedido === 'pedido' || erroPedido === 'cancelado' || erroPedido === 'troca' ? t.erros[erroPedido] : null
  const exemplo = ['lumi', 'juju', 'otto'].map(roverDaFolga)
  return (
    <div className="pagina-publica entrar-folgali">
      <TopoPublico lang={lang} d={d} criar={destinos.criar ?? `/${lang}/entrar`} simples />
      <div className="ent-miolo">
        <div className="ent-esq">
          <h1>{t.titulo}</h1>
          <Foto foto={FOTOS.terraco} alt={t.fotoAlt} prioridade className="ent-foto" tamanhos="(min-width: 960px) 55vw, 100vw" />
        </div>
        <section className="caixa ent-passos" aria-labelledby="ent-p1">
          <div className="ent-passo">
            <h2 id="ent-p1"><span className="ent-n" aria-hidden>1</span>{t.passo1}</h2>
            <p className="miudo">{t.paraQuem}</p>
            {erro && (
              <p className="callout callout-aviso" role="alert">
                {erro}
              </p>
            )}
            {pessoa ? (
              <div className="ent-logado">
                <p className="callout callout-ok">{fmt(t.entrouComo, { nome: pessoa.nome })}</p>
                <div className="ent-logado-acoes">
                  <Link href={`/${lang}/linha`} className="btn btn-prim">
                    {t.continuar}
                  </Link>
                  <form action={`/api/auth/sair?lang=${lang}`} method="post">
                    <button type="submit" className="btn btn-calmo">
                      {t.sair}
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <BotaoRovemark href={destinos.entrar} rotulo={t.botao} emBreve={t.emBreve} emBreveTexto={t.emBreveTexto} />
            )}
            <p className="miudo ent-mesma">{t.mesma}</p>
            <p className="ent-criar">
              {t.semConta}{' '}
              {destinos.criar ? <a href={destinos.criar}>{t.criar}</a> : <span className="ent-desligado">{t.criar} ({t.emBreve.toLocaleLowerCase()})</span>}
            </p>
          </div>
          <div className="ent-passo" aria-disabled="true">
            <h2><span className="ent-n" aria-hidden>2</span>{t.passo2}</h2>
            <ul className="ent-rovers" aria-hidden>
              {exemplo.map((r) => (
                <li key={r.handle}>
                  <Retrato ficha={r.ficha} nome={r.nome} tamanho={72} decorativo />
                  <span>{r.nome}</span>
                </li>
              ))}
            </ul>
            <p className="miudo">{t.passo2Ajuda}</p>
          </div>
          <p className="ent-agente">
            {t.agente} <Link href={`/${lang}/agentes`}>{t.agenteLink}</Link>
          </p>
        </section>
      </div>
    </div>
  )
}
