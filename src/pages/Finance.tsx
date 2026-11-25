import {
  BarChart3,
  CakeSlice,
  Calculator,
  PiggyBank,
  ShoppingBag,
  TrendingUp,
  Banknote,
  BadgeDollarSign,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Info,
  MessageCircle,
  QrCode,
  Receipt,
  Trash2,
  Undo2,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import PeriodFilter, { defaultPeriod } from '../components/PeriodFilter';
import { Button, Card, EmptyState, IconButton, PageHeader, PaymentBadge, Segmented, SectionTitle, StatCard, cx } from '../components/ui';
import { useData } from '../context/DataContext';
import { useStock } from '../context/StockContext';
import { ResultChart } from '../components/Charts';
import { costOfGoodsSold, INVENTORY_CATEGORIES } from '../lib/costs';
import { daysOf } from '../lib/period';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseDay } from '../lib/format';
import { errorMessage, useUI } from '../context/UIContext';
import { customerKey, productLabel } from '../lib/calc';
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, STATUS_META } from '../lib/constants';
import { exportCSV, exportExcel, type Row } from '../lib/export';
import { brl, fmtDate, fmtPhone, num, round2, whatsappLink } from '../lib/format';
import { getRange, inRange, rangeLabel, type PeriodState } from '../lib/period';
import { active, cashIn, ordersIn } from '../lib/stats';
import type { OrderFull } from '../lib/types';

