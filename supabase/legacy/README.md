# Scripts SQL heredados (solo referencia)

Estos scripts se ejecutaron **a mano** en el SQL Editor de Supabase antes de que
el proyecto usara migraciones versionadas. Se conservan solo como evidencia
histórica de cómo se construyó la base de datos.

**No los vuelvas a ejecutar.** Varios reemplazan políticas o funciones que
migraciones posteriores ya cambiaron, y `UNIFY_WASH_STERILIZATION_SETUP.sql`
reescribe registros históricos (lo cual ya no está permitido: el historial de
acciones es inmutable desde `20261110120000_audit_trail.sql`).

Orden aproximado en que se aplicaron:

1. `ROLES_SETUP.sql`
2. `ADMIN_FUNCTION_SETUP.sql`
3. `ASSIGNMENTS_SETUP.sql` (se corrigió un `USING` duplicado en la política de DELETE)
4. `TEAMS_SETUP.sql`
5. `SHORT_CODE_SETUP.sql`
6. `RESPONSABLE_SETUP.sql`
7. `HOSES_SETUP.sql`
8. `HOSES_LENGTH_SETUP.sql`
9. `UNIFY_WASH_STERILIZATION_SETUP.sql`
10. `USER_MODULE_ACCESS_SETUP.sql`

El esquema base (`garments`, `garment_actions`, `movements`, `documents`) nunca
se guardó en el repositorio; se recupera con `supabase db pull`
(ver `docs/MIGRACIONES.md`).
