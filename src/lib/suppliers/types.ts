// Common supplier types (client-safe).

export type SupplierCode = "sanmar" | "ssactivewear" | "ascolour" | "ottocap";

export const SUPPLIER_LABEL: Record<SupplierCode, string> = {
  sanmar: "SanMar",
  ssactivewear: "S&S Activewear",
  ascolour: "AS Colour",
  ottocap: "Otto Cap",
};

export interface SupplierVariant {
  sku: string;
  size: string | null;
  color: string | null;
  cost: number;
  qty: number;
  image?: string | null;
  barcode?: string | null;
  weight_grams?: number | null;
}

export interface SupplierProduct {
  supplier: SupplierCode;
  style_id: string;
  title: string;
  description?: string | null;
  vendor?: string | null;
  brand?: string | null;
  category?: string | null;
  images: string[];
  variants: SupplierVariant[];
}

export interface SupplierInventoryRow {
  sku: string;
  qty: number;
  cost?: number | null;
}

export interface SupplierCredConfig {
  // Free-form per supplier. Documented per module.
  [k: string]: string | number | boolean | null | undefined;
}
