import { CheckCircle2, Loader2, MessageCircle, Minus, Plus, ShoppingBag } from 'lucide-react';
import { useEffect, useMemo, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import Logo from '../components/Logo';
import { cx } from '../components/ui';
import { productLabel } from '../lib/calc';
import { brl, capFirst, fmtPattern, parseDay } from '../lib/format';
import { supabase } from '../lib/supabase';

/** WhatsApp da GOBÊ (só números, com 55 + DDD) */
const WHATSAPP = '5551994423535';

interface MenuProduct {
  id: string;
  name: string;
  flavor: string | null;
  price: number;
}
interface MenuDay {
  date: string;
  full: boolean;
}

const wa = (text: string) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;

export default function PublicOrder() {
  const [menu, setMenu] = useState<{ products: MenuProduct[]; days: MenuDay[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [date, setDate] = useState('');
  const [ful, setFul] = useState<'entrega' | 'retirada'>('entrega');
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pay, setPay] = useState<'pix' | 'dinheiro'>('pix');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ code: string; total: number } | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);

  useEffect(() => {
    document.title = 'Peça seus brownies · GB GOBÊ';
    supabase
      .rpc('get_site_menu')
      .then(({ data, error: e }) => {
        if (e || !data) return setLoadError(true);
        const d = data as { products: MenuProduct[]; days: MenuDay[] };
        const products = d.products.map((p) => ({ ...p, price: Number(p.price) }));
        setMenu({ products, days: d.days });

        // Produto escolhido no site da bio (?item=nutella): já entra no carrinho ou fica em destaque
        const item = new URLSearchParams(window.location.search).get('item');
        if (item) {
          const key = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const term = key(item);
          const matches = products.filter((p) => key(p.name) === term || key(`${p.name}${p.flavor ?? ''}`) === term);
          if (matches.length === 1) setCart({ [matches[0].id]: 1 });
          if (matches.length) {
            setHighlight(matches.map((m) => m.id));
            setTimeout(() => document.getElementById(`produto-${matches[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
          }
        }
      });
  }, []);

  const items = useMemo(() => (menu?.products ?? []).filter((p) => cart[p.id] > 0).map((p) => ({ ...p, qty: cart[p.id] })), [menu, cart]);
  const total = items.reduce((s, i) => s + i.qty * i.price, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);

  const change = (id: string, d: number) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(50, (c[id] ?? 0) + d)) }));

  const summary = (code?: string) =>
    [
      `Olá, GB GOBÊ! 💕 ${code ? `Acabei de fazer o pedido #${code} pelo site:` : 'Quero fazer um pedido:'}`,
      '',
      ...items.map((i) => `• ${i.qty}× ${productLabel(i.name, i.flavor)}`),
      '',
      `Total: ${brl(total)}`,
      date ? `${ful === 'retirada' ? 'Retirada' : 'Entrega'}: ${capFirst(fmtPattern(parseDay(date), "EEEE, dd/MM"))}` : '',
      ful === 'entrega' && address ? `Endereço: ${address}` : '',
      `Pagamento: ${pay === 'pix' ? 'Pix' : 'Dinheiro'}`,
      name ? `Nome: ${name}` : '',
    ]
      .filter(Boolean)
      .join('\n');

  const submit = async () => {
    setError(null);
    if (!count) return setError('Escolha pelo menos um brownie.');
    if (!date) return setError('Escolha o dia.');
    if (ful === 'entrega' && !address.trim()) return setError('Informe o endereço de entrega.');
    if (name.trim().length < 2) return setError('Informe seu nome.');
    if (phone.replace(/\D/g, '').length < 10) return setError('Informe seu WhatsApp com DDD.');
    setSending(true);
    const { data, error: e } = await supabase.rpc('submit_site_order', {
      p: {
        customer_name: name,
        phone,
        delivery_date: date,
        fulfillment: ful,
        address,
        notes,
        payment_method: pay,
        items: items.map((i) => ({ product_id: i.id, quantity: i.qty })),
      },
    });
    setSending(false);
    if (e) return setError(e.message || 'Não foi possível enviar. Tente pelo WhatsApp.');
    const r = data as { code: string; total: number };
    setDone({ code: r.code, total: Number(r.total) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ------------------------------ confirmação ----------------------------- */
  if (done)
    return (
      <Shell>
        <div className="rounded-3xl bg-white p-7 text-center shadow-lift animate-scale-in">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <h1 className="mt-3 font-display text-3xl font-semibold text-bordo">Pedido recebido!</h1>
          <p className="mt-1 text-sm text-bordo/60">Código do pedido</p>
          <p className="font-display text-2xl font-semibold tracking-widest text-cereja">#{done.code}</p>
          <p className="mx-auto mt-4 max-w-xs text-sm text-bordo/70">
            Total de <b>{brl(done.total)}</b>. Vamos confirmar com você pelo WhatsApp{ful === 'entrega' ? ', junto com a taxa de entrega,' : ''} e
            combinar o pagamento.
          </p>
          <a
            href={wa(summary(done.code))}
            target="_blank"
            rel="noreferrer"
            className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3.5 font-bold text-white shadow-lift transition active:scale-[.98]"
          >
            <MessageCircle className="h-5 w-5" /> Enviar resumo no WhatsApp
          </a>
          <button
            onClick={() => {
              setDone(null);
              setCart({});
              setNotes('');
            }}
            className="mt-3 text-sm font-semibold text-cereja"
          >
            Fazer outro pedido
          </button>
        </div>
      </Shell>
    );

  /* -------------------------------- cardápio ------------------------------ */
  return (
    <Shell>
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold text-bordo">Faça seu pedido</h1>
        <p className="mt-1 text-sm text-bordo/60">Brownies artesanais feitos sob encomenda, com 1 dia de antecedência.</p>
        <a
          href={wa('Olá, GB GOBÊ! 💕 Quero fazer um pedido.')}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-soft ring-1 ring-emerald-100"
        >
          <MessageCircle className="h-4 w-4" /> Prefiro pedir pelo WhatsApp
        </a>
      </div>

      {loadError ? (
        <div className="mt-8 rounded-3xl bg-white p-6 text-center text-sm text-bordo/70 shadow-soft">
          Não foi possível carregar o cardápio agora.{' '}
          <a href={wa('Olá, GB GOBÊ! 💕 Quero fazer um pedido.')} className="font-semibold text-emerald-700 underline">
            Peça pelo WhatsApp
          </a>
          .
        </div>
      ) : !menu ? (
        <div className="mt-16 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-cereja" />
        </div>
      ) : (
        <div className="mt-6 space-y-6 pb-32">
          {/* Produtos */}
          <Block title="1. Escolha seus brownies">
            <div className="space-y-2">
              {menu.products.map((p) => {
                const q = cart[p.id] ?? 0;
                return (
                  <div
                    key={p.id}
                    id={`produto-${p.id}`}
                    className={cx(
                      'flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 transition',
                      q ? 'ring-2 ring-cereja/50' : highlight.includes(p.id) ? 'ring-2 ring-rosa-500' : 'ring-bordo/5',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-bordo">{productLabel(p.name, p.flavor)}</p>
                      <p className="text-sm font-bold text-cereja">{brl(p.price)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {q > 0 && (
                        <>
                          <RoundBtn onClick={() => change(p.id, -1)} label="Menos">
                            <Minus className="h-4 w-4" />
                          </RoundBtn>
                          <span className="w-7 text-center font-bold text-bordo">{q}</span>
                        </>
                      )}
                      <RoundBtn onClick={() => change(p.id, 1)} label="Mais" primary>
                        <Plus className="h-4 w-4" />
                      </RoundBtn>
                    </div>
                  </div>
                );
              })}
            </div>
          </Block>

          {/* Dia */}
          <Block title="2. Para quando?">
            <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {menu.days.map((d) => {
                const dt = parseDay(d.date);
                const active = date === d.date;
                return (
                  <button
                    key={d.date}
                    disabled={d.full}
                    onClick={() => setDate(d.date)}
                    className={cx(
                      'min-w-[68px] rounded-2xl px-2 py-2 text-center transition',
                      active ? 'bg-bordo text-creme shadow-lift' : 'bg-white text-bordo ring-1 ring-bordo/5',
                      d.full && 'opacity-40',
                    )}
                  >
                    <span className="block text-xs font-semibold capitalize">{fmtPattern(dt, 'EEE').replace('.', '')}</span>
                    <span className="block font-display text-xl font-semibold">{fmtPattern(dt, 'dd')}</span>
                    <span className={cx('block text-[10px]', active ? 'text-creme/60' : 'text-bordo/45')}>{d.full ? 'lotado' : fmtPattern(dt, 'MMM')}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(['entrega', 'retirada'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFul(f)}
                  className={cx('rounded-2xl py-3 text-sm font-semibold transition', ful === f ? 'bg-cereja text-white' : 'bg-white text-bordo ring-1 ring-bordo/5')}
                >
                  {f === 'entrega' ? '🚗 Entrega' : '🏠 Retirada'}
                </button>
              ))}
            </div>
            {ful === 'entrega' && (
              <PublicInput value={address} onChange={setAddress} placeholder="Endereço (rua, número, bairro)" className="mt-2" />
            )}
          </Block>

          {/* Dados */}
          <Block title="3. Seus dados">
            <div className="space-y-2">
              <PublicInput value={name} onChange={setName} placeholder="Seu nome" autoComplete="name" />
              <PublicInput value={phone} onChange={setPhone} placeholder="WhatsApp com DDD" inputMode="tel" autoComplete="tel" />
              <div className="grid grid-cols-2 gap-2">
                {(['pix', 'dinheiro'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setPay(m)}
                    className={cx('rounded-2xl py-3 text-sm font-semibold transition', pay === m ? 'bg-bordo text-creme' : 'bg-white text-bordo ring-1 ring-bordo/5')}
                  >
                    {m === 'pix' ? 'Pix' : 'Dinheiro'}
                  </button>
                ))}
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações (opcional): presente, cartão, horário…"
                className="min-h-[80px] w-full rounded-2xl border-0 bg-white px-4 py-3 text-base text-bordo ring-1 ring-bordo/10 placeholder:text-bordo/35 focus:outline-none focus:ring-2 focus:ring-cereja/50"
              />
            </div>
          </Block>

          {error && <p className="rounded-2xl bg-red-50 p-3 text-center text-sm font-semibold text-red-700 ring-1 ring-red-100">{error}</p>}
        </div>
      )}

      {menu && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-bordo/10 bg-white/95 p-4 backdrop-blur-md" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
          <div className="mx-auto flex max-w-md items-center gap-3">
            <div className="flex-1">
              <p className="text-xs text-bordo/50">{count ? `${count} brownie${count > 1 ? 's' : ''}` : 'Nenhum item'}</p>
              <p className="font-display text-xl font-semibold text-bordo">{brl(total)}</p>
            </div>
            <button
              onClick={submit}
              disabled={sending}
              className="flex items-center gap-2 rounded-2xl bg-cereja px-5 py-3.5 font-bold text-white shadow-lift transition active:scale-[.98] disabled:opacity-60"
            >
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShoppingBag className="h-5 w-5" />}
              Finalizar pedido
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-creme">
      <div className="mx-auto max-w-md px-4 pt-6">
        <div className="mb-6 flex justify-center">
          <Logo className="h-12 w-12" />
        </div>
        {children}
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 font-display text-lg font-semibold text-bordo">{title}</h2>
      {children}
    </section>
  );
}

function RoundBtn({ children, onClick, label, primary }: { children: ReactNode; onClick: () => void; label: string; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cx(
        'flex h-9 w-9 items-center justify-center rounded-full transition active:scale-90',
        primary ? 'bg-cereja text-white' : 'bg-creme text-bordo ring-1 ring-bordo/10',
      )}
    >
      {children}
    </button>
  );
}

function PublicInput({
  value,
  onChange,
  className,
  ...p
}: { value: string; onChange: (v: string) => void; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <input
      {...p}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cx(
        'w-full rounded-2xl border-0 bg-white px-4 py-3 text-base text-bordo ring-1 ring-bordo/10 placeholder:text-bordo/35 focus:outline-none focus:ring-2 focus:ring-cereja/50',
        className,
      )}
    />
  );
}
