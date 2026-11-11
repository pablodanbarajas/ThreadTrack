import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Pruebas de las migraciones contra Postgres real (PGlite, en memoria).
// Uso: npm run test:db
const migDir = process.argv[2] ?? fileURLToPath(new URL('../migrations', import.meta.url))
const db = new PGlite()
let pass = 0, fail = 0

await db.exec(readFileSync(new URL('./base.sql', import.meta.url), 'utf8'))
for (const f of readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()) {
  try {
    await db.exec(readFileSync(join(migDir, f), 'utf8'))
    console.log('MIGRACIÓN OK  ', f)
  } catch (e) {
    console.log('MIGRACIÓN FALLÓ', f, '→', e.message)
    process.exit(1)
  }
}

const USERS = {
  jefeA: ['11111111-1111-1111-1111-111111111111', 'jefe@a.test'],
  opA: ['22222222-2222-2222-2222-222222222222', 'operador@a.test'],
  jefeB: ['33333333-3333-3333-3333-333333333333', 'jefe@b.test'],
  admin: ['44444444-4444-4444-4444-444444444444', 'admin@x.test'],
}
const G = "'aaaaaaaa-0000-0000-0000-000000000001'"
const H = "'cccccccc-0000-0000-0000-000000000001'"
const P = "'dddddddd-0000-0000-0000-000000000001'"
const E = "'eeeeeeee-0000-0000-0000-000000000001'"

// Ejecuta sql como visitante sin sesión (rol anon = la anon key pública)
async function asAnon(sql) {
  return db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE anon; SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);`)
    return tx.query(sql)
  })
}

// Ejecuta sql como usuario autenticado de Supabase (rol authenticated + JWT)
async function as(user, sql) {
  const [sub, email] = USERS[user]
  const claims = JSON.stringify({ sub, email, role: 'authenticated' })
  return db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '${claims}', true);`)
    return tx.query(sql)
  })
}
async function expectOk(name, fn) {
  try { const r = await fn(); console.log('  ✔', name); pass++; return r }
  catch (e) { console.log('  ✘', name, '→', e.message); fail++ }
}
async function expectErr(name, fn, re) {
  try { await fn(); console.log('  ✘', name, '→ no lanzó error'); fail++ }
  catch (e) {
    if (re && !re.test(e.message)) { console.log('  ✘', name, '→ error inesperado:', e.message); fail++ }
    else { console.log('  ✔', name, `(${e.message})`); pass++ }
  }
}
async function expectRows(name, fn, n) {
  try {
    const r = await fn(); const got = r.rows.length ?? r.affectedRows
    if (got === n) { console.log('  ✔', name); pass++ } else { console.log('  ✘', name, `→ ${got} filas, esperaba ${n}`); fail++ }
  } catch (e) { console.log('  ✘', name, '→', e.message); fail++ }
}
const one = async (sql) => (await db.query(sql)).rows[0]

console.log('\n— Acceso sin sesión (anon key)')
await expectErr('anon NO lee movements', () => asAnon(`SELECT * FROM movements`), /permission denied/)
await expectErr('anon NO borra movements', () => asAnon(`DELETE FROM movements`), /permission denied/)
await expectErr('anon NO lee prendas', () => asAnon(`SELECT * FROM garments`), /permission denied/)
await expectErr('anon NO lee documentos', () => asAnon(`SELECT * FROM documents`), /permission denied/)
await expectErr('anon NO ejecuta RPCs', () =>
  asAnon(`SELECT * FROM register_garment_action(${G}, 'lavado', 'x')`), /permission denied/)
await expectErr('anon NO ejecuta funciones heredadas (get_my_role)', () =>
  asAnon(`SELECT get_my_role()`), /permission denied/)
await expectErr('authenticated NO invoca funciones de trigger', () =>
  as('jefeA', `SELECT audit_log_change()`), /permission denied/)
await expectOk('authenticated sí ejecuta helpers de RLS', () => as('opA', `SELECT get_my_role(), can_access_garment(${G})`))

console.log('\n— Documentos')
await expectRows('jefe de otro equipo NO ve documentos ajenos', () => as('jefeB', `SELECT * FROM documents`), 0)
await expectRows('jefe del equipo sí ve sus documentos', () => as('jefeA', `SELECT * FROM documents`), 1)
await expectRows('operador NO puede borrar documentos', () => as('opA', `DELETE FROM documents RETURNING id`), 0)
await expectErr('jefe de otro equipo NO inserta documentos ajenos', () =>
  as('jefeB', `INSERT INTO documents (garment_id, type, url) VALUES (${G}, 'otro', 'x')`), /row-level security/)
await expectRows('movements de otro equipo no visibles', () => as('jefeB', `SELECT * FROM movements`), 0)

console.log('\n— Prendas')
await expectOk('operador registra lavado', () =>
  as('opA', `SELECT * FROM register_garment_action(${G}, 'lavado', 'María')`))
let a = await one(`SELECT * FROM garment_actions WHERE recorded_by = '${USERS.opA[0]}' ORDER BY created_at DESC LIMIT 1`)
const okRec = a && a.recorded_by_email === 'operador@a.test' && a.performed_by === 'operador@a.test' && a.recorded_by_name === 'operador@a.test'
console.log(okRec ? '  ✔ responsable = usuario en sesión (se ignora el nombre enviado por el cliente)' : '  ✘ ' + JSON.stringify(a)); okRec ? pass++ : fail++
await db.query(`UPDATE user_profiles SET full_name = 'María López' WHERE id = '${USERS.opA[0]}'`)
await as('opA', `SELECT * FROM register_garment_action(${G}, 'lavado', NULL)`)
a = await one(`SELECT * FROM garment_actions WHERE recorded_by = '${USERS.opA[0]}' ORDER BY created_at DESC LIMIT 1`)
const okName = a.performed_by === 'María López' && a.recorded_by_name === 'María López'
console.log(okName ? '  ✔ con nombre completo: el registro guarda el nombre del usuario' : '  ✘ ' + JSON.stringify(a)); okName ? pass++ : fail++
await expectErr('operador NO puede dar de baja', () =>
  as('opA', `SELECT * FROM register_garment_action(${G}, 'baja', 'María', NULL, 'rota')`), /Solo jefe/)
await expectErr('operador NO puede baja vía inspección', () =>
  as('opA', `SELECT * FROM register_garment_action(${G}, 'inspeccion', 'María', 'baja', 'rota')`), /Solo jefe/)
await expectErr('jefe de otro equipo no accede', () =>
  as('jefeB', `SELECT * FROM register_garment_action(${G}, 'lavado', 'X')`), /Sin acceso/)
