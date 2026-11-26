import Skeleton from '@/components/social/Skeleton'

export default function Loading() {
  return (
    <div className="stack">
      <Skeleton lines={2} cartao={false} rotulo="…" />
      <Skeleton lines={3} rotulo="…" />
      <Skeleton lines={3} rotulo="…" />
    </div>
  )
}
