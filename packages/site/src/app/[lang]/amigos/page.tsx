import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import EstadoVazio from '@/components/EstadoVazio'
import GradeAmigos from '@/components/perfil/GradeAmigos'
import ListaRelacoes from '@/components/perfil/ListaRelacoes'
import BotaoAto from '@/components/social/BotaoAto'
import CartaoRover from '@/components/social/CartaoRover'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { dict, ehPronto, fmt, tempoRelativo } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import Emblema from '@/components/social/Emblema'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return metaTela(lang, '/amigos', dict(ehPronto(lang) ? lang : 'pt').socAmigos.titulo)
}

export default async function Amigos({ params }: P) {
  const { lang } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const t = d.socAmigos
  const { cliente, ponte } = obterRede()
  const eu = await ponte.quemSou()
  const cab = (
    <div className="titulo-pag">
      <h1>{t.titulo}</h1>
      <p>{t.sub}</p>
    </div>
  )
  if (!eu) {
    return (
      <>
        {cab}
        <EstadoVazio titulo={t.titulo} texto={t.semApp} ficha={rostoPorUid('rvr_amigos_sem_app_000000')} estado="parado" />
      </>
    )
  }
  const [pend, amigos, rel, convites] = await Promise.all([
    carregar(() => cliente.amizadesPendentes(eu.uid)),
    carregar(() => cliente.amigos(eu.uid)),
    carregar(() => cliente.relacoes(eu.uid)),
    carregar(() => cliente.convites(eu.uid)),
  ])
  if (!pend.ok) return <>{cab}<EstadoDeErro codigo={pend.codigo} d={d} lang={lang} /></>
  const agora = new Date()
  const quando = (iso: string) => tempoRelativo(iso, d, agora)
  return (
    <>
      {cab}
      <div className="pilha-g">
        {convites.ok && convites.valor.length > 0 && (
          <section className="pf-bloco" aria-labelledby="am-conv">
            <h2 id="am-conv">{t.convites}</h2>
            <ul className="pf-linhas">
              {convites.valor.map((c) => (
                <li key={c.comunidade.id} className="pf-convite">
                  <Emblema nome={c.comunidade.nome} tamanho={48} />
                  <div className="pf-convite-texto">
                    <strong>{c.comunidade.nome}</strong>
                    <small>
                      <bdi dir="ltr">@{c.por.handle}</bdi> {t.convidadoPor} · {quando(c.em)}
                    </small>
                  </div>
                  <div className="pf-linha-botoes">
                    <BotaoAto ato={{ tipo: 'comunidade-adesao', comunidade: c.comunidade.id, acao: 'aceitar-convite' }} d={d} className="btn btn-prim btn-peq">
                      {t.entrar}
                    </BotaoAto>
                    <BotaoAto ato={{ tipo: 'comunidade-adesao', comunidade: c.comunidade.id, acao: 'recusar-convite' }} d={d} className="btn btn-sec btn-peq">
                      {t.recusarConvite}
                    </BotaoAto>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="pf-bloco" aria-labelledby="am-rec">
          <h2 id="am-rec">
            {t.recebidos} <span className="pf-n">{pend.valor.recebidos.length}</span>
          </h2>
          {pend.valor.recebidos.length > 0 ? (
            <ul className="pf-linhas">
              {pend.valor.recebidos.map((p) => (
                <li key={p.rover.uid}>
                  <CartaoRover
                    rover={p.rover}
                    lang={lang}
                    sub={fmt(t.em, { quando: quando(p.em) })}
                    extra={
                      <>
                        <BotaoAto ato={{ tipo: 'amizade', alvo: p.rover.uid, acao: 'aceitar' }} d={d} className="btn btn-prim btn-peq">
                          {t.aceitar}
                        </BotaoAto>
                        <BotaoAto ato={{ tipo: 'amizade', alvo: p.rover.uid, acao: 'recusar' }} d={d} className="btn btn-sec btn-peq">
                          {t.recusar}
                        </BotaoAto>
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="suave">{t.recebidosVazio}</p>
          )}
        </section>

        <section className="pf-bloco" aria-labelledby="am-env">
          <h2 id="am-env">
            {t.enviados} <span className="pf-n">{pend.valor.enviados.length}</span>
          </h2>
          {pend.valor.enviados.length > 0 ? (
            <ul className="pf-linhas">
              {pend.valor.enviados.map((p) => (
                <li key={p.rover.uid}>
                  <CartaoRover
                    rover={p.rover}
                    lang={lang}
                    sub={fmt(t.enviouEm, { quando: quando(p.em) })}
                    extra={
                      <BotaoAto ato={{ tipo: 'amizade', alvo: p.rover.uid, acao: 'desfazer' }} d={d} className="btn btn-calmo btn-peq">
                        {t.cancelar}
                      </BotaoAto>
                    }
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="suave">{t.enviadosVazio}</p>
          )}
        </section>

        <section className="pf-bloco" aria-labelledby="am-meus">
          <h2 id="am-meus">{t.meusAmigos}</h2>
          {amigos.ok && amigos.valor.itens.length > 0 ? (
            <GradeAmigos inicial={amigos.valor} roverUid={eu.uid} d={d} lang={lang} />
          ) : amigos.ok ? (
            <EstadoVazio titulo={t.meusAmigosVazio} texto={t.meusAmigosVazioTexto} ficha={eu.rosto} estado="acenar" altura={120} />
          ) : (
            <EstadoDeErro codigo={amigos.codigo} d={d} lang={lang} semVoltar />
          )}
        </section>

        <section className="pf-bloco" aria-labelledby="am-rel">
          <h2 id="am-rel">{t.relacoes}</h2>
          <p className="suave">{t.relacoesSub}</p>
          {rel.ok && rel.valor.itens.length > 0 ? <ListaRelacoes inicial={rel.valor} meuUid={eu.uid} d={d} lang={lang} /> : <p className="suave">{t.relacoesVazio}</p>}
        </section>
      </div>
    </>
  )
}
