import { addDays } from 'date-fns';
import { CakeSlice, CheckCircle2, CircleDollarSign, Clock, Hourglass, Package, Plus, Receipt, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import OrderActions from '../components/OrderActions';
import { CustomerCell, DeliveryButton, ItemChecklist, ProductionSelect } from '../components/OrderBits';
import WeekSelector from '../components/WeekSelector';
import { Button, Card, Chip, EmptyState, PageHeader, PaymentBadge, ProgressBar, SearchInput, StatCard, StatusBadge, cx } from '../components/ui';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { DELIVERY_DAYS, PAYMENT_METHOD_LABEL, STATUS_META } from '../lib/constants';
import { brl, fmtLong, normalize, num, parseDay, toISODate } from '../lib/format';
import { summarize } from '../lib/stats';
import type { DisplayStatus, OrderFull } from '../lib/types';

const FILTERS: (DisplayStatus | 'todos')[] = ['todos', 'pendente', 'em_producao', 'pronto', 'entregue', 'cancelado'];

export default function Deliveries() {
  const { dia } = useParams();
  const day = DELIVERY_DAYS.find((d) => d.slug === dia);
  const { orders } = useData();
  const { week, openOrderForm } = useUI();
  const [filter, setFilter] = useState<DisplayStatus | 'todos'>('todos');
  const [q, setQ] = useState('');

  const date = day ? toISODate(addDays(parseDay(week), day.offset)) : '';
  const dayOrders = useMemo(() => orders.filter((o) => o.delivery_date === date), [orders, date]);
  const s = useMemo(() => summarize(dayOrders), [dayOrders]);

  const visible = useMemo(() => {
    const term = normalize(q);
    return dayOrders.filter((o) => (filter === 'todos' || o.status === filter) && (!term || normalize(o.customer_name).includes(term)));
  }, [dayOrders, filter, q]);

  if (!day) return <Navigate to="/" replace />;

  const counts = FILTERS.reduce<Record<string, number>>((acc, f) => {
    acc[f] = f === 'todos' ? dayOrders.length : dayOrders.filter((o) => o.status === f).length;
    return acc;
  }, {});
  const progress = s.slices ? (s.produced / s.slices) * 100 : 0;

  return (
    <div>
      <PageHeader
        title={`Entregas de ${day.label.toLowerCase()}`}
        subtitle={<span className="capitalize">{fmtLong(parseDay(date))}</span>}
        actions={
          <>
            <WeekSelector />
            <Button icon={Plus} onClick={() => openOrderForm({ initial: { delivery_date: date } })}>
              Pedido para este dia
            </Button>
          </>
        }
      />

      {/* Resumo do dia */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Pedidos" value={num(s.orders)} icon={Receipt} tone="bordo" />
        <StatCard label="Fatias vendidas" value={num(s.slices)} icon={CakeSlice} tone="cereja" />
        <StatCard label="Fatias produzidas" value={num(s.produced)} icon={CheckCircle2} tone="verde" />
        <StatCard label="Fatias pendentes" value={num(s.pendingSlices)} icon={Hourglass} tone="amarelo" />
        <StatCard label="Vendas do dia" value={brl(s.sales)} icon={CircleDollarSign} tone="rosa" />
        <StatCard label="Recebido" value={brl(s.received)} icon={Package} tone="verde" />
        <StatCard label="A receber" value={brl(s.pending)} icon={Clock} tone="laranja" />
      </div>

      {s.slices > 0 && (
        <Card className="mt-4 py-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-bordo">Produção do dia</span>
            <span className="font-bold text-cereja">{Math.round(progress)}%</span>
          </div>
          <ProgressBar value={progress} />
        </Card>
      )}

      {/* Filtros */}
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {FILTERS.map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)} dot={f !== 'todos' ? STATUS_META[f].dot : undefined}>
              {f === 'todos' ? 'Todos' : STATUS_META[f].label} ({counts[f]})
            </Chip>
          ))}
        </div>
        <div className="lg:w-72">
          <SearchInput value={q} onChange={setQ} placeholder="Pesquisar cliente…" />
        </div>
      </div>

      <div className="mt-4">
        {visible.length === 0 ? (
          <EmptyState
            icon={Truck}
            title={dayOrders.length ? 'Nenhum pedido com esse filtro' : 'Nenhuma entrega neste dia'}
            text={dayOrders.length ? 'Tente outro filtro ou limpe a pesquisa.' : 'Os pedidos com entrega nesta data aparecerão aqui.'}
            action={!dayOrders.length && <Button icon={Plus} onClick={() => openOrderForm({ initial: { delivery_date: date } })}>Cadastrar pedido</Button>}
          />
        ) : (
          <>
            <DesktopTable orders={visible} />
            <MobileCards orders={visible} />
          </>
        )}
      </div>
    </div>
  );
}

