// S&S Activewear REST integration.
// Docs: https://api.ssactivewear.com  — Basic Auth: account # : api key
//
// Required config:
//   account_number: string
//   api_key: string

import type { SupplierCredConfig, SupplierInventoryRow, SupplierProduct } from "./types";

const BASE = "https://api.ssactivewear.com/v2";

function authHeader(cfg: SupplierCredConfig): string {
  const account = String(cfg.account_number ?? "").trim();
  const key = String(cfg.api_key ?? "").trim();
  if (!account || !key) throw new Error("S&S: account_number and api_key required");
  return "Basic " + Buffer.from(`${account}:${key}`).toString("base64");
}

async function ss<T>(cfg: SupplierCredConfig, path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: authHeader(cfg), Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`S&S ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

export async function ssTest(cfg: SupplierCredConfig): Promise<{ ok: boolean; msg: string }> {
  try {
    // small ping: list styles, limited via the products endpoint
    const r = await fetch(`${BASE}/styles/?pagesize=1`, {
      headers: { Authorization: authHeader(cfg), Accept: "application/json" },
    });
    return { ok: r.ok, msg: r.ok ? "Connected" : `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : String(e) };
  }
}

interface SSStyle {
  styleID: number;
  partNumber: string;
  brandName: string;
  styleName: string;
  title: string;
  description: string;
  categories: string;
  baseCategory: string;
  styleImage: string;
}

interface SSProduct {
  sku: string;
  styleID: number;
  brandName: string;
  styleName: string;
  colorName: string;
  sizeName: string;
  piecePrice: number;
  qty: number;
  weight: number;
  gtin: string;
  colorFrontImage: string;
}

export async function ssSearchStyles(cfg: SupplierCredConfig, q: string): Promise<Array<{ style_id: string; name: string; brand: string; image: string | null }>> {
  // S&S styles endpoint supports search via ?search=
  const url = `/styles/?search=${encodeURIComponent(q)}&pagesize=25`;
  const data = await ss<SSStyle[]>(cfg, url);
  return data.map((s) => ({
    style_id: String(s.styleID),
    name: `${s.brandName} ${s.styleName} — ${s.title}`,
    brand: s.brandName,
    image: s.styleImage ? `https://cdn.ssactivewear.com/${s.styleImage}` : null,
  }));
}

export async function ssGetProduct(cfg: SupplierCredConfig, styleId: string): Promise<SupplierProduct> {
  const [styleArr, prods] = await Promise.all([
    ss<SSStyle[]>(cfg, `/styles/${encodeURIComponent(styleId)}`),
    ss<SSProduct[]>(cfg, `/products/?style=${encodeURIComponent(styleId)}`),
  ]);
  const style = styleArr[0];
  if (!style) throw new Error(`S&S style ${styleId} not found`);
  const images = Array.from(new Set([
    style.styleImage ? `https://cdn.ssactivewear.com/${style.styleImage}` : null,
    ...prods.map((p) => (p.colorFrontImage ? `https://cdn.ssactivewear.com/${p.colorFrontImage}` : null)),
  ].filter(Boolean) as string[]));

  return {
    supplier: "ssactivewear",
    style_id: String(style.styleID),
    title: `${style.brandName} ${style.styleName} — ${style.title}`,
    description: style.description,
    vendor: style.brandName,
    brand: style.brandName,
    category: style.baseCategory || style.categories,
    images,
    variants: prods.map((p) => ({
      sku: p.sku,
      size: p.sizeName || null,
      color: p.colorName || null,
      cost: Number(p.piecePrice) || 0,
      qty: Number(p.qty) || 0,
      image: p.colorFrontImage ? `https://cdn.ssactivewear.com/${p.colorFrontImage}` : null,
      barcode: p.gtin || null,
      weight_grams: p.weight ? Math.round(p.weight * 453.592) : null, // lbs -> g
    })),
  };
}

export async function ssGetInventory(cfg: SupplierCredConfig, skus: string[]): Promise<SupplierInventoryRow[]> {
  if (!skus.length) return [];
  // S&S /products/ accepts ?sku=comma-separated
  const chunks: string[][] = [];
  for (let i = 0; i < skus.length; i += 50) chunks.push(skus.slice(i, i + 50));
  const out: SupplierInventoryRow[] = [];
  for (const c of chunks) {
    const data = await ss<SSProduct[]>(cfg, `/products/?sku=${c.map(encodeURIComponent).join(",")}`);
    for (const p of data) out.push({ sku: p.sku, qty: Number(p.qty) || 0, cost: Number(p.piecePrice) || 0 });
  }
  return out;
}
