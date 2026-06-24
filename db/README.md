# Base de datos — Fase 1 (SaaS repostaje camión)

Artefactos SQL para una instancia **Supabase / Postgres 15 dedicada y aislada**.
Todo el modelo vive en el schema `gasoil` (no se usa `public`).

> Estos scripts **no se ejecutan automáticamente**. Se aplican a mano sobre la
> instancia Supabase de Fase 1 (ver `docs/DISENO-SAAS.md`, secciones 4 y 6).

## Orden de ejecución

Ejecutar en este orden exacto (cada uno depende del anterior):

| # | Fichero | Qué hace |
|---|---------|----------|
| 1 | `01_schema.sql` | Crea el schema `gasoil` y las 7 tablas: `tenant`, `profile`, `truck`, `station`, `tenant_station`, `price`, `refuel`. Índices y comentarios. |
| 2 | `02_rls.sql` | Activa Row Level Security y crea las políticas de aislamiento multi-tenant + grants para los roles `anon`, `authenticated`, `service_role`. |
| 3 | `03_seed_stations.sql` | Inserta el tenant inicial **AdmiLogistic** y las **160 estaciones** de la red pactada en `station`, `price` (cache) y `tenant_station`. |
| 4 | `04_station_address_columns.sql` | Desnormaliza la dirección en columnas propias (`via`, `localidad`, `provincia`, `zona`) que el front necesita para filtros y zonas. Las rellena parseando `station.direccion` y `tenant_station.nota`. |
| 5 | `05_savings_views.sql` | Vistas del **contador de ahorro** (Fase 2): `monthly_savings` (ahorro por tenant/camión/mes) y `savings_current_month` (rollup del mes en curso). Creadas con `security_invoker = true` para respetar la RLS de `refuel`. Solo legibles por `authenticated`. |

### Cómo aplicarlos

Con `psql` (recomendado para mantener el orden y ver errores):

```bash
psql "$SUPABASE_DB_URL" -f db/01_schema.sql
psql "$SUPABASE_DB_URL" -f db/02_rls.sql
psql "$SUPABASE_DB_URL" -f db/03_seed_stations.sql
```

O pegando cada fichero en el **SQL Editor** del panel de Supabase, en orden.

Todos los scripts son **idempotentes**: usan `IF NOT EXISTS`, `CREATE OR REPLACE`,
`DROP POLICY IF EXISTS` antes de crear, y `ON CONFLICT` en los seeds. Se pueden
re-ejecutar sin duplicar datos ni romper.

## Modelo de datos (resumen)

- **tenant** — cuenta cliente (flota / autónomo / white-label). Raíz del aislamiento.
- **profile** — usuario; `id` = `auth.users.id` de Supabase Auth; pertenece a un tenant.
- **truck** — camión del tenant (consumo, depósito, tarjetas/descuentos en JSON).
- **station** — catálogo GLOBAL de estaciones (lectura pública, compartido).
- **tenant_station** — overrides por tenant (red pactada, descuento, nota) PRIVADO.
- **price** — **cache diaria** de precios MINETUR. **Sin histórico** (PK por
  `station_id + producto`, se pisa cada día).
- **refuel** — repostajes registrados; `ahorro_eur` es columna **generada**
  `(precio_referencia - precio_pagado) * litros`. Base del contador de ahorro.

## Seguridad (RLS)

- **Aislamiento por tenant** vía `gasoil.current_tenant_id()`: lee el claim
  `tenant_id` del JWT de Supabase y, como respaldo, lo resuelve desde `profile`.
  - Privadas por tenant: `truck`, `tenant_station`, `refuel`, `profile`, `tenant`.
  - Públicas (solo lectura para `anon` + `authenticated`): `station`, `price`.
  - Escritura de `station`/`price`: **solo `service_role`** (bypassa RLS) — el job
    de ingesta diaria.
- **Pendiente de configurar en Supabase (fuera de este SQL):** un *Auth Hook*
  (`custom_access_token_hook`) que inyecte `tenant_id` como custom claim en el JWT.
  Sin él, las políticas funcionan igual gracias al fallback por `profile`, pero
  con un JOIN extra por consulta.

## Refresco diario de precios (`price`)

La tabla `price` es una cache, no un histórico. El refresco lo hará un job
(cron en el servidor, sección 8 del diseño) que, con `service_role`:

```sql
INSERT INTO gasoil.price (station_id, producto, precio, actualizado_at)
VALUES (...)  -- datos del día desde MINETUR
ON CONFLICT (station_id, producto)
DO UPDATE SET precio = EXCLUDED.precio, actualizado_at = EXCLUDED.actualizado_at;
```

Es decir: **upsert que pisa** el precio anterior. No se guarda el valor previo.

## Notas y pendientes

- **lat/lng:** las coordenadas del seed provienen del diccionario `COORDS` del
  front (`public/gasolineras.html`), con **precisión a nivel de localidad**, no de
  surtidor. Las 160 estaciones tienen coordenadas (0 quedaron NULL). Conviene
  **geocodificar por dirección/ideess** más adelante para precisión real.
- **ideess NULL:** las estaciones de la red pactada no tienen código EESS de
  MINETUR asignado; el campo queda NULL (índice único parcial lo permite).
- **marca:** derivada de la primera palabra del nombre. **19 de 160** estaciones
  no tienen marca reconocible (nombres propios como *Magdaoil*, *Ruta 4*,
  *El Sol*, *Cetanoil*...) y quedan con `marca = NULL`.
- **IDs deterministas:** cada `station.id` se genera como
  `md5('nombre|localidad|provincia')::uuid`. Esto hace el seed idempotente y
  permite que `tenant_station`/`price` referencien la misma estación sin un
  `RETURNING` por fila.
- **price semilla:** el seed carga el precio embebido en `RAW_DATA` como producto
  `gasoleo_a` solo para arrancar; el job diario lo sustituirá por datos MINETUR.
