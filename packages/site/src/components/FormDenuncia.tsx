'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { denunciarAcao, type EstadoDenuncia } from '@/app/acoes'
import { MOTIVOS_DENUNCIA } from '@/lib/tipos'
import type { Dicionario } from '@/lib/i18n-base'
import { IcCheck, IcEscudo } from './Icones'

export default function FormDenuncia({ alvo, trecho, autor, d, voltar }: { alvo: string; trecho: string; autor: string; d: Dicionario; voltar: string }) {
  const [estado, acao, pendente] = useActionState<EstadoDenuncia, FormData>(denunciarAcao, { estado: 'novo' })
  if (estado.estado === 'ok') {
    return (
      <section className="painel publicado" role="status">
        <span className="nota-anonima" style={{ borderRadius: 999, padding: 14 }}>
          <IcCheck />
        </span>
        <h2>{d.denuncia.recebidaTitulo}</h2>
        <p>{d.denuncia.recebidaTexto}</p>
        <Link href={voltar} className="btn btn-prim" style={{ marginTop: 8 }}>
          {d.comum.voltar}
        </Link>
      </section>
    )
  }
  const mensagemErro = estado.estado === 'erro' ? { motivo: d.denuncia.erroMotivo, limite: d.denuncia.erroLimite, 'nao-achei': d.denuncia.erroNaoAcho, geral: d.denuncia.erroGeral }[estado.erro] : null
  return (
    <form action={acao} className="painel" aria-describedby="den-intro">
      <p id="den-intro" style={{ color: 'var(--tinta-2)' }}>{d.denuncia.intro}</p>
      <input type="hidden" name="alvo" value={alvo} />
      <div className="alvo-denuncia">
        <span className="sobrelinha">{d.denuncia.alvo}</span>
        <strong>{autor}</strong>
        <q>{trecho}</q>
      </div>
      <fieldset>
        <legend>{d.denuncia.motivo}</legend>
        {MOTIVOS_DENUNCIA.map((m) => (
          <label key={m} className="opcao">
            <input type="radio" name="motivo" value={m} required />
            <span>
              <strong>{d.denuncia.motivos[m][0]}</strong>
              <span>{d.denuncia.motivos[m][1]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="nota-anonima">
        <IcEscudo />
        <span>
          {d.denuncia.anonimaTitulo} <span style={{ fontWeight: 400 }}>{d.denuncia.anonimaTexto}</span>
        </span>
      </div>
      {mensagemErro && <p className="erro-campo" role="alert">{mensagemErro}</p>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-prim" disabled={pendente}>
          {d.denuncia.enviar}
        </button>
        <Link href={voltar} className="btn btn-calmo">
          {d.comum.cancelar}
        </Link>
      </div>
    </form>
  )
}
