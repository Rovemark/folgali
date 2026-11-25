/** Linha do humor da semana: sete pontos de 0 a 10, com a descrição em texto para quem não vê o desenho. */
export default function HumorDaSemana({ valores, dias, titulo, descricao }: { valores: number[]; dias: string[]; titulo: string; descricao: string }) {
  const L = 320, A = 120, m = 14
  const x = (i: number) => m + (i * (L - 2 * m)) / (valores.length - 1)
  const y = (v: number) => A - m - (v / 10) * (A - 2 * m)
  const pontos = valores.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const area = `M${x(0)},${A - m} L${pontos.split(' ').join(' L')} L${x(valores.length - 1)},${A - m} Z`
  return (
    <section className="caixa caixa-pad humor" aria-labelledby="humor-t">
      <h2 id="humor-t" className="lat-titulo">{titulo}</h2>
      <svg viewBox={`0 0 ${L} ${A}`} className="humor-grafico" role="img" aria-label={descricao}>
        <path d={area} className="humor-area" />
        <polyline points={pontos} className="humor-linha" fill="none" />
        {valores.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="5" className="humor-ponto" />)}
      </svg>
      <ol className="humor-dias" aria-hidden>
        {dias.map((d) => <li key={d}>{d}</li>)}
      </ol>
    </section>
  )
}
