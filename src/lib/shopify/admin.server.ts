// Shopify Admin REST helper. Server-only.
//
// Uses the SHOPIFY_ACCESS_TOKEN injected by the Lovable Shopify connector.
// Default shop domain is the one connected to this project; override via env if needed.

const API_VERSION = "2025-07";
const SHOP_DOMAIN =
  process.env.SHOPIFY_STORE_PERMANENT_DOMAIN || "sunrisetester.myshopify.com";

function requireToken(): string {
  // Prefer the per-user online access token issued by the Lovable Shopify connector
  // (the offline SHOPIFY_ACCESS_TOKEN can be stale/invalid in dev).
  const onlineKey = Object.keys(process.env).find((k) => k.startsWith("SHOPIFY_ONLINE_ACCESS_TOKEN:user:"));
  const tok = (onlineKey && process.env[onlineKey]) || process.env.SHOPIFY_ACCESS_TOKEN;
  if (!tok) throw new Error("Shopify access token is not configured");
  return tok;
}


function locationId(): string {
  const id = process.env.SHOPIFY_LOCATION_ID;
  if (!id) throw new Error("SHOPIFY_LOCATION_ID is not configured");
  return id;
}

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `https://${SHOP_DOMAIN}/admin/api/${API_VERSION}${path}`;
  const headers = new Headers(init?.headers);
  headers.set("X-Shopify-Access-Token", requireToken());
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  const res = await fetch(url, { ...init, headers });
  return res;
}

async function adminJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await adminFetch(path, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Shopify ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export interface CreateVariantInput {
  sku: string;
  size?: string | null;
  color?: string | null;
  price: number;
  cost?: number | null;
  qty?: number | null;
  weight_grams?: number | null;
  barcode?: string | null;
}

export interface CreateProductInput {
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  tags?: string[];
  images?: string[];          // URLs
  options?: string[];         // e.g. ["Size", "Color"]
  variants: CreateVariantInput[];
}

export interface CreateProductResult {
  product_id: string;
  handle: string;
  variants: Array<{
    variant_id: string;
    inventory_item_id: string;
    sku: string;
    qty: number | null;
  }>;
}

export async function shopifyTestConnection(): Promise<{ ok: boolean; shop?: string; error?: string }> {
  try {
    const data = await adminJson<{ shop: { name: string; myshopify_domain: string } }>("/shop.json");
    return { ok: true, shop: data.shop?.myshopify_domain };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function shopifyCreateProduct(input: CreateProductInput): Promise<CreateProductResult> {
  const options = input.options?.length
    ? input.options.map((name) => ({ name }))
    : undefined;

  const variants = input.variants.map((v) => {
    const option_values: Record<string, string | null | undefined> = {};
    if (input.options?.[0]) option_values.option1 = v.size ?? null;
    if (input.options?.[1]) option_values.option2 = v.color ?? null;
    return {
      sku: v.sku,
      price: v.price.toFixed(2),
      barcode: v.barcode ?? undefined,
      grams: v.weight_grams ?? undefined,
      inventory_management: "shopify",
      inventory_policy: "deny",
      ...option_values,
    };
  });

  const body = {
    product: {
      title: input.title,
      body_html: input.body_html,
      vendor: input.vendor,
      product_type: input.product_type,
      tags: input.tags?.join(", "),
      options,
      variants,
      images: input.images?.map((src) => ({ src })),
    },
  };

  const created = await adminJson<{
    product: {
      id: number;
      handle: string;
      variants: Array<{ id: number; sku: string; inventory_item_id: number }>;
    };
  }>("/products.json", { method: "POST", body: JSON.stringify(body) });

  const productId = String(created.product.id);
  const results: CreateProductResult["variants"] = [];

  for (let i = 0; i < created.product.variants.length; i++) {
    const cv = created.product.variants[i];
    const input_v = input.variants[i];
    const inventory_item_id = String(cv.inventory_item_id);

    // Set cost on inventory item
    if (input_v.cost != null) {
      await adminJson(`/inventory_items/${inventory_item_id}.json`, {
        method: "PUT",
        body: JSON.stringify({ inventory_item: { id: Number(inventory_item_id), cost: input_v.cost.toFixed(2) } }),
      }).catch((e) => console.error("cost set failed", e));
    }

    // Connect inventory item to the configured location, then set the level
    try {
      await adminJson(`/inventory_levels/connect.json`, {
        method: "POST",
        body: JSON.stringify({ location_id: Number(locationId()), inventory_item_id: Number(inventory_item_id) }),
      });
    } catch {
      /* already connected -> ignore */
    }

    if (input_v.qty != null) {
      await adminJson(`/inventory_levels/set.json`, {
        method: "POST",
        body: JSON.stringify({
          location_id: Number(locationId()),
          inventory_item_id: Number(inventory_item_id),
          available: Math.max(0, Math.floor(input_v.qty)),
        }),
      }).catch((e) => console.error("inventory set failed", e));
    }

    results.push({
      variant_id: String(cv.id),
      inventory_item_id,
      sku: cv.sku,
      qty: input_v.qty ?? null,
    });
  }

  return { product_id: productId, handle: created.product.handle, variants: results };
}

export async function shopifySetInventory(inventory_item_id: string, qty: number): Promise<void> {
  await adminJson(`/inventory_levels/set.json`, {
    method: "POST",
    body: JSON.stringify({
      location_id: Number(locationId()),
      inventory_item_id: Number(inventory_item_id),
      available: Math.max(0, Math.floor(qty)),
    }),
  });
}

export async function shopifyUpdateVariantPrice(variant_id: string, price: number, cost?: number, inventory_item_id?: string): Promise<void> {
  await adminJson(`/variants/${variant_id}.json`, {
    method: "PUT",
    body: JSON.stringify({ variant: { id: Number(variant_id), price: price.toFixed(2) } }),
  });
  if (cost != null && inventory_item_id) {
    await adminJson(`/inventory_items/${inventory_item_id}.json`, {
      method: "PUT",
      body: JSON.stringify({ inventory_item: { id: Number(inventory_item_id), cost: cost.toFixed(2) } }),
    });
  }
}

export const shopifyConfig = { SHOP_DOMAIN, API_VERSION };
