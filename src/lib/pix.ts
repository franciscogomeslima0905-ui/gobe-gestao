import type { AppSettings } from './types';

/** Remove acentos e caracteres que o padrão Pix não aceita */
const clean = (s: string, max: number) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .\-]/g, '')
    .toUpperCase()
    .trim()
    .slice(0, max);

const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** CRC16-CCITT (0x1021, inicial 0xFFFF), exigido pelo Banco Central */
function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Formata a chave conforme o tipo escolhido nas configurações */
export function formatPixKey(type: AppSettings['pix']['type'], key: string) {
  const k = key.trim();
  const digits = k.replace(/\D/g, '');
  if (type === 'telefone') return digits.startsWith('55') && digits.length >= 12 ? `+${digits}` : `+55${digits}`;
  if (type === 'cpf' || type === 'cnpj') return digits;
  if (type === 'email') return k.toLowerCase();
  return k;
}

export const pixConfigured = (s: AppSettings) => s.pix.key.trim().length > 0;

/** Gera o "Pix copia e cola" (BR Code estático) com o valor informado */
export function pixPayload(s: AppSettings, amount: number, txid = '***') {
  const account = field('00', 'br.gov.bcb.pix') + field('01', formatPixKey(s.pix.type, s.pix.key));
  const tx = clean(txid, 25).replace(/[^A-Z0-9]/g, '') || '***';
  let p =
    field('00', '01') +
    field('26', account) +
    field('52', '0000') +
    field('53', '986') +
    (amount > 0 ? field('54', amount.toFixed(2)) : '') +
    field('58', 'BR') +
    field('59', clean(s.pix.name || 'GB GOBE', 25) || 'GB GOBE') +
    field('60', clean(s.pix.city || 'TRAMANDAI', 15) || 'TRAMANDAI') +
    field('62', field('05', tx)) +
    '6304';
  p += crc16(p);
  return p;
}
