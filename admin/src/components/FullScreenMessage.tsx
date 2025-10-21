interface FullScreenMessageProps {
  title: string
  message?: string
  action?: React.ReactNode
}

export function FullScreenMessage({ title, message, action }: FullScreenMessageProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '2rem',
        display: 'grid',
        placeItems: 'center',
        background: 'radial-gradient(circle at top, rgba(35,52,79,0.65), #04070d)',
      }}
    >
      <div
        style={{
          maxWidth: '420px',
          backgroundColor: 'rgba(12, 23, 35, 0.85)',
          borderRadius: '24px',
          padding: '2.5rem',
          boxShadow: '0 18px 50px rgba(6, 12, 24, 0.6)',
          border: '1px solid rgba(255,255,255,0.05)',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '1.8rem', marginBottom: '1rem', color: '#f2f6fb' }}>{title}</h1>
        {message && <p style={{ color: '#a9b8c9', lineHeight: 1.6 }}>{message}</p>}
        {action && <div style={{ marginTop: '1.5rem' }}>{action}</div>}
      </div>
    </div>
  )
}
