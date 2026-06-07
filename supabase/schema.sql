-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  AztroTech Presupuesto — Esquema de base de datos (Supabase)       ║
-- ║  Cómo usarlo:                                                       ║
-- ║   1. Entra a tu proyecto en https://supabase.com                   ║
-- ║   2. Menú izquierdo → "SQL Editor" → "New query"                   ║
-- ║   3. Pega TODO este archivo y dale "Run"                           ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- Tabla: una fila por usuario, con todo su presupuesto en un JSON.
create table if not exists public.presupuestos (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Seguridad a nivel de fila: cada quien solo ve/edita lo suyo.
alter table public.presupuestos enable row level security;

-- (Re)crear políticas de forma idempotente.
drop policy if exists "leer lo propio"        on public.presupuestos;
drop policy if exists "insertar lo propio"    on public.presupuestos;
drop policy if exists "actualizar lo propio"  on public.presupuestos;
drop policy if exists "borrar lo propio"      on public.presupuestos;

create policy "leer lo propio"
  on public.presupuestos for select
  using (auth.uid() = user_id);

create policy "insertar lo propio"
  on public.presupuestos for insert
  with check (auth.uid() = user_id);

create policy "actualizar lo propio"
  on public.presupuestos for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "borrar lo propio"
  on public.presupuestos for delete
  using (auth.uid() = user_id);
