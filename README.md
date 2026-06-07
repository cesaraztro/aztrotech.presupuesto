# AztroTech — Presupuesto Maestro 2026

Web app financiera de AztroTech: centro de deudas interactivo, plan de ventas,
simulador de ingresos, recompensas y seguimiento. Ahora con **login en la nube**,
**instalable como app (PWA)** y **alertas + histórico de deuda**.

> La app **funciona tal cual** abriéndola sin configurar nada (modo local, sin
> guardar). Para guardar en la nube y entrar con usuario, configura Supabase (abajo).

---

## 🚀 Puesta en marcha (una sola vez)

### 1) Supabase — login + guardado en la nube
1. Entra a <https://supabase.com> y crea un proyecto gratis.
2. Menú **SQL Editor → New query** → pega TODO el archivo [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. Ve a **Project Settings → API** y copia dos datos:
   - **Project URL** (ej. `https://abcd1234.supabase.co`)
   - **anon public** key (es segura de exponer en el navegador)
4. Abre [`index.html`](index.html), busca el bloque `SB_CFG` (arriba del primer `<script>`)
   y pega tus valores:
   ```js
   const SB_CFG = {
     url:     "https://abcd1234.supabase.co",
     anonKey: "eyJ......"   // tu anon public key
   };
   ```
5. (Opcional) En **Authentication → Providers → Email**, desactiva "Confirm email"
   si quieres entrar sin tener que confirmar el correo la primera vez.

### 2) Vercel — publicar en un subdominio gratis
1. Entra a <https://vercel.com> e inicia sesión con GitHub.
2. **Add New → Project** → importa el repo `cesaraztro/aztrotech.presupuesto`.
3. Framework Preset: **Other** · sin build command · output = raíz (ya hay `vercel.json`).
4. **Deploy**. Quedará en algo como `https://aztrotech-presupuesto.vercel.app`.
5. Cada `git push` a `main` vuelve a desplegar automáticamente.
   Cuando quieras dominio propio: **Project → Settings → Domains**.

---

## 📲 Instalar como app (PWA)
Una vez publicada en `https://…vercel.app`:
- **iPhone (Safari):** Compartir → "Agregar a pantalla de inicio".
- **Android / Chrome:** menú ⋮ → "Instalar app".
- Abre a pantalla completa, con ícono propio, y arranca aunque no haya internet
  (muestra tu último estado guardado).

---

## ✨ Qué incluye
- **5 secciones:** Dashboard, Deudas, Recompensas, Plan de Ventas, Simulador.
- **Login con correo/contraseña** y datos sincronizados entre dispositivos (Supabase).
- **Autoguardado** con indicador "Guardando… / Guardado" en la barra superior.
- **PWA instalable** + arranque offline.
- **Alertas y seguimiento** (pestaña Deudas): avisos de pago bajo el mínimo, deuda
  de mayor interés, liquidaciones del año, meta "libre de deudas" con barra de
  progreso e histórico real de tu deuda (sparkline).
- **Export a Excel** (botón ⬇ Excel) intacto.

---

## 🧪 Probar en local
```bash
cd aztrotech.presupuesto
python3 -m http.server 8000
# abre http://localhost:8000
```
Sin configurar Supabase corre en **modo local** (sin guardar). Con `SB_CFG`
configurado, pide login y guarda en la nube. El service worker solo se activa en
`https://` o `localhost`.

---

## 🗂️ Estructura
```
index.html              ← la app completa (UI + lógica + persistencia)
manifest.webmanifest    ← metadatos PWA
sw.js                   ← service worker (offline)
icons/                  ← íconos de la app (192, 512, maskable)
supabase/schema.sql     ← tabla + seguridad (RLS) para Supabase
vercel.json             ← configuración de hosting estático
```
