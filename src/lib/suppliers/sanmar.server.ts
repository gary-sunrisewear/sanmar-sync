// SanMar integration via PromoStandards SOAP services.
// ProductData 1.0.0, Inventory 2.0.0.

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

function escapeXml(value: string): string {
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

// XML helpers — namespace-agnostic
function pickAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[a-zA-Z0-9]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9]+:)?${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}
function pick1(xml: string, tag: string): string | null {
  return pickAll(xml, tag)[0] ?? null;
}
function pickFirstOf(xml: string, tags: string[]): string | null {
  for (const t of tags) {
    const v = pick1(xml, t);
    if (v != null && v !== "") return v;
  }
  return null;
}

export async function sanmarTest(cfg: SupplierCredConfig): Promise<{ ok: boolean; msg: string }> {
  try {
    const c = creds(cfg);
    const body = `<inv:GetInventoryLevelsRequest xmlns:inv="http://www.promostandards.org/WSDL/Inventory/2.0.0/" xmlns:sh="http://www.promostandards.org/WSDL/Inventory/2.0.0/SharedObjects/">
      <sh:wsVersion>2.0.0</sh:wsVersion><sh:id>${escapeXml(c.id)}</sh:id><sh:password>${escapeXml(c.password)}</sh:password><sh:productId>PC61</sh:productId>
    </inv:GetInventoryLevelsRequest>`;
    const xml = await soap(cfg, "/promostandards/InventoryServiceBindingV2", "getInventoryLevels", body);
    if (/<(?:[a-z0-9]+:)?code>1(05|10|15)<\//i.test(xml) || /Authentication/i.test(xml)) {
      return { ok: false, msg: "SanMar rejected credentials (check customer #, username, password)" };
    }
    return { ok: true, msg: "Connected" };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : String(e) };
  }
}

