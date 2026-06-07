import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { importProduct, previewSupplierProduct, searchSupplierProducts } from "@/lib/api/importer.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Search, ImageOff } from "lucide-react";
import { SUPPLIER_LABEL, type SupplierCode } from "@/lib/suppliers/types";

interface SearchResult { style_id: string; name: string; brand: string; image: string | null }
interface PreviewVariant { sku: string; size: string | null; color: string | null; cost: number; qty: number; price: number }
interface Preview { style_id: string; title: string; vendor?: string | null; brand?: string | null; category?: string | null; images: string[]; variants: PreviewVariant[] }

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Import — Supplier Importer" }] }),
  component: Page,
});

function Page() {
  const [supplier, setSupplier] = useState<SupplierCode>("ssactivewear");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const searchFn = useServerFn(searchSupplierProducts);
  const previewFn = useServerFn(previewSupplierProduct);
  const importFn = useServerFn(importProduct);

  const doSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setSearching(true);
    setPreview(null);
    try {
      const r = await searchFn({ data: { supplier, q } });
      setResults(r.results as SearchResult[]);
      if (!r.results.length) toast.message("No results");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const loadPreview = async (style_id: string) => {
    setPreview(null);
    try {
      const r = await previewFn({ data: { supplier, style_id } });
      setPreview(r.product as Preview);
      setSelected(new Set((r.product as Preview).variants.map((v) => v.sku)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    }
  };

  const doImport = async () => {
    if (!preview) return;
    setImporting(true);
    try {
      const r = await importFn({
        data: { supplier, style_id: preview.style_id, title: preview.title, sku_filter: Array.from(selected) },
      });
      toast.success(`Imported ${r.variants} variants to Shopify`);
      setPreview(null);
      setResults([]);
      setQ("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const totalSelected = selected.size;
  const totalCost = preview ? preview.variants.filter((v) => selected.has(v.sku)).reduce((s, v) => s + v.cost * (v.qty || 0), 0) : 0;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import products</h1>
        <p className="text-sm text-muted-foreground">Search a supplier's catalog, preview cost & markup, then push to Shopify.</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={doSearch} className="flex flex-col sm:flex-row gap-2 items-end">
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Select value={supplier} onValueChange={(v) => setSupplier(v as SupplierCode)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SUPPLIER_LABEL) as SupplierCode[]).map((s) => (
                    <SelectItem key={s} value={s}>{SUPPLIER_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="q">Style # or keyword</Label>
              <Input id="q" placeholder="e.g. PC54, 18500, 5050" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Button type="submit" disabled={searching}>{searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Search className="w-4 h-4 mr-2" />Search</>}</Button>
          </form>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Results</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {results.map((r) => (
                <button key={r.style_id} onClick={() => loadPreview(r.style_id)} className="text-left border rounded-lg p-3 hover:bg-accent flex gap-3 items-start">
                  <div className="w-16 h-16 bg-muted rounded overflow-hidden flex items-center justify-center shrink-0">
                    {r.image ? <img src={r.image} alt="" className="w-full h-full object-cover" /> : <ImageOff className="w-6 h-6 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm line-clamp-2">{r.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{r.brand} · {r.style_id}</div>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{preview.title}</CardTitle>
            <p className="text-xs text-muted-foreground">{preview.vendor} · {preview.category}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.images.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {preview.images.slice(0, 6).map((src) => (
                  <img key={src} src={src} alt="" className="w-20 h-20 object-cover rounded border" />
                ))}
              </div>
            )}
            <div className="overflow-x-auto border rounded">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground bg-muted/50">
                  <tr className="text-left">
                    <th className="p-2 w-8"></th>
                    <th className="p-2">SKU</th><th>Color</th><th>Size</th>
                    <th className="text-right">Cost</th><th className="text-right">Sell</th><th className="text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.variants.map((v) => (
                    <tr key={v.sku} className="border-t">
                      <td className="p-2">
                        <Checkbox checked={selected.has(v.sku)} onCheckedChange={(c) => {
                          const next = new Set(selected);
                          c ? next.add(v.sku) : next.delete(v.sku);
                          setSelected(next);
                        }} />
                      </td>
                      <td className="p-2 font-mono text-xs">{v.sku}</td>
                      <td>{v.color ?? "—"}</td>
                      <td>{v.size ?? "—"}</td>
                      <td className="text-right">${v.cost.toFixed(2)}</td>
                      <td className="text-right font-medium">${v.price.toFixed(2)}</td>
                      <td className={`text-right ${v.qty === 0 ? "text-muted-foreground" : ""}`}>{v.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                {totalSelected} of {preview.variants.length} variants selected — total inventory cost ${totalCost.toFixed(2)}
              </div>
              <Button onClick={doImport} disabled={importing || totalSelected === 0}>
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : `Import to Shopify (${totalSelected})`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
