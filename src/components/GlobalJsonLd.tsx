import React, { useMemo } from 'react'
import JsonLd from './JsonLd'

function getSiteOrigin() {
  const envUrl = (import.meta.env.VITE_FRONTEND_URL || import.meta.env.VITE_SITE_URL || '').trim()
  if (envUrl) return envUrl.replace(/\/$/, '')
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return 'https://www.ciclomarket.ar'
}

export default function GlobalJsonLd() {
  const origin = useMemo(() => getSiteOrigin(), [])
  const siteName = 'Ciclo Market'
  const logo = `${origin}/logo-azul.png`
  const sameAs = [
    'https://www.instagram.com/ciclomarket.ar',
    'https://www.facebook.com/ciclomarket.ar',
  ]

  // WebSite schema con SearchAction para Sitelinks Searchbox
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    url: `${origin}/`,
    description: 'Marketplace de bicicletas en Argentina. Comprá, vendé y compará bicicletas nuevas y usadas.',
    inLanguage: 'es-AR',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${origin}/marketplace?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }

  // Organization schema
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteName,
    alternateName: 'CicloMarket',
    url: origin,
    logo: {
      '@type': 'ImageObject',
      url: logo,
      width: 1200,
      height: 630,
    },
    sameAs,
    description: 'Marketplace especializado en bicicletas de ruta, MTB, gravel y accesorios en Argentina.',
    areaServed: {
      '@type': 'Country',
      name: 'Argentina',
    },
  }

  // LocalBusiness para mejorar aparición en búsquedas locales
  const localBusiness = {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    name: siteName,
    url: origin,
    logo,
    sameAs,
    description: 'Tienda online de bicicletas nuevas y usadas con entrega en toda Argentina.',
    areaServed: 'AR',
    availableChannel: {
      '@type': 'ServiceChannel',
      serviceType: 'Venta de bicicletas y accesorios',
      availableLanguage: ['Spanish'],
    },
  }

  return (
    <>
      <JsonLd data={website} />
      <JsonLd data={org} />
      <JsonLd data={localBusiness} />
    </>
  )
}
