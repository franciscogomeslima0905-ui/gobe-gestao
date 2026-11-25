import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useData } from '../context/DataContext';
import { errorMessage, useUI } from '../context/UIContext';
import { PAYMENT_METHOD_LABEL } from '../lib/constants';
import { brl, fmtDate, todayISO } from '../lib/format';
import type { PaymentKind, PaymentMethod } from '../lib/types';
import { Button, Field, IconButton, Input, Modal, MoneyInput, PaymentBadge, Select, cx } from './ui';

export default function PaymentModal({ orderId, kind, onClose }: { orderId: string; kind: PaymentKind; onClose: () => void }) {
  const { getOrder, addPayment, deletePayment } = useData();
  const { toast, confirm } = useUI();
  const order = getOrder(orderId);

  const isRefund = kind === 'estorno';
  const suggested = order ? (isRefund ? order.netPaid : order.balance) : 0;
  const [amount, setAmount] = useState(suggested);
  const [method, setMethod] = useState<PaymentMethod>(order?.payment_method && order.payment_method !== 'a_definir' ? order.payment_method : 'pix');
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  if (!order) return null;

  const save = async () => {
    if (amount <= 0) return toast('Informe um valor maior que zero.', 'error');
    if (isRefund && amount > order.netPaid + 0.004) return toast('O estorno não pode ser maior que o valor recebido.', 'error');
    setSaving(true);
    try {
      await addPayment({ order_id: order.id, amount, method, kind, paid_at: date, notes });
      toast(isRefund ? 'Estorno registrado!' : 'Pagamento registrado!');
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const r = await confirm({ title: 'Excluir lançamento?', message: 'Este lançamento será removido do histórico de recebimentos.', danger: true, confirmLabel: 'Excluir' });
    if (!r.ok) return;
    try {
      await deletePayment(id);
      toast('Lançamento excluído.');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={isRefund ? 'Registrar estorno' : 'Registrar pagamento'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={save} loading={saving} variant={isRefund ? 'danger' : 'primary'}>
            {isRefund ? 'Registrar estorno' : 'Registrar pagamento'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-bordo/5">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-bordo">{order.customer_name}</p>
            <PaymentBadge status={order.paymentStatusLive} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <Mini label="Total" value={brl(order.cancelled ? 0 : order.total)} />
            <Mini label="Recebido" value={brl(order.netPaid)} />
            <Mini label={order.cancelled ? 'A estornar' : 'Saldo'} value={brl(order.cancelled ? order.netPaid : order.balance)} strong />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={isRefund ? 'Valor do estorno' : 'Valor recebido'}>
            <MoneyInput value={amount} onChange={setAmount} autoFocus />
          </Field>
          <Field label="Data">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Forma" className="col-span-2">
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              <option value="pix">{PAYMENT_METHOD_LABEL.pix}</option>
              <option value="dinheiro">{PAYMENT_METHOD_LABEL.dinheiro}</option>
            </Select>
          </Field>
          <Field label="Observação" className="col-span-2">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
          </Field>
        </div>

        {order.payments.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-bordo/50">Lançamentos deste pedido</p>
            <ul className="divide-y divide-bordo/5 rounded-2xl bg-white ring-1 ring-bordo/5">
              {order.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div>
                    <span className={cx('font-semibold', p.kind === 'estorno' ? 'text-cereja' : 'text-emerald-700')}>
                      {p.kind === 'estorno' ? '− ' : '+ '}
                      {brl(p.amount)}
                    </span>
                    <span className="ml-2 text-bordo/60">
                      {PAYMENT_METHOD_LABEL[p.method]} · {fmtDate(p.paid_at)}
                    </span>
                    {p.notes && <p className="text-xs text-bordo/50">{p.notes}</p>}
                  </div>
                  <IconButton icon={Trash2} label="Excluir lançamento" onClick={() => remove(p.id)} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Mini({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cx('rounded-xl px-2 py-2', strong ? 'bg-rosa-50 text-cereja' : 'bg-creme-50 text-bordo')}>
      <p className="text-[10px] uppercase tracking-wide opacity-60">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}
