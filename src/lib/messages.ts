import { productLabel } from './calc';
import { brl, capFirst, fmtLong, parseDay } from './format';
import { pixConfigured, pixPayload } from './pix';
import type { AppSettings, OrderFull } from './types';

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const itemsText = (o: OrderFull) => o.items.map((i) => `• ${i.quantity}× ${productLabel(i.product_name, i.flavor)}`).join('\n');
const when = (o: OrderFull) => `${capFirst(fmtLong(parseDay(o.delivery_date)))}${o.delivery_time ? ` às ${o.delivery_time.slice(0, 5)}` : ''}`;

export type MessageKind = 'confirmado' | 'pronto' | 'saiu' | 'pagamento';

export function buildMessage(kind: MessageKind, o: OrderFull, s: AppSettings) {
  const nome = first(o.customer_name);
  const retirada = o.fulfillment === 'retirada';
  switch (kind) {
    case 'confirmado':
      return [
        `Olá, ${nome}! 💕 Seu pedido na GB GOBÊ está confirmado:`,
        '',
        itemsText(o),
        '',
        `*Total: ${brl(o.total)}*`,
        `${retirada ? 'Retirada' : 'Entrega'}: ${when(o)}`,
        o.balance > 0.004 && o.netPaid > 0 ? `Já recebido: ${brl(o.netPaid)} · falta ${brl(o.balance)}` : '',
        '',
        'Obrigado pela preferência! 🍫',
      ]
        .filter((l, i, a) => l !== '' || a[i - 1] !== '')
        .join('\n');
    case 'pronto':
      return retirada
        ? `Olá, ${nome}! Seu pedido da GB GOBÊ está prontinho e já pode ser retirado 🍫💕`
        : `Olá, ${nome}! Seu pedido da GB GOBÊ está prontinho e logo sai para entrega 🍫💕`;
    case 'saiu':
      return `Olá, ${nome}! Seu pedido da GB GOBÊ saiu para entrega e já já chega aí 🚗💕`;
    case 'pagamento': {
      const lines = [`Olá, ${nome}! Tudo bem? Passando para lembrar do valor de *${brl(o.balance)}* do seu pedido na GB GOBÊ.`];
      if (pixConfigured(s)) lines.push('', 'Pix copia e cola:', pixPayload(s, o.balance));
      lines.push('', 'Obrigado! 💕');
      return lines.join('\n');
    }
  }
}
