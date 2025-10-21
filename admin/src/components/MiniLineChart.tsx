type Point = { x: number; y: number }

interface MiniLineChartProps {
  data: Array<{ x: number; y: number }>
  width?: number
  height?: number
  stroke?: string
  fill?: string | null
  strokeWidth?: number
}

export default function MiniLineChart({
  data,
  width = 600,
  height = 160,
  stroke = '#61dfff',
  fill = 'rgba(97,223,255,0.18)',
  strokeWidth = 2,
}: MiniLineChartProps) {
  const pad = 12
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const contentW = w - pad * 2
  const contentH = h - pad * 2

  const xs = data.map((d) => d.x)
  const ys = data.map((d) => d.y)
  const minX = Math.min(...xs, 0)
  const maxX = Math.max(...xs, 1)
  const minY = Math.min(...ys, 0)
  const maxY = Math.max(...ys, 1)
  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1

  const pts: Point[] = data.map((d) => ({
    x: pad + ((d.x - minX) / rangeX) * contentW,
    y: pad + contentH - ((d.y - minY) / rangeY) * contentH,
  }))

  const path = pts
    .map((p, i) => (i === 0 ? `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}` : `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`))
    .join(' ')

  const area = fill
    ? `${path} L ${pad + contentW} ${pad + contentH} L ${pad} ${pad + contentH} Z`
    : null

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Gráfico de línea">
      {fill && <path d={area || ''} fill={fill} stroke="none" />}
      <path d={path} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

