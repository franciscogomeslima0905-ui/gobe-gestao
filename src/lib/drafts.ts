import { addDays, getDay } from 'date-fns';
import { NO_DELIVERY_WEEKDAYS } from './constants';
import { parseDay, toISODate, todayISO, uid } from './format';
import type { OrderDraft, OrderFull, Product } from './types';

/** Próximo dia com entrega, a partir de amanhã (pedidos com 1 dia de antecedência) */
export const nextDeliveryDate = (from = new Date()) => {
  let d = addDays(from, 1);
  while (NO_DELIVERY_WEEKDAYS.includes(getDay(d))) d = addDays(d, 1);
  return toISODate(d);
};

export const isNoDeliveryDay = (iso: string) => !!iso && NO_DELIVERY_WEEKDAYS.includes(getDay(parseDay(iso)));

export const emptyDraft = (): OrderDraft => ({
  customer_name: '',
  phone: '',
  order_date: todayISO(),
  delivery_date: nextDeliveryDate(),
  delivery_time: '',
  items: [],
  discount: 0,
  delivery_fee: 0,
  payment_method: 'a_definir',
  payment_status: 'pendente',
  amount_received: 0,
  paid_at: todayISO(),
  production_status: 'pendente',
  delivery_status: 'pendente',
  notes: '',
});

export const orderToDraft = (o: OrderFull): OrderDraft => {
  const lastPay = [...o.payments].reverse().find((p) => p.kind === 'recebimento');
  return {
    customer_name: o.customer_name,
    phone: o.phone ?? '',
    order_date: o.order_date,
    delivery_date: o.delivery_date,
    delivery_time: o.delivery_time ?? '',
    items: o.items.map((i) => ({
      key: i.id,
      id: i.id,
      product_id: i.product_id,
      product_name: i.product_name,
      flavor: i.flavor,
      unit_price: i.unit_price,
      quantity: i.quantity,
      produced_qty: i.produced_qty,
    })),
    discount: o.discount,
    delivery_fee: o.delivery_fee,
    payment_method: o.payment_method,
    payment_status: o.paymentStatusLive,
    amount_received: o.netPaid,
    paid_at: lastPay?.paid_at ?? todayISO(),
    production_status: o.production_status,
    delivery_status: o.delivery_status,
    notes: o.notes ?? '',
  };
};

/** Cópia do pedido para um novo cadastro, usando os preços atuais dos produtos */
export const duplicateDraft = (o: OrderFull, products: Product[] = []): Partial<OrderDraft> => ({
  customer_name: o.customer_name,
  phone: o.phone ?? '',
  delivery_time: o.delivery_time ?? '',
  items: o.items.map((i) => ({
    key: uid(),
    product_id: i.product_id,
    product_name: i.product_name,
    flavor: i.flavor,
    unit_price: products.find((p) => p.id === i.product_id && p.active)?.price ?? i.unit_price,
    quantity: i.quantity,
    produced_qty: 0,
  })),
  discount: o.discount,
  delivery_fee: o.delivery_fee,
  payment_method: o.payment_method,
  notes: o.notes ?? '',
});
