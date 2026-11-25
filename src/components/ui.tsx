import { Loader2, X, type LucideIcon } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { PAYMENT_STATUS_BADGE, PAYMENT_STATUS_LABEL, STATUS_META } from '../lib/constants';
import { moneyToInput, parseMoney } from '../lib/format';
import type { DisplayStatus, PaymentStatus } from '../lib/types';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* --------------------------------- Botão --------------------------------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-cereja text-white hover:bg-cereja-600 shadow-sm shadow-cereja/30',
  secondary: 'bg-white text-bordo ring-1 ring-bordo/15 hover:bg-creme-50 hover:ring-bordo/30',
  ghost: 'text-bordo hover:bg-bordo/5',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  soft: 'bg-rosa-50 text-cereja hover:bg-rosa-100',
};

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  icon?: LucideIcon;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = 'primary', size = 'md', icon: Icon, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
});

export function IconButton({
  icon: Icon,
  label,
  className,
  ...rest
}: { icon: LucideIcon; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cx(
        'inline-flex h-9 w-9 items-center justify-center rounded-xl text-bordo/70 transition hover:bg-bordo/5 hover:text-bordo disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}

/* --------------------------------- Cartão -------------------------------- */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-2xl bg-white p-5 shadow-soft ring-1 ring-bordo/5', className)}>{children}</div>;
}

export function SectionTitle({ icon: Icon, title, subtitle, action }: { icon?: LucideIcon; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rosa-50 text-cereja">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div>
          <h3 className="font-display text-lg font-semibold text-bordo">{title}</h3>
          {subtitle && <p className="text-xs text-bordo/50">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-semibold text-bordo sm:text-3xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-bordo/60">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  cereja: 'bg-cereja/10 text-cereja',
  bordo: 'bg-bordo/10 text-bordo',
  rosa: 'bg-rosa-100 text-rosa-500',
  verde: 'bg-emerald-100 text-emerald-700',
  azul: 'bg-sky-100 text-sky-700',
  amarelo: 'bg-amber-100 text-amber-700',
  roxo: 'bg-violet-100 text-violet-700',
  laranja: 'bg-orange-100 text-orange-700',
} as const;
export type Tone = keyof typeof TONES;

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'cereja',
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'group rounded-2xl bg-white p-4 shadow-soft ring-1 ring-bordo/5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift animate-fade-in',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-bordo/50">{label}</p>
        <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110', TONES[tone])}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-1 font-display text-2xl font-semibold text-bordo">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-bordo/50">{hint}</p>}
    </div>
  );
}

/* --------------------------------- Badges -------------------------------- */
export function StatusBadge({ status, className }: { status: DisplayStatus; className?: string }) {
  const m = STATUS_META[status];
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1', m.badge, className)}>
      <span className={cx('h-1.5 w-1.5 rounded-full', m.dot)} />
      {m.label}
    </span>
  );
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <span className={cx('inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1', PAYMENT_STATUS_BADGE[status])}>
      {PAYMENT_STATUS_LABEL[status]}
    </span>
  );
}

/* ------------------------------- Formulários ----------------------------- */
export function Field({ label, children, hint, error, className, required }: { label: string; children: ReactNode; hint?: string; error?: string; className?: string; required?: boolean }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-semibold text-bordo/70">
        {label}
        {required && <span className="text-cereja"> *</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-cereja">{error}</span> : hint ? <span className="mt-1 block text-xs text-bordo/45">{hint}</span> : null}
    </label>
  );
}

const inputBase =
  'w-full rounded-xl border-0 bg-creme-50 px-3 py-2.5 text-sm text-bordo ring-1 ring-bordo/10 placeholder:text-bordo/35 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-cereja/50 disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cx(inputBase, className)} {...p} />;
});

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputBase, 'cursor-pointer pr-8', className)} {...p}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputBase, 'min-h-[80px] resize-y', className)} {...p} />;
}

/** Campo de valor em reais (aceita vírgula) */
export function MoneyInput({ value, onChange, className, ...p }: { value: number; onChange: (n: number) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(moneyToInput(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(moneyToInput(value));
  }, [value, focused]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-bordo/40">R$</span>
      <input
        inputMode="decimal"
        className={cx(inputBase, 'pl-9', className)}
        value={text}
        placeholder="0,00"
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setText(moneyToInput(parseMoney(text)));
        }}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseMoney(e.target.value));
        }}
        {...p}
      />
    </div>
  );
}

export function Checkbox({ checked, onChange, label, disabled, className }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <label className={cx('inline-flex cursor-pointer select-none items-center gap-2', disabled && 'cursor-not-allowed opacity-50', className)}>
      <span
        className={cx(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 transition-all duration-200',
          checked ? 'bg-emerald-500 ring-emerald-500' : 'bg-white ring-bordo/25 hover:ring-cereja/60',
        )}
      >
        <svg viewBox="0 0 16 16" className={cx('h-3.5 w-3.5 text-white transition-transform', checked ? 'scale-100' : 'scale-0')}>
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label && <span className="text-sm text-bordo">{label}</span>}
    </label>
  );
}

/* --------------------------------- Chips --------------------------------- */
export function Chip({ active, onClick, children, dot }: { active: boolean; onClick: () => void; children: ReactNode; dot?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
        active ? 'bg-bordo text-creme shadow-sm' : 'bg-white text-bordo/70 ring-1 ring-bordo/10 hover:ring-bordo/30',
      )}
    >
      {dot && <span className={cx('h-2 w-2 rounded-full', dot)} />}
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap rounded-xl bg-white p-1 ring-1 ring-bordo/10">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
            value === o.value ? 'bg-cereja text-white shadow-sm' : 'text-bordo/60 hover:text-bordo',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------- Modal --------------------------------- */
export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-bordo/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className={cx('relative flex max-h-[94vh] w-full flex-col rounded-t-3xl bg-creme-50 shadow-2xl animate-scale-in sm:rounded-3xl', w)}>
        <div className="flex items-center justify-between gap-3 border-b border-bordo/10 px-5 py-4">
          <h2 className="font-display text-xl font-semibold text-bordo">{title}</h2>
          <IconButton icon={X} label="Fechar" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-bordo/10 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------ Diversos -------------------------------- */
export function ProgressBar({ value, className, barClass }: { value: number; className?: string; barClass?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cx('h-2.5 w-full overflow-hidden rounded-full bg-creme-200', className)}>
      <div
        className={cx('h-full rounded-full transition-all duration-700 ease-out', barClass ?? (v >= 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-cereja to-rosa-500'))}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-bordo/10 bg-white/60 px-6 py-12 text-center animate-fade-in">
      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-rosa-50 text-cereja">
        <Icon className="h-7 w-7" />
      </span>
      <p className="font-display text-lg font-semibold text-bordo">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-bordo/55">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-bordo/60">
      <Loader2 className="h-6 w-6 animate-spin text-cereja" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-bordo/40" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Pesquisar…'}
        className={cx(inputBase, 'bg-white pl-9')}
      />
    </div>
  );
}
