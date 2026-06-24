# Documento de diseño — Repostaje Camión SaaS

Generado: 2026-06-23
Estado: BORRADOR (aprobado para Fase 1)
Repo: gasolineras-camion

---

## 1. Visión

Convertir la app interna de gasolineras de AdmiLogistic en un **SaaS self-serve**
publicado en el blog: cualquier camionero o flota entra, prueba, ve cuánto ahorra,
y paga 5 €/camión/mes sin hablar con un comercial.

**Motor del negocio:** ROI ~80x. Cuesta 5 €/mes, ahorra ~400 €/mes frente a decidir
el repostaje "a ojo" o con Excel. Con ese ratio un solo camión ya merece la pena.

**Función estrella:** el **contador de ahorro**. El producto demuestra con los datos
del propio cliente cuánto se ha ahorrado este mes. Es producto y marketing a la vez.

**Diferenciación frente al mercado:**
- Apps de coche (Gasolineras Baratas, etc.): genéricas, sin inteligencia de camión.
- Tarjetas de flota (BP, Solred, Andamur): atadas a su propia red, no neutrales.
- Nuestro hueco: capa **neutral + inteligente + específica de camión** sobre todas
  las redes, con optimización por ruta e incidencias/restricciones DGT >7.500 kg.

---

## 2. Estado actual (de dónde partimos)

Sitio estático en `public/`:
- `gasolineras.html` (1030 líneas) — vista conductor. Datos **embebidos** en el JS:
  `RAW_DATA` (~160 estaciones red pactada, tab-separated), `ROUTE_GPS`.
- `admin-gasolineras.html` (1578 líneas) — vista admin con login SHA-256.
- `api/gasolineras.js` — proxy serverless a MINETUR (cache CDN 5 min).
- PWA: `manifest.json` + `sw.js`.
- Residual Next.js en `src/` + SQLite `data/gasoil.db` (histórico de precios) — **no se usa
  en producción**, candidato a recuperar la lógica de histórico o a borrar.

**Problemas para escalar a SaaS:**
1. Datos hardcodeados en el HTML → no hay forma de que cada cliente tenga los suyos.
2. No hay cuentas, ni aislamiento por cliente, ni pago.
3. ~40% de JS duplicado entre los dos HTML.

---

## 3. Arquitectura objetivo

```
┌─────────────────────────────────────────────────┐
│  Blog / Landing (pública, sin registro)          │
│  └─ Calculadora de ahorro (gancho de conversión) │
├─────────────────────────────────────────────────┤
│  App (auth requerido)                            │
│  ├─ Vista conductor (gasolineras.html migrada)   │
│  ├─ Panel gestor (admin migrado, multiusuario)   │
│  └─ Contador de ahorro / reporting               │
├─────────────────────────────────────────────────┤
│  Backend / API (Docker, servidor propio)         │
│  ├─ Supabase: Auth + Postgres (RLS por cliente)  │
│  ├─ Proxy MINETUR (precios oficiales, cache)     │
│  ├─ Integración DGT NAP (incidencias/restric.)   │
│  └─ Stripe (suscripciones, webhooks)             │
└─────────────────────────────────────────────────┘
```

**Decisión de stack:** Supabase autoalojado en el Docker del servidor propio.
Da auth + Postgres + RLS (Row Level Security) + storage en una pieza. RLS es la clave
del multi-cliente: cada cuenta solo ve sus datos a nivel de base de datos, sin
depender de filtros en el front.

El front actual se **reaprovecha casi entero**. Solo cambia de dónde lee: de `RAW_DATA`
embebido a llamadas a la API. La UI, el mapa Leaflet, el modo operativo y el plan de
repostaje se mantienen.

---

## 4. Modelo de datos (Supabase / Postgres)

```sql
-- Cuentas (una flota o un autónomo)
tenant            (id, nombre, tipo['autonomo'|'flota'|'whitelabel'],
                   created_at, plan, stripe_customer_id, branding_json)

-- Usuarios, pertenecen a un tenant
profile           (id=auth.uid, tenant_id FK, rol['gestor'|'conductor'], nombre, email)

-- Camiones del tenant
truck             (id, tenant_id FK, matricula, consumo_l_100km, capacidad_deposito_l,
                   tarjetas_json)  -- tarjetas y descuentos de ese cliente

-- Estaciones (catálogo global compartido + overrides por tenant)
station           (id, ideess, nombre, marca, lat, lng, direccion,
                   truck_ok bool, gasoleo_profesional bool, acceso_40t bool, autovia bool)
tenant_station    (tenant_id FK, station_id FK, es_pactada bool, descuento_eur_l, nota)

-- Precios (cache diaria de MINETUR, SIN histórico — se refresca y se pisa cada día)
price             (station_id FK, producto, precio, actualizado_at)

-- Repostajes registrados (base del contador de ahorro)
refuel            (id, tenant_id FK, truck_id FK, station_id FK, litros,
                   precio_pagado, precio_referencia, ahorro_eur, ts)
```

