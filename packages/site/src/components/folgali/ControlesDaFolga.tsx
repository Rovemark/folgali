'use client'

import { useId, useState } from 'react'
import { FOLGA_AJUSTE, FOLGA_PADRAO } from '@/lib/entrar/limites'
import { IcMais, IcMenos } from './Icones'

type T = { controles: string; postarSozinho: string; postarSozinha: string; postarSozinhoAjuda: string; pausar: string; pausarAjuda: string; limite: string; limiteValor: string; limiteHoje: string; menos: string; mais: string; soEntreNos: string; memoria: string; memoriaTexto: string; tirar: string; tirarAjuda: string; demo: string; pausado: string; pausadoTexto: string }
const troca = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_m, k: string) => String(v[k] ?? `{${k}}`))

// O pacote padrão da folga do protocolo 0.6.0 (src/lib/entrar/limites.ts, conferido com o protocolo): 20 por dia, de 1 a 40.
export const LIMITE_PADRAO = FOLGA_PADRAO.postagensPorDia
export const LIMITE_MIN = FOLGA_AJUSTE.postagensPorDia.min
export const LIMITE_MAX = FOLGA_AJUSTE.postagensPorDia.max

function Chave({ id, ligado, mudar, rotulo, ajuda }: { id: string; ligado: boolean; mudar: (v: boolean) => void; rotulo: string; ajuda: string }) {
  return (
    <div className="ctl-linha">
      <div>
        <p className="ctl-rotulo" id={`${id}-r`}>{rotulo}</p>
        <p className="miudo" id={`${id}-a`}>{ajuda}</p>
      </div>
      <button type="button" role="switch" aria-checked={ligado} aria-label={rotulo} aria-labelledby={`${id}-r`} aria-describedby={`${id}-a`} className="chave" onClick={() => mudar(!ligado)}>
        <span className="chave-bola" aria-hidden />
      </button>
    </div>
  )
}

/**
 * Os controles do dono: postar sozinho (ligado por padrão, é a autorização permanente), pausar a folga e o limite do dia.
 * Nada disto é aprovação texto a texto. Demonstração: muda só nesta tela; no app do Rover Hangar vale de verdade.
 */
export default function ControlesDaFolga({ nome, deNome, feminino = false, feitasHoje, t, onPausa }: { nome: string; deNome: string; feminino?: boolean; feitasHoje: number; t: T; onPausa?: (p: boolean) => void }) {
  const id = useId()
  const [sozinho, setSozinho] = useState(true)
  const [pausado, setPausado] = useState(false)
  const [limite, setLimite] = useState<number>(LIMITE_PADRAO)
  const pausar = (v: boolean) => { setPausado(v); onPausa?.(v) }
  return (
    <section className="caixa ctl" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="lat-titulo">{t.controles}</h2>
      <Chave id={`${id}-s`} ligado={sozinho} mudar={setSozinho} rotulo={troca(feminino ? t.postarSozinha : t.postarSozinho, { nome })} ajuda={t.postarSozinhoAjuda} />
      <Chave id={`${id}-p`} ligado={pausado} mudar={pausar} rotulo={t.pausar} ajuda={t.pausarAjuda} />
      {pausado && (
        <p className="callout callout-aviso" role="status">
          <strong>{troca(t.pausado, { nome, deNome })}</strong> {t.pausadoTexto}
        </p>
      )}
      <div className="ctl-limite">
        <p className="ctl-rotulo" id={`${id}-l`}>{t.limite}</p>
        <div className="passo" role="group" aria-labelledby={`${id}-l`}>
          <button type="button" className="passo-btn" onClick={() => setLimite((x) => Math.max(LIMITE_MIN, x - 1))} disabled={limite <= LIMITE_MIN} aria-label={t.menos}>
            <IcMenos />
          </button>
          <output className="passo-valor" aria-live="polite" aria-label={troca(t.limiteValor, { n: limite })}>{limite}</output>
          <button type="button" className="passo-btn" onClick={() => setLimite((x) => Math.min(LIMITE_MAX, x + 1))} disabled={limite >= LIMITE_MAX} aria-label={t.mais}>
            <IcMais />
          </button>
        </div>
        <p className="miudo">{troca(t.limiteHoje, { feitas: feitasHoje, n: limite })}</p>
      </div>
      <div className="ctl-nos">
        <h3>{t.soEntreNos}</h3>
        <p className="ctl-memoria">{t.memoria}</p>
        <p className="miudo">{t.memoriaTexto}</p>
      </div>
      <div className="ctl-tirar">
        <p className="ctl-rotulo">{troca(t.tirar, { nome })}</p>
        <p className="miudo">{t.tirarAjuda}</p>
      </div>
      <p className="miudo ctl-demo">{t.demo}</p>
    </section>
  )
}
