import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { deleteMarkupRule, listMarkupRules, saveMarkupRule } from "@/lib/api/importer.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { toast } from "sonner";
import { SUPPLIER_LABEL, type SupplierCode } from "@/lib/suppliers/types";
import { Trash2, Plus } from "lucide-react";

interface Rule {
  id?: string;
  supplier: SupplierCode | null;
  match_field: "vendor" | "category" | "brand" | null;
  match_value: string | null;
  multiplier: number;
  flat_add: number;
  round_to: number;
  charm_pricing: boolean;
  priority: number;
}

const qo = queryOptions({ queryKey: ["markup-rules"], queryFn: () => listMarkupRules() });

export const Route = createFileRoute("/_authenticated/markup")({
  head: () => ({ meta: [{ title: "Markup rules — Supplier Importer" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(qo),
  component: Page,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
});

const blank: Rule = { supplier: null, match_field: null, match_value: null, multiplier: 2, flat_add: 0, round_to: 0.01, charm_pricing: false, priority: 0 };

function Page() {
  const { data } = useSuspenseQuery(qo);
  const qc = useQueryClient();
  const save = useServerFn(saveMarkupRule);
  const del = useServerFn(deleteMarkupRule);
  const [draft, setDraft] = useState<Rule>(blank);

  const handleSave = async (rule: Rule) => {
    try {
      await save({ data: rule as never });
      toast.success("Saved");
      setDraft(blank);
      qc.invalidateQueries({ queryKey: ["markup-rules"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };
  const handleDelete = async (id: string) => {
    try {
      await del({ data: { id } });
      qc.invalidateQueries({ queryKey: ["markup-rules"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Markup rules</h1>
        <p className="text-sm text-muted-foreground">
          Formula: <span className="font-mono">price = round(cost × multiplier + flat, round_to)</span>; subtract $0.01 when charm pricing is on.
          Most specific match wins (match_field &gt; supplier &gt; global), then higher priority.
        </p>
      </div>

      <RuleForm value={draft} onChange={setDraft} onSave={handleSave} submitLabel="Add rule" icon={<Plus className="w-4 h-4 mr-1" />} />

      <Card>
        <CardHeader><CardTitle className="text-base">Existing rules</CardTitle></CardHeader>
        <CardContent>
          {data.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rules yet — a default multiplier of 2.0 is used.</p>
          ) : (
            <div className="space-y-3">
              {data.rows.map((r) => (
                <ExistingRule key={r.id} rule={r as unknown as Rule} onSave={handleSave} onDelete={() => handleDelete(r.id)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ExistingRule({ rule, onSave, onDelete }: { rule: Rule; onSave: (r: Rule) => void; onDelete: () => void }) {
  const [r, setR] = useState(rule);
  return (
    <div className="border rounded-lg p-3">
      <RuleForm value={r} onChange={setR} onSave={onSave} submitLabel="Save" />
      <div className="flex justify-end -mt-10 mr-2 relative">
        <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="w-4 h-4 text-destructive" /></Button>
      </div>
    </div>
  );
}

function RuleForm({ value, onChange, onSave, submitLabel, icon }: { value: Rule; onChange: (r: Rule) => void; onSave: (r: Rule) => void; submitLabel: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <div className="space-y-1.5">
          <Label>Supplier</Label>
          <Select value={value.supplier ?? "all"} onValueChange={(v) => onChange({ ...value, supplier: v === "all" ? null : (v as SupplierCode) })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {(Object.keys(SUPPLIER_LABEL) as SupplierCode[]).map((s) => <SelectItem key={s} value={s}>{SUPPLIER_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Match field</Label>
          <Select value={value.match_field ?? "any"} onValueChange={(v) => onChange({ ...value, match_field: v === "any" ? null : (v as Rule["match_field"]) })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="vendor">Vendor</SelectItem>
              <SelectItem value="brand">Brand</SelectItem>
              <SelectItem value="category">Category</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label>Match value</Label>
          <Input value={value.match_value ?? ""} onChange={(e) => onChange({ ...value, match_value: e.target.value || null })} placeholder="e.g. Port Authority" />
        </div>
        <div className="space-y-1.5">
          <Label>Multiplier</Label>
          <Input type="number" step="0.01" min="0.1" value={value.multiplier} onChange={(e) => onChange({ ...value, multiplier: Number(e.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label>Flat add ($)</Label>
          <Input type="number" step="0.01" value={value.flat_add} onChange={(e) => onChange({ ...value, flat_add: Number(e.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label>Round to</Label>
          <Input type="number" step="0.01" min="0.01" value={value.round_to} onChange={(e) => onChange({ ...value, round_to: Number(e.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Input type="number" min="0" value={value.priority} onChange={(e) => onChange({ ...value, priority: Number(e.target.value) })} />
        </div>
        <div className="flex items-center gap-2 col-span-2">
          <Switch checked={value.charm_pricing} onCheckedChange={(v) => onChange({ ...value, charm_pricing: v })} />
          <Label>Charm pricing (−$0.01)</Label>
        </div>
        <div className="col-span-2 flex justify-end">
          <Button onClick={() => onSave(value)}>{icon}{submitLabel}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
