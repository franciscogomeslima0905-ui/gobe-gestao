import { AlertTriangle, ArrowDownUp, CakeSlice, Download, PieChart, TrendingUp, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { HorizontalBars } from '../components/Charts';
import PeriodFilter, { defaultPeriod } from '../components/PeriodFilter';
import { Button, Card, EmptyState, PageHeader, SectionTitle, StatCard, cx } from '../components/ui';
import { useData } from '../context/DataContext';
import { useStock } from '../context/StockContext';
import { productLabel } from '../lib/calc';
import { profitByProduct, type ProductProfit } from '../lib/costs';
import { exportCSV } from '../lib/export';
import { brl, num } from '../lib/format';
import { getRange, type PeriodState } from '../lib/period';
import { ordersIn } from '../lib/stats';

type SortKey = 'profit' | 'profitPerSlice' | 'margin' | 'revenue' | 'qty';
const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

export default function Profitability() {
  const { orders, products } = useData();
  const { sliceCost } = useStock();
  const [period, setPeriod] = useState<PeriodState>(defaultPeriod('mes'));
  const [sort, setSort] = useState<SortKey>('profit');
  const [asc, setAsc] = useState(false);
  const range = getRange(period);

  const data = useMemo(() => profitByProduct(ordersIn(orders, range), sliceCost, products, productLabel), [orders, range.start, range.end, sliceCost, products]);
  const sorted = useMemo(
    () =>
      [...data].sort((a, b) => {
        const av = (a[sort] ?? -Infinity) as number;
        const bv = (b[sort] ?? -Infinity) as number;
        return asc ? av - bv : bv - av;
      }),
    [data, sort, asc],
  );

  const totals = data.reduce((t, p) => ({ revenue: t.revenue + p.revenue, cost: t.cost + p.cost, profit: t.profit + p.profit, qty: t.qty + p.qty }), { revenue: 0, cost: 0, profit: 0, qty: 0 });
  const missing = data.filter((p) => p.noRecipe);

  const head = (key: SortKey, label: string) => (
    <th className="px-4 py-3 text-right">
      <button
        onClick={() => (sort === key ? setAsc(!asc) : (setSort(key), setAsc(false)))}
        className={cx('inline-flex items-center gap-1 uppercase', sort === key ? 'text-cereja' : 'hover:text-bordo')}
      >
        {label}
        <ArrowDownUp className="h-3 w-3" />
      </button>
    </th>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rentabilidade por produto"
        subtitle="Quais brownies dão mais lucro, considerando o custo da ficha técnica."
        actions={
          <Button
            variant="secondary"
            icon={Download}
            onClick={() =>
              exportCSV(
                sorted.map((p) => ({
                  Produto: p.label,
                  'Quantidade vendida': p.qty,
                  'Preço de venda': p.price,
                  'Custo por fatia': p.costPerSlice !== null ? Number(p.costPerSlice.toFixed(2)) : '',
                  'Lucro por fatia': p.profitPerSlice !== null ? Number(p.profitPerSlice.toFixed(2)) : '',
                  'Margem (%)': p.margin !== null ? Number((p.margin * 100).toFixed(1)) : '',
                  Faturamento: p.revenue,
                  'Lucro estimado total': p.noRecipe ? '' : p.profit,
                })),
                `rentabilidade-${range.start}_a_${range.end}`,
              )
            }
          >
            Exportar
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/60 p-3 ring-1 ring-bordo/5">
        <p className="px-1 text-sm font-semibold text-bordo">Período</p>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Fatias vendidas" value={num(totals.qty)} icon={CakeSlice} tone="bordo" />
        <StatCard label="Faturamento dos produtos" value={brl(totals.revenue)} icon={Wallet} tone="cereja" hint="Já com descontos, sem taxa de entrega" />
        <StatCard label="Custo dos produtos" value={brl(totals.cost)} icon={PieChart} tone="laranja" />
        <StatCard label="Lucro bruto estimado" value={brl(totals.profit)} icon={TrendingUp} tone="verde" hint={`Margem ${pct(totals.revenue ? totals.profit / totals.revenue : null)}`} />
      </div>

      {missing.length > 0 && (
        <div className="flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Sem ficha técnica (custo desconhecido): <b>{missing.map((m) => m.label).join(', ')}</b>.{' '}
            <Link to="/receitas" className="font-semibold underline">
              Cadastrar receitas
            </Link>
          </p>
        </div>
      )}

      {data.length === 0 ? (
        <EmptyState icon={PieChart} title="Sem vendas no período" />
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-bordo/5">
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-bordo/5 bg-creme-50 text-left text-[11px] font-bold tracking-wider text-bordo/50">
                    <th className="px-4 py-3 uppercase">#</th>
                    <th className="px-4 py-3 uppercase">Brownie</th>
                    {head('qty', 'Vendidas')}
                    <th className="px-4 py-3 text-right uppercase">Preço</th>
                    <th className="px-4 py-3 text-right uppercase">Custo/fatia</th>
                    {head('profitPerSlice', 'Lucro/fatia')}
                    {head('margin', 'Margem')}
                    {head('revenue', 'Faturamento')}
                    {head('profit', 'Lucro total')}
                  </tr>
                </thead>
                <tbody className="divide-y divide-bordo/5">
                  {sorted.map((p: ProductProfit, i) => (
                    <tr key={p.key} className="hover:bg-creme-50/60">
                      <td className="px-4 py-3 font-bold text-bordo/40">{i + 1}</td>
                      <td className="px-4 py-3 font-semibold text-bordo">{p.label}</td>
                      <td className="px-4 py-3 text-right">{num(p.qty)}</td>
                      <td className="px-4 py-3 text-right">{brl(p.price)}</td>
                      <td className="px-4 py-3 text-right text-bordo/70">{p.costPerSlice !== null ? brl(p.costPerSlice) : '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold">{p.profitPerSlice !== null ? brl(p.profitPerSlice) : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {p.margin !== null ? (
                          <span className={cx('rounded-full px-2 py-0.5 text-xs font-bold', p.margin >= 0.5 ? 'bg-emerald-50 text-emerald-700' : p.margin >= 0.3 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700')}>
                            {pct(p.margin)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">{brl(p.revenue)}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">{p.noRecipe ? '—' : brl(p.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Card>
            <SectionTitle icon={TrendingUp} title="Lucro estimado total por produto" />
            <div className="h-72">
              <HorizontalBars money data={sorted.filter((p) => !p.noRecipe && p.profit > 0).map((p) => ({ name: p.label, value: p.profit }))} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
