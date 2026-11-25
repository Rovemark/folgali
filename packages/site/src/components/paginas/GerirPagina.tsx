'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import BotaoAto from '@/components/social/BotaoAto'
import CartaoRover from '@/components/social/CartaoRover'
import FormProposta from '@/components/social/FormProposta'
import type { Dicionario, Pronto } from '@/lib/i18n-base'
import type { PaginaProjeto } from '@/lib/social/tipos'
import type { ResumoRover } from '@/lib/tipos'

type Props = {
  p: PaginaProjeto
  d: Dicionario
  lang: Pronto
  papel: 'dono' | 'administrador'
  /** amigos do dono que ainda não administram (a lista para escolher) */
  candidatos: ResumoRover[]
  podeEscrever: boolean
  nomeDoRover?: string
}

/** O que o dono e o administrador mexem: os dados da etiqueta, quem administra e (só o dono) apagar a página. */
export default function GerirPagina({ p, d, lang, papel, candidatos, podeEscrever, nomeDoRover }: Props) {
  const t = d.socPaginas.gerir
  const router = useRouter()
  const [escolhido, setEscolhido] = useState(candidatos[0]?.uid ?? '')
  const souDono = papel === 'dono'
  return (
    <div className="pilha-g">
      <section className="cartao" aria-labelledby="g-dados">
        <h2 id="g-dados">{t.dados}</h2>
        <p className="suave">{t.dadosSub}</p>
        <FormProposta
          tipo="pagina-atualizar"
          d={d}
          lang={lang}
          campos={{ pagina: p.id, nome: p.nome, descricao: p.descricao, tema: p.tema }}
          destino={{ rotulo: p.nome, href: `/${lang}/paginas/${p.id}` }}
          podeEscrever={podeEscrever}
          nomeDoRover={nomeDoRover}
          enviar={t.salvar}
          reiniciavel={false}
        />
      </section>

      <section className="cartao" aria-labelledby="g-admins">
        <h2 id="g-admins">{t.admins}</h2>
        <p className="suave">{souDono ? t.adminsSub : t.adminsSubAdmin}</p>
        {p.administradores.length === 0 ? (
          <p className="miudo">{t.adminsVazio}</p>
        ) : (
          <ul className="pilha gerir-lista">
            {p.administradores.map((a) => (
              <li key={a.uid}>
                <CartaoRover
                  rover={a}
                  lang={lang}
                  extra={
                    souDono ? (
                      <BotaoAto
                        ato={{ tipo: 'pagina-gestao', pagina: p.id, alvo: a.uid, acao: 'remover-admin' }}
                        d={d}
                        className="btn btn-sec btn-peq"
                        confirmar={{ titulo: t.tirarTitulo, texto: t.tirarTexto.replace('{nome}', a.nome), ok: t.tirarConfirma }}
                      >
                        {t.tirar}
                      </BotaoAto>
                    ) : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {souDono &&
          (candidatos.length === 0 ? (
            <p className="miudo">{t.semCandidatos}</p>
          ) : (
            <div className="campo">
              <label htmlFor="adm-escolha">{t.escolher}</label>
              <div className="linha-flex">
                <select id="adm-escolha" value={escolhido} onChange={(e) => setEscolhido(e.target.value)}>
                  {candidatos.map((c) => (
                    <option key={c.uid} value={c.uid}>
                      {c.nome} (@{c.handle})
                    </option>
                  ))}
                </select>
                <BotaoAto ato={{ tipo: 'pagina-gestao', pagina: p.id, alvo: escolhido, acao: 'adicionar-admin' }} d={d} className="btn btn-prim btn-peq" desabilitado={!escolhido}>
                  {t.adicionar}
                </BotaoAto>
              </div>
              <span className="ajuda miudo">{t.escolherAjuda}</span>
            </div>
          ))}
      </section>

      {souDono ? (
        <section className="cartao perigo-zona" aria-labelledby="g-perigo">
          <h2 id="g-perigo">{t.perigo}</h2>
          <p className="suave">{t.removerPaginaTexto}</p>
          <div>
            <BotaoAto
              ato={{ tipo: 'remocao-pelo-autor', alvo: p.id }}
              d={d}
              className="btn btn-perigo btn-peq"
              confirmar={{ titulo: t.removerPaginaTitulo, texto: t.removerPaginaConfirmaTexto, ok: t.removerPaginaConfirma }}
              onFeito={() => router.push(`/${lang}/paginas`)}
            >
              {t.removerPagina}
            </BotaoAto>
          </div>
        </section>
      ) : (
        <p className="nota-proposta">{t.soDono}</p>
      )}
    </div>
  )
}
