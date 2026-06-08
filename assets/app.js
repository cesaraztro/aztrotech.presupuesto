import {
  createDemoStateV2,
  createEmptyStateV2,
  createRollingMonths,
  normalizeState,
  splitMonthlyGoal,
  uid
} from "./state.js";
import {
  debtTotals,
  healthScore,
  money,
  monthPlanTotal,
  monthSalesTotal,
  nextActions,
  payoffMonth,
  plainMoney,
  rewardsProgress,
  salesPlanRows,
  weekSalesTotal
} from "./finance.js";
import {
  buildCalendarEvents,
  eventsForMonth,
  eventsForWeek,
  toggleEventDone,
  upcomingEvents
} from "./calendar.js";

const SB_CFG = {
  url: "https://myhuapwttifeqlplikhp.supabase.co",
  anonKey: "sb_publishable_dvGTPBsAERiNqSoyCl_aww_SV0iwC31"
};

const SB_READY = SB_CFG.url.startsWith("http") && SB_CFG.anonKey.length > 20;
const sb = SB_READY && window.supabase ? window.supabase.createClient(SB_CFG.url, SB_CFG.anonKey) : null;

let state = createEmptyStateV2();
let session = null;
let activeView = "dashboard";
let saveTimer = null;
let appReady = false;
let authMode = "login";
let onboardingStep = 0;
let demoMode = false;

const views = [
  ["dashboard", "Dashboard"],
  ["debts", "Deudas"],
  ["sales", "Ventas"],
  ["rewards", "Recompensas"],
  ["calendar", "Calendario"],
  ["settings", "Ajustes"]
];

document.addEventListener("DOMContentLoaded", initApp);

async function initApp() {
  bindGlobalActions();
  renderShell();
  if (!sb) {
    state = createEmptyStateV2();
    appReady = true;
    setSaveStatus("local", "Modo local");
    showOnboarding();
    render();
    return;
  }

  const { data } = await sb.auth.getSession();
  if (data.session) await enterApp(data.session);
  else showAuth();
}

function bindGlobalActions() {
  window.App = {
    setView,
    authPrimary,
    toggleAuthMode,
    logout,
    saveProfileFromSettings,
    nextOnboarding,
    prevOnboarding,
    finishOnboarding,
    addDebt,
    updateDebt,
    removeDebt,
    addProduct,
    updateProduct,
    removeProduct,
    updateProductGoal,
    updateWeeklyGoal,
    addSale,
    updateSale,
    removeSale,
    addReward,
    updateReward,
    removeReward,
    setActiveMonth,
    toggleCalendarDone,
    exportExcel,
    loadDemo,
    startFresh
  };
}

function renderShell() {
  const nav = document.getElementById("nav");
  nav.innerHTML = views.map(([id, label]) => `<button data-view="${id}" onclick="App.setView('${id}')">${label}</button>`).join("");
  document.getElementById("mobile-brand").textContent = "AZTROTECH";
}

async function enterApp(activeSession) {
  session = activeSession;
  hideAuth();
  setUserChip(session.user.email || "");
  const loaded = await loadState();
  state = loaded ? normalizeState(loaded) : createEmptyStateV2();
  appReady = true;
  if (!loaded) {
    setSaveStatus("dirty", "Cuenta nueva");
    showOnboarding();
  } else if (!state.onboardingComplete) {
    showOnboarding();
  }
  render();
  if (loaded && state.version !== loaded.version) scheduleSave();
}

async function loadState() {
  if (!sb || !session) return null;
  const { data, error } = await sb.from("presupuestos").select("state").eq("user_id", session.user.id).maybeSingle();
  if (error) {
    console.error("loadState", error);
    setSaveStatus("error", "Error al cargar");
    return null;
  }
  return data?.state || null;
}

async function saveState() {
  if (!appReady || !sb || !session || demoMode) return;
  setSaveStatus("saving", "Guardando");
  state.updatedAt = new Date().toISOString();
  const { error } = await sb.from("presupuestos").upsert({
    user_id: session.user.id,
    state,
    updated_at: new Date().toISOString()
  });
  if (error) {
    console.error("saveState", error);
    setSaveStatus("error", "Error al guardar");
  } else {
    setSaveStatus("saved", "Guardado");
  }
}

function scheduleSave() {
  if (!appReady) return;
  setSaveStatus(demoMode ? "local" : "dirty", demoMode ? "Demo sin guardar" : "Sin guardar");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 650);
}

function render() {
  repairActiveMonth();
  renderNav();
  renderHeader();
  renderMonths();
  renderDashboard();
  renderDebts();
  renderSales();
  renderRewards();
  renderCalendar();
  renderSettings();
}

