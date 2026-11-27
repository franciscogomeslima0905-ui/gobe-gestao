import { AlertTriangle, CheckCheck, ClipboardList, Download, Plus, Printer, ShoppingCart, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PeriodFilter, { defaultPeriod } from '../components/PeriodFilter';
import PurchaseForm, { emptyPurchaseDraft, newLine } from '../components/PurchaseForm';
import { Button, Card, Checkbox, EmptyState, Field, IconButton, Input, Modal, MoneyInput, PageHeader, Select, StatCard, cx } from '../components/ui';
import { useData } from '../context/DataContext';
import { useStock } from '../context/StockContext';
import { errorMessage, useUI } from '../context/UIContext';
import { productLabel } from '../lib/calc';
import { UNITS, categoryForIngredient, fmtQty, perSliceUsage } from '../lib/costs';
import { exportCSV } from '../lib/export';
import { brl, capFirst, round2 } from '../lib/format';
import { getRange, rangeLabel, type PeriodState } from '../lib/period';
import { ordersIn } from '../lib/stats';
import type { Ingredient, PurchaseDraft } from '../lib/types';

interface Row {
  key: string;
  ingredient?: Ingredient;
  manualId?: string;
  name: string;
  unit: string;
  need: number;
  available: number;
  missing: number;
  unitCost: number;
  estimated: number;
}

export default function ShoppingList() {
  const { orders } = useData();
  const { ingredients, ingMap, recipeFor, shoppingItems, removeShoppingItems } = useStock();
  const { toast, confirm } = useUI();
  const [period, setPeriod] = useState<PeriodState>(defaultPeriod('semana'));
  const [withMin, setWithMin] = useState(true);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [bought, setBought] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState(false);
  const [finishing, setFinishing] = useState<PurchaseDraft | null>(null);
  const range = getRange(period);

  /* necessidade de ingredientes a partir das fatias ainda não produzidas */
  const { needs, noRecipe, pendingSlices } = useMemo(() => {
    const needs = new Map<string, number>();
    const noRecipe = new Map<string, number>();
    let pendingSlices = 0;
    const usageCache = new Map<string, Map<string, number> | null>();
    for (const o of ordersIn(orders, range)) {
      if (o.cancelled || o.delivery_status === 'entregue') continue;
      for (const it of o.items) {
        const pending = it.quantity - it.produced_qty;
        if (pending <= 0) continue;
        pendingSlices += pending;
        const pid = it.product_id ?? '';
        if (!usageCache.has(pid)) {
          const r = pid ? recipeFor(pid) : undefined;
          usageCache.set(pid, r ? perSliceUsage(r.recipe, r.items, ingMap) : null);
        }
        const usage = usageCache.get(pid);
        if (!usage) {
          const label = productLabel(it.product_name, it.flavor);
          noRecipe.set(label, (noRecipe.get(label) ?? 0) + pending);
          continue;
        }
        usage.forEach((q, ingId) => needs.set(ingId, (needs.get(ingId) ?? 0) + q * pending));
      }
    }
    return { needs, noRecipe, pendingSlices };
  }, [orders, range.start, range.end, recipeFor, ingMap]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const i of ingredients) {
      if (!i.active) continue;
      const need = needs.get(i.id) ?? 0;
      const target = need + (withMin ? i.min_stock : 0);
      if (target <= 0) continue;
      const available = Math.max(0, i.stock_qty);
      const missing = Math.max(0, target - available);
      if (onlyMissing && missing <= 0.0001) continue;
      out.push({ key: `ing:${i.id}`, ingredient: i, name: i.name, unit: i.unit, need, available, missing, unitCost: i.unit_cost, estimated: round2(missing * i.unit_cost) });
    }
    for (const s of shoppingItems) {
      const ing = s.ingredient_id ? ingMap.get(s.ingredient_id) : undefined;
      out.push({
        key: `man:${s.id}`,
        manualId: s.id,
        ingredient: ing,
        name: ing?.name ?? s.description ?? 'Item',
        unit: ing?.unit ?? s.unit ?? 'un',
        need: s.quantity,
        available: ing ? Math.max(0, ing.stock_qty) : 0,
        missing: s.quantity,
        unitCost: ing?.unit_cost ?? (s.estimated && s.quantity ? s.estimated / s.quantity : 0),
        estimated: s.estimated ?? round2(s.quantity * (ing?.unit_cost ?? 0)),
      });
    }
    return out.sort((a, b) => Number(!!a.manualId) - Number(!!b.manualId) || b.estimated - a.estimated);
  }, [ingredients, needs, withMin, onlyMissing, shoppingItems, ingMap]);

  const qtyOf = (r: Row) => bought[r.key] ?? Number(r.missing.toFixed(r.unit === 'un' ? 0 : 3));
  const totalEstimated = rows.reduce((s, r) => s + r.estimated, 0);
  const checkedRows = rows.filter((r) => checked.has(r.key));

  const toggle = (key: string, v: boolean) =>
    setChecked((s) => {
      const n = new Set(s);
      if (v) n.add(key);
      else n.delete(key);
      return n;
    });

  const finish = () => {
    if (!checkedRows.length) return toast('Marque os itens comprados.', 'error');
    setFinishing({
      ...emptyPurchaseDraft(),
      notes: `Lista de compras · ${rangeLabel(period)}`,
      lines: checkedRows.map((r) => {
        const q = qtyOf(r);
        return newLine({
          description: r.name,
          quantity: q,
          unit: (UNITS[r.unit as keyof typeof UNITS]?.label ?? r.unit).toUpperCase(),
          unit_price: round2(r.unitCost),
          total: round2(q * r.unitCost),
          ingredient_id: r.ingredient?.id ?? null,
          stock_qty: r.ingredient ? q : 0,
          category: r.ingredient ? categoryForIngredient(r.ingredient.category) : 'outras',
        });
      }),
    });
  };

  const onFinished = async () => {
    const manualIds = checkedRows.map((r) => r.manualId).filter((x): x is string => !!x);
    try {
      await removeShoppingItems(manualIds);
    } catch {
      /* itens manuais podem ser removidos depois */
    }
    setChecked(new Set());
    setBought({});
    setFinishing(null);
  };

  const removeManual = async (id: string) => {
    const r = await confirm({ title: 'Remover item da lista?', message: 'O item manual será removido da lista de compras.', confirmLabel: 'Remover' });
    if (!r.ok) return;
    try {
      await removeShoppingItems([id]);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <PageHeader
          title="Lista de compras"
          subtitle="Calculada a partir dos pedidos ainda não produzidos, das fichas técnicas e do estoque atual."
          actions={
            <>
              <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
                Imprimir
              </Button>
              <Button
                variant="secondary"
                icon={Download}
                onClick={() =>
                  exportCSV(
                    rows.map((r) => ({
                      Item: r.name,
                      'Necessário': round2(r.need),
                      'Disponível': round2(r.available),
                      'Falta comprar': round2(r.missing),
                      Unidade: r.unit,
                      'Valor estimado': r.estimated,
                    })),
                    `lista-de-compras-${range.start}`,
                  )
                }
              >
                CSV
              </Button>
              <Button icon={Plus} onClick={() => setAdding(true)}>
                Item manual
              </Button>
            </>
          }
        />
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/60 p-3 ring-1 ring-bordo/5">
          <PeriodFilter value={period} onChange={setPeriod} />
          <div className="flex flex-wrap gap-4">
            <Checkbox checked={withMin} onChange={setWithMin} label={<span className="text-xs font-semibold">Repor até o estoque mínimo</span>} />
            <Checkbox checked={onlyMissing} onChange={setOnlyMissing} label={<span className="text-xs font-semibold">Só o que falta</span>} />
          </div>
        </div>
      </div>

      <div className="print-only">
        <h1 className="font-display text-2xl font-semibold">Lista de compras · GB GOBÊ</h1>
        <p className="text-sm">{capFirst(rangeLabel(period))}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Fatias a produzir" value={pendingSlices} icon={ClipboardList} tone="bordo" hint="No período, ainda não produzidas" />
        <StatCard label="Itens na lista" value={rows.length} icon={ShoppingCart} tone="cereja" />
        <StatCard label="Marcados como comprados" value={checkedRows.length} icon={CheckCheck} tone="verde" />
        <StatCard label="Valor estimado" value={brl(totalEstimated)} icon={ShoppingCart} tone="rosa" hint="Pelo custo da última compra" />
      </div>

      {noRecipe.size > 0 && (
        <div className="flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Sem ficha técnica, não dá para calcular os ingredientes de:{' '}
            <b>{Array.from(noRecipe.entries()).map(([k, v]) => `${k} (${v} fatias)`).join(', ')}</b>.{' '}
            <Link to="/receitas" className="font-semibold underline">
              Cadastrar receitas
            </Link>
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="Nada para comprar" text="O estoque cobre os pedidos do período. Você pode adicionar itens manualmente." />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-bordo/5">
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-bordo/5 bg-creme-50 text-left text-[11px] font-bold uppercase tracking-wider text-bordo/50">
                  <th className="w-12 px-4 py-3">✓</th>
                  <th className="px-4 py-3">Ingrediente</th>
                  <th className="px-4 py-3 text-right">Necessário</th>
                  <th className="px-4 py-3 text-right">Disponível</th>
                  <th className="px-4 py-3 text-right">Falta comprar</th>
                  <th className="px-4 py-3 text-right print:hidden">Vou comprar</th>
                  <th className="px-4 py-3 text-right">Valor estimado</th>
                  <th className="px-4 py-3 print:hidden" />
                </tr>
              </thead>
              <tbody className="divide-y divide-bordo/5">
                {rows.map((r) => {
                  const isChecked = checked.has(r.key);
                  return (
                    <tr key={r.key} className={cx('transition', isChecked && 'bg-emerald-50/50')}>
                      <td className="px-4 py-3">
                        <Checkbox checked={isChecked} onChange={(v) => toggle(r.key, v)} />
                      </td>
                      <td className="px-4 py-3">
                        <p className={cx('font-semibold', isChecked ? 'text-bordo/50 line-through' : 'text-bordo')}>{r.name}</p>
                        {r.manualId && <span className="text-[11px] font-semibold text-rosa-500">adicionado manualmente</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-bordo/70">{fmtQty(r.need, r.unit)}</td>
                      <td className="px-4 py-3 text-right text-bordo/70">{r.ingredient ? fmtQty(r.available, r.unit) : '—'}</td>
                      <td className={cx('px-4 py-3 text-right font-bold', r.missing > 0 ? 'text-cereja' : 'text-emerald-700')}>{fmtQty(r.missing, r.unit)}</td>
                      <td className="px-4 py-3 text-right print:hidden">
                        <Input
                          type="number"
                          step="any"
                          min={0}
                          className="ml-auto w-28 text-right"
                          value={qtyOf(r) || ''}
                          onChange={(e) => setBought((b) => ({ ...b, [r.key]: Number(e.target.value) || 0 }))}
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-bordo">{r.estimated ? brl(r.estimated) : '—'}</td>
                      <td className="px-4 py-3 text-right print:hidden">
                        {r.manualId && <IconButton icon={Trash2} label="Remover" onClick={() => removeManual(r.manualId as string)} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-bordo p-4 text-creme shadow-lift print:hidden">
          <p className="text-sm">
            <b>{checkedRows.length}</b> item(ns) marcados · estimativa <b>{brl(checkedRows.reduce((s, r) => s + qtyOf(r) * r.unitCost, 0))}</b>
          </p>
          <Button icon={CheckCheck} onClick={finish} disabled={!checkedRows.length}>
            Finalizar compra e atualizar estoque
          </Button>
        </div>
      )}

      {adding && <AddManualModal onClose={() => setAdding(false)} />}

      <Modal open={!!finishing} onClose={() => setFinishing(null)} size="xl" title="Conferir compra">
        {finishing && (
          <>
            <p className="mb-4 text-sm text-bordo/70">Ajuste quantidades e valores reais pagos. Ao confirmar, o estoque recebe as quantidades e a despesa é lançada uma única vez.</p>
            <PurchaseForm initial={finishing} source="lista" onDone={onFinished} onCancel={() => setFinishing(null)} />
          </>
        )}
      </Modal>
    </div>
  );
}

function AddManualModal({ onClose }: { onClose: () => void }) {
  const { ingredients, ingMap, addShoppingItem } = useStock();
  const { toast } = useUI();
  const [ingredientId, setIngredientId] = useState('');
  const [description, setDescription] = useState('');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('un');
  const [estimated, setEstimated] = useState(0);
  const [saving, setSaving] = useState(false);
  const ing = ingredientId ? ingMap.get(ingredientId) : undefined;

  const save = async () => {
    if (!ing && !description.trim()) return toast('Escolha um ingrediente ou descreva o item.', 'error');
    if (qty <= 0) return toast('Informe a quantidade.', 'error');
    setSaving(true);
    try {
      await addShoppingItem({
        ingredient_id: ing?.id ?? null,
        description: ing ? null : description.trim(),
        quantity: qty,
        unit: ing?.unit ?? unit,
        estimated: estimated || (ing ? round2(qty * ing.unit_cost) : null),
      });
      toast('Item adicionado à lista.');
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Adicionar item à lista"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving}>
            Adicionar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Ingrediente do estoque">
          <Select value={ingredientId} onChange={(e) => setIngredientId(e.target.value)}>
            <option value="">— Outro item (digitar) —</option>
            {ingredients
              .filter((i) => i.active)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
          </Select>
        </Field>
        {!ing && (
          <Field label="Descrição">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Papel manteiga" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Quantidade${ing ? ` (${UNITS[ing.unit].label})` : ''}`}>
            <Input type="number" step="any" min={0} value={qty || ''} onChange={(e) => setQty(Number(e.target.value) || 0)} />
          </Field>
          {!ing && (
            <Field label="Unidade">
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
            </Field>
          )}
          <Field label="Valor estimado" className={ing ? '' : 'col-span-2'}>
            <MoneyInput value={estimated} onChange={setEstimated} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
