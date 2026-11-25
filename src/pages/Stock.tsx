import { Boxes, Camera, ExternalLink, History, PackageX, Pencil, Plus, Scale, ShoppingBag, Trash2, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PurchaseForm, { emptyPurchaseDraft } from '../components/PurchaseForm';
import {
  Button,
  Card,
  Checkbox,
  Chip,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  MoneyInput,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  StatCard,
  Textarea,
  cx,
} from '../components/ui';
import { useStock, type IngredientInput } from '../context/StockContext';
import { errorMessage, useUI } from '../context/UIContext';
import {
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_METHOD_LABEL,
  INGREDIENT_CATEGORY_LABEL,
  STOCK_META,
  UNITS,
  fmtQty,
  fmtUnitCost,
  stockLevel,
  type StockLevel,
} from '../lib/costs';
import { exportCSV, type Row } from '../lib/export';
import { brl, fmtDate, normalize } from '../lib/format';
import type { ExpenseMethod, Ingredient, IngredientCategory, StockMovement, Unit } from '../lib/types';

export default function Stock() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('aba') === 'compras' ? 'compras' : 'estoque';
  return (
    <div>
      <PageHeader
        title="Compras e estoque"
        subtitle="Ingredientes, embalagens e materiais, sempre atualizados pelas compras e pela produção."
        actions={
          <>
            <Segmented
              value={tab}
              onChange={(v) => setParams(v === 'compras' ? { aba: 'compras' } : {})}
              options={[
                { value: 'estoque', label: 'Estoque' },
                { value: 'compras', label: 'Compras registradas' },
              ]}
            />
            <Link to="/escanear">
              <Button icon={Camera}>Escanear notinha</Button>
            </Link>
          </>
        }
      />
      {tab === 'estoque' ? <StockTab /> : <PurchasesTab />}
    </div>
  );
}

