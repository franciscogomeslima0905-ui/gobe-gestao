import { ArrowLeft, CakeSlice, Download, History as HistoryIcon, MessageCircle, Receipt, Users, Wallet, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import OrderActions from '../components/OrderActions';
import { Button, Card, Chip, EmptyState, Input, PageHeader, PaymentBadge, SearchInput, Segmented, Select, StatCard, StatusBadge, cx } from '../components/ui';
import { useData } from '../context/DataContext';
import { customerKey, productLabel } from '../lib/calc';
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, STATUS_META } from '../lib/constants';
import { exportCSV, type Row } from '../lib/export';
import { brl, fmtDate, fmtPhone, normalize, num, whatsappLink } from '../lib/format';
import { customerStats, productStats } from '../lib/stats';
import type { DisplayStatus, OrderFull, PaymentMethod } from '../lib/types';

const PAGE = 25;
const STATUSES: (DisplayStatus | 'todos')[] = ['todos', 'pendente', 'em_producao', 'pronto', 'entregue', 'cancelado'];

export default function HistoryPage() {
  const { orders } = useData();
  const [params, setParams] = useSearchParams();
  const selectedCustomer = params.get('cliente');
  const [view, setView] = useState<'pedidos' | 'clientes'>('pedidos');

  if (selectedCustomer) return <CustomerDetail name={selectedCustomer} onBack={() => setParams({})} />;

  return (
    <div>
      <PageHeader
        title="Histórico de pedidos"
        subtitle={`${num(orders.length)} pedido(s) registrados. Nada é apagado automaticamente.`}
        actions={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'pedidos', label: 'Pedidos' },
              { value: 'clientes', label: 'Clientes' },
            ]}
          />
        }
      />
      {view === 'pedidos' ? <OrdersList orders={orders} /> : <CustomersList orders={orders} onPick={(n) => setParams({ cliente: n })} />}
    </div>
  );
}

