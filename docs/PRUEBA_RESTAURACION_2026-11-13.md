# Reporte de prueba de restauración de respaldo

| Campo | Valor |
|---|---|
| Sistema | ThreadTrack (base de datos PostgreSQL en Supabase, plan Pro) |
| Fecha de la prueba | 2026-11-13 |
| Ejecutó | Servicio de TI, Grupo CSCI |
| Tipo de prueba | Restauración del respaldo diario automático a un **proyecto nuevo** (sin afectar producción) |
| Respaldo restaurado | Respaldo diario del 13 nov 2026, 07:45:27 UTC (el más reciente disponible) |
| Región | us-east-2 (misma que producción) |
| Requisito | EU GMP Anexo 11 §7.2 (verificar periódicamente la restauración); cuestionario del cliente, sección 7 |

## 1. Objetivo

Comprobar que los respaldos automáticos diarios se pueden restaurar completos y con datos íntegros, y medir el tiempo de restauración de la base de datos.

## 2. Respaldos disponibles

Se verificó que existen respaldos diarios completos (estado *COMPLETED*) de los últimos 8 días: del 06 al 13 de noviembre de 2026, todos alrededor de las 07:45 UTC.

## 3. Procedimiento ejecutado

1. Se registró el conteo de control en **producción** (consulta del punto 4).
2. En *Database → Backups → Restore to new project* se eligió el respaldo del 13 nov 2026, 07:45:27 UTC.
3. Se confirmó la restauración. Se transfieren el esquema (tablas, vistas, funciones), todos los datos e índices, y los roles, permisos y usuarios de la base.
4. Inicio: **10:37** (hora local, UTC-6). Fin: **10:40**. El proyecto restaurado quedó con todos sus servicios en estado *Healthy*: base de datos, PostgREST, Auth, Realtime, Storage y Edge Functions.
5. Se ejecutó la misma consulta de control en el **proyecto restaurado** y se comparó con producción.

## 4. Consulta de control

```sql
select 'prendas' tabla, count(*) registros, max(updated_at) ultimo from garments
union all select 'acciones de prendas', count(*), max(created_at) from garment_actions
union all select 'productos de mangueras', count(*), max(updated_at) from equipment
union all select 'acciones de mangueras', count(*), max(created_at) from hose_actions
union all select 'audit trail', count(*), max(occurred_at) from audit_log
union all select 'firmas electrónicas', count(*), max(signed_at) from electronic_signatures
union all select 'usuarios', count(*), max(updated_at) from user_profiles
order by 1;
```

## 5. Resultados

| Tabla | Producción | Restaurado | Último registro (UTC) | ¿Coincide? |
|---|---|---|---|---|
| Acciones de mangueras | 31 | 31 | 2026-09-04 16:42:15 | Sí |
| Acciones de prendas | 266 | 266 | 2026-11-10 21:37:40 | Sí |
| Audit trail | 473 | 473 | 2026-11-10 22:40:13 | Sí |
| Firmas electrónicas | 1 | 1 | 2026-11-10 17:52:42 | Sí |
| Prendas | 226 | 226 | 2026-11-10 21:37:40 | Sí |
| Productos de mangueras | 1 | 1 | 2026-09-03 20:06:04 | Sí |
| Usuarios | 5 | 5 | 2026-11-10 22:40:13 | Sí |

**Resultado: APROBADA.** Los 7 conteos de control y sus fechas coinciden exactamente. El respaldo es completo e íntegro: incluye el audit trail y las firmas electrónicas. No hubo registros en producción posteriores al respaldo, por eso los valores son idénticos.

## 6. Tiempos de recuperación

| Indicador | Valor | Comentario |
|---|---|---|
| Restauración de la base de datos (medido) | **≈ 3 minutos** | Volumen actual de datos; crecerá con el tamaño de la base. |
| Recuperación completa del servicio (estimado) | **≈ 1 hora** | Incluye reconfigurar lo que la restauración no transfiere: ajustes de Auth y llaves de API, Edge Function `admin-users`, extensiones, y las variables de la aplicación en Vercel (URL y llave del nuevo proyecto) con su redespliegue. |
| Pérdida máxima de datos (RPO) | **≤ 24 horas** | Respaldo diario. Se reduce a ~2 minutos si se activa Point-in-Time Recovery. |

## 7. Observaciones

1. **Configuración que no se restaura sola** (según la propia pantalla de Supabase): Storage, Edge Functions, ajustes de Auth y llaves de API, extensiones y réplicas. Debe quedar en el procedimiento de recuperación con sus pasos y valores. Los ajustes de Auth están en la evaluación de cumplimiento, sección 6.
2. **Historial de migraciones de Supabase:** el proyecto muestra como última migración `backup_before_integrity_20261110`, porque las migraciones posteriores se aplicaron manualmente en el SQL Editor. Las migraciones sí están aplicadas: la restauración trajo el esquema completo. Para que el historial también lo refleje, se ejecuta el comando `supabase migration repair` documentado en `docs/MIGRACIONES.md`.
3. **Proyecto temporal:** tiene un costo de ≈ 10 USD/mes prorrateado. Se elimina al terminar la prueba (ver punto 9).

## 8. Evidencia

Capturas archivadas fuera del repositorio público, en `docs/evidencias/restauracion-2026-11-13/`. Deben pasarse al sistema documental del proveedor.

| Archivo | Contenido |
|---|---|
| 01_produccion_conteo_antes.png | Consulta de control en producción |
| 02_respaldos_disponibles.png | Respaldos diarios disponibles (06–13 nov) |
| 03_crear_proyecto_restauracion.png | Creación del proyecto de restauración |
| 04_confirmar_restauracion.png | Confirmación: qué se transfiere y qué se reconfigura |
| 05_restauracion_en_progreso.png | Restauración en curso |
| 06_proyecto_restaurado_servicios.png | Servicios del proyecto restaurado en estado *Healthy* |
| 07_proyecto_restaurado_estado.png | Estado general del proyecto restaurado |
| 08 y 09_conteo_comparacion | Consultas de control para comparar producción y restaurado |

## 9. Cierre

- [x] Proyecto temporal de restauración eliminado (2026-11-13).
- [ ] Siguiente prueba: periódica (se sugiere cada 6 meses) y después de cualquier cambio mayor de infraestructura.

| Ejecutó | Revisó | Fecha |
|---|---|---|
| | | |
