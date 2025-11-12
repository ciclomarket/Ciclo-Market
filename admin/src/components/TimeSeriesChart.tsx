import { useMemo } from 'react'

interface TimeSeriesPoint {
  date: string
  value: number
}

interface TimeSeriesChartProps {
  data: TimeSeriesPoint[]
  height?: number
  stroke?: string
  fill?: string
  xTicks?: number
  yTicks?: number
  yFormatter?: (value: number) => string
  emptyLabel?: string
}

const defaultNumberFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const defaultDateFormat = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' })

export function TimeSeriesChart({
  data,
  height = 220,
  stroke = '#61dfff',
  fill = 'rgba(97,223,255,0.16)',
  xTicks = 4,
  yTicks = 4,
  yFormatter = (value) => defaultNumberFormat.format(value),
  emptyLabel = 'Sin datos',
}: TimeSeriesChartProps) {
  const prepared = useMemo(() => {
    const points: Array<{ x: number; y: number; label: string }> = []
    for (const point of data) {
      const ts = Date.parse(point.date)
      if (Number.isNaN(ts)) continue
      points.push({ x: ts, y: Number(point.value) || 0, label: point.date })
    }
    if (points.length === 0) return null
    points.sort((a, b) => a.x - b.x)
    const minX = points[0]?.x ?? 0
    const maxX = points[points.length - 1]?.x ?? minX + 1
    const maxY = points.reduce((acc, p) => Math.max(acc, p.y), 0)
    return { points, minX, maxX, maxY: maxY === 0 ? 1 : maxY }
  }, [data])

  if (!prepared) {
    return (
      <div style={{ color: '#92a5bc', padding: '1rem 0' }}>
        {emptyLabel}
      </div>
    )
  }

  const width = 720
  const viewWidth = width
  const viewHeight = height
  const margin = { top: 20, right: 32, bottom: 36, left: 56 }
  const chartWidth = viewWidth - margin.left - margin.right
  const chartHeight = viewHeight - margin.top - margin.bottom

  const scaleX = (value: number) => {
    const { minX, maxX } = prepared
    const range = maxX - minX || 1
    return margin.left + ((value - minX) / range) * chartWidth
  }
  const scaleY = (value: number) => {
    const range = prepared.maxY || 1
    return margin.top + chartHeight - (value / range) * chartHeight
  }

  const path = prepared.points
    .map((p, idx) => {
      const x = scaleX(p.x).toFixed(2)
      const y = scaleY(p.y).toFixed(2)
      return idx === 0 ? `M ${x} ${y}` : `L ${x} ${y}`
    })
    .join(' ')

  const areaPath = `${path} L ${scaleX(prepared.maxX).toFixed(2)} ${margin.top + chartHeight} L ${scaleX(prepared.minX).toFixed(2)} ${margin.top + chartHeight} Z`

  const xTickCount = Math.max(2, Math.min(xTicks, prepared.points.length))
  const xTickValues: number[] = []
  if (xTickCount === prepared.points.length) {
    for (const p of prepared.points) xTickValues.push(p.x)
  } else {
    const step = (prepared.maxX - prepared.minX) / (xTickCount - 1 || 1)
    for (let i = 0; i < xTickCount; i += 1) {
      xTickValues.push(prepared.minX + step * i)
    }
  }

  const yTickCount = Math.max(2, yTicks)
  const yTickValues: number[] = []
  const yStep = prepared.maxY / (yTickCount - 1 || 1)
  for (let i = 0; i < yTickCount; i += 1) {
    yTickValues.push(yStep * i)
  }

  return (
    <svg width="100%" viewBox={`0 0 ${viewWidth} ${viewHeight}`} role="img" aria-label="Serie temporal">
      <rect x={margin.left} y={margin.top} width={chartWidth} height={chartHeight} fill="none" stroke="rgba(255,255,255,0.06)" />
      <path d={areaPath} fill={fill || 'none'} stroke="none" />
      <path d={path} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {/* Y axis */}
      <line
        x1={margin.left}
        y1={margin.top}
        x2={margin.left}
        y2={margin.top + chartHeight}
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={1}
      />
      {yTickValues.map((value) => {
        const y = scaleY(value)
        return (
          <g key={`y-${value}`}>
            <line
              x1={margin.left}
              y1={y}
              x2={margin.left + chartWidth}
              y2={y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={0.5}
            />
            <text
              x={margin.left - 8}
              y={y + 4}
              textAnchor="end"
              fontSize="11"
              fill="#7f92ab"
            >
              {yFormatter(value)}
            </text>
          </g>
        )
      })}

      {/* X axis */}
      <line
        x1={margin.left}
        y1={margin.top + chartHeight}
        x2={margin.left + chartWidth}
        y2={margin.top + chartHeight}
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={1}
      />
      {xTickValues.map((value) => {
        const x = scaleX(value)
        return (
          <g key={`x-${value}`}>
            <line
              x1={x}
              y1={margin.top + chartHeight}
              x2={x}
              y2={margin.top + chartHeight + 6}
              stroke="rgba(255,255,255,0.24)"
              strokeWidth={1}
            />
            <text
              x={x}
              y={margin.top + chartHeight + 20}
              textAnchor="middle"
              fontSize="11"
              fill="#7f92ab"
            >
              {defaultDateFormat.format(new Date(value))}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
