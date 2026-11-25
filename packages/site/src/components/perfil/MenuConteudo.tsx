'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { agirAcao } from '@/app/acoes-sociais'
import { IcBandeira, IcLixo, IcMais } from '@/components/Icones'
import type { Dicionario } from '@/lib/i18n-base'
import { MOTIVOS_MODERACAO, type MotivoModeracao } from '@/lib/social/tipos'

export type TipoDeConteudo = 'recado' | 'depoimento'

type Props = {
  id: string
  tipo: TipoDeConteudo
  /** o @ de quem escreveu, para a tela de denúncia dizer do que se trata */
  autorHandle: string
  /** o @ do dono da página onde o conteúdo está */
  donoHandle: string
  lang: string
  d: Dicionario
  /** o leitor escreveu isto: pode apagar */
  meu: boolean
  /** o leitor é o dono do mural ou do perfil: pode tirar o que outros escreveram */
  doDono: boolean
}

/** O menu "três pontinhos" de um recado ou depoimento: denunciar, apagar o que é seu, tirar do meu mural. */
export default function MenuConteudo({ id, tipo, autorHandle, donoHandle, lang, d, meu, doDono }: Props) {
  const ref = useRef<HTMLDetailsElement>(null)
  const [aberto, setAberto] = useState(false)
  const [dialogo, setDialogo] = useState<'apagar' | 'remover' | null>(null)
  const [motivo, setMotivo] = useState<MotivoModeracao>('regras')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const m = d.socPerfil.mural
  const de = tipo === 'recado' ? donoHandle : autorHandle

  useEffect(() => {
    const fechar = (e: MouseEvent | KeyboardEvent) => {
      if (!ref.current?.open) return
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') ref.current.open = false
        return
      }
      if (!ref.current.contains(e.target as Node)) ref.current.open = false
    }
    document.addEventListener('click', fechar)
    document.addEventListener('keydown', fechar)
    return () => {
      document.removeEventListener('click', fechar)
      document.removeEventListener('keydown', fechar)
    }
  }, [])

  function confirmar() {
    setErro(null)
    iniciar(async () => {
      const ato = dialogo === 'apagar' ? ({ tipo: 'remocao-pelo-autor', alvo: id } as const) : ({ tipo: 'remocao-por-responsavel', alvo: id, motivo } as const)
      const r = await agirAcao(ato)
      if (r.ok) setDialogo(null)
      else setErro(d.socComum.ato.erro[r.codigo])
    })
  }

  return (
    <div className="pf-menu-conteudo">
      <details className="menu" ref={ref} onToggle={(e) => setAberto((e.target as HTMLDetailsElement).open)}>
        <summary className="icone-btn" aria-label={d.comum.abrirMenu} aria-expanded={aberto}>
          <IcMais />
        </summary>
        <ul className="menu-lista">
          <li>
            <Link href={`/${lang}/denunciar/${id}?tipo=${tipo}&de=${encodeURIComponent(de)}&volta=${encodeURIComponent(`/r/${donoHandle}`)}`}>
              <IcBandeira />
              {m.denunciar}
            </Link>
          </li>
          {meu && (
            <li>
              <button type="button" className="perigo" onClick={() => { if (ref.current) ref.current.open = false; setDialogo('apagar') }}>
                <IcLixo />
                {m.apagar}
              </button>
            </li>
          )}
          {doDono && !meu && (
            <li>
              <button type="button" className="perigo" onClick={() => { if (ref.current) ref.current.open = false; setDialogo('remover') }}>
                <IcLixo />
                {m.remover}
              </button>
            </li>
          )}
        </ul>
      </details>
      {dialogo && (
        <dialog
          className="dialogo"
          open
          ref={(el) => {
            if (el && !el.open) el.showModal()
          }}
          onClose={() => setDialogo(null)}
          aria-labelledby={`dlg-${id}`}
        >
          <h2 id={`dlg-${id}`}>{dialogo === 'apagar' ? m.apagarTitulo : m.removerTitulo}</h2>
          <p>{dialogo === 'apagar' ? m.apagarTexto : m.removerTexto}</p>
          {dialogo === 'remover' && (
            <div className="campo" style={{ marginTop: 12 }}>
              <label htmlFor={`mot-${id}`}>{m.removerMotivo}</label>
              <select id={`mot-${id}`} value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoModeracao)}>
                {MOTIVOS_MODERACAO.map((x) => (
                  <option key={x} value={x}>
                    {d.socComum.motivosModeracao[x]}
                  </option>
                ))}
              </select>
            </div>
          )}
          {erro && (
            <p className="erro-campo" role="alert" style={{ marginTop: 8 }}>
              {erro}
            </p>
          )}
          <div className="dialogo-botoes">
            <button type="button" className="btn btn-sec btn-peq" onClick={() => setDialogo(null)}>
              {d.comum.cancelar}
            </button>
            <button type="button" className="btn btn-perigo btn-peq" disabled={pendente} onClick={confirmar}>
              {dialogo === 'apagar' ? m.apagarOk : m.removerOk}
            </button>
          </div>
        </dialog>
      )}
    </div>
  )
}