await expectErr('UPDATE directo a garment_actions bloqueado', () =>
  as('jefeA', `UPDATE garment_actions SET performed_by = 'otro'`))
await expectErr('DELETE directo a garment_actions bloqueado', () =>
  as('admin', `DELETE FROM garment_actions`))
await expectErr('incluso superusuario no puede borrar historial', () =>
  db.query(`DELETE FROM garment_actions`), /inmutables/)
await expectErr('INSERT directo a garment_actions bloqueado', () =>
  as('jefeA', `INSERT INTO garment_actions (garment_id, action_type, performed_by) VALUES (${G}, 'lavado', 'x')`))
await expectErr('UPDATE directo a garments bloqueado', () =>
  as('opA', `UPDATE garments SET status = 'baja'`), /permission denied/)
await expectErr('operador NO puede editar prenda', () =>
  as('opA', `SELECT * FROM update_garment(${G}, 'Nuevo', NULL, NULL, NULL, NULL, 'motivo')`), /Sin permisos/)
await expectErr('editar sin motivo rechazado', () =>
  as('jefeA', `SELECT * FROM update_garment(${G}, 'Nuevo', NULL, NULL, NULL, NULL, '')`), /MOTIVO/)
await expectOk('jefe edita prenda con motivo', () =>
  as('jefeA', `SELECT * FROM update_garment(${G}, 'Bata A (corregida)', NULL, 'Cliente X', NULL, NULL, 'Corrección de nombre')`))
let au = await one(`SELECT * FROM audit_log WHERE table_name='garments' AND operation='UPDATE' AND reason='Corrección de nombre'`)
const okAudit = au && au.old_data.name === 'Bata A' && au.new_data.name === 'Bata A (corregida)' && au.user_email === 'jefe@a.test' && au.changed_fields.includes('name')
console.log(okAudit ? '  ✔ audit_log guarda usuario, valor anterior/nuevo, campos y motivo' : '  ✘ audit_log incompleto', au?.changed_fields)
okAudit ? pass++ : fail++
await expectErr('baja SIN firma electrónica rechazada', () =>
  as('jefeA', `SELECT * FROM register_garment_action(${G}, 'baja', 'Pedro', NULL, 'Tela rota')`), /firma/)
await expectErr('resultado de inspección SIN firma rechazado', () =>
  as('jefeA', `SELECT * FROM register_garment_action(${G}, 'inspeccion', 'Pedro', 'aprobado')`), /firma/)
let badSig = (await as('jefeA', `SELECT request_signature('incorrecta') r`)).rows[0].r
console.log(!badSig.ok ? '  ✔ firma con contraseña incorrecta rechazada' : '  ✘ firma incorrecta aceptada'); !badSig.ok ? pass++ : fail++
let failLogged = await one(`SELECT count(*)::int n FROM login_attempts WHERE email = 'jefe@a.test' AND source = 'firma' AND NOT success`)
console.log(failLogged.n === 1 ? '  ✔ intento de firma fallido queda registrado' : '  ✘ intento no registrado: ' + failLogged.n); failLogged.n === 1 ? pass++ : fail++
let sigJefe = (await as('jefeA', `SELECT request_signature('Secreta123!') r`)).rows[0].r
console.log(sigJefe.ok && sigJefe.token ? '  ✔ firma con contraseña correcta emite token' : '  ✘ token no emitido'); sigJefe.ok ? pass++ : fail++
await expectErr('token de firma de otro usuario no sirve', () =>
  as('admin', `SELECT * FROM register_garment_action(${G}, 'inspeccion', 'X', 'aprobado', NULL, '${sigJefe.token}')`), /firma/)
await expectOk('jefe da de baja con motivo y firma', () =>
  as('jefeA', `SELECT * FROM register_garment_action(${G}, 'baja', 'Pedro', NULL, 'Tela rota', '${sigJefe.token}')`))
let sig = await one(`SELECT s.meaning, s.user_email, s.user_role, a.signature_id IS NOT NULL linked
  FROM electronic_signatures s JOIN garment_actions a ON a.signature_id = s.id WHERE a.action_type = 'baja'`)
const okSig = sig && sig.linked && sig.user_email === 'jefe@a.test' && /baja/.test(sig.meaning) && sig.user_role === 'jefe'
console.log(okSig ? `  ✔ firma ligada a la acción (quién, rol, significado: "${sig.meaning}")` : '  ✘ firma no ligada'); okSig ? pass++ : fail++
let sigName = await one(`SELECT user_name FROM electronic_signatures ORDER BY signed_at DESC LIMIT 1`)
console.log(sigName?.user_name === 'jefe@a.test' ? '  ✔ la firma guarda el nombre impreso del firmante' : '  ✘ ' + JSON.stringify(sigName)); sigName?.user_name ? pass++ : fail++
await expectErr('firmas electrónicas inmutables', () => db.query(`DELETE FROM electronic_signatures`), /inmutables/)
let g = await one(`SELECT status, baja_reason FROM garments WHERE id = ${G}`)
console.log(g.status === 'baja' && g.baja_reason === 'Tela rota' ? '  ✔ estado y motivo de baja aplicados' : '  ✘ baja no aplicada'); g.status === 'baja' ? pass++ : fail++
let mv = await one(`SELECT count(*)::int n FROM movements WHERE garment_id = ${G}`)
console.log(mv.n === 4 ? '  ✔ movimientos registrados en la misma transacción' : '  ✘ movimientos: ' + mv.n); mv.n === 4 ? pass++ : fail++
await expectErr('DELETE directo de prenda no permitido', () =>
  as('jefeA', `DELETE FROM garments WHERE id = ${G}`))
await expectErr('supervisor/operador no archiva', () =>
  as('opA', `SELECT * FROM archive_garment(${G}, 'x')`), /Solo jefe/)
await expectOk('jefe archiva con motivo', () => as('jefeA', `SELECT * FROM archive_garment(${G}, 'Duplicada')`))
await expectErr('prenda archivada no admite acciones', () =>
  as('jefeA', `SELECT * FROM register_garment_action(${G}, 'lavado', 'x')`), /archivada/)
let trail = await expectOk('jefe consulta audit trail de la prenda', () =>
  as('jefeA', `SELECT * FROM get_garment_audit_trail(${G})`))
console.log('    filas en audit trail:', trail?.rows.length)
await expectErr('operador no consulta audit trail', () =>
  as('opA', `SELECT * FROM get_garment_audit_trail(${G})`), /Sin permisos/)
