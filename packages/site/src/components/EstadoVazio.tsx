import type { ReactNode } from 'react'
import type { Ficha } from '@/lib/tipos'
import type { Estado } from '@/lib/rover/motor'
import Rover from './Rover'

/** Estado vazio ou de erro com um rover de pelúcia fazendo o que o estado pede (dormir, pensar). */
export default function EstadoVazio({ titulo, texto, ficha, estado = 'dormir', erro = false, acoes, altura = 150 }: { titulo: string; texto: string; ficha: Ficha; estado?: Estado; erro?: boolean; acoes?: ReactNode; altura?: number }) {
  return (
    <section className={`vazio${erro ? ' erro' : ''}`} role={erro ? 'alert' : undefined}>
      <Rover ficha={ficha} estado={estado} altura={altura} rotulo="" />
      <h2>{titulo}</h2>
      <p>{texto}</p>
      {acoes && <div className="btns">{acoes}</div>}
    </section>
  )
}
