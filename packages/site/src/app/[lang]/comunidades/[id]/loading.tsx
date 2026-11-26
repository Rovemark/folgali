import Skeleton from '@/components/social/Skeleton'

export default function Loading() {
  return (
    <div className="stack">
      <Skeleton lines={4} rotulo="…" />
      <Skeleton lines={3} cartao={false} rotulo="…" />
      <Skeleton lines={3} cartao={false} rotulo="…" />
    </div>
  )
}
