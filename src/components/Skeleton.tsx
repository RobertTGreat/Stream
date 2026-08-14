export function SkeletonHero() {
  return (
    <div className="skeleton-hero animate-pulse-shimmer">
      <div className="skeleton-hero-backdrop" />
      <div className="skeleton-hero-content">
        <div className="skeleton-line w-24 h-4 rounded-full mb-3" />
        <div className="skeleton-line w-3/4 max-w-lg h-9 rounded-lg mb-3" />
        <div className="skeleton-line w-1/2 max-w-md h-4 rounded-md mb-4" />
        <div className="skeleton-line w-full max-w-xl h-12 rounded-md mb-6" />
        <div className="flex items-center gap-3">
          <div className="skeleton-line w-32 h-11 rounded-full" />
          <div className="skeleton-line w-32 h-11 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonCard({ aspectRatio = "poster" }: { aspectRatio?: "poster" | "landscape" }) {
  return (
    <div className={`skeleton-card is-${aspectRatio} animate-pulse-shimmer`}>
      <div className="skeleton-card-media" />
      <div className="skeleton-card-meta">
        <div className="skeleton-line w-4/5 h-3.5 rounded mb-2" />
        <div className="skeleton-line w-1/2 h-2.5 rounded" />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 12, aspectRatio = "poster" }: { count?: number; aspectRatio?: "poster" | "landscape" }) {
  return (
    <div className="skeleton-grid">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} aspectRatio={aspectRatio} />
      ))}
    </div>
  );
}

export function SkeletonRail({ title = "", count = 6 }: { title?: string; count?: number }) {
  return (
    <div className="skeleton-rail-wrap">
      {title ? (
        <div className="skeleton-rail-head">
          <div className="skeleton-line w-36 h-5 rounded" />
        </div>
      ) : null}
      <div className="skeleton-rail">
        {Array.from({ length: count }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
