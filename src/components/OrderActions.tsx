import { Ban, Copy, MessageCircle, MoreVertical, Pencil, RotateCcw, Trash2, Undo2, Wallet } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useData } from '../context/DataContext';
import { errorMessage, useUI } from '../context/UIContext';
import { duplicateDraft } from '../lib/drafts';
import { brl } from '../lib/format';
import type { OrderFull } from '../lib/types';
import { IconButton, cx } from './ui';

export function useOrderActions() {
  const { cancelOrder, restoreOrder, deleteOrder, products } = useData();
  const { confirm, toast, openOrderForm, openPayment, openShare } = useUI();

  return {
    edit: (o: OrderFull) => openOrderForm({ orderId: o.id }),
    duplicate: (o: OrderFull) => openOrderForm({ initial: duplicateDraft(o, products) }),
    pay: (o: OrderFull) => openPayment(o.id),
    share: (o: OrderFull) => openShare(o.id),
    refund: (o: OrderFull) => openPayment(o.id, 'estorno'),
    cancel: async (o: OrderFull) => {
      const r = await confirm({
        title: 'Cancelar pedido?',
        danger: true,
        confirmLabel: 'Cancelar pedido',
        withReason: 'Motivo do cancelamento (opcional)',
        message: (
          <>
            O pedido de <b>{o.customer_name}</b> deixará de contar nas vendas e na produção, mas continuará no histórico.
            {o.netPaid > 0 && (
              <span className="mt-2 block rounded-xl bg-rosa-50 p-2 text-cereja">
                Já foram recebidos {brl(o.netPaid)}. Depois de cancelar, registre o estorno se devolver o valor.
              </span>
            )}
          </>
        ),
      });
      if (!r.ok) return;
      try {
        await cancelOrder(o.id, r.reason);
        toast('Pedido cancelado.');
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    },
    restore: async (o: OrderFull) => {
      const r = await confirm({ title: 'Reativar pedido?', message: `O pedido de ${o.customer_name} voltará a contar nas vendas e na produção.`, confirmLabel: 'Reativar' });
      if (!r.ok) return;
      try {
        await restoreOrder(o.id);
        toast('Pedido reativado.');
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    },
    remove: async (o: OrderFull) => {
      const r = await confirm({
        title: 'Excluir definitivamente?',
        danger: true,
        confirmLabel: 'Excluir para sempre',
        message: (
          <>
            O pedido de <b>{o.customer_name}</b>, seus itens e pagamentos serão apagados e <b>não poderão ser recuperados</b>. Para manter o registro,
            prefira cancelar.
          </>
        ),
      });
      if (!r.ok) return;
      try {
        await deleteOrder(o.id);
        toast('Pedido excluído.');
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    },
  };
}

export default function OrderActions({ order, allowDelete = false }: { order: OrderFull; allowDelete?: boolean }) {
  const a = useOrderActions();
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const open = !!pos;
  const ref = useRef<HTMLDivElement>(null);
  const setOpen = (v: boolean) => {
    if (!v || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    const menuH = 300;
    const top = r.bottom + menuH > window.innerHeight ? Math.max(8, r.top - menuH) : r.bottom + 4;
    setPos({ top, right: Math.max(8, window.innerWidth - r.right) });
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setPos(null);
    const close = () => setPos(null);
    document.addEventListener('mousedown', h);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', h);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const items = [
    { label: 'Editar', icon: Pencil, run: () => a.edit(order), show: true },
    { label: 'WhatsApp, Pix e comprovante', icon: MessageCircle, run: () => a.share(order), show: true },
    { label: 'Duplicar', icon: Copy, run: () => a.duplicate(order), show: true },
    { label: 'Registrar pagamento', icon: Wallet, run: () => a.pay(order), show: !order.cancelled && order.balance > 0 },
    { label: 'Registrar estorno', icon: Undo2, run: () => a.refund(order), show: order.netPaid > 0 },
    { label: 'Cancelar pedido', icon: Ban, run: () => a.cancel(order), show: !order.cancelled, danger: true },
    { label: 'Reativar pedido', icon: RotateCcw, run: () => a.restore(order), show: order.cancelled },
    { label: 'Excluir definitivamente', icon: Trash2, run: () => a.remove(order), show: allowDelete, danger: true },
  ].filter((i) => i.show);

  return (
    <div ref={ref} className="relative inline-flex items-center gap-0.5 print:hidden">
      <IconButton icon={Pencil} label="Editar pedido" onClick={() => a.edit(order)} />
      <IconButton icon={MoreVertical} label="Mais ações" onClick={() => setOpen(!open)} />
      {pos && (
        <div
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-40 w-56 overflow-hidden rounded-2xl bg-white py-1 shadow-lift ring-1 ring-bordo/10 animate-scale-in"
        >
          {items.map((i) => (
            <button
              key={i.label}
              onClick={() => {
                setOpen(false);
                i.run();
              }}
              className={cx(
                'flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm font-medium transition hover:bg-creme-50',
                i.danger ? 'text-cereja' : 'text-bordo',
              )}
            >
              <i.icon className="h-4 w-4" />
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
