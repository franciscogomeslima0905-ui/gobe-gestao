import { addDays } from 'date-fns';
import { CakeSlice, CheckCircle2, ChefHat, ChevronDown, Download, FileSpreadsheet, Hourglass, Minus, Plus, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import Logo from '../components/Logo';
import WeekSelector from '../components/WeekSelector';
import { Button, Card, Checkbox, EmptyState, PageHeader, ProgressBar, StatCard, cx } from '../components/ui';
import { useData } from '../context/DataContext';
import { errorMessage, useUI } from '../context/UIContext';
import { productLabel } from '../lib/calc';
import { DELIVERY_DAYS } from '../lib/constants';
import { exportCSV, exportExcel, type Row } from '../lib/export';
import { fmtDate, fmtLong, num, parseDay, toISODate, todayISO } from '../lib/format';
import type { OrderFull, OrderItem } from '../lib/types';

interface Line {
  order: OrderFull;
  item: OrderItem;
}
interface Group {
  key: string;
  label: string;
  ordered: number;
  produced: number;
  lines: Line[];
}

export default function Production() {
  const { orders, setItemProduced } = useData();
  const { week, toast } = useUI();

  const days = DELIVERY_DAYS.map((d) => ({ ...d, date: toISODate(addDays(parseDay(week), d.offset)) }));
  const today = todayISO();
  const [selected, setSelected] = useState<string | null>(null);
  const current = days.find((d) => d.slug === selected) ?? days.find((d) => d.date >= today) ?? days[0];

  const activeOrders = useMemo(() => orders.filter((o) => !o.cancelled), [orders]);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const o of activeOrders) {
      if (o.delivery_date !== current.date) continue;
      for (const item of o.items) {
        const key = `${item.product_name}||${item.flavor ?? ''}`;
        const g = map.get(key) ?? { key, label: productLabel(item.product_name, item.flavor), ordered: 0, produced: 0, lines: [] };
        g.ordered += item.quantity;
        g.produced += Math.min(item.produced_qty, item.quantity);
        g.lines.push({ order: o, item });
        map.set(key, g);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.ordered - a.ordered);
  }, [activeOrders, current.date]);

  const totals = groups.reduce((t, g) => ({ ordered: t.ordered + g.ordered, produced: t.produced + g.produced }), { ordered: 0, produced: 0 });
  const pct = totals.ordered ? (totals.produced / totals.ordered) * 100 : 0;

  const countFor = (date: string) =>
    activeOrders.filter((o) => o.delivery_date === date).reduce((s, o) => s + (o.slices - o.producedSlices), 0);

  const setQty = async (item: OrderItem, qty: number) => {
    try {
      await setItemProduced(item.id, qty);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const markGroup = async (g: Group, done: boolean) => {
    try {
      for (const l of g.lines) {
        const target = done ? l.item.quantity : 0;
        if (l.item.produced_qty !== target) await setItemProduced(l.item.id, target);
      }
      toast(done ? `${g.label}: tudo pronto!` : `${g.label}: marcações desfeitas.`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const exportRows = (): Row[] =>
    groups.flatMap((g) =>
      g.lines.map((l) => ({
        'Data de entrega': fmtDate(current.date),
        Produto: g.label,
        Cliente: l.order.customer_name,
        'Horário': l.order.delivery_time ?? '',
        Fatias: l.item.quantity,
        Produzidas: l.item.produced_qty,
        Pendentes: l.item.quantity - l.item.produced_qty,
        'Observações': l.order.notes ?? '',
      })),
    );
  const summaryRows = (): Row[] =>
    groups.map((g) => ({
      Produto: g.label,
      Encomendadas: g.ordered,
      Produzidas: g.produced,
      Pendentes: g.ordered - g.produced,
      'Conclusão (%)': g.ordered ? Math.round((g.produced / g.ordered) * 100) : 0,
    }));

  const fileName = `producao-${current.slug}-${current.date}`;

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title="Controle de produção"
          subtitle="Tudo o que precisa ser produzido, agrupado por produto e sabor. Ao marcar fatias prontas, os ingredientes saem do estoque pela ficha técnica."
          actions={
            <>
              <WeekSelector />
              <Button variant="secondary" icon={Printer} onClick={() => window.print()} disabled={!groups.length}>
                Imprimir
              </Button>
              <Button variant="secondary" icon={Download} onClick={() => exportCSV(exportRows(), fileName)} disabled={!groups.length}>
                CSV
              </Button>
              <Button
                variant="secondary"
                icon={FileSpreadsheet}
                disabled={!groups.length}
                onClick={() =>
                  exportExcel(
                    [
                      { name: 'Resumo', rows: summaryRows() },
                      { name: 'Por pedido', rows: exportRows() },
                    ],
                    fileName,
                  )
                }
              >
                Excel
              </Button>
            </>
          }
        />

        {/* Abas de dias */}
        <div className="scrollbar-thin -mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
          {days.map((d) => {
            const pending = countFor(d.date);
            const isActive = d.slug === current.slug;
            return (
              <button
                key={d.slug}
                onClick={() => setSelected(d.slug)}
                className={cx(
                  'min-w-[104px] rounded-2xl px-4 py-2.5 text-left transition-all',
                  isActive ? 'bg-bordo text-creme shadow-lift' : 'bg-white text-bordo shadow-soft ring-1 ring-bordo/5 hover:-translate-y-0.5',
                )}
              >
                <p className="text-sm font-bold">{d.short}</p>
                <p className={cx('text-xs', isActive ? 'text-creme/60' : 'text-bordo/50')}>{fmtDate(d.date).slice(0, 5)}</p>
                <p className={cx('mt-1 text-[11px] font-semibold', pending ? (isActive ? 'text-rosa' : 'text-cereja') : isActive ? 'text-creme/50' : 'text-emerald-600')}>
                  {pending ? `${pending} pendente(s)` : 'em dia'}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cabeçalho de impressão */}
      <div className="print-only mb-6">
        <div className="flex items-center justify-between border-b border-bordo/20 pb-3">
          <Logo />
          <div className="text-right">
            <p className="font-display text-xl font-semibold">Lista de produção</p>
            <p className="text-sm capitalize">{fmtLong(parseDay(current.date))}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4">
        <StatCard label="Encomendadas" value={num(totals.ordered)} icon={CakeSlice} tone="cereja" />
        <StatCard label="Produzidas" value={num(totals.produced)} icon={CheckCircle2} tone="verde" />
        <StatCard label="Pendentes" value={num(totals.ordered - totals.produced)} icon={Hourglass} tone="amarelo" />
        <StatCard label="Conclusão" value={`${Math.round(pct)}%`} icon={ChefHat} tone="bordo" hint={<ProgressBar value={pct} className="mt-2 h-1.5" />} />
      </div>

      <div className="mt-5 space-y-3">
        {groups.length === 0 ? (
          <EmptyState icon={ChefHat} title="Nada para produzir neste dia" text="Quando houver pedidos com entrega nesta data, a lista aparecerá aqui." />
        ) : (
          groups.map((g) => <GroupCard key={g.key} g={g} onQty={setQty} onAll={markGroup} />)
        )}
      </div>
    </div>
  );
}

function GroupCard({ g, onQty, onAll }: { g: Group; onQty: (i: OrderItem, q: number) => void; onAll: (g: Group, done: boolean) => void }) {
  const [open, setOpen] = useState(true);
  const pct = g.ordered ? (g.produced / g.ordered) * 100 : 0;
  const done = g.produced >= g.ordered;

  return (
    <Card className={cx('p-0 animate-fade-in print:break-inside-avoid print:shadow-none print:ring-1 print:ring-black/20', done && 'ring-emerald-200')}>
      <div className="flex flex-wrap items-center gap-4 p-4">
        <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', done ? 'bg-emerald-100 text-emerald-600' : 'bg-rosa-50 text-cereja')}>
            {done ? <CheckCircle2 className="h-5 w-5" /> : <CakeSlice className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-semibold text-bordo">{g.label}</p>
            <p className="text-xs text-bordo/55">
              {g.lines.length} pedido(s) · <b className="text-bordo">{g.produced}</b> de <b className="text-bordo">{g.ordered}</b> fatias ·{' '}
              <span className={done ? 'text-emerald-600' : 'text-cereja'}>{g.ordered - g.produced} pendente(s)</span>
            </p>
          </div>
          <ChevronDown className={cx('ml-auto h-5 w-5 shrink-0 text-bordo/40 transition-transform print:hidden', open && 'rotate-180')} />
        </button>
        <div className="flex w-full items-center gap-3 sm:w-64">
          <ProgressBar value={pct} />
          <span className="w-11 text-right text-sm font-bold text-bordo">{Math.round(pct)}%</span>
        </div>
        <div className="print:hidden">
          <Checkbox checked={done} onChange={(v) => onAll(g, v)} label={<span className="text-xs font-semibold">Tudo pronto</span>} />
        </div>
      </div>

      {(open || typeof window === 'undefined') && (
        <ul className="divide-y divide-bordo/5 border-t border-bordo/5">
          {g.lines.map(({ order, item }) => {
            const itemDone = item.produced_qty >= item.quantity;
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Checkbox checked={itemDone} onChange={(v) => onQty(item, v ? item.quantity : 0)} />
                <div className="min-w-0 flex-1">
                  <p className={cx('text-sm font-semibold', itemDone ? 'text-bordo/45 line-through' : 'text-bordo')}>{order.customer_name}</p>
                  <p className="text-xs text-bordo/50">
                    {order.delivery_time ? `🕒 ${order.delivery_time.slice(0, 5)} · ` : ''}
                    {order.notes ?? ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-xl bg-creme-50 p-1 ring-1 ring-bordo/5">
                  <button
                    onClick={() => onQty(item, item.produced_qty - 1)}
                    disabled={item.produced_qty <= 0}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-bordo hover:bg-white disabled:opacity-30 print:hidden"
                    aria-label="Uma fatia a menos"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[56px] text-center text-sm">
                    <b className="text-bordo">{item.produced_qty}</b>
                    <span className="text-bordo/40">/{item.quantity}</span>
                  </span>
                  <button
                    onClick={() => onQty(item, item.produced_qty + 1)}
                    disabled={itemDone}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-bordo hover:bg-white disabled:opacity-30 print:hidden"
                    aria-label="Mais uma fatia pronta"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
