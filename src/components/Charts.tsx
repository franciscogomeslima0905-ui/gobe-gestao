import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS } from '../lib/constants';
import { brl, num } from '../lib/format';

const tooltipStyle = {
  contentStyle: {
    borderRadius: 14,
    border: 'none',
    boxShadow: '0 10px 30px -10px rgba(88,29,41,.3)',
    fontFamily: 'Nunito, sans-serif',
    fontSize: 13,
    color: '#581D29',
  },
  labelStyle: { fontWeight: 700, color: '#581D29' },
  cursor: { fill: 'rgba(243,180,208,.18)' },
};

const axis = { tick: { fill: 'rgba(88,29,41,.55)', fontSize: 11 }, axisLine: false, tickLine: false } as const;

export function ChartEmpty({ children = 'Sem dados no período' }: { children?: ReactNode }) {
  return <div className="flex h-full items-center justify-center text-sm text-bordo/40">{children}</div>;
}

export function MoneyBars({ data, dataKey = 'value', color = '#CE0D32' }: { data: { label: string; value: number }[]; dataKey?: string; color?: string }) {
  if (!data.some((d) => d.value)) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="rgba(88,29,41,.07)" />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axis} width={64} tickFormatter={(v) => `R$ ${num(Number(v))}`} />
        <Tooltip {...tooltipStyle} formatter={(v) => [brl(Number(v)), 'Faturamento']} />
        <Bar dataKey={dataKey} fill={color} radius={[8, 8, 0, 0]} maxBarSize={36} animationDuration={700} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CountBars({ data, name = 'Fatias', color = '#581D29' }: { data: { label: string; value: number }[]; name?: string; color?: string }) {
  if (!data.some((d) => d.value)) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="rgba(88,29,41,.07)" />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip {...tooltipStyle} formatter={(v) => [num(Number(v)), name]} />
        <Bar dataKey="value" fill={color} radius={[8, 8, 0, 0]} maxBarSize={36} animationDuration={700} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EvolutionArea({ data }: { data: { label: string; value: number; acumulado: number }[] }) {
  if (!data.some((d) => d.value)) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="gEvol" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#CE0D32" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#F3B4D0" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="rgba(88,29,41,.07)" />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axis} width={64} tickFormatter={(v) => `R$ ${num(Number(v))}`} />
        <Tooltip
          {...tooltipStyle}
          cursor={{ stroke: '#CE0D32', strokeOpacity: 0.3 }}
          formatter={(v, n) => [brl(Number(v)), n === 'acumulado' ? 'Acumulado' : 'No dia']}
        />
        <Area type="monotone" dataKey="acumulado" stroke="#CE0D32" strokeWidth={2.5} fill="url(#gEvol)" animationDuration={800} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBars({ data, money }: { data: { name: string; value: number }[]; money?: boolean }) {
  if (!data.length) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" {...axis} width={150} tick={{ fill: '#581D29', fontSize: 12 }} />
        <Tooltip {...tooltipStyle} formatter={(v) => [money ? brl(Number(v)) : `${num(Number(v))} fatias`, '']} separator="" />
        <Bar dataKey="value" radius={[0, 8, 8, 0]} maxBarSize={22} animationDuration={700}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, money, colors = CHART_COLORS }: { data: { name: string; value: number }[]; money?: boolean; colors?: string[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <ChartEmpty />;
  return (
    <div className="flex h-full flex-col items-center gap-3 sm:flex-row">
      <div className="h-44 w-44 shrink-0 sm:h-full sm:w-1/2">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip {...tooltipStyle} formatter={(v, n) => [money ? brl(Number(v)) : `${num(Number(v))} fatias`, String(n)]} />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="92%" paddingAngle={2} stroke="none" animationDuration={700}>
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[i % colors.length] }} />
              <span className="truncate text-bordo/80">{d.name}</span>
            </span>
            <span className="shrink-0 font-semibold text-bordo">
              {money ? brl(d.value) : num(d.value)} <span className="text-xs font-normal text-bordo/40">({Math.round((d.value / total) * 100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResultChart({ data }: { data: { label: string; faturamento: number; despesas: number; lucro: number }[] }) {
  if (!data.some((d) => d.faturamento || d.despesas)) return <ChartEmpty />;
  const names: Record<string, string> = { faturamento: 'Faturamento', despesas: 'Despesas', lucro: 'Lucro estimado' };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="rgba(88,29,41,.07)" />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axis} width={64} tickFormatter={(v) => `R$ ${num(Number(v))}`} />
        <Tooltip {...tooltipStyle} formatter={(v, n) => [brl(Number(v)), names[String(n)] ?? String(n)]} />
        <Legend formatter={(v) => <span style={{ color: '#581D29', fontSize: 12 }}>{names[String(v)] ?? String(v)}</span>} />
        <Bar dataKey="faturamento" fill="#CE0D32" radius={[6, 6, 0, 0]} maxBarSize={28} />
        <Bar dataKey="despesas" fill="#C99A6B" radius={[6, 6, 0, 0]} maxBarSize={28} />
        <Line type="monotone" dataKey="lucro" stroke="#581D29" strokeWidth={2.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
