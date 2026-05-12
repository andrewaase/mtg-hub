// Skeleton loading components — shimmer placeholder blocks

const shimmerKeyframes = `
@keyframes vs-shimmer {
  0%   { background-position: -400px 0 }
  100% { background-position: 400px 0 }
}
`

// Inject the keyframes once
if (typeof document !== 'undefined' && !document.getElementById('vs-skeleton-style')) {
  const style = document.createElement('style')
  style.id = 'vs-skeleton-style'
  style.textContent = shimmerKeyframes
  document.head.appendChild(style)
}

const SHIMMER = {
  background: 'linear-gradient(90deg, #1e1e22 25%, #2a2a30 50%, #1e1e22 75%)',
  backgroundSize: '800px 100%',
  animation: 'vs-shimmer 1.4s infinite linear',
  borderRadius: '6px',
}

export function SkeletonBlock({ width = '100%', height = '16px', style = {} }) {
  return (
    <div
      style={{
        ...SHIMMER,
        width,
        height,
        flexShrink: 0,
        ...style,
      }}
    />
  )
}

export function SkeletonCard({ style = {} }) {
  return (
    <div style={{
      background: '#111', border: '1px solid #1e1e22',
      borderRadius: '12px', padding: '14px 16px',
      display: 'flex', gap: '12px', alignItems: 'flex-start',
      ...style,
    }}>
      <SkeletonBlock width="52px" height="72px" style={{ borderRadius: '6px', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
        <SkeletonBlock width="60%" height="14px" />
        <SkeletonBlock width="40%" height="11px" />
        <SkeletonBlock width="30%" height="11px" />
      </div>
    </div>
  )
}

export function SkeletonDeckTile({ style = {} }) {
  return (
    <div style={{
      background: '#111', border: '1px solid #1e1e22',
      borderRadius: '14px', overflow: 'hidden',
      ...style,
    }}>
      <SkeletonBlock width="100%" height="100px" style={{ borderRadius: 0 }} />
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <SkeletonBlock width="65%" height="13px" />
        <SkeletonBlock width="45%" height="10px" />
      </div>
    </div>
  )
}

// A full-page skeleton for the collection list
export function CollectionSkeleton() {
  return (
    <div style={{ padding: '16px' }}>
      {/* Toolbar placeholder */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <SkeletonBlock width="120px" height="34px" style={{ borderRadius: '8px' }} />
        <SkeletonBlock width="80px"  height="34px" style={{ borderRadius: '8px' }} />
        <SkeletonBlock width="80px"  height="34px" style={{ borderRadius: '8px', marginLeft: 'auto' }} />
      </div>
      {/* Card rows */}
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} style={{ marginBottom: '10px' }} />
      ))}
    </div>
  )
}

// A full-page skeleton for the decks grid
export function DecksSkeleton() {
  return (
    <div style={{ padding: '16px' }}>
      {/* Tabs placeholder */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <SkeletonBlock width="90px" height="36px" style={{ borderRadius: '8px' }} />
        <SkeletonBlock width="90px" height="36px" style={{ borderRadius: '8px' }} />
      </div>
      {/* Deck tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonDeckTile key={i} />
        ))}
      </div>
    </div>
  )
}
