import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  BadgeDollarSign,
  CakeSlice,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crown,
  Hourglass,
  PackageCheck,
  Receipt,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CountBars, Donut, EvolutionArea, HorizontalBars, MoneyBars } from '../components/Charts';
import PeriodFilter, { defaultPeriod } from '../components/PeriodFilter';
import { Card, EmptyState, IconButton, PageHeader, SectionTitle, StatCard, cx } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useStock } from '../context/StockContext';
import { useUI } from '../context/UIContext';
import { buildAlerts } from '../lib/alerts';
import { DELIVERY_DAYS, NO_DELIVERY_WEEKDAYS } from '../lib/constants';
import { brl, fmtPattern, num, parseDay, round2, toISODate, todayISO } from '../lib/format';
import { daysOf, getRange, inRange, weekEnd, weekStart, type PeriodState, type Range } from '../lib/period';
import { active, cashIn, customerStats, flavorStats, ordersIn, productStats } from '../lib/stats';
import type { OrderFull } from '../lib/types';

const sumTotal = (orders: OrderFull[]) => round2(active(orders).reduce((s, o) => s + o.total, 0));

export default function Dashboard() {
  const { orders, payments } = useData();
  const { ingredients } = useStock();
  const { staffName } = useAuth();
  const [period, setPeriod] = useState<PeriodState>(defaultPeriod('mes'));
  const range = getRange(period);
  const today = todayISO();
  const now = new Date();

  /* indicadores fixos */
  const fixed = useMemo(() => {
    const week: Range = { start: toISODate(weekStart(now)), end: toISODate(weekEnd(now)) };
    const month: Range = { start: toISODate(startOfMonth(now)), end: toISODate(endOfMonth(now)) };
    return {
      total: sumTotal(orders),
      day: sumTotal(ordersIn(orders, { start: today, end: today })),
      week: sumTotal(ordersIn(orders, week)),
      month: sumTotal(ordersIn(orders, month)),
      slicesToday: active(ordersIn(orders, { start: today, end: today })).reduce((s, o) => s + o.slices, 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, today]);

  /* indicadores do período */
  const p = useMemo(() => {
    const list = ordersIn(orders, range);
    const act = active(list);
    const sales = sumTotal(list);
    const cash = cashIn(payments, range);
    return {
      list,
      act,
      sales,
      cash,
      pending: round2(act.reduce((s, o) => s + o.balance, 0)),
      slices: act.reduce((s, o) => s + o.slices, 0),
      count: act.length,
      pendingProd: act.filter((o) => o.status === 'pendente' || o.status === 'em_producao').length,
      ready: act.filter((o) => o.status === 'pronto').length,
      delivered: act.filter((o) => o.status === 'entregue').length,
      ticket: act.length ? round2(sales / act.length) : 0,
    };
  }, [orders, payments, range.start, range.end]);

  /* séries dos gráficos (agrupa por mês em períodos longos) */
  const series = useMemo(() => {
    const days = daysOf(range);
    const byMonth = days.length > 62;
    const keyOf = (iso: string) => (byMonth ? iso.slice(0, 7) : iso);
    const keys = Array.from(new Set(days.map(keyOf)));
    const money = new Map(keys.map((k) => [k, 0]));
    const slices = new Map(keys.map((k) => [k, 0]));
    for (const o of p.act) {
      const k = keyOf(o.delivery_date);
      money.set(k, (money.get(k) ?? 0) + o.total);
      slices.set(k, (slices.get(k) ?? 0) + o.slices);
    }
    const label = (k: string) => (byMonth ? format(parseDay(`${k}-01`), 'MMM/yy', { locale: ptBR }) : format(parseDay(k), 'dd/MM'));
    let acc = 0;
    return {
      revenue: keys.map((k) => ({ label: label(k), value: round2(money.get(k) ?? 0) })),
      evolution: keys.map((k) => {
        acc += money.get(k) ?? 0;
        return { label: label(k), value: round2(money.get(k) ?? 0), acumulado: round2(acc) };
      }),
      slices: keys.map((k) => ({ label: label(k), value: slices.get(k) ?? 0 })),
      byMonth,
    };
  }, [p.act, range.start, range.end]);

  const products = useMemo(() => productStats(p.act), [p.act]);
  const flavors = useMemo(() => flavorStats(p.act), [p.act]);
  const customers = useMemo(() => customerStats(p.act).sort((a, b) => b.total - a.total).slice(0, 8), [p.act]);
  const alerts = useMemo(() => buildAlerts(orders, ingredients).slice(0, 6), [orders, ingredients]);

  const greeting = now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting}${staffName ? `, ${staffName.split(' ')[0]}` : ''}!`}
        subtitle={<span className="capitalize">{fmtPattern(now, "EEEE, dd 'de' MMMM 'de' yyyy")}</span>}
      />

      {/* Faturamento fixo */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HeroStat label="Faturamento hoje" value={brl(fixed.day)} hint={`${num(fixed.slicesToday)} fatias para hoje`} icon={TrendingUp} strong />
        <HeroStat label="Faturamento da semana" value={brl(fixed.week)} icon={CalendarDays} />
        <HeroStat label="Faturamento do mês" value={brl(fixed.month)} icon={BadgeDollarSign} />
        <HeroStat label="Faturamento total" value={brl(fixed.total)} hint="Desde o início" icon={Crown} />
      </div>

      {/* Filtro de período */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/60 p-3 ring-1 ring-bordo/5">
        <p className="px-1 text-sm font-semibold text-bordo">Indicadores do período</p>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Vendas no período" value={brl(p.sales)} icon={BadgeDollarSign} tone="cereja" hint="Por data de entrega" />
        <StatCard label="Valores recebidos" value={brl(p.cash.total)} icon={Wallet} tone="verde" hint="Dinheiro que entrou no período" />
        <StatCard label="Valores pendentes" value={brl(p.pending)} icon={Clock} tone="laranja" hint="Saldo dos pedidos do período" />
        <StatCard label="Fatias vendidas" value={num(p.slices)} icon={CakeSlice} tone="rosa" hint={`Hoje: ${num(fixed.slicesToday)}`} />
        <StatCard label="Ticket médio" value={brl(p.ticket)} icon={Receipt} tone="bordo" hint="Por pedido" />
        <StatCard label="Total de pedidos" value={num(p.count)} icon={Receipt} tone="bordo" />
        <StatCard label="Pendentes de produção" value={num(p.pendingProd)} icon={Hourglass} tone="amarelo" />
        <StatCard label="Pedidos prontos" value={num(p.ready)} icon={CheckCircle2} tone="verde" />
        <StatCard label="Pedidos entregues" value={num(p.delivered)} icon={PackageCheck} tone="roxo" />
        <StatCard label="Fatias hoje" value={num(fixed.slicesToday)} icon={CakeSlice} tone="cereja" />
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle icon={BadgeDollarSign} title={series.byMonth ? 'Faturamento por mês' : 'Faturamento por dia'} />
          <div className="h-64">
            <MoneyBars data={series.revenue} />
          </div>
        </Card>
        <Card>
          <SectionTitle icon={TrendingUp} title="Evolução das vendas" subtitle="Faturamento acumulado no período" />
          <div className="h-64">
            <EvolutionArea data={series.evolution} />
          </div>
        </Card>
        <Card>
          <SectionTitle icon={CakeSlice} title={series.byMonth ? 'Fatias vendidas por mês' : 'Fatias vendidas por dia'} />
          <div className="h-64">
            <CountBars data={series.slices} />
          </div>
        </Card>
        <Card>
          <SectionTitle icon={Trophy} title="Produtos mais vendidos" />
          <div className="h-64">
            <HorizontalBars data={products.slice(0, 8).map((x) => ({ name: x.label, value: x.qty }))} />
          </div>
        </Card>
        <Card>
          <SectionTitle icon={Wallet} title="Recebimentos por forma" subtitle="Pix × Dinheiro, pela data do pagamento" />
          <div className="h-56">
            <Donut
              money
              colors={['#CE0D32', '#581D29', '#C99A6B']}
              data={[
                { name: 'Pix', value: Math.max(0, p.cash.pix) },
                { name: 'Dinheiro', value: Math.max(0, p.cash.dinheiro) },
                ...(p.cash.outros > 0 ? [{ name: 'Outros', value: p.cash.outros }] : []),
              ].filter((d) => d.value > 0)}
            />
          </div>
        </Card>
        <Card>
          <SectionTitle icon={CakeSlice} title="Vendas por sabor" subtitle="Distribuição das fatias" />
          <div className="h-56">
            <Donut data={flavors} />
          </div>
        </Card>
      </div>

      {/* Alertas + calendário */}
      <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        <AlertsCard alerts={alerts} />
        <DeliveryCalendar orders={orders} />
      </div>

      {/* Rankings */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle icon={Trophy} title="Ranking de produtos" subtitle="No período selecionado" />
          {products.length === 0 ? (
            <p className="py-6 text-center text-sm text-bordo/40">Sem vendas no período</p>
          ) : (
            <ol className="space-y-2">
              {products.slice(0, 8).map((x, i) => (
                <RankRow key={x.key} pos={i + 1} title={x.label} sub={`${num(x.qty)} fatias`} value={brl(x.revenue)} pct={(x.qty / products[0].qty) * 100} />
              ))}
            </ol>
          )}
        </Card>
        <Card>
          <SectionTitle icon={Users} title="Clientes que mais compram" subtitle="No período selecionado" />
          {customers.length === 0 ? (
            <p className="py-6 text-center text-sm text-bordo/40">Sem vendas no período</p>
          ) : (
            <ol className="space-y-2">
              {customers.map((c, i) => (
                <RankRow key={c.key} pos={i + 1} title={c.name} sub={`${c.orders} pedido(s) · ${num(c.slices)} fatias`} value={brl(c.total)} pct={(c.total / customers[0].total) * 100} />
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}

function HeroStat({ label, value, hint, icon: Icon, strong }: { label: string; value: string; hint?: string; icon: typeof Crown; strong?: boolean }) {
  return (
    <div
      className={cx(
        'relative overflow-hidden rounded-2xl p-4 shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift animate-fade-in sm:p-5',
        strong ? 'bg-gradient-to-br from-cereja to-bordo text-white' : 'bg-white text-bordo ring-1 ring-bordo/5',
      )}
    >
      <div className={cx('absolute -right-6 -top-6 h-24 w-24 rounded-full', strong ? 'bg-white/10' : 'bg-rosa-50')} />
      <Icon className={cx('relative h-5 w-5', strong ? 'text-rosa' : 'text-cereja')} />
      <p className={cx('relative mt-3 text-xs font-semibold uppercase tracking-wide', strong ? 'text-white/70' : 'text-bordo/50')}>{label}</p>
      <p className="relative mt-0.5 font-display text-xl font-semibold sm:text-2xl">{value}</p>
      {hint && <p className={cx('relative mt-0.5 text-xs', strong ? 'text-white/70' : 'text-bordo/45')}>{hint}</p>}
    </div>
  );
}

function RankRow({ pos, title, sub, value, pct }: { pos: number; title: string; sub: string; value: string; pct: number }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={cx(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
          pos === 1 ? 'bg-cereja text-white' : pos === 2 ? 'bg-bordo text-creme' : pos === 3 ? 'bg-rosa text-bordo' : 'bg-creme text-bordo/60',
        )}
      >
        {pos}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold text-bordo">{title}</p>
          <p className="shrink-0 text-sm font-bold text-bordo">{value}</p>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-creme-200">
            <div className="h-full rounded-full bg-gradient-to-r from-cereja to-rosa-500 transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-[11px] text-bordo/45">{sub}</span>
        </div>
      </div>
    </li>
  );
}

function AlertsCard({ alerts }: { alerts: ReturnType<typeof buildAlerts> }) {
  const { openOrderForm, openPayment } = useUI();
  const navigate = useNavigate();
  return (
    <Card>
      <SectionTitle icon={AlertTriangle} title="Alertas" subtitle="Entregas próximas, pagamentos pendentes e estoque" />
      {alerts.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Tudo em dia" text="Nenhuma entrega atrasada ou pagamento pendente para os próximos dias." />
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => {
                  if (!a.order) return navigate('/estoque');
                  if (a.kind === 'pagamento') openPayment(a.order.id);
                  else if (a.kind === 'estorno') openPayment(a.order.id, 'estorno');
                  else openOrderForm({ orderId: a.order.id });
                }}
                className="flex w-full items-start gap-3 rounded-xl p-3 text-left transition hover:bg-creme-50"
              >
                <span
                  className={cx(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                    a.kind === 'atraso' ? 'bg-red-100 text-red-600' : a.kind === 'entrega' ? 'bg-amber-100 text-amber-700' : 'bg-rosa-50 text-cereja',
                  )}
                >
                  {a.kind === 'pagamento' || a.kind === 'estorno' ? <Wallet className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-bordo">{a.title}</span>
                  <span className="block text-xs text-bordo/55">{a.text}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const SLUG_BY_WEEKDAY: Record<number, string> = { 1: 'segunda', 3: 'quarta', 5: 'sexta', 6: 'sabado', 0: 'domingo' };

function DeliveryCalendar({ orders }: { orders: OrderFull[] }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const navigate = useNavigate();
  const { setWeek } = useUI();
  const today = todayISO();

  const byDay = useMemo(() => {
    const m = new Map<string, { count: number; slices: number; pending: number; total: number }>();
    for (const o of orders) {
      if (o.cancelled) continue;
      const cur = m.get(o.delivery_date) ?? { count: 0, slices: 0, pending: 0, total: 0 };
      cur.count += 1;
      cur.slices += o.slices;
      cur.total += o.total;
      if (o.delivery_status !== 'entregue') cur.pending += 1;
      m.set(o.delivery_date, cur);
    }
    return m;
  }, [orders]);

  const days = eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const monthRange: Range = { start: toISODate(startOfMonth(month)), end: toISODate(endOfMonth(month)) };
  const monthCount = Array.from(byDay.entries()).filter(([d]) => inRange(d, monthRange)).reduce((s, [, v]) => s + v.count, 0);

  return (
    <Card>
      <SectionTitle
        icon={CalendarDays}
        title="Calendário de entregas"
        subtitle={`${monthCount} pedido(s) no mês`}
        action={
          <div className="flex items-center gap-1">
            <IconButton icon={ChevronLeft} label="Mês anterior" onClick={() => setMonth((m) => addMonths(m, -1))} />
            <span className="min-w-[120px] text-center text-sm font-semibold capitalize text-bordo">{format(month, 'MMMM yyyy', { locale: ptBR })}</span>
            <IconButton icon={ChevronRight} label="Próximo mês" onClick={() => setMonth((m) => addMonths(m, 1))} />
          </div>
        }
      />
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wide text-bordo/40">
        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const iso = toISODate(d);
          const info = byDay.get(iso);
          const off = NO_DELIVERY_WEEKDAYS.includes(getDay(d));
          const inMonth = isSameMonth(d, month);
          const slug = SLUG_BY_WEEKDAY[getDay(d)];
          return (
            <button
              key={iso}
              disabled={off}
              onClick={() => {
                if (!slug) return;
                setWeek(iso);
                navigate(`/entregas/${slug}`);
              }}
              title={info ? `${info.count} pedido(s) · ${info.slices} fatias · ${brl(info.total)}` : undefined}
              className={cx(
                'relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition sm:aspect-[1.25]',
                !inMonth && 'opacity-35',
                off ? 'cursor-not-allowed bg-transparent text-bordo/25 line-through' : 'hover:bg-rosa-50',
                iso === today && 'ring-2 ring-cereja',
                info && !off && (info.pending ? 'bg-rosa-50' : 'bg-violet-50'),
              )}
            >
              <span className={cx('font-semibold', iso === today ? 'text-cereja' : 'text-bordo')}>{format(d, 'd')}</span>
              {info && (
                <span className={cx('mt-0.5 rounded-full px-1.5 text-[10px] font-bold leading-4', info.pending ? 'bg-cereja text-white' : 'bg-violet-500 text-white')}>
                  {info.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-bordo/55">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-cereja" /> Com entregas pendentes
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-500" /> Tudo entregue
        </span>
        <span className="flex items-center gap-1.5">
          <span className="line-through">Ter/Qui</span> sem entregas
        </span>
      </div>
    </Card>
  );
}