export async function sanmarSearchStyles(cfg: SupplierCredConfig, q: string): Promise<Array<{ style_id: string; name: string; brand: string; image: string | null }>> {
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
  const body = `<pd:GetProductRequest xmlns:pd="http://www.promostandards.org/WSDL/ProductDataService/1.0.0/" xmlns:sh="http://www.promostandards.org/WSDL/ProductDataService/1.0.0/SharedObjects/">
    <sh:wsVersion>1.0.0</sh:wsVersion><sh:id>${escapeXml(c.id)}</sh:id><sh:password>${escapeXml(c.password)}</sh:password>
    <sh:localizationCountry>US</sh:localizationCountry><sh:localizationLanguage>en</sh:localizationLanguage><sh:productId>${escapeXml(styleId)}</sh:productId>
  </pd:GetProductRequest>`;
  const xml = await soap(cfg, "/promostandards/ProductDataServiceBinding", "getProduct", body);

  if (/<(?:[a-z0-9]+:)?code>1(05|10|15)<\//i.test(xml)) {
    throw new Error("SanMar rejected credentials");
  }

  const title = pickFirstOf(xml, ["productName", "ProductName"]) ?? styleId;
  // description is repeating; join non-empty unique entries
  const descParts = pickAll(xml, "description").map((s) => s.trim()).filter(Boolean);
  const description = descParts.length ? Array.from(new Set(descParts)).join("\n\n") : null;
  const brand = pickFirstOf(xml, ["productBrand", "ProductBrand", "primaryBrand", "brandName"]) ?? "SanMar";

  // Images: ProductData rarely carries media for SanMar — fetch via Media Content Service
  const mediaBlocks = await fetchMediaContent(cfg, styleId).catch((e) => {
    console.error("SanMar media fetch failed", e);
    return [] as Array<{ url: string; color: string | null; classType: string | null }>;
  });
  const imageSet = new Set<string>();
  for (const m of mediaBlocks) {
    if (m.url && /^https?:\/\//i.test(m.url)) imageSet.add(m.url);
  }
  const images = Array.from(imageSet);

  // Pricing — PromoStandards PricingAndConfiguration 1.0.0
  const priceMap = await fetchPricingByStyle(cfg, styleId).catch((e) => {
    console.error("SanMar pricing fetch failed", e);
    return new Map<string, number>();
  });

  // Variants from ProductPartArray
  const partBlocks = pickAll(xml, "ProductPart");
  const variants = partBlocks.map((p) => {
    const colorBlock = pick1(p, "Color") ?? p;
    const sizeBlock = pick1(p, "ApparelSize") ?? p;
    const color = pickFirstOf(colorBlock, ["colorName", "color"]);
    const size = pickFirstOf(sizeBlock, ["labelSize", "size"]);
    const sku = pickFirstOf(p, ["partId", "partSku"]) ?? "";
    // pick a color-specific image if available
    const partColor = color?.toLowerCase();
    let image: string | null = null;
    if (partColor) {
      const match = mediaBlocks.find((m) => m.color?.toLowerCase() === partColor);
      image = match?.url ?? null;
    }
    return {
      sku,
      size: size ?? null,
      color: color ?? null,
      cost: priceMap.get(sku) ?? 0,
      qty: 0,
      image,
      barcode: pick1(p, "GTIN") ?? null,
      weight_grams: null,
    };
  }).filter((v) => v.sku);

  // Inventory — one call per style, map partId -> qty
  if (variants.length) {
    try {
      const invMap = await fetchInventoryByStyle(cfg, styleId);
      variants.forEach((v) => (v.qty = invMap.get(v.sku) ?? 0));
    } catch (e) {
      console.error("SanMar inventory by style failed", e);
    }
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

async function fetchMediaContent(cfg: SupplierCredConfig, styleId: string): Promise<Array<{ url: string; color: string | null; classType: string | null }>> {
  const c = creds(cfg);
  const body = `<ns:GetMediaContentRequest xmlns:ns="http://www.promostandards.org/WSDL/MediaService/1.0.0/" xmlns:sh="http://www.promostandards.org/WSDL/MediaService/1.0.0/SharedObjects/">
    <sh:wsVersion>1.0.0</sh:wsVersion><sh:id>${escapeXml(c.id)}</sh:id><sh:password>${escapeXml(c.password)}</sh:password>
    <sh:mediaType>Image</sh:mediaType><sh:productId>${escapeXml(styleId)}</sh:productId>
    <sh:cultureName>en-US</sh:cultureName>
  </ns:GetMediaContentRequest>`;
  const xml = await soap(cfg, "/promostandards/MediaContentServiceBinding", "getMediaContent", body);
  const out: Array<{ url: string; color: string | null; classType: string | null }> = [];
  for (const m of pickAll(xml, "MediaContent")) {
    const url = pick1(m, "url");
    if (!url) continue;
    out.push({
      url,
      color: pick1(m, "color") ?? pick1(m, "colorName"),
      classType: pick1(m, "classType") ?? pick1(m, "classTypeName"),
    });
  }
  return out;
}

async function fetchPricingByStyle(cfg: SupplierCredConfig, styleId: string): Promise<Map<string, number>> {
  const c = creds(cfg);
  const body = `<ns:GetConfigurationAndPricingRequest xmlns:ns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/" xmlns:sh="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/">
    <sh:wsVersion>1.0.0</sh:wsVersion><sh:id>${escapeXml(c.id)}</sh:id><sh:password>${escapeXml(c.password)}</sh:password>
    <sh:productId>${escapeXml(styleId)}</sh:productId>
    <sh:currency>USD</sh:currency>
    <sh:fobId>1</sh:fobId>
    <sh:priceType>Net</sh:priceType>
    <sh:localizationCountry>US</sh:localizationCountry>
    <sh:localizationLanguage>en</sh:localizationLanguage>
    <sh:configurationType>Blank</sh:configurationType>
  </ns:GetConfigurationAndPricingRequest>`;
  const xml = await soap(cfg, "/promostandards/PricingAndConfigurationServiceBinding", "getConfigurationAndPricing", body);
  const map = new Map<string, number>();
  for (const part of pickAll(xml, "PartPriceArray")) {
    // each PartPriceArray belongs to a Part — but partId is sibling, so walk Part blocks instead
  }
  // Walk each Part block: extract partId + lowest price tier
  for (const part of pickAll(xml, "Part")) {
    const partId = pickFirstOf(part, ["partId", "partSku"]);
    if (!partId) continue;
    const prices = pickAll(part, "PartPrice")
      .map((pp) => ({ qty: Number(pick1(pp, "minQuantity") ?? 1), price: Number(pick1(pp, "price") ?? 0) }))
      .filter((x) => Number.isFinite(x.price) && x.price > 0)
      .sort((a, b) => a.qty - b.qty);
    if (prices.length) map.set(partId, prices[0].price);
  }
  return map;
}


async function fetchInventoryByStyle(cfg: SupplierCredConfig, styleId: string): Promise<Map<string, number>> {
  const c = creds(cfg);
  const body = `<inv:GetInventoryLevelsRequest xmlns:inv="http://www.promostandards.org/WSDL/Inventory/2.0.0/" xmlns:sh="http://www.promostandards.org/WSDL/Inventory/2.0.0/SharedObjects/">
    <sh:wsVersion>2.0.0</sh:wsVersion><sh:id>${escapeXml(c.id)}</sh:id><sh:password>${escapeXml(c.password)}</sh:password><sh:productId>${escapeXml(styleId)}</sh:productId>
  </inv:GetInventoryLevelsRequest>`;
  const xml = await soap(cfg, "/promostandards/InventoryServiceBindingV2", "getInventoryLevels", body);
  const map = new Map<string, number>();
  for (const part of pickAll(xml, "PartInventory")) {
    const partId = pickFirstOf(part, ["partId", "partSku"]);
    if (!partId) continue;
    // quantityAvailable contains Quantity/value (possibly multiple warehouses, sum them)
    const qBlock = pick1(part, "quantityAvailable") ?? "";
    const values = pickAll(qBlock, "value").map((v) => Number(v) || 0);
    const total = values.reduce((s, n) => s + n, 0);
    map.set(partId, total);
  }
  return map;
}

export async function sanmarGetInventory(_cfg: SupplierCredConfig, _skus: string[]): Promise<SupplierInventoryRow[]> {
  // Inventory is fetched at the style level inside sanmarGetProduct.
  // For sync, callers should pass styleId via a future API; for now return empty.
  return [];
}
