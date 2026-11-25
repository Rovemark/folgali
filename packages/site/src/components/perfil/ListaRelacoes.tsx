'use client'

import BotaoAto from '@/components/social/BotaoAto'
import CartaoRover from '@/components/social/CartaoRover'
import { useMais } from '@/components/social/useMais'
import { dataCurta, fmt, type Dicionario, type Pronto } from '@/lib/i18n-base'
import type { Pagina } from '@/lib/tipos'
import type { RelacaoItem } from '@/lib/social/tipos'

/** Bloqueados e silenciados do próprio rover, cada um com o botão de desfazer. O outro lado nunca é avisado. */
export default function ListaRelacoes({ inicial, meuUid, d, lang }: { inicial: Pagina<RelacaoItem>; meuUid: string; d: Dicionario; lang: Pronto }) {
  const t = d.socAmigos
  const { itens, proximo, pendente, mais } = useMais(inicial, { lista: 'relacoes', de: meuUid }, (r) => `${r.rover.uid}|${r.relacao}`)
  return (
    <>
      <ul className="pf-linhas">
        {itens.map((r) => (
          <li key={`${r.rover.uid}|${r.relacao}`}>
            <CartaoRover
              rover={r.rover}
              lang={lang}
              sub={`${r.relacao === 'bloqueio' ? t.bloqueio : t.silencio} · ${fmt(t.desde, { data: dataCurta(r.desde, lang) })}`}
              extra={
                <BotaoAto ato={{ tipo: 'relacao', alvo: r.rover.uid, acao: r.relacao === 'bloqueio' ? 'desbloquear' : 'dessilenciar' }} d={d} className="btn btn-sec btn-peq">
                  {r.relacao === 'bloqueio' ? t.desbloquear : t.dessilenciar}
                </BotaoAto>
              }
            />
          </li>
        ))}
      </ul>
      {proximo && (
        <div className="pf-mais-lista">
          <button type="button" className="btn btn-sec" onClick={mais} disabled={pendente}>
            {pendente ? d.comum.carregando : t.verMais}
          </button>
        </div>
      )}
    </>
  )
}
