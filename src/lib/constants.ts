import type { DisplayStatus, PaymentMethod, PaymentStatus, ProductionStatus } from './types';

export interface DeliveryDay {
  slug: string;
  label: string;
  short: string;
  /** dias a partir da segunda-feira da semana */
  offset: number;
}

/** Não há entregas às terças e quintas */
export const DELIVERY_DAYS: DeliveryDay[] = [
  { slug: 'segunda', label: 'Segunda-feira', short: 'Seg', offset: 0 },
  { slug: 'quarta', label: 'Quarta-feira', short: 'Qua', offset: 2 },
  { slug: 'sexta', label: 'Sexta-feira', short: 'Sex', offset: 4 },
  { slug: 'sabado', label: 'Sábado', short: 'Sáb', offset: 5 },
  { slug: 'domingo', label: 'Domingo', short: 'Dom', offset: 6 },
];

/** getDay(): 0 = domingo ... 6 = sábado */
export const NO_DELIVERY_WEEKDAYS = [2, 4];

export const STATUS_META: Record<
  DisplayStatus,
  { label: string; badge: string; dot: string; bar: string }
> = {
  pendente: {
    label: 'Produção pendente',
    badge: 'bg-amber-100 text-amber-800 ring-amber-200',
    dot: 'bg-amber-400',
    bar: 'bg-amber-400',
  },
  em_producao: {
    label: 'Em produção',
    badge: 'bg-sky-100 text-sky-800 ring-sky-200',
    dot: 'bg-sky-500',
    bar: 'bg-sky-500',
  },
  pronto: {
    label: 'Pronto',
    badge: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500',
  },
  entregue: {
    label: 'Entregue',
    badge: 'bg-violet-100 text-violet-800 ring-violet-200',
    dot: 'bg-violet-500',
    bar: 'bg-violet-500',
  },
  cancelado: {
    label: 'Cancelado',
    badge: 'bg-red-100 text-red-700 ring-red-200',
    dot: 'bg-red-500',
    bar: 'bg-red-500',
  },
};

export const PRODUCTION_LABEL: Record<ProductionStatus, string> = {
  pendente: 'Pendente',
  em_producao: 'Em produção',
  pronto: 'Pronto',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  a_definir: 'A definir',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pago: 'Pago',
  pendente: 'Pendente',
  parcial: 'Parcialmente pago',
};

export const PAYMENT_STATUS_BADGE: Record<PaymentStatus, string> = {
  pago: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  pendente: 'bg-rose-50 text-cereja ring-rose-200',
  parcial: 'bg-orange-50 text-orange-700 ring-orange-200',
};

/** Paleta dos gráficos, derivada da identidade GB GOBÊ */
export const CHART_COLORS = ['#CE0D32', '#581D29', '#E27FAB', '#C99A6B', '#8A4352', '#F3B4D0', '#7A5C3E', '#B50B2C', '#D9B99B'];