await expectRows('operador no lee audit_log directo', () => as('opA', `SELECT * FROM audit_log`), 0)
await expectErr('nadie puede borrar audit_log', () => db.query(`DELETE FROM audit_log`), /inmutables/)
await expectErr('nadie puede TRUNCATE audit_log', () => db.query(`TRUNCATE audit_log`), /inmutables/)
await expectErr('borrar prenda (superusuario) no arrastra historial', () =>
  db.query(`DELETE FROM garments WHERE id = ${G}`))

console.log('\n— Mangueras')
await expectErr('UPDATE directo de current_cycle bloqueado', () =>
  as('opA', `UPDATE hoses SET current_cycle = 0 WHERE id = ${H} RETURNING id`).then((r) => { if (r.rows.length === 0) throw new Error('0 filas (bloqueado por RLS)') }))
await expectOk('operador registra uso (199→200)', () =>
  as('opA', `SELECT * FROM register_hose_action(${H}, 'uso', 'Luis')`))
let h = await one(`SELECT current_cycle FROM hoses WHERE id = ${H}`)
console.log(h.current_cycle === 200 ? '  ✔ ciclo incrementado en servidor' : '  ✘ ciclo ' + h.current_cycle); h.current_cycle === 200 ? pass++ : fail++
await expectErr('uso al llegar a 200 ciclos se rechaza (no se pierde en silencio)', () =>
  as('opA', `SELECT * FROM register_hose_action(${H}, 'uso', 'Luis')`), /límite/)
await expectErr('bulk es todo-o-nada', () =>
  as('opA', `SELECT * FROM register_bulk_hose_use(ARRAY[${H}]::uuid[], 'Luis')`), /límite/)
await expectErr('jefe de otro equipo no reemplaza', () =>
  as('jefeB', `SELECT replace_hose(${P}, 'desgaste', 'X')`), /Sin acceso/)
await expectErr('operador no reemplaza', () =>
  as('opA', `SELECT replace_hose(${P}, 'desgaste', 'X')`), /Sin permisos/)
await expectErr('reemplazo SIN firma rechazado', () =>
  as('jefeA', `SELECT replace_hose(${P}, 'Fin de vida útil', 'Ana')`), /firma/)
await expectOk('jefe reemplaza manguera con firma', () =>
  as('jefeA', `SELECT replace_hose(${P}, 'Fin de vida útil', 'Ana', '${sigJefe.token}')`))
let nh = await one(`SELECT short_code, current_cycle FROM hoses WHERE position_id = ${P} AND status = 'activa'`)
console.log(nh?.current_cycle === 0 ? `  ✔ nueva manguera ${nh.short_code} en ciclo 0` : '  ✘ reemplazo'); nh?.current_cycle === 0 ? pass++ : fail++
await expectErr('editar equipo sin motivo', () =>
  as('jefeA', `SELECT * FROM update_equipment(${E}, 'EQ-A', 'Nuevo', '')`), /MOTIVO/)
await expectOk('editar equipo con motivo', () =>
  as('jefeA', `SELECT * FROM update_equipment(${E}, 'EQ-A', 'Equipo A1 v2', 'Renombrado')`))
await expectOk('editar posición con motivo', () =>
  as('jefeA', `SELECT * FROM update_hose_position(${P}, '2', '3m', NULL, 'Calibre mal capturado')`))
await expectOk('archivar equipo', () => as('jefeA', `SELECT * FROM archive_equipment(${E}, 'Retirado')`))
await expectErr('borrar equipo (superusuario) no arrastra mangueras', () =>
  db.query(`DELETE FROM equipment WHERE id = ${E}`))

console.log('\n— Usuarios')
await expectOk('jefe ya NO puede subir su rol a administrador', async () => {
  const r = await as('jefeA', `SELECT update_user_role('${USERS.jefeA[0]}', 'administrador') r`)
  if (!r.rows[0].r.error) throw new Error('permitió el cambio')
})
await expectErr('jefe no puede cambiar roles por UPDATE directo', () =>
  as('jefeA', `UPDATE user_profiles SET role = 'administrador' WHERE id = '${USERS.opA[0]}'`), /permission denied/)
await expectOk('admin cambia rol de otro', async () => {
  const r = await as('admin', `SELECT update_user_role('${USERS.opA[0]}', 'supervisor') r`)
  if (r.rows[0].r.error) throw new Error(r.rows[0].r.error)
})
await expectOk('admin no puede cambiar su propio rol', async () => {
  const r = await as('admin', `SELECT update_user_role('${USERS.admin[0]}', 'operador') r`)
  if (!r.rows[0].r.error) throw new Error('permitió auto-cambio')
})
await expectErr('operador no lista correos de usuarios', () =>
  as('jefeB', `SELECT 1`).then(() => as('opA', `SELECT * FROM get_all_users()`)), /Sin permisos/)
await expectRows('jefe lista solo usuarios de su empresa', () => as('jefeA', `SELECT * FROM get_all_users()`), 2)
await expectRows('superadmin lista todos los usuarios', () => as('admin', `SELECT * FROM get_all_users()`), 4)
let roleAudit = await one(`SELECT reason FROM audit_log WHERE table_name='user_profiles' AND operation='UPDATE' AND reason LIKE 'Cambio de rol%'`)
console.log(roleAudit?.reason?.startsWith('Cambio de rol') ? '  ✔ cambio de rol queda en audit_log' : '  ✘ cambio de rol sin auditar'); roleAudit ? pass++ : fail++

