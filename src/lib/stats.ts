import { customerKey, productLabel } from './calc';
import { round2 } from './format';
import { inRange, type Range } from './period';
import type { OrderFull, Payment } from './types';

export const active = (orders: OrderFull[]) => orders.filter((o) => !o.cancelled);

export interface Summary {
  orders: number;
  slices: number;
  produced: number;
  pendingSlices: number;
  sales: number;
  received: number;
  pending: number;
}

/** Resumo de um conjunto de pedidos (cancelados não entram) */
export function summarize(orders: OrderFull[]): Summary {
  const a = active(orders);
  const slices = a.reduce((s, o) => s + o.slices, 0);
  const produced = a.reduce((s, o) => s + o.producedSlices, 0);
  return {
    orders: a.length,
    slices,
    produced,
    pendingSlices: slices - produced,
    sales: round2(a.reduce((s, o) => s + o.total, 0)),
    received: round2(a.reduce((s, o) => s + Math.min(o.netPaid, o.total), 0)),
    pending: round2(a.reduce((s, o) => s + o.balance, 0)),
  };
}

export const ordersIn = (orders: OrderFull[], r: Range) => orders.filter((o) => inRange(o.delivery_date, r));

/** Dinheiro que efetivamente entrou (recebimentos − estornos) por data do pagamento */
export function cashIn(payments: Payment[], r?: Range) {
  let pix = 0;
  let dinheiro = 0;
  let outros = 0;
  let estornos = 0;
  for (const p of payments) {
    if (r && !inRange(p.paid_at, r)) continue;
    const v = p.kind === 'estorno' ? -p.amount : p.amount;
    if (p.kind === 'estorno') estornos += p.amount;
    if (p.method === 'pix') pix += v;
    else if (p.method === 'dinheiro') dinheiro += v;
    else outros += v;
  }
  return {
    pix: round2(pix),
    dinheiro: round2(dinheiro),
    outros: round2(outros),
    estornos: round2(estornos),
    total: round2(pix + dinheiro + outros),
  };
}

export interface ProductStat {
  key: string;
  name: string;
  flavor: string | null;
  label: string;
  qty: number;
  produced: number;
  revenue: number;
}

export function productStats(orders: OrderFull[]): ProductStat[] {
  const map = new Map<string, ProductStat>();
  for (const o of active(orders)) {
    for (const i of o.items) {
      const key = `${i.product_name}||${i.flavor ?? ''}`;
      const cur = map.get(key) ?? { key, name: i.product_name, flavor: i.flavor, label: productLabel(i.product_name, i.flavor), qty: 0, produced: 0, revenue: 0 };
      cur.qty += i.quantity;
      cur.produced += Math.min(i.produced_qty, i.quantity);
      cur.revenue += i.quantity * i.unit_price;
      map.set(key, cur);
    }
  }
  return Array.from(map.values())
    .map((p) => ({ ...p, revenue: round2(p.revenue) }))
    .sort((a, b) => b.qty - a.qty);
}

export function flavorStats(orders: OrderFull[]) {
  const map = new Map<string, number>();
  for (const o of active(orders))
    for (const i of o.items) {
      const k = i.flavor ? i.flavor : i.product_name;
      map.set(k, (map.get(k) ?? 0) + i.quantity);
    }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export interface CustomerStat {
  key: string;
  name: string;
  phone: string | null;
  orders: number;
  slices: number;
  total: number;
  paid: number;
  balance: number;
  last: string;
}

export function customerStats(orders: OrderFull[]): CustomerStat[] {
  const map = new Map<string, CustomerStat>();
  for (const o of active(orders)) {
    const k = customerKey(o.customer_name);
    const cur = map.get(k) ?? { key: k, name: o.customer_name, phone: null, orders: 0, slices: 0, total: 0, paid: 0, balance: 0, last: o.delivery_date };
    cur.orders += 1;
    cur.slices += o.slices;
    cur.total += o.total;
    cur.paid += Math.min(o.netPaid, o.total);
    cur.balance += o.balance;
    if (o.phone) cur.phone = o.phone;
    if (o.delivery_date >= cur.last) {
      cur.last = o.delivery_date;
      cur.name = o.customer_name;
    }
    map.set(k, cur);
  }
  return Array.from(map.values()).map((c) => ({ ...c, total: round2(c.total), paid: round2(c.paid), balance: round2(c.balance) }));
}