/* =============================== ESTOQUE =============================== */
function StockTab() {
  const { ingredients, setIngredientActive } = useStock();
  const { toast } = useUI();
  const [q, setQ] = useState('');
  const [level, setLevel] = useState<StockLevel | 'todos'>('todos');
  const [cat, setCat] = useState<IngredientCategory | 'todas'>('todas');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Ingredient | 'new' | null>(null);
  const [adjusting, setAdjusting] = useState<Ingredient | null>(null);
  const [history, setHistory] = useState<Ingredient | null>(null);

  const list = useMemo(() => {
    const term = normalize(q);
    return ingredients.filter(
      (i) =>
        (showInactive || i.active) &&
        (level === 'todos' || stockLevel(i) === level) &&
        (cat === 'todas' || i.category === cat) &&
        (!term || normalize(i.name).includes(term) || normalize(i.supplier ?? '').includes(term)),
    );
  }, [ingredients, q, level, cat, showInactive]);

  const act = ingredients.filter((i) => i.active);
  const counts = { ok: 0, baixo: 0, esgotado: 0 } as Record<StockLevel, number>;
  act.forEach((i) => counts[stockLevel(i)]++);
  const value = act.reduce((s, i) => s + Math.max(0, i.stock_qty) * i.unit_cost, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Itens cadastrados" value={act.length} icon={Boxes} tone="bordo" />
        <StatCard label="Estoque suficiente" value={counts.ok} icon={Boxes} tone="verde" />
        <StatCard label="Baixo ou esgotado" value={counts.baixo + counts.esgotado} icon={PackageX} tone="amarelo" hint={`${counts.esgotado} esgotado(s)`} />
        <StatCard label="Valor em estoque" value={brl(value)} icon={Wallet} tone="cereja" hint="Pelo custo atual" />
      </div>

      <Card className="space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <SearchInput value={q} onChange={setQ} placeholder="Pesquisar ingrediente ou fornecedor…" />
          <Select value={cat} onChange={(e) => setCat(e.target.value as IngredientCategory | 'todas')} className="bg-white md:w-48">
            <option value="todas">Todas as categorias</option>
            {(Object.keys(INGREDIENT_CATEGORY_LABEL) as IngredientCategory[]).map((c) => (
              <option key={c} value={c}>
                {INGREDIENT_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
          <Button icon={Plus} onClick={() => setEditing('new')}>
            Novo item
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={level === 'todos'} onClick={() => setLevel('todos')}>
            Todos
          </Chip>
          {(Object.keys(STOCK_META) as StockLevel[]).map((l) => (
            <Chip key={l} active={level === l} onClick={() => setLevel(l)} dot={STOCK_META[l].dot}>
              {STOCK_META[l].label} ({counts[l]})
            </Chip>
          ))}
          <Checkbox className="ml-auto" checked={showInactive} onChange={setShowInactive} label={<span className="text-xs">Mostrar inativos</span>} />
        </div>
      </Card>

      {list.length === 0 ? (
        <EmptyState icon={Boxes} title="Nenhum item encontrado" action={<Button icon={Plus} onClick={() => setEditing('new')}>Cadastrar item</Button>} />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-bordo/5">
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b border-bordo/5 bg-creme-50 text-left text-[11px] font-bold uppercase tracking-wider text-bordo/50">
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Em estoque</th>
                  <th className="px-4 py-3">Mínimo</th>
                  <th className="px-4 py-3">Custo</th>
                  <th className="px-4 py-3">Última compra</th>
                  <th className="px-4 py-3">Fornecedor</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bordo/5">
                {list.map((i) => {
                  const lvl = stockLevel(i);
                  return (
                    <tr key={i.id} className={cx('hover:bg-creme-50/60', !i.active && 'opacity-50')}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', STOCK_META[lvl].dot)} />
                          <div>
                            <p className="font-semibold text-bordo">{i.name}</p>
                            <p className="text-xs text-bordo/45">{INGREDIENT_CATEGORY_LABEL[i.category]}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-bordo">{fmtQty(i.stock_qty, i.unit)}</p>
                        <span className={cx('mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', STOCK_META[lvl].badge)}>{STOCK_META[lvl].label}</span>
                      </td>
                      <td className="px-4 py-3 text-bordo/70">{i.min_stock ? fmtQty(i.min_stock, i.unit) : '—'}</td>
                      <td className="px-4 py-3 text-xs text-bordo/70">{i.unit_cost ? fmtUnitCost(i.unit_cost, i.unit) : <span className="text-amber-700">sem custo</span>}</td>
                      <td className="px-4 py-3 text-bordo/70">
                        {i.last_purchase_price !== null ? brl(i.last_purchase_price) : '—'}
                        <p className="text-xs text-bordo/45">{fmtDate(i.last_purchase_date)}</p>
                      </td>
                      <td className="px-4 py-3 text-bordo/70">{i.supplier ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-0.5">
                          <IconButton icon={Scale} label="Ajustar estoque" onClick={() => setAdjusting(i)} />
                          <IconButton icon={History} label="Movimentações" onClick={() => setHistory(i)} />
                          <IconButton icon={Pencil} label="Editar" onClick={() => setEditing(i)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <IngredientModal
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onToggle={async (i) => {
            try {
              await setIngredientActive(i.id, !i.active);
              toast(i.active ? 'Item desativado.' : 'Item reativado.');
              setEditing(null);
            } catch (e) {
              toast(errorMessage(e), 'error');
            }
          }}
        />
      )}
      {adjusting && <AdjustModal item={adjusting} onClose={() => setAdjusting(null)} />}
      {history && <MovementsModal item={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function IngredientModal({ item, onClose, onToggle }: { item: Ingredient | null; onClose: () => void; onToggle: (i: Ingredient) => void }) {
  const { saveIngredient, ingredients } = useStock();
  const { toast } = useUI();
  const [f, setF] = useState<IngredientInput>({
    name: item?.name ?? '',
    category: item?.category ?? 'ingrediente',
    unit: item?.unit ?? 'kg',
    min_stock: item?.min_stock ?? 0,
    unit_cost: item?.unit_cost ?? 0,
    last_purchase_price: item?.last_purchase_price ?? null,
    last_purchase_date: item?.last_purchase_date ?? null,
    supplier: item?.supplier ?? '',
    notes: item?.notes ?? '',
    active: item?.active ?? true,
  });
  const [initial, setInitial] = useState(0);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof IngredientInput>(k: K, v: IngredientInput[K]) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    if (!f.name.trim()) return toast('Informe o nome.', 'error');
    if (ingredients.some((i) => i.id !== item?.id && normalize(i.name) === normalize(f.name))) return toast('Já existe um item com esse nome.', 'error');
    setSaving(true);
    try {
      await saveIngredient(f, item?.id, initial);
      toast(item ? 'Item atualizado! Custos das receitas recalculados.' : 'Item cadastrado!');
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
      title={item ? 'Editar item do estoque' : 'Novo item do estoque'}
      footer={
        <>
          {item && (
            <Button variant="ghost" className="mr-auto" onClick={() => onToggle(item)}>
              {item.active ? 'Desativar item' : 'Reativar item'}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" required className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Chocolate meio amargo" autoFocus />
        </Field>
        <Field label="Categoria">
          <Select value={f.category} onChange={(e) => set('category', e.target.value as IngredientCategory)}>
            {(Object.keys(INGREDIENT_CATEGORY_LABEL) as IngredientCategory[]).map((c) => (
              <option key={c} value={c}>
                {INGREDIENT_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Unidade de medida" hint={item ? 'Mudar a unidade não converte o estoque atual.' : undefined}>
          <Select value={f.unit} onChange={(e) => set('unit', e.target.value as Unit)}>
            <option value="kg">Quilograma (kg)</option>
            <option value="g">Grama (g)</option>
            <option value="l">Litro (L)</option>
            <option value="ml">Mililitro (ml)</option>
            <option value="un">Unidade (un)</option>
          </Select>
        </Field>
        {!item && (
          <Field label={`Estoque atual (${UNITS[f.unit].label})`}>
            <Input type="number" step="any" min={0} value={initial || ''} onChange={(e) => setInitial(Number(e.target.value) || 0)} />
          </Field>
        )}
        <Field label={`Estoque mínimo (${UNITS[f.unit].label})`} hint="Abaixo disso, aparece como estoque baixo">
          <Input type="number" step="any" min={0} value={f.min_stock || ''} onChange={(e) => set('min_stock', Number(e.target.value) || 0)} />
        </Field>
        <Field label={`Custo por ${UNITS[f.unit].label}`} hint={f.unit_cost ? fmtUnitCost(f.unit_cost, f.unit) : 'Atualizado sozinho a cada compra'}>
          <MoneyInput value={f.unit_cost} onChange={(v) => set('unit_cost', v)} />
        </Field>
        <Field label="Valor da última compra">
          <MoneyInput value={f.last_purchase_price ?? 0} onChange={(v) => set('last_purchase_price', v || null)} />
        </Field>
        <Field label="Data da última compra">
          <Input type="date" value={f.last_purchase_date ?? ''} onChange={(e) => set('last_purchase_date', e.target.value || null)} />
        </Field>
        <Field label="Fornecedor">
          <Input value={f.supplier ?? ''} onChange={(e) => set('supplier', e.target.value)} />
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function AdjustModal({ item, onClose }: { item: Ingredient; onClose: () => void }) {
  const { adjustStock } = useStock();
  const { toast } = useUI();
  const [qty, setQty] = useState(Math.max(0, Number(item.stock_qty.toFixed(4))));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await adjustStock(item.id, qty, notes);
      toast('Estoque ajustado.');
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };
  const delta = qty - item.stock_qty;
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Ajustar estoque · ${item.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving} disabled={Math.abs(delta) < 0.0001}>
            Salvar ajuste
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-bordo/70">
          No sistema: <b>{fmtQty(item.stock_qty, item.unit)}</b>. Informe quanto existe de fato (contagem física). Para compras, use “Escanear notinha” ou a lista de compras.
        </p>
        <Field label={`Quantidade real (${UNITS[item.unit].label})`}>
          <Input type="number" step="any" min={0} value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} autoFocus />
        </Field>
        {Math.abs(delta) >= 0.0001 && (
          <p className={cx('text-sm font-semibold', delta > 0 ? 'text-emerald-700' : 'text-cereja')}>
            {delta > 0 ? '+' : ''}
            {fmtQty(delta, item.unit)}
          </p>
        )}
        <Field label="Motivo">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: contagem do mês, perda, quebra…" />
        </Field>
      </div>
    </Modal>
  );
}

const MOV_LABEL: Record<StockMovement['type'], string> = {
  compra: 'Compra',
  consumo: 'Consumo na produção',
  estorno_consumo: 'Produção desmarcada',
  ajuste: 'Ajuste manual',
};

function MovementsModal({ item, onClose }: { item: Ingredient; onClose: () => void }) {
  const { fetchMovements } = useStock();
  const [rows, setRows] = useState<StockMovement[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetchMovements(item.id)
      .then(setRows)
      .catch((e) => setErr(errorMessage(e)));
  }, [item.id, fetchMovements]);
  return (
    <Modal open onClose={onClose} size="lg" title={`Movimentações · ${item.name}`}>
      {err ? (
        <p className="text-sm text-red-700">{err}</p>
      ) : !rows ? (
        <p className="text-sm text-bordo/50">Carregando…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={History} title="Sem movimentações" />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bordo/10 text-left text-[11px] font-bold uppercase tracking-wider text-bordo/50">
              <th className="py-2">Data</th>
              <th className="py-2">Tipo</th>
              <th className="py-2 text-right">Quantidade</th>
              <th className="py-2 text-right">Custo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bordo/5">
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="py-2 text-bordo/70">{fmtDate(m.occurred_at)}</td>
                <td className="py-2">
                  <p className="text-bordo">{MOV_LABEL[m.type]}</p>
                  {m.notes && <p className="text-xs text-bordo/45">{m.notes}</p>}
                </td>
                <td className={cx('py-2 text-right font-semibold', m.quantity >= 0 ? 'text-emerald-700' : 'text-cereja')}>
                  {m.quantity > 0 ? '+' : ''}
                  {fmtQty(m.quantity, item.unit)}
                </td>
                <td className="py-2 text-right text-bordo/70">{m.total_cost !== null ? brl(Math.abs(m.total_cost)) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

/* =============================== COMPRAS =============================== */
function PurchasesTab() {
  const { purchases, purchaseItems, ingMap, deletePurchase, receiptUrl } = useStock();
  const { toast, confirm } = useUI();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const list = useMemo(() => {
    const term = normalize(q);
    return purchases.filter(
      (p) =>
        !term ||
        normalize(p.supplier ?? '').includes(term) ||
        normalize(p.description ?? '').includes(term) ||
        purchaseItems.some((i) => i.purchase_id === p.id && normalize(i.description).includes(term)),
    );
  }, [purchases, purchaseItems, q]);

  const viewReceipt = async (path: string) => {
    const url = await receiptUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
    else toast('Não foi possível abrir o comprovante.', 'error');
  };

  const remove = async (id: string) => {
    const r = await confirm({
      title: 'Excluir compra?',
      danger: true,
      confirmLabel: 'Excluir compra',
      message: 'A entrada no estoque e as despesas desta compra serão desfeitas. O custo dos ingredientes não volta ao valor anterior automaticamente.',
    });
    if (!r.ok) return;
    try {
      await deletePurchase(id);
      toast('Compra excluída e estoque ajustado.');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const exportRows = (): Row[] =>
    list.flatMap((p): Row[] => {
      const its = purchaseItems.filter((i) => i.purchase_id === p.id);
      const base = { Data: fmtDate(p.purchase_date), Fornecedor: p.supplier ?? '', 'Total da compra': p.total, Origem: p.source };
      return its.length
        ? its.map((i) => ({ ...base, Item: i.description, Quantidade: i.quantity, 'Valor do item': i.total, Categoria: EXPENSE_CATEGORY_LABEL[i.category] ?? i.category, Ingrediente: i.ingredient_id ? ingMap.get(i.ingredient_id)?.name ?? '' : '' }))
        : [{ ...base, Item: p.description ?? '', Quantidade: '', 'Valor do item': p.total, Categoria: '', Ingrediente: '' }];
    });

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 p-4 md:grid-cols-[1fr_auto_auto]">
        <SearchInput value={q} onChange={setQ} placeholder="Pesquisar fornecedor ou produto…" />
        <Button variant="secondary" onClick={() => exportCSV(exportRows(), 'compras')}>
          Exportar CSV
        </Button>
        <Button icon={ShoppingBag} onClick={() => setCreating(true)}>
          Registrar compra manual
        </Button>
      </Card>

      {list.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="Nenhuma compra registrada" text="Escaneie uma notinha ou registre uma compra manualmente." />
      ) : (
        <div className="space-y-2">
          {list.map((p) => {
            const its = purchaseItems.filter((i) => i.purchase_id === p.id);
            const isOpen = open === p.id;
            return (
              <div key={p.id} className="rounded-2xl bg-white shadow-soft ring-1 ring-bordo/5">
                <button onClick={() => setOpen(isOpen ? null : p.id)} className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left">
                  <div className="min-w-0">
                    <p className="font-semibold text-bordo">{p.supplier ?? p.description ?? 'Compra'}</p>
                    <p className="text-xs text-bordo/50">
                      {fmtDate(p.purchase_date)} · {its.length} item(ns) · {EXPENSE_METHOD_LABEL[p.payment_method as ExpenseMethod] ?? p.payment_method} ·{' '}
                      {p.source === 'nota' ? 'lida da notinha' : p.source === 'lista' ? 'da lista de compras' : 'manual'}
                    </p>
                  </div>
                  <span className="font-display text-lg font-semibold text-bordo">{brl(p.total)}</span>
                </button>
                {isOpen && (
                  <div className="border-t border-bordo/5 p-4">
                    <ul className="space-y-1 text-sm">
                      {its.map((i) => (
                        <li key={i.id} className="flex flex-wrap justify-between gap-2">
                          <span className="text-bordo/80">
                            {i.quantity}× {i.description}
                            {i.ingredient_id && (
                              <span className="ml-2 rounded-full bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-700">
                                +{fmtQty(i.stock_qty, ingMap.get(i.ingredient_id)?.unit ?? 'un')} {ingMap.get(i.ingredient_id)?.name}
                              </span>
                            )}
                          </span>
                          <span className="font-semibold text-bordo">{brl(i.total)}</span>
                        </li>
                      ))}
                    </ul>
                    {p.discount > 0 && <p className="mt-2 text-xs text-bordo/60">Desconto: {brl(p.discount)}</p>}
                    {p.notes && <p className="mt-2 text-xs text-bordo/60">{p.notes}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {p.receipt_path && (
                        <Button size="sm" variant="secondary" icon={ExternalLink} onClick={() => viewReceipt(p.receipt_path as string)}>
                          Ver comprovante
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" icon={Trash2} className="text-cereja" onClick={() => remove(p.id)}>
                        Excluir compra
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} size="xl" title="Registrar compra">
        {creating && <PurchaseForm initial={emptyPurchaseDraft()} source="manual" onDone={() => setCreating(false)} onCancel={() => setCreating(false)} />}
      </Modal>
    </div>
  );
}

