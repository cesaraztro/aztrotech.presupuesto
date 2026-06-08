# AztroTech Presupuesto

Producto financiero multiusuario de AztroTech para convertir deudas, ventas,
recompensas y pagos en un plan operativo calendarizado.

En vivo: <https://presupuesto.aztrotechacademy.com>

## Que incluye

- Login con Supabase Auth.
- Cuenta nueva en cero con onboarding guiado.
- Estado `version: 2` guardado por usuario en Supabase.
- Migracion desde el estado v1 anterior para no perder datos existentes.
- Dashboard premium con salud financiera, acciones y proximos eventos.
- Deudas con saldo, minimo, pago planeado, tasa anual y dia de pago.
- Productos/servicios configurables por usuario.
- Plan mensual rolling 12 meses y metas semanales.
- Registro de ventas reales por fecha.
- Recompensas con triggers por ventas acumuladas.
- Calendario interno con pagos, metas semanales y recompensas.
- Exportacion a Excel con datos reales del usuario.
- PWA instalable y cache offline del shell.

## Arquitectura

La app sigue siendo estatica y no requiere build step:

```text
index.html
assets/styles.css
assets/app.js
assets/state.js
assets/finance.js
assets/calendar.js
supabase/schema.sql
manifest.webmanifest
sw.js
```

## Supabase

La tabla se mantiene como una fila por usuario:

```sql
public.presupuestos (
  user_id uuid primary key references auth.users(id),
  state jsonb not null,
  updated_at timestamptz not null
)
```

Aplica `supabase/schema.sql` en SQL Editor y confirma que RLS este activo.

## Desarrollo local

```bash
cd /Users/emperadorholguin/Downloads/aztrotech.presupuesto
python3 -m http.server 8000
```

Abre <http://localhost:8000>.

## Deploy

El sitio publica desde GitHub Pages. Cada push a `main` actualiza:

<https://presupuesto.aztrotechacademy.com>
