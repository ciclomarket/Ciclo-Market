export function detectInAppBrowser(ua?: string): { isInApp: boolean; agent: 'instagram' | 'facebook' | 'messenger' | 'tiktok' | 'twitter' | 'other' | null } {
  // Test/override via query param: ?inapp=1 (force) / ?inapp=0 (disable)
  try {
    const sp = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    const override = sp.get('inapp')
    if (override === '1') return { isInApp: true, agent: 'other' }
    if (override === '0') return { isInApp: false, agent: null }
  } catch (err) {
    console.warn('[inapp] search params unavailable', err)
  }
  const s = (ua || (typeof navigator !== 'undefined' ? (navigator.userAgent || (navigator as any).vendor || (window as any).opera || '') : '')).toString()
  const lower = s.toLowerCase()
  if (/instagram/i.test(s)) return { isInApp: true, agent: 'instagram' }
  if (/fban|fbav/i.test(s)) return { isInApp: true, agent: 'facebook' }
  if (/messenger/i.test(s)) return { isInApp: true, agent: 'messenger' }
  if (/tiktok/i.test(lower)) return { isInApp: true, agent: 'tiktok' }
  if (/twitter/i.test(lower)) return { isInApp: true, agent: 'twitter' }
  return { isInApp: false, agent: null }
}

export function canUseOAuthInContext(): boolean {
  // Bloquear navegadores embebidos conocidos
  return !detectInAppBrowser().isInApp
}
