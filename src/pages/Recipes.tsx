import { AlertTriangle, Calculator, CakeSlice, Package, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Card, EmptyState, Field, IconButton, Input, Modal, PageHeader, Select, StatCard, Textarea, cx } from '../components/ui';
import { useData } from '../context/DataContext';
import { useStock } from '../context/StockContext';
import { errorMessage, useUI } from '../context/UIContext';
import { productLabel } from '../lib/calc';
import { UNITS, compatibleUnits, convert, recipeBreakdown, type RecipeLineInput } from '../lib/costs';
import { brl, uid } from '../lib/format';
import type { Product, Unit } from '../lib/types';

const pct = (v: number | null) => (v === null || !Number.isFinite(v) ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

export default function Recipes() {
  const { products } = useData();
  const { recipeFor, sliceCost, ingMap } = useStock();
  const [editing, setEditing] = useState<Product | null>(null);

  const rows = useMemo(
    () =>
      products
        .filter((p) => p.active || recipeFor(p.id))
        .map((p) => {
          const r = recipeFor(p.id);
          const b = r ? recipeBreakdown(r.recipe.yield_pans, r.recipe.slices_per_pan, r.items, ingMap) : null;
          const cost = sliceCost.get(p.id) ?? null;
          return {
            p,
            b,
            cost,
            profit: cost === null ? null : p.price - cost,
            margin: cost === null || !p.price ? null : (p.price - cost) / p.price,
          };
        }),
    [products, recipeFor, sliceCost, ingMap],
  );

  const withRecipe = rows.filter((r) => r.b);
  const avgMargin = withRecipe.length ? withRecipe.reduce((s, r) => s + (r.margin ?? 0), 0) / withRecipe.length : null;
  const best = [...withRecipe].sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0))[0];

  return (
    <div className="space-y-5">
      <PageHeader title="Receitas e custos" subtitle="Ficha técnica de cada brownie. O custo é recalculado sozinho a cada nova compra de ingredientes." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Produtos com ficha" value={`${withRecipe.length} de ${rows.length}`} icon={Calculator} tone="bordo" />
        <StatCard label="Margem média" value={pct(avgMargin)} icon={CakeSlice} tone="verde" />
        <StatCard label="Mais lucrativo por fatia" value={best ? brl(best.profit ?? 0) : '—'} icon={CakeSlice} tone="cereja" hint={best ? productLabel(best.p.name, best.p.flavor) : undefined} />
        <StatCard label="Sem ficha técnica" value={rows.length - withRecipe.length} icon={AlertTriangle} tone="amarelo" hint="Sem custo e sem baixa no estoque" />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={CakeSlice} title="Cadastre produtos primeiro" text="Os produtos ficam em Produtos e configurações." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ p, b, cost, profit, margin }) => (
            <Card key={p.id} className="flex flex-col animate-fade-in">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-lg font-semibold text-bordo">{productLabel(p.name, p.flavor)}</p>
                  <p className="text-xs text-bordo/50">Venda: {brl(p.price)} por fatia</p>
                </div>
                {margin !== null && (
                  <span
                    className={cx(
                      'rounded-full px-2.5 py-0.5 text-xs font-bold ring-1',
                      margin >= 0.5 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : margin >= 0.3 ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-red-50 text-red-700 ring-red-200',
                    )}
                  >
                    {pct(margin)}
                  </span>
                )}
              </div>
              {b ? (
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <Mini label="Custo/fatia" value={brl(cost ?? 0)} />
                  <Mini label="Lucro/fatia" value={brl(profit ?? 0)} strong />
                  <Mini label="Rende" value={`${b.yieldSlices} fatias`} />
                </div>
              ) : (
                <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Sem ficha técnica: cadastre para calcular custo, lucro e baixa automática no estoque.</p>
              )}
              {b && b.missingCost.length > 0 && <p className="mt-2 text-xs text-amber-700">Sem custo cadastrado: {b.missingCost.join(', ')}</p>}
              <Button variant={b ? 'secondary' : 'primary'} icon={b ? Pencil : Plus} className="mt-4" onClick={() => setEditing(p)}>
                {b ? 'Editar ficha técnica' : 'Criar ficha técnica'}
              </Button>
            </Card>
          ))}
        </div>
      )}

      {editing && <RecipeEditor product={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Mini({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cx('rounded-xl py-2', strong ? 'bg-rosa-50 text-cereja' : 'bg-creme-50 text-bordo')}>
      <p className="text-[10px] uppercase tracking-wide opacity-60">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}

type Line = RecipeLineInput & { key: string };

function RecipeEditor({ product, onClose }: { product: Product; onClose: () => void }) {
  const { recipeFor, ingredients, ingMap, saveRecipe, deleteRecipe } = useStock();
  const { toast, confirm } = useUI();
  const existing = recipeFor(product.id);
  const [pans, setPans] = useState(existing?.recipe.yield_pans ?? 1);
  const [perPan, setPerPan] = useState(existing?.recipe.slices_per_pan ?? 12);
  const [notes, setNotes] = useState(existing?.recipe.notes ?? '');
  const [lines, setLines] = useState<Line[]>(() => (existing?.items ?? []).map((i) => ({ key: uid(), ingredient_id: i.ingredient_id, quantity: i.quantity, unit: i.unit, scope: i.scope })));
  const [saving, setSaving] = useState(false);

  const b = recipeBreakdown(pans, perPan, lines.filter((l) => l.ingredient_id && l.quantity > 0), ingMap);
  const profit = product.price - b.perSlice;
  const margin = product.price ? profit / product.price : null;
  const active = ingredients.filter((i) => i.active || lines.some((l) => l.ingredient_id === i.id));

  const add = (scope: 'receita' | 'fatia') => {
    const first = active.find((i) => (scope === 'fatia' ? i.category !== 'ingrediente' : i.category === 'ingrediente'));
    setLines((l) => [
      ...l,
      { key: uid(), ingredient_id: first?.id ?? '', quantity: scope === 'fatia' ? 1 : 0, unit: first ? (first.unit === 'kg' ? 'g' : first.unit === 'l' ? 'ml' : first.unit) : 'g', scope },
    ]);
  };
  const upd = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = async () => {
    if (pans <= 0 || perPan <= 0) return toast('Informe o rendimento da receita.', 'error');
    const valid = lines.filter((l) => l.ingredient_id && l.quantity > 0);
    if (!valid.length) return toast('Adicione pelo menos um ingrediente.', 'error');
    setSaving(true);
    try {
      await saveRecipe(product.id, { yield_pans: pans, slices_per_pan: Math.round(perPan), notes: notes.trim() || null }, valid);
      toast('Ficha técnica salva! Custos atualizados.');
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const r = await confirm({ title: 'Excluir ficha técnica?', danger: true, confirmLabel: 'Excluir', message: 'Os pedidos já cadastrados mantêm o custo registrado. Novos pedidos ficarão sem custo e sem baixa de estoque.' });
    if (!r.ok) return;
    try {
      await deleteRecipe(product.id);
      toast('Ficha técnica excluída.');
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const section = (scope: 'receita' | 'fatia') => (
    <div className="space-y-2">
      {lines
        .filter((l) => l.scope === scope)
        .map((l) => {
          const ing = ingMap.get(l.ingredient_id);
          const units: Unit[] = ing ? compatibleUnits(ing.unit) : ['g'];
          const cost = ing ? (convert(l.quantity, l.unit, ing.unit) ?? 0) * ing.unit_cost : 0;
          return (
            <div key={l.key} className="grid grid-cols-12 items-end gap-2 rounded-xl bg-creme-50 p-2">
              <Field label="Item" className="col-span-12 sm:col-span-5">
                <Select
                  value={l.ingredient_id}
                  className="bg-white"
                  onChange={(e) => {
                    const i = ingMap.get(e.target.value);
                    upd(l.key, { ingredient_id: e.target.value, unit: i ? (compatibleUnits(i.unit).includes(l.unit) ? l.unit : i.unit) : l.unit });
                  }}
                >
                  <option value="">Selecione…</option>
                  {active.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Quantidade" className="col-span-5 sm:col-span-2">
                <Input type="number" step="any" min={0} className="bg-white" value={l.quantity || ''} onChange={(e) => upd(l.key, { quantity: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="Unid." className="col-span-3 sm:col-span-2">
                <Select value={l.unit} className="bg-white px-2" onChange={(e) => upd(l.key, { unit: e.target.value as Unit })}>
                  {units.map((u) => (
                    <option key={u} value={u}>
                      {UNITS[u].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="col-span-3 pb-2.5 text-right text-sm font-semibold text-bordo sm:col-span-2">{brl(cost)}</div>
              <div className="col-span-1 flex justify-end">
                <IconButton icon={Trash2} label="Remover" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />
              </div>
            </div>
          );
        })}
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Ficha técnica · ${productLabel(product.name, product.flavor)}`}
      footer={
        <>
          {existing && (
            <Button variant="ghost" className="mr-auto text-cereja" icon={Trash2} onClick={remove}>
              Excluir ficha
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon={Save} loading={saving} onClick={save}>
            Salvar ficha técnica
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3 rounded-2xl bg-white p-4 ring-1 ring-bordo/5">
            <Field label="Rendimento (formas)">
              <Input type="number" step="any" min={0} value={pans || ''} onChange={(e) => setPans(Number(e.target.value) || 0)} />
            </Field>
            <Field label="Fatias por forma">
              <Input type="number" min={1} value={perPan || ''} onChange={(e) => setPerPan(parseInt(e.target.value, 10) || 0)} />
            </Field>
            <Field label="Total de fatias">
              <Input value={b.yieldSlices} disabled />
            </Field>
          </div>

          <div className="rounded-2xl bg-white p-4 ring-1 ring-bordo/5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="font-display text-lg font-semibold text-bordo">Ingredientes da receita</p>
                <p className="text-xs text-bordo/50">Quantidades para a receita inteira ({b.yieldSlices} fatias).</p>
              </div>
              <Button size="sm" variant="soft" icon={Plus} onClick={() => add('receita')}>
                Ingrediente
              </Button>
            </div>
            {section('receita')}
          </div>

          <div className="rounded-2xl bg-white p-4 ring-1 ring-bordo/5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="flex items-center gap-2 font-display text-lg font-semibold text-bordo">
                  <Package className="h-4 w-4 text-cereja" /> Embalagem por fatia
                </p>
                <p className="text-xs text-bordo/50">Embalagem, adesivo, sacola… quantidade usada em cada fatia vendida.</p>
              </div>
              <Button size="sm" variant="soft" icon={Plus} onClick={() => add('fatia')}>
                Embalagem
              </Button>
            </div>
            {section('fatia')}
          </div>

          <Field label="Modo de preparo / observações">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        <div className="space-y-3 lg:sticky lg:top-0 lg:self-start">
          <div className="rounded-2xl bg-bordo p-5 text-creme">
            <p className="text-xs uppercase tracking-wider text-creme/60">Custo por fatia</p>
            <p className="font-display text-3xl font-semibold">{brl(b.perSlice)}</p>
            <div className="mt-4 space-y-2 text-sm">
              <Row label="Custo dos ingredientes" value={brl(b.ingredientsCost)} />
              <Row label={`Custo da embalagem (${b.yieldSlices} fatias)`} value={brl(b.packagingCost)} />
              <Row label="Custo total da receita" value={brl(b.total)} bold />
              <div className="my-2 border-t border-white/15" />
              <Row label="Preço de venda" value={brl(product.price)} />
              <Row label="Lucro estimado por fatia" value={brl(profit)} bold />
              <Row label="Margem de lucro" value={pct(margin)} bold />
            </div>
          </div>
          {b.missingCost.length > 0 && (
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-100">
              Itens sem custo cadastrado (contam como R$ 0): {b.missingCost.join(', ')}. Registre uma compra ou informe o custo em Compras e estoque.
            </p>
          )}
          <p className="text-xs text-bordo/50">
            Ao marcar fatias como produzidas, estes ingredientes saem do estoque automaticamente. Pedidos já cadastrados mantêm o custo da época.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-creme/70">{label}</span>
      <span className={bold ? 'font-bold' : ''}>{value}</span>
    </div>
  );
}
