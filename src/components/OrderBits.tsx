import { MapPin, MessageCircle, PackageCheck, Truck } from 'lucide-react';
import { useState } from 'react';
import { useData } from '../context/DataContext';
import { errorMessage, useUI } from '../context/UIContext';
import { productLabel } from '../lib/calc';
import { STATUS_META } from '../lib/constants';
import { fmtPhone } from '../lib/format';
import type { OrderFull, ProductionStatus } from '../lib/types';
import { Checkbox, StatusBadge, cx } from './ui';

/** Seletor compacto da situação de produção, colorido pela legenda */
export function ProductionSelect({ order }: { order: OrderFull }) {
  const { setProductionStatus } = useData();
  const { toast } = useUI();
  if (order.cancelled || order.delivery_status === 'entregue') return <StatusBadge status={order.status} />;
  const m = STATUS_META[order.production_status];
  return (
    <select
      value={order.production_status}
      onChange={async (e) => {
        try {
          await setProductionStatus(order.id, e.target.value as ProductionStatus);
          toast('Situação da produção atualizada.');
        } catch (err) {
          toast(errorMessage(err), 'error');
        }
      }}
      className={cx('cursor-pointer rounded-full border-0 py-1 pl-3 pr-7 text-xs font-semibold ring-1 focus:outline-none focus:ring-2 focus:ring-cereja/40', m.badge)}
    >
      <option value="pendente">Produção pendente</option>
      <option value="em_producao">Em produção</option>
      <option value="pronto">Pronto</option>
    </select>
  );
}

/** Lista de itens do pedido com caixas de seleção de "produzido" */
export function ItemChecklist({ order, compact }: { order: OrderFull; compact?: boolean }) {
  const { setItemProduced } = useData();
  const { toast } = useUI();
  const [busy, setBusy] = useState<string | null>(null);
  const locked = order.cancelled;

  return (
    <ul className={cx('space-y-1.5', compact && 'space-y-1')}>
      {order.items.map((i) => {
        const done = i.produced_qty >= i.quantity;
        const partial = i.produced_qty > 0 && !done;
        return (
          <li key={i.id} className="flex items-start gap-2">
            <Checkbox
              checked={done}
              disabled={locked || busy === i.id}
              onChange={async (v) => {
                setBusy(i.id);
                try {
                  await setItemProduced(i.id, v ? i.quantity : 0);
                } catch (e) {
                  toast(errorMessage(e), 'error');
                } finally {
                  setBusy(null);
                }
              }}
            />
            <span className={cx('text-sm leading-5', done ? 'text-bordo/45 line-through decoration-emerald-500/60' : 'text-bordo')}>
              <b>{i.quantity}×</b> {productLabel(i.product_name, i.flavor)}
              {partial && <span className="ml-1 text-xs font-semibold text-sky-600">({i.produced_qty}/{i.quantity} prontas)</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function DeliveryButton({ order }: { order: OrderFull }) {
  const { setDeliveryStatus } = useData();
  const { toast, confirm } = useUI();
  const [busy, setBusy] = useState(false);
  if (order.cancelled) return <span className="text-xs text-bordo/40">—</span>;
  const delivered = order.delivery_status === 'entregue';

  const toggle = async () => {
    if (delivered) {
      const r = await confirm({ title: 'Desfazer entrega?', message: `Marcar o pedido de ${order.customer_name} como ainda não entregue?`, confirmLabel: 'Desfazer' });
      if (!r.ok) return;
    }
    setBusy(true);
    try {
      await setDeliveryStatus(order.id, delivered ? 'pendente' : 'entregue');
      toast(delivered ? 'Entrega desfeita.' : order.balance > 0.004 ? 'Entregue! O pedido foi para “Entregues sem pagamento”.' : 'Pedido concluído: entregue e pago! 🎉');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ring-1 transition disabled:opacity-50',
        delivered ? 'bg-violet-100 text-violet-800 ring-violet-200 hover:bg-violet-200' : 'bg-white text-bordo/70 ring-bordo/15 hover:bg-violet-50 hover:text-violet-700',
      )}
    >
      {delivered ? <PackageCheck className="h-3.5 w-3.5" /> : <Truck className="h-3.5 w-3.5" />}
      {delivered ? 'Entregue' : 'A entregar'}
    </button>
  );
}

export function CustomerCell({ order }: { order: OrderFull }) {
  const { openShare } = useUI();
  const mapsUrl = order.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}` : null;
  return (
    <div className="flex min-w-0 items-start gap-2">
      <button
        onClick={() => openShare(order.id)}
        title="WhatsApp, Pix e comprovante"
        aria-label="WhatsApp, Pix e comprovante"
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm transition hover:bg-emerald-600 active:scale-95 print:hidden"
      >
        <MessageCircle className="h-4 w-4" />
      </button>
      <div className="min-w-0">
        <p className={cx('font-semibold text-bordo', order.cancelled && 'line-through opacity-60')}>
          {order.customer_name}
          {order.source === 'site' && <span className="ml-1.5 rounded-full bg-sky-100 px-1.5 py-0.5 align-middle text-[10px] font-bold text-sky-700">SITE</span>}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-bordo/50">
          {order.delivery_time && <span>🕒 {order.delivery_time.slice(0, 5)}</span>}
          {order.fulfillment === 'retirada' ? (
            <span className="font-semibold text-sky-700">Retirada</span>
          ) : mapsUrl ? (
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-bordo/70 underline-offset-2 hover:underline">
              <MapPin className="h-3 w-3" />
              {order.address}
            </a>
          ) : null}
          {order.phone && <span>{fmtPhone(order.phone)}</span>}
        </div>
      </div>
    </div>
  );
}

/** Botão rápido de receber, para pedidos com saldo */
export function ReceiveButton({ order }: { order: OrderFull }) {
  const { openPayment } = useUI();
  if (order.cancelled || order.balance <= 0.004) return null;
  return (
    <button
      onClick={() => openPayment(order.id)}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-700"
    >
      Receber {order.balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
    </button>
  );
}
