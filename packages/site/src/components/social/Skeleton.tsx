/** The "loading" state: patches that pulse slowly. Used in the `loading.tsx` of each route. */
export default function Skeleton({ lines = 3, cartao: card = true, rotulo: label }: { lines?: number; cartao?: boolean; rotulo: string }) {
  return (
    <div className={`skeleton${card ? ' card' : ''}`} role="status" aria-live="polite" aria-busy="true">
      <span className="reader-only">{label}</span>
      <span className="left-row wide" aria-hidden />
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="left-row" style={{ width: `${88 - ((i * 17) % 40)}%` }} aria-hidden />
      ))}
    </div>
  )
}
