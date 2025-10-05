
export function initAnalytics() {
  const GA = import.meta.env.VITE_GA_ID
  if (!GA) return
  // gtag loader
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA}`
  document.head.appendChild(s)
  ;(window as any).dataLayer = (window as any).dataLayer || [];
  function gtag(...args: unknown[]) { (window as any).dataLayer.push(args) }
  ;(window as any).gtag = gtag
  gtag('js', new Date())
  gtag('config', GA)
}
