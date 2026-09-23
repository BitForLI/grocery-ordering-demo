export interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
  unit: string;
  unitPriceOptionsJson?: string;
  unitPriceOptions?: { unit: string; price: number }[];
  imageUrl?: string;
  isActive?: boolean;
  wasPrice?: number;
  discountLabel?: string; // "Special" | "30% Off" etc.
  isWeighingRequired?: boolean;
  defaultExpectedWeightKg?: number;
  description?: string;
}

export const WEIGHT_STEP_KG = 0.25;
export const WEIGHT_MIN_KG = 0.05;

/** Shared width and gap values for the home catalogue. */
export const HOME_CONTENT_MAX = 'min(1400px, 100%)';
export const GRID_GAP = 'clamp(6px, 1.8vw, 22px)';

export function defaultEstKgForProduct(p: Pick<Product, 'defaultExpectedWeightKg'>): number {
  const d = Number(p.defaultExpectedWeightKg ?? 0);
  return Number.isFinite(d) && d > 0 ? Math.round(d * 1000) / 1000 : 1;
}

export function parseUnitPriceOptions(p: Record<string, unknown>): { unit: string; price: number }[] {
  const fallback = [{ unit: String(p.unit ?? p.Unit ?? 'ea'), price: Number(p.price ?? p.Price ?? 0) }];
  const raw = p.unitPriceOptionsJson ?? p.UnitPriceOptionsJson;
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    const list = Array.isArray(parsed)
      ? parsed
          .map((x) => ({ unit: String(x.unit ?? x.Unit ?? '').trim(), price: Number(x.price ?? x.Price ?? 0) }))
          .filter((x) => x.unit && Number.isFinite(x.price) && x.price > 0)
      : [];
    return list.length > 0 ? list : fallback;
  } catch {
    return fallback;
  }
}

/** 名称、分类、单位是否同时包含所有分词（不区分大小写） */
export function productMatchesSearchKeyword(p: Product, rawKeyword: string): boolean {
  const keyword = rawKeyword.trim().toLowerCase();
  if (!keyword) return true;
  const nameLower = p.name.toLowerCase();
  const categoryLower = (p.category ?? '').toLowerCase();
  const unitLower = (p.unit ?? '').toLowerCase();
  const words = keyword.split(/\s+/).filter(Boolean);
  return words.every(
    (w) => nameLower.includes(w) || categoryLower.includes(w) || unitLower.includes(w)
  );
}

/** Aligned with admin product categories; empty value = all products */

export function pickSpecialStripProducts(list: Product[]): Product[] {
  const active = list.filter((p) => p.isActive !== false);
  const special = active.filter((p) => (p.category ?? '').trim().toLowerCase() === 'special');
  const eligible = special.length > 0 ? special : active;
  return [...eligible]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .slice(0, 5)
    .map((p) => ({
      ...p,
      discountLabel: 'Special',
    }));
}
