import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { derivePaymentStatus, deriveProductionStatus, enrichOrders, itemsSubtotal, orderTotal } from '../lib/calc';
import { round2, todayISO } from '../lib/format';
import { supabase } from '../lib/supabase';
import type {
  DeliveryStatus,
  Order,
  OrderDraft,
  OrderFull,
  OrderItem,
  Payment,
  PaymentKind,
  PaymentMethod,
  Product,
  ProductionStatus,
} from '../lib/types';
import { useAuth } from './AuthContext';

type TableName = 'products' | 'orders' | 'order_items' | 'payments';
type AnyRow = Record<string, unknown>;

/* ------------------------- normalização numérica ------------------------- */
const n = (v: unknown) => Number(v) || 0;
const normProduct = (r: AnyRow): Product => ({ ...(r as unknown as Product), price: n(r.price), sort_order: n(r.sort_order) });
const normOrder = (r: AnyRow): Order => ({
  ...(r as unknown as Order),
  subtotal: n(r.subtotal),
  discount: n(r.discount),
  delivery_fee: n(r.delivery_fee),
  total: n(r.total),
});
const normItem = (r: AnyRow): OrderItem => ({
  ...(r as unknown as OrderItem),
  unit_price: n(r.unit_price),
  quantity: n(r.quantity),
  produced_qty: n(r.produced_qty),
  unit_cost: r.unit_cost === null || r.unit_cost === undefined ? null : n(r.unit_cost),
  consumed_qty: n(r.consumed_qty),
});
const normPayment = (r: AnyRow): Payment => ({ ...(r as unknown as Payment), amount: n(r.amount) });

const NORMALIZERS: Record<TableName, (r: AnyRow) => unknown> = {
  products: normProduct,
  orders: normOrder,
  order_items: normItem,
  payments: normPayment,
};

async function fetchAll(table: TableName): Promise<AnyRow[]> {
  const size = 1000;
  let from = 0;
  const all: AnyRow[] = [];
  // O Supabase limita 1000 linhas por consulta: busca em páginas
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + size - 1);
    if (error) throw error;
    all.push(...((data ?? []) as AnyRow[]));
    if (!data || data.length < size) break;
    from += size;
  }
  return all;
}

function upsertById<T extends { id: string }>(list: T[], rows: T[]): T[] {
  const map = new Map(list.map((r) => [r.id, r]));
  rows.forEach((r) => map.set(r.id, r));
  return Array.from(map.values());
}

/* --------------------------------- tipos --------------------------------- */
export interface BackupFile {
  app: 'gb-gobe';
  version: 1 | 2;
  exported_at: string;
  products: Product[];
  orders: Order[];
  order_items: OrderItem[];
  payments: Payment[];
}

interface DataValue {
  loading: boolean;
  error: string | null;
  products: Product[];
  orders: OrderFull[];
  payments: Payment[];
  getOrder: (id: string) => OrderFull | undefined;
  reload: () => Promise<void>;
  saveOrder: (draft: OrderDraft, id?: string) => Promise<string>;
  cancelOrder: (id: string, reason: string) => Promise<void>;
  restoreOrder: (id: string) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  setItemProduced: (itemId: string, qty: number) => Promise<void>;
  setOrderAllProduced: (orderId: string, done: boolean) => Promise<void>;
  setProductionStatus: (orderId: string, status: ProductionStatus) => Promise<void>;
  setDeliveryStatus: (orderId: string, status: DeliveryStatus) => Promise<void>;
  addPayment: (p: { order_id: string; amount: number; method: PaymentMethod; kind: PaymentKind; paid_at: string; notes?: string }) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;
  saveProduct: (p: { name: string; flavor: string | null; price: number; active: boolean }, id?: string) => Promise<void>;
  setProductActive: (id: string, active: boolean) => Promise<void>;
  exportBackup: () => BackupFile;
  restoreBackup: (b: BackupFile) => Promise<void>;
}

