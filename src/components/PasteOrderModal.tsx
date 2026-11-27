import { ClipboardPaste, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { isNoDeliveryDay } from '../lib/drafts';
import { todayISO, uid } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { OrderDraft } from '../lib/types';
import { Button, Modal, Textarea } from './ui';

interface Parsed {
  customer_name: string | null;
  phone: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
  fulfillment: 'entrega' | 'retirada' | null;
  address: string | null;
  items: { product_id: string; quantity: number }[];
  unknown_items: string[];
  notes: string | null;
}

export default function PasteOrderModal({ onClose, onResult }: { onClose: () => void; onResult: (patch: Partial<OrderDraft>) => void }) {
  const { products } = useData();
  const { toast } = useUI();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pasteClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setText(t);
      else toast('A área de transferência está vazia.', 'error');
    } catch {
      toast('Toque e segure na caixa de texto e escolha “Colar”.', 'info');
    }
  };

  const run = async () => {
    if (!text.trim()) return setError('Cole a mensagem do cliente.');
    setLoading(true);
    setError(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/parse-order', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` },
        body: JSON.stringify({
          text,
          today: todayISO(),
          products: products.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, flavor: p.flavor })),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<Parsed> & { error?: string };
      if (!res.ok) throw new Error(body.error || (res.status === 404 ? 'A função de leitura não está publicada.' : `Erro ${res.status}`));
      const r = body as Parsed;

      const items = r.items
        .map((i) => {
          const p = products.find((x) => x.id === i.product_id);
          return p
            ? { key: uid(), product_id: p.id, product_name: p.name, flavor: p.flavor, unit_price: p.price, quantity: i.quantity, produced_qty: 0 }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x);

      const notes = [r.notes, r.unknown_items.length ? `Não identificado: ${r.unknown_items.join(', ')}` : null].filter(Boolean).join(' · ');
      const patch: Partial<OrderDraft> = { items };
      if (r.customer_name) patch.customer_name = r.customer_name;
      if (r.phone) patch.phone = r.phone;
      if (r.delivery_date && !isNoDeliveryDay(r.delivery_date)) patch.delivery_date = r.delivery_date;
      if (r.delivery_time) patch.delivery_time = r.delivery_time;
      if (r.fulfillment) patch.fulfillment = r.fulfillment;
      if (r.address) patch.address = r.address;
      if (notes) patch.notes = notes;
      if (!items.length) toast('Não encontrei produtos do cardápio na mensagem. Confira os itens.', 'error');
      onResult(patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ler a mensagem.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Colar pedido do WhatsApp"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon={Sparkles} loading={loading} onClick={run}>
            Preencher pedido
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-bordo/70">No WhatsApp, toque e segure a mensagem do cliente, escolha “Copiar” e cole aqui.</p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ex.: Oi! Quero 2 de nutella e 1 recheadíssimo ao leite pra sexta, entrega na Rua das Flores 123"
          className="min-h-[160px]"
        />
        <Button variant="soft" size="sm" icon={ClipboardPaste} onClick={pasteClipboard}>
          Colar o que copiei
        </Button>
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-100">{error}</p>}
        <p className="text-xs text-bordo/45">Você confere tudo antes de salvar.</p>
      </div>
    </Modal>
  );
}
