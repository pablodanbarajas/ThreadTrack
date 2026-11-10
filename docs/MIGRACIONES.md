# Control de cambios de la base de datos

Desde noviembre de 2026, **todo cambio a la base de datos se hace con una
migración versionada** en `supabase/migrations/`, revisada en un Pull Request y
aplicada primero en el ambiente de pruebas. Ya no se ejecuta SQL suelto en el
SQL Editor de producción.

Esto cubre el punto 6 del cuestionario de integridad ("¿Cómo se gestionan los
cambios de configuración del sistema?"): cada cambio queda en git con autor,
fecha, descripción y revisión.

## Bitácora de aplicación en producción

| Fecha | Migraciones | Cómo | Notas |
|---|---|---|---|
| 2026-11-10 | `20261110120000` a `20261110120400` | SQL Editor (manual), en orden | Respaldo previo en el esquema `backup_20261110`. Verificado con prueba transaccional revertida (inmutabilidad, cascada, audit trail, acceso anon) y Security Advisor. |
| 2026-11-10 | `20261110140000` | SQL Editor (manual) | Usuarios activos, bloqueo por intentos, firma electrónica y estado en fecha. Verificado: tablas, funciones, permisos de `anon` (solo login) y pgcrypto. Frontend desplegado en `eb29cb0`. |

Como se aplicaron a mano, el historial de migraciones de Supabase no las
registra. La primera vez que se use el CLI contra producción, márcalas como
aplicadas para que `db push` no intente repetirlas:

```bash
supabase migration repair --status applied 20261110120000 20261110120100 20261110120200 20261110120300 20261110120400 20261110140000
```

## Fase 0 — Línea base (hacer una sola vez)

El esquema original (`garments`, `garment_actions`, `movements`, `documents`)
nunca se guardó en el repositorio. Antes de aplicar cualquier migración nueva
hay que capturar el estado real de producción:

```bash
# 1. Iniciar sesión y vincular el proyecto (pide la contraseña de la BD)
supabase login
supabase link --project-ref <REF_DEL_PROYECTO>

# 2. Descargar el esquema actual como migración
supabase db pull
```

`db pull` crea `supabase/migrations/<fecha>_remote_schema.sql`. **Renómbralo**
para que quede antes de las migraciones nuevas:

```bash
mv supabase/migrations/*_remote_schema.sql supabase/migrations/20261109000000_baseline.sql
```

Luego revisa el archivo: confirma que existen las tablas `garments`,
`garment_actions`, `movements` y `documents`, y que las políticas coinciden con
lo esperado. Haz commit del baseline **por separado** ("chore: baseline del
esquema de producción").

Después, marca el baseline como ya aplicado en producción (no debe volver a
ejecutarse allí):

```bash
supabase migration repair --status applied 20261109000000
```

## Ambiente de pruebas

Las migraciones se prueban primero en un proyecto de Supabase separado
(recomendado: `ThreadTrack_Test`). Para crearlo desde cero:

```bash
supabase link --project-ref <REF_DE_PRUEBAS>
supabase db push          # aplica baseline + migraciones nuevas
```

Verifica en la app (apuntando `.env` al proyecto de pruebas) antes de aplicar
en producción.

## Aplicar en producción

```bash
supabase link --project-ref <REF_DE_PRODUCCION>
supabase db push --dry-run   # revisa qué se va a aplicar
supabase db push
```

Antes de hacerlo, toma un respaldo (Dashboard → Database → Backups) y anota en
el PR la fecha, quién aplicó y el resultado.

## Reglas

- Nunca editar una migración que ya se aplicó; crear una nueva.
- Nada de `UPDATE`/`DELETE` sobre tablas de historial (`garment_actions`,
  `hose_actions`, `movements`, `audit_log`): la base lo bloquea. Una corrección
  se registra como un movimiento nuevo con motivo.
- Si una migración de mantenimiento realmente necesita tocar historial, debe
  deshabilitar el trigger de inmutabilidad de forma explícita, documentar el
  motivo en el PR y contar con aprobación de Calidad.
