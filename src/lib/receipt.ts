import { productLabel } from './calc';
import { brl, capFirst, fmtDate, fmtLong, parseDay } from './format';
import type { OrderFull } from './types';

/** Desenha o comprovante do pedido (PNG) com a identidade da GB GOBÊ */
export async function receiptImage(o: OrderFull): Promise<Blob> {
  if (document.fonts?.ready) await document.fonts.ready;
  const W = 1080;
  const pad = 80;
  const rowH = 64;
  const H = 760 + o.items.length * rowH + (o.netPaid > 0 ? 120 : 0);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) throw new Error('Não foi possível gerar a imagem.');

  const serif = '"Playfair Display", Georgia, serif';
  const sans = 'Nunito, Arial, sans-serif';

  // fundo
  g.fillStyle = '#F6EFE5';
  g.fillRect(0, 0, W, H);
  // cabeçalho
  g.fillStyle = '#CE0D32';
  g.fillRect(0, 0, W, 240);
  g.fillStyle = '#F6EFE5';
  g.font = `700 76px ${serif}`;
  g.textAlign = 'center';
  g.fillText('GB GOBÊ', W / 2, 130);
  g.fillStyle = '#F3B4D0';
  g.font = `600 28px ${sans}`;
  g.fillText('CONFEITARIA ARTESANAL', W / 2, 180);

  // cliente e data
  g.textAlign = 'left';
  let y = 330;
  g.fillStyle = '#581D29';
  g.font = `700 46px ${serif}`;
  g.fillText(o.customer_name, pad, y);
  y += 56;
  g.font = `500 30px ${sans}`;
  g.fillStyle = 'rgba(88,29,41,.65)';
  g.fillText(
    `${o.fulfillment === 'retirada' ? 'Retirada' : 'Entrega'}: ${capFirst(fmtLong(parseDay(o.delivery_date)))}${o.delivery_time ? ` às ${o.delivery_time.slice(0, 5)}` : ''}`,
    pad,
    y,
  );

  // itens
  y += 70;
  g.strokeStyle = 'rgba(88,29,41,.15)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(pad, y);
  g.lineTo(W - pad, y);
  g.stroke();
  y += 60;
  for (const i of o.items) {
    g.fillStyle = '#581D29';
    g.font = `600 32px ${sans}`;
    g.textAlign = 'left';
    const label = `${i.quantity}× ${productLabel(i.product_name, i.flavor)}`;
    g.fillText(label.length > 40 ? label.slice(0, 39) + '…' : label, pad, y);
    g.textAlign = 'right';
    g.fillText(brl(i.quantity * i.unit_price), W - pad, y);
    y += rowH;
  }

  const line = (label: string, value: string, bold = false, color = '#581D29') => {
    g.fillStyle = color;
    g.font = `${bold ? 800 : 500} ${bold ? 40 : 30}px ${sans}`;
    g.textAlign = 'left';
    g.fillText(label, pad, y);
    g.textAlign = 'right';
    g.fillText(value, W - pad, y);
    y += bold ? 64 : 50;
  };

  g.beginPath();
  g.moveTo(pad, y - 20);
  g.lineTo(W - pad, y - 20);
  g.stroke();
  y += 30;
  if (o.discount > 0) line('Desconto', `− ${brl(o.discount)}`);
  if (o.delivery_fee > 0) line('Taxa de entrega', brl(o.delivery_fee));
  line('Total', brl(o.total), true, '#CE0D32');
  if (o.netPaid > 0) {
    line('Pago', brl(o.netPaid), false, '#15803d');
    if (o.balance > 0.004) line('Falta pagar', brl(o.balance), false, '#CE0D32');
  }

  // rodapé
  g.textAlign = 'center';
  g.fillStyle = 'rgba(88,29,41,.55)';
  g.font = `italic 500 32px ${serif}`;
  g.fillText('Feito à mão, com carinho. Obrigado! 💕', W / 2, H - 90);
  g.font = `500 24px ${sans}`;
  g.fillText(`Pedido de ${fmtDate(o.order_date)} · @gobe.sweets`, W / 2, H - 45);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem'))), 'image/png'));
}

/** Compartilha (celular) ou baixa (computador) o comprovante */
export async function shareReceipt(o: OrderFull) {
  const blob = await receiptImage(o);
  const file = new File([blob], `pedido-${o.customer_name.split(' ')[0].toLowerCase()}.png`, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: 'Pedido GB GOBÊ' });
    return 'shared';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return 'downloaded';
}
