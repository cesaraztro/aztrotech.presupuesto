import { createRollingMonths, uid } from "./state.js";
import { monthPlanTotal, rewardsProgress } from "./finance.js";

export function buildCalendarEvents(state, months = createRollingMonths()) {
  const events = [];
  state.debts.forEach((debt) => {
    const day = clampDay(debt.dueDay || 15);
    months.forEach((month) => {
      events.push({
        id: `debt_${debt.id}_${month.key}`,
        date: `${month.key}-${String(day).padStart(2, "0")}`,
        title: `Pago: ${debt.name}`,
        amount: Number(debt.plannedPayment) || Number(debt.minPayment) || 0,
        type: "debt",
        linkedId: debt.id,
        done: isOverrideDone(state, `debt_${debt.id}_${month.key}`)
      });
    });
  });

  state.salesPlan.months.forEach((monthPlan) => {
    (monthPlan.weeklyGoals || []).forEach((goal, index) => {
      if (!goal) return;
      const date = weekTargetDate(monthPlan.monthKey, index);
      events.push({
        id: `week_${monthPlan.monthKey}_${index}`,
        date,
        title: `Meta ventas semana ${index + 1}`,
        amount: Number(goal) || 0,
        type: "sales",
        linkedId: monthPlan.monthKey,
        done: isOverrideDone(state, `week_${monthPlan.monthKey}_${index}`)
      });
    });
  });

  const progress = rewardsProgress(state);
  progress.forEach((reward) => {
    if (!reward.triggerAmount) return;
    const month = months.find((entry) => monthPlanTotal(state, entry.key) >= reward.triggerAmount) || months[0];
    events.push({
      id: `reward_${reward.id}_${month.key}`,
      date: `${month.key}-25`,
      title: `Recompensa: ${reward.name}`,
      amount: Number(reward.cost) || 0,
      type: "reward",
      linkedId: reward.id,
      done: isOverrideDone(state, `reward_${reward.id}_${month.key}`)
    });
  });

  state.calendarOverrides.forEach((override) => {
    if (override.type === "custom") events.push({ ...override });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export function eventsForWeek(events, baseDate = new Date()) {
  const start = startOfWeek(baseDate);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return events.filter((event) => {
    const date = new Date(`${event.date}T00:00:00`);
    return date >= start && date <= end;
  });
}

export function eventsForMonth(events, monthKey) {
  return events.filter((event) => event.date?.startsWith(monthKey));
}

export function upcomingEvents(events, baseDate = new Date(), limit = 8) {
  const today = baseDate.toISOString().slice(0, 10);
  return events.filter((event) => event.date >= today).slice(0, limit);
}

export function toggleEventDone(state, eventId) {
  const existing = state.calendarOverrides.find((entry) => entry.id === eventId);
  if (existing) {
    existing.done = !existing.done;
  } else {
    state.calendarOverrides.push({
      id: eventId,
      type: "override",
      done: true,
      updatedAt: new Date().toISOString()
    });
  }
}

export function addCustomEvent(state, date, title, amount = 0) {
  state.calendarOverrides.push({
    id: uid("cal"),
    date,
    title,
    amount: Number(amount) || 0,
    type: "custom",
    linkedId: "",
    done: false
  });
}

function isOverrideDone(state, id) {
  return Boolean(state.calendarOverrides.find((entry) => entry.id === id)?.done);
}

function clampDay(day) {
  return Math.max(1, Math.min(28, Number(day) || 15));
}

function weekTargetDate(monthKey, index) {
  const day = Math.min(28, 1 + index * 7);
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

function startOfWeek(date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + diff);
  return start;
}
