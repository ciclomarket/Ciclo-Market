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
        background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
      }}
    >
      <div
        style={{
          maxWidth: '420px',
          backgroundColor: 'var(--admin-surface)',
          borderRadius: 'var(--radius-2xl)',
          padding: '2.5rem',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--admin-border)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            background: '#fef2f2',
            borderRadius: 'var(--radius-xl)',
            display: 'grid',
            placeItems: 'center',
            fontSize: '2rem',
            margin: '0 auto 1.5rem',
          }}
        >
          ⚠
        </div>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', color: 'var(--admin-text)', fontWeight: 700 }}>
          {title}
        </h1>
        {message && <p style={{ color: 'var(--admin-text-muted)', lineHeight: 1.6, margin: 0 }}>{message}</p>}
        {action && <div style={{ marginTop: '1.5rem' }}>{action}</div>}
      </div>
    </div>
  )
}
