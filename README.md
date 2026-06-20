# App Gasoil

Aplicación de precios de gasoil/gasolineras con mapa y ruta de repostaje, construida con Next.js.

## Stack
- Next.js (App Router) + TypeScript
- API interna (`/api/prices`, `/api/update`, `/api/setup`, `/api/history`)
- Docker (deploy en Fly.io / Railway)

## Desarrollo
```bash
npm install
npm run dev
```

## Notas
- El panel admin se sirve en `/admin-gasolineras.html` (login con hash en cliente).
- Ver `.claude/state.md` para el estado y pendientes.
