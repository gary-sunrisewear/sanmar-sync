// Shared helpers for dashboard pages.
import { SUPPLIER_LABEL } from "@/lib/suppliers/types";

export function supplierLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return SUPPLIER_LABEL[code as keyof typeof SUPPLIER_LABEL] ?? code;
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString();
}

export function statusTone(s: string): string {
  switch (s) {
    case "success": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    case "partial": return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
    case "failed": return "bg-destructive/15 text-destructive";
    case "running": return "bg-blue-500/15 text-blue-700 dark:text-blue-400";
    default: return "bg-muted text-muted-foreground";
  }
}
