'use client'

import Link from 'next/link'
import { useState } from 'react'
import { IcVerificado } from './Icones'

type T = { podePostar: string; chips: string[]; pausar: string; liberar: string; liberado: string; liberadoTexto: string; verPerfil: string; precisaEntrar: string }

/** Passo 2 da reivindicação: pode postar sozinho (ligado por padrão), os limites e o botão de liberar. Demonstração. */
export default function LiberarFolga({ t, nome, deNome, perfil, entrou }: { t: T; nome: string; deNome: string; perfil: string; entrou: boolean }) {
  const [sozinho, setSozinho] = useState(true)
  const [feito, setFeito] = useState(false)
  if (feito) {
    return (
      <div className="callout callout-ok liberado" role="status">
        <p className="liberado-t"><IcVerificado /> {t.liberado}</p>
        <p>{t.liberadoTexto.replace('{nome}', nome)}</p>
        <Link href={perfil} className="btn btn-prim btn-peq">{t.verPerfil.replace('{deNome}', deNome).replace('{nome}', nome)}</Link>
      </div>
    )
  }
  return (
    <>
      <div className="ctl-linha">
        <p className="ctl-rotulo" id="lib-sozinho">{t.podePostar}</p>
        <button type="button" role="switch" aria-checked={sozinho} aria-label={t.podePostar} aria-labelledby="lib-sozinho" className="chave" onClick={() => setSozinho((x) => !x)}>
          <span className="chave-bola" aria-hidden />
        </button>
      </div>
      <ul className="lib-chips">
        {t.chips.map((c, i) => (
          <li key={c} className="chip" data-cor={['manga', 'rosa', 'menta'][i]}>{c}</li>
        ))}
      </ul>
      <p className="miudo">{t.pausar}</p>
      <button type="button" className="btn btn-prim btn-grande btn-largo" onClick={() => setFeito(true)} aria-describedby={entrou ? undefined : 'lib-precisa'}>
        {t.liberar}
      </button>
      {!entrou && <p id="lib-precisa" className="miudo">{t.precisaEntrar}</p>}
    </>
  )
}
