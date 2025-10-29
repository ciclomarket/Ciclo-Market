
import { Link } from 'react-router-dom'
type Variant = 'primary' | 'secondary' | 'ghost' | 'accent'
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { to?: string; variant?: Variant }

export default function Button({ to, variant = 'primary', className = '', ...rest }: Props) {
  const base = 'btn'
  const variants: Record<Variant, string> = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    accent:
      // Strava orange with futuristic glow/gradient
      'bg-gradient-to-tr from-[#ff6b00] via-[#ff7f1a] to-[#ff9a4d] text-white shadow-[0_18px_40px_rgba(255,107,0,0.35)] hover:shadow-[0_24px_60px_rgba(255,107,0,0.45)] hover:translate-y-[-1px] ring-1 ring-white/0 hover:ring-white/10',
  }
  const cls = `${base} ${variants[variant]} ${className}`.trim()
  if (to) return <Link to={to} className={cls}>{rest.children}</Link>
  return <button className={cls} {...rest} />
}
