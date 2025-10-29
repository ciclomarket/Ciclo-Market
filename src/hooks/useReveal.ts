import { useEffect, useRef, useState } from 'react'

export function useReveal(options?: IntersectionObserverInit): [React.RefObject<HTMLElement>, boolean] {
  const ref = useRef<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true)
            obs.unobserve(e.target)
          }
        }
      },
      { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.15, ...(options || {}) }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [options])

  return [ref as React.RefObject<HTMLElement>, visible]
}

