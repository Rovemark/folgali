import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EstadoVazio from '@/components/EstadoVazio'
import AcaoComMotivo from '@/components/comunidades/AcaoComMotivo'
import CabecalhoComunidade from '@/components/comunidades/CabecalhoComunidade'
import MembrosModeracao from '@/components/comunidades/MembrosModeracao'
import Retrato from '@/components/Retrato'
import { IcMod } from '@/components/social/IconesSociais'
import BotaoAto from '@/components/social/BotaoAto'
import CartaoRover from '@/components/social/CartaoRover'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import { ehCompleta, ehEquipe, ID_OK, lerComunidade, quemSou } from '@/lib/comunidades/dados'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { dict, ehPronto, fmt, plural, tempoRelativo, type Pronto } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import type { MotivoDenunciaSocial } from '@/lib/social/tipos'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<{ aba?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return metaTela(lang, `/comunidades/${id}/moderacao`, dict(ehPronto(lang) ? lang : 'pt').socModeracao.titulo)
}

const ABAS = ['fila', 'pedidos', 'convites', 'membros', 'banidos', 'apelacoes'] as const
type Aba = (typeof ABAS)[number]

export default async function Moderacao({ params, searchParams }: P) {
  const { lang, id } = await params
  if (!ehPronto(lang)) notFound()
  const q = await searchParams
  const d = dict(lang)
  const t = d.socModeracao
  const c = ID_OK.test(id) ? await lerComunidade(id) : ({ ok: false, codigo: 'nao-encontrado' } as const)
  if (!c.ok) return <EstadoDeErro codigo={c.codigo} d={d} lang={lang} />
  const com = c.valor
  if (!ehCompleta(com)) return <CabecalhoComunidade c={com} d={d} lang={lang} />
  if (!ehEquipe(com.voce)) {
    return (
      <>
        <CabecalhoComunidade c={com} d={d} lang={lang} aba="moderacao" />
        <EstadoVazio titulo={t.soEquipe.titulo} texto={t.soEquipe.texto} ficha={rostoPorUid('rvr_moderacao_so_equipe')} estado="parado" erro />
      </>
    )
  }
  const dono = com.voce?.papel === 'dono'
  const abasVisiveis = ABAS.filter((a) => a !== 'apelacoes' || dono)
  const aba: Aba = (abasVisiveis as readonly string[]).includes(q.aba ?? '') ? (q.aba as Aba) : 'fila'
  const eu = await quemSou()
  const { cliente } = obterRede()
  const agora = new Date().toISOString()
  const hoje = new Date(agora)
  const base = `/${lang}/comunidades/${id}/moderacao`

  // só carrega o que a aba mostra, mas conta o que dá para contar de graça (selo nas abas)
  const [fila, pedidos, convites, podeDispensar] = await Promise.all([
    carregar(() => cliente.filaDeModeracao(id)),
    carregar(() => cliente.pedidosDeEntrada(id)),
    carregar(() => cliente.convitesDaComunidade(id)),
    // 0.3.1 (`denuncia-dispensar`): relé 0.3 não tem a ação, e então o botão nem aparece
    cliente.suporta('denuncia-dispensar').catch(() => false),
  ])
  const nFila = fila.ok ? fila.valor.denuncias.length : 0
  const nPedidos = pedidos.ok ? pedidos.valor.itens.length : 0
  const nApel = fila.ok ? fila.valor.apelacoes.length : 0
  const contagem: Partial<Record<Aba, number>> = { fila: nFila, pedidos: nPedidos, convites: convites.ok ? convites.valor.itens.length : 0, apelacoes: nApel }

  return (
    <>
      <CabecalhoComunidade c={com} d={d} lang={lang} aba="moderacao" />
      <div className="pilha-g">
        <div>
          <h2 className="mod-titulo">
            <IcMod /> {t.titulo}
          </h2>
          <p className="suave">{fmt(t.sub, { nome: com.nome })}</p>
        </div>
        <nav className="sub-nav quebra" aria-label={t.abasRotulo}>
          {abasVisiveis.map((a) => (
            <Link key={a} href={`${base}?aba=${a}`} aria-current={aba === a ? 'page' : undefined}>
              {t.abas[a]}
              {(contagem[a] ?? 0) > 0 && <span className="num">{contagem[a]}</span>}
            </Link>
          ))}
        </nav>

        {aba === 'fila' && (
          <section className="pilha" aria-labelledby="fila-t">
            <h3 id="fila-t" className="so-leitor">
              {t.abas.fila}
            </h3>
            <p className="nota-proposta">
              <IcMod width={18} height={18} /> <span>{t.fila.intro}</span>
            </p>
            {!fila.ok ? (
              <EstadoDeErro codigo={fila.codigo} d={d} lang={lang} />
            ) : fila.valor.denuncias.length === 0 ? (
              <EstadoVazio titulo={t.fila.vazio.titulo} texto={t.fila.vazio.texto} ficha={rostoPorUid('rvr_fila_vazia_0000000')} estado="feliz" />
            ) : (
              <ul className="pilha">
                {fila.valor.denuncias.map((x) => (
                  <li key={x.alvo} className="cartao fila-item">
                    <div className="linha-flex">
                      <span className="pilula" data-tom="aviso">
                        {x.alvoTipo === 'topico' ? t.fila.alvoTopico : t.fila.alvoResposta}
                      </span>
                      <span className="pilula">{plural(t.fila.total, x.total)}</span>
                      <span className="pilula" title={t.fila.pesoAjuda}>
                        {fmt(t.fila.peso, { n: x.peso })}
                      </span>
                    </div>
                    <ul className="linha-flex fila-motivos" aria-label={d.socComum.campos.tipo}>
                      {Object.entries(x.motivos).map(([m, n]) => (
                        <li key={m} className="etiqueta">
                          {d.socComum.motivosDenuncia[m as MotivoDenunciaSocial]} · {n}
                        </li>
                      ))}
                    </ul>
                    {x.previa && (
                      <blockquote className="alvo-denuncia fila-previa">
                        <span className="linha-flex">
                          <Retrato ficha={x.previa.autor.rosto} nome={x.previa.autor.nome} tamanho={32} decorativo />
                          <strong>{x.previa.autor.nome}</strong>
                          {x.previa.topico && <span className="miudo">{fmt(t.fila.emTopico, { titulo: x.previa.topico })}</span>}
                        </span>
                        <q>{x.previa.trecho}</q>
                      </blockquote>
                    )}
                    <p className="miudo">
                      {fmt(t.fila.primeira, { quando: tempoRelativo(x.primeiraEm, d, hoje) })} · {fmt(t.fila.ultima, { quando: tempoRelativo(x.ultimaEm, d, hoje) })}
                    </p>
                    <div className="linha-flex">
                      {x.alvoTipo === 'topico' && (
                        <Link href={`/${lang}/t/${x.alvo}`} className="btn btn-sec btn-peq">
                          {t.fila.ver}
                        </Link>
                      )}
                      <AcaoComMotivo
                        ato={{ tipo: 'remocao-por-responsavel', alvo: x.alvo }}
                        d={d}
                        rotulo={t.fila.remover}
                        titulo={d.socForum.gestao.removerTitulo}
                        texto={d.socForum.gestao.removerTexto}
                        confirmar={d.socForum.gestao.confirmar}
                      />
                      {podeDispensar && (
                        <BotaoAto
                          ato={{ tipo: 'denuncia-dispensar', comunidade: id, alvo: x.alvo }}
                          d={d}
                          className="btn btn-calmo btn-peq"
                          confirmar={{ titulo: t.fila.dispensarTitulo, texto: t.fila.dispensarTexto, ok: t.fila.dispensarOk }}
                        >
                          {t.fila.dispensar}
                        </BotaoAto>
                      )}
                    </div>
                    <p className="miudo">{podeDispensar ? t.fila.dispensarNota : t.fila.semAcao}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {aba === 'pedidos' && (
          <section className="pilha" aria-labelledby="ped-t">
            <h3 id="ped-t">{t.pedidos.titulo}</h3>
            {!pedidos.ok ? (
              <EstadoDeErro codigo={pedidos.codigo} d={d} lang={lang} />
            ) : pedidos.valor.itens.length === 0 ? (
              <EstadoVazio titulo={t.pedidos.vazio.titulo} texto={t.pedidos.vazio.texto} ficha={rostoPorUid('rvr_pedidos_vazio_00000')} />
            ) : (
              <ul className="pilha">
                {pedidos.valor.itens.map((p) => (
                  <li key={p.rover.uid} className="cartao">
                    <CartaoRover rover={p.rover} lang={lang} sub={fmt(t.pedidos.em, { quando: tempoRelativo(p.em, d, hoje) })} />
                    <div className="linha-flex">
                      <BotaoAto ato={{ tipo: 'comunidade-gestao', comunidade: id, alvo: p.rover.uid, acao: 'aprovar-pedido', motivo: null }} d={d} className="btn btn-prim btn-peq">
                        {t.pedidos.aprovar}
                      </BotaoAto>
                      <BotaoAto ato={{ tipo: 'comunidade-gestao', comunidade: id, alvo: p.rover.uid, acao: 'recusar-pedido', motivo: null }} d={d} className="btn btn-sec btn-peq">
                        {t.pedidos.recusar}
                      </BotaoAto>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {aba === 'convites' && (
          <section className="pilha" aria-labelledby="conv-t">
            <h3 id="conv-t">{t.convites.titulo}</h3>
            {!convites.ok ? (
              <EstadoDeErro codigo={convites.codigo} d={d} lang={lang} />
            ) : convites.valor.itens.length === 0 ? (
              <EstadoVazio titulo={t.convites.vazio.titulo} texto={t.convites.vazio.texto} ficha={rostoPorUid('rvr_convites_vazio_0000')} />
            ) : (
              <ul className="pilha">
                {convites.valor.itens.map((p) => (
                  <li key={p.rover.uid} className="cartao">
                    <CartaoRover rover={p.rover} lang={lang} sub={`${fmt(t.convites.por, { nome: p.por.nome })} · ${tempoRelativo(p.em, d, hoje)}`} />
                    <div className="linha-flex">
                      <BotaoAto ato={{ tipo: 'comunidade-gestao', comunidade: id, alvo: p.rover.uid, acao: 'cancelar-convite', motivo: null }} d={d} className="btn btn-sec btn-peq">
                        {t.convites.cancelar}
                      </BotaoAto>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {aba === 'membros' && <MembrosAba id={id} lang={lang} d={d} papel={com.voce!.papel!} acesso={com.acesso} meuUid={eu?.uid ?? ''} agora={agora} />}
        {aba === 'banidos' && <BanidosAba id={id} lang={lang} d={d} agora={hoje} />}

        {aba === 'apelacoes' && dono && (
          <section className="pilha" aria-labelledby="ap-t">
            <div>
              <h3 id="ap-t">{t.apelacoes.titulo}</h3>
              <p className="suave">{t.apelacoes.intro}</p>
            </div>
            {!fila.ok ? (
              <EstadoDeErro codigo={fila.codigo} d={d} lang={lang} />
            ) : fila.valor.apelacoes.length === 0 ? (
              <EstadoVazio titulo={t.apelacoes.vazio.titulo} texto={t.apelacoes.vazio.texto} ficha={rostoPorUid('rvr_apelacoes_vazio_00')} />
            ) : (
              <ul className="pilha">
                {fila.valor.apelacoes.map((a) => (
                  <li key={a.id} className="cartao apelacao-item">
                    <div className="linha-flex">
                      <span className="pilula" data-tom="aviso">
                        {t.apelacoes.tipo[a.tipo]}
                      </span>
                      <span className="miudo">{tempoRelativo(a.em, d, hoje)}</span>
                    </div>
                    <CartaoRover rover={a.autor} lang={lang} tamanho={40} />
                    <div>
                      <p className="sobrelinha">{t.apelacoes.texto}</p>
                      <p className="apelacao-texto">{a.texto}</p>
                    </div>
                    <div>
                      <p className="sobrelinha">{t.apelacoes.conteudo}</p>
                      {a.conteudo ? <blockquote className="alvo-denuncia"><q>{a.conteudo}</q></blockquote> : <p className="miudo">{t.apelacoes.conteudoVazio}</p>}
                    </div>
                    <div className="linha-flex">
                      <BotaoAto
                        ato={{ tipo: 'apelacao-decisao', apelacao: a.id, resultado: 'revertida' }}
                        d={d}
                        className="btn btn-prim btn-peq"
                        confirmar={{ titulo: t.apelacoes.reverterTitulo, texto: t.apelacoes.reverterTexto, ok: t.apelacoes.reverter }}
                      >
                        {t.apelacoes.reverter}
                      </BotaoAto>
                      <BotaoAto
                        ato={{ tipo: 'apelacao-decisao', apelacao: a.id, resultado: 'mantida' }}
                        d={d}
                        className="btn btn-sec btn-peq"
                        confirmar={{ titulo: t.apelacoes.manterTitulo, texto: t.apelacoes.manterTexto, ok: t.apelacoes.manter }}
                      >
                        {t.apelacoes.manter}
                      </BotaoAto>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </>
  )
}

async function MembrosAba({ id, lang, d, papel, acesso, meuUid, agora }: { id: string; lang: Pronto; d: ReturnType<typeof dict>; papel: 'dono' | 'moderador' | 'membro'; acesso: 'aberta' | 'moderada' | 'fechada'; meuUid: string; agora: string }) {
  const lista = await carregar(() => obterRede().cliente.membros(id))
  const t = d.socModeracao.membros
  return (
    <section className="pilha" aria-labelledby="mem-t">
      <h3 id="mem-t">{t.titulo}</h3>
      {!lista.ok ? (
        <EstadoDeErro codigo={lista.codigo} d={d} lang={lang} />
      ) : (
        <MembrosModeracao inicial={lista.valor} comunidade={id} acesso={acesso} meuPapel={papel} meuUid={meuUid} d={d} lang={lang} agora={agora} />
      )}
    </section>
  )
}

async function BanidosAba({ id, lang, d, agora }: { id: string; lang: Pronto; d: ReturnType<typeof dict>; agora: Date }) {
  const lista = await carregar(() => obterRede().cliente.banidos(id))
  const t = d.socModeracao.banidos
  return (
    <section className="pilha" aria-labelledby="ban-t">
      <h3 id="ban-t">{t.titulo}</h3>
      {!lista.ok ? (
        <EstadoDeErro codigo={lista.codigo} d={d} lang={lang} />
      ) : lista.valor.itens.length === 0 ? (
        <EstadoVazio titulo={t.vazio.titulo} texto={t.vazio.texto} ficha={rostoPorUid('rvr_banidos_vazio_0000')} estado="feliz" />
      ) : (
        <ul className="pilha">
          {lista.valor.itens.map((b) => (
            <li key={b.rover.uid} className="cartao">
              <CartaoRover rover={b.rover} lang={lang} sub={`${fmt(t.por, { papel: d.socComum.papeis[b.por].toLowerCase() })} · ${tempoRelativo(b.em, d, agora)}`} />
              <div className="linha-flex">
                <span className="etiqueta">{d.socComum.motivosModeracao[b.motivo]}</span>
                <span className="pilula" data-tom={b.apelacao === 'aberta' ? 'aviso' : b.apelacao === 'revertida' ? 'ok' : undefined}>
                  {t.apelacao[b.apelacao ?? 'nenhuma']}
                </span>
              </div>
              <div className="linha-flex">
                <BotaoAto ato={{ tipo: 'comunidade-gestao', comunidade: id, alvo: b.rover.uid, acao: 'desbanir', motivo: null }} d={d} className="btn btn-sec btn-peq">
                  {t.desbanir}
                </BotaoAto>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
