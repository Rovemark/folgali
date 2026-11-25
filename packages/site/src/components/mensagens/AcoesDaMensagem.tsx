'use client'

import { useState, useTransition } from 'react'
import { agirAcao } from '@/app/acoes-sociais'
import BotaoAto from '@/components/social/BotaoAto'
import { fmt, type Dicionario } from '@/lib/i18n-base'
import { MOTIVOS_DENUNCIA_SOCIAL, type MotivoDenunciaSocial } from '@/lib/social/tipos'

type Props = {
  conversa: string
  mensagem: string
  /** o @ de quem escreveu (para o aviso da denúncia) */
  handle: string
  /** a mensagem é do outro lado e tem texto legível: só então dá para denunciar (revelar o texto) */
  podeDenunciar: boolean
  podeAgir: boolean
  d: Dicionario
}

/**
 * O que a pessoa faz com UMA mensagem: apagar a própria cópia (livre) e, na mensagem recebida, denunciar. A denúncia diz antes, com
 * todas as letras, que o app vai revelar ao operador o texto e a assinatura desta mensagem, e só desta.
 */
export default function AcoesDaMensagem({ conversa, mensagem, handle, podeDenunciar, podeAgir, d }: Props) {
  const t = d.socMensagens
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState<MotivoDenunciaSocial | null>(null)
  const [feito, setFeito] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function denunciar(e: React.FormEvent) {
    e.preventDefault()
    if (!motivo) return setErro(t.denuncia.escolha)
    setErro(null)
    iniciar(async () => {
      const r = await agirAcao({ tipo: 'mensagem-denuncia', mensagem, motivo })
      if (r.ok) setFeito(true)
      else setErro(d.socComum.ato.erro[r.codigo])
    })
  }

  if (!podeAgir) return null
  return (
    <div className="msg-acoes">
      <div className="msg-acoes-botoes">
        <BotaoAto
          ato={{ tipo: 'conversa-apagar', conversa, mensagem }}
          d={d}
          className="btn btn-calmo btn-peq"
          confirmar={{ titulo: t.apagarTitulo, texto: t.apagarTexto, ok: t.apagarOk }}
        >
          {t.apagar}
        </BotaoAto>
        {podeDenunciar && !feito && (
          <button type="button" className="btn btn-calmo btn-peq" aria-expanded={aberto} onClick={() => setAberto((x) => !x)}>
            {t.denunciar}
          </button>
        )}
      </div>
      {feito && (
        <p className="pf-nota" role="status">
          {t.denuncia.feita}
        </p>
      )}
      {aberto && !feito && (
        <form className="msg-denuncia" onSubmit={denunciar} noValidate>
          <h3>{t.denuncia.titulo}</h3>
          <p className="msg-aviso" role="note">
            {fmt(t.denuncia.aviso, { handle })}
          </p>
          <fieldset>
            <legend>{t.denuncia.motivo}</legend>
            {MOTIVOS_DENUNCIA_SOCIAL.map((m) => (
              <label key={m} className="opcao">
                <input type="radio" name={`motivo-${mensagem}`} value={m} checked={motivo === m} onChange={() => setMotivo(m)} />
                <span>
                  <strong>{d.socPerfil.denunciar.motivos[m][0]}</strong>
                  <span>{d.socPerfil.denunciar.motivos[m][1]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {erro && (
            <p className="erro-campo" role="alert">
              {erro}
            </p>
          )}
          <div className="form-botoes">
            <button type="button" className="btn btn-sec btn-peq" onClick={() => setAberto(false)}>
              {t.denuncia.fechar}
            </button>
            <button type="submit" className="btn btn-perigo btn-peq" disabled={pendente}>
              {pendente ? d.socComum.ato.carregando : t.denuncia.enviar}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
