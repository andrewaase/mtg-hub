import { useId } from 'react'

// Zero-dependency SVG area/line chart.
//
// Props:
//   data       number[]   — values to plot (need ≥ 2)
//   labels     string[]   — x-axis labels (shown at even intervals)
//   height     number     — px height (default 80)
//   color      string     — line + fill color; hex or CSS var (default teal)
//   showArea   boolean    — gradient fill under curve (default true)
//   showLabels boolean    — show x-axis date labels (default false)
//   showDot    boolean    — dot at the last point (default true)
//   className  string

export default function SparklineChart({
  data      = [],
  labels    = [],
  height    = 80,
  color     = '#3ecfb2',
  showArea  = true,
  showLabels = false,
  showDot   = true,
  className = '',
}) {
  const uid = useId()
  const gradId = `sg-${uid.replace(/:/g, '')}`

  if (!data || data.length < 2) return null

  const VW = 600
  const VH = height
  const PAD = showLabels
    ? { t: 6, r: 6, b: 22, l: 4 }
    : { t: 6, r: 6, b: 6,  l: 4 }

  const cw = VW - PAD.l - PAD.r
  const ch = VH - PAD.t - PAD.b

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  // Scale to SVG coords (y is flipped in SVG)
  const pts = data.map((v, i) => ({
    x: PAD.l + (i / (data.length - 1)) * cw,
    y: PAD.t + (1 - (v - min) / range) * ch,
  }))

  // Smooth cubic bezier path
  let linePath = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1]
    const c = pts[i]
    const cpx = (p.x + c.x) / 2
    linePath += ` C ${cpx.toFixed(1)} ${p.y.toFixed(1)} ${cpx.toFixed(1)} ${c.y.toFixed(1)} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`
  }

  // Area fill: same curve, closed at bottom
  const bottom = (PAD.t + ch).toFixed(1)
  const areaPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${bottom} L ${pts[0].x.toFixed(1)} ${bottom} Z`

  // X-axis labels (show ~5 evenly spaced)
  const labelStep = Math.max(1, Math.floor(labels.length / 5))

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width="100%"
      height={VH}
      className={className}
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   style={{ stopColor: color, stopOpacity: 0.28 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0.03 }} />
        </linearGradient>
      </defs>

      {showArea && <path d={areaPath} fill={`url(#${gradId})`} />}

      <path
        d={linePath}
        fill="none"
        style={{ stroke: color }}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {showDot && (
        <circle
          cx={pts[pts.length - 1].x}
          cy={pts[pts.length - 1].y}
          r="5"
          style={{ fill: color }}
        />
      )}

      {showLabels && labels.length > 0 && labels.map((label, i) => {
        if (i % labelStep !== 0 && i !== labels.length - 1) return null
        const pt = pts[i]
        if (!pt) return null
        return (
          <text
            key={i}
            x={pt.x}
            y={VH - 4}
            textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}
            fontSize="10"
            style={{ fill: 'rgba(255,255,255,0.28)', fontFamily: 'inherit' }}
          >
            {label}
          </text>
        )
      })}
    </svg>
  )
}
