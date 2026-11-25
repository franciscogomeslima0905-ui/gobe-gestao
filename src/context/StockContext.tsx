import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { recipeBreakdown, type RecipeLineInput } from '../lib/costs';
import { extOf } from '../lib/files';
import { round2, todayISO, uid } from '../lib/format';
import { supabase } from '../lib/supabase';
import { fetchAllRows, useSyncedTable, type AnyRow } from '../lib/useSyncedTable';
import type {
  Expense,
  ExpenseCategory,
  ExpenseMethod,
  Ingredient,
  IngredientCategory,
  Purchase,
  PurchaseDraft,
  PurchaseItem,
  Recipe,
  RecipeItem,
  ShoppingItem,
  StockMovement,
  Unit,
} from '../lib/types';
import { useAuth } from './AuthContext';

const n = (v: unknown) => Number(v) || 0;
const nn = (v: unknown) => (v === null || v === undefined ? null : Number(v));

const normIngredient = (r: AnyRow): Ingredient => ({
  ...(r as unknown as Ingredient),
  stock_qty: n(r.stock_qty),
  min_stock: n(r.min_stock),
  unit_cost: n(r.unit_cost),
  last_purchase_price: nn(r.last_purchase_price),
});
const normRecipe = (r: AnyRow): Recipe => ({ ...(r as unknown as Recipe), yield_pans: n(r.yield_pans), slices_per_pan: n(r.slices_per_pan) });
const normRecipeItem = (r: AnyRow): RecipeItem => ({ ...(r as unknown as RecipeItem), quantity: n(r.quantity) });
const normPurchase = (r: AnyRow): Purchase => ({ ...(r as unknown as Purchase), subtotal: n(r.subtotal), discount: n(r.discount), total: n(r.total) });
const normPurchaseItem = (r: AnyRow): PurchaseItem => ({
  ...(r as unknown as PurchaseItem),
  quantity: n(r.quantity),
  unit_price: n(r.unit_price),
  total: n(r.total),
  stock_qty: n(r.stock_qty),
});
const normExpense = (r: AnyRow): Expense => ({ ...(r as unknown as Expense), amount: n(r.amount) });
const normShopping = (r: AnyRow): ShoppingItem => ({ ...(r as unknown as ShoppingItem), quantity: n(r.quantity), estimated: nn(r.estimated) });
const normMovement = (r: AnyRow): StockMovement => ({
  ...(r as unknown as StockMovement),
  quantity: n(r.quantity),
  unit_cost: nn(r.unit_cost),
  total_cost: nn(r.total_cost),
});

export interface IngredientInput {
  name: string;
  category: IngredientCategory;
  unit: Unit;
  min_stock: number;
  unit_cost: number;
  last_purchase_price: number | null;
  last_purchase_date: string | null;
  supplier: string | null;
  notes: string | null;
  active: boolean;
}

export interface ExpenseInput {
  expense_date: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  supplier: string | null;
  payment_method: ExpenseMethod;
  notes: string | null;
}

export interface StockBackup {
  ingredients: Ingredient[];
  recipes: Recipe[];
  recipe_items: RecipeItem[];
  purchases: Purchase[];
  purchase_items: PurchaseItem[];
  expenses: Expense[];
  stock_movements: StockMovement[];
  shopping_items: ShoppingItem[];
}

export interface StockValue {
  loading: boolean;
  error: string | null;
  ingredients: Ingredient[];
  recipes: Recipe[];
  recipeItems: RecipeItem[];
  purchases: Purchase[];
  purchaseItems: PurchaseItem[];
  expenses: Expense[];
  shoppingItems: ShoppingItem[];
  ingMap: Map<string, Ingredient>;
  /** custo atual da fatia por product_id (só produtos com ficha técnica) */
  sliceCost: Map<string, number>;
  recipeFor: (productId: string) => { recipe: Recipe; items: RecipeItem[] } | undefined;
  saveIngredient: (data: IngredientInput, id?: string, initialQty?: number) => Promise<void>;
  setIngredientActive: (id: string, active: boolean) => Promise<void>;
  adjustStock: (ingredientId: string, newQty: number, notes: string) => Promise<void>;
  fetchMovements: (ingredientId: string) => Promise<StockMovement[]>;
  saveRecipe: (productId: string, header: { yield_pans: number; slices_per_pan: number; notes: string | null }, lines: RecipeLineInput[]) => Promise<void>;
  deleteRecipe: (productId: string) => Promise<void>;
  registerPurchase: (
    draft: PurchaseDraft,
    opts: { source: Purchase['source']; idempotencyKey: string; file?: Blob | null; fileName?: string; fileHash?: string | null },
  ) => Promise<string>;
  deletePurchase: (id: string) => Promise<void>;
  saveExpense: (data: ExpenseInput, id?: string, file?: File | null) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  addShoppingItem: (i: { ingredient_id: string | null; description: string | null; quantity: number; unit: string | null; estimated: number | null }) => Promise<void>;
  removeShoppingItems: (ids: string[]) => Promise<void>;
  receiptUrl: (path: string) => Promise<string | null>;
  restoreStock: (b: Partial<StockBackup>) => Promise<void>;
  reloadAll: () => Promise<void>;
}

