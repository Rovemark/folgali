import { fmt } from '@/lib/i18n-base'

/** "Lumi is typing" with the three little dots that jump in sequence. The text is read; the dots only decorate. */
export default function Typing({ nome: name, texto: text }: { nome: string; texto: string }) {
  return (
    <p className="life-typing">
      <span className="life-typing-bubble" aria-hidden>
        <span /><span /><span />
      </span>
      <span>{fmt(text, { nome: name })}</span>
    </p>
  )
}
