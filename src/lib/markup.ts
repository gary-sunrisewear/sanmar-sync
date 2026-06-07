// Client-safe markup calculation helpers (used in UI + server).

export interface MarkupRule {
  id: string;
  supplier: string | null;
  match_field: string | null;
  match_value: string | null;
  multiplier: number;
  flat_add: number;
  round_to: number;
  charm_pricing: boolean;
  priority: number;
}

export interface MarkupContext {
  supplier: string;
  vendor?: string | null;
  category?: string | null;
  brand?: string | null;
}

export function selectRule(rules: MarkupRule[], ctx: MarkupContext): MarkupRule | null {
  const matches = rules
    .filter((r) => !r.supplier || r.supplier === ctx.supplier)
    .filter((r) => {
      if (!r.match_field || !r.match_value) return true;
      const v = (ctx as unknown as Record<string, unknown>)[r.match_field];
      return typeof v === "string" && v.toLowerCase() === r.match_value.toLowerCase();
    })
    .sort((a, b) => {
      // most specific first: match_field present > supplier present > global
      const score = (r: MarkupRule) => (r.match_field ? 100 : 0) + (r.supplier ? 10 : 0) + r.priority;
      return score(b) - score(a);
    });
  return matches[0] ?? null;
}

export function applyMarkup(cost: number, rule: MarkupRule | null): number {
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  const r = rule ?? { multiplier: 2, flat_add: 0, round_to: 0.01, charm_pricing: false } as MarkupRule;
  let price = cost * r.multiplier + r.flat_add;
  const step = r.round_to > 0 ? r.round_to : 0.01;
  price = Math.round(price / step) * step;
  if (r.charm_pricing) price = Math.max(0.01, price - 0.01);
  return Math.round(price * 100) / 100;
}
