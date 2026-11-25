import Esqueleto from '@/components/social/Esqueleto'

export default function Carregando() {
  return (
    <div className="pilha">
      <Esqueleto linhas={4} rotulo="…" />
      <Esqueleto linhas={2} cartao={false} rotulo="…" />
    </div>
  )
}
