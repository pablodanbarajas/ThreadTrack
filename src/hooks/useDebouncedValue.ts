import { useEffect, useState } from 'react'

/** Devuelve el valor después de `delay` ms sin cambios (búsquedas en el servidor). */
export const useDebouncedValue = <T,>(value: T, delay = 300): T => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}
