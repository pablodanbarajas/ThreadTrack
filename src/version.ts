// Versión de ThreadTrack (control de configuración, GAMP 5 / Anexo 11 §10).
// APP_VERSION se incrementa en cada liberación; APP_BUILD identifica el commit
// exacto desplegado (lo inyecta Vite desde Vercel; "local" en desarrollo).
declare const __APP_BUILD__: string

export const APP_VERSION = '1.3.0'
export const APP_BUILD: string = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'local'
export const APP_VERSION_FULL = `${APP_VERSION} (${APP_BUILD})`