function DesktopTable({ orders }: { orders: OrderFull[] }) {
  return (
    <div className="hidden overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-bordo/5 lg:block">
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-bordo/5 bg-creme-50 text-left text-[11px] font-bold uppercase tracking-wider text-bordo/50">
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Produtos (marque os prontos)</th>
              <th className="px-4 py-3 text-center">Fatias</th>
              <th className="px-4 py-3 text-right">Valor total</th>
              <th className="px-4 py-3">Produção</th>
              <th className="px-4 py-3">Pagamento</th>
              <th className="px-4 py-3">Entrega</th>
              <th className="px-4 py-3">Observações</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bordo/5">
            {orders.map((o) => (
              <tr key={o.id} className={cx('align-top transition hover:bg-creme-50/60', o.cancelled && 'bg-red-50/40')}>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <span className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', STATUS_META[o.status].dot)} />
                    <CustomerCell order={o} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <ItemChecklist order={o} />
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="font-bold text-bordo">{o.producedSlices}</span>
                  <span className="text-bordo/40">/{o.slices}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="font-bold text-bordo">{brl(o.total)}</p>
                  {o.balance > 0 && <p className="text-xs text-cereja">falta {brl(o.balance)}</p>}
                </td>
                <td className="px-4 py-3">
                  <ProductionSelect order={o} />
                </td>
                <td className="px-4 py-3">
                  <PaymentBadge status={o.paymentStatusLive} />
                  <p className="mt-1 text-xs text-bordo/50">{PAYMENT_METHOD_LABEL[o.payment_method]}</p>
                </td>
                <td className="px-4 py-3">
                  <DeliveryButton order={o} />
                </td>
                <td className="max-w-[200px] px-4 py-3 text-xs text-bordo/60">
                  {o.cancelled ? <span className="text-red-600">Cancelado{o.cancel_reason ? `: ${o.cancel_reason}` : ''}</span> : o.notes || '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <OrderActions order={o} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MobileCards({ orders }: { orders: OrderFull[] }) {
  return (
    <div className="space-y-3 lg:hidden">
      {orders.map((o) => (
        <div key={o.id} className={cx('rounded-2xl bg-white p-4 shadow-soft ring-1 ring-bordo/5 animate-fade-in', o.cancelled && 'opacity-80')}>
          <div className="flex items-start justify-between gap-2">
            <CustomerCell order={o} />
            <OrderActions order={o} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {o.cancelled ? <StatusBadge status="cancelado" /> : <ProductionSelect order={o} />}
            <PaymentBadge status={o.paymentStatusLive} />
            <span className="text-xs text-bordo/50">{PAYMENT_METHOD_LABEL[o.payment_method]}</span>
          </div>
          <div className="mt-3 rounded-xl bg-creme-50 p-3">
            <ItemChecklist order={o} />
          </div>
          {(o.notes || o.cancel_reason) && <p className="mt-2 text-xs text-bordo/60">📝 {o.cancelled ? `Cancelado: ${o.cancel_reason ?? ''}` : o.notes}</p>}
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-bordo/5 pt-3">
            <div>
              <p className="font-display text-lg font-semibold text-bordo">{brl(o.total)}</p>
              <p className="text-xs text-bordo/50">
                {o.producedSlices}/{o.slices} fatias prontas{o.balance > 0 ? ` · falta ${brl(o.balance)}` : ''}
              </p>
            </div>
            <DeliveryButton order={o} />
          </div>
        </div>
      ))}
    </div>
  );
}
