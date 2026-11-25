import type { OrderDraft } from '../lib/types';
import OrderForm from './OrderForm';
import { Modal } from './ui';

export default function OrderFormModal({
  orderId,
  initial,
  onClose,
}: {
  orderId?: string;
  initial?: Partial<OrderDraft>;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} size="xl" title={orderId ? 'Editar pedido' : initial ? 'Novo pedido (cópia)' : 'Novo pedido'}>
      <OrderForm orderId={orderId} initial={initial} onDone={onClose} onCancel={onClose} />
    </Modal>
  );
}