function renderNav() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === activeView);
  });
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${activeView}`));
}

function renderHeader() {
  const name = state.profile.name || "Tu plan financiero";
  const score = healthScore(state);
  document.getElementById("page-eyebrow").textContent = demoMode ? "Demo AztroTech" : "Producto financiero";
  document.getElementById("page-title").textContent = activeView === "dashboard" ? name : viewTitle(activeView);
  document.getElementById("page-lead").textContent = headerLead(activeView, score);
  document.getElementById("header-actions").innerHTML = `
    <button class="btn" onclick="App.loadDemo()">Ver demo</button>
    <button class="btn" onclick="App.exportExcel()">Export Excel</button>
    <button class="btn primary" onclick="App.setView('calendar')">Pagos proximos</button>
  `;
}

function viewTitle(id) {
  return {
    debts: "Centro de deudas",
    sales: "Plan de ventas",
    rewards: "Recompensas",
    calendar: "Calendario financiero",
    settings: "Ajustes"
  }[id] || "Dashboard";
}

function headerLead(id, score) {
  if (id === "dashboard") return `Salud financiera ${score}/100. Deudas, ventas y calendario conectados en un solo plan.`;
  if (id === "debts") return "Captura compromisos, tasa, pago planeado y dia de pago para proyectar 12 meses.";
  if (id === "sales") return "Configura productos, metas mensuales, metas semanales y ventas reales.";
  if (id === "rewards") return "Convierte el avance comercial en recompensas sanas y medibles.";
  if (id === "calendar") return "Pagos, metas semanales y recompensas en una agenda interna.";
  return "Configura perfil, moneda, meta mensual y preferencias base.";
}

function renderMonths() {
  const months = createRollingMonths();
  const strip = document.getElementById("month-strip");
  strip.innerHTML = months.map((month) => `
    <button class="btn small ${month.key === state.activeMonthKey ? "cyan" : ""}" onclick="App.setActiveMonth('${month.key}')">${month.label}</button>
  `).join("");
}

function renderDashboard() {
  const root = document.getElementById("view-dashboard");
  const totals = debtTotals(state);
  const activePlan = monthPlanTotal(state, state.activeMonthKey);
  const activeReal = monthSalesTotal(state, state.activeMonthKey);
  const score = healthScore(state);
  const actions = nextActions(state);
  const rows = salesPlanRows(state).slice(0, 6);

  root.innerHTML = `
    <div class="grid cols-4">
      ${metric("Salud financiera", `${score}/100`, "Lectura operativa del mes", "accent-cyan")}
      ${metric("Deuda total", money(totals.totalBalance, state.profile.currency), `${money(totals.plannedPayment, state.profile.currency)} planeados/mes`, "accent-red")}
      ${metric("Meta del mes", money(activePlan || state.profile.monthlyIncomeGoal, state.profile.currency), `${money(activeReal, state.profile.currency)} real`, "accent-gold")}
      ${metric("Interes estimado", money(totals.monthlyInterest, state.profile.currency), "Costo mensual aproximado", "accent-green")}
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <section class="card">
        <h2 class="card-title">Acciones inmediatas</h2>
        <div class="list">${actions.map(actionRow).join("")}</div>
      </section>
      <section class="card">
        <h2 class="card-title">Proximos eventos</h2>
        <div class="list">${renderEventList(upcomingEvents(buildCalendarEvents(state)), true)}</div>
      </section>
    </div>
    <section class="card" style="margin-top:16px">
      <h2 class="card-title">Plan vs real</h2>
      ${rows.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Mes</th><th class="right">Plan</th><th class="right">Real</th><th class="right">Flujo libre</th></tr></thead>
            <tbody>${rows.map((row) => `
              <tr>
                <td>${row.label}</td>
                <td class="right">${money(row.plan, state.profile.currency)}</td>
                <td class="right">${money(row.real, state.profile.currency)}</td>
                <td class="right ${row.freeCash >= 0 ? "accent-green" : "accent-red"}">${money(row.freeCash, state.profile.currency)}</td>
              </tr>
            `).join("")}</tbody>
          </table>
        </div>` : empty("Crea tu primer producto", "Tu plan vs real aparecera cuando agregues productos y ventas.")}
    </section>
  `;
}

function metric(label, value, note, accent = "") {
  return `<section class="card metric"><div class="label">${label}</div><div class="value ${accent}">${value}</div><div class="note">${note}</div></section>`;
}

function actionRow(action) {
  return `<div class="row"><div><div class="row-title">${action.title}</div><div class="row-meta">${action.text}</div></div><span class="tag">${action.type}</span></div>`;
}

