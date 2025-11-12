import { useMemo, type ReactNode } from 'react'
import { Helmet } from 'react-helmet-async'
import { useLocation } from 'react-router-dom'
import { resolveSiteOrigin, toAbsoluteUrl as absoluteUrl, DEFAULT_SITE_ORIGIN } from '../utils/seo'

export type SEOProps = {
  title?: string
  description?: string
  image?: string
  url?: string
  canonicalPath?: string
  ogImageUrl?: string
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
const DEFAULT_IMAGE = `${DEFAULT_SITE_ORIGIN}/logo-azul.png`
const DEFAULT_URL = DEFAULT_SITE_ORIGIN
const DEFAULT_TYPE: NonNullable<SEOProps['type']> = 'website'
const DEFAULT_LOCALE = 'es_AR'
const DEFAULT_IMAGE_WIDTH = 1200
const DEFAULT_IMAGE_HEIGHT = 630

const TRACKING_PARAM_REGEX =
  /^(?:utm_(?:source|medium|campaign|term|content)|utm_[a-z0-9]+|fbclid|gclid|dclid|yclid|mc_(?:cid|eid)|msclkid|_hs(?:mi|enc)|hs_(?:enc|mi)|igshid|scid|cmpid|ef_id|pk_(?:source|medium|campaign|keyword)|s_kwcid|vero_id|vero_conv|ga_(?:cid|client)|wbraid|gbraid|ref(?:errer|_id)?|campaignid|adgroupid|ad_(?:id|set_id)|creative|device|keyword|matchtype|placement|target)$/i

function normalizePathname(pathname: string) {
  if (!pathname) return '/'
  let normalized = pathname.trim()
  if (!normalized.startsWith('/')) normalized = `/${normalized}`
  normalized = normalized.replace(/\/{2,}/g, '/')
  if (normalized.length > 1) normalized = normalized.replace(/\/+$/, '')
  return normalized || '/'
}

function normalizeSearch(search: string) {
  if (!search) return ''
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  const entries: Array<{ key: string; value: string }> = []
  const seen = new Set<string>()
  for (const key of params.keys()) {
    if (TRACKING_PARAM_REGEX.test(key)) {
      continue
    }
    const values = params.getAll(key).map((value) => value.trim()).filter(Boolean)
    for (const value of values) {
      const signature = `${key.toLowerCase()}=${value.toLowerCase()}`
      if (seen.has(signature)) continue
      seen.add(signature)
      entries.push({ key, value })
    }
  }
  if (!entries.length) return ''
  entries.sort((a, b) => {
    const keyCompare = a.key.localeCompare(b.key)
    if (keyCompare !== 0) return keyCompare
    return a.value.localeCompare(b.value)
  })
  const normalizedParams = new URLSearchParams()
  for (const { key, value } of entries) {
    normalizedParams.append(key, value)
  }
  const normalized = normalizedParams.toString()
  return normalized ? `?${normalized}` : ''
}

function buildCanonical(
  siteOrigin: string,
  options: { url?: string; pathname: string; search: string; canonicalPath?: string },
) {
  const { url, pathname, search, canonicalPath } = options

  if (url) {
    return absoluteUrl(url, siteOrigin) ?? siteOrigin
  }

  let pathPart = normalizePathname(pathname)
  let searchPart = normalizeSearch(search)

  if (canonicalPath) {
    const [rawPathname, rawSearch] = canonicalPath.split('?')
    pathPart = normalizePathname(rawPathname || '/')
    searchPart = rawSearch ? normalizeSearch(`?${rawSearch}`) : ''
  }

  const cleanedPath = `${pathPart}${searchPart}`
  try {
    const canonicalUrl = new URL(cleanedPath, siteOrigin)
    canonicalUrl.hash = ''
    canonicalUrl.search = canonicalUrl.search ? normalizeSearch(canonicalUrl.search) : ''
    const asString = canonicalUrl.toString().replace(/\/$/, pathPart === '/' ? '/' : '')
    return asString
  } catch {
    return `${siteOrigin}${cleanedPath}`
  }
}

function clampDescription(text: string | undefined) {
  const fallback = DEFAULT_DESCRIPTION
  const value = (text ?? fallback).replace(/\s+/g, ' ').trim()
  if (value.length <= 160) return value
  return `${value.slice(0, 157).trimEnd()}…`
}

export default function SEO({
  title,
  description,
  image,
  ogImageUrl,
  url,
  canonicalPath,
  type = DEFAULT_TYPE,
  imageWidth,
  imageHeight,
  facebookAppId,
  noIndex = false,
  keywords,
  children,
}: SEOProps) {
  const { pathname, search } = useLocation()

  const siteOrigin = useMemo(() => resolveSiteOrigin(), [])
  const canonical = useMemo(
    () =>
      buildCanonical(siteOrigin, {
        url,
        pathname,
        search,
        canonicalPath,
      }),
    [siteOrigin, url, pathname, search, canonicalPath],
  )
  const imageUrl = useMemo(() => {
    const preferred = ogImageUrl ?? image ?? DEFAULT_IMAGE
    return absoluteUrl(preferred, siteOrigin) ?? absoluteUrl(DEFAULT_IMAGE, siteOrigin)!
  }, [ogImageUrl, image, siteOrigin])

  const pageTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE
  const metaDescription = clampDescription(description)
  const robotsContent = noIndex ? 'noindex, follow' : 'index, follow'
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
      <meta property="og:image:secure_url" content={imageUrl} />

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
