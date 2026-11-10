# Controles de integridad de datos (ALCOA+)

Resumen de los controles técnicos implementados en las migraciones
`supabase/migrations/20261110*`. Sirve como evidencia para el cuestionario de
evaluación (secciones 2 a 5) y como base para la especificación funcional.

| Principio | Control |
|---|---|
| **Atribuible** | Cada persona usa su propia cuenta. Toda acción guarda automáticamente el usuario en sesión: identificador, correo y **nombre completo** (`recorded_by`, `recorded_by_email`, `recorded_by_name`); el responsable ya no se captura a mano y la base ignora cualquier valor enviado por el cliente. Cada cambio en `audit_log` guarda usuario, correo y rol. |
| **Legible** | Registros estructurados; consulta por prenda con `get_garment_audit_trail`. |
| **Contemporáneo** | Fecha/hora asignada por el servidor (`now()` / `clock_timestamp()`); el cliente no puede enviarla. |
| **Original** | `garment_actions`, `hose_actions`, `movements` y `audit_log` son de solo inserción: la base rechaza `UPDATE`, `DELETE` y `TRUNCATE`, incluso para el administrador. |
| **Exacto** | Cambios de estado y conteo de ciclos ocurren en funciones del servidor, en una sola transacción y con la fila bloqueada (sin conteos perdidos por concurrencia). Al llegar al límite de ciclos se rechaza el uso en lugar de ignorarlo. |
| **Completo** | Las prendas y equipos se archivan, no se borran; las llaves foráneas usan `ON DELETE RESTRICT`, así que el historial nunca se elimina en cascada. |
| **Consistente** | Mismas reglas para todos los clientes: las validaciones de rol y equipo viven en la base, no solo en la interfaz. |
| **Perdurable / Disponible** | Pendiente: política de respaldos, PITR y pruebas de restauración (Fase 5 del plan). |

## Gestión de usuarios y acceso

| Control | Implementación |
|---|---|
| Cuentas individuales | Una cuenta por persona (Supabase Auth); cada registro guarda quién lo capturó. |
| Desactivar usuarios | El administrador desactiva/reactiva con motivo obligatorio. Se bloquea el inicio de sesión (`banned_until`) y, aunque la sesión siga abierta, la base niega todo acceso (`get_my_role()` devuelve nulo). Los usuarios no se eliminan para conservar la atribución del historial. |
| Bloqueo por intentos fallidos | 5 intentos fallidos en 15 minutos bloquean la cuenta 30 minutos. Cuentan los fallos de inicio de sesión y de firma electrónica. Una cuenta bloqueada no accede a datos aunque tenga sesión. Solo el administrador desbloquea antes, con motivo. |
| Bitácora de accesos | `login_attempts` (inmutable): cada intento con usuario, fecha y resultado. Exportable desde Reportes. |
| Contraseñas | Almacenadas como hash; rechazo de contraseñas filtradas (HaveIBeenPwned); requisitos de complejidad configurados en Supabase Auth. |

## Firma electrónica (21 CFR Part 11 §11.50, §11.70, §11.200)

Requerida para: **dar de baja** una prenda o manguera, **certificar el resultado de una inspección** y **reemplazar** una manguera.

1. El usuario vuelve a capturar su contraseña; el servidor la verifica (`request_signature`). Un fallo queda registrado y cuenta para el bloqueo.
2. Se emite un token válido 5 minutos para ese mismo usuario (serie de firmas en una sesión controlada, §11.200(a)(1)(i); permite firmar un lote completo).
3. La acción crea un registro en `electronic_signatures` (inmutable) con **nombre impreso del firmante (§11.50), correo, rol, fecha y hora, significado** ("Autorizo la baja definitiva de la prenda", "Certifico el resultado de inspección: aprobado", etc.) y el registro firmado; la acción guarda `signature_id`, así la firma queda ligada al registro (§11.70).

## Reportes históricos (menú *Reportes*)

- **Estado del inventario en una fecha**: estado y ciclos acumulados de cada prenda al cierre del día elegido, reconstruidos del historial inmutable.
- **Historial de acciones** de prendas y de mangueras por rango de fechas, con responsable, usuario que capturó y firma.
- **Audit trail** del sistema por rango (administrador) y por prenda (supervisor, jefe, administrador; también visible en el detalle de la prenda).
- **Bitácora de accesos y firmas** (administrador).

Cada Excel incluye una hoja *Parámetros* con quién lo generó, cuándo y con qué filtros.

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

Los controles se probaron con 98 casos automatizados (`npm run test:db`, ver `supabase/tests/`) (Postgres 16 en PGlite,
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
  formal es `recorded_by` y, en acciones críticas, la firma electrónica.
- El bloqueo por intentos se registra desde la pantalla de inicio de sesión de
  la app. Un ataque directo contra la API de autenticación no pasa por ese
  contador, pero queda limitado por el *rate limiting* de Supabase Auth, y una
  cuenta bloqueada no puede acceder a datos aunque obtenga sesión.
- Desde `UNIFY_WASH_STERILIZATION_SETUP.sql`, los lavados y esterilizaciones
  anteriores son indistinguibles; declararlo en el reporte de evaluación.
