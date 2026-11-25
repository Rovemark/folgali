'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { marcarAvisosVistosAcao } from '@/app/acoes-sociais'
import { IcAlerta, IcBalao, IcCadeado, IcCheck, IcEscudo, IcLixo } from '@/components/Icones'
import Retrato from '@/components/Retrato'
import BotaoAto from '@/components/social/BotaoAto'
import { IcAmigos, IcAspas, IcBloquear, IcCitar, IcConvite, IcEstrela, IcEtiqueta, IcGrupo, IcMedalha, IcMod, IcMural, IcResolvido } from '@/components/social/IconesSociais'
import { useMais } from '@/components/social/useMais'
import { acaoDoAviso, destinoDoAviso, ehNovo, fraseDoAviso } from '@/lib/dominio/aviso'
import { tempoRelativo, type Dicionario, type Pronto } from '@/lib/i18n-base'
import type { Pagina } from '@/lib/tipos'
import type { Notificacao, TipoDeNotificacao } from '@/lib/social/tipos'

const ICONE: Record<TipoDeNotificacao, React.ReactNode> = {
  recado: <IcMural />,
  'pedido-de-amizade': <IcAmigos />,
  'amizade-aceita': <IcAmigos />,
  'depoimento-para-aceitar': <IcAspas />,
  'depoimento-aceito': <IcAspas />,
  'resposta-no-topico': <IcBalao />,
  'resposta-a-voce': <IcBalao />,
  citacao: <IcCitar />,
  mencao: <span className="pf-arroba">@</span>,
  'convite-comunidade': <IcConvite />,
  'pedido-de-entrada': <IcGrupo />,
  'entrada-aprovada': <IcCheck />,
  'selo-recebido': <IcMedalha />,
  'removido-por-responsavel': <IcLixo />,
  'apelacao-recebida': <IcMod />,
  'apelacao-decidida': <IcEscudo />,
  expulso: <IcBloquear />,
  banido: <IcBloquear />,
  'posse-recebida': <IcEstrela />,
  resolveu: <IcResolvido />,
  'novo-seguidor': <IcEtiqueta />,
  'conversa-pedido': <IcCadeado />,
  'conversa-aceita': <IcCadeado />,
}

type Props = { inicial: Pagina<Notificacao>; meuUid: string; meuHandle: string; visto: number; d: Dicionario; lang: Pronto; agora: string }

// a frase mora em dominio/aviso.ts para o painel "Meu rover" (componente de servidor) usar a mesma; o nome continua exportado daqui
export { fraseDoAviso }

/** Avisos do rover: os novos em destaque, "ver mais" e botão de ação onde cabe. Ao abrir, marca como vistos (no app, sem cookie). */
export default function ListaAvisos({ inicial, meuUid, meuHandle, visto: vistoDoServidor, d, lang, agora }: Props) {
  // o que era novo continua em destaque nesta visita, mesmo depois de marcado como visto
  const [visto] = useState(vistoDoServidor)
  const { itens, proximo, pendente, falhou, mais } = useMais(inicial, { lista: 'notificacoes', de: meuUid }, (n) => String(n.seq))
  const maior = inicial.itens[0]?.seq ?? 0
  useEffect(() => {
    if (maior > visto) void marcarAvisosVistosAcao(maior)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maior])
  const a = d.socAvisos
  const novos = itens.filter((n) => ehNovo(n, visto))
  const antigos = itens.filter((n) => !ehNovo(n, visto))

  const linha = (n: Notificacao) => {
    const dest = destinoDoAviso(n, meuHandle)
    const acao = acaoDoAviso(n)
    const frase = fraseDoAviso(n, d)
    return (
      <li key={n.seq} className="pf-aviso" data-novo={ehNovo(n, visto)} data-tipo={n.tipo}>
        <span className="pf-aviso-icone" aria-hidden>
          {n.origem && n.tipo !== 'selo-recebido' ? <Retrato ficha={n.origem.rosto} nome={n.origem.nome} tamanho={40} decorativo /> : ICONE[n.tipo] ?? <IcAlerta />}
        </span>
        <div className="pf-aviso-corpo">
          <p>
            {ehNovo(n, visto) && <span className="so-leitor">{a.novos}: </span>}
            {frase}
          </p>
          <small>
            <time dateTime={n.em}>{tempoRelativo(n.em, d, new Date(agora))}</time>
            {dest.indisponivel && <> · {a.indisponivel}</>}
            {dest.href && !acao && (
              <Link href={`/${lang}${dest.href}`} className="pf-abrir">
                {a.abrir}
              </Link>
            )}
          </small>
          <div className="pf-aviso-acoes">
            {acao === 'amizade' && n.origem && (
              <>
                <BotaoAto ato={{ tipo: 'amizade', alvo: n.origem.uid, acao: 'aceitar' }} d={d} className="btn btn-prim btn-peq">
                  {a.acoes.aceitar}
                </BotaoAto>
                <BotaoAto ato={{ tipo: 'amizade', alvo: n.origem.uid, acao: 'recusar' }} d={d} className="btn btn-sec btn-peq">
                  {a.acoes.recusar}
                </BotaoAto>
              </>
            )}
            {acao === 'convite' && n.comunidade && (
              <>
                <BotaoAto ato={{ tipo: 'comunidade-adesao', comunidade: n.comunidade, acao: 'aceitar-convite' }} d={d} className="btn btn-prim btn-peq">
                  {a.acoes.aceitar}
                </BotaoAto>
                <BotaoAto ato={{ tipo: 'comunidade-adesao', comunidade: n.comunidade, acao: 'recusar-convite' }} d={d} className="btn btn-sec btn-peq">
                  {a.acoes.recusar}
                </BotaoAto>
              </>
            )}
            {dest.href && acao && (
              <Link href={`/${lang}${dest.href}`} className="btn btn-calmo btn-peq">
                {a.abrir}
              </Link>
            )}
          </div>
        </div>
      </li>
    )
  }

  return (
    <>
      {novos.length > 0 && (
        <section aria-labelledby="av-novos">
          <h2 id="av-novos" className="sobrelinha">
            {a.novos} <span className="pf-n">{novos.length}</span>
          </h2>
          <ul className="pf-avisos" aria-busy={pendente}>{novos.map(linha)}</ul>
        </section>
      )}
      {antigos.length > 0 && (
        <section aria-labelledby="av-antigos">
          {novos.length > 0 && (
            <h2 id="av-antigos" className="sobrelinha">
              {a.antigos}
            </h2>
          )}
          <ul className="pf-avisos" aria-busy={pendente}>{antigos.map(linha)}</ul>
        </section>
      )}
      {proximo && (
        <div className="pf-mais-lista">
          <button type="button" className="btn btn-sec" onClick={mais} disabled={pendente}>
            {pendente ? d.comum.carregando : a.verMais}
          </button>
          {falhou && <p className="erro-campo" role="alert">{d.erro.titulo}. {d.comum.tentarDeNovo}.</p>}
        </div>
      )}
    </>
  )
}
