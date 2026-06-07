import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listSyncJobs } from "@/lib/api/importer.functions";
import { Card, CardContent } from "@/components/ui/card";
import { fmtDate, statusTone, supplierLabel } from "@/lib/ui-helpers";

const qo = queryOptions({ queryKey: ["sync-jobs"], queryFn: () => listSyncJobs() });

export const Route = createFileRoute("/_authenticated/sync")({
  head: () => ({ meta: [{ title: "Sync history — Supplier Importer" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(qo),
  component: Page,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
});

function Page() {
  const { data } = useSuspenseQuery(qo);
  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sync history</h1>
        <p className="text-sm text-muted-foreground">Every import and inventory job, newest first.</p>
      </div>
      <Card>
        <CardContent className="p-0">
          {data.rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No jobs yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground bg-muted/50">
                  <tr className="text-left">
                    <th className="p-3">Kind</th><th>Supplier</th><th>Status</th><th>Total</th><th>OK</th><th>Failed</th><th>Started</th><th>Finished</th><th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((j) => (
                    <tr key={j.id} className="border-t align-top">
                      <td className="p-3 capitalize">{j.kind}</td>
                      <td>{supplierLabel(j.supplier)}</td>
                      <td><span className={`px-2 py-0.5 text-xs rounded ${statusTone(j.status)}`}>{j.status}</span></td>
                      <td>{j.items_total}</td>
                      <td>{j.items_ok}</td>
                      <td>{j.items_failed}</td>
                      <td className="text-xs text-muted-foreground">{fmtDate(j.started_at)}</td>
                      <td className="text-xs text-muted-foreground">{fmtDate(j.finished_at)}</td>
                      <td className="text-xs text-muted-foreground max-w-md truncate" title={j.notes ?? ""}>{j.notes}</td>
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
