// Helpers de formatação compartilhados (pt-BR).
// Extraídos de Executivo/Insights/Planejamento para evitar duplicação.
import * as E from "./engine-core.js";

export const num = E.parseNum;
export const div = E.safeDiv;

export const f0 = (n) => (isFinite(n) ? Math.round(n).toLocaleString("pt-BR") : "—");
export const f1 = (n) => (isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—");

// pct: casas decimais explícitas no chamador (era default 0 no Executivo e 1 nos outros;
// agora sempre passe o segundo argumento para não haver ambiguidade).
export const pct = (n, d = 1) => (isFinite(n) ? (n * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%" : "—");

export const sgn = (n) => (n > 0 ? "+" : "") + f0(n);

export const brl = (n) => (isFinite(n) ? "R$ " + Math.round(n).toLocaleString("pt-BR") : "—");
export const brlK = (n) => {
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1e6) return "R$ " + (n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " mi";
  if (Math.abs(n) >= 1e3) return "R$ " + (n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil";
  return brl(n);
};