console.log('\n— Estado en una fecha determinada')
{
  const r = await as('jefeA', `SELECT * FROM get_inventory_status_at(now() - interval '1 second', ${G})`).catch(() => null)
  // La prenda G ya está archivada ahora; un segundo antes también (se archivó antes), así que
  // probamos contra el inicio de los tiempos de prueba: creada y sin acciones => no aparece aún
  const past = await as('jefeA', `SELECT * FROM get_inventory_status_at('2000-01-01', NULL)`)
  console.log(past.rows.length === 0 ? '  ✔ antes de crearse, ninguna prenda aparece' : '  ✘ ' + past.rows.length); past.rows.length === 0 ? pass++ : fail++
  console.log(r ? '  ✔ consulta por fecha ejecuta' : '  ✘ consulta por fecha falló'); r ? pass++ : fail++
}
await db.exec(`INSERT INTO garments (id, code, name, team_id, created_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000002', 'G-A-2', 'Bata 2', '00000000-0000-0000-0000-0000000000a1', '2026-01-01')`)
await db.exec(`ALTER TABLE garment_actions DISABLE TRIGGER stamp_recorder_garment_actions`)
await db.exec(`INSERT INTO garment_actions (garment_id, action_type, performed_by, created_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000002', 'lavado', 'A', '2026-02-01'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'lavado', 'A', '2026-03-01'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'reparacion', 'B', '2026-04-01'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'lavado', 'A', '2026-05-01')`)
await db.exec(`ALTER TABLE garment_actions ENABLE TRIGGER stamp_recorder_garment_actions`)
{
  const at = async (d) => (await as('jefeA', `SELECT status_at, cycles_at::int FROM get_inventory_status_at('${d}', 'aaaaaaaa-0000-0000-0000-000000000002')`)).rows[0]
  const a = await at('2026-03-15'), b = await at('2026-04-15'), c = await at('2026-06-01')
  const ok = a.status_at === 'disponible' && a.cycles_at === 2 && b.status_at === 'reparacion' && b.cycles_at === 2 && c.status_at === 'disponible' && c.cycles_at === 3
  console.log(ok ? '  ✔ reconstruye estado y ciclos en marzo, abril y junio' : '  ✘ ' + JSON.stringify({ a, b, c })); ok ? pass++ : fail++
}
await as('admin', `SELECT update_user_role('${USERS.opA[0]}', 'operador')`)  // la sección Usuarios lo había hecho supervisor
await expectErr('operador no consulta reportes históricos', () =>
  as('opA', `SELECT * FROM get_inventory_status_at(now())`), /Sin permisos/)

console.log('\n— Desactivar usuarios')
await expectErr('jefe NO puede desactivar usuarios', () =>
  as('jefeA', `SELECT set_user_active('${USERS.opA[0]}', false, 'x')`), /Solo el administrador/)
await expectErr('desactivar exige motivo', () =>
  as('admin', `SELECT set_user_active('${USERS.opA[0]}', false, '')`), /MOTIVO/)
await expectErr('admin no se desactiva a sí mismo', () =>
  as('admin', `SELECT set_user_active('${USERS.admin[0]}', false, 'x')`), /propia/)
await expectOk('admin desactiva al operador', () =>
  as('admin', `SELECT set_user_active('${USERS.opA[0]}', false, 'Baja de la empresa')`))
let banned = await one(`SELECT banned_until FROM auth.users WHERE id = '${USERS.opA[0]}'`)
console.log(banned.banned_until ? '  ✔ login bloqueado en Supabase Auth (banned_until)' : '  ✘ no se bloqueó el login'); banned.banned_until ? pass++ : fail++
await expectRows('usuario desactivado con sesión abierta NO ve prendas', () => as('opA', `SELECT * FROM garments`), 0)
await expectErr('usuario desactivado NO registra acciones', () =>
  as('opA', `SELECT * FROM register_garment_action('aaaaaaaa-0000-0000-0000-000000000002', 'lavado', 'X')`))
await expectOk('admin reactiva al operador', () =>
  as('admin', `SELECT set_user_active('${USERS.opA[0]}', true, 'Reingreso')`))
await expectRows('operador reactivado vuelve a ver prendas', () => as('opA', `SELECT * FROM garments WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002'`), 1)

console.log('\n— Bloqueo por intentos fallidos')
for (let i = 1; i <= 4; i++) await asAnon(`SELECT record_failed_login('operador@a.test')`)
let st = (await asAnon(`SELECT check_login_allowed('OPERADOR@a.test') r`)).rows[0].r
console.log(st.allowed ? '  ✔ 4 fallos: todavía permitido' : '  ✘ bloqueó antes de tiempo'); st.allowed ? pass++ : fail++
st = (await asAnon(`SELECT record_failed_login('operador@a.test') r`)).rows[0].r
console.log(!st.allowed && st.locked_until ? '  ✔ 5º fallo: cuenta bloqueada' : '  ✘ no bloqueó'); !st.allowed ? pass++ : fail++
await expectRows('cuenta bloqueada con sesión abierta NO ve prendas', () => as('opA', `SELECT * FROM garments`), 0)
let succ = (await as('opA', `SELECT record_successful_login() r`)).rows[0].r
console.log(!succ.allowed ? '  ✔ login exitoso durante bloqueo sigue rechazado' : '  ✘ login permitido'); !succ.allowed ? pass++ : fail++
await expectErr('anon no lee la bitácora de intentos', () => asAnon(`SELECT * FROM login_attempts`), /permission denied/)
await expectRows('jefe no lee la bitácora de intentos', () => as('jefeA', `SELECT * FROM login_attempts`), 0)
await expectOk('admin sí lee la bitácora de intentos', async () => {
  const r = await as('admin', `SELECT * FROM login_attempts`); if (r.rows.length < 5) throw new Error('filas: ' + r.rows.length)
})
await expectRows('jefe de otro equipo no ve firmas ajenas', () => as('jefeB', `SELECT * FROM electronic_signatures`), 0)
await expectErr('jefe no desbloquea cuentas', () => as('jefeA', `SELECT unlock_account('operador@a.test', 'x')`), /Solo el administrador/)
await expectOk('admin desbloquea con motivo', () => as('admin', `SELECT unlock_account('operador@a.test', 'Verificado por teléfono')`))
await expectRows('operador desbloqueado vuelve a ver prendas', () => as('opA', `SELECT * FROM garments WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002'`), 1)
await expectErr('bitácora de intentos inmutable', () => db.query(`DELETE FROM login_attempts`), /inmutables/)
let lockAudit = await one(`SELECT count(*)::int n FROM audit_log WHERE table_name = 'account_locks'`)
console.log(lockAudit.n >= 2 ? '  ✔ bloqueo y desbloqueo quedan en audit_log' : '  ✘ audit ' + lockAudit.n); lockAudit.n >= 2 ? pass++ : fail++
let users = (await as('admin', `SELECT email, is_active, locked_until FROM get_all_users()`)).rows
console.log(users.length === 4 && 'is_active' in users[0] ? '  ✔ get_all_users incluye estado y bloqueo' : '  ✘ get_all_users'); users.length === 4 ? pass++ : fail++

