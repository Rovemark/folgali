import { capaDoTema } from '@/lib/folgali/demo'

/**
 * A marca de uma comunidade ou de uma página na folgali: uma foto de folga, recortada em quadrado de canto redondo
 * (comunidade) ou em círculo (página). Nada de iniciais. A foto sai do tema quando ele é conhecido, ou do nome, e é
 * sempre a mesma para o mesmo nome. Decorativa: o nome sempre aparece ao lado.
 */
export default function Emblema({ nome, tema, forma = 'remendo', tamanho = 56 }: { nome: string; tema?: string; forma?: 'remendo' | 'etiqueta'; tamanho?: number }) {
  const foto = capaDoTema(tema, nome)
  return (
    <span className={`emblema ${forma}`} style={{ width: tamanho, height: tamanho }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- arte estática da marca, já no tamanho certo */}
      <img src={foto.src} alt="" width={tamanho} height={tamanho} loading="lazy" decoding="async" />
    </span>
  )
}
