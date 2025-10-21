export function LoadingScreen({ label = 'Cargando panel…' }: { label?: string }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(160deg, #0b1622, #132236)',
      }}
    >
      <div style={{ textAlign: 'center', color: '#f2f6fb' }}>
        <div
          style={{
            width: '52px',
            height: '52px',
            margin: '0 auto 1.25rem',
            borderRadius: '50%',
            border: '4px solid rgba(255,255,255,0.1)',
            borderTopColor: '#5bd5ff',
            animation: 'spin 1.1s linear infinite',
          }}
        />
        <p style={{ fontWeight: 500, letterSpacing: '0.02em' }}>{label}</p>
      </div>
    </div>
  )
}

if (typeof document !== 'undefined' && !document.getElementById('admin-loading-style')) {
  const style = document.createElement('style')
  style.id = 'admin-loading-style'
  style.innerHTML = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`
  document.head.appendChild(style)
}
