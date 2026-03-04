/**
 * Parser y validador para códigos de uniformes
 * Formato: LOTE-PRENDA-TALLA-COLOR-NNN
 * Ejemplo: 202512A-OV-M-NE-004
 */

export const GARMENT_TYPES = {
  OV: 'Overol',
  ZA: 'Zapatón',
  ES: 'Escafandra',
  BO: 'Bolsa',
  FI: 'Filipina',
  PA: 'Pantalón',
  BT: 'Bota',
  CO: 'Cofia',
} as const

export const COLORS = {
  BL: 'Blanco',
  AC: 'Azul Cielo',
  AM: 'Azul Marino',
  BG: 'Beige',
  VM: 'Verde Menta',
  VJ: 'Verde Jade',
  RS: 'Rosa',
  RO: 'Rojo',
  NA: 'Naranja',
  NE: 'Negro',
  GO: 'Gris Oxford',
  GP: 'Gris Plata',
  AR: 'Azul Rey',
  CF: 'Café',
} as const

export const SIZES = {
  XS: 'XS',
  S: 'S',
  M: 'M',
  L: 'L',
  XL: 'XL',
  '2X': '2XL',
  '3X': '3XL',
  '4X': '4XL',
  '5X': '5XL',
  '6X': '6XL',
} as const

export type GarmentType = keyof typeof GARMENT_TYPES
export type Color = keyof typeof COLORS
export type Size = keyof typeof SIZES

export interface ParsedGarmentCode {
  valid: true
  batchCode: string // 202512A
  batchYear: number // 2025
  batchMonth: number // 12
  batchSuffix: string // A
  garmentType: GarmentType // OV
  garmentName: string // Overol
  size: Size // M
  sizeName: string // M
  color: Color // NE
  colorName: string // Negro
  sequenceNumber: number // 004
  fullCode: string // 202512A-OV-M-NE-004
}

export interface ParseError {
  valid: false
  error: string
}

/**
 * Parsea un código de uniforme y extrae sus componentes
 * @param code - Código a parsear (ej: 202512A-OV-M-NE-004)
 * @returns Objeto con componentes parseados o error
 */
export function parseGarmentCode(
  code: string
): ParsedGarmentCode | ParseError {
  // Limpiar espacios
  const cleanCode = code.trim().toUpperCase()

  // Validar formato general
  const parts = cleanCode.split('-')
  if (parts.length !== 5) {
    return {
      valid: false,
      error: 'El código debe tener 5 componentes separados por guiones (LOTE-PRENDA-TALLA-COLOR-NNN)',
    }
  }

  const [batchCode, garmentTypeCode, sizeCode, colorCode, sequenceStr] = parts

  // Validar lote (ej: 202512A)
  const batchMatch = batchCode.match(/^(\d{4})(\d{2})([A-Z]?)$/)
  if (!batchMatch) {
    return {
      valid: false,
      error: 'Código de lote inválido. Formato: YYYYMMX (ej: 202512A)',
    }
  }

  const [, yearStr, monthStr, batchSuffix] = batchMatch
  const batchYear = parseInt(yearStr)
  const batchMonth = parseInt(monthStr)

  if (batchMonth < 1 || batchMonth > 12) {
    return {
      valid: false,
      error: 'Mes inválido en el código de lote (debe ser 01-12)',
    }
  }

  // Validar prenda
  const garmentType = garmentTypeCode as GarmentType
  if (!GARMENT_TYPES[garmentType]) {
    const validCodes = Object.keys(GARMENT_TYPES).join(', ')
    return {
      valid: false,
      error: `Código de prenda inválido. Códigos válidos: ${validCodes}`,
    }
  }

  // Validar talla
  const size = sizeCode as Size
  if (!SIZES[size]) {
    const validCodes = Object.keys(SIZES).join(', ')
    return {
      valid: false,
      error: `Talla inválida. Tallas válidas: ${validCodes}`,
    }
  }

  // Validar color
  const color = colorCode as Color
  if (!COLORS[color]) {
    const validCodes = Object.keys(COLORS).join(', ')
    return {
      valid: false,
      error: `Código de color inválido. Códigos válidos: ${validCodes}`,
    }
  }

  // Validar número de secuencia
  const sequenceNumber = parseInt(sequenceStr)
  if (
    isNaN(sequenceNumber) ||
    sequenceNumber < 1 ||
    sequenceNumber > 999 ||
    sequenceStr.length !== 3
  ) {
    return {
      valid: false,
      error: 'Número de secuencia inválido (debe ser 001-999)',
    }
  }

  return {
    valid: true,
    batchCode,
    batchYear,
    batchMonth,
    batchSuffix,
    garmentType,
    garmentName: GARMENT_TYPES[garmentType],
    size,
    sizeName: SIZES[size],
    color,
    colorName: COLORS[color],
    sequenceNumber,
    fullCode: cleanCode,
  }
}

/**
 * Valida si un código cumple el formato correcto
 */
export function isValidGarmentCode(code: string): boolean {
  const result = parseGarmentCode(code)
  return result.valid
}

/**
 * Obtiene información legible del código
 */
export function getGarmentInfo(code: string): string {
  const result = parseGarmentCode(code)

  if (!result.valid) {
    return `Error: ${result.error}`
  }

  return `${result.garmentName} - Talla ${result.sizeName} - ${result.colorName} - Lote ${result.batchCode} #${result.sequenceNumber}`
}

/**
 * Filtra prendas por tipo
 */
export function filterByGarmentType(
  codes: string[],
  garmentType: GarmentType
): ParsedGarmentCode[] {
  return codes
    .map((code) => parseGarmentCode(code))
    .filter((result): result is ParsedGarmentCode => result.valid && result.garmentType === garmentType)
}

/**
 * Filtra prendas por color
 */
export function filterByColor(
  codes: string[],
  color: Color
): ParsedGarmentCode[] {
  return codes
    .map((code) => parseGarmentCode(code))
    .filter((result): result is ParsedGarmentCode => result.valid && result.color === color)
}

/**
 * Filtra prendas por talla
 */
export function filterBySize(
  codes: string[],
  size: Size
): ParsedGarmentCode[] {
  return codes
    .map((code) => parseGarmentCode(code))
    .filter((result): result is ParsedGarmentCode => result.valid && result.size === size)
}

/**
 * Filtra prendas por lote
 */
export function filterByBatch(
  codes: string[],
  batchCode: string
): ParsedGarmentCode[] {
  return codes
    .map((code) => parseGarmentCode(code))
    .filter((result): result is ParsedGarmentCode => result.valid && result.batchCode === batchCode)
}

/**
 * Filtra prendas con múltiples criterios
 */
export function filterGarments(
  codes: string[],
  filters: Partial<{
    garmentType: GarmentType
    color: Color
    size: Size
    batchCode: string
  }>
): ParsedGarmentCode[] {
  return codes
    .map((code) => parseGarmentCode(code))
    .filter((result): result is ParsedGarmentCode => {
      if (!result.valid) return false

      if (
        filters.garmentType &&
        result.garmentType !== filters.garmentType
      )
        return false
      if (filters.color && result.color !== filters.color) return false
      if (filters.size && result.size !== filters.size) return false
      if (filters.batchCode && result.batchCode !== filters.batchCode)
        return false

      return true
    })
}

/**
 * Genera un código basado en componentes
 */
export function generateGarmentCode(
  batchCode: string,
  garmentType: GarmentType,
  size: Size,
  color: Color,
  sequenceNumber: number
): string {
  return `${batchCode}-${garmentType}-${size}-${color}-${String(sequenceNumber).padStart(3, '0')}`
}
