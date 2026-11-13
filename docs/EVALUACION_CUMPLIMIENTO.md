# Evaluación de cumplimiento regulatorio — ThreadTrack

**Alcance:** 21 CFR Part 11, EU GMP Anexo 11, GAMP 5 (2.ª ed.) e integridad de datos (ALCOA+).
**Sistema evaluado:** ThreadTrack v1.3.0 (aplicación web React + Supabase/PostgreSQL + Vercel).
**Fecha:** 2026-11-13.
**Propósito:** evaluación previa del proveedor (gap assessment) antes de preparar el paquete de documentación y validación. Es un documento de trabajo interno; la versión para el cliente se deriva de él.

---

## 1. Qué está pidiendo realmente el cliente

> «…que el proveedor confirme si el sistema ha sido evaluado o diseñado considerando requisitos de 21 CFR Part 11, Anexo 11, GAMP 5 e Integridad de Datos, así como la documentación de validación disponible.»

Esto implica dos cosas distintas:

1. **Diseño del sistema (lo que depende del software).** Que los controles técnicos existan: audit trail, firma electrónica, control de acceso, integridad, respaldos, etc. → Secciones 3 a 6.
2. **Evidencia documental (lo que depende de documentos).** Que el proveedor tenga un ciclo de vida controlado (GAMP 5) y entregue documentación que el cliente use para **validar** el sistema en su uso previsto. → Sección 7.

Puntos clave para responder con precisión:

- **No existe una "certificación Part 11" ni "certificación GAMP 5".** Ningún proveedor puede afirmarlo. Lo correcto es declarar que el sistema fue **diseñado para soportar el cumplimiento** y entregar la evidencia.
- **El cumplimiento final es del cliente regulado.** Part 11 y el Anexo 11 exigen controles técnicos (del sistema) **y** procedimentales (SOP del cliente: capacitación, responsabilidad por firmas, revisión de audit trail, gestión de incidentes). El proveedor cubre lo técnico y apoya lo documental.
- **La validación la ejecuta y aprueba el cliente** (o un tercero contratado por él), apoyándose en la documentación y las pruebas del proveedor (GAMP 5 promueve aprovechar la evidencia del proveedor).
- En México, la **NOM-059-SSA1** (Buenas Prácticas de Fabricación) también pide validar los sistemas computarizados que impactan la calidad; conviene citarla en el paquete junto a Part 11 y el Anexo 11.

## 2. Clasificación GAMP 5

| Componente | Categoría GAMP 5 | Comentario |
|---|---|---|
| ThreadTrack (aplicación) | **Categoría 5 – aplicación a la medida** | Desarrollo propio; requiere el ciclo de vida completo (especificaciones, revisión de código, pruebas, trazabilidad). |
| Supabase (PostgreSQL, Auth), Vercel (hosting), navegador | **Categoría 1 – infraestructura** | Se califican por evaluación del proveedor de servicio (SOC 2, disponibilidad, respaldos), no se validan funcionalmente. |

Respuesta a "¿COTS o a la medida?": **software a la medida, ofrecido como servicio (SaaS) multiempresa**, configurable por empresa y módulo (prendas / mangueras).

## 3. Estado general

| Área | Estado |
|---|---|
| Controles técnicos Part 11 / Anexo 11 | **Cubiertos**, con los ajustes de la versión 1.3.0 (sección 5) y la configuración pendiente del Dashboard de Supabase (sección 6). |
| Integridad de datos (ALCOA+) | **Cubierta** en el diseño. |
| Ciclo de vida GAMP 5 (evidencia del proveedor) | **Parcial**: hay control de versiones, bitácora de cambios de base de datos y 180 pruebas automatizadas; **faltan los documentos formales** (sección 7). |
| Procedimientos del cliente | **Responsabilidad del cliente**; el proveedor puede entregar plantillas. |

**Conclusión:** el sistema puede declararse *diseñado considerando* Part 11, Anexo 11, GAMP 5 e integridad de datos. **No** debe declararse "validado" hasta que exista el paquete de validación ejecutado y aprobado.

## 4. Matriz de requisitos

Leyenda: ✅ cumple · 🟡 cumple con condición o configuración pendiente · 📄 requiere documento/procedimiento · 👤 responsabilidad del cliente.

