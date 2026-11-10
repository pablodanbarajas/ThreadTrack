# Controles de integridad de datos (ALCOA+)

Resumen de los controles técnicos implementados en las migraciones
`supabase/migrations/20261110*`. Sirve como evidencia para el cuestionario de
evaluación (secciones 2 a 5) y como base para la especificación funcional.

| Principio | Control |
|---|---|
| **Atribuible** | Cada acción guarda `recorded_by` / `recorded_by_email` tomados de la sesión autenticada (no del cliente), además del responsable físico (`performed_by`). Cada cambio en `audit_log` guarda `user_id`, correo y rol. |
| **Legible** | Registros estructurados; consulta por prenda con `get_garment_audit_trail`. |
| **Contemporáneo** | Fecha/hora asignada por el servidor (`now()` / `clock_timestamp()`); el cliente no puede enviarla. |
| **Original** | `garment_actions`, `hose_actions`, `movements` y `audit_log` son de solo inserción: la base rechaza `UPDATE`, `DELETE` y `TRUNCATE`, incluso para el administrador. |
| **Exacto** | Cambios de estado y conteo de ciclos ocurren en funciones del servidor, en una sola transacción y con la fila bloqueada (sin conteos perdidos por concurrencia). Al llegar al límite de ciclos se rechaza el uso en lugar de ignorarlo. |
| **Completo** | Las prendas y equipos se archivan, no se borran; las llaves foráneas usan `ON DELETE RESTRICT`, así que el historial nunca se elimina en cascada. |
| **Consistente** | Mismas reglas para todos los clientes: las validaciones de rol y equipo viven en la base, no solo en la interfaz. |
| **Perdurable / Disponible** | Pendiente: política de respaldos, PITR y pruebas de restauración (Fase 5 del plan). |

## Audit trail (`public.audit_log`)

Se llena automáticamente por triggers en: `garments`, `garment_actions`,
`movements`, `documents`, `garment_assignments`, `equipment`, `hose_positions`,
`hoses`, `hose_actions`, `user_profiles` y `teams`.

Cada registro contiene: fecha/hora, usuario, correo, rol, operación
(INSERT/UPDATE/DELETE), tabla, id del registro, **valor anterior**, **valor
nuevo**, lista de campos cambiados y **motivo del cambio**.

El motivo es obligatorio para: editar una prenda, editar un equipo o posición,
archivar, dar de baja y reemplazar mangueras.

## Matriz de permisos aplicada en la base de datos

| Operación | Operador | Supervisor | Jefe | Administrador |
|---|:-:|:-:|:-:|:-:|
| Registrar lavado/esterilización, inspección, reparación, uso de manguera | ✔ | ✔ | ✔ | ✔ |
| Dar de baja (prenda o manguera) | ✘ | ✔ | ✔ | ✔ |
| Editar datos de prenda/equipo | ✘ | ✔ | ✔ | ✔ |
| Reemplazar manguera | ✘ | ✔ | ✔ | ✔ |
| Archivar prenda/equipo | ✘ | ✘ | ✔ | ✔ |
| Consultar audit trail de una prenda | ✘ | ✔ | ✔ | ✔ |
| Cambiar roles | ✘ | ✘ | ✘ | ✔ (no el propio) |
| Modificar o borrar historial | ✘ | ✘ | ✘ | ✘ |

Todos los roles operan solo sobre registros de su propio equipo; el
administrador ve todos.

## Verificación

Los controles se probaron con 59 casos automatizados (`npm run test:db`, ver `supabase/tests/`) (Postgres 16 en PGlite,
simulando `auth.uid()`/JWT de Supabase): rechazo de escrituras directas,
acceso sin sesión (anon key), aislamiento de documentos, inmutabilidad incluso para superusuario, atribución por sesión, motivo
obligatorio, límites de ciclo, aislamiento entre equipos y escalamiento de
roles. Pendiente: repetir la verificación en el proyecto de pruebas de Supabase
como parte del protocolo OQ.

## Limitaciones conocidas

- Un superusuario de la base (dueño del proyecto en Supabase) podría
  deshabilitar los triggers. Se mitiga con control de acceso al dashboard,
  MFA y revisión de migraciones; documentarlo en el análisis de riesgo.
- `performed_by` sigue siendo texto libre (responsable físico). La atribución
  formal es `recorded_by`. Firma electrónica: Fase 4.
- Desde `UNIFY_WASH_STERILIZATION_SETUP.sql`, los lavados y esterilizaciones
  anteriores son indistinguibles; declararlo en el reporte de evaluación.
