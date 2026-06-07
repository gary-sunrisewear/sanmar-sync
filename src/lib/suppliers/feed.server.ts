// Shared CSV-feed integration used by AS Colour and Otto Cap.
//
// Both suppliers (for the dealer accounts this tool targets) provide an authenticated
// CSV / JSON feed URL with one row per SKU including style, color, size, cost,
// available qty, and image url. We let the operator paste the URL + optional
// header overrides into supplier_credentials.config.
//
// Required config:
//   feed_url: string                    (CSV URL; auth via query token or signed URL)
//   header_style?: string  default "style"
//   header_sku?: string    default "sku"
//   header_title?: string  default "title"
//   header_color?: string  default "color"
//   header_size?: string   default "size"
//   header_cost?: string   default "cost"
//   header_qty?: string    default "qty"
//   header_image?: string  default "image"
//   header_brand?: string  default "brand"
//   header_category?: string default "category"

import type { SupplierCode, SupplierCredConfig, SupplierInventoryRow, SupplierProduct } from "./types";

function parseCsv(text: string): Array<Record<string, string>> {
  // Minimal RFC-4180 parser (handles quoted fields, embedded commas, escaped quotes)
  const rows: string[][] = [];
  let i = 0;
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (ch === '"') { inQ = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQ = true; i++; continue; }
    if (ch === ',') { cur.push(field); field = ""; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ""; i++; continue; }
    field += ch; i++;
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).filter((r) => r.some((v) => v && v.trim().length)).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, idx) => (o[h] = (r[idx] ?? "").trim()));
    return o;
  });
}

function pick(cfg: SupplierCredConfig, key: string, fallback: string): string {
  const v = cfg[`header_${key}`];
  return (typeof v === "string" && v.trim() ? v.trim() : fallback).toLowerCase();
}

async function loadFeed(cfg: SupplierCredConfig): Promise<Array<Record<string, string>>> {
  const url = String(cfg.feed_url ?? "");
  if (!url) throw new Error("feed_url is required");
  const res = await fetch(url, { headers: { Accept: "text/csv,application/json" } });
  if (!res.ok) throw new Error(`Feed ${res.status}: ${res.statusText}`);
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (ct.includes("application/json") || text.trim().startsWith("[")) {
    const j = JSON.parse(text);
    return Array.isArray(j) ? j.map((row) => {
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(row as Record<string, unknown>)) flat[k.toLowerCase()] = v == null ? "" : String(v);
      return flat;
    }) : [];
  }
  return parseCsv(text);
}

export async function feedTest(cfg: SupplierCredConfig): Promise<{ ok: boolean; msg: string }> {
  try {
    const rows = await loadFeed(cfg);
    return { ok: rows.length > 0, msg: rows.length ? `Loaded ${rows.length} rows` : "Feed loaded but empty" };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : String(e) };
  }
}

export async function feedSearchStyles(cfg: SupplierCredConfig, q: string): Promise<Array<{ style_id: string; name: string; brand: string; image: string | null }>> {
  const rows = await loadFeed(cfg);
  const fStyle = pick(cfg, "style", "style");
  const fTitle = pick(cfg, "title", "title");
  const fBrand = pick(cfg, "brand", "brand");
  const fImage = pick(cfg, "image", "image");
  const seen = new Map<string, { name: string; brand: string; image: string | null }>();
  const ql = q.toLowerCase();
  for (const r of rows) {
    const sid = r[fStyle];
    if (!sid) continue;
    const name = r[fTitle] || sid;
    if (q && !sid.toLowerCase().includes(ql) && !name.toLowerCase().includes(ql)) continue;
    if (!seen.has(sid)) seen.set(sid, { name, brand: r[fBrand] || "", image: r[fImage] || null });
    if (seen.size >= 25) break;
  }
  return Array.from(seen.entries()).map(([style_id, v]) => ({ style_id, ...v }));
}

export async function feedGetProduct(cfg: SupplierCredConfig, supplier: SupplierCode, styleId: string): Promise<SupplierProduct> {
  const rows = await loadFeed(cfg);
  const fStyle = pick(cfg, "style", "style");
  const fSku = pick(cfg, "sku", "sku");
  const fTitle = pick(cfg, "title", "title");
  const fColor = pick(cfg, "color", "color");
  const fSize = pick(cfg, "size", "size");
  const fCost = pick(cfg, "cost", "cost");
  const fQty = pick(cfg, "qty", "qty");
  const fImage = pick(cfg, "image", "image");
  const fBrand = pick(cfg, "brand", "brand");
  const fCategory = pick(cfg, "category", "category");

  const matches = rows.filter((r) => r[fStyle] === styleId);
  if (!matches.length) throw new Error(`No rows for style ${styleId}`);
  const head = matches[0];
  const images = Array.from(new Set(matches.map((r) => r[fImage]).filter(Boolean)));

  return {
    supplier,
    style_id: styleId,
    title: head[fTitle] || styleId,
    description: null,
    vendor: head[fBrand] || null,
    brand: head[fBrand] || null,
    category: head[fCategory] || null,
    images,
    variants: matches.map((r) => ({
      sku: r[fSku] || `${styleId}-${r[fColor]}-${r[fSize]}`,
      size: r[fSize] || null,
      color: r[fColor] || null,
      cost: Number(r[fCost]) || 0,
      qty: Number(r[fQty]) || 0,
      image: r[fImage] || null,
      barcode: null,
      weight_grams: null,
    })),
  };
}

export async function feedGetInventory(cfg: SupplierCredConfig, skus: string[]): Promise<SupplierInventoryRow[]> {
  const rows = await loadFeed(cfg);
  const fSku = pick(cfg, "sku", "sku");
  const fQty = pick(cfg, "qty", "qty");
  const fCost = pick(cfg, "cost", "cost");
  const set = new Set(skus);
  const out: SupplierInventoryRow[] = [];
  for (const r of rows) {
    if (set.has(r[fSku])) out.push({ sku: r[fSku], qty: Number(r[fQty]) || 0, cost: Number(r[fCost]) || 0 });
  }
  // Make sure every requested sku has a row even if missing from feed
  const found = new Set(out.map((r) => r.sku));
  for (const s of skus) if (!found.has(s)) out.push({ sku: s, qty: 0 });
  return out;
}
