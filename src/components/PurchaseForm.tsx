import { AlertTriangle, Link2, Plus, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useStock } from '../context/StockContext';
import { errorMessage, useUI } from '../context/UIContext';
import { EXPENSE_CATEGORY_LABEL, EXPENSE_METHOD_LABEL, categoryForIngredient, convert, UNITS } from '../lib/costs';
import { brl, fmtDate, normalize, round2, todayISO, uid } from '../lib/format';
import type { ExpenseCategory, ExpenseMethod, Purchase, PurchaseDraft, PurchaseLineDraft, Unit } from '../lib/types';
import { Button, Checkbox, Field, IconButton, Input, MoneyInput, Select, Textarea, cx } from './ui';

export const emptyPurchaseDraft = (): PurchaseDraft => ({
  supplier: '',
  purchase_date: todayISO(),
  payment_method: 'pix',
  discount: 0,
  total: 0,
  notes: '',
  lines: [],
  category: 'ingredientes',
});

export const newLine = (patch: Partial<PurchaseLineDraft> = {}): PurchaseLineDraft => ({
  key: uid(),
  description: '',
  quantity: 1,
  unit: 'UN',
  unit_price: 0,
  total: 0,
  ingredient_id: null,
  stock_qty: 0,
  category: 'ingredientes',
  ...patch,
});

/** Tenta converter a unidade da nota (KG, G, L…) para a unidade do ingrediente */
export const guessStockQty = (qty: number, noteUnit: string, ingUnit: Unit) => {
  const u = noteUnit.toLowerCase() as Unit;
  if (u in UNITS) return convert(qty, u, ingUnit) ?? qty;
  return qty;
};

interface Props {
  initial: PurchaseDraft;
  source: Purchase['source'];
  file?: Blob | null;
  fileName?: string;
  fileHash?: string | null;
  onDone: (id: string) => void;
  onCancel?: () => void;
  submitLabel?: string;
  /** usado direto numa página (não em janela): fica acima do menu de baixo no celular */
  inPage?: boolean;
}

