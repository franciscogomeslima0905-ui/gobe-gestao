import { round2 } from './format';
import type {
  DisplayStatus,
  ItemDraft,
  Order,
  OrderFull,
  OrderItem,
  Payment,
  PaymentStatus,
  ProductionStatus,
} from './types';

export const productLabel = (name: string, flavor?: string | null) =>
  flavor ? `${name} · ${flavor}` : name;

export const itemsSubtotal = (items: { unit_price: number; quantity: number }[]) =>
  round2(items.reduce((s, i) => s + (Number(i.unit_price) || 0) * (Number(i.quantity) || 0), 0));

export const orderTotal = (subtotal: number, discount: number, fee: number) =>
  round2(Math.max(0, subtotal - (discount || 0) + (fee || 0)));

export const derivePaymentStatus = (total: number, netPaid: number): PaymentStatus => {
  if (netPaid <= 0.004) return total <= 0.004 ? 'pago' : 'pendente';
  if (netPaid + 0.004 >= total) return 'pago';
  return 'parcial';
};

/** Situação automática a partir das fatias produzidas */
export const deriveProductionStatus = (
  items: { quantity: number; produced_qty: number }[],
  current: ProductionStatus,
): ProductionStatus => {
  const total = items.reduce((s, i) => s + i.quantity, 0);
  const done = items.reduce((s, i) => s + Math.min(i.produced_qty, i.quantity), 0);
  if (total > 0 && done >= total) return 'pronto';
  if (done > 0) return 'em_producao';
  return current === 'pronto' ? 'pendente' : current;
};

export const displayStatus = (o: Order): DisplayStatus => {
  if (o.cancelled_at) return 'cancelado';
  if (o.delivery_status === 'entregue') return 'entregue';
  return o.production_status;
};

export function enrichOrders(orders: Order[], items: OrderItem[], payments: Payment[]): OrderFull[] {
  const itemsBy = new Map<string, OrderItem[]>();
  for (const it of items) {
    const arr = itemsBy.get(it.order_id);
    if (arr) arr.push(it);
    else itemsBy.set(it.order_id, [it]);
  }
  const paysBy = new Map<string, Payment[]>();
  for (const p of payments) {
    const arr = paysBy.get(p.order_id);
    if (arr) arr.push(p);
    else paysBy.set(p.order_id, [p]);
  }

  return orders
    .map((o) => {
      const its = (itemsBy.get(o.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));
      const pays = (paysBy.get(o.id) ?? []).sort(
        (a, b) => a.paid_at.localeCompare(b.paid_at) || a.created_at.localeCompare(b.created_at),
      );
      const received = round2(pays.filter((p) => p.kind === 'recebimento').reduce((s, p) => s + p.amount, 0));
      const refunded = round2(pays.filter((p) => p.kind === 'estorno').reduce((s, p) => s + p.amount, 0));
      const netPaid = round2(received - refunded);
      const cancelled = !!o.cancelled_at;
      const slices = its.reduce((s, i) => s + i.quantity, 0);
      const producedSlices = its.reduce((s, i) => s + Math.min(i.produced_qty, i.quantity), 0);
      return {
        ...o,
        items: its,
        payments: pays,
        cancelled,
        status: displayStatus(o),
        slices,
        producedSlices,
        received,
        refunded,
        netPaid,
        balance: cancelled ? 0 : round2(Math.max(0, o.total - netPaid)),
        paymentStatusLive: derivePaymentStatus(o.total, netPaid),
      } satisfies OrderFull;
    })
    .sort(
      (a, b) =>
        a.delivery_date.localeCompare(b.delivery_date) ||
        (a.delivery_time ?? '99').localeCompare(b.delivery_time ?? '99') ||
        a.created_at.localeCompare(b.created_at),
    );
}

export const draftSubtotal = (items: ItemDraft[]) => itemsSubtotal(items);

/** Chave do cliente para agrupamentos (nome normalizado) */
export const customerKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