function renderDebts() {
  const root = document.getElementById("view-debts");
  const totals = debtTotals(state);
  root.innerHTML = `
    <div class="grid cols-3">
      ${metric("Saldo total", money(totals.totalBalance, state.profile.currency), "Todas las deudas activas", "accent-red")}
      ${metric("Pago minimo", money(totals.minPayment, state.profile.currency), "Compromiso mensual base", "accent-gold")}
      ${metric("Pago planeado", money(totals.plannedPayment, state.profile.currency), "Estrategia mensual", "accent-cyan")}
    </div>
    <section class="card" style="margin-top:16px">
      <h2 class="card-title">Mis deudas <button class="btn small primary" onclick="App.addDebt()">Agregar deuda</button></h2>
      ${state.debts.length ? `<div class="list">${state.debts.map(debtCard).join("")}</div>` : empty("Agrega tu primera deuda", "Captura saldo, pago minimo, pago planeado, tasa anual y dia de pago.")}
    </section>
  `;
}

function debtCard(debt) {
  const payoff = payoffMonth(debt);
  return `
    <div class="card soft">
      <div class="form-grid">
        ${input(`debt-name-${debt.id}`, "Nombre", debt.name, `App.updateDebt('${debt.id}','name',this.value)`)}
        ${input(`debt-balance-${debt.id}`, "Saldo actual", debt.balance, `App.updateDebt('${debt.id}','balance',this.value)`, "number")}
        ${input(`debt-min-${debt.id}`, "Pago minimo", debt.minPayment, `App.updateDebt('${debt.id}','minPayment',this.value)`, "number")}
        ${input(`debt-plan-${debt.id}`, "Pago planeado", debt.plannedPayment, `App.updateDebt('${debt.id}','plannedPayment',this.value)`, "number")}
        ${input(`debt-rate-${debt.id}`, "Tasa anual %", debt.annualRate, `App.updateDebt('${debt.id}','annualRate',this.value)`, "number")}
        ${input(`debt-day-${debt.id}`, "Dia de pago", debt.dueDay, `App.updateDebt('${debt.id}','dueDay',this.value)`, "number")}
      </div>
      <div class="row-meta" style="margin:10px 0">${payoff ? `Liquidacion proyectada: ${payoff}` : "No se liquida dentro de 12 meses con el pago actual."}</div>
      <div class="field"><label>Nota</label><textarea onchange="App.updateDebt('${debt.id}','note',this.value)">${escapeHtml(debt.note || "")}</textarea></div>
      <div style="margin-top:12px"><button class="btn danger small" onclick="App.removeDebt('${debt.id}')">Eliminar</button></div>
    </div>
  `;
}

