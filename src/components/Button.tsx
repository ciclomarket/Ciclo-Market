
import { Link } from 'react-router-dom'
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { to?: string, variant?: 'primary'|'secondary'|'ghost' }
export default function Button({ to, variant='primary', className='', ...rest }: Props) {
  const cls = `btn ${variant==='primary'?'btn-primary':variant==='secondary'?'btn-secondary':'btn-ghost'} ${className}`
  if (to) return <Link to={to} className={cls}>{rest.children}</Link>
  return <button className={cls} {...rest} />
}
