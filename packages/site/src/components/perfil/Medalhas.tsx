'use client'

import BotaoAto from '@/components/social/BotaoAto'
import { IcMedalha } from '@/components/social/IconesSociais'
import { dataCurta, plural, type Dicionario, type Pronto } from '@/lib/i18n-base'
import { SELOS, type ContagemDeSelos, type TipoSelo } from '@/lib/social/tipos'

/** Quem pode dar selo: amigo de 7 dias ou mais. As razões do "não" não dizem nada de bloqueio. */
export type PodeDarSelo = 'sim' | 'nao-amigo' | 'sem-tempo' | 'ninguem'

const MATIZ: Record<TipoSelo, number> = { confiavel: 255, caprichoso: 48, rapido: 155, divertido: 345 }

type Props = {
  selos: ContagemDeSelos
  alvoUid: string
  pode: PodeDarSelo
  d: Dicionario
  /** 0.3.1 (`voce.selosQueDei`): os selos que o leitor já deu; o botão 'Dar' deles fica desligado. Vazio no relé 0.3. */
  jaDeu?: readonly TipoSelo[]
  /** 0.3.1: quando o leitor passa a poder dar selo (ISO), para dizer a data em vez de só "ainda não". */
  podeEm?: string | null
  lang?: Pronto
}

/** Os quatro selos como medalhas bordadas. A contagem é de amigos distintos; quem deu nunca aparece. */
export default function Medalhas({ selos, alvoUid, pode, d, jaDeu = [], podeEm = null, lang = 'pt' }: Props) {
  const s = d.socPerfil.selos
  const total = SELOS.reduce((n, k) => n + selos[k], 0)
  return (
    <section className="pf-selos" aria-labelledby="pf-selos-t">
      <div className="pf-selos-cab">
        <h2 id="pf-selos-t" className="sobrelinha">
          {s.titulo}
        </h2>
        <p className="miudo">{s.legenda}</p>
      </div>
      <ul className="pf-medalhas">
        {SELOS.map((k) => {
          const n = selos[k]
          const nome = d.socComum.selos[k].nome
          return (
            <li key={k} className="pf-medalha" data-vazia={n === 0} style={{ ['--h' as string]: MATIZ[k] }}>
              <span className="pf-medalha-disco" aria-hidden>
                <IcMedalha />
                <b>{n}</b>
              </span>
              <strong>{nome}</strong>
              <small>
                <span className="so-leitor">{d.socComum.selos[k].texto} </span>
                {plural(s.contagem, n)}
              </small>
              {pode === 'sim' && jaDeu.includes(k) && (
                <span className="miudo pf-ja-deu" title={s.jaDeu}>
                  <span className="so-leitor">{s.jaDeu}: {nome}</span>
                  <span aria-hidden>{s.dadoCurto}</span>
                </span>
              )}
              {pode === 'sim' && !jaDeu.includes(k) && (
                <BotaoAto ato={{ tipo: 'selo', alvo: alvoUid, selo: k }} d={d} className="btn btn-calmo btn-peq">
                  <span className="so-leitor">{s.dar.replace('{selo}', nome)}</span>
                  <span aria-hidden>+ {s.darCurto}</span>
                </BotaoAto>
              )}
            </li>
          )
        })}
      </ul>
      {total === 0 && pode === 'ninguem' && <p className="miudo">{s.nenhumTexto}</p>}
      {pode === 'nao-amigo' && <p className="miudo pf-razao">{s.semAmizade}</p>}
      {pode === 'sem-tempo' && <p className="miudo pf-razao">{podeEm ? s.podeEm.replace('{data}', dataCurta(podeEm, lang)) : s.semPermissao}</p>}
    </section>
  )
}
