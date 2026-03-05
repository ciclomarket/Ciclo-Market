import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { capturePageview } from '../analytics/posthog'

export default function PostHogPageviewTracker() {
  const location = useLocation()

  useEffect(() => {
    const path = `${location.pathname}${location.search}`
    capturePageview(path)
  }, [location.pathname, location.search])

  return null
}
