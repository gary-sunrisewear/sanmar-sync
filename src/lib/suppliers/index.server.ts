// Unified supplier dispatcher. Server-only.

import { feedGetInventory, feedGetProduct, feedSearchStyles, feedTest } from "./feed.server";
import { sanmarGetInventory, sanmarGetProduct, sanmarSearchStyles, sanmarTest } from "./sanmar.server";
import { ssGetInventory, ssGetProduct, ssSearchStyles, ssTest } from "./ssactivewear.server";
import type { SupplierCode, SupplierCredConfig, SupplierInventoryRow, SupplierProduct } from "./types";

export async function testSupplier(supplier: SupplierCode, cfg: SupplierCredConfig) {
  switch (supplier) {
    case "ssactivewear": return ssTest(cfg);
    case "sanmar": return sanmarTest(cfg);
    case "ascolour":
    case "ottocap": return feedTest(cfg);
  }
}

export async function searchSupplierStyles(supplier: SupplierCode, cfg: SupplierCredConfig, q: string) {
  switch (supplier) {
    case "ssactivewear": return ssSearchStyles(cfg, q);
    case "sanmar": return sanmarSearchStyles(cfg, q);
    case "ascolour":
    case "ottocap": return feedSearchStyles(cfg, q);
  }
}

export async function getSupplierProduct(supplier: SupplierCode, cfg: SupplierCredConfig, styleId: string): Promise<SupplierProduct> {
  switch (supplier) {
    case "ssactivewear": return ssGetProduct(cfg, styleId);
    case "sanmar": return sanmarGetProduct(cfg, styleId);
    case "ascolour":
    case "ottocap": return feedGetProduct(cfg, supplier, styleId);
  }
}

export async function getSupplierInventory(supplier: SupplierCode, cfg: SupplierCredConfig, skus: string[]): Promise<SupplierInventoryRow[]> {
  switch (supplier) {
    case "ssactivewear": return ssGetInventory(cfg, skus);
    case "sanmar": return sanmarGetInventory(cfg, skus);
    case "ascolour":
    case "ottocap": return feedGetInventory(cfg, skus);
  }
}
