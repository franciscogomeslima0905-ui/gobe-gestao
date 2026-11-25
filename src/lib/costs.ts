import { round2 } from './format';
import type {
  ExpenseCategory,
  ExpenseMethod,
  Ingredient,
  IngredientCategory,
  OrderFull,
  Product,
  Recipe,
  RecipeItem,
  Unit,
} from './types';

/* ------------------------------- unidades -------------------------------- */
export const UNITS: Record<Unit, { label: string; dim: 'massa' | 'volume' | 'un'; f: number }> = {
  g: { label: 'g', dim: 'massa', f: 1 },
  kg: { label: 'kg', dim: 'massa', f: 1000 },
  ml: { label: 'ml', dim: 'volume', f: 1 },
  l: { label: 'L', dim: 'volume', f: 1000 },
  un: { label: 'un', dim: 'un', f: 1 },
};

export const compatibleUnits = (u: Unit): Unit[] => (Object.keys(UNITS) as Unit[]).filter((x) => UNITS[x].dim === UNITS[u].dim);

/** Converte quantidade entre unidades compatíveis (null se incompatíveis) */
export const convert = (qty: number, from: Unit, to: Unit): number | null =>
  UNITS[from].dim === UNITS[to].dim ? (qty * UNITS[from].f) / UNITS[to].f : null;

