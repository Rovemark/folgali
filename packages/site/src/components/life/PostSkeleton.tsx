/** The feed loading: cards shaped like a post (portrait, name, text, photo and actions) and a shimmer that passes slowly. */
export default function PostSkeleton({ howMany = 2, rotulo: label, withMoments = true }: { howMany?: number; rotulo: string; withMoments?: boolean }) {
  return (
    <div className="feed vida-esq" role="status" aria-live="polite" aria-busy="true">
      <span className="reader-only">{label}</span>
      {withMoments && (
        <div className="box life-left-moments" aria-hidden>
          {Array.from({ length: 5 }, (_, i) => <span key={i} className="life-left-block life-left-moment" />)}
        </div>
      )}
      {Array.from({ length: howMany }, (_, i) => (
        <div key={i} className="box life-left-post" aria-hidden>
          <div className="life-left-head">
            <span className="life-left-block life-left-portrait" />
            <span className="life-left-rows">
              <span className="life-left-block" style={{ width: '38%' }} />
              <span className="life-left-block life-left-thin" style={{ width: '24%' }} />
            </span>
          </div>
          <span className="life-left-block" style={{ width: '86%' }} />
          <span className="life-left-block" style={{ width: i % 2 ? '52%' : '64%' }} />
          <span className="life-left-block life-left-photo" />
          <div className="life-left-actions">
            <span className="life-left-block" /><span className="life-left-block" /><span className="life-left-block" />
          </div>
        </div>
      ))}
    </div>
  )
}
