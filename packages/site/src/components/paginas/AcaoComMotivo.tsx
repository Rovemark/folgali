'use client'

import { useId, useState, useTransition } from 'react'
import { agirAcao } from '@/app/acoes-sociais'
import type { Dicionario } from '@/lib/i18n-base'
import type { AtoSocial } from '@/lib/social/cliente-social'

type Props = {
  d: Dicionario
  /** monta o ato com o motivo escolhido */
  montar: (motivo: string) => AtoSocial
  motivos: { valor: string; rotulo: string }[]
  rotuloBotao: string
  titulo: string
  texto: string
  confirmar: string
  /** o botão que abre o diálogo parece um item de menu ou um botão */
  estilo?: 'menu' | 'botao'
  perigo?: boolean
  onFeito?: () => void
}

/** Uma ação que pede um motivo do enum (denunciar, remover como responsável): diálogo nativo com a lista. */
export default function AcaoComMotivo({ d, montar, motivos, rotuloBotao, titulo, texto, confirmar, estilo = 'menu', perigo = false, onFeito }: Props) {
  const id = useId()
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState(motivos[0]?.valor ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState(false)
  const [pendente, iniciar] = useTransition()

  function enviar() {
    setErro(null)
    iniciar(async () => {
      const r = await agirAcao(montar(motivo))
      if (r.ok) {
        setFeito(true)
        onFeito?.()
      } else setErro(d.socComum.ato.erro[r.codigo])
    })
  }

  return (
    <>
      <button type="button" className={estilo === 'menu' ? (perigo ? 'perigo' : undefined) : 'btn btn-sec btn-peq'} onClick={() => { setFeito(false); setErro(null); setAberto(true) }}>
        {rotuloBotao}
      </button>
      {aberto && (
        <dialog
          className="dialogo"
          open
          ref={(el) => {
            if (el && !el.open) el.showModal()
          }}
          onClose={() => setAberto(false)}
          aria-labelledby={`${id}-t`}
        >
          <h2 id={`${id}-t`}>{titulo}</h2>
          {feito ? (
            <>
              <p role="status">{d.socComum.ato.feito}</p>
              <div className="dialogo-botoes">
                <button type="button" className="btn btn-sec btn-peq" onClick={() => setAberto(false)}>
                  {d.comum.fechar}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>{texto}</p>
              <fieldset className="motivos">
                <legend className="so-leitor">{titulo}</legend>
                {motivos.map((m) => (
                  <label key={m.valor} className="opcao">
                    <input type="radio" name={`${id}-m`} value={m.valor} checked={motivo === m.valor} onChange={() => setMotivo(m.valor)} />
                    <strong>{m.rotulo}</strong>
                  </label>
                ))}
              </fieldset>
              {erro && (
                <p className="erro-campo" role="alert">
                  {erro}
                </p>
              )}
              <div className="dialogo-botoes">
                <button type="button" className="btn btn-sec btn-peq" onClick={() => setAberto(false)}>
                  {d.comum.cancelar}
                </button>
                <button type="button" className="btn btn-perigo btn-peq" disabled={pendente} onClick={enviar}>
                  {pendente ? d.socComum.ato.carregando : confirmar}
                </button>
              </div>
            </>
          )}
        </dialog>
      )}
    </>
  )
}
