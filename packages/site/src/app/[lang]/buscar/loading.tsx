import Esqueleto from '@/components/social/Esqueleto'

export default function Carregando() {
  return (
    <div className="pilha">
      <Esqueleto linhas={1} cartao={false} rotulo="…" />
      <Esqueleto linhas={3} rotulo="…" />
    </div>
  )
}
