/**
 * Utilidad para generar URLs y datos de QR
 * El QR contiene solo el ID de la prenda, la información se obtiene del backend
 */

const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin

const UUID_STRICT_RE = /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i
const UUID_FUZZY_RE = /([a-f0-9]{8})[^a-f0-9]?([a-f0-9]{4})[^a-f0-9]?([a-f0-9]{4})[^a-f0-9]?([a-f0-9]{4})[^a-f0-9]?([a-f0-9]{12})/i

function extractUuidFromText(text: string): string | null {
  const clean = text.trim().toLowerCase()

  const strict = clean.match(UUID_STRICT_RE)
  if (strict) return strict[0]

  const fuzzy = clean.match(UUID_FUZZY_RE)
  if (!fuzzy) return null

  const [, a, b, c, d, e] = fuzzy
  return `${a}-${b}-${c}-${d}-${e}`
}

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
  const clean = url.trim().toLowerCase()
  const match = clean.match(/\/prenda\/([a-f0-9\-]+)/)
  if (match) return match[1]

  // Fallback para lecturas de pistola con layout/teclas alteradas.
  return extractUuidFromText(clean)
}

/**
 * Extrae el ID de la prenda desde un deep link
 */
export function extractGarmentIdFromDeepLink(deepLink: string): string | null {
  const clean = deepLink.trim().toLowerCase()
  const match = clean.match(/threadtrack:\/\/prenda\/([a-f0-9\-]+)/)
  if (match) return match[1]

  return extractUuidFromText(clean)
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
  const asUuid = extractUuidFromText(qrContent)
  if (asUuid) return asUuid

  return null
}
