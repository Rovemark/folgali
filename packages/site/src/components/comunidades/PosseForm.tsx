'use client'

import { useId, useState } from 'react'
import { IcAlerta } from '@/components/Icones'
import FormProposta from '@/components/social/FormProposta'
import type { Dicionario } from '@/lib/i18n-base'
import type { ResumoRover } from '@/lib/tipos'

type Etapa = null | 'transferir' | 'encerrar'

/**
 * Transferir a posse e encerrar a comunidade: as duas ações que não têm volta. Primeiro o texto claro
 * e o "entendi, continuar"; só depois o formulário que cria o rascunho na fila de aprovação.
 */
export default function PosseForm({ comunidade, nomeDaComunidade, membros, d, lang, nomeDoRover }: { comunidade: string; nomeDaComunidade: string; membros: ResumoRover[]; d: Dicionario; lang: string; nomeDoRover: string }) {
  const t = d.socComunidades.gerir
  const id = useId()
  const [etapa, setEtapa] = useState<Etapa>(null)
  const [entendi, setEntendi] = useState(false)
  const [novo, setNovo] = useState('')
  const escolhido = membros.find((m) => m.uid === novo)

  const abrir = (e: Etapa) => {
    setEtapa(e)
    setEntendi(false)
  }

  return (
    <div className="pilha">
      <div className="posse-opcoes">
        <section className="cartao posse-cartao">
          <h3>{t.transferir}</h3>
          <p className="suave">{t.transferirTexto}</p>
          {membros.length === 0 ? (
            <p className="miudo">{t.semMembros}</p>
          ) : (
            <div className="campo">
              <label htmlFor={`${id}-novo`}>{t.escolherMembro}</label>
              <select id={`${id}-novo`} value={novo} onChange={(e) => { setNovo(e.target.value); if (etapa === 'transferir') setEntendi(false) }}>
                <option value="">{t.escolherMembro}</option>
                {membros.map((m) => (
                  <option key={m.uid} value={m.uid}>
                    {m.nome} (@{m.handle})
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="button" className="btn btn-sec btn-peq" disabled={!escolhido} onClick={() => abrir('transferir')} aria-expanded={etapa === 'transferir'}>
            {t.transferir}
          </button>
        </section>
        <section className="cartao posse-cartao perigo">
          <h3>{t.encerrar}</h3>
          <p className="suave">{t.encerrarTexto}</p>
          <button type="button" className="btn btn-perigo btn-peq" onClick={() => abrir('encerrar')} aria-expanded={etapa === 'encerrar'}>
            {t.encerrar}
          </button>
        </section>
      </div>

      {etapa && (
        <section className="aviso-comunidade perigo" aria-live="polite">
          <IcAlerta />
          <div>
            <h3>{t.confirmarTitulo}</h3>
            <p>{etapa === 'transferir' ? t.confirmarTransferir : t.confirmarEncerrar}</p>
            {!entendi ? (
              <div className="linha-flex" style={{ marginTop: 10 }}>
                <button type="button" className="btn btn-perigo btn-peq" onClick={() => setEntendi(true)}>
                  {t.continuar}
                </button>
                <button type="button" className="btn btn-sec btn-peq" onClick={() => setEtapa(null)}>
                  {d.comum.cancelar}
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <FormProposta
                  key={`${etapa}-${novo}`}
                  tipo="comunidade-posse"
                  d={d}
                  lang={lang}
                  podeEscrever
                  nomeDoRover={nomeDoRover}
                  destino={{ rotulo: etapa === 'transferir' && escolhido ? `${nomeDaComunidade}: ${d.socComum.valores.acao.transferir.toLowerCase()} @${escolhido.handle}` : `${nomeDaComunidade}: ${d.socComum.valores.acao.encerrar.toLowerCase()}` }}
                  ocultar={['acao', 'comunidade', 'novoDono']}
                  enviar={etapa === 'transferir' ? t.transferir : t.encerrar}
                  reiniciavel={false}
                  campos={{ comunidade, acao: etapa, novoDono: etapa === 'transferir' ? novo : null }}
                />
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
