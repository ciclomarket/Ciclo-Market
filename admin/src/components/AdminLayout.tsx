import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '@admin/context/AdminAuthContext'

const NAV_ITEMS = [
  { to: '/', label: 'Resumen', description: 'Visión general del marketplace' },
  { to: '/analytics', label: 'Analítica', description: 'Usuarios, ventas y tráfico' },
  { to: '/listings', label: 'Publicaciones', description: 'Revisión y moderación de avisos' },
  { to: '/stores', label: 'Tiendas oficiales', description: 'Gestión y métricas de partners' },
]

export function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAdminAuth()

  const current = NAV_ITEMS.find((item) => item.to === location.pathname) ?? NAV_ITEMS[0]

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <h2>CicloMarket Admin</h2>
        <nav className="admin-nav">
          {NAV_ITEMS.map((item) => {
            const isActive = item.to === '/'
              ? location.pathname === '/'
              : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
            return (
              <NavLink key={item.to} to={item.to} data-active={isActive}>
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
      </aside>

      <main className="admin-main">
        <header>
          <div>
            <h1>{current.label}</h1>
            <p>{current.description}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            {user?.email && (
              <p style={{ margin: 0, color: '#7f92ab', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                {user.email}
              </p>
            )}
            <button type="button" className="admin-signout" onClick={handleSignOut}>
              <span>Cerrar sesión</span>
            </button>
          </div>
        </header>
        <div className="admin-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
