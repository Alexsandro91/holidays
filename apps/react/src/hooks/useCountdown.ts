import { useCallback, useEffect, useState } from 'react'

interface Countdown {
  secondsLeft: number
  start: (seconds: number) => void
}

/** Conto alla rovescia in secondi. `start()` va chiamato da un gestore di evento, non durante il render. */
export const useCountdown = (initialSeconds = 0): Countdown => {
  const [deadline, setDeadline] = useState<number | null>(() => (initialSeconds > 0 ? Date.now() + initialSeconds * 1000 : null))
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (deadline === null) return
    const id = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= deadline) window.clearInterval(id)
    }, 250)
    return () => window.clearInterval(id)
  }, [deadline])

  const start = useCallback((seconds: number) => {
    const current = Date.now()
    setNow(current)
    setDeadline(current + seconds * 1000)
  }, [])

  return { secondsLeft: deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000)), start }
}