console.log('\n— Empresas y licencias')
{
  // Simula auth.admin.createUser de la Edge Function (lo hace Supabase Auth con service role)
  const createAuthUser = async (id, email, pwd = 'Temporal#2026x') => {
    await db.query(`INSERT INTO auth.users (id, email, encrypted_password) VALUES ('${id}', '${email}', 'h:${pwd}')`)
    USERS[email] = [id, email]
  }
  const asU = (email, sql) => as(email, sql)

  let org = (await as('admin', `SELECT * FROM save_organization(NULL, 'Cliente X', 3, ARRAY['prendas','mangueras'], true, 'Alta de cliente')`)).rows[0]
  console.log(org?.id ? '  ✔ superadmin crea empresa con licencia (3 usuarios, 2 módulos)' : '  ✘ no se creó la empresa'); org?.id ? pass++ : fail++
  await expectErr('jefe NO puede crear empresas', () =>
    as('jefeA', `SELECT * FROM save_organization(NULL, 'Pirata', 99, ARRAY['prendas'], true, 'x')`), /superadministrador/)

  // Alta del administrador del cliente (solo Prendas) por el superadmin
  let prep = (await as('admin', `SELECT admin_prepare_new_user('adminx@x.test', 'administrador', ARRAY['prendas'], '${org.id}', 'Nombre adminx') r`)).rows[0].r
  console.log(prep.ok ? '  ✔ validación previa de alta OK' : '  ✘ ' + prep.error); prep.ok ? pass++ : fail++
  await createAuthUser('55555555-5555-5555-5555-555555555555', 'adminx@x.test')
  await expectOk('superadmin completa el alta del administrador del cliente', () =>
    as('admin', `SELECT admin_finalize_new_user('55555555-5555-5555-5555-555555555555', 'administrador', ARRAY['prendas'], '${org.id}', NULL, 'Usuario 5555')`))

  // Contraseña temporal: sin acceso hasta cambiarla
  let st = (await asU('adminx@x.test', `SELECT get_my_password_status() s`)).rows[0].s
  console.log(st.must_change && st.reason === 'temporal' ? '  ✔ usuario nuevo debe cambiar su contraseña temporal' : '  ✘ ' + JSON.stringify(st)); st.must_change ? pass++ : fail++
  await expectErr('con contraseña temporal NO accede a funciones', () => asU('adminx@x.test', `SELECT * FROM get_all_users()`), /Sin permisos/)
  let r = (await asU('adminx@x.test', `SELECT change_my_password('mala', 'Nueva#Segura2026') r`)).rows[0].r
  console.log(!r.ok ? '  ✔ cambio rechazado con contraseña actual incorrecta' : '  ✘'); !r.ok ? pass++ : fail++
  r = (await asU('adminx@x.test', `SELECT change_my_password('Temporal#2026x', 'corta1A!') r`)).rows[0].r
  console.log(!r.ok && /12 caracteres/.test(r.error) ? '  ✔ contraseña débil rechazada' : '  ✘ ' + r.error); !r.ok ? pass++ : fail++
  r = (await asU('adminx@x.test', `SELECT change_my_password('Temporal#2026x', 'Temporal#2026x') r`)).rows[0].r
  console.log(!r.ok && /reutilizar/.test(r.error) ? '  ✔ no puede reutilizar la contraseña actual' : '  ✘ ' + r.error); !r.ok ? pass++ : fail++
  r = (await asU('adminx@x.test', `SELECT change_my_password('Temporal#2026x', 'Nueva#Segura2026') r`)).rows[0].r
  console.log(r.ok ? '  ✔ contraseña cambiada; acceso habilitado' : '  ✘ ' + r.error); r.ok ? pass++ : fail++
  r = (await asU('adminx@x.test', `SELECT change_my_password('Nueva#Segura2026', 'Temporal#2026x') r`)).rows[0].r
  console.log(!r.ok && /últimas 5/.test(r.error) ? '  ✔ no puede volver a una de sus últimas 5 contraseñas' : '  ✘ ' + r.error); !r.ok ? pass++ : fail++

  // El administrador del cliente da de alta a su gente
  await expectRows('admin del cliente ve solo usuarios de su empresa', () => asU('adminx@x.test', `SELECT * FROM get_all_users()`), 1)
  prep = (await asU('adminx@x.test', `SELECT admin_prepare_new_user('op1@x.test', 'operador', ARRAY['mangueras'], NULL, 'Nombre op1') r`)).rows[0].r
  console.log(!prep.ok && /módulos que tú administras/.test(prep.error) ? '  ✔ admin de Prendas NO puede dar acceso a Mangueras' : '  ✘ ' + JSON.stringify(prep)); !prep.ok ? pass++ : fail++
  prep = (await asU('adminx@x.test', `SELECT admin_prepare_new_user('op1@x.test', 'operador', ARRAY['prendas'], '00000000-0000-0000-0000-0000000000b1', 'Nombre op1') r`)).rows[0].r
  console.log(prep.ok && prep.organization_id === org.id ? '  ✔ admin del cliente siempre crea en SU empresa (ignora otra empresa)' : '  ✘ ' + JSON.stringify(prep)); prep.ok ? pass++ : fail++
  await createAuthUser('66666666-6666-6666-6666-666666666666', 'op1@x.test')
  await expectOk('admin del cliente da de alta a un operador', () =>
    asU('adminx@x.test', `SELECT admin_finalize_new_user('66666666-6666-6666-6666-666666666666', 'operador', ARRAY['prendas'], '${org.id}', NULL, 'Usuario 6666')`))
  await createAuthUser('77777777-7777-7777-7777-777777777777', 'op2@x.test')
  await expectOk('tercer usuario (llega al límite de 3)', () =>
    asU('adminx@x.test', `SELECT admin_finalize_new_user('77777777-7777-7777-7777-777777777777', 'operador', ARRAY['prendas'], '${org.id}', NULL, 'Usuario 7777')`))
  prep = (await asU('adminx@x.test', `SELECT admin_prepare_new_user('op3@x.test', 'operador', ARRAY['prendas'], NULL, 'Nombre op3') r`)).rows[0].r
  console.log(!prep.ok && /límite de 3/.test(prep.error) ? '  ✔ cuarto usuario rechazado: límite de licencia' : '  ✘ ' + JSON.stringify(prep)); !prep.ok ? pass++ : fail++
  await createAuthUser('88888888-8888-8888-8888-888888888888', 'op3@x.test')
  await expectErr('la base rechaza el 4º aunque se salte la validación previa', () =>
    asU('adminx@x.test', `SELECT admin_finalize_new_user('88888888-8888-8888-8888-888888888888', 'operador', ARRAY['prendas'], '${org.id}', NULL, 'Usuario 8888')`), /límite/)
  await expectOk('desactivar a uno libera un lugar', () =>
    asU('adminx@x.test', `SELECT set_user_active('77777777-7777-7777-7777-777777777777', false, 'Salió de la empresa')`))
  await expectOk('ahora sí entra el nuevo usuario', () =>
    asU('adminx@x.test', `SELECT admin_finalize_new_user('88888888-8888-8888-8888-888888888888', 'operador', ARRAY['prendas'], '${org.id}', NULL, 'Usuario 8888')`))
  await expectErr('reactivar al que salió excede la licencia', () =>
    asU('adminx@x.test', `SELECT set_user_active('77777777-7777-7777-7777-777777777777', true, 'Regresó')`), /límite/)
  await expectErr('superadmin no puede reducir la licencia por debajo de los activos', () =>
    as('admin', `SELECT * FROM save_organization('${org.id}', 'Cliente X', 2, ARRAY['prendas','mangueras'], true, 'Recorte')`), /usuarios activos/)

  // Aislamiento entre empresas y módulos
  await expectErr('admin del cliente NO administra usuarios de otra empresa', () =>
    asU('adminx@x.test', `SELECT set_user_active('${USERS.jefeA[0]}', false, 'x')`), /empresa/)
  await expectRows('admin del cliente NO ve prendas de otra empresa', () => asU('adminx@x.test', `SELECT * FROM garments`), 0)
  await expectErr('admin del cliente NO crea prendas en equipo de otra empresa', () =>
    asU('adminx@x.test', `INSERT INTO garments (code, name, team_id) VALUES ('X-1', 'Intruso', '00000000-0000-0000-0000-0000000000a1')`), /empresa/)
  await expectOk('admin del cliente crea prendas en su empresa', () =>
    asU('adminx@x.test', `INSERT INTO garments (code, name) VALUES ('X-1', 'Bata cliente X')`))
  let gx = await one(`SELECT organization_id FROM garments WHERE code = 'X-1'`)
  console.log(gx.organization_id === org.id ? '  ✔ la prenda queda en la empresa del usuario' : '  ✘'); gx.organization_id === org.id ? pass++ : fail++
  await expectRows('admin de Prendas NO ve mangueras (módulo no asignado)', () => asU('adminx@x.test', `SELECT * FROM equipment`), 0)
  await expectRows('jefe de otra empresa no ve la prenda del cliente X', () => as('jefeA', `SELECT * FROM garments WHERE code = 'X-1'`), 0)
  await expectErr('la empresa de una prenda no se puede cambiar', () =>
    db.query(`UPDATE garments SET organization_id = (SELECT organization_id FROM teams WHERE name = 'Equipo A') WHERE code = 'X-1'`), /no puede cambiarse/)
  let auditOther = (await asU('adminx@x.test', `SELECT count(*)::int n FROM audit_log WHERE organization_id IS DISTINCT FROM '${org.id}'`)).rows[0].n
  console.log(auditOther === 0 ? '  ✔ admin del cliente solo ve el audit trail de su empresa' : '  ✘ ve ' + auditOther); auditOther === 0 ? pass++ : fail++

  // Alcance por módulo: el admin de Prendas no ve registros de Mangueras
  await db.query(`INSERT INTO audit_log (operation, table_name, record_id, new_data, organization_id, reason) VALUES
    ('INSERT', 'equipment', 'eq-x', '{"code":"EQ-X"}', '${org.id}', 'prueba-alcance'),
    ('INSERT', 'hose_actions', 'ha-x', '{"action_type":"uso"}', '${org.id}', 'prueba-alcance'),
    ('UPDATE', 'user_profiles', 'u-m', '{"modules":["mangueras"]}', '${org.id}', 'prueba-alcance'),
    ('INSERT', 'electronic_signatures', 's-m', '{"table_name":"hose_actions"}', '${org.id}', 'prueba-alcance'),
    ('INSERT', 'garment_actions', 'ga-x', '{"action_type":"lavado"}', '${org.id}', 'prueba-alcance'),
    ('UPDATE', 'user_profiles', 'u-p', '{"modules":["prendas"]}', '${org.id}', 'prueba-alcance'),
    ('UPDATE', 'organizations', 'o-x', '{"name":"Cliente X"}', '${org.id}', 'prueba-alcance')`)
  const scope = (await asU('adminx@x.test', `SELECT array_agg(record_id ORDER BY record_id) r FROM audit_log WHERE reason = 'prueba-alcance'`)).rows[0].r
  const okScope = JSON.stringify(scope) === '["ga-x","o-x","u-p"]'
  console.log(okScope ? '  ✔ admin de Prendas solo ve audit trail de Prendas, sus usuarios y la empresa' : '  ✘ ve ' + JSON.stringify(scope)); okScope ? pass++ : fail++
  const allScope = (await as('admin', `SELECT count(*)::int n FROM audit_log WHERE reason = 'prueba-alcance'`)).rows[0].n
  console.log(allScope === 7 ? '  ✔ superadmin ve todo el audit trail' : '  ✘ ' + allScope); allScope === 7 ? pass++ : fail++

  // Restablecimiento y caducidad
  await expectOk('admin restablece contraseña de su operador', () =>
    asU('adminx@x.test', `SELECT admin_mark_password_reset('66666666-6666-6666-6666-666666666666')`))
  st = (await asU('op1@x.test', `SELECT get_my_password_status() s`)).rows[0].s
  console.log(st.must_change ? '  ✔ tras restablecer, debe cambiarla' : '  ✘'); st.must_change ? pass++ : fail++
  await db.query(`UPDATE user_profiles SET password_changed_at = now() - interval '91 days' WHERE id = '55555555-5555-5555-5555-555555555555'`)
  st = (await asU('adminx@x.test', `SELECT get_my_password_status() s`)).rows[0].s
  console.log(st.must_change && st.reason === 'expirada' ? '  ✔ contraseña de más de 90 días caduca' : '  ✘ ' + JSON.stringify(st)); st.must_change ? pass++ : fail++
  await expectRows('con contraseña caducada NO ve datos', () => asU('adminx@x.test', `SELECT * FROM garments`), 0)
}

