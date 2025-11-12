import { useMemo, type ReactNode } from 'react'
import SEO, { type SEOProps } from './SEO'
import JsonLd from './JsonLd'

type JsonLdInput = Record<string, unknown> | Array<Record<string, unknown>> | null | undefined

type SeoHeadProps = SEOProps & {
  jsonLd?: JsonLdInput
  children?: ReactNode
}

function normalizeJsonLd(input: JsonLdInput) {
  if (!input) return []
  if (Array.isArray(input)) {
    return input.filter((item): item is Record<string, unknown> => Boolean(item && Object.keys(item).length))
  }
  return Object.keys(input).length ? [input] : []
}

export default function SeoHead({ jsonLd, children, ...rest }: SeoHeadProps) {
  const payloads = useMemo(() => normalizeJsonLd(jsonLd), [jsonLd])

  return (
    <>
      <SEO {...rest}>{children}</SEO>
      {payloads.map((data, index) => (
        <JsonLd key={index} data={data} />
      ))}
    </>
  )
}

export type { SeoHeadProps }
