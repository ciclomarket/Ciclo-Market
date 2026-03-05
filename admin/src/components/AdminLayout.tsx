import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useAdminAuth } from '@admin/context/AdminAuthContext'

// Icons as simple SVG components
const Icons = {
  Overview: () => (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  SellerOps: () => (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Analytics: () => (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  Engagement: () => (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  Listings: () => (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10,9 9,9 8,9" />
    </svg>
  ),
  Stores: () => (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9,22 9,12 15,12 15,22" />
    </svg>
  ),
  Pricing: () => (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  Blog: () => (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10,9 9,9 8,9" />
    </svg>
  ),
}

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', description: 'Visión general del marketplace', icon: Icons.Overview },
  { to: '/ops', label: 'CRM Vendedores', description: 'Gestión de sellers y leads', icon: Icons.SellerOps },
  { to: '/analytics', label: 'Analytics', description: 'Métricas y reportes', icon: Icons.Analytics },
  { to: '/engagement', label: 'Engagement', description: 'Interacciones y contactos', icon: Icons.Engagement },
  { to: '/listings', label: 'Publicaciones', description: 'Moderación de avisos', icon: Icons.Listings },
  { to: '/stores', label: 'Tiendas', description: 'Partners y bicicleterías', icon: Icons.Stores },
  { to: '/pricing', label: 'Pricing', description: 'Base de datos de precios', icon: Icons.Pricing },
  { to: '/blog', label: 'Blog', description: 'Gestión de contenidos', icon: Icons.Blog },
]

type DensityMode = 'comfortable' | 'compact'
const DENSITY_KEY = 'cm_admin_density'

export function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAdminAuth()
  const [density, setDensity] = useState<DensityMode>('comfortable')

  const current = useMemo(() => {
    const exact = NAV_ITEMS.find((item) => item.to === location.pathname)
    if (exact) return exact
    const prefix = NAV_ITEMS.find((item) => item.to !== '/' && location.pathname.startsWith(`${item.to}/`))
    return prefix ?? NAV_ITEMS[0]
  }, [location.pathname])

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DENSITY_KEY)
      if (saved === 'compact' || saved === 'comfortable') setDensity(saved)
    } catch { /* noop */ }
  }, [])

  useEffect(() => {
    const el = document.querySelector('.admin-shell') as HTMLElement | null
    if (!el) return
    el.dataset.density = density
    try { window.localStorage.setItem(DENSITY_KEY, density) } catch { /* noop */ }
  }, [density])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const toggleDensity = () => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))

  // Get user initials for avatar
  const userInitials = useMemo(() => {
    if (!user?.email) return 'A'
    return user.email.charAt(0).toUpperCase()
  }, [user?.email])

  const mainNavItems = NAV_ITEMS.slice(0, 4)
  const managementNavItems = NAV_ITEMS.slice(4)

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <div className="admin-sidebar-logo">CM</div>
          <div>
            <div className="admin-sidebar-title">CicloMarket</div>
            <div className="admin-sidebar-subtitle">Panel de Control</div>
          </div>
        </div>

        <nav className="admin-nav">
          <div className="admin-nav-section">Principal</div>
          {mainNavItems.map((item) => {
            const Icon = item.icon
            const isActive = item.to === '/'
              ? location.pathname === '/'
              : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
            return (
              <NavLink key={item.to} to={item.to} data-active={isActive} title={item.description}>
                <Icon />
                <span>{item.label}</span>
              </NavLink>
            )
          })}

          <div className="admin-nav-section">Gestión</div>
          {managementNavItems.map((item) => {
            const Icon = item.icon
            const isActive = item.to === '/'
              ? location.pathname === '/'
              : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
            return (
              <NavLink key={item.to} to={item.to} data-active={isActive} title={item.description}>
                <Icon />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-user-info">
            <div className="admin-user-avatar">{userInitials}</div>
            <div className="admin-user-details">
              <div className="admin-user-name" title={user?.email || 'Admin'}>
                {user?.email?.split('@')[0] || 'Admin'}
              </div>
              <div className="admin-user-role">Administrador</div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              type="button"
              onClick={toggleDensity}
              className="btn btn-secondary"
              style={{ flex: 1, fontSize: '0.75rem' }}
              title={density === 'compact' ? 'Cambiar a cómodo' : 'Cambiar a compacto'}
            >
              {density === 'compact' ? 'Cómodo' : 'Compacto'}
            </button>
            <button 
              type="button" 
              className="btn btn-secondary" 
              style={{ flex: 1, fontSize: '0.75rem' }}
              onClick={handleSignOut}
            >
              Salir
            </button>
          </div>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <div className="admin-header-content">
            <h1>{current.label}</h1>
            <p>{current.description}</p>
          </div>
          <div className="admin-header-actions">
            <button
              type="button"
              onClick={() => navigate('/ops')}
              className="btn btn-primary"
            >
              <span>+</span>
              <span>Nuevo Lead</span>
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
