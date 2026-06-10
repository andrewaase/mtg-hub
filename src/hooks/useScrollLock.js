// src/hooks/useScrollLock.js
// Locks page scrolling while a modal/overlay is mounted (or while `active` is true).
// Stacks safely across multiple simultaneously-open overlays via a shared counter.
import { useEffect } from 'react'

let lockCount = 0

export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return
    lockCount++
    document.body.style.overflow = 'hidden'
    const main = document.getElementById('main')
    if (main) main.style.overflow = 'hidden'
    return () => {
      lockCount = Math.max(0, lockCount - 1)
      if (lockCount === 0) {
        document.body.style.overflow = ''
        if (main) main.style.overflow = ''
      }
    }
  }, [active])
}
