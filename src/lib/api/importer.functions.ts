// Server functions for the importer dashboard.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SupplierEnum = z.enum(["sanmar", "ssactivewear", "ascolour", "ottocap"]);
type SupplierCode = z.infer<typeof SupplierEnum>;

// ---- Roles -----------------------------------------------------------------

export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    return { roles: (data ?? []).map((r) => r.role as "admin" | "operator") };
  });

// ---- Dashboard summary -----------------------------------------------------

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [products, variants, jobs, suppliers] = await Promise.all([
      supabase.from("imported_products").select("id", { count: "exact", head: true }),
      supabase.from("imported_variants").select("id", { count: "exact", head: true }),
      supabase.from("sync_jobs").select("id, kind, supplier, status, started_at, finished_at, items_total, items_ok, items_failed").order("started_at", { ascending: false }).limit(10),
      supabase.from("supplier_credentials").select("supplier, enabled, last_test_ok, last_test_at"),
    ]);
    return {
      products: products.count ?? 0,
      variants: variants.count ?? 0,
      recent_jobs: jobs.data ?? [],
      suppliers: suppliers.data ?? [],
    };
  });

// ---- Supplier credentials --------------------------------------------------

export const listSupplierCredentials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("supplier_credentials")
      .select("supplier, enabled, config, last_test_at, last_test_ok, last_test_message");
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const upsertSupplierCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { supplier: SupplierCode; config: Record<string, string | number | boolean>; enabled?: boolean }) =>
    z.object({
      supplier: SupplierEnum,
      config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
      enabled: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("supplier_credentials")
      .upsert({ supplier: data.supplier, config: data.config, enabled: data.enabled ?? true }, { onConflict: "supplier" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testSupplierCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { supplier: SupplierCode }) => z.object({ supplier: SupplierEnum }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cred, error } = await supabase
      .from("supplier_credentials")
      .select("config")
      .eq("supplier", data.supplier)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!cred) return { ok: false, msg: "No credentials saved yet." };

    const { testSupplier } = await import("@/lib/suppliers/index.server");
    const result = await testSupplier(data.supplier, (cred.config as Record<string, string>) ?? {});
    await supabaseAdmin
      .from("supplier_credentials")
      .update({ last_test_at: new Date().toISOString(), last_test_ok: result.ok, last_test_message: result.msg })
      .eq("supplier", data.supplier);
    return result;
  });

// ---- Shopify connection test ----------------------------------------------

export const testShopify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { shopifyTestConnection } = await import("@/lib/shopify/admin.server");
    return shopifyTestConnection();
  });

// ---- Markup rules ----------------------------------------------------------

export const listMarkupRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("markup_rules")
      .select("*")
      .order("priority", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const saveMarkupRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      supplier: SupplierEnum.nullable(),
      match_field: z.enum(["vendor", "category", "brand"]).nullable(),
      match_value: z.string().max(200).nullable(),
      multiplier: z.number().min(0.1).max(100),
      flat_add: z.number().min(-1000).max(10000),
      round_to: z.number().min(0.01).max(1000),
      charm_pricing: z.boolean(),
      priority: z.number().int().min(0).max(1000),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    if (data.id) {
      const { error } = await supabase.from("markup_rules").update(data).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { id: _id, ...insert } = data;
      const { error } = await supabase.from("markup_rules").insert(insert);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteMarkupRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("markup_rules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Import flow -----------------------------------------------------------

export const searchSupplierProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { supplier: SupplierCode; q: string }) =>
    z.object({ supplier: SupplierEnum, q: z.string().min(1).max(120) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: cred } = await supabase.from("supplier_credentials").select("config").eq("supplier", data.supplier).maybeSingle();
    if (!cred) throw new Error("Save supplier credentials first.");
    const { searchSupplierStyles } = await import("@/lib/suppliers/index.server");
    const results = await searchSupplierStyles(data.supplier, (cred.config as Record<string, string>) ?? {}, data.q);
    return { results };
  });

export const previewSupplierProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { supplier: SupplierCode; style_id: string }) =>
    z.object({ supplier: SupplierEnum, style_id: z.string().min(1).max(120) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const [credRes, rulesRes] = await Promise.all([
      supabase.from("supplier_credentials").select("config").eq("supplier", data.supplier).maybeSingle(),
      supabase.from("markup_rules").select("*"),
    ]);
    if (!credRes.data) throw new Error("Save supplier credentials first.");
    const { getSupplierProduct } = await import("@/lib/suppliers/index.server");
    const product = await getSupplierProduct(data.supplier, (credRes.data.config as Record<string, string>) ?? {}, data.style_id);

    const { selectRule, applyMarkup } = await import("@/lib/markup");
    const rule = selectRule((rulesRes.data ?? []) as never, {
      supplier: data.supplier,
      vendor: product.vendor,
      brand: product.brand,
      category: product.category,
    });
    const variants = product.variants.map((v) => ({ ...v, price: applyMarkup(v.cost, rule) }));
    return { product: { ...product, variants }, rule };
  });

