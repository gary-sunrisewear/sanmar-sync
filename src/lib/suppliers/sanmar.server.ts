// SanMar integration.
//
// SanMar exposes PromoStandards SOAP services (ProductData 2.0.0, Inventory 2.0.0,
// Pricing 1.0.0, Media 1.0.0). Production WSDL hosts:
//   https://ws.sanmar.com:8080/promostandards/...
//   https://edev-ws.sanmar.com:8080/...  (sandbox)
//
// A minimal client lives here. Most ops use the JSON-shaped "SanMar Web Service"
// inventory endpoint when available; otherwise we POST SOAP envelopes directly.
//
// Required config:
//   id: SanMar customer number
//   user: SanMar username
//   password: SanMar password
//   sandbox?: boolean

import type { SupplierCredConfig, SupplierInventoryRow, SupplierProduct } from "./types";

function host(cfg: SupplierCredConfig): string {
  return cfg.sandbox ? "https://edev-ws.sanmar.com:8080" : "https://ws.sanmar.com:8080";
}

function creds(cfg: SupplierCredConfig) {
  const id = String(cfg.id ?? "");
  const user = String(cfg.user ?? "");
  const password = String(cfg.password ?? "");
  if (!id || !user || !password) throw new Error("SanMar: id, user, password required");
  return { id, user, password };
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function soap(cfg: SupplierCredConfig, path: string, action: string, body: string): Promise<string> {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>${body}</soapenv:Body>
</soapenv:Envelope>`;
  const res = await fetch(`${host(cfg)}${path}`, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: action },
    body: envelope,
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`SanMar ${res.status}: ${txt.slice(0, 300)}`);
  return txt;
}

function pickAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[a-zA-Z0-9]+:)?${tag}>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9]+:)?${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}
function pick1(xml: string, tag: string): string | null {
  const a = pickAll(xml, tag);
  return a[0] ?? null;
}

export async function sanmarTest(cfg: SupplierCredConfig): Promise<{ ok: boolean; msg: string }> {
  try {
    const c = creds(cfg);
    // The request wrapper lives in the service namespace, but the child fields are
    // declared in the PromoStandards SharedObjects namespace.
    const body = `<inv:GetInventoryLevelsRequest xmlns:inv="http://www.promostandards.org/WSDL/Inventory/2.0.0/" xmlns:sh="http://www.promostandards.org/WSDL/Inventory/2.0.0/SharedObjects/">
      <sh:wsVersion>2.0.0</sh:wsVersion><sh:id>${xml(c.id)}</sh:id><sh:password>${xml(c.password)}</sh:password><sh:productId>PC61</sh:productId>
    </inv:GetInventoryLevelsRequest>`;
    const xml = await soap(cfg, "/promostandards/InventoryServiceBindingV2", "getInventoryLevels", body);
    // An auth failure returns a <ServiceMessage> with code 110/115 inside a 200 response.
    if (/<(?:[a-z0-9]+:)?code>1(10|15)<\//i.test(xml) || /Authentication/i.test(xml)) {
      return { ok: false, msg: "SanMar rejected credentials (check customer #, username, password)" };
    }
    return { ok: true, msg: "Connected" };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : String(e) };
  }
}

export async function sanmarSearchStyles(cfg: SupplierCredConfig, q: string): Promise<Array<{ style_id: string; name: string; brand: string; image: string | null }>> {
  // SanMar PromoStandards has no free-text search. Treat q as a style number directly.
  const styleId = q.trim();
  if (!styleId) return [];
  try {
    const p = await sanmarGetProduct(cfg, styleId);
    return [{ style_id: p.style_id, name: p.title, brand: p.brand ?? "SanMar", image: p.images[0] ?? null }];
  } catch {
    return [];
  }
}

export async function sanmarGetProduct(cfg: SupplierCredConfig, styleId: string): Promise<SupplierProduct> {
  const c = creds(cfg);
  const body = `<pd:GetProductRequest xmlns:pd="http://www.promostandards.org/WSDL/ProductDataService/2.0.0/" xmlns:sh="http://www.promostandards.org/WSDL/ProductDataService/2.0.0/SharedObjects/">
    <sh:wsVersion>2.0.0</sh:wsVersion><sh:id>${xml(c.id)}</sh:id><sh:password>${xml(c.password)}</sh:password>
    <sh:localizationCountry>US</sh:localizationCountry><sh:localizationLanguage>en</sh:localizationLanguage><sh:productId>${xml(styleId)}</sh:productId>
  </pd:GetProductRequest>`;
  const xml = await soap(cfg, "/promostandards/ProductDataServiceBindingV2", "getProduct", body);

  const title = pick1(xml, "productName") ?? styleId;
  const description = pick1(xml, "description");
  const brand = pick1(xml, "primaryBrand") ?? "SanMar";
  const images = pickAll(xml, "url");

  // SanMar's Part nodes carry sku, color, size, pricing, etc.
  const partBlocks = pickAll(xml, "ProductPart");
  const variants = partBlocks.map((p) => ({
    sku: pick1(p, "partId") ?? pick1(p, "partSku") ?? "",
    size: pick1(p, "labelSize") ?? null,
    color: pick1(p, "color") ?? null,
    cost: Number(pick1(p, "price") ?? 0),
    qty: 0,
    image: null,
    barcode: pick1(p, "GTIN") ?? null,
    weight_grams: null,
  })).filter((v) => v.sku);

  // Fetch live inventory for those SKUs
  if (variants.length) {
    const inv = await sanmarGetInventory(cfg, variants.map((v) => v.sku));
    const map = new Map(inv.map((r) => [r.sku, r.qty]));
    variants.forEach((v) => (v.qty = map.get(v.sku) ?? 0));
  }

  return {
    supplier: "sanmar",
    style_id: styleId,
    title,
    description,
    vendor: brand,
    brand,
    category: null,
    images,
    variants,
  };
}

export async function sanmarGetInventory(cfg: SupplierCredConfig, skus: string[]): Promise<SupplierInventoryRow[]> {
  const c = creds(cfg);
  // Use SanMar's Inventory 2.0.0 getInventoryLevels per productId (style-level call)
  // We group SKUs by style prefix when possible; otherwise we call per-SKU.
  const out: SupplierInventoryRow[] = [];
  for (const sku of skus) {
      const body = `<inv:GetInventoryLevelsRequest xmlns:inv="http://www.promostandards.org/WSDL/Inventory/2.0.0/" xmlns:sh="http://www.promostandards.org/WSDL/Inventory/2.0.0/SharedObjects/">
      <sh:wsVersion>2.0.0</sh:wsVersion><sh:id>${xml(c.id)}</sh:id><sh:password>${xml(c.password)}</sh:password><sh:productId>${xml(sku)}</sh:productId>
    </inv:GetInventoryLevelsRequest>`;
    try {
      const xml = await soap(cfg, "/promostandards/InventoryServiceBindingV2", "getInventoryLevels", body);
      const qty = Number(pick1(xml, "quantityAvailable") ?? 0);
      out.push({ sku, qty: Number.isFinite(qty) ? qty : 0 });
    } catch (e) {
      console.error("SanMar inventory failed for", sku, e);
      out.push({ sku, qty: 0 });
    }
  }
  return out;
}
