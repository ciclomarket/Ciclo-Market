import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'

export interface BreadcrumbItem {
  label: string
  to?: string
  isActive?: boolean
}

interface BreadcrumbsProps {
  items?: BreadcrumbItem[]
  className?: string
}

// Mapeo de rutas a labels para autogeneración
const ROUTE_LABELS: Record<string, string> = {
  '': 'Inicio',
  marketplace: 'Marketplace',
  buscar: 'Buscar',
  listing: 'Publicación',
  tienda: 'Tienda',
  tiendas: 'Tiendas',
  blog: 'Blog',
  publicar: 'Publicar',
  comparar: 'Comparar',
  ayuda: 'Ayuda',
  faq: 'FAQ',
  tasacion: 'Tasación',
  'bicicletas-usadas': 'Bicicletas usadas',
  'bicicletas-ruta': 'Bicicletas de ruta',
  'bicicletas-mtb': 'Bicicletas MTB',
  'bicicletas-gravel': 'Bicicletas Gravel',
  'bicicletas-triatlon': 'Bicicletas Triatlón',
  fixie: 'Fixie',
  accesorios: 'Accesorios',
  indumentaria: 'Indumentaria',
  nutricion: 'Nutrición',
  'ofertas-destacadas': 'Ofertas destacadas',
  'tiendas-oficiales': 'Tiendas oficiales',
  'como-publicar': 'Cómo publicar',
  'tienda-oficial': 'Tienda oficial',
  terminos: 'Términos',
  privacidad: 'Privacidad',
  perfil: 'Perfil',
  dashboard: 'Dashboard',
  favoritos: 'Favoritos',
  mensajes: 'Mensajes',
  login: 'Iniciar sesión',
  registro: 'Registro',
}

function generateBreadcrumbsFromPath(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean)
  const items: BreadcrumbItem[] = [{ label: 'Inicio', to: '/' }]

  let currentPath = ''
  segments.forEach((segment, index) => {
    currentPath += `/${segment}`
    const isLast = index === segments.length - 1
    const label = ROUTE_LABELS[segment.toLowerCase()] || decodeURIComponent(segment.replace(/-/g, ' '))
    
    items.push({
      label: label.charAt(0).toUpperCase() + label.slice(1),
      to: isLast ? undefined : currentPath,
      isActive: isLast,
    })
  })

  return items
}

export default function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  const location = useLocation()
  const breadcrumbItems = items || generateBreadcrumbsFromPath(location.pathname)

  // No mostrar en la home
  if (location.pathname === '/' || location.pathname === '') {
    return null
  }

  // Schema.org JSON-LD para breadcrumbs
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      item: item.to ? `${window.location.origin}${item.to}` : undefined,
    })),
  }

  return (
    <>
      {/* Schema.org JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      
      {/* Breadcrumbs visuales */}
      <nav
        aria-label="Breadcrumb"
        className={`py-3 px-4 sm:px-6 lg:px-8 ${className}`}
      >
        <ol className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          {breadcrumbItems.map((item, index) => {
            const isFirst = index === 0
            const isLast = index === breadcrumbItems.length - 1

            return (
              <li key={index} className="flex items-center">
                {!isFirst && (
                  <ChevronRight className="mx-2 h-4 w-4 text-gray-400 flex-shrink-0" />
                )}
                
                {item.to && !isLast ? (
                  <Link
                    to={item.to}
                    className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                  >
                    {isFirst && <Home className="h-4 w-4" />}
                    <span>{item.label}</span>
                  </Link>
                ) : (
                  <span
                    className={`flex items-center gap-1 ${
                      isLast ? 'text-gray-900 font-medium' : ''
                    }`}
                    aria-current={isLast ? 'page' : undefined}
                  >
                    {isFirst && <Home className="h-4 w-4" />}
                    <span className={isLast ? 'line-clamp-1 max-w-[200px] sm:max-w-xs' : ''}>
                      {item.label}
                    </span>
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
    </>
  )
}

// Hook para usar breadcrumbs en páginas específicas
export function useBreadcrumbs(items: BreadcrumbItem[]) {
  return items
}
