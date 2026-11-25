import { format, isValid, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const brl = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const num = (n: number) => (Number(n) || 0).toLocaleString('pt-BR');

/** Converte 'YYYY-MM-DD' (ou ISO completo) em Date local */
export const parseDay = (iso: string) => parseISO(iso.length > 10 ? iso : iso.slice(0, 10));

export const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = parseDay(iso);
  return isValid(d) ? format(d, 'dd/MM/yyyy') : '—';
};

export const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  const d = parseISO(iso);
  return isValid(d) ? format(d, "dd/MM/yyyy 'às' HH:mm") : '—';
};

export const fmtShort = (iso: string) => format(parseDay(iso), 'dd/MM');

export const fmtLong = (d: Date) => format(d, "EEEE, dd 'de' MMMM", { locale: ptBR });

export const fmtPattern = (d: Date, pattern: string) => format(d, pattern, { locale: ptBR });

export const toISODate = (d: Date): string => format(d, 'yyyy-MM-dd');

export const todayISO = () => toISODate(new Date());

/** Aceita "13,90", "1.234,56", "13.90" */
export const parseMoney = (s: string): number => {
  const clean = s.replace(/[^\d,.-]/g, '');
  if (!clean) return 0;
  if (clean.includes(',')) return Number(clean.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(clean) || 0;
};

export const moneyToInput = (n: number) =>
  n ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const onlyDigits = (s: string) => s.replace(/\D/g, '');

export const fmtPhone = (s?: string | null) => {
  if (!s) return '';
  const d = onlyDigits(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s;
};

export const whatsappLink = (phone?: string | null, text?: string) => {
  if (!phone) return null;
  let d = onlyDigits(phone);
  if (d.length < 10) return null;
  if (d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
