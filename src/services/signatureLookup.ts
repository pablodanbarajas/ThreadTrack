import { supabase } from '../lib/supabase'

/** Manifestación de una firma electrónica (21 CFR Part 11 §11.50) */
export interface SignatureManifest {
  id: string
  user_name: string | null
  user_email: string
  user_role: string
  meaning: string
  signed_at: string
}

// Cache y agrupación: varias tarjetas que piden firmas en el mismo ciclo
// se resuelven con una sola consulta.
const cache = new Map<string, Promise<SignatureManifest | null>>()
let pending: { id: string; resolve: (s: SignatureManifest | null) => void }[] = []
let scheduled = false

const flush = async () => {
  scheduled = false
  const batch = pending
  pending = []
  const ids = [...new Set(batch.map((b) => b.id))]
  const found = new Map<string, SignatureManifest>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from('electronic_signatures')
      .select('id, user_name, user_email, user_role, meaning, signed_at')
      .in('id', ids.slice(i, i + 200))
    for (const s of (data || []) as SignatureManifest[]) found.set(s.id, s)
  }
  for (const b of batch) b.resolve(found.get(b.id) ?? null)
}

export const getSignature = (id: string): Promise<SignatureManifest | null> => {
  const hit = cache.get(id)
  if (hit) return hit
  const p = new Promise<SignatureManifest | null>((resolve) => {
    pending.push({ id, resolve })
    if (!scheduled) {
      scheduled = true
      queueMicrotask(flush)
    }
  })
  cache.set(id, p)
  return p
}

/** Varias firmas de una vez (para reportes) */
export const getSignatures = async (ids: string[]): Promise<Map<string, SignatureManifest>> => {
  const unique = [...new Set(ids.filter(Boolean))]
  const out = new Map<string, SignatureManifest>()
  const results = await Promise.all(unique.map((id) => getSignature(id)))
  results.forEach((s) => { if (s) out.set(s.id, s) })
  return out
}

export const signatureLine = (s: SignatureManifest) =>
  `${s.user_name || s.user_email} · ${new Date(s.signed_at).toLocaleString('es-MX')} · ${s.meaning}`