function OrdersList({ orders, hideCustomer }: { orders: OrderFull[]; hideCustomer?: boolean }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<DisplayStatus | 'todos'>('todos');
  const [method, setMethod] = useState<PaymentMethod | 'todas'>('todas');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const term = normalize(q);
    const digits = q.replace(/\D/g, '');
    return orders
      .filter((o) => {
        if (status !== 'todos' && o.status !== status) return false;
        if (method !== 'todas' && o.payment_method !== method) return false;
        if (from && o.delivery_date < from) return false;
        if (to && o.delivery_date > to) return false;
        if (!term) return true;
        return (
          normalize(o.customer_name).includes(term) ||
          (digits.length >= 3 && (o.phone ?? '').replace(/\D/g, '').includes(digits)) ||
          o.items.some((i) => normalize(productLabel(i.product_name, i.flavor)).includes(term)) ||
          normalize(o.notes ?? '').includes(term)
        );
      })
      .sort((a, b) => b.delivery_date.localeCompare(a.delivery_date) || b.created_at.localeCompare(a.created_at));
  }, [orders, q, status, method, from, to]);

  useEffect(() => setPage(1), [q, status, method, from, to]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE);
  const hasFilters = q || status !== 'todos' || method !== 'todas' || from || to;

  const exportRows = (): Row[] =>
    filtered.map((o) => ({
      'Data de entrega': fmtDate(o.delivery_date),
      'Data do pedido': fmtDate(o.order_date),
      Cliente: o.customer_name,
      Telefone: fmtPhone(o.phone),
      Produtos: o.items.map((i) => `${i.quantity}x ${productLabel(i.product_name, i.flavor)}`).join(', '),
      Fatias: o.slices,
      Total: o.cancelled ? 0 : o.total,
      'Valor pago': o.netPaid,
      'Forma de pagamento': PAYMENT_METHOD_LABEL[o.payment_method],
      Pagamento: o.cancelled ? 'Cancelado' : PAYMENT_STATUS_LABEL[o.paymentStatusLive],
      'Situação': STATUS_META[o.status].label,
      'Observações': o.notes ?? '',
    }));

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
          <SearchInput value={q} onChange={setQ} placeholder="Cliente, telefone, produto ou observação…" />
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | 'todas')} className="bg-white md:w-44">
            <option value="todas">Todas as formas</option>
            <option value="pix">Pix</option>
            <option value="dinheiro">Dinheiro</option>
            <option value="a_definir">A definir</option>
          </Select>
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-white" title="Entrega a partir de" />
            <span className="text-xs text-bordo/50">até</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-white" title="Entrega até" />
          </div>
          <Button variant="secondary" icon={Download} onClick={() => exportCSV(exportRows(), 'historico-pedidos')}>
            Exportar
          </Button>
        </div>
        <div className="scrollbar-thin flex items-center gap-2 overflow-x-auto pb-1">
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)} dot={s !== 'todos' ? STATUS_META[s].dot : undefined}>
              {s === 'todos' ? 'Todos' : STATUS_META[s].label}
            </Chip>
          ))}
          {hasFilters && (
            <button
              onClick={() => {
                setQ('');
                setStatus('todos');
                setMethod('todas');
                setFrom('');
                setTo('');
              }}
              className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-cereja hover:underline"
            >
              <X className="h-3.5 w-3.5" /> Limpar filtros
            </button>
          )}
        </div>
      </Card>

      <p className="text-sm text-bordo/60">{num(filtered.length)} pedido(s) encontrado(s)</p>

      {shown.length === 0 ? (
        <EmptyState icon={HistoryIcon} title="Nenhum pedido encontrado" text={hasFilters ? 'Ajuste os filtros para ver mais resultados.' : 'Os pedidos cadastrados aparecerão aqui.'} />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-bordo/5">
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-bordo/5 bg-creme-50 text-left text-[11px] font-bold uppercase tracking-wider text-bordo/50">
                  <th className="px-4 py-3">Entrega</th>
                  {!hideCustomer && <th className="px-4 py-3">Cliente</th>}
                  <th className="px-4 py-3">Produtos</th>
                  <th className="px-4 py-3 text-center">Fatias</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Pago</th>
                  <th className="px-4 py-3">Pagamento</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bordo/5">
                {shown.map((o) => (
                  <tr key={o.id} className="align-top hover:bg-creme-50/60">
                    <td className="whitespace-nowrap px-4 py-3">
                      <p className="font-semibold text-bordo">{fmtDate(o.delivery_date)}</p>
                      <p className="text-xs text-bordo/45">pedido {fmtDate(o.order_date)}</p>
                    </td>
                    {!hideCustomer && (
                      <td className="px-4 py-3">
                        <p className={cx('font-semibold text-bordo', o.cancelled && 'line-through opacity-60')}>{o.customer_name}</p>
                        {o.phone && <p className="text-xs text-bordo/45">{fmtPhone(o.phone)}</p>}
                      </td>
                    )}
                    <td className="max-w-[280px] px-4 py-3 text-bordo/80">
                      {o.items.map((i) => (
                        <p key={i.id}>
                          <b>{i.quantity}×</b> {productLabel(i.product_name, i.flavor)} <span className="text-xs text-bordo/40">({brl(i.unit_price)})</span>
                        </p>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-bordo">{o.slices}</td>
                    <td className="px-4 py-3 text-right font-bold text-bordo">{brl(o.total)}</td>
                    <td className="px-4 py-3 text-right text-bordo/80">{brl(o.netPaid)}</td>
                    <td className="px-4 py-3">
                      {!o.cancelled && <PaymentBadge status={o.paymentStatusLive} />}
                      <p className="mt-1 text-xs text-bordo/50">{PAYMENT_METHOD_LABEL[o.payment_method]}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <OrderActions order={o} allowDelete />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-bordo/5 px-4 py-3 text-sm">
              <span className="text-bordo/60">
                Página {page} de {pages}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  Anterior
                </Button>
                <Button size="sm" variant="secondary" disabled={page === pages} onClick={() => setPage((p) => p + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CustomersList({ orders, onPick }: { orders: OrderFull[]; onPick: (name: string) => void }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'total' | 'orders' | 'last' | 'name'>('total');
  const list = useMemo(() => {
    const term = normalize(q);
    const all = customerStats(orders).filter((c) => !term || normalize(c.name).includes(term) || (c.phone ?? '').includes(q.replace(/\D/g, '') || '§'));
    return all.sort((a, b) =>
      sort === 'total' ? b.total - a.total : sort === 'orders' ? b.orders - a.orders : sort === 'last' ? b.last.localeCompare(a.last) : a.name.localeCompare(b.name),
    );
  }, [orders, q, sort]);

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
        <SearchInput value={q} onChange={setQ} placeholder="Pesquisar cliente…" />
        <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="bg-white md:w-56">
          <option value="total">Maior valor comprado</option>
          <option value="orders">Mais pedidos</option>
          <option value="last">Compra mais recente</option>
          <option value="name">Nome (A–Z)</option>
        </Select>
      </Card>
      {list.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum cliente encontrado" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <button
              key={c.key}
              onClick={() => onPick(c.name)}
              className="rounded-2xl bg-white p-4 text-left shadow-soft ring-1 ring-bordo/5 transition hover:-translate-y-0.5 hover:shadow-lift animate-fade-in"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rosa-100 font-display text-lg font-semibold text-bordo">
                  {c.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-bordo">{c.name}</p>
                  <p className="text-xs text-bordo/50">{c.phone ? fmtPhone(c.phone) : 'Sem telefone'}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-creme-50 py-2">
                  <p className="text-bordo/50">Pedidos</p>
                  <p className="font-bold text-bordo">{c.orders}</p>
                </div>
                <div className="rounded-xl bg-creme-50 py-2">
                  <p className="text-bordo/50">Total</p>
                  <p className="font-bold text-bordo">{brl(c.total)}</p>
                </div>
                <div className={cx('rounded-xl py-2', c.balance > 0 ? 'bg-rosa-50' : 'bg-creme-50')}>
                  <p className="text-bordo/50">A receber</p>
                  <p className={cx('font-bold', c.balance > 0 ? 'text-cereja' : 'text-bordo')}>{brl(c.balance)}</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-bordo/45">Última compra: {fmtDate(c.last)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerDetail({ name, onBack }: { name: string; onBack: () => void }) {
  const { orders } = useData();
  const key = customerKey(name);
  const mine = useMemo(() => orders.filter((o) => customerKey(o.customer_name) === key), [orders, key]);
  const stats = customerStats(mine)[0];
  const favorites = productStats(mine).slice(0, 5);
  const phone = mine.find((o) => o.phone)?.phone ?? null;
  const wa = whatsappLink(phone);

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-cereja hover:underline">
        <ArrowLeft className="h-4 w-4" /> Voltar ao histórico
      </button>
      <PageHeader
        title={mine[0]?.customer_name ?? name}
        subtitle={
          <span className="flex flex-wrap items-center gap-3">
            {phone ? fmtPhone(phone) : 'Sem telefone cadastrado'}
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            )}
          </span>
        }
      />
      {mine.length === 0 ? (
        <EmptyState icon={Users} title="Cliente sem pedidos" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Pedidos" value={num(stats?.orders ?? 0)} icon={Receipt} tone="bordo" hint={`${mine.length - (stats?.orders ?? 0)} cancelado(s)`} />
            <StatCard label="Fatias compradas" value={num(stats?.slices ?? 0)} icon={CakeSlice} tone="cereja" />
            <StatCard label="Total comprado" value={brl(stats?.total ?? 0)} icon={Wallet} tone="verde" hint={`Pago: ${brl(stats?.paid ?? 0)}`} />
            <StatCard label="A receber" value={brl(stats?.balance ?? 0)} icon={Wallet} tone="laranja" />
          </div>
          {favorites.length > 0 && (
            <Card>
              <p className="mb-3 text-sm font-semibold text-bordo">Produtos preferidos</p>
              <div className="flex flex-wrap gap-2">
                {favorites.map((f) => (
                  <span key={f.key} className="rounded-full bg-rosa-50 px-3 py-1 text-xs font-semibold text-bordo ring-1 ring-rosa-100">
                    {f.label} · {f.qty} fatias
                  </span>
                ))}
              </div>
            </Card>
          )}
          <OrdersList orders={mine} hideCustomer />
        </>
      )}
    </div>
  );
}
