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
let a = await one(`SELECT * FROM garment_actions WHERE performed_by = 'María'`)
console.log(a.recorded_by === USERS.opA[0] && a.recorded_by_email === 'operador@a.test' ? '  ✔ recorded_by tomado de la sesión' : '  ✘ recorded_by incorrecto', a.recorded_by_email)
a.recorded_by === USERS.opA[0] ? pass++ : fail++
await expectErr('responsable vacío rechazado', () =>
  as('opA', `SELECT * FROM register_garment_action(${G}, 'lavado', '   ')`), /RESPONSABLE/)
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
await expectOk('jefe da de baja con motivo', () =>
  as('jefeA', `SELECT * FROM register_garment_action(${G}, 'baja', 'Pedro', NULL, 'Tela rota')`))
let g = await one(`SELECT status, baja_reason FROM garments WHERE id = ${G}`)
console.log(g.status === 'baja' && g.baja_reason === 'Tela rota' ? '  ✔ estado y motivo de baja aplicados' : '  ✘ baja no aplicada'); g.status === 'baja' ? pass++ : fail++
let mv = await one(`SELECT count(*)::int n FROM movements WHERE garment_id = ${G}`)
console.log(mv.n === 3 ? '  ✔ movimientos registrados en la misma transacción' : '  ✘ movimientos: ' + mv.n); mv.n === 3 ? pass++ : fail++
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
await expectOk('jefe reemplaza manguera', () => as('jefeA', `SELECT replace_hose(${P}, 'Fin de vida útil', 'Ana')`))
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
await expectRows('jefe no puede cambiar roles por UPDATE directo', () =>
  as('jefeA', `UPDATE user_profiles SET role = 'administrador' WHERE id = '${USERS.opA[0]}' RETURNING id`), 0)
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
await expectRows('jefe lista usuarios', () => as('jefeA', `SELECT * FROM get_all_users()`), 4)
let roleAudit = await one(`SELECT reason FROM audit_log WHERE table_name='user_profiles' AND operation='UPDATE'`)
console.log(roleAudit?.reason?.startsWith('Cambio de rol') ? '  ✔ cambio de rol queda en audit_log' : '  ✘ cambio de rol sin auditar'); roleAudit ? pass++ : fail++

console.log(`\nResultado: ${pass} OK, ${fail} fallas`)
process.exit(fail ? 1 : 0)