const DataContext = createContext<DataValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { session, authorized } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [rawOrders, setRawOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const stateRef = useRef({ rawOrders, items, payments });
  stateRef.current = { rawOrders, items, payments };

  /* ------------------------------ carregamento ----------------------------- */
  const reload = useCallback(async () => {
    try {
      setError(null);
      const [p, o, i, pay] = await Promise.all([
        fetchAll('products'),
        fetchAll('orders'),
        fetchAll('order_items'),
        fetchAll('payments'),
      ]);
      setProducts(p.map(normProduct));
      setRawOrders(o.map(normOrder));
      setItems(i.map(normItem));
      setPayments(pay.map(normPayment));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar os dados');
    } finally {
      setLoading(false);
    }
  }, []);

  const applyRows = useCallback((table: TableName, rows: AnyRow[]) => {
    if (!rows.length) return;
    const norm = rows.map((r) => NORMALIZERS[table](r));
    if (table === 'products') setProducts((l) => upsertById(l, norm as Product[]));
    if (table === 'orders') setRawOrders((l) => upsertById(l, norm as Order[]));
    if (table === 'order_items') setItems((l) => upsertById(l, norm as OrderItem[]));
    if (table === 'payments') setPayments((l) => upsertById(l, norm as Payment[]));
  }, []);

  const removeRows = useCallback((table: TableName, ids: string[]) => {
    if (!ids.length) return;
    const set = new Set(ids);
    if (table === 'products') setProducts((l) => l.filter((r) => !set.has(r.id)));
    if (table === 'orders') {
      setRawOrders((l) => l.filter((r) => !set.has(r.id)));
      setItems((l) => l.filter((r) => !set.has(r.order_id)));
      setPayments((l) => l.filter((r) => !set.has(r.order_id)));
    }
    if (table === 'order_items') setItems((l) => l.filter((r) => !set.has(r.id)));
    if (table === 'payments') setPayments((l) => l.filter((r) => !set.has(r.id)));
  }, []);

  useEffect(() => {
    if (!session || authorized !== true) return;
    setLoading(true);
    reload();

    // Sincronização em tempo real entre dispositivos
    const channel = supabase.channel('gobe-sync');
    (['products', 'orders', 'order_items', 'payments'] as TableName[]).forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as AnyRow)?.id as string | undefined;
          if (id) removeRows(table, [id]);
        } else {
          applyRows(table, [payload.new as AnyRow]);
        }
      });
    });
    channel.subscribe();

    // Recarrega ao voltar para a aba (ex.: celular que ficou em segundo plano)
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session?.user.id, authorized, reload, applyRows, removeRows]);

  /* ------------------------------- derivados ------------------------------- */
  const orders = useMemo(() => enrichOrders(rawOrders, items, payments), [rawOrders, items, payments]);
  const orderMap = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  const getOrder = useCallback((id: string) => orderMap.get(id), [orderMap]);
  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [products],
  );

  /* -------------------------------- pedidos -------------------------------- */
  const saveOrder = useCallback(
    async (draft: OrderDraft, id?: string): Promise<string> => {
      const { rawOrders: curOrders, items: curItems, payments: curPays } = stateRef.current;
      const existing = id ? curOrders.find((o) => o.id === id) : undefined;

      // Ajusta fatias produzidas conforme a situação escolhida
      let draftItems = draft.items.map((i) => ({
        ...i,
        quantity: Math.max(1, Math.round(i.quantity)),
        produced_qty: Math.min(Math.max(0, i.produced_qty), Math.max(1, Math.round(i.quantity))),
      }));
      if (draft.production_status === 'pronto' || draft.delivery_status === 'entregue')
        draftItems = draftItems.map((i) => ({ ...i, produced_qty: i.quantity }));
      if (draft.production_status === 'pendente') draftItems = draftItems.map((i) => ({ ...i, produced_qty: 0 }));
      const productionStatus = deriveProductionStatus(draftItems, draft.production_status);

      const subtotal = itemsSubtotal(draftItems);
      const total = orderTotal(subtotal, draft.discount, draft.delivery_fee);

      // Pagamentos: valor líquido desejado
      const currentPays = id ? curPays.filter((p) => p.order_id === id) : [];
      const currentNet = round2(
        currentPays.reduce((s, p) => s + (p.kind === 'recebimento' ? p.amount : -p.amount), 0),
      );
      const target =
        draft.payment_status === 'pago'
          ? total
          : draft.payment_status === 'parcial'
            ? round2(Math.min(draft.amount_received, total))
            : 0;
      const paymentStatus = derivePaymentStatus(total, target);

      const row = {
        customer_name: draft.customer_name.trim(),
        phone: draft.phone.trim() || null,
        order_date: draft.order_date,
        delivery_date: draft.delivery_date,
        delivery_time: draft.delivery_time || null,
        subtotal,
        discount: round2(draft.discount),
        delivery_fee: round2(draft.delivery_fee),
        total,
        payment_method: draft.payment_method,
        payment_status: paymentStatus,
        production_status: productionStatus,
        delivery_status: draft.delivery_status,
        delivered_at:
          draft.delivery_status === 'entregue' ? existing?.delivered_at ?? draft.delivery_date : null,
        notes: draft.notes.trim() || null,
      };

      let orderId = id;
      if (id) {
        const { data, error } = await supabase.from('orders').update(row).eq('id', id).select().single();
        if (error) throw error;
        applyRows('orders', [data as AnyRow]);
      } else {
        const { data, error } = await supabase.from('orders').insert(row).select().single();
        if (error) throw error;
        applyRows('orders', [data as AnyRow]);
        orderId = (data as AnyRow).id as string;
      }
      const oid = orderId as string;

      // Itens: atualiza, insere e remove
      const oldItems = curItems.filter((i) => i.order_id === oid);
      const keepIds = new Set(draftItems.filter((i) => i.id).map((i) => i.id as string));
      const toDelete = oldItems.filter((i) => !keepIds.has(i.id)).map((i) => i.id);
      if (toDelete.length) {
        const { error } = await supabase.from('order_items').delete().in('id', toDelete);
        if (error) throw error;
        removeRows('order_items', toDelete);
      }
      const itemRow = (i: (typeof draftItems)[number]) => ({
        order_id: oid,
        product_id: i.product_id,
        product_name: i.product_name,
        flavor: i.flavor,
        unit_price: round2(i.unit_price),
        quantity: i.quantity,
        produced_qty: i.produced_qty,
      });
      const toUpdate = draftItems.filter((i) => i.id && oldItems.some((o) => o.id === i.id));
      for (const i of toUpdate) {
        const { data, error } = await supabase.from('order_items').update(itemRow(i)).eq('id', i.id as string).select().single();
        if (error) throw error;
        applyRows('order_items', [data as AnyRow]);
      }
      const toInsert = draftItems.filter((i) => !i.id || !oldItems.some((o) => o.id === i.id));
      if (toInsert.length) {
        const { data, error } = await supabase.from('order_items').insert(toInsert.map(itemRow)).select();
        if (error) throw error;
        applyRows('order_items', (data ?? []) as AnyRow[]);
      }

      // Pagamentos: registra a diferença como novo recebimento (mantém histórico)
      const diff = round2(target - currentNet);
      const method: PaymentMethod = draft.payment_method;
      if (diff > 0.004) {
        const { data, error } = await supabase
          .from('payments')
          .insert({ order_id: oid, amount: diff, method, kind: 'recebimento', paid_at: draft.paid_at || todayISO() })
          .select()
          .single();
        if (error) throw error;
        applyRows('payments', [data as AnyRow]);
      } else if (diff < -0.004) {
        // Correção para menos: substitui os recebimentos pelo valor correto
        const recIds = currentPays.filter((p) => p.kind === 'recebimento').map((p) => p.id);
        const refunds = round2(currentPays.filter((p) => p.kind === 'estorno').reduce((s, p) => s + p.amount, 0));
        if (recIds.length) {
          const { error } = await supabase.from('payments').delete().in('id', recIds);
          if (error) throw error;
          removeRows('payments', recIds);
        }
        const newAmount = round2(target + refunds);
        if (newAmount > 0.004) {
          const { data, error } = await supabase
            .from('payments')
            .insert({ order_id: oid, amount: newAmount, method, kind: 'recebimento', paid_at: draft.paid_at || todayISO() })
            .select()
            .single();
          if (error) throw error;
          applyRows('payments', [data as AnyRow]);
        }
      }
      return oid;
    },
    [applyRows, removeRows],
  );

  const updateOrder = useCallback(
    async (id: string, patch: Partial<Order>) => {
      const { data, error } = await supabase.from('orders').update(patch).eq('id', id).select().single();
      if (error) throw error;
      applyRows('orders', [data as AnyRow]);
    },
    [applyRows],
  );

  const cancelOrder = useCallback(
    (id: string, reason: string) =>
      updateOrder(id, { cancelled_at: new Date().toISOString(), cancel_reason: reason.trim() || null }),
    [updateOrder],
  );

  const restoreOrder = useCallback(
    (id: string) => updateOrder(id, { cancelled_at: null, cancel_reason: null }),
    [updateOrder],
  );

  const deleteOrder = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('orders').delete().eq('id', id);
      if (error) throw error;
      removeRows('orders', [id]);
    },
    [removeRows],
  );

  /** Recalcula a situação de produção do pedido depois de marcar fatias */
  const syncProduction = useCallback(
    async (orderId: string, nextItems: OrderItem[]) => {
      const order = stateRef.current.rawOrders.find((o) => o.id === orderId);
      if (!order) return;
      const status = deriveProductionStatus(nextItems, order.production_status);
      if (status !== order.production_status) await updateOrder(orderId, { production_status: status });
    },
    [updateOrder],
  );

  const setItemProduced = useCallback(
    async (itemId: string, qty: number) => {
      const item = stateRef.current.items.find((i) => i.id === itemId);
      if (!item) return;
      const produced = Math.min(Math.max(0, Math.round(qty)), item.quantity);
      // atualização otimista
      setItems((l) => l.map((i) => (i.id === itemId ? { ...i, produced_qty: produced } : i)));
      const { data, error } = await supabase
        .from('order_items')
        .update({ produced_qty: produced })
        .eq('id', itemId)
        .select()
        .single();
      if (error) {
        setItems((l) => l.map((i) => (i.id === itemId ? item : i)));
        throw error;
      }
      applyRows('order_items', [data as AnyRow]);
      const siblings = stateRef.current.items
        .filter((i) => i.order_id === item.order_id)
        .map((i) => (i.id === itemId ? { ...i, produced_qty: produced } : i));
      await syncProduction(item.order_id, siblings);
    },
    [applyRows, syncProduction],
  );

  const setOrderAllProduced = useCallback(
    async (orderId: string, done: boolean) => {
      const its = stateRef.current.items.filter((i) => i.order_id === orderId);
      for (const i of its) {
        const target = done ? i.quantity : 0;
        if (i.produced_qty !== target) {
          const { data, error } = await supabase
            .from('order_items')
            .update({ produced_qty: target })
            .eq('id', i.id)
            .select()
            .single();
          if (error) throw error;
          applyRows('order_items', [data as AnyRow]);
        }
      }
      await syncProduction(orderId, its.map((i) => ({ ...i, produced_qty: done ? i.quantity : 0 })));
    },
    [applyRows, syncProduction],
  );

  const setProductionStatus = useCallback(
    async (orderId: string, status: ProductionStatus) => {
      if (status === 'pronto') return setOrderAllProduced(orderId, true);
      if (status === 'pendente') {
        await setOrderAllProduced(orderId, false);
        return updateOrder(orderId, { production_status: 'pendente' });
      }
      return updateOrder(orderId, { production_status: status });
    },
    [setOrderAllProduced, updateOrder],
  );

  const setDeliveryStatus = useCallback(
    async (orderId: string, status: DeliveryStatus) => {
      if (status === 'entregue') {
        await setOrderAllProduced(orderId, true);
        await updateOrder(orderId, { delivery_status: 'entregue', delivered_at: todayISO(), production_status: 'pronto' });
      } else {
        await updateOrder(orderId, { delivery_status: 'pendente', delivered_at: null });
      }
    },
    [setOrderAllProduced, updateOrder],
  );

  /* ------------------------------- pagamentos ------------------------------ */
  const refreshPaymentStatus = useCallback(
    async (orderId: string) => {
      const order = stateRef.current.rawOrders.find((o) => o.id === orderId);
      if (!order) return;
      const net = stateRef.current.payments
        .filter((p) => p.order_id === orderId)
        .reduce((s, p) => s + (p.kind === 'recebimento' ? p.amount : -p.amount), 0);
      const st = derivePaymentStatus(order.total, round2(net));
      if (st !== order.payment_status) await updateOrder(orderId, { payment_status: st });
    },
    [updateOrder],
  );

  const addPayment = useCallback<DataValue['addPayment']>(
    async (p) => {
      const { data, error } = await supabase
        .from('payments')
        .insert({ ...p, amount: round2(p.amount), notes: p.notes?.trim() || null })
        .select()
        .single();
      if (error) throw error;
      const norm = normPayment(data as AnyRow);
      stateRef.current.payments = [...stateRef.current.payments, norm];
      applyRows('payments', [data as AnyRow]);
      if (p.kind === 'recebimento' && p.method !== 'a_definir') {
        const order = stateRef.current.rawOrders.find((o) => o.id === p.order_id);
        if (order && order.payment_method === 'a_definir') await updateOrder(p.order_id, { payment_method: p.method });
      }
      await refreshPaymentStatus(p.order_id);
    },
    [applyRows, refreshPaymentStatus, updateOrder],
  );

  const deletePayment = useCallback(
    async (id: string) => {
      const pay = stateRef.current.payments.find((p) => p.id === id);
      const { error } = await supabase.from('payments').delete().eq('id', id);
      if (error) throw error;
      stateRef.current.payments = stateRef.current.payments.filter((p) => p.id !== id);
      removeRows('payments', [id]);
      if (pay) await refreshPaymentStatus(pay.order_id);
    },
    [removeRows, refreshPaymentStatus],
  );

  /* -------------------------------- produtos ------------------------------- */
  const saveProduct = useCallback<DataValue['saveProduct']>(
    async (p, id) => {
      const row = { name: p.name.trim(), flavor: p.flavor?.trim() || null, price: round2(p.price), active: p.active };
      if (id) {
        const { data, error } = await supabase.from('products').update(row).eq('id', id).select().single();
        if (error) throw error;
        applyRows('products', [data as AnyRow]);
      } else {
        const maxOrder = products.reduce((m, x) => Math.max(m, x.sort_order), 0);
        const { data, error } = await supabase
          .from('products')
          .insert({ ...row, sort_order: maxOrder + 1 })
          .select()
          .single();
        if (error) throw error;
        applyRows('products', [data as AnyRow]);
      }
    },
    [applyRows, products],
  );

  const setProductActive = useCallback(
    async (id: string, active: boolean) => {
      const { data, error } = await supabase.from('products').update({ active }).eq('id', id).select().single();
      if (error) throw error;
      applyRows('products', [data as AnyRow]);
    },
    [applyRows],
  );

  /* --------------------------------- backup -------------------------------- */
  const exportBackup = useCallback(
    (): BackupFile => ({
      app: 'gb-gobe',
      version: 1,
      exported_at: new Date().toISOString(),
      products,
      orders: rawOrders,
      order_items: items,
      payments,
    }),
    [products, rawOrders, items, payments],
  );

  const restoreBackup = useCallback(
    async (b: BackupFile) => {
      if (b.app !== 'gb-gobe') throw new Error('Arquivo de backup inválido.');
      const chunks = <T,>(arr: T[], size = 500) =>
        Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));
      const steps: [TableName, AnyRow[]][] = [
        ['products', b.products as unknown as AnyRow[]],
        ['orders', (b.orders as unknown as AnyRow[]).map(({ created_by: _c, ...o }) => o)],
        // consumed_qty = produced_qty: restaurar não pode baixar o estoque de novo
        ['order_items', (b.order_items as unknown as AnyRow[]).map((i) => ({ ...i, consumed_qty: i.consumed_qty ?? i.produced_qty ?? 0 }))],
        ['payments', (b.payments as unknown as AnyRow[]).map(({ created_by: _c, ...p }) => p)],
      ];
      for (const [table, rows] of steps) {
        for (const part of chunks(rows)) {
          const { error } = await supabase.from(table).upsert(part, { onConflict: 'id' });
          if (error) throw error;
        }
      }
      await reload();
    },
    [reload],
  );

  const value: DataValue = {
    loading,
    error,
    products: sortedProducts,
    orders,
    payments,
    getOrder,
    reload,
    saveOrder,
    cancelOrder,
    restoreOrder,
    deleteOrder,
    setItemProduced,
    setOrderAllProduced,
    setProductionStatus,
    setDeliveryStatus,
    addPayment,
    deletePayment,
    saveProduct,
    setProductActive,
    exportBackup,
    restoreBackup,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData fora do DataProvider');
  return ctx;
};