### 4.1 21 CFR Part 11 — Subparte B (registros electrónicos)

| Requisito | Estado | Cómo se cumple / evidencia |
|---|---|---|
| 11.10(a) Validación (exactitud, confiabilidad, desempeño, detectar registros alterados) | 🟡📄 | Pruebas automatizadas de base de datos (`npm run test:db`, 180 casos); registros inmutables. Falta el paquete de validación formal (IQ/OQ/PQ). |
| 11.10(b) Copias exactas y completas, legibles y electrónicas | ✅ | Reportes Excel con hoja de parámetros (quién generó, cuándo, filtros, zona horaria, versión); audit trail legible + hoja "Detalle técnico" con el registro original completo. |
| 11.10(c) Protección de registros durante su retención | ✅🟡 | Historial inmutable (triggers que bloquean UPDATE/DELETE/TRUNCATE), FK `RESTRICT`, archivado en lugar de borrado; respaldos diarios de Supabase. Falta SOP de retención y archivo (📄). |
| 11.10(d) Acceso limitado a personas autorizadas | ✅ | Cuentas individuales, RLS por empresa y módulo, roles, cuentas desactivables, cierre de sesión por inactividad (15 min). |
| 11.10(e) Audit trail seguro, generado por el sistema, con fecha y hora; no oculta valores previos; se conserva igual que el registro | ✅ | `audit_log` por trigger (usuario, rol, fecha/hora del servidor, valor anterior y nuevo, campos, motivo); inmutable; acotado por empresa y módulo. |
| 11.10(f) Verificación de secuencia de operaciones | ✅ | Transiciones de estado en el servidor; **la baja de una prenda es definitiva**; **límite de ciclos** (prendas 100, mangueras 200): el sistema detiene el registro y solo continúa con la autorización firmada de un supervisor, jefe o administrador (v1.3.0). |
| 11.10(g) Verificación de autoridad | ✅ | Permisos por rol y módulo en funciones SECURITY DEFINER y políticas RLS (operador no da de baja, no edita, no ve reportes). |
| 11.10(h) Verificación de dispositivos/origen de datos | ✅ | Captura por pistola lectora de QR (entrada de teclado) en equipos de cómputo; validación del código y de su formato en el alta y en la importación; los ciclos se cuentan automáticamente, no se capturan. |
| 11.10(i) Personal capacitado | 👤📄 | Registro de capacitación del cliente; el proveedor entrega manual de usuario. |
| 11.10(j) Política escrita de responsabilidad por la firma electrónica | 👤📄 | SOP del cliente; el proveedor puede entregar plantilla. |
| 11.10(k) Control de la documentación del sistema | 🟡📄 | Git, `docs/MIGRACIONES.md` (bitácora de cambios con verificación), versión visible en la aplicación (`v1.3.0 · commit`). Falta SOP de control de cambios. |
| 11.30 Sistemas abiertos | ✅ | Se trata como sistema abierto (internet): TLS en tránsito, cifrado en reposo del proveedor de base de datos, encabezados de seguridad (HSTS, CSP). |
| 11.50 Manifestación de la firma (nombre impreso, fecha y hora, significado) en el registro y en su forma legible | ✅ | Tabla `electronic_signatures` (nombre, correo, rol, significado, fecha/hora); **visible en pantalla y en los reportes** (v1.3.0). |
| 11.70 Vínculo firma–registro | ✅ | La firma se crea dentro de la misma transacción de la acción y se enlaza por `signature_id`; firmas y acciones son inmutables. |

### 4.2 21 CFR Part 11 — Subparte C (firmas electrónicas)

