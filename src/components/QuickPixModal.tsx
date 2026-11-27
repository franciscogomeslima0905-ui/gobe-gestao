import { CheckCircle2, Copy, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { errorMessage, useUI } from '../context/UIContext';
import { brl, fmtDate, todayISO } from '../lib/format';
import { pixConfigured, pixPayload } from '../lib/pix';
import { Button, Field, Modal, MoneyInput, Select } from './ui';

/**
 * Cobrança rápida por Pix: digita o valor (ou escolhe um pedido em aberto)
 * e o QR Code aparece na hora, grande, para o cliente pagar.
 */
export default function QuickPixModal({ onClose }: { onClose: () => void }) {
  const { orders, addPayment } = useData();
  const { settings } = useSettings();
  const { toast } = useUI();
  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState(0);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const today = todayISO();
  // pedidos com valor a receber: os de hoje primeiro
  const open = useMemo(
    () =>
      orders
        .filter((o) => !o.cancelled && o.balance > 0.004)
        .sort((a, b) => Number(b.delivery_date === today) - Number(a.delivery_date === today) || a.delivery_date.localeCompare(b.delivery_date))
        .slice(0, 60),
    [orders, today],
  );
  const order = open.find((o) => o.id === orderId);

  const ready = pixConfigured(settings);
  const payload = ready && amount > 0 ? pixPayload(settings, amount, order ? `GOBE${order.id.slice(0, 6).toUpperCase()}` : '***') : '';

  useEffect(() => {
    setCopied(false);
    if (!payload) return setQr(null);
    QRCode.toDataURL(payload, { width: 640, margin: 1, color: { dark: '#581D29', light: '#FFFFFF' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [payload]);

  const pickOrder = (id: string) => {
    setOrderId(id);
    const o = open.find((x) => x.id === id);
    if (o) setAmount(o.balance);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
    } catch {
      toast('Não foi possível copiar.', 'error');
    }
  };

  const markPaid = async () => {
    if (!order) return;
    setSaving(true);
    try {
      await addPayment({ order_id: order.id, amount: Math.min(amount, order.balance), method: 'pix', kind: 'recebimento', paid_at: today, notes: 'Pix pelo QR Code' });
      toast(`Pagamento de ${order.customer_name} registrado!`);
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="sm" title="Cobrar com Pix">
      {!ready ? (
        <div className="space-y-3 text-center">
          <QrCode className="mx-auto h-10 w-10 text-cereja" />
          <p className="text-sm text-bordo/70">Cadastre a chave Pix da GOBÊ para gerar o QR Code.</p>
          <Link to="/configuracoes" onClick={onClose}>
            <Button className="w-full">Cadastrar chave Pix</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Valor">
            <MoneyInput value={amount} onChange={setAmount} className="text-lg font-bold" autoFocus />
          </Field>

          {amount > 0 ? (
            <div className="rounded-3xl bg-white p-4 text-center ring-1 ring-bordo/10 animate-fade-in">
              <p className="font-display text-3xl font-semibold text-bordo">{brl(amount)}</p>
              {qr ? (
                <img src={qr} alt="QR Code Pix" className="mx-auto mt-3 w-full max-w-[280px] rounded-2xl" />
              ) : (
                <div className="mx-auto mt-3 aspect-square w-full max-w-[280px] animate-pulse rounded-2xl bg-creme" />
              )}
              <p className="mt-2 text-xs text-bordo/50">Mostre esta tela para o cliente escanear no app do banco.</p>
              <Button variant="secondary" icon={Copy} className="mt-3 w-full" onClick={copy}>
                {copied ? 'Copiado!' : 'Copiar Pix copia e cola'}
              </Button>
            </div>
          ) : (
            <p className="rounded-2xl bg-creme-50 p-4 text-center text-sm text-bordo/55">Digite o valor e o QR Code aparece na hora.</p>
          )}

          {open.length > 0 && (
            <Field label="É de algum pedido? (opcional)">
              <Select value={orderId} onChange={(e) => pickOrder(e.target.value)}>
                <option value="">Não, só o valor</option>
                {open.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.delivery_date === today ? 'Hoje · ' : `${fmtDate(o.delivery_date).slice(0, 5)} · `}
                    {o.customer_name} · {brl(o.balance)}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {order && amount > 0 && (
            <Button icon={CheckCircle2} className="w-full" loading={saving} onClick={markPaid}>
              Cliente pagou · marcar como pago
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}
