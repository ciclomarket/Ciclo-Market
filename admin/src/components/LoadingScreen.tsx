export function LoadingScreen({ label = 'Cargando panel…' }: { label?: string }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--admin-bg)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          className="admin-spinner"
          style={{
            width: 48,
            height: 48,
            margin: '0 auto 1.25rem',
          }}
        />
        <p style={{ fontWeight: 500, letterSpacing: '0.02em', color: 'var(--admin-text-secondary)' }}>{label}</p>
      </div>
    </div>
  )
}
