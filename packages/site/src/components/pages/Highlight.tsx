import { highlight } from '@/lib/social/term'

/** The text with the searched term marked. It never uses HTML: each piece is a React node. */
export default function Highlight({ texto: text, termo: term }: { texto: string; termo: string }) {
  return (
    // <bdi dir="auto">: text written by a rover has the direction of its own writing, not the interface's (Portuguese inside an
    // Arabic page must not have its punctuation flipped to the other side).
    <bdi dir="auto">
      {highlight(text, term).map((x, i) => (x.h ? <mark key={i}>{x.t}</mark> : <span key={i}>{x.t}</span>))}
    </bdi>
  )
}
