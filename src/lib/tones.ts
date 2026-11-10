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

// ------------------------------------------------------------
// Color moderado: tintes suaves para etiquetas, íconos y botones
// (las clases se escriben completas para que Tailwind las genere)
// ------------------------------------------------------------

/** Etiqueta de estado: fondo claro + texto del color */
export const badgeTint: Record<IndicatorTone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  yellow: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  orange: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  gray: 'bg-gray-100 text-gray-700 ring-gray-500/20',
  purple: 'bg-violet-50 text-violet-700 ring-violet-600/20',
}

/** Recuadro de ícono */
export const iconTint: Record<IndicatorTone, string> = {
  green: 'bg-emerald-50 text-emerald-600',
  yellow: 'bg-amber-50 text-amber-600',
  orange: 'bg-orange-50 text-orange-600',
  red: 'bg-red-50 text-red-600',
  blue: 'bg-blue-50 text-blue-600',
  gray: 'bg-gray-100 text-gray-600',
  purple: 'bg-violet-50 text-violet-600',
}

/** Botón de acción suave (secundario con color) */
export const softButton: Record<IndicatorTone, string> = {
  green: 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100',
  yellow: 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100',
  orange: 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100',
  red: 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100',
  blue: 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100',
  gray: 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100',
  purple: 'bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100',
}

/** Color de cada acción sobre prendas */
export const actionTone: Record<string, IndicatorTone> = {
  lavado: 'blue',
  esterilizacion: 'blue',
  inspeccion: 'yellow',
  reparacion: 'orange',
  baja: 'red',
}

/** Franja lateral de tarjetas de categoría (semáforo, avisos) */
export const accentBar: Record<IndicatorTone, string> = dotColor