**RLS:** toda tabla con `tenant_id` lleva política `tenant_id = (auth.jwt() ->> 'tenant_id')`.
`station` y `price` son lectura pública (catálogo compartido); `tenant_station`,
`truck`, `refuel` son privadas por tenant.

**Migración de datos actuales:** un script parsea `RAW_DATA` y `ROUTE_GPS` del HTML y
los inserta en `station` + `tenant_station` para el tenant inicial (AdmiLogistic).

---

## 5. La función estrella — contador de ahorro

**Cálculo del ahorro por repostaje:**
```
ahorro = (precio_referencia − precio_pagado) × litros
```
donde `precio_referencia` = precio medio de mercado para ese producto/zona en ese momento
(de MINETUR), y `precio_pagado` = precio de la estación elegida menos el descuento de la
tarjeta del cliente. Se acumula por mes y por camión.

**Versión pública (landing, sin registro):** el visitante mete consumo mensual (litros) y
un % de descuento medio estimado, y ve "ahorrarías ~X €/mes". Engancha antes de pedir email.

**Versión privada (en la cuenta):** "este mes te has ahorrado 387 € reales en 4 camiones".
Este número es el argumento de renovación. Si es creíble y demostrable, retiene.

> Riesgo crítico: el ahorro debe ser REAL. Si alguien prueba y ahorra 40 € no 400 €, se
> va. El `precio_referencia` tiene que estar bien calibrado, no inflado.

---

## 6. Fases de construcción

### Fase 1 — Cimientos multi-cliente (MVP base)
- Levantar Supabase en Docker (auth + Postgres + RLS).
- Crear el esquema de la sección 4.
- Script de migración: `RAW_DATA`/`ROUTE_GPS` → tablas.
- Adaptar `gasolineras.html` para leer de la API en vez de datos embebidos.
- Auth básico (login real, sustituye al SHA-256 hardcodeado).
- **Entregable:** la app actual funcionando sobre BD, con cuentas reales.

### Fase 2 — Contador de ahorro + landing
- Endpoint de cálculo de ahorro + tabla `refuel`.
- Calculadora pública sin registro en la landing del blog.
- Reporting de ahorro dentro de la cuenta.
- **Entregable:** el gancho de conversión vivo.

### Fase 3 — Pago self-serve
- Stripe: productos/precios, checkout, webhooks, prueba gratis.
- Gating por plan (free / pro / flota).
- Alta sin intervención humana.
- **Entregable:** MVP cobrable completo.

### Fase 4 — Diferenciación DGT
- Integración con NAP DGT (DATEX2): incidencias + restricciones >7.500 kg.
- Cruce de incidencias con la ruta de repostaje.
- **Entregable:** lo que nos separa del mercado.

### Fase 5 — White-label
- `branding_json` por tenant: logo, colores, dominio propio.
- Onboarding de cliente white-label.
- **Entregable:** ticket alto para flotas grandes.

Fases 1-3 = MVP cobrable. 4-5 = diferenciación y upsell.

---

## 7. Marketing / conversión (blog)

- **Hero del blog = la calculadora de ahorro.** No "mira un mapa", sino "mete tu consumo
  y ve cuánto ahorras". Número antes que registro.
- SEO: free tier de consulta de precios de camión = tráfico orgánico que alimenta el embudo.
- Prueba de credibilidad: dato de ahorro real de AdmiLogistic ("nosotros ahorramos X%").
- Precio ancla: 5 €/camión contra 400 € de ahorro. El ratio es el anuncio.

---

## 8. Decisiones tomadas / abiertas

- **RESUELTO:** los precios se refrescan a diario desde MINETUR y se pisan. NO se guarda
  histórico. La tabla `price` es una cache diaria, no un histórico.
- **RESUELTO:** se borra el residual Next.js (`src/`) y `data/*.db`. No se recupera nada.
- **RESUELTO:** todo se monta en el servidor propio (Docker), no en cloud externo.
- Abierto: dominio del blog y subdominio de la app.
- Abierto: calibración exacta del `precio_referencia` (clave para que el ahorro sea creíble).
- Abierto: job diario de refresco de precios (cron en el servidor que llama a MINETUR y
  actualiza `price`).

---

## 9. Próximo paso

Arrancar **Fase 1**: levantar Supabase en Docker y crear el esquema. Antes de tocar,
confirmar acceso al servidor y a la instancia Supabase.