export default function Finance() {
  const { orders, payments, getOrder, deletePayment } = useData();
  const { expenses, sliceCost } = useStock();
  const { openPayment, toast, confirm } = useUI();
  const [period, setPeriod] = useState<PeriodState>(defaultPeriod('mes'));
  const [scope, setScope] = useState<'todos' | 'periodo'>('todos');
  const range = getRange(period);

  const data = useMemo(() => {
    const list = ordersIn(orders, range);
    const act = active(list);
    const sales = round2(act.reduce((s, o) => s + o.total, 0));
    const cash = cashIn(payments, range);
    const toReceive = round2(act.reduce((s, o) => s + o.balance, 0));
    const paidCount = act.filter((o) => o.paymentStatusLive === 'pago').length;
    const pendingCount = act.filter((o) => o.paymentStatusLive !== 'pago').length;
    const history = payments
      .filter((p) => inRange(p.paid_at, range))
      .sort((a, b) => b.paid_at.localeCompare(a.paid_at) || b.created_at.localeCompare(a.created_at));
    return { list, act, sales, cash, toReceive, paidCount, pendingCount, history };
  }, [orders, payments, range.start, range.end]);

  /* resultado: despesas, caixa e lucro */
  const result = useMemo(() => {
    const exp = expenses.filter((e) => inRange(e.expense_date, range));
    const sumCat = (f: (c: string) => boolean) => round2(exp.filter((e) => f(e.category)).reduce((s, e) => s + e.amount, 0));
    const ingredientes = sumCat((c) => c === 'ingredientes');
    const embalagens = sumCat((c) => c === 'embalagens' || c === 'adesivos');
    const outras = sumCat((c) => !INVENTORY_CATEGORIES.includes(c as never));
    const totalExp = round2(ingredientes + embalagens + outras);
    const cogs = costOfGoodsSold(data.act, sliceCost);
    const profit = round2(data.sales - cogs.cost - outras);
    return {
      ingredientes,
      embalagens,
      outras,
      totalExp,
      cash: round2(data.cash.total - totalExp),
      cogs,
      profit,
      margin: data.sales > 0 ? profit / data.sales : null,
      slices: data.act.reduce((s, o) => s + o.slices, 0),
    };
  }, [expenses, range.start, range.end, data, sliceCost]);

  const chart = useMemo(() => {
    const days = daysOf(range);
    const byMonth = days.length > 62;
    const keyOf = (iso: string) => (byMonth ? iso.slice(0, 7) : iso);
    const keys = Array.from(new Set(days.map(keyOf)));
    const acc = new Map(keys.map((k) => [k, { faturamento: 0, despesas: 0, cogs: 0, outras: 0 }]));
    for (const o of data.act) {
      const a = acc.get(keyOf(o.delivery_date));
      if (!a) continue;
      a.faturamento += o.total;
      a.cogs += costOfGoodsSold([o], sliceCost).cost;
    }
    for (const e of expenses) {
      const a = inRange(e.expense_date, range) ? acc.get(keyOf(e.expense_date)) : undefined;
      if (!a) continue;
      a.despesas += e.amount;
      if (!INVENTORY_CATEGORIES.includes(e.category)) a.outras += e.amount;
    }
    return keys.map((k) => {
      const a = acc.get(k)!;
      return {
        label: byMonth ? format(parseDay(`${k}-01`), 'MMM/yy', { locale: ptBR }) : format(parseDay(k), 'dd/MM'),
        faturamento: round2(a.faturamento),
        despesas: round2(a.despesas),
        lucro: round2(a.faturamento - a.cogs - a.outras),
      };
    });
  }, [data.act, expenses, range.start, range.end, sliceCost]);

  const pendingSource = scope === 'todos' ? active(orders) : data.act;
  const debtors = useMemo(() => {
    const map = new Map<string, { name: string; phone: string | null; balance: number; orders: OrderFull[] }>();
    for (const o of pendingSource) {
      if (o.balance <= 0.004) continue;
      const k = customerKey(o.customer_name);
      const cur = map.get(k) ?? { name: o.customer_name, phone: o.phone, balance: 0, orders: [] };
      cur.balance = round2(cur.balance + o.balance);
      cur.orders.push(o);
      if (o.phone) cur.phone = o.phone;
      map.set(k, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.balance - a.balance);
  }, [pendingSource]);

  const refunds = useMemo(() => orders.filter((o) => o.cancelled && o.netPaid > 0.004), [orders]);

  /* ------------------------------ exportação ------------------------------ */
  const ordersRows = (): Row[] =>
    data.list.map((o) => ({
      'Data de entrega': fmtDate(o.delivery_date),
      'Data do pedido': fmtDate(o.order_date),
      Cliente: o.customer_name,
      Telefone: fmtPhone(o.phone),
      Produtos: o.items.map((i) => `${i.quantity}x ${productLabel(i.product_name, i.flavor)}`).join(', '),
      Fatias: o.slices,
      Subtotal: o.subtotal,
      Desconto: o.discount,
      'Taxa de entrega': o.delivery_fee,
      Total: o.cancelled ? 0 : o.total,
      Recebido: o.netPaid,
      'A receber': o.balance,
      'Forma de pagamento': PAYMENT_METHOD_LABEL[o.payment_method],
      'Situação do pagamento': o.cancelled ? 'Cancelado' : PAYMENT_STATUS_LABEL[o.paymentStatusLive],
      'Situação do pedido': STATUS_META[o.status].label,
      'Observações': o.notes ?? '',
    }));
  const paymentRows = (): Row[] =>
    data.history.map((p) => {
      const o = getOrder(p.order_id);
      return {
        Data: fmtDate(p.paid_at),
        Cliente: o?.customer_name ?? '',
        Tipo: p.kind === 'estorno' ? 'Estorno' : 'Recebimento',
        Forma: PAYMENT_METHOD_LABEL[p.method],
        Valor: p.kind === 'estorno' ? -p.amount : p.amount,
        'Entrega do pedido': o ? fmtDate(o.delivery_date) : '',
        'Observação': p.notes ?? '',
      };
    });
  const debtorRows = (): Row[] =>
    debtors.flatMap((d) =>
      d.orders.map((o) => ({
        Cliente: d.name,
        Telefone: fmtPhone(d.phone),
        'Data de entrega': fmtDate(o.delivery_date),
        Total: o.total,
        Recebido: o.netPaid,
        'A receber': o.balance,
      })),
    );
  const summaryRows = (): Row[] => [
    { Indicador: 'Período', Valor: rangeLabel(period) },
    { Indicador: 'Valor total das vendas', Valor: data.sales },
    { Indicador: 'Valor efetivamente recebido', Valor: data.cash.total },
    { Indicador: 'Valor a receber', Valor: data.toReceive },
    { Indicador: 'Recebido por Pix', Valor: data.cash.pix },
    { Indicador: 'Recebido em dinheiro', Valor: data.cash.dinheiro },
    { Indicador: 'Estornos', Valor: data.cash.estornos },
    { Indicador: 'Pedidos pagos', Valor: data.paidCount },
    { Indicador: 'Pedidos pendentes', Valor: data.pendingCount },
    { Indicador: 'Total de fatias vendidas', Valor: result.slices },
    { Indicador: 'Gasto com ingredientes', Valor: result.ingredientes },
    { Indicador: 'Gasto com embalagens e adesivos', Valor: result.embalagens },
    { Indicador: 'Outras despesas', Valor: result.outras },
    { Indicador: 'Total geral de despesas', Valor: result.totalExp },
    { Indicador: 'Resultado de caixa (recebido − despesas)', Valor: result.cash },
    { Indicador: 'Custo dos produtos vendidos (fichas técnicas)', Valor: result.cogs.cost },
    { Indicador: 'Lucro estimado', Valor: result.profit },
    { Indicador: 'Margem de lucro (%)', Valor: result.margin === null ? '' : Number((result.margin * 100).toFixed(1)) },
  ];
  const fileBase = `financeiro-${range.start}_a_${range.end}`;

  const removePayment = async (id: string) => {
    const r = await confirm({ title: 'Excluir lançamento?', danger: true, confirmLabel: 'Excluir', message: 'O valor sairá do histórico de recebimentos e o saldo do pedido será recalculado.' });
    if (!r.ok) return;
    try {
      await deletePayment(id);
      toast('Lançamento excluído.');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Controle financeiro"
        subtitle="Vendas, recebimentos, despesas, caixa e lucro."
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={() => exportCSV(ordersRows(), `pedidos-${range.start}_a_${range.end}`)}>
              Pedidos CSV
            </Button>
            <Button variant="secondary" icon={Download} onClick={() => exportCSV(paymentRows(), `recebimentos-${range.start}_a_${range.end}`)}>
              Recebimentos CSV
            </Button>
            <Button
              icon={FileSpreadsheet}
              onClick={() =>
                exportExcel(
                  [
                    { name: 'Resumo', rows: summaryRows() },
                    { name: 'Pedidos', rows: ordersRows() },
                    { name: 'Recebimentos', rows: paymentRows() },
                    { name: 'A receber', rows: debtorRows() },
                    {
                      name: 'Despesas',
                      rows: expenses
                        .filter((e) => inRange(e.expense_date, range))
                        .map((e) => ({ Data: fmtDate(e.expense_date), 'Descrição': e.description, Categoria: e.category, Fornecedor: e.supplier ?? '', Valor: e.amount })),
                    },
                  ],
                  fileBase,
                )
              }
            >
              Relatório Excel
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/60 p-3 ring-1 ring-bordo/5">
        <p className="px-1 text-sm font-semibold text-bordo">Período</p>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Valor total das vendas" value={brl(data.sales)} icon={BadgeDollarSign} tone="cereja" hint={`${num(data.act.length)} pedido(s) com entrega no período`} />
        <StatCard label="Efetivamente recebido" value={brl(data.cash.total)} icon={Wallet} tone="verde" hint={data.cash.estornos ? `Já descontados ${brl(data.cash.estornos)} de estornos` : 'Pela data do pagamento'} />
        <StatCard label="Valor a receber" value={brl(data.toReceive)} icon={Clock} tone="laranja" hint="Saldo dos pedidos do período" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Recebido por Pix" value={brl(data.cash.pix)} icon={QrCode} tone="rosa" />
        <StatCard label="Recebido em dinheiro" value={brl(data.cash.dinheiro)} icon={Banknote} tone="bordo" />
        <StatCard label="Pedidos pagos" value={num(data.paidCount)} icon={CheckCircle2} tone="verde" />
        <StatCard label="Pedidos pendentes" value={num(data.pendingCount)} icon={Receipt} tone="amarelo" hint="Pendentes ou parciais" />
      </div>

      <div className="flex gap-3 rounded-2xl bg-rosa-50 p-4 text-sm text-bordo ring-1 ring-rosa-100">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-cereja" />
        <p>
          <b>Vendas</b> é o valor dos pedidos com entrega no período (faturamento). <b>Recebido</b> é o dinheiro que realmente entrou, pela data em que foi
          pago — pode incluir pagamentos antecipados de pedidos de outros períodos. Pedidos cancelados não entram nas vendas.
        </p>
      </div>

      {/* Despesas, caixa e lucro */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Gasto com ingredientes" value={brl(result.ingredientes)} icon={ShoppingBag} tone="bordo" />
        <StatCard label="Gasto com embalagens" value={brl(result.embalagens)} icon={ShoppingBag} tone="rosa" hint="Inclui adesivos" />
        <StatCard label="Outras despesas" value={brl(result.outras)} icon={Receipt} tone="laranja" />
        <StatCard label="Total geral de despesas" value={brl(result.totalExp)} icon={Wallet} tone="cereja" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Resultado de caixa"
          value={<span className={result.cash < 0 ? 'text-cereja' : ''}>{brl(result.cash)}</span>}
          icon={PiggyBank}
          tone={result.cash < 0 ? 'cereja' : 'verde'}
          hint="Recebido − despesas pagas"
        />
        <StatCard
          label="Lucro estimado"
          value={<span className={result.profit < 0 ? 'text-cereja' : ''}>{brl(result.profit)}</span>}
          icon={TrendingUp}
          tone="verde"
          hint={`Vendas − custo das fatias (${brl(result.cogs.cost)}) − outras despesas`}
        />
        <StatCard label="Margem de lucro" value={result.margin === null ? '—' : `${(result.margin * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`} icon={Calculator} tone="bordo" />
        <StatCard label="Fatias vendidas" value={num(result.slices)} icon={CakeSlice} tone="rosa" />
      </div>
      {result.cogs.slicesWithoutRecipe > 0 && (
        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-100">
          {result.cogs.slicesWithoutRecipe} fatia(s) vendidas são de produtos sem ficha técnica e entram no lucro sem custo. Cadastre as receitas para um lucro mais preciso.
        </p>
      )}
      <div className="flex gap-3 rounded-2xl bg-creme-50 p-4 text-sm text-bordo ring-1 ring-bordo/5">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-cereja" />
        <p>
          <b>Resultado de caixa</b> mostra o dinheiro que sobrou: tudo o que entrou menos tudo o que foi pago, inclusive compras que abastecem o estoque por
          semanas. <b>Lucro estimado</b> considera só os ingredientes e embalagens <i>consumidos</i> nas fatias vendidas (pela ficha técnica) mais as demais
          despesas (luz, gás, transporte, marketing…), sem contar a mesma compra duas vezes.
        </p>
      </div>
      <Card>
        <SectionTitle icon={BarChart3} title="Faturamento × despesas × lucro" subtitle="Ao longo do período selecionado" />
        <div className="h-72">
          <ResultChart data={chart} />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Clientes com pendência */}
        <Card>
          <SectionTitle
            icon={Clock}
            title="Clientes com pagamentos pendentes"
            subtitle={`${debtors.length} cliente(s) · ${brl(debtors.reduce((s, d) => s + d.balance, 0))}`}
            action={
              <Segmented
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'todos', label: 'Todos' },
                  { value: 'periodo', label: 'Só o período' },
                ]}
              />
            }
          />
          {debtors.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nenhuma pendência" text="Todos os pedidos estão pagos. 🎉" />
          ) : (
            <ul className="space-y-3">
              {debtors.map((d) => {
                const wa = whatsappLink(
                  d.phone,
                  `Olá, ${d.name.split(' ')[0]}! Tudo bem? Passando para lembrar do valor de ${brl(d.balance)} referente ao seu pedido na GOBÊ Confeitaria. Obrigado! 💕`,
                );
                return (
                  <li key={d.name} className="rounded-2xl bg-creme-50 p-3 ring-1 ring-bordo/5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-bordo">{d.name}</p>
                        <p className="text-xs text-bordo/50">{d.phone ? fmtPhone(d.phone) : 'Sem telefone'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-display text-lg font-semibold text-cereja">{brl(d.balance)}</span>
                        {wa && (
                          <a href={wa} target="_blank" rel="noreferrer" title="Cobrar pelo WhatsApp" className="rounded-xl bg-emerald-500 p-2 text-white transition hover:bg-emerald-600">
                            <MessageCircle className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {d.orders.map((o) => (
                        <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs">
                          <span className="text-bordo/70">
                            Entrega {fmtDate(o.delivery_date)} · total {brl(o.total)} · recebido {brl(o.netPaid)}
                          </span>
                          <span className="flex items-center gap-2">
                            <PaymentBadge status={o.paymentStatusLive} />
                            <Button size="sm" variant="soft" onClick={() => openPayment(o.id)}>
                              Receber
                            </Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Histórico de recebimentos */}
        <Card>
          <SectionTitle icon={Receipt} title="Histórico de recebimentos" subtitle={`${data.history.length} lançamento(s) no período`} />
          {data.history.length === 0 ? (
            <EmptyState icon={Wallet} title="Nenhum recebimento no período" />
          ) : (
            <div className="scrollbar-thin max-h-[560px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-bordo/10 text-left text-[11px] font-bold uppercase tracking-wider text-bordo/50">
                    <th className="py-2 pr-2">Data</th>
                    <th className="py-2 pr-2">Cliente</th>
                    <th className="py-2 pr-2">Forma</th>
                    <th className="py-2 pr-2 text-right">Valor</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-bordo/5">
                  {data.history.map((p) => {
                    const o = getOrder(p.order_id);
                    return (
                      <tr key={p.id}>
                        <td className="py-2 pr-2 text-bordo/70">{fmtDate(p.paid_at)}</td>
                        <td className="py-2 pr-2">
                          <p className="font-medium text-bordo">{o?.customer_name ?? '—'}</p>
                          {p.notes && <p className="text-xs text-bordo/45">{p.notes}</p>}
                        </td>
                        <td className="py-2 pr-2 text-bordo/70">
                          {PAYMENT_METHOD_LABEL[p.method]}
                          {p.kind === 'estorno' && <span className="ml-1 rounded-full bg-red-100 px-1.5 text-[10px] font-bold text-red-700">ESTORNO</span>}
                        </td>
                        <td className={cx('py-2 pr-2 text-right font-bold', p.kind === 'estorno' ? 'text-cereja' : 'text-emerald-700')}>
                          {p.kind === 'estorno' ? '− ' : ''}
                          {brl(p.amount)}
                        </td>
                        <td className="py-2 text-right">
                          <IconButton icon={Trash2} label="Excluir lançamento" onClick={() => removePayment(p.id)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {refunds.length > 0 && (
        <Card>
          <SectionTitle icon={Undo2} title="Pedidos cancelados com valor recebido" subtitle="Registre o estorno quando devolver o dinheiro ao cliente" />
          <ul className="divide-y divide-bordo/5">
            {refunds.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold text-bordo">{o.customer_name}</p>
                  <p className="text-xs text-bordo/50">
                    Entrega {fmtDate(o.delivery_date)} · {o.cancel_reason || 'sem motivo informado'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-cereja">{brl(o.netPaid)}</span>
                  <Button size="sm" variant="danger" icon={Undo2} onClick={() => openPayment(o.id, 'estorno')}>
                    Registrar estorno
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
