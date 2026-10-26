'use strict';
const C = require('./constants');
const { clamp } = require('../util/rng');
const { GROUPS } = require('../data/issues');

function initialEconomy() {
  return { gdp: 6.5, infl: 5.5, unemp: 7.0, health: 50, education: 50, infra: 50, welfare: 50, agri: 50, security: 50, debt: 60, shock: { g: 0, i: 0, u: 0 }, bonus: 0 };
}
function initialBudget() { return { ...C.BASE_BUDGET, tax: 25, deficit: 4.5 }; }

function step(state) {
  const e = state.economy, b = state.budget;
  const power = (b.tax * 0.8 + b.deficit * 2.5) / 31.25; // spending capacity relative to baseline
  for (const [sector, idx] of Object.entries(C.BUDGET_SECTOR_INDEX)) {
    e[idx] = clamp(e[idx] + 0.5 * (b[sector] * power - C.BASE_BUDGET[sector]) - 0.03 * (e[idx] - 50), 5, 95);
  }
  const gT = 6.5 + 0.06 * (e.infra - 50) + 0.04 * (e.education - 50) + 0.03 * (e.health - 50)
    - 0.09 * (b.tax - 25) + 0.05 * (b.deficit - 4.5) - 0.03 * Math.max(0, e.debt - 80) - 0.25 * Math.max(0, e.infl - 7) + e.shock.g;
  e.gdp = clamp(e.gdp + 0.45 * (gT - e.gdp), -3, 11);
  const iT = 5.5 + 0.4 * (b.deficit - 4.5) + 0.05 * (e.gdp - 6.5) + e.shock.i;
  e.infl = clamp(e.infl + 0.4 * (iT - e.infl), 1, 15);
  const uT = 7 - 0.6 * (e.gdp - 6.5) - 0.03 * (e.infra - 50) + e.shock.u;
  e.unemp = clamp(e.unemp + 0.35 * (uT - e.unemp), 2, 18);
  e.debt = clamp(e.debt + 0.25 * (b.deficit - (e.gdp + e.infl) * e.debt / 100), 30, 140);
  e.shock.g *= 0.5; e.shock.i *= 0.5; e.shock.u *= 0.5; e.bonus *= 0.6;
  for (const k of Object.keys(state.mood)) { state.mood[k] *= 0.6; if (Math.abs(state.mood[k]) < 0.01) delete state.mood[k]; }
  // approval
  const raw = 50 + 3.0 * (e.gdp - 6.5) - 2.2 * (e.infl - 5.5) - 1.8 * (e.unemp - 7)
    + 0.12 * (e.health - 50) + 0.12 * (e.education - 50) + 0.10 * (e.infra - 50) + 0.10 * (e.welfare - 50) + e.bonus;
  state.approval.national = clamp(0.6 * state.approval.national + 0.4 * raw, 15, 85);
  state.approval.groups = groupApproval(state);
}
function groupApproval(state) {
  const e = state.economy, n = state.approval.national, b = state.budget;
  const t = {
    youth: -3 * (e.unemp - 7) + 0.15 * (e.education - 50),
    farmers: 0.35 * (e.agri - 50) - 1.5 * (e.infl - 5.5),
    urban: 0.2 * (e.infra - 50) - 1.5 * (e.infl - 5.5) + 1.5 * (e.gdp - 6.5),
    women: -2.5 * (e.infl - 5.5) + 0.2 * (e.health - 50) + 0.1 * (e.welfare - 50),
    business: 3 * (e.gdp - 6.5) - 0.8 * (b.tax - 25),
    workers: -2.5 * (e.unemp - 7) + 0.2 * (e.welfare - 50),
    seniors: 0.25 * (e.health - 50) - 1.5 * (e.infl - 5.5),
    minorities: 0.2 * (e.welfare - 50) + 0.1 * (e.education - 50),
  };
  const out = {};
  for (const g of GROUPS) out[g.id] = +clamp(50 + (n - 50) * 0.5 + t[g.id], 10, 90).toFixed(1);
  return out;
}
module.exports = { initialEconomy, initialBudget, step, groupApproval };
