import { BellRing, CheckCircle2, ChevronRight, Copy, Image as ImageIcon, PackageCheck, QrCode, Truck, Wallet } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { errorMessage, useUI } from '../context/UIContext';
import { brl, whatsappLink } from '../lib/format';
import { buildMessage, type MessageKind } from '../lib/messages';
import { pixConfigured, pixPayload } from '../lib/pix';
import { shareReceipt } from '../lib/receipt';
import { Button, Modal, cx } from './ui';

/** Uma única janela por pedido: mensagens prontas, Pix e comprovante */
export default function ShareModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { getOrder } = useData();
  const { settings } = useSettings();
  const { toast } = useUI();
  const order = getOrder(orderId);
  const [showPix, setShowPix] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amount = order ? (order.balance > 0.004 ? order.balance : order.total) : 0;
  const payload = order && pixConfigured(settings) ? pixPayload(settings, amount) : '';

  useEffect(() => {
    if (!showPix || !payload) return;
    QRCode.toDataURL(payload, { width: 560, margin: 1, color: { dark: '#581D29', light: '#FFFFFF' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [showPix, payload]);

  if (!order) return null;

  const send = (kind: MessageKind) => {
    const text = buildMessage(kind, order, settings);
    const link = whatsappLink(order.phone, text) ?? `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(link, '_blank', 'noopener');
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Pix copia e cola copiado!');
    } catch {
      toast('Não foi possível copiar. Toque e segure no código para copiar.', 'error');
    }
  };

  const receipt = async () => {
    setBusy(true);
    try {
      const r = await shareReceipt(order);
      if (r === 'downloaded') toast('Comprovante baixado.');
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const options: { kind: MessageKind; label: string; icon: typeof Truck; show: boolean }[] = [
    { kind: 'confirmado', label: 'Pedido confirmado', icon: CheckCircle2, show: true },
    { kind: 'pronto', label: order.fulfillment === 'retirada' ? 'Pronto para retirar' : 'Pedido pronto', icon: PackageCheck, show: true },
    { kind: 'saiu', label: 'Saiu para entrega', icon: Truck, show: order.fulfillment !== 'retirada' },
    { kind: 'pagamento', label: `Cobrar ${brl(order.balance)}`, icon: BellRing, show: !order.cancelled && order.balance > 0.004 },
  ];

  return (
    <Modal open onClose={onClose} size="sm" title={`Enviar para ${order.customer_name.split(' ')[0]}`}>
      <div className="space-y-2">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-bordo/50">Mensagem no WhatsApp</p>
        {options
          .filter((o) => o.show)
          .map((o) => (
            <button
              key={o.kind}
              onClick={() => send(o.kind)}
              className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-bordo/5 transition hover:ring-emerald-300 active:scale-[.99]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <o.icon className="h-[18px] w-[18px]" />
              </span>
              <span className="flex-1 text-sm font-semibold text-bordo">{o.label}</span>
              <ChevronRight className="h-4 w-4 text-bordo/30" />
            </button>
          ))}
        {!order.phone && <p className="text-xs text-bordo/50">Pedido sem telefone: o WhatsApp vai pedir para escolher o contato.</p>}

        <div className="grid grid-cols-2 gap-2 pt-3">
          <button
            onClick={() => setShowPix((v) => !v)}
            className={cx(
              'flex flex-col items-center gap-1.5 rounded-2xl px-3 py-4 text-sm font-semibold ring-1 transition',
              showPix ? 'bg-bordo text-creme ring-bordo' : 'bg-white text-bordo ring-bordo/5',
            )}
          >
            <QrCode className="h-6 w-6" /> Pix {brl(amount)}
          </button>
          <button
            onClick={receipt}
            disabled={busy}
            className="flex flex-col items-center gap-1.5 rounded-2xl bg-white px-3 py-4 text-sm font-semibold text-bordo ring-1 ring-bordo/5 transition disabled:opacity-50"
          >
            <ImageIcon className="h-6 w-6" /> {busy ? 'Gerando…' : 'Comprovante'}
          </button>
        </div>

        {showPix &&
          (payload ? (
            <div className="space-y-3 rounded-2xl bg-white p-4 text-center ring-1 ring-bordo/5 animate-fade-in">
              {qr ? <img src={qr} alt="QR Code Pix" className="mx-auto w-56 rounded-xl" /> : <div className="mx-auto h-56 w-56 animate-pulse rounded-xl bg-creme" />}
              <p className="text-xs text-bordo/50">Chave: {settings.pix.key}</p>
              <Button icon={Copy} className="w-full" onClick={() => copy(payload)}>
                Copiar Pix copia e cola
              </Button>
            </div>
          ) : (
            <div className="flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-100">
              <Wallet className="h-5 w-5 shrink-0" />
              <p>
                Cadastre a chave Pix em{' '}
                <Link to="/configuracoes" onClick={onClose} className="font-semibold underline">
                  Produtos e configurações
                </Link>
                .
              </p>
            </div>
          ))}
      </div>
    </Modal>
  );
}