export default function PurchaseForm({ initial, source, file, fileName, fileHash, onDone, onCancel, submitLabel, inPage }: Props) {
  const { ingredients, ingMap, purchases, registerPurchase } = useStock();
  const { toast } = useUI();
  const [draft, setDraft] = useState<PurchaseDraft>(initial);
  const [totalTouched, setTotalTouched] = useState(initial.total > 0);
  const [allowDup, setAllowDup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [idempotencyKey] = useState(uid);

  const subtotal = round2(draft.lines.reduce((s, l) => s + (l.total || 0), 0));
  const computedTotal = round2(Math.max(0, subtotal - draft.discount));
  const total = draft.lines.length && !totalTouched ? computedTotal : draft.total;
  const activeIngredients = ingredients.filter((i) => i.active);

  const set = <K extends keyof PurchaseDraft>(k: K, v: PurchaseDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setLine = (key: string, patch: Partial<PurchaseLineDraft>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  /* possíveis duplicadas: mesmo dia e mesmo total (ou mesmo arquivo) */
  const duplicates = useMemo(() => {
    const sup = normalize(draft.supplier);
    return purchases.filter(
      (p) =>
        (fileHash && p.file_hash === fileHash) ||
        (p.purchase_date === draft.purchase_date && Math.abs(p.total - total) < 0.01 && total > 0 && (!sup || !p.supplier || normalize(p.supplier).includes(sup.slice(0, 6)))),
    );
  }, [purchases, draft.purchase_date, draft.supplier, total, fileHash]);
  const sameFile = duplicates.some((p) => fileHash && p.file_hash === fileHash);

  const unlinked = draft.lines.filter((l) => !l.ingredient_id && l.category !== 'outras' && l.category !== 'transporte').length;

  const submit = async () => {
    if (!draft.purchase_date) return toast('Informe a data da compra.', 'error');
    if (total <= 0) return toast('Informe o valor total da compra.', 'error');
    if (draft.lines.some((l) => !l.description.trim())) return toast('Preencha a descrição de todos os itens.', 'error');
    if (draft.lines.some((l) => l.ingredient_id && l.stock_qty <= 0)) return toast('Informe quanto entra no estoque nos itens vinculados.', 'error');
    if (sameFile) return toast('Esta nota já foi registrada.', 'error');
    if (duplicates.length && !allowDup) return toast('Confirme que não é uma compra repetida.', 'error');
    setSaving(true);
    try {
      const id = await registerPurchase({ ...draft, total }, { source, idempotencyKey, file, fileName, fileHash });
      toast('Compra registrada! Estoque, custos e despesas atualizados.');
      onDone(id);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 rounded-2xl bg-white p-4 shadow-soft ring-1 ring-bordo/5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Estabelecimento / fornecedor" className="sm:col-span-2">
          <Input value={draft.supplier} onChange={(e) => set('supplier', e.target.value)} placeholder="Ex.: Atacadão" />
        </Field>
        <Field label="Data da compra" required>
          <Input type="date" value={draft.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} />
        </Field>
        <Field label="Forma de pagamento">
          <Select value={draft.payment_method} onChange={(e) => set('payment_method', e.target.value as ExpenseMethod)}>
            {(Object.keys(EXPENSE_METHOD_LABEL) as ExpenseMethod[]).map((m) => (
              <option key={m} value={m}>
                {EXPENSE_METHOD_LABEL[m]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {/* Itens */}
      <div className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-bordo/5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-lg font-semibold text-bordo">Itens da compra</h3>
            <p className="text-xs text-bordo/50">Vincule cada item a um ingrediente para atualizar o estoque e o custo das receitas.</p>
          </div>
          <Button size="sm" variant="soft" icon={Plus} onClick={() => set('lines', [...draft.lines, newLine()])}>
            Adicionar item
          </Button>
        </div>

        {draft.lines.length === 0 ? (
          <div className="rounded-xl bg-creme-50 p-4 text-sm text-bordo/60">
            Sem itens: a compra será lançada como uma despesa única.
            <Field label="Categoria da despesa" className="mt-3 max-w-xs">
              <Select value={draft.category} onChange={(e) => set('category', e.target.value as ExpenseCategory)} className="bg-white">
                {(Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {EXPENSE_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : (
          <div className="space-y-3">
            {draft.lines.map((l) => {
              const ing = l.ingredient_id ? ingMap.get(l.ingredient_id) : undefined;
              return (
                <div key={l.key} className={cx('rounded-xl p-3 ring-1', ing ? 'bg-emerald-50/40 ring-emerald-100' : 'bg-creme-50 ring-bordo/5')}>
                  <div className="grid gap-2 sm:grid-cols-12">
                    <Field label="Descrição" className="sm:col-span-5">
                      <Input value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} className="bg-white" />
                    </Field>
                    <Field label="Qtd." className="sm:col-span-2">
                      <Input
                        type="number"
                        step="any"
                        min={0}
                        className="bg-white"
                        value={l.quantity || ''}
                        onChange={(e) => {
                          const q = Number(e.target.value) || 0;
                          setLine(l.key, { quantity: q, total: round2(q * l.unit_price), stock_qty: ing ? guessStockQty(q, l.unit, ing.unit) : l.stock_qty });
                        }}
                      />
                    </Field>
                    <Field label="Unid." className="sm:col-span-1">
                      <Input value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value.toUpperCase() })} className="bg-white px-2" />
                    </Field>
                    <Field label="Valor unit." className="sm:col-span-2">
                      <MoneyInput value={l.unit_price} onChange={(v) => setLine(l.key, { unit_price: v, total: round2(v * l.quantity) })} className="bg-white" />
                    </Field>
                    <Field label="Total" className="sm:col-span-2">
                      <MoneyInput value={l.total} onChange={(v) => setLine(l.key, { total: v })} className="bg-white" />
                    </Field>
                  </div>
                  <div className="mt-2 grid items-end gap-2 sm:grid-cols-12">
                    <Field label="Ingrediente do estoque" className="sm:col-span-5">
                      <Select
                        value={l.ingredient_id ?? ''}
                        className="bg-white"
                        onChange={(e) => {
                          const id = e.target.value || null;
                          const i = id ? ingMap.get(id) : undefined;
                          setLine(l.key, {
                            ingredient_id: id,
                            stock_qty: i ? guessStockQty(l.quantity, l.unit, i.unit) : 0,
                            category: i ? categoryForIngredient(i.category) : l.category,
                          });
                        }}
                      >
                        <option value="">— Não vincular (só despesa) —</option>
                        {activeIngredients.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name} ({UNITS[i.unit].label})
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={ing ? `Entra no estoque (${UNITS[ing.unit].label})` : 'Entra no estoque'} className="sm:col-span-3">
                      <Input
                        type="number"
                        step="any"
                        min={0}
                        className="bg-white"
                        disabled={!ing}
                        value={ing ? l.stock_qty || '' : ''}
                        onChange={(e) => setLine(l.key, { stock_qty: Number(e.target.value) || 0 })}
                      />
                    </Field>
                    <Field label="Categoria" className="sm:col-span-3">
                      <Select value={l.category} onChange={(e) => setLine(l.key, { category: e.target.value as ExpenseCategory })} className="bg-white">
                        {(Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]).map((c) => (
                          <option key={c} value={c}>
                            {EXPENSE_CATEGORY_LABEL[c]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <div className="flex justify-end sm:col-span-1">
                      <IconButton icon={Trash2} label="Remover item" onClick={() => set('lines', draft.lines.filter((x) => x.key !== l.key))} />
                    </div>
                  </div>
                  {ing && l.stock_qty > 0 && l.total > 0 && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-emerald-700">
                      <Link2 className="h-3.5 w-3.5" /> Novo custo de {ing.name}: {brl(l.total / l.stock_qty)}/{UNITS[ing.unit].label}
                      {ing.unit_cost > 0 && <span className="text-bordo/50">(antes {brl(ing.unit_cost)})</span>}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-bordo/5">
          <Field label="Observações">
            <Textarea value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Opcional" />
          </Field>
        </div>
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-soft ring-1 ring-bordo/5">
          {draft.lines.length > 0 && (
            <div className="flex justify-between text-sm text-bordo/70">
              <span>Soma dos itens</span>
              <b className="text-bordo">{brl(subtotal)}</b>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Desconto geral">
              <MoneyInput value={draft.discount} onChange={(v) => set('discount', v)} />
            </Field>
            <Field label="Total pago" required hint={draft.lines.length && totalTouched ? `Calculado: ${brl(computedTotal)}` : undefined}>
              <MoneyInput
                value={total}
                onChange={(v) => {
                  setTotalTouched(true);
                  set('total', v);
                }}
              />
            </Field>
          </div>
          {draft.lines.length > 0 && totalTouched && Math.abs(total - computedTotal) > 0.009 && (
            <p className="text-xs text-amber-700">
              O total pago é diferente da soma dos itens menos o desconto. A diferença será distribuída proporcionalmente entre os itens.
            </p>
          )}
        </div>
      </div>

      {unlinked > 0 && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-100">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {unlinked} item(ns) de ingredientes/embalagens sem vínculo com o estoque: entrarão só como despesa.
        </p>
      )}

      {duplicates.length > 0 && (
        <div className={cx('rounded-xl p-3 text-sm ring-1', sameFile ? 'bg-red-50 text-red-800 ring-red-200' : 'bg-amber-50 text-amber-900 ring-amber-200')}>
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            {sameFile ? 'Esta nota já foi registrada.' : 'Possível compra repetida'}
          </p>
          <ul className="mt-1 list-disc pl-6 text-xs">
            {duplicates.slice(0, 3).map((p) => (
              <li key={p.id}>
                {fmtDate(p.purchase_date)} · {p.supplier ?? 'Sem fornecedor'} · {brl(p.total)}
              </li>
            ))}
          </ul>
          {!sameFile && (
            <Checkbox className="mt-2" checked={allowDup} onChange={setAllowDup} label={<span className="text-xs">É outra compra, registrar mesmo assim</span>} />
          )}
        </div>
      )}

      <div className={cx("sticky z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-bordo p-4 text-creme shadow-lift", inPage ? "bottom-20 lg:bottom-0" : "bottom-0")}>
        <div className="text-sm">
          <p className="text-creme/60">Ao confirmar: despesa lançada, estoque e custos das receitas atualizados.</p>
          <p className="font-display text-xl font-semibold">{brl(total)}</p>
        </div>
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="ghost" className="text-creme hover:bg-white/10" onClick={onCancel}>
              Cancelar
            </Button>
          )}
          <Button icon={saving ? undefined : sameFile ? AlertTriangle : Save} loading={saving} onClick={submit} disabled={sameFile}>
            {submitLabel ?? 'Confirmar compra'}
          </Button>
        </div>
      </div>
    </div>
  );
}

