'use client'

import Link from 'next/link'
import Retrato from '@/components/Retrato'
import { IcAspas } from '@/components/social/IconesSociais'
import BotaoAto from '@/components/social/BotaoAto'
import TextoSocial from '@/components/social/TextoSocial'
import { useMais } from '@/components/social/useMais'
import { fmt, tempoRelativo, type Dicionario, type Pronto } from '@/lib/i18n-base'
import type { Pagina } from '@/lib/tipos'
import type { Depoimento } from '@/lib/social/tipos'
import MenuConteudo from './MenuConteudo'

type Props = {
  aceitos: Pagina<Depoimento>
  /** só o dono recebe; os pendentes não são públicos */
  pendentes: Depoimento[]
  donoUid: string
  donoHandle: string
  meuUid: string | null
  d: Dicionario
  lang: Pronto
  agora: string
}

function Carta({ dep, d, lang, agora, donoHandle, meuUid, donoUid, acao }: { dep: Depoimento; d: Dicionario; lang: Pronto; agora: string; donoHandle: string; meuUid: string | null; donoUid: string; acao?: React.ReactNode }) {
  const t = d.socPerfil.depoimentos
  return (
    <li className={`pf-carta${dep.estado === 'pendente' ? ' pendente' : ''}`} style={{ ['--pelucia' as string]: dep.autor.rosto.cor }}>
      <span className="pf-aspas" aria-hidden>
        <IcAspas />
      </span>
      <TextoSocial texto={dep.texto} lang={lang} saindo={d.socComum.proposta.linkSaida} className="pf-carta-texto" />
      <footer>
        <Link href={`/${lang}/r/${dep.autor.handle}`} className="pf-bilhete-autor">
          <Retrato ficha={dep.autor.rosto} nome={dep.autor.nome} tamanho={40} decorativo />
          <span>
            <strong>{fmt(t.de, { nome: dep.autor.nome })}</strong>
            <small>
              <bdi dir="ltr">@{dep.autor.handle}</bdi> · {dep.estado === 'pendente' ? t.pendente : tempoRelativo(dep.aceitoEm ?? dep.criadoEm, d, new Date(agora))}
            </small>
          </span>
        </Link>
        {dep.estado === 'aceito' && <MenuConteudo id={dep.id} tipo="depoimento" autorHandle={dep.autor.handle} donoHandle={donoHandle} lang={lang} d={d} meu={meuUid === dep.autor.uid} doDono={meuUid === donoUid} />}
      </footer>
      {acao && <div className="pf-carta-acoes">{acao}</div>}
    </li>
  )
}

/** Depoimentos: as cartas aceitas para todos; as pendentes só para o dono, com Aceitar e Recusar. */
export default function ListaDepoimentos({ aceitos, pendentes, donoUid, donoHandle, meuUid, d, lang, agora }: Props) {
  const t = d.socPerfil.depoimentos
  const { itens, proximo, pendente, falhou, mais } = useMais(aceitos, { lista: 'depoimentos', de: donoUid, opcoes: { estado: 'aceitos' } }, (x) => x.id)
  const doDono = meuUid === donoUid
  return (
    <>
      {doDono && pendentes.length > 0 && (
        <section className="pf-pendentes" aria-labelledby="pf-pend-t">
          <h3 id="pf-pend-t">{t.pendentesTitulo}</h3>
          <p className="suave">{t.pendentesTexto}</p>
          <ul className="pf-cartas">
            {pendentes.map((p) => (
              <Carta
                key={p.id}
                dep={p}
                d={d}
                lang={lang}
                agora={agora}
                donoHandle={donoHandle}
                meuUid={meuUid}
                donoUid={donoUid}
                acao={
                  <>
                    <BotaoAto ato={{ tipo: 'depoimento-decisao', depoimento: p.id, decisao: 'aceitar' }} d={d} className="btn btn-prim btn-peq">
                      {t.aceitar}
                    </BotaoAto>
                    <BotaoAto
                      ato={{ tipo: 'depoimento-decisao', depoimento: p.id, decisao: 'recusar' }}
                      d={d}
                      className="btn btn-sec btn-peq"
                      confirmar={{ titulo: t.recusarTitulo, texto: t.recusarTexto, ok: t.recusarOk }}
                    >
                      {t.recusar}
                    </BotaoAto>
                  </>
                }
              />
            ))}
          </ul>
        </section>
      )}
      <ul className="pf-cartas" aria-busy={pendente}>
        {itens.map((p) => (
          <Carta
            key={p.id}
            dep={p}
            d={d}
            lang={lang}
            agora={agora}
            donoHandle={donoHandle}
            meuUid={meuUid}
            donoUid={donoUid}
            acao={
              doDono ? (
                <BotaoAto
                  ato={{ tipo: 'depoimento-decisao', depoimento: p.id, decisao: 'recusar' }}
                  d={d}
                  className="btn btn-sec btn-peq"
                  confirmar={{ titulo: t.esconderTitulo, texto: t.esconderTexto, ok: t.esconderOk }}
                >
                  {t.esconder}
                </BotaoAto>
              ) : undefined
            }
          />
        ))}
      </ul>
      {proximo && (
        <div className="pf-mais-lista">
          <button type="button" className="btn btn-sec" onClick={mais} disabled={pendente}>
            {pendente ? d.comum.carregando : d.comum.carregarMais}
          </button>
          {falhou && <p className="erro-campo" role="alert">{d.erro.titulo}. {d.comum.tentarDeNovo}.</p>}
        </div>
      )}
    </>
  )
}
