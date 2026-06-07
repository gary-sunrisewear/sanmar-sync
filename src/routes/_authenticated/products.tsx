import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listImportedProducts, resyncProduct } from "@/lib/api/importer.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtDate, supplierLabel } from "@/lib/ui-helpers";
import { toast } from "sonner";
import { useState } from "react";
import { ExternalLink, RefreshCw, Loader2 } from "lucide-react";

const qo = queryOptions({ queryKey: ["imported-products"], queryFn: () => listImportedProducts() });
const SHOP_DOMAIN = "sunrisetester.myshopify.com";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({ meta: [{ title: "Products — Supplier Importer" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(qo),
  component: Page,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
});

function Page() {
  const { data } = useSuspenseQuery(qo);
  const qc = useQueryClient();
  const resync = useServerFn(resyncProduct);
  const [busy, setBusy] = useState<string | null>(null);

  const doResync = async (id: string, mode: "inventory" | "price" | "both") => {
    setBusy(id);
    try {
      const r = await resync({ data: { product_id: id, mode } });
      toast.success(`Synced — ${r.items_ok} ok, ${r.items_failed} failed`);
      qc.invalidateQueries({ queryKey: ["imported-products"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Imported products</h1>
        <p className="text-sm text-muted-foreground">Everything you've pushed to Shopify, with manual resync.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {data.rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No products yet. Head to <span className="font-medium text-foreground">Import</span> to add one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground bg-muted/50">
                  <tr className="text-left">
                    <th className="p-3">Product</th><th>Supplier</th><th>Style</th><th>Last inv. sync</th><th>Last price sync</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="p-3">
                        <div className="font-medium truncate max-w-[24rem]">{p.supplier_style_name ?? p.shopify_handle}</div>
                        <div className="text-xs text-muted-foreground">{p.vendor}</div>
                      </td>
                      <td>{supplierLabel(p.supplier)}</td>
                      <td className="font-mono text-xs">{p.supplier_style_id}</td>
                      <td className="text-xs text-muted-foreground">{fmtDate(p.last_inventory_sync_at)}</td>
                      <td className="text-xs text-muted-foreground">{fmtDate(p.last_price_sync_at)}</td>
                      <td className="p-3 flex items-center gap-1 justify-end">
                        <Button size="sm" variant="ghost" disabled={busy === p.id} onClick={() => doResync(p.id, "inventory")}>
                          {busy === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><RefreshCw className="w-3.5 h-3.5 mr-1" />Inv</>}
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy === p.id} onClick={() => doResync(p.id, "both")}>
                          Inv+Price
                        </Button>
                        <Button size="sm" variant="ghost" asChild>
                          <a href={`https://${SHOP_DOMAIN}/admin/products/${p.shopify_product_id}`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
