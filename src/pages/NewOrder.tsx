import { getDay } from 'date-fns';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import OrderForm from '../components/OrderForm';
import { PageHeader } from '../components/ui';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { DELIVERY_DAYS } from '../lib/constants';
import { brl, fmtDate, parseDay } from '../lib/format';

const SLUG_BY_WEEKDAY: Record<number, string> = { 1: 'segunda', 3: 'quarta', 5: 'sexta', 6: 'sabado', 0: 'domingo' };

export default function NewOrder() {
  const [formKey, setFormKey] = useState(0);
  const [lastId, setLastId] = useState<string | null>(null);
  const { getOrder } = useData();
  const { setWeek } = useUI();
  const last = lastId ? getOrder(lastId) : undefined;
  const slug = last ? SLUG_BY_WEEKDAY[getDay(parseDay(last.delivery_date))] : undefined;
  const dayLabel = DELIVERY_DAYS.find((d) => d.slug === slug)?.label;

  return (
    <div>
      <PageHeader title="Novo pedido" subtitle="Cadastre um pedido com um ou mais produtos. O total é calculado automaticamente." />

      {last && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200 animate-fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            <p className="text-sm text-emerald-900">
              Pedido de <b>{last.customer_name}</b> ({brl(last.total)}) cadastrado para <b>{fmtDate(last.delivery_date)}</b>.
            </p>
          </div>
          {slug && (
            <Link
              to={`/entregas/${slug}`}
              onClick={() => setWeek(last.delivery_date)}
              className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
            >
              Ver entregas de {dayLabel?.toLowerCase()} →
            </Link>
          )}
        </div>
      )}

      <OrderForm
        key={formKey}
        onDone={(id) => {
          setLastId(id);
          setFormKey((k) => k + 1);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </div>
  );
}
