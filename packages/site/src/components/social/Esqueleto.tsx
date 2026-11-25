/** O estado de "carregando": retalhos que pulsam devagar. Usado nos `loading.tsx` de cada rota. */
export default function Esqueleto({ linhas = 3, cartao = true, rotulo }: { linhas?: number; cartao?: boolean; rotulo: string }) {
  return (
    <div className={`esqueleto${cartao ? ' cartao' : ''}`} role="status" aria-live="polite" aria-busy="true">
      <span className="so-leitor">{rotulo}</span>
      <span className="esq-linha larga" aria-hidden />
      {Array.from({ length: linhas }, (_, i) => (
        <span key={i} className="esq-linha" style={{ width: `${88 - ((i * 17) % 40)}%` }} aria-hidden />
      ))}
    </div>
  )
}