| Requisito | Estado | Cómo se cumple / evidencia |
|---|---|---|
| 11.100(a) Firma única, no reutilizable ni reasignable | ✅ | Ligada a la cuenta individual; las cuentas no se reasignan (se desactivan). |
| 11.100(b) Verificar identidad antes de asignar la firma | 👤📄 | Procedimiento de alta de usuarios del cliente. |
| 11.100(c) Certificación a la FDA | 👤 | Solo si el cliente presenta registros a la FDA (carta del cliente). |
| 11.200(a)(1) Dos componentes; primera firma de la sesión con ambos | ✅ | **v1.3.0:** la primera firma de cada sesión exige usuario (correo) + contraseña; las siguientes, la contraseña. |
| 11.200(a)(2) Uso solo por su titular | ✅👤 | Contraseña personal, política de contraseñas; SOP del cliente. |
| 11.200(a)(3) Requiere colaboración de dos personas para falsificarla | ✅ | Las contraseñas solo se guardan cifradas (hash); nadie, ni el administrador, puede verlas. |
| 11.300(a) Unicidad de usuario + contraseña | ✅ | El correo es único. |
| 11.300(b) Revisión periódica / caducidad | ✅ | Vigencia de 90 días, historial de 5, complejidad, cambio obligatorio de contraseña temporal. |
| 11.300(c) Pérdida o compromiso de credenciales | ✅ | Restablecimiento por el administrador con contraseña temporal; desactivación inmediata. |
| 11.300(d) Detectar y reportar de inmediato intentos no autorizados | ✅🟡 | Registro de intentos fallidos (acceso y firma); bloqueo a los 5 intentos en 15 min por 30 min; **aviso al administrador en la aplicación** (v1.3.0). Ver riesgo residual R1. |
| 11.300(e) Pruebas periódicas de dispositivos/tokens | N/A | No se usan tokens físicos. |

### 4.3 EU GMP Anexo 11

| § | Requisito | Estado | Cómo se cumple / evidencia |
|---|---|---|---|
| 1 | Gestión de riesgos en todo el ciclo de vida | 📄 | Falta la evaluación de riesgos formal (FMEA). |
| 2 | Personal | 👤 | — |
| 3 | Proveedores y prestadores de servicio | 📄 | Falta evaluación documentada de Supabase y Vercel y acuerdo de servicio/calidad con el cliente. |
| 4 | Validación (inventario, URS, trazabilidad, pruebas) | 📄 | Faltan URS, especificación funcional, matriz de trazabilidad y protocolos. |
| 5 | Intercambio de datos con verificación | ✅ | Importación con validación previa (formato, duplicados, existentes) y vista previa antes de crear. |
| 6 | Verificación de exactitud de datos críticos | ✅ | Validación del código en alta e importación; el nombre se genera del código; ciclos automáticos. |
| 7.1 | Almacenamiento seguro, accesible, legible y exacto | ✅ | PostgreSQL con RLS, cifrado en reposo, inmutabilidad. |
| 7.2 | Respaldos periódicos y verificación de la restauración | ✅📄 | Respaldos diarios (plan Pro, 7 días). **Prueba de restauración aprobada el 2026-11-13** (`docs/PRUEBA_RESTAURACION_2026-11-13.md`). Falta el SOP con la periodicidad de la prueba. |
| 8 | Impresiones claras | ✅ | Reportes Excel legibles con hoja de parámetros. |
| 9 | Audit trail de cambios GMP con motivo; disponible, legible y **revisado periódicamente** | ✅📄 | Audit trail con motivo obligatorio en ediciones. La revisión periódica es SOP del cliente. |
| 10 | Gestión de cambios y configuración | 🟡📄 | Git + bitácora de migraciones + versión visible; falta SOP de control de cambios. |
| 11 | Evaluación periódica | 👤📄 | — |
| 12 | Seguridad física y lógica; registro de altas, cambios y bajas de acceso; identidad del operador con fecha y hora | ✅ | Cambios de usuarios en el audit trail; cierre por inactividad; cada registro guarda usuario, nombre y fecha/hora. |
| 13 | Gestión de incidentes | 📄 | Falta procedimiento de incidentes. |
| 14 | Firma electrónica con el mismo efecto que la autógrafa, ligada permanentemente, con fecha y hora | ✅ | Ver 11.50 / 11.70. |
| 15 | Liberación de lotes | N/A | El sistema no libera lotes. |
| 16 | Continuidad del negocio | 📄 | Falta plan (RTO/RPO, procedimiento alterno en papel). |
| 17 | Archivo (accesible, legible, íntegro durante la retención) | 🟡📄 | Los registros no se borran; falta SOP de archivo y exportación periódica. |

### 4.4 Integridad de datos (ALCOA+)

