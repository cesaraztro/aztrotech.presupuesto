import { createRollingMonths } from "./state.js";

export function money(value, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

export function plainMoney(value) {
  return Math.round(Number(value) || 0).toLocaleString("es-MX");
}

export function getMonthPlan(state, monthKey = state.activeMonthKey) {
  return state.salesPlan.months.find((month) => month.monthKey === monthKey) || state.salesPlan.months[0];
}

export function monthSalesTotal(state, monthKey) {
  return state.sales
    .filter((sale) => sale.date?.startsWith(monthKey))
    .reduce((sum, sale) => sum + (Number(sale.amount) || 0), 0);
}

export function monthPlanTotal(state, monthKey) {
  const monthPlan = getMonthPlan(state, monthKey);
  return state.products.reduce((sum, product) => {
    const units = Number(monthPlan?.productGoals?.[product.id]) || 0;
    return sum + units * (Number(product.price) || 0);
  }, 0);
}

export function weekSalesTotal(state, monthKey, weekIndex) {
  return state.sales
    .filter((sale) => sale.date?.startsWith(monthKey))
    .filter((sale) => weekOfMonth(sale.date) === weekIndex)
    .reduce((sum, sale) => sum + (Number(sale.amount) || 0), 0);
}

export function weekOfMonth(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`);
  return Math.min(4, Math.floor((date.getDate() - 1) / 7));
}

export function debtTotals(state) {
  const totalBalance = state.debts.reduce((sum, debt) => sum + (Number(debt.balance) || 0), 0);
  const minPayment = state.debts.reduce((sum, debt) => sum + (Number(debt.minPayment) || 0), 0);
  const plannedPayment = state.debts.reduce((sum, debt) => sum + (Number(debt.plannedPayment) || 0), 0);
  const monthlyInterest = state.debts.reduce((sum, debt) => {
    return sum + (Number(debt.balance) || 0) * ((Number(debt.annualRate) || 0) / 12 / 100);
  }, 0);
  return { totalBalance, minPayment, plannedPayment, monthlyInterest };
}

export function projectDebt(debt, months = createRollingMonths()) {
  const monthlyRate = (Number(debt.annualRate) || 0) / 12 / 100;
  let balance = Number(debt.balance) || 0;
  return months.map((month) => {
    const interest = balance * monthlyRate;
    const payment = Math.max(Number(debt.plannedPayment) || 0, Number(debt.minPayment) || 0);
    balance = Math.max(0, balance + interest - payment);
    return {
      monthKey: month.key,
      balance: Math.round(balance),
      interest: Math.round(interest),
      payment: Math.round(Math.min(payment, balance + payment))
    };
  });
}

export function payoffMonth(debt, months = createRollingMonths()) {
  const projection = projectDebt(debt, months);
  const match = projection.find((point) => point.balance <= 0);
  return match?.monthKey || null;
}

export function rewardsProgress(state) {
  const totalSales = state.sales.reduce((sum, sale) => sum + (Number(sale.amount) || 0), 0);
  return state.rewards.map((reward) => {
    const trigger = Number(reward.triggerAmount) || 0;
    const progress = trigger ? Math.min(100, Math.round((totalSales / trigger) * 100)) : 0;
    return {
      ...reward,
      progress,
      unlocked: trigger > 0 && totalSales >= trigger,
      missing: Math.max(0, trigger - totalSales)
    };
  });
}

export function salesPlanRows(state, months = createRollingMonths()) {
  return months.map((month) => {
    const plan = monthPlanTotal(state, month.key);
    const real = monthSalesTotal(state, month.key);
    const debt = debtTotals(state).plannedPayment;
    const fixed = Number(state.profile.fixedMonthlyExpense) || 0;
    const freeCash = real - fixed - debt;
    return {
      ...month,
      plan,
      real,
      variance: real - plan,
      debt,
      fixed,
      freeCash
    };
  });
}

export function healthScore(state) {
  const debts = debtTotals(state);
  const activeMonth = state.activeMonthKey || createRollingMonths()[0].key;
  const real = monthSalesTotal(state, activeMonth);
  const plan = monthPlanTotal(state, activeMonth) || Number(state.profile.monthlyIncomeGoal) || 0;
  const fixed = Number(state.profile.fixedMonthlyExpense) || 0;
  let score = 72;
  if (debts.totalBalance === 0) score += 10;
  if (real >= plan && plan > 0) score += 10;
  if (real < fixed + debts.minPayment) score -= 25;
  if (debts.monthlyInterest > 0 && real === 0) score -= 12;
  if (state.products.length === 0) score -= 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function nextActions(state) {
  const actions = [];
  if (!state.debts.length) actions.push({ type: "debt", title: "Agrega tu primera deuda", text: "Captura saldo, pago minimo, pago planeado y dia de pago." });
  if (!state.products.length) actions.push({ type: "sales", title: "Crea tu primer producto", text: "Define nombre, precio y meta para activar el plan de ventas." });
  if (!state.sales.length) actions.push({ type: "sales", title: "Registra una venta", text: "Al registrar ingresos se actualizan recompensas, calendario y flujo." });
  if (!state.rewards.length) actions.push({ type: "reward", title: "Define una recompensa", text: "Asocia una meta de ingreso a una recompensa saludable." });
  if (actions.length) return actions;

  const costly = [...state.debts].sort((a, b) => (Number(b.annualRate) || 0) - (Number(a.annualRate) || 0))[0];
  if (costly) actions.push({ type: "debt", title: `Prioridad: ${costly.name}`, text: `Tasa anual ${costly.annualRate || 0}%. Usa excedente para bajar costo financiero.` });
  actions.push({ type: "calendar", title: "Revisa pagos de la semana", text: "Marca eventos completados para mantener tu plan vivo." });
  actions.push({ type: "sales", title: "Actualiza plan semanal", text: "Ajusta metas por semana antes de iniciar el mes." });
  return actions;
}
