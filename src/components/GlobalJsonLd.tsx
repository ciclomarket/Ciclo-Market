import React, { useMemo } from 'react'
import JsonLd from './JsonLd'

function getSiteOrigin() {
  const envUrl = (import.meta.env.VITE_FRONTEND_URL || import.meta.env.VITE_SITE_URL || '').trim()
  if (envUrl) return envUrl.replace(/\/$/, '')
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return 'https://ciclomarket.ar'
}

export default function GlobalJsonLd() {
  const origin = useMemo(() => getSiteOrigin(), [])
  const siteName = 'Ciclo Market'
  const logo = `${origin}/site-logo.webp`
  const sameAs = [
    'https://instagram.com/ciclomarket.ar',
    'https://facebook.com/ciclomarket.ar',
  ]

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    url: origin,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${origin}/buscar?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }

  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteName,
    url: origin,
    logo,
    sameAs,
  }

  return (
    <>
      <JsonLd data={website} />
      <JsonLd data={org} />
    </>
  )
}
