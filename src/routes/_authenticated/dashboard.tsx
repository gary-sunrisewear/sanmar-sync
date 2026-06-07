import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardStats, testShopify } from "@/lib/api/importer.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Boxes, Plug, ShoppingBag } from "lucide-react";
import { fmtDate, statusTone, supplierLabel } from "@/lib/ui-helpers";
import { toast } from "sonner";
import { useState } from "react";

const statsQO = queryOptions({ queryKey: ["dashboard-stats"], queryFn: () => getDashboardStats() });

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Supplier Importer" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(statsQO),
  component: Page,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
});

function Page() {
  const { data } = useSuspenseQuery(statsQO);
  const qc = useQueryClient();
  const test = useServerFn(testShopify);
  const [busy, setBusy] = useState(false);
  const runShopifyTest = async () => {
    setBusy(true);
    try {
      const r = await test();
      r.ok ? toast.success(`Shopify OK: ${r.shop}`) : toast.error(r.error ?? "Shopify check failed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Connection status, totals, and recent sync activity.</p>
        </div>
        <Button variant="outline" onClick={runShopifyTest} disabled={busy}>Test Shopify</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={<Boxes className="w-4 h-4" />} label="Imported products" value={data.products} />
        <StatCard icon={<ShoppingBag className="w-4 h-4" />} label="Variants tracked" value={data.variants} />
        <StatCard icon={<Plug className="w-4 h-4" />} label="Suppliers configured" value={data.suppliers.filter((s) => s.enabled).length} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Supplier connections</CardTitle></CardHeader>
        <CardContent>
          {data.suppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No supplier credentials saved yet. Add them under Suppliers.</p>
          ) : (
            <ul className="divide-y">
              {data.suppliers.map((s) => (
                <li key={s.supplier} className="py-2 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {s.last_test_ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-amber-500" />}
                    <span className="font-medium">{supplierLabel(s.supplier)}</span>
                    {!s.enabled && <Badge variant="secondary">disabled</Badge>}
                  </div>
                  <div className="text-muted-foreground text-xs">Last test: {fmtDate(s.last_test_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent sync jobs</CardTitle></CardHeader>
        <CardContent>
          {data.recent_jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="text-left"><th className="py-2">Kind</th><th>Supplier</th><th>Status</th><th>OK / Failed</th><th>Started</th></tr>
                </thead>
                <tbody>
                  {data.recent_jobs.map((j) => (
                    <tr key={j.id} className="border-t">
                      <td className="py-2 capitalize">{j.kind}</td>
                      <td>{supplierLabel(j.supplier)}</td>
                      <td><span className={`px-2 py-0.5 text-xs rounded ${statusTone(j.status)}`}>{j.status}</span></td>
                      <td>{j.items_ok} / {j.items_failed}</td>
                      <td className="text-muted-foreground">{fmtDate(j.started_at)}</td>
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

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">{icon}{label}</div>
        <div className="text-3xl font-semibold mt-2">{value}</div>
      </CardContent>
    </Card>
  );
}
