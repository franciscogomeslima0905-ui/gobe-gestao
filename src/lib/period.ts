import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseDay, toISODate } from './format';

export type PeriodType = 'dia' | 'semana' | 'mes' | 'ano' | 'personalizado';

export interface PeriodState {
  type: PeriodType;
  ref: string; // data de referência YYYY-MM-DD
  customStart: string;
  customEnd: string;
}

export interface Range {
  start: string;
  end: string;
}

export const PERIOD_LABEL: Record<PeriodType, string> = {
  dia: 'Dia',
  semana: 'Semana',
  mes: 'Mês',
  ano: 'Ano',
  personalizado: 'Personalizado',
};

export const weekStart = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });
export const weekEnd = (d: Date) => endOfWeek(d, { weekStartsOn: 1 });

export function getRange(p: PeriodState): Range {
  const ref = parseDay(p.ref);
  switch (p.type) {
    case 'dia':
      return { start: p.ref, end: p.ref };
    case 'semana':
      return { start: toISODate(weekStart(ref)), end: toISODate(weekEnd(ref)) };
    case 'mes':
      return { start: toISODate(startOfMonth(ref)), end: toISODate(endOfMonth(ref)) };
    case 'ano':
      return { start: toISODate(startOfYear(ref)), end: toISODate(endOfYear(ref)) };
    case 'personalizado': {
      const a = p.customStart || p.ref;
      const b = p.customEnd || p.ref;
      return a <= b ? { start: a, end: b } : { start: b, end: a };
    }
  }
}

export function shiftPeriod(p: PeriodState, dir: 1 | -1): PeriodState {
  const ref = parseDay(p.ref);
  const next =
    p.type === 'dia'
      ? addDays(ref, dir)
      : p.type === 'semana'
        ? addWeeks(ref, dir)
        : p.type === 'mes'
          ? addMonths(ref, dir)
          : p.type === 'ano'
            ? addYears(ref, dir)
            : ref;
  return { ...p, ref: toISODate(next) };
}

export function rangeLabel(p: PeriodState): string {
  const r = getRange(p);
  const s = parseDay(r.start);
  const e = parseDay(r.end);
  switch (p.type) {
    case 'dia':
      return format(s, "EEEE, dd/MM/yyyy", { locale: ptBR });
    case 'mes':
      return format(s, "MMMM 'de' yyyy", { locale: ptBR });
    case 'ano':
      return format(s, 'yyyy');
    default:
      return `${format(s, 'dd/MM/yyyy')} – ${format(e, 'dd/MM/yyyy')}`;
  }
}

export const inRange = (iso: string | null | undefined, r: Range) =>
  !!iso && iso.slice(0, 10) >= r.start && iso.slice(0, 10) <= r.end;

export const daysOf = (r: Range): string[] =>
  eachDayOfInterval({ start: parseDay(r.start), end: parseDay(r.end) }).map(toISODate);
