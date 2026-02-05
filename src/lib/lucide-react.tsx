import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number | string }

function createIcon(pathD: string | string[]) {
  return function Icon({ size = 24, ...props }: IconProps) {
    const { className, ...rest } = props
    const paths = Array.isArray(pathD) ? pathD : [pathD]
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        {...rest}
      >
        {paths.map((d, idx) => (
          <path key={idx} d={d} />
        ))}
      </svg>
    )
  }
}

export const Check = createIcon('M20 6 9 17l-5-5')
export const Bike = createIcon('M5 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM6 13l2-5h4l3 5m-7 0h8m-4-5l2 3')
export const Mountain = createIcon('M3 20 10 8l4 6 3-4 4 10H3')
export const Compass = createIcon('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm2.5 7.5-1.2 4.3-4.3 1.2 1.2-4.3 4.3-1.2Z')
export const Building2 = createIcon('M3 22V2h18v20M7 22v-4m4 4v-4m4 4v-4M7 6h2m2 0h2m2 0h2M7 10h2m2 0h2m2 0h2')
export const Trophy = createIcon('M8 21h8m-4-3v3m6-19H6v3a6 6 0 0 0 12 0V2ZM6 5H4a2 2 0 0 0 2 2m12-2h2a2 2 0 0 1-2 2')
export const CircleDot = createIcon('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-6a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z')
export const Camera = createIcon('M4 7h4l2-2h4l2 2h4v12H4V7Zm8 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z')
export const CheckCircle2 = createIcon('M22 11.5v.5a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3')
export const Zap = createIcon('M13 2 3 14h7l-1 8 12-12h-7l-1-8Z')
export const Timer = createIcon([
  'M10 2h4',
  'M12 14l3-3',
  'M12 22a8 8 0 1 1 0-16a8 8 0 0 1 0 16z',
])
export const Baby = createIcon([
  'M12 22a10 10 0 1 1 0-20a10 10 0 0 1 0 20z',
  'M9 10h.01',
  'M15 10h.01',
  'M9 15c1 1 2 1.5 3 1.5s2-.5 3-1.5',
])
export const HelpCircle = createIcon([
  'M12 22a10 10 0 1 1 0-20a10 10 0 0 1 0 20z',
  'M9.09 9a3 3 0 0 1 5.82 1c0 2-3 2-3 4',
  'M12 17h.01',
])