export const fmtQty = (q: number, unit: Unit | string) => {
  const digits = unit === 'un' ? 0 : Math.abs(q) < 10 ? 3 : 2;
  const v = Number(q.toFixed(digits));
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: digits })} ${UNITS[unit as Unit]?.label ?? unit}`;
};

/** Custo formatado por unidade, com equivalente por kg/g quando faz sentido */
export const fmtUnitCost = (cost: number, unit: Unit) => {
  const brl = (n: number, d = 2) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: d, maximumFractionDigits: d });
  if (unit === 'kg') return `${brl(cost)}/kg · ${brl(cost / 1000, 4)}/g`;
  if (unit === 'g') return `${brl(cost, 4)}/g · ${brl(cost * 1000)}/kg`;
  if (unit === 'l') return `${brl(cost)}/L · ${brl(cost / 1000, 4)}/ml`;
  if (unit === 'ml') return `${brl(cost, 4)}/ml · ${brl(cost * 1000)}/L`;
  return `${brl(cost)}/un`;
};

/* ------------------------------- categorias ------------------------------ */
export const INGREDIENT_CATEGORY_LABEL: Record<IngredientCategory, string> = {
  ingrediente: 'Ingrediente',
  embalagem: 'Embalagem',
  adesivo: 'Adesivo',
  outro: 'Outro material',
};

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  ingredientes: 'Ingredientes',
  embalagens: 'Embalagens',
  adesivos: 'Adesivos',
  transporte: 'Transporte e entregas',
  energia: 'Energia elétrica',
  agua: 'Água',
  gas: 'Gás',
  marketing: 'Marketing e publicidade',
  equipamentos: 'Equipamentos',
  outras: 'Outras despesas',
};

export const EXPENSE_METHOD_LABEL: Record<ExpenseMethod, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao_debito: 'Cartão de débito',
  cartao_credito: 'Cartão de crédito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  outro: 'Outro',
};

export const categoryForIngredient = (c: IngredientCategory): ExpenseCategory =>
  c === 'ingrediente' ? 'ingredientes' : c === 'embalagem' ? 'embalagens' : c === 'adesivo' ? 'adesivos' : 'outras';

/**
 * Categorias que viram estoque. Elas entram no lucro pelo consumo
 * (custo das fatias vendidas), e não pela compra, para não duplicar custos.
 */
export const INVENTORY_CATEGORIES: ExpenseCategory[] = ['ingredientes', 'embalagens', 'adesivos'];

/* ---------------------------- situação do estoque ------------------------ */
export type StockLevel = 'ok' | 'baixo' | 'esgotado';
export const stockLevel = (i: Ingredient): StockLevel =>
  i.stock_qty <= 0.0001 ? 'esgotado' : i.stock_qty <= i.min_stock ? 'baixo' : 'ok';

export const STOCK_META: Record<StockLevel, { label: string; badge: string; dot: string }> = {
  ok: { label: 'Suficiente', badge: 'bg-emerald-100 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' },
  baixo: { label: 'Estoque baixo', badge: 'bg-amber-100 text-amber-800 ring-amber-200', dot: 'bg-amber-400' },
  esgotado: { label: 'Esgotado', badge: 'bg-red-100 text-red-700 ring-red-200', dot: 'bg-red-500' },
};

/* ---------------------------- ficha técnica ------------------------------ */
export interface RecipeLineInput {
  ingredient_id: string;
  quantity: number;
  unit: Unit;
  scope: 'receita' | 'fatia';
}

export interface RecipeBreakdown {
  yieldSlices: number;
  ingredientsCost: number;
  packagingPerSlice: number;
  packagingCost: number;
  total: number;
  perSlice: number;
  lines: (RecipeLineInput & { cost: number; ingredient?: Ingredient })[];
  missingCost: string[];
}

/** Mesmo cálculo da função slice_cost() do banco */
export function recipeBreakdown(
  yieldPans: number,
  slicesPerPan: number,
  lines: RecipeLineInput[],
  ingMap: Map<string, Ingredient>,
): RecipeBreakdown {
  const yieldSlices = Math.max(0, yieldPans * slicesPerPan);
  let ingredientsCost = 0;
  let packagingPerSlice = 0;
  const missingCost: string[] = [];
  const out = lines.map((l) => {
    const ing = ingMap.get(l.ingredient_id);
    const qty = ing ? convert(l.quantity, l.unit, ing.unit) ?? 0 : 0;
    const cost = ing ? qty * ing.unit_cost : 0;
    if (ing && !ing.unit_cost) missingCost.push(ing.name);
    if (l.scope === 'fatia') packagingPerSlice += cost;
    else ingredientsCost += cost;
    return { ...l, cost, ingredient: ing };
  });
  const packagingCost = packagingPerSlice * yieldSlices;
  const total = ingredientsCost + packagingCost;
  return {
    yieldSlices,
    ingredientsCost,
    packagingPerSlice,
    packagingCost,
    total,
    perSlice: yieldSlices ? total / yieldSlices : 0,
    lines: out,
    missingCost,
  };
}

/** Quanto de cada ingrediente uma fatia consome (na unidade do ingrediente) */
export function perSliceUsage(recipe: Recipe, items: RecipeItem[], ingMap: Map<string, Ingredient>) {
  const y = recipe.yield_pans * recipe.slices_per_pan;
  const usage = new Map<string, number>();
  for (const it of items) {
    const ing = ingMap.get(it.ingredient_id);
    if (!ing || !y) continue;
    const q = convert(it.quantity, it.unit, ing.unit) ?? 0;
    usage.set(ing.id, (usage.get(ing.id) ?? 0) + (it.scope === 'receita' ? q / y : q));
  }
  return usage;
}

/** Custo de uma fatia que vale para o lucro: o congelado no pedido ou o atual */
export const itemSliceCost = (item: { unit_cost: number | null; product_id: string | null }, current: Map<string, number>) =>
  item.unit_cost ?? (item.product_id ? current.get(item.product_id) ?? null : null);

/* -------------------------------- lucro ---------------------------------- */
export interface ProductProfit {
  key: string;
  label: string;
  product_id: string | null;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  price: number;
  costPerSlice: number | null;
  profitPerSlice: number | null;
  margin: number | null;
  noRecipe: boolean;
}

export function profitByProduct(
  orders: OrderFull[],
  currentCost: Map<string, number>,
  products: Product[],
  label: (name: string, flavor: string | null) => string,
): ProductProfit[] {
  const map = new Map<string, ProductProfit>();
  for (const o of orders) {
    if (o.cancelled) continue;
    // desconto do pedido rateado entre os itens (taxa de entrega não é receita de produto)
    const factor = o.subtotal > 0 ? Math.max(0, o.subtotal - o.discount) / o.subtotal : 1;
    for (const i of o.items) {
      const key = i.product_id ?? `${i.product_name}||${i.flavor ?? ''}`;
      const sc = itemSliceCost(i, currentCost);
      const cur =
        map.get(key) ??
        ({
          key,
          label: label(i.product_name, i.flavor),
          product_id: i.product_id,
          qty: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          price: 0,
          costPerSlice: null,
          profitPerSlice: null,
          margin: null,
          noRecipe: false,
        } as ProductProfit);
      cur.qty += i.quantity;
      cur.revenue += i.quantity * i.unit_price * factor;
      if (sc === null) cur.noRecipe = true;
      else cur.cost += i.quantity * sc;
      map.set(key, cur);
    }
  }
  return Array.from(map.values()).map((p) => {
    const product = products.find((x) => x.id === p.product_id);
    const price = product?.price ?? (p.qty ? p.revenue / p.qty : 0);
    const costPerSlice = p.product_id && currentCost.has(p.product_id) ? currentCost.get(p.product_id)! : p.qty && !p.noRecipe ? p.cost / p.qty : null;
    const profit = p.revenue - p.cost;
    return {
      ...p,
      revenue: round2(p.revenue),
      cost: round2(p.cost),
      profit: round2(profit),
      price,
      costPerSlice,
      profitPerSlice: costPerSlice === null ? null : price - costPerSlice,
      margin: p.revenue > 0 && !p.noRecipe ? profit / p.revenue : costPerSlice !== null && price ? (price - costPerSlice) / price : null,
    };
  });
}

/** Custo dos produtos vendidos (fatias × custo por fatia) */
export function costOfGoodsSold(orders: OrderFull[], currentCost: Map<string, number>) {
  let cost = 0;
  let slicesWithoutRecipe = 0;
  for (const o of orders) {
    if (o.cancelled) continue;
    for (const i of o.items) {
      const sc = itemSliceCost(i, currentCost);
      if (sc === null) slicesWithoutRecipe += i.quantity;
      else cost += sc * i.quantity;
    }
  }
  return { cost: round2(cost), slicesWithoutRecipe };
}