function renderSales() {
  const root = document.getElementById("view-sales");
  const monthPlan = state.salesPlan.months.find((entry) => entry.monthKey === state.activeMonthKey);
  root.innerHTML = `
    <div class="grid cols-3">
      ${metric("Plan del mes", money(monthPlanTotal(state, state.activeMonthKey), state.profile.currency), "Por productos configurados", "accent-gold")}
      ${metric("Real del mes", money(monthSalesTotal(state, state.activeMonthKey), state.profile.currency), "Ventas registradas", "accent-green")}
      ${metric("Meta semanal", money((monthPlan?.weeklyGoals || []).reduce((a,b)=>a + Number(b || 0), 0), state.profile.currency), "Suma de semanas", "accent-cyan")}
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <section class="card">
        <h2 class="card-title">Productos y metas <button class="btn small primary" onclick="App.addProduct()">Agregar producto</button></h2>
        ${state.products.length ? `<div class="list">${state.products.map(productCard).join("")}</div>` : empty("Crea tu primer producto", "Define nombre, precio y metas para activar el plan.")}
      </section>
      <section class="card">
        <h2 class="card-title">Metas semanales</h2>
        <div class="grid">${[0,1,2,3,4].map((index) => input(`week-${index}`, `Semana ${index + 1}`, monthPlan?.weeklyGoals?.[index] || 0, `App.updateWeeklyGoal(${index},this.value)`, "number")).join("")}</div>
      </section>
    </div>
    <section class="card" style="margin-top:16px">
      <h2 class="card-title">Ventas reales <button class="btn small cyan" onclick="App.addSale()">Registrar venta</button></h2>
      ${state.sales.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Producto</th><th class="right">Monto</th><th>Nota</th><th></th></tr></thead><tbody>${state.sales.map(saleRow).join("")}</tbody></table></div>` : empty("Registra una venta", "Cada venta alimenta dashboard, recompensas y plan vs real.")}
    </section>
  `;
}

function productCard(product) {
  const monthPlan = state.salesPlan.months.find((entry) => entry.monthKey === state.activeMonthKey);
  const goal = monthPlan?.productGoals?.[product.id] || 0;
  return `
    <div class="card soft">
      <div class="form-grid">
        ${input(`product-name-${product.id}`, "Producto o servicio", product.name, `App.updateProduct('${product.id}','name',this.value)`)}
        ${input(`product-price-${product.id}`, "Precio", product.price, `App.updateProduct('${product.id}','price',this.value)`, "number")}
        <div class="field"><label>Tipo</label><select onchange="App.updateProduct('${product.id}','type',this.value)">
          ${["fixed","retainer","variable"].map((type) => `<option value="${type}" ${product.type === type ? "selected" : ""}>${type}</option>`).join("")}
        </select></div>
        ${input(`product-goal-${product.id}`, "Unidades meta del mes", goal, `App.updateProductGoal('${product.id}',this.value)`, "number")}
      </div>
      <div style="margin-top:12px"><button class="btn danger small" onclick="App.removeProduct('${product.id}')">Eliminar</button></div>
    </div>
  `;
}

function saleRow(sale) {
  const product = state.products.find((entry) => entry.id === sale.productId);
  return `
    <tr>
      <td><input type="date" value="${sale.date}" onchange="App.updateSale('${sale.id}','date',this.value)"></td>
      <td><select onchange="App.updateSale('${sale.id}','productId',this.value)"><option value="">Sin producto</option>${state.products.map((entry) => `<option value="${entry.id}" ${entry.id === sale.productId ? "selected" : ""}>${entry.name}</option>`).join("")}</select></td>
      <td class="right"><input type="number" value="${sale.amount}" onchange="App.updateSale('${sale.id}','amount',this.value)"></td>
      <td><input value="${escapeHtml(sale.note || "")}" onchange="App.updateSale('${sale.id}','note',this.value)"></td>
      <td class="right"><button class="btn danger small" onclick="App.removeSale('${sale.id}')">Eliminar</button></td>
    </tr>
  `;
}

function renderRewards() {
  const root = document.getElementById("view-rewards");
  const progress = rewardsProgress(state);
  const unlocked = progress.filter((reward) => reward.unlocked).length;
  root.innerHTML = `
    <div class="grid cols-3">
      ${metric("Recompensas", String(state.rewards.length), "Activas en tu sistema", "accent-gold")}
      ${metric("Desbloqueadas", String(unlocked), "Por ventas acumuladas", "accent-green")}
      ${metric("Ventas acumuladas", money(state.sales.reduce((s,v)=>s + Number(v.amount || 0), 0), state.profile.currency), "Base de triggers", "accent-cyan")}
    </div>
    <section class="card" style="margin-top:16px">
      <h2 class="card-title">Mis recompensas <button class="btn small primary" onclick="App.addReward()">Agregar recompensa</button></h2>
      ${state.rewards.length ? `<div class="list">${progress.map(rewardCard).join("")}</div>` : empty("Define una recompensa", "Crea un trigger saludable para celebrar avances sin financiarlo con deuda.")}
    </section>
  `;
}

function rewardCard(reward) {
  return `
    <div class="card soft">
      <div class="form-grid">
        ${input(`reward-name-${reward.id}`, "Recompensa", reward.name, `App.updateReward('${reward.id}','name',this.value)`)}
        ${input(`reward-cost-${reward.id}`, "Costo", reward.cost, `App.updateReward('${reward.id}','cost',this.value)`, "number")}
        ${input(`reward-trigger-${reward.id}`, "Trigger de ventas", reward.triggerAmount, `App.updateReward('${reward.id}','triggerAmount',this.value)`, "number")}
        <div class="field"><label>Frecuencia</label><select onchange="App.updateReward('${reward.id}','frequency',this.value)">
          ${["weekly","monthly","once","trip"].map((type) => `<option value="${type}" ${reward.frequency === type ? "selected" : ""}>${type}</option>`).join("")}
        </select></div>
      </div>
      <div class="progress"><span style="width:${reward.progress}%"></span></div>
      <div class="row-meta">${reward.unlocked ? "Desbloqueada" : `Faltan ${money(reward.missing, state.profile.currency)}`}</div>
      <div style="margin-top:12px"><button class="btn danger small" onclick="App.removeReward('${reward.id}')">Eliminar</button></div>
    </div>
  `;
}

function renderCalendar() {
  const root = document.getElementById("view-calendar");
  const events = buildCalendarEvents(state);
  const week = eventsForWeek(events);
  const month = eventsForMonth(events, state.activeMonthKey);
  const upcoming = upcomingEvents(events);
  root.innerHTML = `
    <div class="calendar-layout">
      <section class="card">
        <h2 class="card-title">Esta semana</h2>
        <div class="list">${renderEventList(week)}</div>
      </section>
      <section class="card">
        <h2 class="card-title">Proximos pagos</h2>
        <div class="list">${renderEventList(upcoming)}</div>
      </section>
    </div>
    <section class="card" style="margin-top:16px">
      <h2 class="card-title">Mes activo</h2>
      <div class="list">${renderEventList(month)}</div>
    </section>
  `;
}

function renderEventList(events, compact = false) {
  if (!events.length) return empty("Sin eventos todavia", "Agrega deudas, metas semanales o recompensas para poblar el calendario.");
  return events.map((event) => `
    <div class="row event ${event.type}">
      <div>
        <div class="row-title">${event.title}</div>
        <div class="row-meta">${event.date}${event.amount ? ` · ${money(event.amount, state.profile.currency)}` : ""}</div>
      </div>
      <button class="btn small ${event.done ? "cyan" : ""}" onclick="App.toggleCalendarDone('${event.id}')">${event.done ? "Hecho" : compact ? "Abrir" : "Marcar"}</button>
    </div>
  `).join("");
}

function renderSettings() {
  const root = document.getElementById("view-settings");
  root.innerHTML = `
    <section class="card">
      <h2 class="card-title">Perfil financiero</h2>
      <div class="form-grid">
        ${input("profile-name", "Nombre del plan", state.profile.name, "state.value", "text")}
        ${input("profile-goal", "Meta mensual", state.profile.monthlyIncomeGoal, "state.value", "number")}
        ${input("profile-fixed", "Gasto fijo mensual", state.profile.fixedMonthlyExpense, "state.value", "number")}
        <div class="field"><label>Moneda</label><select id="profile-currency"><option value="MXN" ${state.profile.currency === "MXN" ? "selected" : ""}>MXN</option><option value="USD" ${state.profile.currency === "USD" ? "selected" : ""}>USD</option></select></div>
      </div>
      <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn primary" onclick="App.saveProfileFromSettings()">Guardar ajustes</button>
        <button class="btn" onclick="App.startFresh()">Reiniciar a cuenta vacia</button>
      </div>
    </section>
  `;
}

function renderOnboarding() {
  const root = document.getElementById("onboarding-overlay");
  root.innerHTML = `
    <div class="onboarding-card">
      <div class="eyebrow">AztroTech Presupuesto</div>
      <div class="onboarding-title">Construye tu primer tablero</div>
      <p class="lead">Tu cuenta empieza limpia. En cuatro pasos creamos la estructura base para que el dashboard tenga sentido desde el primer dia.</p>
      <div class="steps">${[0,1,2,3].map((step) => `<span class="step-dot ${step === onboardingStep ? "active" : ""}"></span>`).join("")}</div>
      ${onboardingStepHtml()}
      <div style="display:flex;justify-content:space-between;gap:10px;margin-top:18px">
        <button class="btn" onclick="App.prevOnboarding()" ${onboardingStep === 0 ? "disabled" : ""}>Atras</button>
        ${onboardingStep < 3 ? `<button class="btn primary" onclick="App.nextOnboarding()">Continuar</button>` : `<button class="btn primary" onclick="App.finishOnboarding()">Entrar al dashboard</button>`}
      </div>
    </div>
  `;
}

function onboardingStepHtml() {
  if (onboardingStep === 0) return `
    <div class="onboarding-step active"><div class="form-grid">
      ${input("ob-name", "Nombre del plan", state.profile.name, "", "text", "Mi plan financiero")}
      ${input("ob-goal", "Meta mensual de ingresos", state.profile.monthlyIncomeGoal, "", "number")}
      ${input("ob-fixed", "Gasto fijo mensual", state.profile.fixedMonthlyExpense, "", "number")}
      <div class="field"><label>Moneda</label><select id="ob-currency"><option value="MXN">MXN</option><option value="USD">USD</option></select></div>
    </div></div>`;
  if (onboardingStep === 1) return `
    <div class="onboarding-step active">
      <p class="subtle">Agrega tu deuda principal. Podras agregar mas despues.</p>
      <div class="form-grid">
        ${input("ob-debt-name", "Nombre deuda", "", "", "text", "Tarjeta / credito / prestamo")}
        ${input("ob-debt-balance", "Saldo", 0, "", "number")}
        ${input("ob-debt-min", "Pago minimo", 0, "", "number")}
        ${input("ob-debt-plan", "Pago planeado", 0, "", "number")}
        ${input("ob-debt-rate", "Tasa anual %", 0, "", "number")}
        ${input("ob-debt-day", "Dia de pago", 15, "", "number")}
      </div>
    </div>`;
  if (onboardingStep === 2) return `
    <div class="onboarding-step active">
      <p class="subtle">Crea tu primer producto o fuente de ingreso.</p>
      <div class="form-grid">
        ${input("ob-product-name", "Producto o servicio", "", "", "text", "Consultoria / servicio / producto")}
        ${input("ob-product-price", "Precio", 0, "", "number")}
        ${input("ob-product-month", "Unidades meta mensual", 0, "", "number")}
        ${input("ob-product-week", "Meta semanal en dinero", 0, "", "number")}
      </div>
    </div>`;
  return `
    <div class="onboarding-step active">
      <p class="subtle">Define una recompensa. Es opcional, pero ayuda a que el plan sea sostenible.</p>
      <div class="form-grid">
        ${input("ob-reward-name", "Recompensa", "", "", "text", "Cena / equipo / descanso")}
        ${input("ob-reward-cost", "Costo", 0, "", "number")}
        ${input("ob-reward-trigger", "Trigger de ventas", 0, "", "number")}
        <div class="field"><label>Frecuencia</label><select id="ob-reward-frequency"><option value="monthly">Mensual</option><option value="weekly">Semanal</option><option value="once">Unica</option><option value="trip">Viaje</option></select></div>
      </div>
    </div>`;
}

function nextOnboarding() {
  persistOnboardingStep();
  onboardingStep = Math.min(3, onboardingStep + 1);
  renderOnboarding();
}

function prevOnboarding() {
  persistOnboardingStep();
  onboardingStep = Math.max(0, onboardingStep - 1);
  renderOnboarding();
}

function finishOnboarding() {
  persistOnboardingStep();
  state.onboardingComplete = true;
  hideOnboarding();
  scheduleSave();
  render();
}

function persistOnboardingStep() {
  if (onboardingStep === 0) {
    state.profile.name = valueOf("ob-name") || state.profile.name;
    state.profile.monthlyIncomeGoal = numberOf("ob-goal");
    state.profile.fixedMonthlyExpense = numberOf("ob-fixed");
    state.profile.currency = valueOf("ob-currency") || "MXN";
  }
  if (onboardingStep === 1 && valueOf("ob-debt-name")) {
    if (!state.debts.length) addDebt(false);
    const debt = state.debts[0];
    Object.assign(debt, {
      name: valueOf("ob-debt-name"),
      balance: numberOf("ob-debt-balance"),
      minPayment: numberOf("ob-debt-min"),
      plannedPayment: numberOf("ob-debt-plan"),
      annualRate: numberOf("ob-debt-rate"),
      dueDay: numberOf("ob-debt-day") || 15
    });
  }
  if (onboardingStep === 2 && valueOf("ob-product-name")) {
    if (!state.products.length) addProduct(false);
    const product = state.products[0];
    product.name = valueOf("ob-product-name");
    product.price = numberOf("ob-product-price");
    updateProductGoal(product.id, numberOf("ob-product-month"), false);
    const weekly = numberOf("ob-product-week");
    const monthPlan = getActivePlan();
    monthPlan.weeklyGoals = weekly ? [weekly, weekly, weekly, weekly, weekly] : splitMonthlyGoal(state.profile.monthlyIncomeGoal);
  }
  if (onboardingStep === 3 && valueOf("ob-reward-name")) {
    if (!state.rewards.length) addReward(false);
    Object.assign(state.rewards[0], {
      name: valueOf("ob-reward-name"),
      cost: numberOf("ob-reward-cost"),
      triggerAmount: numberOf("ob-reward-trigger"),
      frequency: valueOf("ob-reward-frequency") || "monthly"
    });
  }
}

function addDebt(shouldRender = true) {
  state.debts.push({ id: uid("debt"), name: "Nueva deuda", balance: 0, minPayment: 0, plannedPayment: 0, annualRate: 0, dueDay: 15, note: "" });
  if (shouldRender) changed();
}

function updateDebt(id, field, value) {
  const debt = state.debts.find((entry) => entry.id === id);
  if (!debt) return;
  debt[field] = numericDebtFields().includes(field) ? Number(value) || 0 : value;
  changed();
}

function removeDebt(id) {
  state.debts = state.debts.filter((entry) => entry.id !== id);
  changed();
}

function addProduct(shouldRender = true) {
  const product = { id: uid("product"), name: "Nuevo producto", price: 0, type: "fixed", active: true };
  state.products.push(product);
  state.salesPlan.months.forEach((month) => { month.productGoals[product.id] = 0; });
  if (shouldRender) changed();
}

function updateProduct(id, field, value) {
  const product = state.products.find((entry) => entry.id === id);
  if (!product) return;
  product[field] = field === "price" ? Number(value) || 0 : value;
  changed();
}

function removeProduct(id) {
  state.products = state.products.filter((entry) => entry.id !== id);
  state.salesPlan.months.forEach((month) => { delete month.productGoals[id]; });
  state.sales.forEach((sale) => { if (sale.productId === id) sale.productId = ""; });
  changed();
}

function updateProductGoal(productId, value, shouldRender = true) {
  getActivePlan().productGoals[productId] = Number(value) || 0;
  if (shouldRender) changed();
}

function updateWeeklyGoal(index, value) {
  getActivePlan().weeklyGoals[index] = Number(value) || 0;
  changed();
}

function addSale() {
  state.sales.unshift({ id: uid("sale"), date: `${state.activeMonthKey}-01`, productId: state.products[0]?.id || "", amount: state.products[0]?.price || 0, note: "" });
  changed();
}

function updateSale(id, field, value) {
  const sale = state.sales.find((entry) => entry.id === id);
  if (!sale) return;
  sale[field] = field === "amount" ? Number(value) || 0 : value;
  changed();
}

function removeSale(id) {
  state.sales = state.sales.filter((entry) => entry.id !== id);
  changed();
}

function addReward(shouldRender = true) {
  state.rewards.push({ id: uid("reward"), name: "Nueva recompensa", cost: 0, triggerAmount: 0, frequency: "monthly", status: "active" });
  if (shouldRender) changed();
}

function updateReward(id, field, value) {
  const reward = state.rewards.find((entry) => entry.id === id);
  if (!reward) return;
  reward[field] = ["cost", "triggerAmount"].includes(field) ? Number(value) || 0 : value;
  changed();
}

function removeReward(id) {
  state.rewards = state.rewards.filter((entry) => entry.id !== id);
  changed();
}

function setActiveMonth(monthKey) {
  state.activeMonthKey = monthKey;
  changed(false);
  render();
}

function toggleCalendarDone(eventId) {
  toggleEventDone(state, eventId);
  changed();
}

function saveProfileFromSettings() {
  state.profile.name = valueOf("profile-name");
  state.profile.monthlyIncomeGoal = numberOf("profile-goal");
  state.profile.fixedMonthlyExpense = numberOf("profile-fixed");
  state.profile.currency = valueOf("profile-currency") || "MXN";
  changed();
}

function loadDemo() {
  demoMode = true;
  state = createDemoStateV2();
  hideOnboarding();
  render();
  setSaveStatus("local", "Demo sin guardar");
}

function startFresh() {
  demoMode = false;
  state = createEmptyStateV2();
  showOnboarding();
  changed();
}

function exportExcel() {
  if (!window.XLSX) return alert("No se pudo cargar el exportador de Excel.");
  const wb = XLSX.utils.book_new();
  const months = createRollingMonths();
  const summary = [
    ["AztroTech Presupuesto"],
    ["Exportado", new Date().toLocaleString("es-MX")],
    ["Plan", state.profile.name || "Sin nombre"],
    ["Moneda", state.profile.currency],
    ["Meta mensual", state.profile.monthlyIncomeGoal],
    ["Gasto fijo mensual", state.profile.fixedMonthlyExpense]
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Resumen");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Nombre", "Saldo", "Pago minimo", "Pago planeado", "Tasa anual", "Dia pago", "Nota"],
    ...state.debts.map((debt) => [debt.name, debt.balance, debt.minPayment, debt.plannedPayment, debt.annualRate, debt.dueDay, debt.note])
  ]), "Deudas");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Mes", "Plan", "Real", "Fijo", "Pago deuda", "Flujo libre"],
    ...salesPlanRows(state, months).map((row) => [row.label, row.plan, row.real, row.fixed, row.debt, row.freeCash])
  ]), "Plan mensual");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Fecha", "Producto", "Monto", "Nota"],
    ...state.sales.map((sale) => [sale.date, state.products.find((p) => p.id === sale.productId)?.name || "", sale.amount, sale.note])
  ]), "Ventas");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Fecha", "Tipo", "Titulo", "Monto", "Hecho"],
    ...buildCalendarEvents(state, months).map((event) => [event.date, event.type, event.title, event.amount, event.done ? "Si" : "No"])
  ]), "Calendario");

  XLSX.writeFile(wb, "AztroTech_Presupuesto.xlsx");
}

async function authPrimary() {
  const email = valueOf("auth-email").trim();
  const password = valueOf("auth-pass");
  if (!email || !password) return authMsg("Escribe correo y contrasena.");
  const button = document.getElementById("auth-primary");
  button.disabled = true;
  button.textContent = authMode === "login" ? "Entrando..." : "Creando...";
  try {
    if (authMode === "login") {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return authMsg(translateAuthError(error.message));
      await enterApp(data.session);
    } else {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) return authMsg(translateAuthError(error.message));
      if (data.session) await enterApp(data.session);
      else authMsg("Cuenta creada. Confirma tu correo y vuelve a entrar.", "ok");
    }
  } finally {
    button.disabled = false;
    button.textContent = authMode === "login" ? "Entrar" : "Crear cuenta";
  }
}

function toggleAuthMode() {
  authMode = authMode === "login" ? "signup" : "login";
  renderAuthCard();
}

async function logout() {
  if (sb) await sb.auth.signOut();
  location.reload();
}

function setView(view) {
  activeView = view;
  renderNav();
  renderHeader();
}

function changed(doSave = true) {
  demoMode = false;
  render();
  if (doSave) scheduleSave();
}

function getActivePlan() {
  repairActiveMonth();
  return state.salesPlan.months.find((entry) => entry.monthKey === state.activeMonthKey);
}

function repairActiveMonth() {
  const months = createRollingMonths();
  const existingKeys = state.salesPlan.months.map((entry) => entry.monthKey);
  months.forEach((month) => {
    if (!existingKeys.includes(month.key)) state.salesPlan.months.push({ monthKey: month.key, productGoals: {}, weeklyGoals: [0, 0, 0, 0, 0] });
  });
  state.salesPlan.months = months.map((month) => {
    const found = state.salesPlan.months.find((entry) => entry.monthKey === month.key);
    return { monthKey: month.key, productGoals: found?.productGoals || {}, weeklyGoals: found?.weeklyGoals || [0, 0, 0, 0, 0] };
  });
  if (!state.activeMonthKey || !state.salesPlan.months.some((entry) => entry.monthKey === state.activeMonthKey)) {
    state.activeMonthKey = state.salesPlan.months[0].monthKey;
  }
}

function showAuth() {
  document.getElementById("auth-overlay").classList.add("show");
  renderAuthCard();
}

function hideAuth() {
  document.getElementById("auth-overlay").classList.remove("show");
}

function renderAuthCard() {
  document.getElementById("auth-overlay").innerHTML = `
    <div class="auth-card">
      <div class="eyebrow">AztroTech</div>
      <div class="auth-title">${authMode === "login" ? "Entra a tu command center" : "Crea tu cuenta"}</div>
      <p class="lead">${authMode === "login" ? "Tus datos financieros se guardan por usuario con Supabase." : "Empiezas con una cuenta en cero y onboarding guiado."}</p>
      <form onsubmit="event.preventDefault();App.authPrimary()">
        <div class="field" style="margin-top:18px"><label>Correo</label><input id="auth-email" type="email" autocomplete="email"></div>
        <div class="field" style="margin-top:12px"><label>Contrasena</label><input id="auth-pass" type="password" autocomplete="current-password"></div>
        <button class="btn primary" id="auth-primary" type="submit" style="width:100%;margin-top:16px">${authMode === "login" ? "Entrar" : "Crear cuenta"}</button>
      </form>
      <div id="auth-msg" class="auth-msg"></div>
      <div class="auth-toggle">${authMode === "login" ? "No tienes cuenta?" : "Ya tienes cuenta?"} <a onclick="App.toggleAuthMode()">${authMode === "login" ? "Crear una" : "Iniciar sesion"}</a></div>
    </div>
  `;
}

function showOnboarding() {
  onboardingStep = 0;
  document.getElementById("onboarding-overlay").classList.add("show");
  renderOnboarding();
}

function hideOnboarding() {
  document.getElementById("onboarding-overlay").classList.remove("show");
}

function setUserChip(email) {
  document.getElementById("user-chip").innerHTML = `<span>${email}</span><button onclick="App.logout()">Salir</button>`;
}

function setSaveStatus(kind, text) {
  const chip = document.getElementById("save-chip");
  chip.className = `save-chip ${kind}`;
  chip.textContent = text;
}

function authMsg(message, kind = "err") {
  const el = document.getElementById("auth-msg");
  if (!el) return;
  el.textContent = message;
  el.style.color = kind === "ok" ? "var(--green)" : "var(--red)";
}

function translateAuthError(message = "") {
  const msg = message.toLowerCase();
  if (msg.includes("invalid login")) return "Correo o contrasena incorrectos.";
  if (msg.includes("already")) return "Ese correo ya tiene cuenta.";
  if (msg.includes("email not confirmed")) return "Confirma tu correo antes de entrar.";
  return "No se pudo completar. Intenta de nuevo.";
}

function input(id, label, value, handler, type = "text", placeholder = "") {
  const attr = handler && handler !== "state.value" ? `onchange="${handler}"` : "";
  return `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${escapeHtml(value ?? "")}" placeholder="${placeholder}" ${attr}></div>`;
}

function empty(title, text) {
  return `<div class="empty"><strong>${title}</strong>${text}</div>`;
}

function valueOf(id) {
  return document.getElementById(id)?.value || "";
}

function numberOf(id) {
  return Number(valueOf(id)) || 0;
}

function numericDebtFields() {
  return ["balance", "minPayment", "plannedPayment", "annualRate", "dueDay"];
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
