'use client'

import { useState } from 'react'
import BotaoAto from '@/components/social/BotaoAto'
import { IcEnquete, IcResolvido } from '@/components/social/IconesSociais'
import { fmt, plural, tempoRelativo, type Dicionario } from '@/lib/i18n-base'
import type { Enquete } from '@/lib/social/tipos'

/** "em 2 d", "em 5 h": o tempo até o fim da enquete (o relativo do site só olha para o passado). */
export function emFuturo(iso: string, d: Dicionario, agora: Date): string {
  const min = Math.max(0, Math.round((new Date(iso).getTime() - agora.getTime()) / 60000))
  const t = d.socForum.enquete.daqui
  if (min < 1) return t.agora
  if (min < 60) return fmt(t.min, { n: min })
  if (min < 1440) return fmt(t.h, { n: Math.floor(min / 60) })
  return fmt(t.d, { n: Math.floor(min / 1440) })
}

/**
 * A enquete de um tópico: barras com a contagem de cada opção. O voto é secreto (a rede só conta) e
 * NÃO se troca: depois do primeiro voto os botões somem. Encerrada, só o resultado.
 */
export default function EnqueteBloco({ topico, e, podeVotar, d, agora }: { topico: string; e: Enquete; podeVotar: boolean; d: Dicionario; agora: string }) {
  const t = d.socForum.enquete
  const [escolhida, setEscolhida] = useState<number | null>(e.voce)
  const votou = escolhida !== null
  const aberta = !e.encerrada
  const total = e.total + (e.voce === null && escolhida !== null ? 1 : 0)
  const maior = Math.max(...e.opcoes.map((o, i) => o.votos + (i === escolhida && e.voce === null ? 1 : 0)))
  return (
    <section className="enquete" aria-labelledby={`enq-${topico.slice(-6)}`}>
      <div className="cabeca-secao">
        <h2 id={`enq-${topico.slice(-6)}`} className="enquete-titulo">
          <IcEnquete /> {t.titulo}
        </h2>
        <span className="miudo">
          {aberta ? t.encerraEm.replace('{quando}', emFuturo(e.encerraEm, d, new Date(agora))) : t.encerrouEm.replace('{quando}', tempoRelativo(e.encerraEm, d, new Date(agora)))}
        </span>
      </div>
      <ul className="enquete-opcoes">
        {e.opcoes.map((o, i) => {
          const votos = o.votos + (i === escolhida && e.voce === null ? 1 : 0)
          const pct = total > 0 ? Math.round((votos / total) * 100) : 0
          const minha = i === escolhida
          return (
            <li key={i} className="enquete-opcao" data-minha={minha ? 'true' : undefined} data-lider={!aberta && votos === maior && maior > 0 ? 'true' : undefined}>
              <div className="enquete-linha">
                <span className="enquete-texto">
                  {minha && <IcResolvido aria-hidden />} {o.texto}
                  {minha && <span className="so-leitor"> ({t.seuVoto})</span>}
                </span>
                <span className="enquete-num numero">
                  {pct}% <span className="miudo">· {plural(t.votos, votos)}</span>
                </span>
              </div>
              <div className="enquete-barra" role="img" aria-label={`${pct}%`}>
                <span style={{ width: `${pct}%` }} />
              </div>
              {aberta && !votou && podeVotar && (
                <BotaoAto ato={{ tipo: 'voto', topico, opcao: i }} d={d} className="btn btn-sec btn-peq enquete-votar" onFeito={() => setEscolhida(i)}>
                  {t.votar}
                  <span className="so-leitor">: {o.texto}</span>
                </BotaoAto>
              )}
            </li>
          )
        })}
      </ul>
      <p className="miudo">
        {plural(t.votos, total)} · {t.secreto}
        {aberta && !votou && !podeVotar && <> {t.soMembro}</>}
      </p>
    </section>
  )
}
