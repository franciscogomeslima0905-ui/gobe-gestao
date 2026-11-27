import { CakeSlice, ClipboardPaste, Plus, Save, Trash2, Truck, User, Wallet, type LucideIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useData } from '../context/DataContext';
import { errorMessage, useUI } from '../context/UIContext';
import { itemsSubtotal, orderTotal } from '../lib/calc';
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, PRODUCTION_LABEL } from '../lib/constants';
import { emptyDraft, isNoDeliveryDay, orderToDraft } from '../lib/drafts';
import { brl, fmtLong, parseDay, round2, uid } from '../lib/format';
import type { Fulfillment, ItemDraft, OrderDraft, PaymentMethod, PaymentStatus, Product, ProductionStatus } from '../lib/types';
import { useSettings } from '../context/SettingsContext';
import PasteOrderModal from './PasteOrderModal';
import { Button, Field, IconButton, Input, MoneyInput, Segmented, Select, Textarea, cx } from './ui';

interface Props {
  orderId?: string;
  initial?: Partial<OrderDraft>;
  onDone: (id: string) => void;
  onCancel?: () => void;
  inPage?: boolean;
}

export default function OrderForm({ orderId, initial, onDone, onCancel, inPage }: Props) {
  const { products, getOrder, saveOrder, orders } = useData();
  const { toast } = useUI();
  const existing = orderId ? getOrder(orderId) : undefined;

  const [draft, setDraft] = useState<OrderDraft>(() => {
    if (existing) return orderToDraft(existing);
    const base = { ...emptyDraft(), ...initial };
    if (!base.items.length) base.items = [newItem(products)];
    return base;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof OrderDraft>(k: K, v: OrderDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const subtotal = itemsSubtotal(draft.items);
  const fee = draft.fulfillment === 'retirada' ? 0 : draft.delivery_fee;
  const total = orderTotal(subtotal, draft.discount, fee);
  const slices = draft.items.reduce((s, i) => s + (i.quantity || 0), 0);
  const remaining = round2(Math.max(0, total - draft.amount_received));

  /* clientes já cadastrados, para autocompletar */
  const customers = useMemo(() => {
    const map = new Map<string, { phone: string; address: string }>();
    [...orders]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .forEach((o) => {
        const cur = map.get(o.customer_name) ?? { phone: '', address: '' };
        map.set(o.customer_name, { phone: o.phone || cur.phone, address: o.address || cur.address });
      });
    return map;
  }, [orders]);

  /* limite de produção do dia */
  const { settings } = useSettings();
  const dayLoad = useMemo(
    () =>
      orders
        .filter((o) => !o.cancelled && o.delivery_date === draft.delivery_date && o.id !== orderId)
        .reduce((s, o) => s + o.slices, 0),
    [orders, draft.delivery_date, orderId],
  );
  const overCapacity = settings.capacity > 0 && dayLoad + slices > settings.capacity;
  const [pasting, setPasting] = useState(false);

  /* nomes de produtos ativos (+ os que já estão no pedido) */
  const productNames = useMemo(() => {
    const names: string[] = [];
    products.filter((p) => p.active).forEach((p) => !names.includes(p.name) && names.push(p.name));
    draft.items.forEach((i) => i.product_name && !names.includes(i.product_name) && names.push(i.product_name));
    return names;
  }, [products, draft.items]);

  const flavorsOf = (name: string, current?: ItemDraft) => {
    const list = products.filter((p) => p.name === name && (p.active || p.id === current?.product_id));
    return list;
  };

  const updateItem = (key: string, patch: Partial<ItemDraft>) =>
    setDraft((d) => ({ ...d, items: d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));

  const chooseProduct = (key: string, name: string) => {
    const first = products.find((p) => p.name === name && p.active);
    updateItem(key, {
      product_name: name,
      product_id: first?.id ?? null,
      flavor: first?.flavor ?? null,
      unit_price: first?.price ?? 0,
    });
  };

  const chooseFlavor = (key: string, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (p) updateItem(key, { product_id: p.id, flavor: p.flavor, unit_price: p.price });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!draft.customer_name.trim()) e.customer_name = 'Informe o nome do cliente';
    if (!draft.delivery_date) e.delivery_date = 'Informe a data de entrega';
    else if (isNoDeliveryDay(draft.delivery_date)) e.delivery_date = 'Não realizamos entregas às terças e quintas-feiras';
    if (!draft.order_date) e.order_date = 'Informe a data do pedido';
    const valid = draft.items.filter((i) => i.product_name && i.quantity > 0);
    if (!valid.length) e.items = 'Adicione pelo menos um produto';
    if (draft.items.some((i) => !i.product_name)) e.items = 'Escolha o produto em todas as linhas (ou remova a linha vazia)';
    if (draft.payment_status !== 'pendente' && draft.payment_method === 'a_definir')
      e.payment_method = 'Escolha Pix ou Dinheiro para registrar o recebimento';
    if (draft.payment_status === 'parcial') {
      if (draft.amount_received <= 0) e.amount_received = 'Informe o valor recebido';
      else if (draft.amount_received >= total) e.amount_received = 'Valor igual ou maior que o total: use "Pago"';
    }
    if (draft.discount > subtotal + fee) e.discount = 'Desconto maior que o valor do pedido';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) {
      toast('Confira os campos destacados.', 'error');
      return;
    }
    setSaving(true);
    try {
      const id = await saveOrder(
        { ...draft, delivery_fee: draft.fulfillment === 'retirada' ? 0 : draft.delivery_fee, items: draft.items.filter((i) => i.product_name) },
        orderId,
      );
      toast(orderId ? 'Pedido atualizado com sucesso!' : 'Pedido cadastrado com sucesso!');
      onDone(id);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const deliveryHint = draft.delivery_date && !isNoDeliveryDay(draft.delivery_date) ? fmtLong(parseDay(draft.delivery_date)) : undefined;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-5"
    >
      {!orderId && (
        <button
          type="button"
          onClick={() => setPasting(true)}
          className="flex w-full items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-left ring-1 ring-emerald-200 transition hover:bg-emerald-100"
        >
          <ClipboardPaste className="h-5 w-5 shrink-0 text-emerald-700" />
          <span className="flex-1">
            <span className="block text-sm font-bold text-emerald-900">Colar pedido do WhatsApp</span>
            <span className="block text-xs text-emerald-800/70">Cole a mensagem do cliente e o pedido é preenchido sozinho</span>
          </span>
        </button>
      )}
      {pasting && (
        <PasteOrderModal
          onClose={() => setPasting(false)}
          onResult={(patch) => {
            setDraft((d) => ({ ...d, ...patch, items: patch.items && patch.items.length ? patch.items : d.items }));
            setPasting(false);
            toast('Pedido preenchido! Confira antes de salvar.', 'info');
          }}
        />
      )}

      {/* Cliente e datas */}
      <Section icon={User} title="Cliente e entrega">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do cliente" required error={errors.customer_name}>
            <Input
              list="gobe-clientes"
              value={draft.customer_name}
              onChange={(e) => {
                const v = e.target.value;
                const c = customers.get(v);
                setDraft((d) => ({ ...d, customer_name: v, phone: d.phone || c?.phone || '', address: d.address || c?.address || '' }));
              }}
              placeholder="Ex.: Maria Silva"
              autoFocus={!orderId}
            />
            <datalist id="gobe-clientes">
              {Array.from(customers.keys()).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Telefone / WhatsApp" hint="Opcional">
            <Input inputMode="tel" value={draft.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(51) 99999-9999" />
          </Field>
          <Field label="Data do pedido" required error={errors.order_date}>
            <Input type="date" value={draft.order_date} onChange={(e) => set('order_date', e.target.value)} />
          </Field>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Data de entrega" required error={errors.delivery_date} hint={deliveryHint}>
              <Input type="date" value={draft.delivery_date} onChange={(e) => set('delivery_date', e.target.value)} />
            </Field>
            <Field label="Horário" hint="Opcional">
              <Input type="time" value={draft.delivery_time} onChange={(e) => set('delivery_time', e.target.value)} className="w-28" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Segmented<Fulfillment>
              value={draft.fulfillment}
              onChange={(v) => set('fulfillment', v)}
              options={[
                { value: 'entrega', label: '🚗 Entrega' },
                { value: 'retirada', label: '🏠 Retirada' },
              ]}
            />
          </div>
          {draft.fulfillment === 'entrega' && (
            <Field label="Endereço" hint="Opcional · abre no Maps na lista de entregas" className="sm:col-span-2">
              <Input value={draft.address} onChange={(e) => set('address', e.target.value)} placeholder="Rua, número, bairro" />
            </Field>
          )}
          {overCapacity && (
            <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800 ring-1 ring-amber-100 sm:col-span-2">
              ⚠️ Este dia já tem {dayLoad} fatias. Com este pedido passa do limite de {settings.capacity}.
            </p>
          )}
        </div>
      </Section>

      {/* Produtos */}
      <Section icon={CakeSlice} title="Produtos">
        <div className="space-y-3">
          {draft.items.map((item, idx) => {
            const flavors = flavorsOf(item.product_name, item);
            const hasFlavors = flavors.some((f) => f.flavor);
            return (
              <div key={item.key} className="rounded-2xl bg-creme-50 p-3 ring-1 ring-bordo/5 animate-fade-in">
                <div className="grid gap-3 sm:grid-cols-12">
                  <Field label={`Produto ${idx + 1}`} className="sm:col-span-4">
                    <Select value={item.product_name} onChange={(e) => chooseProduct(item.key, e.target.value)}>
                      <option value="">Selecione…</option>
                      {productNames.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Sabor" className="sm:col-span-3">
                    {hasFlavors ? (
                      <Select value={item.product_id ?? ''} onChange={(e) => chooseFlavor(item.key, e.target.value)}>
                        {!item.product_id && <option value="">{item.flavor ?? 'Selecione…'}</option>}
                        {flavors.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.flavor ?? 'Tradicional'}
                            {!f.active ? ' (inativo)' : ''}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input value={item.flavor ?? '—'} disabled />
                    )}
                  </Field>
                  <Field label="Fatias" className="sm:col-span-2">
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={item.quantity || ''}
                      onChange={(e) => updateItem(item.key, { quantity: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    />
                  </Field>
                  <Field label="Valor unitário" className="sm:col-span-2">
                    <MoneyInput value={item.unit_price} onChange={(v) => updateItem(item.key, { unit_price: v })} />
                  </Field>
                  <div className="flex items-end justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end sm:justify-end">
                    <span className="text-sm font-bold text-bordo sm:hidden">{brl(item.unit_price * item.quantity)}</span>
                    <IconButton
                      icon={Trash2}
                      label="Remover produto"
                      className="text-cereja/70 hover:bg-cereja/10 hover:text-cereja"
                      disabled={draft.items.length === 1}
                      onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((i) => i.key !== item.key) }))}
                    />
                  </div>
                </div>
                <div className="mt-2 hidden justify-end text-xs text-bordo/60 sm:flex">
                  Subtotal do item: <b className="ml-1 text-bordo">{brl(item.unit_price * item.quantity)}</b>
                </div>
              </div>
            );
          })}
          {errors.items && <p className="text-xs text-cereja">{errors.items}</p>}
          <Button type="button" variant="soft" icon={Plus} onClick={() => set('items', [...draft.items, newItem(products)])}>
            Adicionar outro produto
          </Button>
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Pagamento */}
        <Section icon={Wallet} title="Pagamento">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Desconto" error={errors.discount}>
              <MoneyInput value={draft.discount} onChange={(v) => set('discount', v)} />
            </Field>
            {draft.fulfillment === 'entrega' && (
              <Field label="Taxa de entrega">
                <MoneyInput value={draft.delivery_fee} onChange={(v) => set('delivery_fee', v)} />
              </Field>
            )}
            <Field label="Forma de pagamento" error={errors.payment_method}>
              <Select value={draft.payment_method} onChange={(e) => set('payment_method', e.target.value as PaymentMethod)}>
                {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Situação do pagamento">
              <Select value={draft.payment_status} onChange={(e) => set('payment_status', e.target.value as PaymentStatus)}>
                {(Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]).map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_STATUS_LABEL[m]}
                  </option>
                ))}
              </Select>
            </Field>
            {draft.payment_status === 'parcial' && (
              <Field label="Valor recebido" error={errors.amount_received} hint={`Saldo restante: ${brl(remaining)}`}>
                <MoneyInput value={draft.amount_received} onChange={(v) => set('amount_received', v)} />
              </Field>
            )}
            {draft.payment_status !== 'pendente' && (
              <Field label="Data do recebimento">
                <Input type="date" value={draft.paid_at} onChange={(e) => set('paid_at', e.target.value)} />
              </Field>
            )}
          </div>
        </Section>

        {/* Produção */}
        <Section icon={Truck} title="Produção e entrega">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Situação da produção" hint="Atualiza sozinha ao marcar as fatias prontas">
              <Select value={draft.production_status} onChange={(e) => set('production_status', e.target.value as ProductionStatus)}>
                {(Object.keys(PRODUCTION_LABEL) as ProductionStatus[]).map((m) => (
                  <option key={m} value={m}>
                    {PRODUCTION_LABEL[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Situação da entrega">
              <Select value={draft.delivery_status} onChange={(e) => set('delivery_status', e.target.value as OrderDraft['delivery_status'])}>
                <option value="pendente">A entregar</option>
                <option value="entregue">Entregue</option>
              </Select>
            </Field>
            <Field label="Observações" className="sm:col-span-2">
              <Textarea value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Ex.: embalagem para presente, sem cartão, retirar no local…" />
            </Field>
          </div>
        </Section>
      </div>

      {/* Resumo */}
      <div className={cx("sticky z-10 -mx-1 rounded-2xl bg-bordo p-4 text-creme shadow-lift", inPage ? "bottom-20 lg:bottom-0" : "bottom-0")}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              <span className="text-creme/60">Fatias:</span> <b>{slices}</b>
            </span>
            <span>
              <span className="text-creme/60">Subtotal:</span> <b>{brl(subtotal)}</b>
            </span>
            {draft.discount > 0 && (
              <span>
                <span className="text-creme/60">Desconto:</span> <b>− {brl(draft.discount)}</b>
              </span>
            )}
            {fee > 0 && (
              <span>
                <span className="text-creme/60">Entrega:</span> <b>+ {brl(fee)}</b>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-creme/60">Total</p>
              <p className="font-display text-2xl font-semibold">{brl(total)}</p>
            </div>
            {onCancel && (
              <Button type="button" variant="ghost" className="text-creme hover:bg-white/10" onClick={onCancel}>
                Cancelar
              </Button>
            )}
            <Button type="submit" icon={Save} loading={saving} className="bg-cereja hover:bg-cereja-600">
              {orderId ? 'Salvar alterações' : 'Cadastrar pedido'}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function newItem(products: Product[]): ItemDraft {
  return { key: uid(), product_id: null, product_name: '', flavor: null, unit_price: 0, quantity: 1, produced_qty: 0 };
}

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <fieldset className={cx('rounded-2xl bg-white p-4 shadow-soft ring-1 ring-bordo/5 sm:p-5')}>
      <legend className="sr-only">{title}</legend>
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rosa-50 text-cereja">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="font-display text-lg font-semibold text-bordo">{title}</h3>
      </div>
      {children}
    </fieldset>
  );
}
