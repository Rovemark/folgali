'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { agirAcao } from '@/app/acoes-sociais'
import BotaoAto from '@/components/social/BotaoAto'
import { IcFixar, IcMod, IcMover, IcTrancar } from '@/components/social/IconesSociais'
import { podeMoverTopico } from '@/lib/dominio/permissoes'
import type { Dicionario } from '@/lib/i18n-base'
import type { Acesso, PapelNaComunidade } from '@/lib/social/tipos'
import AcaoComMotivo from './AcaoComMotivo'

export interface DestinoPossivel {
  id: string
  nome: string
  acesso: Acesso
  papel: PapelNaComunidade
  categorias: string[]
}

type Props = {
  topico: string
  fixado: boolean
  trancado: boolean
  origem: { id: string; acesso: Acesso; papel: PapelNaComunidade }
  destinos: DestinoPossivel[]
  /** o moderador não remove o que o dono escreveu */
  podeRemover: boolean
  d: Dicionario
}

/** A barra de moderação de um tópico: fixar, trancar, mover e remover. Só a equipe a vê. */
export default function GestaoTopico({ topico, fixado, trancado, origem, destinos, podeRemover, d }: Props) {
  const t = d.socForum.gestao
  const id = useId()
  const ref = useRef<HTMLDialogElement>(null)
  const [alvo, setAlvo] = useState('')
  const [cat, setCat] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const possiveis = destinos.filter((x) => x.id !== origem.id && podeMoverTopico({ papel: origem.papel, acesso: origem.acesso }, { papel: x.papel, acesso: x.acesso }).ok)
  const escolhido = possiveis.find((x) => x.id === alvo)
  const tornaPublico = !!escolhido && origem.acesso === 'fechada' && escolhido.acesso !== 'fechada'

  function mover() {
    if (!escolhido) return
    iniciar(async () => {
      const r = await agirAcao({ tipo: 'topico-gestao', topico, acao: 'mover', comunidade: escolhido.id, categoria: cat || null })
      if (r.ok) ref.current?.close()
      else setErro(d.socComum.ato.erro[r.codigo])
    })
  }

  return (
    <section className="gestao-topico" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="gestao-titulo">
        <IcMod /> {t.titulo}
      </h2>
      <div className="linha-flex">
        <BotaoAto ato={{ tipo: 'topico-gestao', topico, acao: fixado ? 'desafixar' : 'fixar', comunidade: null, categoria: null }} d={d} className="btn btn-sec btn-peq">
          <IcFixar /> {fixado ? t.desafixar : t.fixar}
        </BotaoAto>
        <BotaoAto ato={{ tipo: 'topico-gestao', topico, acao: trancado ? 'destrancar' : 'trancar', comunidade: null, categoria: null }} d={d} className="btn btn-sec btn-peq">
          <IcTrancar /> {trancado ? t.destrancar : t.trancar}
        </BotaoAto>
        <button
          type="button"
          className="btn btn-sec btn-peq"
          disabled={possiveis.length === 0}
          onClick={() => {
            setAlvo(possiveis[0]?.id ?? '')
            setCat('')
            setErro(null)
            ref.current?.showModal()
          }}
        >
          <IcMover /> {t.mover}
        </button>
        {podeRemover && (
          <AcaoComMotivo ato={{ tipo: 'remocao-por-responsavel', alvo: topico }} d={d} rotulo={t.remover} titulo={t.removerTitulo} texto={t.removerTexto} confirmar={t.confirmar} />
        )}
      </div>
      {possiveis.length === 0 && <p className="miudo">{t.moverSemOpcao}</p>}
      <dialog ref={ref} className="dialogo" aria-labelledby={`${id}-mt`}>
        <h2 id={`${id}-mt`}>{t.moverTitulo}</h2>
        <p>{t.moverTexto}</p>
        <div className="campo" style={{ marginTop: 14 }}>
          <label htmlFor={`${id}-dest`}>{t.destino}</label>
          <select id={`${id}-dest`} value={alvo} onChange={(e) => { setAlvo(e.target.value); setCat('') }}>
            {possiveis.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </div>
        {escolhido && escolhido.categorias.length > 0 && (
          <div className="campo" style={{ marginTop: 10 }}>
            <label htmlFor={`${id}-cat`}>{t.destinoCategoria}</label>
            <select id={`${id}-cat`} value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">{t.moverSem}</option>
              {escolhido.categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        {tornaPublico && <p className="aviso-campo" role="note">{t.moverPublico}</p>}
        {erro && (
          <p className="erro-campo" role="alert">
            {erro}
          </p>
        )}
        <div className="dialogo-botoes">
          <button type="button" className="btn btn-sec btn-peq" onClick={() => ref.current?.close()}>
            {d.comum.cancelar}
          </button>
          <button type="button" className="btn btn-prim btn-peq" disabled={!escolhido || pendente} onClick={mover}>
            {pendente ? d.socComum.ato.carregando : t.moverOk}
          </button>
        </div>
      </dialog>
    </section>
  )
}
