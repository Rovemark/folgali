'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { agirAcao } from '@/app/acoes-sociais'
import { IcBandeira } from '@/components/Icones'
import type { Dicionario } from '@/lib/i18n-base'
import { MOTIVOS_DENUNCIA_SOCIAL, type MotivoDenunciaSocial } from '@/lib/social/tipos'

/**
 * Denunciar um tópico ou uma resposta: anônimo (a rede não guarda quem denunciou, e a fila da
 * comunidade mostra motivos e totais). A resposta é a mesma exista o alvo ou não.
 */
export default function DenunciarDialogo({ alvo, d, rotulo, className = 'acao-btn' }: { alvo: string; d: Dicionario; rotulo: string; className?: string }) {
  const id = useId()
  const ref = useRef<HTMLDialogElement>(null)
  const [motivo, setMotivo] = useState<MotivoDenunciaSocial | ''>('')
  const [estado, setEstado] = useState<'novo' | 'ok' | 'erro'>('novo')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function enviar() {
    if (!motivo) return
    iniciar(async () => {
      const r = await agirAcao({ tipo: 'denuncia', alvo, motivo })
      if (r.ok) setEstado('ok')
      else {
        setEstado('erro')
        setErro(d.socComum.ato.erro[r.codigo])
      }
    })
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setEstado('novo')
          setMotivo('')
          ref.current?.showModal()
        }}
      >
        <IcBandeira />
        <span>{rotulo}</span>
      </button>
      <dialog ref={ref} className="dialogo" aria-labelledby={`${id}-t`}>
        <h2 id={`${id}-t`}>{d.socForum.denuncia.titulo}</h2>
        {estado === 'ok' ? (
          <p role="status">{d.socForum.denuncia.enviada}</p>
        ) : (
          <>
            <p>{d.socForum.denuncia.texto}</p>
            <div className="campo" style={{ marginTop: 14 }}>
              <label htmlFor={`${id}-m`}>{d.socForum.denuncia.motivo}</label>
              <select id={`${id}-m`} value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoDenunciaSocial)}>
                <option value="">{d.socForum.gestao.motivoRotulo}</option>
                {MOTIVOS_DENUNCIA_SOCIAL.map((m) => (
                  <option key={m} value={m}>
                    {d.socComum.motivosDenuncia[m]}
                  </option>
                ))}
              </select>
            </div>
            {estado === 'erro' && erro && (
              <p className="erro-campo" role="alert">
                {erro}
              </p>
            )}
          </>
        )}
        <div className="dialogo-botoes">
          <button type="button" className="btn btn-sec btn-peq" onClick={() => ref.current?.close()}>
            {d.comum.fechar}
          </button>
          {estado !== 'ok' && (
            <button type="button" className="btn btn-prim btn-peq" disabled={!motivo || pendente} onClick={enviar}>
              {pendente ? d.socComum.ato.carregando : d.socForum.denuncia.enviar}
            </button>
          )}
        </div>
      </dialog>
    </>
  )
}
