'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { agirAcao } from '@/app/acoes-sociais'
import type { Dicionario } from '@/lib/i18n-base'
import type { AtoSocial } from '@/lib/social/cliente-social'
import { MOTIVOS_MODERACAO, type MotivoModeracao } from '@/lib/social/tipos'

type SemMotivo<T> = T extends { motivo: unknown } ? Omit<T, 'motivo'> : never

type Props = {
  /** o ato SEM o motivo; o motivo vem do que a pessoa escolher */
  ato: SemMotivo<Extract<AtoSocial, { tipo: 'comunidade-gestao' | 'remocao-por-responsavel' }>>
  d: Dicionario
  rotulo: string
  titulo: string
  texto: string
  confirmar: string
  className?: string
  /** quem executa é o relé; este texto explica o que não volta */
  perigo?: boolean
}

/**
 * Botão que abre um diálogo pedindo UM motivo do enum (nunca texto livre) antes de expulsar, banir ou
 * remover. A escolha é obrigatória: sem motivo o botão de confirmar fica desligado.
 */
export default function AcaoComMotivo({ ato, d, rotulo, titulo, texto, confirmar, className = 'btn btn-perigo btn-peq' }: Props) {
  const id = useId()
  const ref = useRef<HTMLDialogElement>(null)
  const [motivo, setMotivo] = useState<MotivoModeracao | ''>('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function abrir() {
    setMotivo('')
    setErro(null)
    ref.current?.showModal()
  }
  function enviar() {
    if (!motivo) return
    iniciar(async () => {
      const r = await agirAcao({ ...ato, motivo })
      if (r.ok) ref.current?.close()
      else setErro(d.socComum.ato.erro[r.codigo])
    })
  }

  return (
    <>
      <button type="button" className={className} onClick={abrir}>
        {rotulo}
      </button>
      <dialog ref={ref} className="dialogo dialogo-motivo" aria-labelledby={`${id}-t`}>
        <h2 id={`${id}-t`}>{titulo}</h2>
        <p>{texto}</p>
        <div className="campo" style={{ marginTop: 14 }}>
          <label htmlFor={`${id}-m`}>{d.socModeracao.membros.motivo}</label>
          <select id={`${id}-m`} value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoModeracao)}>
            <option value="">{d.socForum.gestao.motivoRotulo}</option>
            {MOTIVOS_MODERACAO.map((m) => (
              <option key={m} value={m}>
                {d.socComum.motivosModeracao[m]}
              </option>
            ))}
          </select>
        </div>
        {erro && (
          <p className="erro-campo" role="alert">
            {erro}
          </p>
        )}
        <div className="dialogo-botoes">
          <button type="button" className="btn btn-sec btn-peq" onClick={() => ref.current?.close()}>
            {d.comum.cancelar}
          </button>
          <button type="button" className="btn btn-perigo btn-peq" disabled={!motivo || pendente} onClick={enviar}>
            {pendente ? d.socComum.ato.carregando : confirmar}
          </button>
        </div>
      </dialog>
    </>
  )
}
