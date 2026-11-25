import { addWeeks } from 'date-fns';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import OrderFormModal from '../components/OrderFormModal';
import PaymentModal from '../components/PaymentModal';
import { Button, Modal, Textarea, cx } from '../components/ui';
import { parseDay, toISODate } from '../lib/format';
import { weekStart } from '../lib/period';
import type { OrderDraft, PaymentKind } from '../lib/types';

type ToastType = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  type: ToastType;
  text: string;
}

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** pede um texto (ex.: motivo do cancelamento) */
  withReason?: string;
}

interface OrderFormState {
  open: boolean;
  orderId?: string;
  initial?: Partial<OrderDraft>;
}

interface UIValue {
  toast: (text: string, type?: ToastType) => void;
  confirm: (o: ConfirmOptions) => Promise<{ ok: boolean; reason: string }>;
  openOrderForm: (opts?: { orderId?: string; initial?: Partial<OrderDraft> }) => void;
  openPayment: (orderId: string, kind?: PaymentKind) => void;
  /** segunda-feira da semana selecionada (YYYY-MM-DD) */
  week: string;
  setWeek: (isoAnyDay: string) => void;
  shiftWeek: (dir: 1 | -1) => void;
}

const UIContext = createContext<UIValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { open: boolean }) | null>(null);
  const [reason, setReason] = useState('');
  const resolver = useRef<((r: { ok: boolean; reason: string }) => void) | null>(null);
  const [orderForm, setOrderForm] = useState<OrderFormState>({ open: false });
  const [payment, setPayment] = useState<{ orderId: string; kind: PaymentKind } | null>(null);
  const [week, setWeekState] = useState(() => toISODate(weekStart(new Date())));

  const toast = useCallback((text: string, type: ToastType = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 6000 : 3500);
  }, []);

  const confirm = useCallback((o: ConfirmOptions) => {
    setReason('');
    setConfirmState({ ...o, open: true });
    return new Promise<{ ok: boolean; reason: string }>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const closeConfirm = (ok: boolean) => {
    resolver.current?.({ ok, reason });
    resolver.current = null;
    setConfirmState(null);
  };

  const openOrderForm = useCallback((opts?: { orderId?: string; initial?: Partial<OrderDraft> }) => {
    setOrderForm({ open: true, orderId: opts?.orderId, initial: opts?.initial });
  }, []);

  const openPayment = useCallback((orderId: string, kind: PaymentKind = 'recebimento') => {
    setPayment({ orderId, kind });
  }, []);

  const setWeek = useCallback((iso: string) => setWeekState(toISODate(weekStart(parseDay(iso)))), []);
  const shiftWeek = useCallback(
    (dir: 1 | -1) => setWeekState((w) => toISODate(addWeeks(parseDay(w), dir))),
    [],
  );

  const ICON = { success: CheckCircle2, error: XCircle, info: Info };

  return (
    <UIContext.Provider value={{ toast, confirm, openOrderForm, openPayment, week, setWeek, shiftWeek }}>
      {children}

      {orderForm.open && (
        <OrderFormModal
          orderId={orderForm.orderId}
          initial={orderForm.initial}
          onClose={() => setOrderForm({ open: false })}
        />
      )}

      {payment && <PaymentModal orderId={payment.orderId} kind={payment.kind} onClose={() => setPayment(null)} />}

      <Modal
        open={!!confirmState}
        onClose={() => closeConfirm(false)}
        size="sm"
        title={
          <span className="flex items-center gap-2">
            {confirmState?.danger && <AlertTriangle className="h-5 w-5 text-cereja" />}
            {confirmState?.title}
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => closeConfirm(false)}>
              Voltar
            </Button>
            <Button variant={confirmState?.danger ? 'danger' : 'primary'} onClick={() => closeConfirm(true)}>
              {confirmState?.confirmLabel ?? 'Confirmar'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-bordo/80">
          <div>{confirmState?.message}</div>
          {confirmState?.withReason && (
            <Textarea placeholder={confirmState.withReason} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </div>
      </Modal>

      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2 print:hidden">
        {toasts.map((t) => {
          const Icon = ICON[t.type];
          return (
            <div
              key={t.id}
              className={cx(
                'pointer-events-auto flex items-start gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-lift ring-1 animate-slide-in',
                t.type === 'success' && 'bg-white text-bordo ring-emerald-200',
                t.type === 'error' && 'bg-white text-red-700 ring-red-200',
                t.type === 'info' && 'bg-white text-bordo ring-rosa-300',
              )}
            >
              <Icon
                className={cx(
                  'mt-0.5 h-5 w-5 shrink-0',
                  t.type === 'success' && 'text-emerald-500',
                  t.type === 'error' && 'text-red-500',
                  t.type === 'info' && 'text-rosa-500',
                )}
              />
              <span>{t.text}</span>
            </div>
          );
        })}
      </div>
    </UIContext.Provider>
  );
}

export const useUI = () => {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI fora do UIProvider');
  return ctx;
};

export const errorMessage = (e: unknown) => {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Erro inesperado';
  if (/row-level security|permission denied/i.test(msg)) return 'Sem permissão para esta ação. Verifique se seu usuário está liberado na equipe.';
  if (/fetch|network/i.test(msg)) return 'Sem conexão. Verifique a internet e tente novamente.';
  return msg;
};
