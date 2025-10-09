import { useMemo, type ReactNode } from 'react'
import { Helmet } from 'react-helmet-async'
import { useLocation } from 'react-router-dom'

export type SEOProps = {
  title?: string
  description?: string
  image?: string
  url?: string
  type?: 'website' | 'article' | 'product' | 'profile' | 'video.other'
  imageWidth?: number
  imageHeight?: number
  facebookAppId?: string
  noIndex?: boolean
  keywords?: string | string[]
  children?: ReactNode
}

const SITE_NAME = 'Ciclo Market'
const DEFAULT_TITLE = `${SITE_NAME} – Marketplace de bicicletas`
const DEFAULT_DESCRIPTION =
  'Publicá tu bici, encontrá ofertas y conectá con vendedores en Ciclo Market. Clasificados de bicicletas en Argentina.'
const DEFAULT_IMAGE = 'https://ciclomarket.ar/site-logo.png'
const DEFAULT_URL = 'https://ciclomarket.ar'
const DEFAULT_TYPE: NonNullable<SEOProps['type']> = 'website'
const DEFAULT_LOCALE = 'es_AR'
const DEFAULT_IMAGE_WIDTH = 1200
const DEFAULT_IMAGE_HEIGHT = 630

function getSiteOrigin() {
  const envUrl = import.meta.env.VITE_FRONTEND_URL ?? import.meta.env.VITE_SITE_URL

  if (envUrl) {
    return envUrl.replace(/\/$/, '')
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }

  return DEFAULT_URL
}

function toAbsoluteUrl(value: string | undefined, origin: string) {
  if (!value) {
    return undefined
  }

  try {
    return new URL(value, origin).toString()
  } catch {
    return value
  }
}

export default function SEO({
  title,
  description,
  image,
  url,
  type = DEFAULT_TYPE,
  imageWidth,
  imageHeight,
  facebookAppId,
  noIndex = false,
  keywords,
  children,
}: SEOProps) {
  const { pathname, search } = useLocation()

  const siteOrigin = useMemo(() => getSiteOrigin(), [])
  const canonical = useMemo(() => {
    const rawUrl = url ?? `${pathname}${search}`
    return toAbsoluteUrl(rawUrl, siteOrigin) ?? siteOrigin
  }, [url, pathname, search, siteOrigin])
  const imageUrl = useMemo(
    () => toAbsoluteUrl(image ?? DEFAULT_IMAGE, siteOrigin) ?? toAbsoluteUrl(DEFAULT_IMAGE, siteOrigin)!,
    [image, siteOrigin],
  )

  const pageTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE
  const metaDescription = description ?? DEFAULT_DESCRIPTION
  const robotsContent = noIndex ? 'noindex, nofollow' : 'index, follow'
  const metaKeywords =
    typeof keywords === 'string'
      ? keywords
      : Array.isArray(keywords)
        ? keywords.filter(Boolean).join(', ')
        : undefined
  const ogImageWidth = (imageWidth ?? DEFAULT_IMAGE_WIDTH).toString()
  const ogImageHeight = (imageHeight ?? DEFAULT_IMAGE_HEIGHT).toString()
  const fbAppId = facebookAppId ?? import.meta.env.VITE_FACEBOOK_APP_ID

  return (
    <Helmet prioritizeSeoTags>
      <title>{pageTitle}</title>
      <meta name="description" content={metaDescription} />

      <meta property="og:type" content={type} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:locale" content={DEFAULT_LOCALE} />
      <meta property="og:image:width" content={ogImageWidth} />
      <meta property="og:image:height" content={ogImageHeight} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={imageUrl} />

      <link rel="canonical" href={canonical} />
      <meta name="robots" content={robotsContent} />
      {metaKeywords ? <meta name="keywords" content={metaKeywords} /> : null}
      {fbAppId ? <meta property="fb:app_id" content={fbAppId} /> : null}

      {children}
    </Helmet>
  )
}
