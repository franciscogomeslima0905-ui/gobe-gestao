import { addDays } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUI } from '../context/UIContext';
import { fmtPattern, parseDay, toISODate } from '../lib/format';
import { weekStart } from '../lib/period';
import { IconButton, cx } from './ui';

export default function WeekSelector({ className }: { className?: string }) {
  const { week, setWeek, shiftWeek } = useUI();
  const start = parseDay(week);
  const end = addDays(start, 6);
  const isCurrent = toISODate(weekStart(new Date())) === week;

  return (
    <div className={cx('inline-flex items-center gap-1 rounded-2xl bg-white p-1 shadow-soft ring-1 ring-bordo/5', className)}>
      <IconButton icon={ChevronLeft} label="Semana anterior" onClick={() => shiftWeek(-1)} />
      <label className="relative flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-creme-50">
        <CalendarDays className="h-4 w-4 text-cereja" />
        <span className="whitespace-nowrap text-sm font-semibold text-bordo">
          {fmtPattern(start, 'dd/MM')} – {fmtPattern(end, 'dd/MM/yyyy')}
        </span>
        <input
          type="date"
          aria-label="Escolher uma data"
          className="absolute inset-0 cursor-pointer opacity-0"
          value={week}
          onChange={(e) => e.target.value && setWeek(e.target.value)}
        />
      </label>
      <IconButton icon={ChevronRight} label="Próxima semana" onClick={() => shiftWeek(1)} />
      {!isCurrent && (
        <button
          type="button"
          onClick={() => setWeek(toISODate(new Date()))}
          className="rounded-xl px-3 py-1.5 text-xs font-bold text-cereja transition hover:bg-rosa-50"
        >
          Esta semana
        </button>
      )}
    </div>
  );
}
