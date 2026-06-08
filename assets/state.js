const MONTH_FORMATTER = new Intl.DateTimeFormat("es-MX", { month: "short", year: "numeric" });

export const DEFAULT_PROFILE = {
  name: "",
  currency: "MXN",
  monthlyIncomeGoal: 0,
  fixedMonthlyExpense: 0
};

export function uid(prefix = "id") {
  if (crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(date, offset) {
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + offset);
  return next;
}

export function createRollingMonths(count = 12, start = new Date()) {
  return Array.from({ length: count }, (_, index) => {
    const date = addMonths(start, index);
    const key = monthKey(date);
    return {
      key,
      label: MONTH_FORMATTER.format(date).replace(".", ""),
      year: date.getFullYear(),
      month: date.getMonth()
    };
  });
}

export function defaultSalesPlan(months = createRollingMonths()) {
  return {
    months: months.map((month) => ({
      monthKey: month.key,
      productGoals: {},
      weeklyGoals: [0, 0, 0, 0, 0]
    }))
  };
}

export function createEmptyStateV2() {
  const months = createRollingMonths();
  return {
    version: 2,
    profile: { ...DEFAULT_PROFILE },
    onboardingComplete: false,
    activeMonthKey: months[0].key,
    debts: [],
    products: [],
    salesPlan: defaultSalesPlan(months),
    sales: [],
    rewards: [],
    calendarOverrides: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function createDemoStateV2() {
  const state = createEmptyStateV2();
  const months = createRollingMonths();
  state.profile = {
    name: "Demo AztroTech",
    currency: "MXN",
    monthlyIncomeGoal: 80000,
    fixedMonthlyExpense: 20000
  };
  state.onboardingComplete = true;
  state.debts = [
    { id: uid("debt"), name: "Tarjeta alta tasa", balance: 27914, minPayment: 3000, plannedPayment: 5000, annualRate: 90, dueDay: 12, note: "Atacar primero por costo financiero." },
    { id: uid("debt"), name: "Crédito auto", balance: 206755, minPayment: 8872, plannedPayment: 10000, annualRate: 18, dueDay: 15, note: "Mantener al corriente y abonar capital." }
  ];
  state.products = [
    { id: uid("product"), name: "Mentoría Express", price: 1800, type: "fixed", active: true },
    { id: uid("product"), name: "Paquete Estrategia", price: 20000, type: "fixed", active: true },
    { id: uid("product"), name: "Socio Estratégico", price: 15000, type: "retainer", active: true }
  ];
  state.products.forEach((product, productIndex) => {
    state.salesPlan.months.forEach((monthPlan, monthIndex) => {
      monthPlan.productGoals[product.id] = productIndex === 0 ? 2 + Math.floor(monthIndex / 3) : productIndex === 1 ? 1 : monthIndex > 1 ? 1 : 0;
      monthPlan.weeklyGoals = [12000, 15000, 18000, 20000, 15000];
    });
  });
  state.sales = [
    { id: uid("sale"), date: `${months[0].key}-05`, productId: state.products[0].id, amount: 1800, note: "Venta demo" }
  ];
  state.rewards = [
    { id: uid("reward"), name: "Retiro de bienestar", cost: 2500, triggerAmount: 30000, frequency: "monthly", status: "active" },
    { id: uid("reward"), name: "Equipo premium", cost: 12000, triggerAmount: 90000, frequency: "once", status: "active" }
  ];
  return state;
}

export function normalizeState(rawState) {
  if (!rawState) return createEmptyStateV2();
  if (rawState.version === 2) return repairStateV2(rawState);
  return migrateV1ToV2(rawState);
}

export function repairStateV2(state) {
  const months = createRollingMonths();
  const repaired = {
    ...createEmptyStateV2(),
    ...state,
    profile: { ...DEFAULT_PROFILE, ...(state.profile || {}) },
    debts: Array.isArray(state.debts) ? state.debts : [],
    products: Array.isArray(state.products) ? state.products : [],
    sales: Array.isArray(state.sales) ? state.sales : [],
    rewards: Array.isArray(state.rewards) ? state.rewards : [],
    calendarOverrides: Array.isArray(state.calendarOverrides) ? state.calendarOverrides : []
  };
  const existingMonths = Array.isArray(state.salesPlan?.months) ? state.salesPlan.months : [];
  repaired.salesPlan = {
    months: months.map((month, index) => ({
      monthKey: month.key,
      productGoals: existingMonths.find((m) => m.monthKey === month.key)?.productGoals || existingMonths[index]?.productGoals || {},
      weeklyGoals: existingMonths.find((m) => m.monthKey === month.key)?.weeklyGoals || existingMonths[index]?.weeklyGoals || [0, 0, 0, 0, 0]
    }))
  };
  if (!repaired.activeMonthKey || !repaired.salesPlan.months.some((m) => m.monthKey === repaired.activeMonthKey)) {
    repaired.activeMonthKey = repaired.salesPlan.months[0].monthKey;
  }
  return repaired;
}

export function migrateV1ToV2(v1) {
  const state = createEmptyStateV2();
  state.onboardingComplete = true;
  state.profile = {
    name: "Cesar",
    currency: "MXN",
    monthlyIncomeGoal: 80000,
    fixedMonthlyExpense: 20000
  };
  const debtSource = Array.isArray(v1.debts) ? v1.debts : [];
  state.debts = debtSource.map((debt) => ({
    id: uid("debt"),
    name: cleanLabel(debt.name || "Deuda"),
    balance: numberOrZero(debt.saldo),
    minPayment: numberOrZero(debt.pago_min),
    plannedPayment: numberOrZero(debt.pago),
    annualRate: numberOrZero(debt.tasa_anual),
    dueDay: 15,
    note: debt.note || ""
  }));

  const legacyProducts = [
    ["mentoria", "Mentoria Express", 1800, "fixed"],
    ["estrategia", "Paquete Estrategia", 20000, "fixed"],
    ["parcial", "Paquete Estrategia parcial", 10000, "fixed"],
    ["socios", "Socios Estrategicos", 15000, "retainer"],
    ["software", "Software a la medida", 0, "variable"],
    ["custom", "Precio personalizado", 0, "variable"]
  ];
  const productMap = new Map();
  state.products = legacyProducts.map(([legacyId, name, price, type]) => {
    const product = { id: uid("product"), name, price, type, active: true };
    productMap.set(legacyId, product.id);
    return product;
  });

  const months = createRollingMonths();
  const legacyMonths = ["Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const legacyPlan = Array.isArray(v1.planData) ? v1.planData : [];
  state.salesPlan.months.forEach((monthPlan, monthIndex) => {
    legacyPlan.forEach((row) => {
      const productId = productMap.get(row.pkgId);
      if (productId) monthPlan.productGoals[productId] = numberOrZero(row.plan?.[monthIndex]);
    });
    monthPlan.weeklyGoals = splitMonthlyGoal(state.profile.monthlyIncomeGoal);
  });

  const sales = [];
  Object.entries(v1.ventas || {}).forEach(([legacyMonth, entries]) => {
    const monthIndex = legacyMonths.indexOf(legacyMonth);
    const month = months[Math.max(0, monthIndex)] || months[0];
    Object.values(entries || {}).forEach((sale) => {
      sales.push({
        id: uid("sale"),
        date: `${month.key}-10`,
        productId: productMap.get(sale.pkgId) || state.products[0]?.id || "",
        amount: numberOrZero(sale.monto),
        note: sale.nota || ""
      });
    });
  });
  Object.entries(v1.alianzas || {}).forEach(([legacyMonth, entries]) => {
    const monthIndex = legacyMonths.indexOf(legacyMonth);
    const month = months[Math.max(0, monthIndex)] || months[0];
    Object.values(entries || {}).forEach((sale) => {
      sales.push({
        id: uid("sale"),
        date: `${month.key}-12`,
        productId: "",
        amount: numberOrZero(sale.monto),
        note: sale.desc || "Alianza estrategica"
      });
    });
  });
  state.sales = sales;

  const rewards = Array.isArray(v1.recompensas) ? v1.recompensas : Object.values(v1.recompensas || {});
  state.rewards = rewards.map((reward) => ({
    id: uid("reward"),
    name: cleanLabel(reward.nombre || "Recompensa"),
    cost: numberOrZero(reward.costo),
    triggerAmount: numberOrZero(reward.trigger),
    frequency: normalizeFrequency(reward.tipo),
    status: "active"
  }));
  return state;
}

export function splitMonthlyGoal(total) {
  const value = numberOrZero(total);
  if (!value) return [0, 0, 0, 0, 0];
  const base = Math.floor(value / 5);
  const weeks = [base, base, base, base, value - base * 4];
  return weeks;
}

function numberOrZero(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function cleanLabel(value) {
  return String(value || "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

function normalizeFrequency(value) {
  if (value === "semana") return "weekly";
  if (value === "viaje") return "trip";
  if (value === "unico" || value === "único") return "once";
  return "monthly";
}
