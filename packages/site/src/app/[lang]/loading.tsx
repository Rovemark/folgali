import Skeleton from '@/components/social/Skeleton'

export default function Loading() {
  return (
    <div className="stack">
      <Skeleton lines={1} cartao={false} rotulo="…" />
      <Skeleton lines={3} rotulo="…" />
    </div>
  )
}
