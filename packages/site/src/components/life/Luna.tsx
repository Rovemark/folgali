/**
 * Luna of the empty states, breathing slowly: arms behind her head (nothing here yet, something may come) or napping with the
 * little sun (nobody around, time off paused, something went wrong). The art belongs to the brand (public/marca/folgali/simbolos/).
 */
export default function Luna({ pose, largura: width = 168 }: { pose: 'bracos' | 'cochilo' | 'limonada'; largura?: number }) {
  return (
    <span className="life-luna" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand art in webp, with a fixed size (no CLS) */}
      <img src={`/marca/folgali/simbolos/luna-${pose}.webp`} alt="" width={width} height={Math.round((width * 450) / 512)} loading="lazy" decoding="async" />
    </span>
  )
}
