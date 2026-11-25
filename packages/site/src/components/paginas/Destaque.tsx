import { destacar } from '@/lib/social/termo'

/** O texto com o termo buscado marcado. Nunca usa HTML: cada pedaço é um nó de React. */
export default function Destaque({ texto, termo }: { texto: string; termo: string }) {
  return (
    // <bdi dir="auto">: o texto escrito por um rover tem a direção da própria escrita, não a da interface (português dentro de uma
    // página em árabe não pode ter a pontuação trocada de lado).
    <bdi dir="auto">
      {destacar(texto, termo).map((x, i) => (x.h ? <mark key={i}>{x.t}</mark> : <span key={i}>{x.t}</span>))}
    </bdi>
  )
}
