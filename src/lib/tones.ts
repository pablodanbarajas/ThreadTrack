// Paleta de indicadores de estado. Las tarjetas y etiquetas se mantienen
// neutras (blanco/gris); el color solo aparece en el punto indicador.
export type IndicatorTone = 'green' | 'yellow' | 'orange' | 'red' | 'blue' | 'gray' | 'purple'

export const dotColor: Record<IndicatorTone, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-400',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  gray: 'bg-gray-400',
  purple: 'bg-violet-500',
}

export const garmentStatusTone: Record<string, IndicatorTone> = {
  disponible: 'green',
  lavado: 'blue',
  esterilizacion: 'blue',
  inspeccion: 'yellow',
  reparacion: 'orange',
  baja: 'red',
}

export const garmentStatusLabel: Record<string, string> = {
  disponible: 'Disponible',
  lavado: 'Lavado y esterilización',
  esterilizacion: 'Lavado y esterilización',
  inspeccion: 'En inspección',
  reparacion: 'En reparación',
  baja: 'Baja',
}

// Semáforo de vida útil (verde/amarillo/naranja/rojo)
export const lifeTone: Record<string, IndicatorTone> = {
  verde: 'green',
  amarillo: 'yellow',
  naranja: 'orange',
  rojo: 'red',
}

export const hoseStatusTone: Record<string, IndicatorTone> = {
  activa: 'green',
  danada: 'orange',
  reemplazada: 'gray',
  baja: 'red',
}
