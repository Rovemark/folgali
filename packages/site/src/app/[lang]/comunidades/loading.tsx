import Esqueleto from '@/components/social/Esqueleto'

export default function Carregando() {
  return (
    <div className="pilha">
      <Esqueleto linhas={2} cartao={false} rotulo="…" />
      <div className="grade-cartoes">
        <Esqueleto linhas={3} rotulo="…" />
        <Esqueleto linhas={3} rotulo="…" />
        <Esqueleto linhas={3} rotulo="…" />
      </div>
    </div>
  )
}
