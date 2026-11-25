import { ChevronLeft, ChevronRight } from 'lucide-react';
import { todayISO } from '../lib/format';
import { PERIOD_LABEL, rangeLabel, shiftPeriod, type PeriodState, type PeriodType } from '../lib/period';
import { IconButton, Input, Segmented } from './ui';

export const defaultPeriod = (type: PeriodType = 'mes'): PeriodState => ({
  type,
  ref: todayISO(),
  customStart: todayISO(),
  customEnd: todayISO(),
});

export default function PeriodFilter({ value, onChange }: { value: PeriodState; onChange: (p: PeriodState) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented<PeriodType>
        value={value.type}
        onChange={(type) => onChange({ ...value, type })}
        options={(Object.keys(PERIOD_LABEL) as PeriodType[]).map((k) => ({ value: k, label: PERIOD_LABEL[k] }))}
      />
      {value.type === 'personalizado' ? (
        <div className="flex items-center gap-2">
          <Input type="date" className="w-40 bg-white" value={value.customStart} onChange={(e) => onChange({ ...value, customStart: e.target.value })} />
          <span className="text-sm text-bordo/50">até</span>
          <Input type="date" className="w-40 bg-white" value={value.customEnd} onChange={(e) => onChange({ ...value, customEnd: e.target.value })} />
        </div>
      ) : (
        <div className="inline-flex items-center gap-1 rounded-xl bg-white p-1 ring-1 ring-bordo/10">
          <IconButton icon={ChevronLeft} label="Anterior" className="h-8 w-8" onClick={() => onChange(shiftPeriod(value, -1))} />
          <span className="min-w-[150px] px-1 text-center text-sm font-semibold capitalize text-bordo">{rangeLabel(value)}</span>
          <IconButton icon={ChevronRight} label="Próximo" className="h-8 w-8" onClick={() => onChange(shiftPeriod(value, 1))} />
          {value.ref !== todayISO() && (
            <button onClick={() => onChange({ ...value, ref: todayISO() })} className="rounded-lg px-2 py-1 text-xs font-bold text-cereja hover:bg-rosa-50">
              Hoje
            </button>
          )}
        </div>
      )}
    </div>
  );
}