console.log('\n— Nombre completo')
{
  const r = (await as('admin', `SELECT admin_prepare_new_user('sinnombre@x.test', 'operador', ARRAY['prendas'], (SELECT id FROM organizations WHERE name = 'Cliente X'), NULL) r`)).rows[0].r
  console.log(!r.ok && /nombre completo/.test(r.error) ? '  ✔ alta sin nombre completo rechazada' : '  ✘ ' + JSON.stringify(r)); !r.ok ? pass++ : fail++
}
await expectOk('usuario sin nombre puede registrar el suyo una vez', () => as('jefeB', `SELECT set_my_full_name('Juan Pérez')`))
await expectErr('después ya no puede cambiarlo él mismo', () => as('jefeB', `SELECT set_my_full_name('Otro Nombre')`), /administrador/)
await expectOk('el superadmin puede corregir el nombre', () => as('admin', `SELECT update_user_full_name('${USERS.jefeB[0]}', 'Juan Pérez García')`))
await expectErr('un jefe no cambia nombres de otros', () => as('jefeA', `SELECT update_user_full_name('${USERS.opA[0]}', 'X Y Z')`), /administrar/)
{
  const nm = await one(`SELECT full_name FROM user_profiles WHERE id = '${USERS.jefeB[0]}'`)
  console.log(nm.full_name === 'Juan Pérez García' ? '  ✔ nombre actualizado' : '  ✘ ' + nm.full_name); nm.full_name === 'Juan Pérez García' ? pass++ : fail++
}

