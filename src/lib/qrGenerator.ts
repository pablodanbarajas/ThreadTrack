/**
 * Utilidad para generar URLs y datos de QR
 * El QR contiene solo el ID de la prenda, la información se obtiene del backend
 */

const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin

/**
 * Genera la URL que será codificada en el QR
 * Formato: https://tuapp.com/prenda/{garmentId}
 */
export function generateQRUrl(garmentId: string): string {
  return `${APP_URL}/prenda/${garmentId}`
}

/**
 * Deep link para aplicación móvil (opcional)
 * Formato: threadtrack://prenda/{garmentId}
 */
export function generateDeepLink(garmentId: string): string {
  return `threadtrack://prenda/${garmentId}`
}

/**
 * Extrae el ID de la prenda desde una URL de QR
 */
export function extractGarmentIdFromUrl(url: string): string | null {
  const match = url.match(/\/prenda\/([a-f0-9\-]+)/)
  return match ? match[1] : null
}

/**
 * Extrae el ID de la prenda desde un deep link
 */
export function extractGarmentIdFromDeepLink(deepLink: string): string | null {
  const match = deepLink.match(/threadtrack:\/\/prenda\/([a-f0-9\-]+)/)
  return match ? match[1] : null
}

/**
 * Detecta si es una URL de QR válida
 */
export function isValidQRUrl(text: string): boolean {
  return /^https?:\/\/.*\/prenda\/[a-f0-9\-]+$/.test(text) ||
         /^threadtrack:\/\/prenda\/[a-f0-9\-]+$/.test(text)
}

/**
 * Intenta extraer el garment ID de cualquier formato de QR
 */
export function extractGarmentId(qrContent: string): string | null {
  // Primero intenta como URL HTTP
  let id = extractGarmentIdFromUrl(qrContent)
  if (id) return id

  // Luego intenta como deep link
  id = extractGarmentIdFromDeepLink(qrContent)
  if (id) return id

  // Si el contenido ya es un UUID, devuélvelo directamente
  if (/^[a-f0-9\-]{36}$/.test(qrContent)) {
    return qrContent
  }

  return null
}
