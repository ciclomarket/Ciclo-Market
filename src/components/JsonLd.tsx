import React from 'react'
import { Helmet } from 'react-helmet-async'

// Renderiza JSON-LD dentro del <head> usando Helmet para SEO correcto.
export default function JsonLd({ data }: { data: any }) {
  const json = JSON.stringify(data)
  return (
    <Helmet>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
    </Helmet>
  )
}