| Principio | Cómo se cumple |
|---|---|
| **A**tribuible | Cada registro guarda usuario, nombre completo y correo; firma con nombre impreso. |
| **L**egible | Interfaz y reportes en español, audit trail en lenguaje claro. |
| **C**ontemporáneo | Fecha y hora del servidor (UTC) al momento de la acción; el usuario no puede capturarla. |
| **O**riginal | Valor original conservado en el audit trail y en la hoja "Detalle técnico". |
| **E**xacto (*Accurate*) | Validaciones en el servidor, conteo automático de ciclos, códigos verificados. |
| **C**ompleto | Nada se borra; archivado con motivo; historial completo por QR. |
| **C**onsistente | Secuencia controlada en el servidor; marcas de tiempo del servidor; zona horaria declarada en los reportes. |
| **D**uradero (*Enduring*) | PostgreSQL administrado con respaldos diarios. |
| **D**isponible | Consulta por QR, estado a cualquier fecha, reportes por periodo. |

## 5. Cambios de la versión 1.3.0 (cierre de brechas técnicas)

| Brecha encontrada | Requisito | Corrección |
|---|---|---|
| Una prenda dada de baja podía regresar a "Disponible" con una acción posterior. | 11.10(f) | Trigger: la baja es un estado definitivo (también bloquea cambios por SQL directo). |
| La firma solo pedía la contraseña. | 11.200(a)(1) | Primera firma de cada sesión: usuario + contraseña; después solo contraseña. |
| La pantalla y los reportes solo decían "Firmado: Sí". | 11.50 | Se muestran nombre del firmante, fecha y hora y significado. |
| Sin cierre de sesión por inactividad. | 11.10(d), 11.300, Anexo 11 §12 | Aviso a los 14 min y cierre a los 15 min; se respeta la actividad en otras pestañas. |
| Bloqueos e intentos fallidos solo visibles en reportes. | 11.300(d) | Aviso inmediato al administrador en todas las pantallas. |
| Reportes sin zona horaria ni versión del sistema. | ALCOA+ (consistente), Anexo 11 §10 | La hoja de parámetros incluye zona horaria y versión + commit. |
| Sin encabezados de seguridad HTTP. | 11.30 | HSTS, CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. |
| Versión fija, sin relación con el despliegue. | 11.10(k), Anexo 11 §10 | Versión + commit desplegado visible en la aplicación. |
| Las prendas no tenían tope de ciclos; las mangueras se bloqueaban sin opción. | 11.10(f), 11.10(g) | Ambos se detienen en su límite (100 / 200); continuar exige la autorización de un superior con usuario y contraseña, registrada como su firma electrónica en la acción. |
| Escaneo por cámara sin uso (se trabaja con pistola en computadoras). | Reducción de superficie | Se retiró la cámara y su librería; el navegador ya no concede permiso de cámara. |

## 6. Configuración pendiente en el Dashboard de Supabase (la hace el administrador del proyecto)

| Ajuste | Dónde | Valor recomendado | Por qué |
|---|---|---|---|
| Inactivity timeout | Auth → Sessions | ✅ 1 h (la app cierra a los 15 min) | Refuerza en el servidor el cierre por inactividad de la aplicación. |
| Time-box user sessions | Auth → Sessions | ✅ 12 h | Obliga a reautenticarse al menos una vez por turno. |
| Requisitos de contraseña | Auth → Providers → Email | ✅ Mínimo 12 caracteres; minúsculas, mayúsculas, dígitos y símbolos; contraseñas filtradas bloqueadas | Que la política se cumpla incluso si alguien cambia su contraseña por fuera de la aplicación (riesgo R2). |
| Secure password change / Require current password | Auth → Providers → Email | ✅ Secure password change y "Require current password when updating" activados | Exige sesión reciente para cambiar la contraseña. |
| Password verification hook | Auth → Hooks | Activar si el plan lo permite | Lleva el conteo y bloqueo de intentos al servidor de autenticación (riesgo R1). |
| Point-in-Time Recovery | Database → Backups | Opcional (~100 USD/mes, 7 días) | Baja la pérdida máxima de datos de 24 h a ~2 min. |
| Prueba de restauración | Database → Backups → Restore to new project | ✅ Hecha el 2026-11-13; repetir cada 6 meses | Evidencia exigida por el Anexo 11 §7.2 y el cuestionario. |

## 7. Paquete de documentación (GAMP 5) — siguiente fase

Orden sugerido; los marcados (P) los elabora el proveedor, (C) el cliente con apoyo del proveedor.

