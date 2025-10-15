import { Helmet } from 'react-helmet-async'

const MEASUREMENT_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-9PZQB9FK57').trim()

export default function AnalyticsTag() {
  if (!MEASUREMENT_ID) return null
  return (
    <Helmet>
      <script id="gtag-loader" async src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`} />
      <script
        id="gtag-inline"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${MEASUREMENT_ID}', { send_page_view: false });
          `.trim()
        }}
      />
    </Helmet>
  )
}