const StockContext = createContext<StockValue | null>(null);

export function StockProvider({ children }: { children: ReactNode }) {
  const { session, authorized } = useAuth();
  const enabled = !!session && authorized === true;

  const ing = useSyncedTable('ingredients', normIngredient, enabled);
  const rec = useSyncedTable('recipes', normRecipe, enabled);
  const recItems = useSyncedTable('recipe_items', normRecipeItem, enabled);
  const pur = useSyncedTable('purchases', normPurchase, enabled);
  const purItems = useSyncedTable('purchase_items', normPurchaseItem, enabled);
  const exp = useSyncedTable('expenses', normExpense, enabled);
  const shop = useSyncedTable('shopping_items', normShopping, enabled);

  const all = [ing, rec, recItems, pur, purItems, exp, shop];
  const loading = all.some((t) => !t.loaded);
  const error = all.find((t) => t.error)?.error ?? null;

  const ingredients = useMemo(() => [...ing.rows].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [ing.rows]);
  const ingMap = useMemo(() => new Map(ing.rows.map((i) => [i.id, i])), [ing.rows]);
  const purchases = useMemo(
    () => [...pur.rows].sort((a, b) => b.purchase_date.localeCompare(a.purchase_date) || b.created_at.localeCompare(a.created_at)),
    [pur.rows],
  );
  const expenses = useMemo(
    () => [...exp.rows].sort((a, b) => b.expense_date.localeCompare(a.expense_date) || b.created_at.localeCompare(a.created_at)),
    [exp.rows],
  );

  const recipeFor = useCallback(
    (productId: string) => {
      const recipe = rec.rows.find((r) => r.product_id === productId);
      if (!recipe) return undefined;
      return { recipe, items: recItems.rows.filter((i) => i.recipe_id === recipe.id) };
    },
    [rec.rows, recItems.rows],
  );

  /* custo atual da fatia, recalculado sempre que um preço muda */
  const sliceCost = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rec.rows) {
      const items = recItems.rows.filter((i) => i.recipe_id === r.id);
      m.set(r.product_id, recipeBreakdown(r.yield_pans, r.slices_per_pan, items, ingMap).perSlice);
    }
    return m;
  }, [rec.rows, recItems.rows, ingMap]);

  const reloadAll = useCallback(async () => {
    await Promise.all(all.map((t) => t.load()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ing.load, rec.load, recItems.load, pur.load, purItems.load, exp.load, shop.load]);

  /* ----------------------------- ingredientes ----------------------------- */
  const saveIngredient = useCallback<StockValue['saveIngredient']>(
    async (data, id, initialQty) => {
      const row = { ...data, name: data.name.trim(), supplier: data.supplier?.trim() || null, notes: data.notes?.trim() || null };
      if (id) {
        const { data: d, error } = await supabase.from('ingredients').update(row).eq('id', id).select().single();
        if (error) throw error;
        ing.upsert([d as AnyRow]);
      } else {
        const { data: d, error } = await supabase.from('ingredients').insert(row).select().single();
        if (error) throw error;
        const newId = (d as AnyRow).id as string;
        if (initialQty && initialQty > 0) {
          const { error: e2 } = await supabase.from('stock_movements').insert({
            ingredient_id: newId,
            type: 'ajuste',
            quantity: initialQty,
            unit_cost: data.unit_cost || null,
            total_cost: data.unit_cost ? round2(initialQty * data.unit_cost) : null,
            ref_type: 'manual',
            occurred_at: todayISO(),
            notes: 'Estoque inicial',
          });
          if (e2) throw e2;
        }
        await ing.load();
      }
    },
    [ing],
  );

  const setIngredientActive = useCallback(
    async (id: string, active: boolean) => {
      const { data, error } = await supabase.from('ingredients').update({ active }).eq('id', id).select().single();
      if (error) throw error;
      ing.upsert([data as AnyRow]);
    },
    [ing],
  );

  const adjustStock = useCallback(
    async (ingredientId: string, newQty: number, notes: string) => {
      const cur = ingMap.get(ingredientId);
      if (!cur) return;
      const delta = Math.round((newQty - cur.stock_qty) * 10000) / 10000;
      if (!delta) return;
      const { error } = await supabase.from('stock_movements').insert({
        ingredient_id: ingredientId,
        type: 'ajuste',
        quantity: delta,
        unit_cost: cur.unit_cost || null,
        total_cost: cur.unit_cost ? round2(delta * cur.unit_cost) : null,
        ref_type: 'manual',
        occurred_at: todayISO(),
        notes: notes.trim() || 'Ajuste manual',
      });
      if (error) throw error;
      await ing.load();
    },
    [ing, ingMap],
  );

  const fetchMovements = useCallback(async (ingredientId: string) => {
    const { data, error } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('ingredient_id', ingredientId)
      .order('occurred_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw error;
    return ((data ?? []) as AnyRow[]).map(normMovement);
  }, []);

  /* -------------------------------- receitas ------------------------------ */
  const saveRecipe = useCallback<StockValue['saveRecipe']>(
    async (productId, header, lines) => {
      const { data, error } = await supabase
        .from('recipes')
        .upsert({ product_id: productId, ...header }, { onConflict: 'product_id' })
        .select()
        .single();
      if (error) throw error;
      const recipeId = (data as AnyRow).id as string;
      const { error: delErr } = await supabase.from('recipe_items').delete().eq('recipe_id', recipeId);
      if (delErr) throw delErr;
      if (lines.length) {
        const { error: insErr } = await supabase
          .from('recipe_items')
          .insert(lines.map((l) => ({ recipe_id: recipeId, ingredient_id: l.ingredient_id, quantity: l.quantity, unit: l.unit, scope: l.scope })));
        if (insErr) throw insErr;
      }
      await Promise.all([rec.load(), recItems.load()]);
    },
    [rec, recItems],
  );

  const deleteRecipe = useCallback(
    async (productId: string) => {
      const { error } = await supabase.from('recipes').delete().eq('product_id', productId);
      if (error) throw error;
      await Promise.all([rec.load(), recItems.load()]);
    },
    [rec, recItems],
  );

  /* -------------------------------- compras ------------------------------- */
  const uploadReceipt = async (file: Blob, name = '') => {
    const path = `${new Date().getFullYear()}/${todayISO()}-${uid()}.${extOf(file.type, name)}`;
    const { error } = await supabase.storage.from('comprovantes').upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) throw error;
    return path;
  };

  const registerPurchase = useCallback<StockValue['registerPurchase']>(
    async (draft, opts) => {
      let receiptPath: string | null = null;
      if (opts.file) receiptPath = await uploadReceipt(opts.file, opts.fileName);
      const payload = {
        supplier: draft.supplier,
        purchase_date: draft.purchase_date,
        payment_method: draft.payment_method,
        discount: draft.discount,
        total: draft.total,
        notes: draft.notes,
        category: draft.category,
        source: opts.source,
        receipt_path: receiptPath,
        file_hash: opts.fileHash ?? null,
        idempotency_key: opts.idempotencyKey,
        items: draft.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
          unit_price: l.unit_price,
          total: l.total,
          ingredient_id: l.ingredient_id,
          stock_qty: l.ingredient_id ? l.stock_qty : 0,
          category: l.category,
        })),
      };
      const { data, error } = await supabase.rpc('register_purchase', { p: payload });
      if (error) {
        if (receiptPath) await supabase.storage.from('comprovantes').remove([receiptPath]);
        if (/NOTA_DUPLICADA/.test(error.message)) throw new Error('Esta nota já foi registrada antes. Nada foi lançado em dobro.');
        throw error;
      }
      await Promise.all([pur.load(), purItems.load(), exp.load(), ing.load()]);
      return data as string;
    },
    [pur, purItems, exp, ing],
  );

  const deletePurchase = useCallback(
    async (id: string) => {
      const p = pur.rows.find((x) => x.id === id);
      const { error } = await supabase.rpc('delete_purchase', { p_id: id });
      if (error) throw error;
      if (p?.receipt_path) await supabase.storage.from('comprovantes').remove([p.receipt_path]);
      await Promise.all([pur.load(), purItems.load(), exp.load(), ing.load()]);
    },
    [pur, purItems, exp, ing],
  );

  /* -------------------------------- despesas ------------------------------ */
  const saveExpense = useCallback<StockValue['saveExpense']>(
    async (data, id, file) => {
      const row: Record<string, unknown> = {
        ...data,
        description: data.description.trim(),
        supplier: data.supplier?.trim() || null,
        notes: data.notes?.trim() || null,
        amount: round2(data.amount),
      };
      if (file) row.receipt_path = await uploadReceipt(file, file.name);
      if (id) {
        const { data: d, error } = await supabase.from('expenses').update(row).eq('id', id).select().single();
        if (error) throw error;
        exp.upsert([d as AnyRow]);
      } else {
        const { data: d, error } = await supabase.from('expenses').insert(row).select().single();
        if (error) throw error;
        exp.upsert([d as AnyRow]);
      }
    },
    [exp],
  );

  const deleteExpense = useCallback(
    async (id: string) => {
      const e = exp.rows.find((x) => x.id === id);
      if (e?.purchase_id) throw new Error('Esta despesa veio de uma compra. Exclua a compra em Compras e estoque.');
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
      if (e?.receipt_path) await supabase.storage.from('comprovantes').remove([e.receipt_path]);
      exp.remove([id]);
    },
    [exp],
  );

  /* ---------------------------- lista de compras -------------------------- */
  const addShoppingItem = useCallback<StockValue['addShoppingItem']>(
    async (i) => {
      const { data, error } = await supabase.from('shopping_items').insert(i).select().single();
      if (error) throw error;
      shop.upsert([data as AnyRow]);
    },
    [shop],
  );

  const removeShoppingItems = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from('shopping_items').delete().in('id', ids);
      if (error) throw error;
      shop.remove(ids);
    },
    [shop],
  );

  const receiptUrl = useCallback(async (path: string) => {
    const { data, error } = await supabase.storage.from('comprovantes').createSignedUrl(path, 60 * 30);
    return error ? null : data.signedUrl;
  }, []);

  /* --------------------------------- backup ------------------------------- */
  const restoreStock = useCallback<StockValue['restoreStock']>(
    async (b) => {
      const strip = (rows: AnyRow[] | undefined) => (rows ?? []).map(({ created_by: _c, ...r }) => r);
      const steps: [string, AnyRow[]][] = [
        ['ingredients', strip(b.ingredients as unknown as AnyRow[])],
        ['recipes', strip(b.recipes as unknown as AnyRow[])],
        ['recipe_items', strip(b.recipe_items as unknown as AnyRow[])],
        ['purchases', strip(b.purchases as unknown as AnyRow[])],
        ['purchase_items', strip(b.purchase_items as unknown as AnyRow[])],
        ['expenses', strip(b.expenses as unknown as AnyRow[])],
        ['stock_movements', strip(b.stock_movements as unknown as AnyRow[])],
        ['shopping_items', strip(b.shopping_items as unknown as AnyRow[])],
      ];
      for (const [table, rows] of steps) {
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500), { onConflict: 'id' });
          if (error) throw error;
        }
      }
      const { error } = await supabase.rpc('recalc_stock');
      if (error) throw error;
      await reloadAll();
    },
    [reloadAll],
  );

  const value: StockValue = {
    loading,
    error,
    ingredients,
    recipes: rec.rows,
    recipeItems: recItems.rows,
    purchases,
    purchaseItems: purItems.rows,
    expenses,
    shoppingItems: shop.rows,
    ingMap,
    sliceCost,
    recipeFor,
    saveIngredient,
    setIngredientActive,
    adjustStock,
    fetchMovements,
    saveRecipe,
    deleteRecipe,
    registerPurchase,
    deletePurchase,
    saveExpense,
    deleteExpense,
    addShoppingItem,
    removeShoppingItems,
    receiptUrl,
    restoreStock,
    reloadAll,
  };

  return <StockContext.Provider value={value}>{children}</StockContext.Provider>;
}

/** Backup completo do estoque, incluindo todas as movimentações */
export async function exportStockAsync(s: StockValue): Promise<StockBackup> {
  const movements = (await fetchAllRows('stock_movements')).map(normMovement);
  return {
    ingredients: s.ingredients,
    recipes: s.recipes,
    recipe_items: s.recipeItems,
    purchases: s.purchases,
    purchase_items: s.purchaseItems,
    expenses: s.expenses,
    stock_movements: movements,
    shopping_items: s.shoppingItems,
  };
}

export const useStock = () => {
  const ctx = useContext(StockContext);
  if (!ctx) throw new Error('useStock fora do StockProvider');
  return ctx;
};
