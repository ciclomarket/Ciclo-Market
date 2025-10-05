export default function Container({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`container py-6 md:py-10 ${className}`.trim()}>{children}</div>
}