export const importProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      supplier: SupplierEnum,
      style_id: z.string().min(1).max(120),
      title: z.string().min(1).max(255).optional(),
      sku_filter: z.array(z.string()).optional(), // limit to these SKUs; empty = all
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // record job
    const { data: jobRow, error: jobErr } = await supabaseAdmin
      .from("sync_jobs")
      .insert({ kind: "import", supplier: data.supplier, status: "running", triggered_by: userId, items_total: 1 })
      .select("id")
      .single();
    if (jobErr || !jobRow) throw new Error(jobErr?.message ?? "Failed to create job");
    const jobId: string = jobRow.id;

    try {
      const [credRes, rulesRes] = await Promise.all([
        supabase.from("supplier_credentials").select("config").eq("supplier", data.supplier).maybeSingle(),
        supabase.from("markup_rules").select("*"),
      ]);
      if (!credRes.data) throw new Error("Save supplier credentials first.");
      const { getSupplierProduct } = await import("@/lib/suppliers/index.server");
      const product = await getSupplierProduct(data.supplier, (credRes.data.config as Record<string, string>) ?? {}, data.style_id);

      const { selectRule, applyMarkup } = await import("@/lib/markup");
      const rule = selectRule((rulesRes.data ?? []) as never, {
        supplier: data.supplier,
        vendor: product.vendor,
        brand: product.brand,
        category: product.category,
      });

      const filtered = data.sku_filter?.length
        ? product.variants.filter((v) => data.sku_filter!.includes(v.sku))
        : product.variants;
      if (!filtered.length) throw new Error("No variants selected.");

      // Determine option axes
      const hasSize = filtered.some((v) => v.size);
      const hasColor = filtered.some((v) => v.color);
      const options = [hasColor && "Color", hasSize && "Size"].filter(Boolean) as string[];

      const { shopifyCreateProduct } = await import("@/lib/shopify/admin.server");
      const created = await shopifyCreateProduct({
        title: data.title || product.title,
        body_html: product.description ?? undefined,
        vendor: product.vendor ?? undefined,
        product_type: product.category ?? undefined,
        tags: [data.supplier, product.brand].filter(Boolean) as string[],
        images: product.images,
        options,
        variants: filtered.map((v) => ({
          sku: v.sku,
          size: v.size,
          color: v.color,
          cost: v.cost,
          price: applyMarkup(v.cost, rule),
          qty: v.qty,
          barcode: v.barcode ?? null,
          weight_grams: v.weight_grams ?? null,
        })),
      });

      // Persist mapping
      const { data: prodRow, error: prodErr } = await supabase
        .from("imported_products")
        .upsert(
          {
            supplier: data.supplier,
            supplier_style_id: product.style_id,
            supplier_style_name: product.title,
            shopify_product_id: created.product_id,
            shopify_handle: created.handle,
            vendor: product.vendor,
            product_type: product.category,
            imported_by: userId,
            last_inventory_sync_at: new Date().toISOString(),
            last_price_sync_at: new Date().toISOString(),
          },
          { onConflict: "supplier,supplier_style_id" },
        )
        .select("id")
        .single();
      if (prodErr) throw new Error(prodErr.message);

      const variantRows = created.variants.map((cv, i) => ({
        product_id: prodRow.id,
        supplier_sku: cv.sku,
        shopify_variant_id: cv.variant_id,
        shopify_inventory_item_id: cv.inventory_item_id,
        size: filtered[i].size,
        color: filtered[i].color,
        cost: filtered[i].cost,
        price: applyMarkup(filtered[i].cost, rule),
        last_qty: filtered[i].qty,
        last_synced_at: new Date().toISOString(),
      }));
      const { error: vErr } = await supabase.from("imported_variants").upsert(variantRows, { onConflict: "product_id,supplier_sku" });
      if (vErr) throw new Error(vErr.message);

      await supabaseAdmin.from("sync_jobs").update({
        status: "success", finished_at: new Date().toISOString(), items_ok: 1,
      }).eq("id", jobId);

      return { ok: true, product_id: prodRow.id, shopify_product_id: created.product_id, handle: created.handle, variants: variantRows.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin.from("sync_jobs").update({
        status: "failed", finished_at: new Date().toISOString(), items_failed: 1, notes: msg,
      }).eq("id", jobId);
      throw e;
    }
  });

