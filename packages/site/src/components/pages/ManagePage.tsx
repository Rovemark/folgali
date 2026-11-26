'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import ActionButton from '@/components/social/ActButton'
import RoverCard from '@/components/social/RoverCard'
import ProposalForm from '@/components/social/ProposalForm'
import type { Dictionary, Ready } from '@/lib/i18n-base'
import type { ProjectPage } from '@/lib/social/types'
import type { RoverSummary } from '@/lib/types'

type Props = {
  p: ProjectPage
  d: Dictionary
  lang: Ready
  papel: 'dono' | 'administrador'
  /** friends of the owner who do not manage yet (the list to choose from) */
  candidates: RoverSummary[]
  canWrite: boolean
  roverName?: string
}

/** What the owner and the administrator change: the label data, who administers and (owner only) deleting the page. */
export default function ManagePage({ p, d, lang, papel: role, candidates, canWrite, roverName }: Props) {
  const t = d.socPaginas.gerir
  const router = useRouter()
  const [chosen, setChosenOne] = useState(candidates[0]?.uid ?? '')
  const iAmOwner = role === 'dono'
  return (
    <div className="stack-large">
      <section className="card" aria-labelledby="g-dados">
        <h2 id="g-dados">{t.dados}</h2>
        <p className="soft">{t.dadosSub}</p>
        <ProposalForm
          tipo="pagina-atualizar"
          d={d}
          lang={lang}
          campos={{ pagina: p.id, nome: p.nome, descricao: p.descricao, tema: p.tema }}
          destino={{ rotulo: p.nome, href: `/${lang}/paginas/${p.id}` }}
          canWrite={canWrite}
          roverName={roverName}
          enviar={t.salvar}
          restartable={false}
        />
      </section>

      <section className="card" aria-labelledby="g-admins">
        <h2 id="g-admins">{t.admins}</h2>
        <p className="soft">{iAmOwner ? t.adminsSub : t.adminsSubAdmin}</p>
        {p.administradores.length === 0 ? (
          <p className="fine">{t.adminsVazio}</p>
        ) : (
          <ul className="stack manage-list">
            {p.administradores.map((a) => (
              <li key={a.uid}>
                <RoverCard
                  rover={a}
                  lang={lang}
                  extra={
                    iAmOwner ? (
                      <ActionButton
                        ato={{ tipo: 'pagina-gestao', pagina: p.id, alvo: a.uid, acao: 'remover-admin' }}
                        d={d}
                        className="btn btn-secondary btn-small"
                        confirmar={{ titulo: t.tirarTitulo, texto: t.tirarTexto.replace('{nome}', a.nome), ok: t.tirarConfirma }}
                      >
                        {t.tirar}
                      </ActionButton>
                    ) : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {iAmOwner &&
          (candidates.length === 0 ? (
            <p className="fine">{t.semCandidatos}</p>
          ) : (
            <div className="field">
              <label htmlFor="adm-escolha">{t.escolher}</label>
              <div className="flex-row">
                <select id="adm-escolha" value={chosen} onChange={(e) => setChosenOne(e.target.value)}>
                  {candidates.map((c) => (
                    <option key={c.uid} value={c.uid}>
                      {c.nome} (@{c.handle})
                    </option>
                  ))}
                </select>
                <ActionButton ato={{ tipo: 'pagina-gestao', pagina: p.id, alvo: chosen, acao: 'adicionar-admin' }} d={d} className="btn btn-primary btn-small" disabled={!chosen}>
                  {t.adicionar}
                </ActionButton>
              </div>
              <span className="help fine">{t.escolherAjuda}</span>
            </div>
          ))}
      </section>

      {iAmOwner ? (
        <section className="card perigo-zona" aria-labelledby="g-perigo">
          <h2 id="g-perigo">{t.perigo}</h2>
          <p className="soft">{t.removerPaginaTexto}</p>
          <div>
            <ActionButton
              ato={{ tipo: 'remocao-pelo-autor', alvo: p.id }}
              d={d}
              className="btn btn-danger btn-small"
              confirmar={{ titulo: t.removerPaginaTitulo, texto: t.removerPaginaConfirmaTexto, ok: t.removerPaginaConfirma }}
              onDone={() => router.push(`/${lang}/paginas`)}
            >
              {t.removerPagina}
            </ActionButton>
          </div>
        </section>
      ) : (
        <p className="proposal-note">{t.soDono}</p>
      )}
    </div>
  )
}
