// Edge Function: alta de usuarios y restablecimiento de contraseña.
//
// Solo esta función usa la service role key (para crear cuentas en Supabase
// Auth). Todas las reglas de negocio —rol del solicitante, empresa, módulos y
// límite de usuarios contratados— se validan en la base de datos ejecutando
// las RPC con la identidad del administrador que hace la petición, así que
// quedan atribuidas a él en el audit trail.
//
// Acciones:
//   { action: 'create', email, role, modules: string[], organization_id?, team_id? }
//   { action: 'reset_password', user_id }
// Respuesta: { ok: true, temporary_password, user_id? } | { ok: false, error }
import { createClient } from 'npm:@supabase/supabase-js@2.93.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// Contraseña temporal: 16 caracteres, cumple la política (mayúscula, minúscula, número, símbolo)
function temporaryPassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '#$%&*+-=?@']
  const all = sets.join('')
  const rand = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n
  const chars = sets.map((s) => s[rand(s.length)])
  while (chars.length < 16) chars.push(all[rand(all.length)])
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ ok: false, error: 'No autenticado' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  // Cliente con la identidad del administrador (aplica RLS y reglas de la base)
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  // Cliente de servicio: solo para operaciones de Supabase Auth
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Solicitud inválida' }, 400)
  }

  try {
    if (body.action === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase()
      const role = String(body.role ?? '')
      const modules = Array.isArray(body.modules) ? body.modules.map(String) : []
      const teamId = body.team_id ? String(body.team_id) : null

      const { data: prep, error: prepError } = await caller.rpc('admin_prepare_new_user', {
        p_email: email,
        p_role: role,
        p_modules: modules,
        p_organization_id: body.organization_id ?? null,
      })
      if (prepError) return json({ ok: false, error: prepError.message }, 403)
      if (!prep?.ok) return json({ ok: false, error: prep?.error ?? 'No autorizado' }, 403)

      const password = temporaryPassword()
      const { data: created, error: createError } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (createError || !created.user) {
        return json({ ok: false, error: createError?.message ?? 'No se pudo crear la cuenta' }, 400)
      }

      const { error: finError } = await caller.rpc('admin_finalize_new_user', {
        p_user_id: created.user.id,
        p_role: role,
        p_modules: modules,
        p_organization_id: prep.organization_id,
        p_team_id: teamId,
      })
      if (finError) {
        // Deshacer: la cuenta no debe quedar creada sin empresa
        await service.auth.admin.deleteUser(created.user.id)
        return json({ ok: false, error: finError.message }, 400)
      }

      return json({ ok: true, user_id: created.user.id, temporary_password: password })
    }

    if (body.action === 'reset_password') {
      const userId = String(body.user_id ?? '')
      const { data: canManage, error: canError } = await caller.rpc('can_manage_user', { p_target: userId })
      if (canError || !canManage) return json({ ok: false, error: 'No puedes administrar a este usuario' }, 403)

      const password = temporaryPassword()
      const { error: updError } = await service.auth.admin.updateUserById(userId, { password })
      if (updError) return json({ ok: false, error: updError.message }, 400)

      const { error: markError } = await caller.rpc('admin_mark_password_reset', { p_user_id: userId })
      if (markError) return json({ ok: false, error: markError.message }, 400)

      return json({ ok: true, temporary_password: password })
    }

    return json({ ok: false, error: 'Acción desconocida' }, 400)
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : 'Error inesperado' }, 500)
  }
})