// ---- Products list ---------------------------------------------------------

export const listImportedProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("imported_products")
      .select("id, supplier, supplier_style_id, supplier_style_name, shopify_product_id, shopify_handle, vendor, product_type, last_inventory_sync_at, last_price_sync_at, active, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

// ---- Manual resync (inventory + price) for one imported product ----------

export const resyncProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { product_id: string; mode: "inventory" | "price" | "both" }) =>
    z.object({ product_id: z.string().uuid(), mode: z.enum(["inventory", "price", "both"]) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prod, error } = await supabase
      .from("imported_products")
      .select("id, supplier, supplier_style_id, vendor, product_type")
      .eq("id", data.product_id)
      .single();
    if (error || !prod) throw new Error("Product not found");

    const { data: variants } = await supabase
      .from("imported_variants")
      .select("id, supplier_sku, shopify_variant_id, shopify_inventory_item_id, cost, price")
      .eq("product_id", prod.id);
    if (!variants?.length) return { ok: false, message: "No variants" };

    const [{ data: cred }, { data: rules }] = await Promise.all([
      supabase.from("supplier_credentials").select("config").eq("supplier", prod.supplier).maybeSingle(),
      supabase.from("markup_rules").select("*"),
    ]);
    if (!cred) throw new Error("Supplier credentials missing");

    const { getSupplierInventory } = await import("@/lib/suppliers/index.server");
    const { shopifySetInventory, shopifyUpdateVariantPrice } = await import("@/lib/shopify/admin.server");
    const { selectRule, applyMarkup } = await import("@/lib/markup");
    const rule = selectRule((rules ?? []) as never, {
      supplier: prod.supplier,
      vendor: prod.vendor,
      category: prod.product_type,
    });

    const inv = await getSupplierInventory(prod.supplier, (cred.config as Record<string, string>) ?? {}, variants.map((v) => v.supplier_sku));
    const invMap = new Map(inv.map((r) => [r.sku, r]));

    let ok = 0, failed = 0;
    for (const v of variants) {
      const row = invMap.get(v.supplier_sku);
      try {
        if (data.mode === "inventory" || data.mode === "both") {
          await shopifySetInventory(v.shopify_inventory_item_id!, row?.qty ?? 0);
        }
        if ((data.mode === "price" || data.mode === "both") && row?.cost != null) {
          const newPrice = applyMarkup(row.cost, rule);
          await shopifyUpdateVariantPrice(v.shopify_variant_id, newPrice, row.cost, v.shopify_inventory_item_id ?? undefined);
          await supabaseAdmin.from("imported_variants").update({ cost: row.cost, price: newPrice }).eq("id", v.id);
        }
        await supabaseAdmin.from("imported_variants").update({
          last_qty: row?.qty ?? 0,
          last_synced_at: new Date().toISOString(),
        }).eq("id", v.id);
        ok++;
      } catch (e) {
        console.error("resync variant failed", v.supplier_sku, e);
        failed++;
      }
    }

    const stamp = new Date().toISOString();
    await supabaseAdmin.from("imported_products").update({
      last_inventory_sync_at: data.mode !== "price" ? stamp : undefined,
      last_price_sync_at: data.mode !== "inventory" ? stamp : undefined,
    }).eq("id", prod.id);

    await supabaseAdmin.from("sync_jobs").insert({
      kind: data.mode === "price" ? "price" : "inventory",
      supplier: prod.supplier,
      status: failed ? (ok ? "partial" : "failed") : "success",
      started_at: stamp,
      finished_at: new Date().toISOString(),
      items_total: variants.length,
      items_ok: ok,
      items_failed: failed,
      notes: `Manual resync for style ${prod.supplier_style_id}`,
    });

    return { ok: true, items_ok: ok, items_failed: failed };
  });

// ---- Sync jobs -------------------------------------------------------------

export const listSyncJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sync_jobs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });
