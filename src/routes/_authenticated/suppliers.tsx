import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSupplierCredentials, testSupplierCredential, upsertSupplierCredential } from "@/lib/api/importer.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { toast } from "sonner";
import { SUPPLIER_LABEL } from "@/lib/suppliers/types";
import { fmtDate } from "@/lib/ui-helpers";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

type Supplier = keyof typeof SUPPLIER_LABEL;

interface FieldDef { key: string; label: string; type?: string; placeholder?: string; help?: string }
const SCHEMA: Record<Supplier, FieldDef[]> = {
  sanmar: [
    { key: "id", label: "Username", help: "SanMar web service username (sent as PromoStandards <id>)." },
    { key: "user", label: "Customer #", placeholder: "12345" },
    { key: "password", label: "Password", type: "password" },
    { key: "sandbox", label: "Use sandbox (edev)", type: "checkbox" },
  ],
  ssactivewear: [
    { key: "account_number", label: "Account #" },
    { key: "api_key", label: "API key", type: "password", help: "Generate in S&S account portal." },
  ],
  ascolour: [
    { key: "feed_url", label: "Dealer feed URL (CSV or JSON)", placeholder: "https://example.com/feed.csv?token=..." },
    { key: "header_sku", label: "SKU column", placeholder: "sku" },
    { key: "header_style", label: "Style column", placeholder: "style" },
    { key: "header_cost", label: "Cost column", placeholder: "cost" },
    { key: "header_qty", label: "Qty column", placeholder: "qty" },
  ],
  ottocap: [
    { key: "feed_url", label: "Dealer feed URL (CSV or JSON)" },
    { key: "header_sku", label: "SKU column", placeholder: "sku" },
    { key: "header_style", label: "Style column", placeholder: "style" },
    { key: "header_cost", label: "Cost column", placeholder: "cost" },
    { key: "header_qty", label: "Qty column", placeholder: "qty" },
  ],
};

const credsQO = queryOptions({ queryKey: ["supplier-creds"], queryFn: () => listSupplierCredentials() });

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers — Supplier Importer" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(credsQO),
  component: Page,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
});

function Page() {
  const { data } = useSuspenseQuery(credsQO);
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Suppliers</h1>
        <p className="text-sm text-muted-foreground">Save credentials for each supplier and test the connection.</p>
      </div>
      {(Object.keys(SCHEMA) as Supplier[]).map((s) => {
        const row = data.rows.find((r) => r.supplier === s);
        return <SupplierCard key={s} supplier={s} row={row as never} />;
      })}
    </div>
  );
}

function SupplierCard({ supplier, row }: { supplier: Supplier; row?: { supplier: string; enabled: boolean; config: Record<string, unknown> | null; last_test_at: string | null; last_test_ok: boolean | null; last_test_message: string | null } }) {
  const qc = useQueryClient();
  const save = useServerFn(upsertSupplierCredential);
  const test = useServerFn(testSupplierCredential);
  const [config, setConfig] = useState<Record<string, string | number | boolean>>(() => {
    const out: Record<string, string | number | boolean> = {};
    if (row?.config) for (const [k, v] of Object.entries(row.config)) if (v != null) out[k] = v as string;
    return out;
  });
  const [enabled, setEnabled] = useState(row?.enabled ?? true);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    try {
      await save({ data: { supplier, config, enabled } });
      toast.success(`${SUPPLIER_LABEL[supplier]} saved`);
      qc.invalidateQueries({ queryKey: ["supplier-creds"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };
  const handleTest = async () => {
    setBusy(true);
    try {
      const r = await test({ data: { supplier } });
      r.ok ? toast.success(r.msg ?? "Connected") : toast.error(r.msg ?? "Failed");
      qc.invalidateQueries({ queryKey: ["supplier-creds"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            {row?.last_test_ok === true && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
            {row?.last_test_ok === false && <AlertCircle className="w-4 h-4 text-amber-500" />}
            {SUPPLIER_LABEL[supplier]}
          </CardTitle>
          <CardDescription>
            {row?.last_test_at ? `Last tested ${fmtDate(row.last_test_at)} — ${row.last_test_message ?? ""}` : "Not tested yet"}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Label htmlFor={`en-${supplier}`}>Enabled</Label>
          <Switch id={`en-${supplier}`} checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SCHEMA[supplier].map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`${supplier}-${f.key}`}>{f.label}</Label>
              {f.type === "checkbox" ? (
                <div className="flex items-center h-9">
                  <Switch checked={Boolean(config[f.key])} onCheckedChange={(v) => setConfig({ ...config, [f.key]: v })} />
                </div>
              ) : (
                <Input
                  id={`${supplier}-${f.key}`}
                  type={f.type ?? "text"}
                  placeholder={f.placeholder}
                  value={String(config[f.key] ?? "")}
                  onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
                />
              )}
              {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}</Button>
          <Button variant="outline" onClick={handleTest} disabled={busy}>Test connection</Button>
        </div>
      </CardContent>
    </Card>
  );
}
