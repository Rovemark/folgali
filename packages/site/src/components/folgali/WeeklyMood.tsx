/** Line of the mood of the week: seven points from 0 to 10, with the description in text for whoever cannot see the drawing. */
export default function WeekMood({ valores: values, dias: days, titulo: title, descricao: description }: { valores: number[]; dias: string[]; titulo: string; descricao: string }) {
  const L = 320, A = 120, m = 14
  const x = (i: number) => m + (i * (L - 2 * m)) / (values.length - 1)
  const y = (v: number) => A - m - (v / 10) * (A - 2 * m)
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const area = `M${x(0)},${A - m} L${points.split(' ').join(' L')} L${x(values.length - 1)},${A - m} Z`
  return (
    <section className="box box-pad mood" aria-labelledby="humor-t">
      <h2 id="humor-t" className="lat-title">{title}</h2>
      <svg viewBox={`0 0 ${L} ${A}`} className="mood-chart" role="img" aria-label={description}>
        <path d={area} className="mood-area" style={{ ['--i' as string]: 0 }} />
        <polyline points={points} className="mood-row" fill="none" pathLength={1} />
        {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="5" className="mood-dot" style={{ ['--i' as string]: i }} />)}
      </svg>
      <ol className="mood-days" aria-hidden>
        {days.map((d) => <li key={d}>{d}</li>)}
      </ol>
    </section>
  )
}