1. **(P) Descripción del sistema y arquitectura** — componentes, flujos de datos, ubicación de la información, seguridad.
2. **(P) Evaluación del proveedor de infraestructura** — Supabase y Vercel (certificaciones SOC 2, cifrado, respaldos, región).
3. **(C/P) Especificación de requerimientos de usuario (URS).**
4. **(P) Especificación funcional (FS)** — derivada de la aplicación actual.
5. **(P) Evaluación de riesgos (FMEA)** — funciones con impacto GMP.
6. **(P) Matriz de trazabilidad** URS → FS → pruebas.
7. **(P) Evidencia de pruebas del proveedor** — suite automatizada (180 casos) con reporte de ejecución.
8. **(C/P) Protocolos IQ/OQ/PQ** y reporte de validación.
9. **(P) Manual de usuario y de administrador.**
10. **(P) SOP de control de cambios y liberación de versiones.**
11. **(P) SOP de respaldo, restauración y continuidad** + **evidencia de la prueba de restauración**.
12. **(C) SOP del cliente:** uso de firma electrónica, alta/baja de usuarios, revisión periódica del audit trail, incidentes, retención y archivo.
13. **(P) Acuerdo de servicio / calidad** (SLA, notificación de cambios, soporte, retención y entrega de datos al terminar el contrato).

## 8. Riesgos residuales (declararlos, no ocultarlos)

| # | Riesgo | Mitigación actual | Mitigación propuesta |
|---|---|---|---|
| R1 | El bloqueo por intentos fallidos se cuenta desde el flujo de la aplicación; un ataque directo a la API de autenticación no suma intentos. | Aunque obtenga sesión, una cuenta bloqueada o desactivada no ve ningún dato (RLS); Supabase limita la tasa de intentos. | Password verification hook (sección 6). |
| R2 | Un cambio de contraseña hecho directamente contra la API de autenticación no pasa por el historial de 5 ni reinicia la vigencia. | El cambio queda en los registros de Supabase Auth. | Requisitos de contraseña y "secure password change" en el Dashboard (sección 6). |
| R3 | Respaldos diarios con retención de 7 días; pérdida máxima de 24 h. | Los registros vivos no se borran. | PITR opcional; exportación periódica de archivo (SOP). |
| R4 | Infraestructura de terceros (Supabase, Vercel). | Proveedores con certificaciones de seguridad. | Evaluación documentada de proveedores (sección 7, punto 2). |

## 9. Respuestas cortas al cuestionario del cliente

| Sección | Respuesta corta |
|---|---|
| 1. Información general | Software a la medida (SaaS multiempresa), GAMP 5 categoría 5; trazabilidad por QR de prendas y mangueras con conteo automático de ciclos. Documentación técnica en preparación (sección 7). |
| 2. Integridad de datos | Sí: audit trail automático con usuario, fecha y hora, valor anterior, valor nuevo y motivo; inmutable (ni el administrador puede modificarlo o borrarlo); validaciones en el servidor. |
| 3. Gestión de usuarios | Cuentas individuales; roles (operador, supervisor, jefe, administrador) por módulo; desactivación y bloqueo; política de contraseñas configurada. |
| 4. Conteo de esterilizaciones | Automático por cada acción registrada; nadie puede editar el conteo; las correcciones de datos descriptivos exigen motivo y quedan en el audit trail; el historial completo se reconstruye a cualquier fecha. |
| 5. Registros y trazabilidad | Historial completo por QR; estado a cualquier fecha; registros que no se borran; reportes históricos exportables. |
| 6. Seguridad | Cifrado en tránsito (TLS) y en reposo; control de acceso por empresa y módulo; cambios controlados con bitácora; intentos fallidos registrados; bloqueo automático a los 5 intentos. |
| 7. Respaldos | Respaldos automáticos diarios (retención 7 días). Prueba de restauración documentada el 2026-11-13: la base se restauró en ≈ 3 min con datos íntegros; recuperación completa del servicio estimada en ≈ 1 h; pérdida máxima ≤ 24 h. Procedimiento formal en preparación. |
| Adicional | Diseñado considerando 21 CFR Part 11, Anexo 11, GAMP 5 e integridad de datos (este documento). Paquete de validación en preparación; la validación en su uso previsto la ejecuta y aprueba el cliente con la evidencia del proveedor. |
