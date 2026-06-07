import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getMyRoles } from "@/lib/api/importer.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";

const rolesQO = queryOptions({ queryKey: ["my-roles"], queryFn: () => getMyRoles() });

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Supplier Importer" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(rolesQO),
  component: Page,
});

function Page() {
  const { data } = useSuspenseQuery(rolesQO);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const cronUrl = origin ? `${origin}/api/public/cron/inventory-sync` : "";
  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Your account, role, and the cron endpoint for scheduled inventory sync.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Your roles</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {data.roles.length === 0 && <span className="text-sm text-muted-foreground">none</span>}
            {data.roles.map((r) => <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>{r}</Badge>)}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            The first account to sign up becomes admin automatically. Admins can edit credentials and markup rules.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Scheduled inventory sync</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Point any scheduler (pg_cron, EasyCron, GitHub Actions) at this URL hourly. Use the Supabase publishable / anon key as the <code className="font-mono">apikey</code> header.
            Append <code className="font-mono">?price=1</code> to also re-price using current cost + markup rules.
          </p>
          <div className="flex gap-2">
            <code className="flex-1 text-xs font-mono bg-muted rounded px-2 py-1 break-all">{cronUrl}</code>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(cronUrl); toast.success("Copied"); }}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Example pg_cron job (run in Supabase SQL editor):
          </p>
          <pre className="text-xs font-mono bg-muted rounded p-2 overflow-x-auto">{`select cron.schedule(
  'inventory-sync-hourly',
  '0 * * * *',
  $$ select net.http_post(
    url := '${cronUrl}',
    headers := jsonb_build_object('Content-Type','application/json','apikey','<YOUR_ANON_KEY>'),
    body := '{}'::jsonb
  ); $$
);`}</pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Shopify store</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm">Connected store: <span className="font-mono">sunrisetester.myshopify.com</span></p>
          <Button variant="outline" size="sm" asChild className="mt-3">
            <a href="https://admin.shopify.com" target="_blank" rel="noopener noreferrer">
              Open Shopify admin <ExternalLink className="w-3.5 h-3.5 ml-1" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
