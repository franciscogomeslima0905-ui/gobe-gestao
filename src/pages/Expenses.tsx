import { Camera, Download, ExternalLink, FileSpreadsheet, Paperclip, Pencil, Plus, Receipt, ShoppingBag, Trash2, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Donut } from '../components/Charts';
import PeriodFilter, { defaultPeriod } from '../components/PeriodFilter';
import { Button, Card, EmptyState, Field, IconButton, Input, Modal, MoneyInput, PageHeader, SearchInput, SectionTitle, Select, StatCard, Textarea } from '../components/ui';
import { useStock, type ExpenseInput } from '../context/StockContext';
import { errorMessage, useUI } from '../context/UIContext';
import { EXPENSE_CATEGORY_LABEL, EXPENSE_METHOD_LABEL, INVENTORY_CATEGORIES } from '../lib/costs';
import { exportCSV, exportExcel, type Row } from '../lib/export';
import { brl, fmtDate, normalize, round2, todayISO } from '../lib/format';
import { getRange, inRange, type PeriodState } from '../lib/period';
import type { Expense, ExpenseCategory, ExpenseMethod } from '../lib/types';

export default function Expenses() {
  const { expenses, deleteExpense, receiptUrl } = useStock();
  const { toast, confirm } = useUI();
  const [period, setPeriod] = useState<PeriodState>(defaultPeriod('mes'));
  const [cat, setCat] = useState<ExpenseCategory | 'todas'>('todas');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const range = getRange(period);

  const inPeriod = useMemo(() => expenses.filter((e) => inRange(e.expense_date, range)), [expenses, range.start, range.end]);
  const list = useMemo(() => {
    const term = normalize(q);
    return inPeriod.filter(
      (e) => (cat === 'todas' || e.category === cat) && (!term || normalize(e.description).includes(term) || normalize(e.supplier ?? '').includes(term)),
    );
  }, [inPeriod, cat, q]);

  const sum = (f: (e: Expense) => boolean) => round2(inPeriod.filter(f).reduce((s, e) => s + e.amount, 0));
  const total = sum(() => true);
  const byCat = (Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[])
    .map((c) => ({ name: EXPENSE_CATEGORY_LABEL[c], value: sum((e) => e.category === c) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);

  const rows = (): Row[] =>
    list.map((e) => ({
      Data: fmtDate(e.expense_date),
      'Descrição': e.description,
      Categoria: EXPENSE_CATEGORY_LABEL[e.category],
      Fornecedor: e.supplier ?? '',
      'Forma de pagamento': EXPENSE_METHOD_LABEL[e.payment_method],
      Valor: e.amount,
      Origem: e.purchase_id ? 'Compra registrada' : 'Manual',
      Comprovante: e.receipt_path ? 'Sim' : 'Não',
    }));

  const remove = async (e: Expense) => {
    const r = await confirm({ title: 'Excluir despesa?', danger: true, confirmLabel: 'Excluir', message: `“${e.description}” (${brl(e.amount)}) sairá do controle financeiro.` });
    if (!r.ok) return;
    try {
      await deleteExpense(e.id);
      toast('Despesa excluída.');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const open = async (path: string) => {
    const url = await receiptUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
    else toast('Não foi possível abrir o comprovante.', 'error');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Despesas"
        subtitle="Todos os gastos da GB GOBÊ, lançados à mão ou pelas notinhas."
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={() => exportCSV(rows(), `despesas-${range.start}_a_${range.end}`)}>
              CSV
            </Button>
            <Button variant="secondary" icon={FileSpreadsheet} onClick={() => exportExcel([{ name: 'Despesas', rows: rows() }], `despesas-${range.start}_a_${range.end}`)}>
              Excel
            </Button>
            <Link to="/escanear">
              <Button variant="secondary" icon={Camera}>
                Escanear notinha
              </Button>
            </Link>
            <Button icon={Plus} onClick={() => setEditing('new')}>
              Nova despesa
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/60 p-3 ring-1 ring-bordo/5">
        <p className="px-1 text-sm font-semibold text-bordo">Período</p>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total de despesas" value={brl(total)} icon={Wallet} tone="cereja" hint={`${inPeriod.length} lançamento(s)`} />
        <StatCard label="Ingredientes" value={brl(sum((e) => e.category === 'ingredientes'))} icon={ShoppingBag} tone="bordo" />
        <StatCard label="Embalagens e adesivos" value={brl(sum((e) => e.category === 'embalagens' || e.category === 'adesivos'))} icon={ShoppingBag} tone="rosa" />
        <StatCard label="Outras despesas" value={brl(sum((e) => !INVENTORY_CATEGORIES.includes(e.category)))} icon={Receipt} tone="laranja" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <Card className="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
            <SearchInput value={q} onChange={setQ} placeholder="Pesquisar descrição ou fornecedor…" />
            <Select value={cat} onChange={(e) => setCat(e.target.value as ExpenseCategory | 'todas')} className="bg-white md:w-56">
              <option value="todas">Todas as categorias</option>
              {(Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]).map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </Card>

          {list.length === 0 ? (
            <EmptyState icon={Receipt} title="Nenhuma despesa no período" action={<Button icon={Plus} onClick={() => setEditing('new')}>Lançar despesa</Button>} />
          ) : (
            <div className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-bordo/5">
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-bordo/5 bg-creme-50 text-left text-[11px] font-bold uppercase tracking-wider text-bordo/50">
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Descrição</th>
                      <th className="px-4 py-3">Categoria</th>
                      <th className="px-4 py-3">Pagamento</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bordo/5">
                    {list.map((e) => (
                      <tr key={e.id} className="hover:bg-creme-50/60">
                        <td className="whitespace-nowrap px-4 py-3 text-bordo/70">{fmtDate(e.expense_date)}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-bordo">{e.description}</p>
                          <p className="text-xs text-bordo/45">
                            {e.supplier ?? 'Sem fornecedor'}
                            {e.purchase_id && <span className="ml-2 rounded-full bg-rosa-50 px-2 font-semibold text-cereja">da compra</span>}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-bordo/70">{EXPENSE_CATEGORY_LABEL[e.category]}</td>
                        <td className="px-4 py-3 text-bordo/70">{EXPENSE_METHOD_LABEL[e.payment_method]}</td>
                        <td className="px-4 py-3 text-right font-bold text-bordo">{brl(e.amount)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-0.5">
                            {e.receipt_path && <IconButton icon={ExternalLink} label="Ver comprovante" onClick={() => open(e.receipt_path as string)} />}
                            {e.purchase_id ? (
                              <Link to="/estoque?aba=compras" className="rounded-lg px-2 py-1.5 text-xs font-semibold text-cereja hover:bg-rosa-50">
                                Ver compra
                              </Link>
                            ) : (
                              <>
                                <IconButton icon={Pencil} label="Editar" onClick={() => setEditing(e)} />
                                <IconButton icon={Trash2} label="Excluir" onClick={() => remove(e)} />
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <Card>
          <SectionTitle icon={Wallet} title="Despesas por categoria" />
          <div className="h-64">
            <Donut money data={byCat} />
          </div>
        </Card>
      </div>

      {editing && <ExpenseModal expense={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ExpenseModal({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const { saveExpense } = useStock();
  const { toast } = useUI();
  const [f, setF] = useState<ExpenseInput>({
    expense_date: expense?.expense_date ?? todayISO(),
    description: expense?.description ?? '',
    category: expense?.category ?? 'outras',
    amount: expense?.amount ?? 0,
    supplier: expense?.supplier ?? '',
    payment_method: expense?.payment_method ?? 'pix',
    notes: expense?.notes ?? '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ExpenseInput>(k: K, v: ExpenseInput[K]) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    if (!f.description.trim()) return toast('Informe a descrição.', 'error');
    if (f.amount <= 0) return toast('Informe o valor.', 'error');
    setSaving(true);
    try {
      await saveExpense(f, expense?.id, file);
      toast(expense ? 'Despesa atualizada!' : 'Despesa lançada!');
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
      title={expense ? 'Editar despesa' : 'Nova despesa'}
      footer={
        <>
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
        <Field label="Descrição" required className="sm:col-span-2">
          <Input value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Ex.: Conta de luz de novembro" autoFocus />
        </Field>
        <Field label="Data" required>
          <Input type="date" value={f.expense_date} onChange={(e) => set('expense_date', e.target.value)} />
        </Field>
        <Field label="Valor" required>
          <MoneyInput value={f.amount} onChange={(v) => set('amount', v)} />
        </Field>
        <Field label="Categoria">
          <Select value={f.category} onChange={(e) => set('category', e.target.value as ExpenseCategory)}>
            {(Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]).map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Forma de pagamento">
          <Select value={f.payment_method} onChange={(e) => set('payment_method', e.target.value as ExpenseMethod)}>
            {(Object.keys(EXPENSE_METHOD_LABEL) as ExpenseMethod[]).map((m) => (
              <option key={m} value={m}>
                {EXPENSE_METHOD_LABEL[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fornecedor" className="sm:col-span-2">
          <Input value={f.supplier ?? ''} onChange={(e) => set('supplier', e.target.value)} />
        </Field>
        <Field label="Comprovante" className="sm:col-span-2" hint={expense?.receipt_path && !file ? 'Já existe um comprovante anexado. Envie outro para substituir.' : 'Foto ou PDF (opcional)'}>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-creme-50 px-3 py-2.5 text-sm text-bordo ring-1 ring-bordo/10 hover:bg-white">
            <Paperclip className="h-4 w-4 text-cereja" />
            <span className="truncate">{file ? file.name : 'Escolher arquivo'}</span>
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </Field>
        {(f.category === 'ingredientes' || f.category === 'embalagens' || f.category === 'adesivos') && !expense && (
          <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-100 sm:col-span-2">
            Para compras de ingredientes e embalagens, prefira “Escanear notinha” ou “Registrar compra”: assim o estoque e o custo das receitas também são atualizados.
          </p>
        )}
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
