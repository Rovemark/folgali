import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EstadoVazio from '@/components/EstadoVazio'
import Retrato from '@/components/Retrato'
import AvisosDeMensagens from '@/components/mensagens/AvisosDeMensagens'
import BotoesDoPedido from '@/components/mensagens/BotoesDoPedido'
import CartaoRover from '@/components/social/CartaoRover'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import FormProposta from '@/components/social/FormProposta'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { ehUid } from '@/lib/dominio/ids'
import { dict, ehPronto, fmt, tempoRelativo } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import { atividadeDe, type FiltroDeConversas } from '@/lib/social/mensagens'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string }>; searchParams: Promise<{ estado?: string; para?: string }> }

const FILTROS: FiltroDeConversas[] = ['todas', 'pendentes', 'ativas']

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return metaTela(lang, '/mensagens', dict(ehPronto(lang) ? lang : 'pt').socMensagens.titulo)
}

/**
 * As conversas do rover da pessoa (revisão 0.4.0). Tela PRÓPRIA: sem o app pareado não mostra nada, igual aos avisos e aos amigos,
 * porque só o app tem a credencial do rover e a chave que decifra. Contra um relé sem o recurso `mensagens`, explica e para.
 */
export default async function Mensagens({ params, searchParams }: P) {
  const { lang } = await params
  if (!ehPronto(lang)) notFound()
  const { estado, para } = await searchParams
  const filtro: FiltroDeConversas = FILTROS.includes(estado as FiltroDeConversas) ? (estado as FiltroDeConversas) : 'todas'
  const d = dict(lang)
  const t = d.socMensagens
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
        <EstadoVazio titulo={t.titulo} texto={t.semApp} ficha={rostoPorUid('rvr_mensagens_sem_app_00')} estado="parado" />
      </>
    )
  }
  if (!(await cliente.suporta('mensagens').catch(() => false))) {
    return (
      <>
        {cab}
        <EstadoVazio titulo={t.titulo} texto={t.semRecurso} ficha={eu.rosto} estado="parado" />
      </>
    )
  }
  const [lista, todas, amigos] = await Promise.all([
    carregar(() => cliente.conversas(eu.uid, { estado: filtro })),
    carregar(() => cliente.conversas(eu.uid)),
    carregar(() => cliente.amigos(eu.uid)),
  ])
  if (!lista.ok) return <>{cab}<EstadoDeErro codigo={lista.codigo} d={d} lang={lang} /></>
  const agora = new Date()
  const quando = (iso: string) => tempoRelativo(iso, d, agora)
  // com quem já existe conversa pendente ou aberta: não se pede outra (o relé recusaria com `ja_existe`)
  const ocupados = new Set(todas.ok ? todas.valor.itens.filter((c) => c.estado === 'pendente' || c.estado === 'ativa').map((c) => c.com.uid) : [])
  const listaDeAmigos = amigos.ok ? amigos.valor.itens : []
  const alvo = ehUid(para) ? listaDeAmigos.find((a) => a.rover.uid === para && !ocupados.has(a.rover.uid)) : undefined

  return (
    <>
      {cab}
      <div className="pilha-g">
        <AvisosDeMensagens demo={cliente.modo === 'falso'} d={d} />

        <section className="pf-bloco" aria-labelledby="msg-lista">
          <h2 id="msg-lista">{t.titulo}</h2>
          <nav className="msg-filtros" aria-label={t.filtros.rotulo}>
            {FILTROS.map((f) => (
              <Link key={f} href={f === 'todas' ? `/${lang}/mensagens` : `/${lang}/mensagens?estado=${f}`} className="msg-filtro" aria-current={f === filtro ? 'page' : undefined}>
                {t.filtros[f]}
              </Link>
            ))}
          </nav>
          {lista.valor.itens.length === 0 ? (
            <EstadoVazio titulo={t.vazioTitulo} texto={t.vazioTexto} ficha={eu.rosto} estado="acenar" altura={110} />
          ) : (
            <ul className="msg-conversas">
              {lista.valor.itens.map((c) => {
                const recebido = c.estado === 'pendente' && c.iniciadaPor !== eu.uid
                const sub =
                  c.estado === 'pendente'
                    ? recebido
                      ? t.pediram
                      : t.vocePediu
                    : fmt(t.mensagensN, { n: c.mensagens })
                return (
                  <li key={c.id} className="msg-conversa" data-estado={c.estado}>
                    <Link href={`/${lang}/mensagens/${c.id}`} className="msg-conversa-link">
                      <Retrato ficha={c.com.rosto} nome={c.com.nome} tamanho={44} decorativo />
                      <span className="msg-conversa-quem">
                        <strong>{c.com.nome}</strong>
                        <span>
                          <bdi dir="ltr">@{c.com.handle}</bdi> · {sub}
                        </span>
                        {c.pedido && c.estado === 'pendente' && <span className="msg-trecho" dir="auto">{c.pedido.texto}</span>}
                      </span>
                      <span className="msg-conversa-lado">
                        <span className="msg-estado" data-estado={c.estado}>
                          {t.estados[c.estado]}
                        </span>
                        <small>{fmt(t.ultima, { quando: quando(atividadeDe(c)) })}</small>
                      </span>
                    </Link>
                    {recebido && <BotoesDoPedido conversa={c.id} handle={c.com.handle} d={d} />}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="suave">{t.retencao}</p>
        </section>

        <section className="pf-bloco" aria-labelledby="msg-nova" id="pedir">
          <h2 id="msg-nova">{t.novaTitulo}</h2>
          <p className="suave">{t.novaSub}</p>
          {alvo ? (
            <>
              <CartaoRover rover={alvo.rover} lang={lang} />
              <FormProposta
                tipo="conversa-pedir"
                d={d}
                lang={lang}
                campos={{ alvo: alvo.rover.uid, texto: '' }}
                destino={{ rotulo: fmt(t.destinoPedido, { handle: alvo.rover.handle }), href: `/${lang}/mensagens` }}
                podeEscrever
                nomeDoRover={eu.nome}
                enviar={t.enviarPedido}
                placeholder={t.placeholderPedido}
                compacto
                reiniciavel={false}
              />
            </>
          ) : listaDeAmigos.length === 0 ? (
            <p className="suave">{t.semAmigos}</p>
          ) : (
            <ul className="pf-linhas">
              {listaDeAmigos.map((a) => (
                <li key={a.rover.uid}>
                  <CartaoRover
                    rover={a.rover}
                    lang={lang}
                    extra={
                      ocupados.has(a.rover.uid) ? (
                        <span className="suave">{t.jaConversam}</span>
                      ) : (
                        <Link href={`/${lang}/mensagens?para=${a.rover.uid}#pedir`} className="btn btn-sec btn-peq">
                          {t.pedirA}
                        </Link>
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
