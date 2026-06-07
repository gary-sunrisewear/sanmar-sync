// Scheduled inventory sync. Public endpoint protected by Supabase anon key.
//
// Invoke from pg_cron (or any external scheduler):
//   POST https://project--<id>.lovable.app/api/public/cron/inventory-sync
//   apikey: <SUPABASE_ANON_KEY>
//
// For each imported variant: fetch current supplier qty/cost, push to Shopify,
// optionally re-price using markup rules. Logs a sync_jobs row per supplier batch.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/inventory-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("apikey") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected) {
          return new Response(JSON.stringify({ error: "server misconfigured" }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
        if (!auth || auth !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { getSupplierInventory } = await import("@/lib/suppliers/index.server");
        const { shopifySetInventory, shopifyUpdateVariantPrice } = await import("@/lib/shopify/admin.server");
        const { selectRule, applyMarkup } = await import("@/lib/markup");

        let url: URL;
        try { url = new URL(request.url); } catch { url = new URL("http://localhost/"); }
        const updatePrice = url.searchParams.get("price") === "1";

        // Load creds & rules once
        const [credsRes, rulesRes] = await Promise.all([
          supabaseAdmin.from("supplier_credentials").select("supplier, config, enabled"),
          supabaseAdmin.from("markup_rules").select("*"),
        ]);
        const creds = new Map((credsRes.data ?? []).filter((c) => c.enabled).map((c) => [c.supplier as string, c.config as Record<string, string>]));
        const rules = (rulesRes.data ?? []) as never[];

        // Group active products by supplier
        const { data: products } = await supabaseAdmin
          .from("imported_products")
          .select("id, supplier, vendor, product_type")
          .eq("active", true);

        const grouped = new Map<string, typeof products>();
        for (const p of products ?? []) {
          const arr = grouped.get(p.supplier) ?? [];
          arr.push(p);
          grouped.set(p.supplier, arr);
        }

        const summary: Array<{ supplier: string; total: number; ok: number; failed: number; status: string }> = [];

        for (const [supplier, prods] of grouped) {
          const cfg = creds.get(supplier);
          if (!cfg) continue;

          const jobInsert = await supabaseAdmin.from("sync_jobs").insert({
            kind: "inventory",
            supplier,
            status: "running",
            notes: `Scheduled inventory sync for ${prods!.length} products`,
          }).select("id").single();
          const jobId = jobInsert.data?.id;

          let ok = 0, failed = 0, total = 0;
          for (const prod of prods!) {
            const { data: variants } = await supabaseAdmin
              .from("imported_variants")
              .select("id, supplier_sku, shopify_variant_id, shopify_inventory_item_id, cost, price")
              .eq("product_id", prod.id);
            if (!variants?.length) continue;
            total += variants.length;

            try {
              const inv = await getSupplierInventory(supplier as never, cfg, variants.map((v) => v.supplier_sku));
              const invMap = new Map(inv.map((r) => [r.sku, r]));
              const rule = selectRule(rules, { supplier, vendor: prod.vendor, category: prod.product_type });

              for (const v of variants) {
                const row = invMap.get(v.supplier_sku);
                try {
                  if (v.shopify_inventory_item_id) {
                    await shopifySetInventory(v.shopify_inventory_item_id, row?.qty ?? 0);
                  }
                  if (updatePrice && row?.cost != null) {
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
                  console.error("variant sync failed", supplier, v.supplier_sku, e);
                  failed++;
                }
              }
              await supabaseAdmin.from("imported_products").update({
                last_inventory_sync_at: new Date().toISOString(),
                last_price_sync_at: updatePrice ? new Date().toISOString() : undefined,
              }).eq("id", prod.id);
            } catch (e) {
              console.error("supplier inventory call failed", supplier, e);
              failed += variants.length;
            }
          }

          const status = failed ? (ok ? "partial" : "failed") : "success";
          if (jobId) {
            await supabaseAdmin.from("sync_jobs").update({
              status,
              finished_at: new Date().toISOString(),
              items_total: total,
              items_ok: ok,
              items_failed: failed,
            }).eq("id", jobId);
          }
          summary.push({ supplier, total, ok, failed, status });
        }

        return new Response(JSON.stringify({ ok: true, summary }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