console.log('\n— Consultas paginadas')
{
  // 30 prendas extra en el equipo A, con distintos ciclos de lavado
  await db.exec(`ALTER TABLE garment_actions DISABLE TRIGGER stamp_recorder_garment_actions`)
  for (let i = 1; i <= 30; i++) {
    const id = `bbbbbbbb-0000-0000-0000-${String(i).padStart(12, '0')}`
    await db.query(`INSERT INTO garments (id, code, name, team_id, short_code, status) VALUES
      ('${id}', '202607A-${i % 2 ? 'FI' : 'PA'}-L-NE-${String(i).padStart(3, '0')}', 'Prenda ${i}',
       '00000000-0000-0000-0000-0000000000a1', 'P${i}', '${i % 5 === 0 ? 'reparacion' : 'disponible'}')`)
    const washes = i <= 3 ? 80 : i <= 6 ? 30 : 1
    await db.query(`INSERT INTO garment_actions (garment_id, action_type, performed_by)
      SELECT '${id}', 'lavado', 'x' FROM generate_series(1, ${washes})`)
  }
  await db.exec(`ALTER TABLE garment_actions ENABLE TRIGGER stamp_recorder_garment_actions`)

  const page = (sql) => as('jefeA', sql).then((r) => r.rows)
  let rows = await page(`SELECT * FROM list_garments(NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 10, 0)`)
  const total = Number(rows[0]?.total_count)
  console.log(rows.length === 10 && total >= 31 ? `  ✔ primera página de 10 con total ${total}` : '  ✘ ' + rows.length + '/' + total); rows.length === 10 ? pass++ : fail++
  const p4 = await page(`SELECT * FROM list_garments(NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 10, 30)`)
  console.log(p4.length === total - 30 ? '  ✔ última página con el resto' : '  ✘ ' + p4.length); p4.length === total - 30 ? pass++ : fail++
  rows = await page(`SELECT * FROM list_garments('p12', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 5, 0)`)
  console.log(rows[0]?.short_code === 'P12' ? '  ✔ búsqueda por código corto: coincidencia exacta primero' : '  ✘ ' + rows[0]?.short_code); rows[0]?.short_code === 'P12' ? pass++ : fail++
  rows = await page(`SELECT * FROM list_garments(NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['rojo'], 50, 0)`)
  const okLife = rows.length === 3 && rows.every((r) => r.life_status === 'rojo' && Number(r.wash_count) === 80)
  console.log(okLife ? '  ✔ filtro de vida útil (rojo) calculado en la base' : '  ✘ ' + JSON.stringify(rows.map((r) => [r.code, r.wash_count]))); okLife ? pass++ : fail++
  rows = await page(`SELECT * FROM list_garments(NULL, 'reparacion', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 50, 0)`)
  console.log(rows.length >= 6 && rows.every((r) => r.status === 'reparacion') ? '  ✔ filtro por estado' : '  ✘ ' + rows.length); rows.length >= 6 ? pass++ : fail++
  rows = await page(`SELECT * FROM list_garments(NULL, NULL, NULL, NULL, 'PA', NULL, NULL, NULL, NULL, NULL, 50, 0)`)
  console.log(rows.length === 15 && rows.every((r) => r.code.split('-')[1] === 'PA') ? '  ✔ filtro por tipo de prenda (segmento del código)' : '  ✘ ' + rows.length); rows.length === 15 ? pass++ : fail++
  rows = await as('jefeB', `SELECT * FROM list_garments(NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 100, 0)`).then((r) => r.rows)
  console.log(rows.every((r) => r.organization_id !== rows.find(() => false)) && !rows.some((r) => r.code.startsWith('202607A-')) ? '  ✔ otra empresa no ve estas prendas' : '  ✘ ' + rows.length); !rows.some((r) => r.code.startsWith('202607A-')) ? pass++ : fail++
  await expectRows('usuario sin módulo Prendas no lista prendas', () =>
    as('adminx@x.test', `SELECT * FROM list_garments()`), 0)

  // Ordenamiento, cliente, inactividad
  rows = await page(`SELECT * FROM list_garments(p_sort => 'ciclos', p_limit => 3)`)
  console.log(rows.length === 3 && rows.every((r) => Number(r.wash_count) === 80) ? '  ✔ ordenar por más ciclos' : '  ✘ ' + JSON.stringify(rows.map((r) => r.wash_count))); rows.length === 3 ? pass++ : fail++
  rows = await page(`SELECT * FROM list_garments(p_sort => 'codigo', p_limit => 50)`)
  const codes = rows.map((r) => r.code)
  const sortedOk = codes.every((c, i) => i === 0 || codes[i - 1] <= c)
  console.log(sortedOk ? '  ✔ ordenar por código' : '  ✘ orden'); sortedOk ? pass++ : fail++
  await db.query(`UPDATE garments SET client_name = 'Hospital Norte' WHERE short_code IN ('P1', 'P2')`)
  rows = await page(`SELECT * FROM list_garments(p_client => 'norte', p_limit => 50)`)
  console.log(rows.length === 2 ? '  ✔ filtro por cliente' : '  ✘ ' + rows.length); rows.length === 2 ? pass++ : fail++
  rows = await page(`SELECT * FROM list_garments(p_idle_days => 30, p_limit => 50)`)
  const idleOk = rows.length === 1 && rows[0].code === 'G-A-2'
  console.log(idleOk ? '  ✔ sin actividad en 30 días: detecta la prenda con última acción en mayo' : '  ✘ ' + JSON.stringify(rows.map((r) => r.code))); idleOk ? pass++ : fail++
  const ex = (await as('jefeA', `SELECT array_agg(c) a FROM existing_garment_codes(ARRAY['202607A-FI-L-NE-001', 'NO-EXISTE']) c`)).rows[0].a
  console.log(JSON.stringify(ex) === '["202607A-FI-L-NE-001"]' ? '  ✔ detecta códigos ya existentes para importar' : '  ✘ ' + JSON.stringify(ex)); ex ? pass++ : fail++
  await expectRows('operador no consulta códigos existentes', () => as('opA', `SELECT * FROM existing_garment_codes(ARRAY['202607A-FI-L-NE-001'])`), 0)

  const st = (await as('jefeA', `SELECT garment_stats() s`)).rows[0].s
  const okStats = st.life.rojo === 3 && st.life.naranja === 0 && st.life.amarillo === 3 && st.reparacion >= 6
  console.log(okStats ? `  ✔ totales de Inicio en la base (activas ${st.active}, rojo ${st.life.rojo}, amarillo ${st.life.amarillo})` : '  ✘ ' + JSON.stringify(st)); okStats ? pass++ : fail++

  await db.query(`INSERT INTO equipment (id, code, name, team_id) VALUES ('eeeeeeee-0000-0000-0000-000000000002', 'EQ-B2', 'Equipo dos', '00000000-0000-0000-0000-0000000000a1')`)
  rows = await page(`SELECT * FROM list_equipment(NULL, 10, 0)`)
  console.log(rows.length >= 1 && Array.isArray(rows[0].positions) ? `  ✔ equipos paginados con posiciones (${rows.length}, total ${rows[0].total_count})` : '  ✘ ' + JSON.stringify(rows[0])); rows.length >= 1 ? pass++ : fail++

  // Mangueras: alta, filtros, totales, estado a una fecha e importación
  await expectErr('operador no crea productos de mangueras', () =>
    as('opA', `SELECT create_equipment('EQ-OP', 'No', ARRAY['1/2"'])`), /Sin permisos/)
  await expectErr('calibres repetidos rechazados', () =>
    as('jefeA', `SELECT create_equipment('EQ-R', 'Rep', ARRAY['1/2"', '1/2"'])`), /repetir/)
  const eqNew = (await as('jefeA', `SELECT create_equipment('EQ-N', 'Nuevo', ARRAY['1/2"', '3/4"'], NULL, ARRAY['6m', '']) r`)).rows[0].r
  await expectErr('código de producto duplicado', () =>
    as('jefeA', `SELECT create_equipment('EQ-N', 'Otro', ARRAY['1'])`), /Ya existe/)
  const nh2 = (await one(`SELECT h.id FROM hoses h JOIN hose_positions p ON p.id = h.position_id WHERE p.equipment_id = '${eqNew.id}' AND p.caliber = '1/2"'`)).id
  await db.query(`UPDATE hoses SET current_cycle = 120 WHERE id = '${nh2}'`)
  await as('opA', `SELECT * FROM register_hose_action('${nh2}', 'uso', 'x')`)
  rows = await page(`SELECT * FROM list_equipment(p_life => ARRAY['naranja'])`)
  const okHl = rows.length === 1 && rows[0].code === 'EQ-N' && rows[0].max_cycle === 121
  console.log(okHl ? '  ✔ filtro de vida útil de mangueras (naranja, 121 ciclos)' : '  ✘ ' + JSON.stringify(rows.map((r) => [r.code, r.max_cycle]))); okHl ? pass++ : fail++
  rows = await page(`SELECT * FROM list_equipment(p_caliber => '3/4"')`)
  console.log(rows.length === 1 && rows[0].code === 'EQ-N' ? '  ✔ filtro por calibre' : '  ✘ ' + rows.length); rows.length === 1 ? pass++ : fail++
  rows = await page(`SELECT * FROM list_equipment(p_sort => 'ciclos')`)
  console.log(rows[0]?.code === 'EQ-N' ? '  ✔ orden por más ciclos' : '  ✘ ' + rows[0]?.code); rows[0]?.code === 'EQ-N' ? pass++ : fail++
  rows = await page(`SELECT * FROM list_equipment(p_attention => true)`)
  console.log(rows.length === 1 && rows[0].code === 'EQ-B2' ? '  ✔ equipos que requieren atención (sin manguera activa)' : '  ✘ ' + JSON.stringify(rows.map((r) => r.code))); rows.length === 1 ? pass++ : fail++
  const cal = (await as('jefeA', `SELECT array_agg(c) a FROM hose_calibers() c`)).rows[0].a
  console.log(cal?.includes('3/4"') ? '  ✔ catálogo de calibres' : '  ✘ ' + JSON.stringify(cal)); cal?.includes('3/4"') ? pass++ : fail++
  const hst = (await as('jefeA', `SELECT hose_stats() s`)).rows[0].s
  const okHst = hst.active >= 2 && hst.life.naranja === 1 && hst.uses_30d >= 1
  console.log(okHst ? `  ✔ totales de mangueras (activas ${hst.active}, naranja ${hst.life.naranja}, usos 30 días ${hst.uses_30d})` : '  ✘ ' + JSON.stringify(hst)); okHst ? pass++ : fail++
  await expectRows('otra empresa no ve productos ajenos', () => as('jefeB', `SELECT * FROM list_equipment(p_search => 'EQ-N')`), 0)
  rows = await page(`SELECT * FROM get_hose_status_at(now())`)
  const st1 = rows.find((r) => r.equipment_code === 'EQ-N' && r.caliber === '1/2"')
  console.log(st1?.status_at === 'Activa' && st1?.cycles_at === 121 ? '  ✔ estado de mangueras a una fecha (ciclos del historial)' : '  ✘ ' + JSON.stringify(st1)); st1 ? pass++ : fail++
  rows = await page(`SELECT * FROM get_hose_status_at(now() - interval '10 years')`)
  console.log(rows.length === 0 ? '  ✔ antes de instalarse no aparecen' : '  ✘ ' + rows.length); rows.length === 0 ? pass++ : fail++
  await expectErr('operador no consulta estado histórico de mangueras', () => as('opA', `SELECT * FROM get_hose_status_at(now())`), /Sin permisos/)
  const exE = (await as('jefeA', `SELECT array_agg(c) a FROM existing_equipment_codes(ARRAY['EQ-N', 'NUEVO-1']) c`)).rows[0].a
  console.log(JSON.stringify(exE) === '["EQ-N"]' ? '  ✔ detecta productos ya existentes para importar' : '  ✘ ' + JSON.stringify(exE)); exE ? pass++ : fail++
}

console.log(`\nResultado: ${pass} OK, ${fail} fallas`)
process.exit(fail ? 1 : 0)
