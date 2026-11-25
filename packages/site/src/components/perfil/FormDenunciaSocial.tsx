'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { agirAcao } from '@/app/acoes-sociais'
import { IcCheck, IcEscudo } from '@/components/Icones'
import type { Dicionario } from '@/lib/i18n-base'
import { MOTIVOS_DENUNCIA_SOCIAL, type MotivoDenunciaSocial } from '@/lib/social/tipos'

type Props = { alvo: string; descricao: string; d: Dicionario; voltar: string; podeAgir: boolean }

/**
 * Denúncia de qualquer objeto da rede social (recado, depoimento, tópico, resposta...). Anônima:
 * vai pela ponte do app, sem cookie nem identificador do site. Não apaga nada sozinha: só entra na fila.
 */
export default function FormDenunciaSocial({ alvo, descricao, d, voltar, podeAgir }: Props) {
  const t = d.socPerfil.denunciar
  const [motivo, setMotivo] = useState<MotivoDenunciaSocial | null>(null)
  const [feito, setFeito] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  if (feito) {
    return (
      <section className="painel publicado" role="status">
        <span className="nota-anonima" style={{ borderRadius: 999, padding: 14 }}>
          <IcCheck />
        </span>
        <h2>{t.recebidaTitulo}</h2>
        <p>{t.recebidaTexto}</p>
        <Link href={voltar} className="btn btn-prim" style={{ marginTop: 8 }}>
          {t.voltar}
        </Link>
      </section>
    )
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!motivo) return setErro(d.denuncia.erroMotivo)
    setErro(null)
    iniciar(async () => {
      const r = await agirAcao({ tipo: 'denuncia', alvo, motivo })
      if (r.ok) setFeito(true)
      else setErro(d.socComum.ato.erro[r.codigo])
    })
  }

  return (
    <form className="painel" onSubmit={enviar} aria-describedby="den-intro" noValidate>
      <p id="den-intro" style={{ color: 'var(--tinta-2)' }}>
        {t.intro}
      </p>
      <div className="alvo-denuncia">
        <span className="sobrelinha">{t.alvo}</span>
        <strong>{descricao}</strong>
      </div>
      <fieldset>
        <legend>{t.motivo}</legend>
        {MOTIVOS_DENUNCIA_SOCIAL.map((m) => (
          <label key={m} className="opcao">
            <input type="radio" name="motivo" value={m} checked={motivo === m} onChange={() => setMotivo(m)} />
            <span>
              <strong>{t.motivos[m][0]}</strong>
              <span>{t.motivos[m][1]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="nota-anonima">
        <IcEscudo />
        <span>
          {t.anonima} {t.semPeso}
        </span>
      </div>
      {!podeAgir && <p className="pf-nota" role="note">{t.semApp}</p>}
      {erro && (
        <p className="erro-campo" role="alert">
          {erro}
        </p>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-prim" disabled={pendente || !podeAgir}>
          {pendente ? t.enviando : t.enviar}
        </button>
        <Link href={voltar} className="btn btn-calmo">
          {d.comum.cancelar}
        </Link>
      </div>
    </form>
  )
}
