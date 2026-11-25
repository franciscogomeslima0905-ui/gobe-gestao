import { addDays, differenceInCalendarDays } from 'date-fns';
import { brl, fmtDate, parseDay, toISODate } from './format';
import { fmtQty, stockLevel } from './costs';
import type { Ingredient, OrderFull } from './types';

export type AlertKind = 'entrega' | 'atraso' | 'pagamento' | 'estorno' | 'estoque';

export interface AppAlert {
  id: string;
  kind: AlertKind;
  order?: OrderFull;
  title: string;
  text: string;
  priority: number;
}

export function buildAlerts(orders: OrderFull[], ingredients: Ingredient[] = [], today = new Date()): AppAlert[] {
  const todayIso = toISODate(today);
  const soon = toISODate(addDays(today, 2));
  const alerts: AppAlert[] = [];

  for (const o of orders) {
    if (o.cancelled) {
      if (o.netPaid > 0.004)
        alerts.push({
          id: `est-${o.id}`,
          kind: 'estorno',
          order: o,
          title: `Estorno pendente · ${o.customer_name}`,
          text: `Pedido cancelado com ${brl(o.netPaid)} recebido.`,
          priority: 2,
        });
      continue;
    }
    const delivered = o.delivery_status === 'entregue';
    const days = differenceInCalendarDays(parseDay(o.delivery_date), today);

    if (!delivered && o.delivery_date < todayIso) {
      alerts.push({
        id: `atr-${o.id}`,
        kind: 'atraso',
        order: o,
        title: `Entrega não concluída · ${o.customer_name}`,
        text: `Previsto para ${fmtDate(o.delivery_date)} e ainda não marcado como entregue.`,
        priority: 0,
      });
    } else if (!delivered && o.delivery_date <= soon && o.production_status !== 'pronto') {
      alerts.push({
        id: `ent-${o.id}`,
        kind: 'entrega',
        order: o,
        title: `${days === 0 ? 'Entrega hoje' : days === 1 ? 'Entrega amanhã' : `Entrega em ${days} dias`} · ${o.customer_name}`,
        text: `${o.slices - o.producedSlices} de ${o.slices} fatia(s) ainda por produzir.`,
        priority: days === 0 ? 0 : 1,
      });
    }

    if (o.balance > 0.004 && o.delivery_date <= soon) {
      alerts.push({
        id: `pag-${o.id}`,
        kind: 'pagamento',
        order: o,
        title: `Pagamento pendente · ${o.customer_name}`,
        text: `${brl(o.balance)} a receber · entrega ${fmtDate(o.delivery_date)}.`,
        priority: o.delivery_date < todayIso ? 1 : 2,
      });
    }
  }
  for (const i of ingredients) {
    if (!i.active) continue;
    const lvl = stockLevel(i);
    if (lvl === 'ok' || !i.min_stock) continue; // só avisa itens com estoque mínimo definido
    alerts.push({
      id: `stk-${i.id}`,
      kind: 'estoque',
      title: `${lvl === 'esgotado' ? 'Esgotado' : 'Estoque baixo'} · ${i.name}`,
      text: `Disponível: ${fmtQty(i.stock_qty, i.unit)} · mínimo ${fmtQty(i.min_stock, i.unit)}.`,
      priority: 3,
    });
  }
  return alerts.sort(
    (a, b) => a.priority - b.priority || (a.order?.delivery_date ?? '9').localeCompare(b.order?.delivery_date ?? '9'),
  );
}
