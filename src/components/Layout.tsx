import {
  AlertTriangle,
  Bell,
  Boxes,
  Calculator,
  Camera,
  ClipboardList,
  PieChart,
  Receipt,
  CalendarClock,
  ChefHat,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  Plus,
  Search,
  Settings,
  Truck,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useStock } from '../context/StockContext';
import { useUI } from '../context/UIContext';
import { buildAlerts } from '../lib/alerts';
import { customerKey } from '../lib/calc';
import { DELIVERY_DAYS } from '../lib/constants';
import { brl, fmtDate, fmtPhone, normalize, toISODate } from '../lib/format';
import Logo from './Logo';
import { cx } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

/** marcador: o link de Entregas aponta para o próximo dia de entrega */
const ENTREGAS = '__entregas__';

/** Hoje, se for dia de entrega; senão, o próximo */
export function nextDeliveryDay(): { slug: string; date: string } {
  const bySlug: Record<number, string> = { 1: 'segunda', 3: 'quarta', 5: 'sexta', 6: 'sabado', 0: 'domingo' };
  const d = new Date();
  for (let i = 0; i < 7; i++) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
    const slug = bySlug[x.getDay()];
    if (slug) return { slug, date: toISODate(x) };
  }
  return { slug: 'segunda', date: toISODate(d) };
}

const NAV: { group?: string; items: NavItem[] }[] = [
  {
    items: [
      { to: '/', label: 'Visão geral', icon: LayoutDashboard, end: true },
      { to: '/novo-pedido', label: 'Novo pedido', icon: PlusCircle },
    ],
  },
  {
    group: 'Gestão',
    items: [
      { to: ENTREGAS, label: 'Entregas', icon: Truck },
      { to: '/producao', label: 'Controle de produção', icon: ChefHat },
      { to: '/financeiro', label: 'Controle financeiro', icon: Wallet },
      { to: '/historico', label: 'Histórico de pedidos', icon: History },
    ],
  },
  {
    group: 'Custos e compras',
    items: [
      { to: '/estoque', label: 'Compras e estoque', icon: Boxes },
      { to: '/lista-de-compras', label: 'Lista de compras', icon: ClipboardList },
      { to: '/escanear', label: 'Escanear notinha', icon: Camera },
      { to: '/receitas', label: 'Receitas e custos', icon: Calculator },
      { to: '/despesas', label: 'Despesas', icon: Receipt },
      { to: '/rentabilidade', label: 'Rentabilidade', icon: PieChart },
    ],
  },
  {
    group: 'Sistema',
    items: [{ to: '/configuracoes', label: 'Produtos e configurações', icon: Settings }],
  },
];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { openOrderForm } = useUI();

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-creme">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 lg:block print:hidden">
        <Sidebar />
      </aside>

      {/* Drawer mobile */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <div className="absolute inset-0 bg-bordo/40 backdrop-blur-[2px] animate-fade-in" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[82%] max-w-xs animate-slide-in">
            <Sidebar onClose={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-72">
        <Topbar onMenu={() => setOpen(true)} />
        <StockSetupBanner />
        <main className="mx-auto max-w-[1400px] px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 print:p-0">
          <Outlet />
        </main>
      </div>

      <BottomNav onMore={() => setOpen(true)} />
    </div>
  );
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const { signOut, session, staffName } = useAuth();
  const { confirm, setWeek } = useUI();
  const location = useLocation();
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-bordo text-creme">
      {/* detalhe decorativo de confeitaria */}
      <svg className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 text-white/[.04]" viewBox="0 0 200 200" fill="currentColor">
        <circle cx="100" cy="100" r="100" />
      </svg>
      <svg className="pointer-events-none absolute -bottom-10 -left-10 h-44 w-44 text-rosa/10" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M10 60 q10 -12 20 0 t20 0 t20 0 t20 0" />
        <path d="M10 72 q10 -12 20 0 t20 0 t20 0 t20 0" />
      </svg>

      <div className="relative flex items-center justify-between px-5 pb-4 pt-5">
        <Logo light />
        {onClose && (
          <button onClick={onClose} className="rounded-lg p-2 text-creme/70 hover:bg-white/10" aria-label="Fechar menu">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="relative flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV.map((section, i) => (
          <div key={i}>
            {section.group && <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-rosa/60">{section.group}</p>}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to === ENTREGAS ? `/entregas/${nextDeliveryDay().slug}` : item.to}
                  end={item.end}
                  onClick={() => item.to === ENTREGAS && setWeek(nextDeliveryDay().date)}
                  className={({ isActive }) =>
                    cx(
                      'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200',
                      isActive || (item.to === ENTREGAS && location.pathname.startsWith('/entregas'))
                        ? 'bg-cereja text-white shadow-md shadow-black/20'
                        : 'text-creme/75 hover:bg-white/[.07] hover:text-creme',
                    )
                  }
                >
                  <item.icon className="h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-110" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="relative border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rosa text-sm font-bold text-bordo">
            {(staffName || session?.user.email || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{staffName || 'Equipe GOBÊ'}</p>
            <p className="truncate text-xs text-creme/50">{session?.user.email}</p>
          </div>
          <button
            onClick={async () => {
              const r = await confirm({ title: 'Sair do sistema?', message: 'Você precisará entrar novamente com e-mail e senha.', confirmLabel: 'Sair' });
              if (r.ok) signOut();
            }}
            className="rounded-lg p-2 text-creme/60 transition hover:bg-white/10 hover:text-creme"
            title="Sair"
            aria-label="Sair"
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { openOrderForm } = useUI();
  return (
    <header className="sticky top-0 z-20 border-b border-bordo/5 bg-creme/85 backdrop-blur-md print:hidden">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <button onClick={onMenu} className="rounded-xl p-2 text-bordo hover:bg-bordo/5 lg:hidden" aria-label="Abrir menu">
          <Menu className="h-6 w-6" />
        </button>
        <div className="lg:hidden">
          <Logo showText={false} className="h-9 w-9" />
        </div>
        <GlobalSearch />
        <NavLink
          to="/escanear"
          title="Escanear notinha"
          aria-label="Escanear notinha"
          className="rounded-xl bg-white p-2.5 text-bordo shadow-soft ring-1 ring-bordo/5 transition hover:text-cereja"
        >
          <Camera className="h-5 w-5" />
        </NavLink>
        <Alerts />
        <button
          onClick={() => openOrderForm()}
          className="hidden items-center gap-2 rounded-xl bg-cereja px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-cereja/30 transition hover:bg-cereja-600 active:scale-[.98] lg:inline-flex"
        >
          <Plus className="h-4 w-4" /> Pedido rápido
        </button>
      </div>
    </header>
  );
}

function useClickOutside(ref: RefObject<HTMLElement>, cb: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && cb();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, cb]);
}

function GlobalSearch() {
  const { orders } = useData();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const results = useMemo(() => {
    const term = normalize(q);
    if (term.length < 2) return [];
    const digits = q.replace(/\D/g, '');
    const map = new Map<string, { name: string; phone: string | null; count: number; total: number; last: string }>();
    for (const o of orders) {
      const match = normalize(o.customer_name).includes(term) || (digits.length >= 3 && (o.phone ?? '').replace(/\D/g, '').includes(digits));
      if (!match) continue;
      const k = customerKey(o.customer_name);
      const cur = map.get(k) ?? { name: o.customer_name, phone: o.phone, count: 0, total: 0, last: o.delivery_date };
      cur.count += 1;
      if (!o.cancelled) cur.total += o.total;
      if (o.delivery_date > cur.last) cur.last = o.delivery_date;
      if (o.phone) cur.phone = o.phone;
      map.set(k, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.last.localeCompare(a.last)).slice(0, 8);
  }, [q, orders]);

  const go = (name: string) => {
    setOpen(false);
    setQ('');
    navigate(`/historico?cliente=${encodeURIComponent(name)}`);
  };

  return (
    <div ref={ref} className="relative mr-auto min-w-0 flex-1 sm:max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-bordo/40" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) go(results[0].name);
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Buscar cliente por nome ou telefone…"
        className="w-full rounded-xl border-0 bg-white py-2.5 pl-9 pr-3 text-sm text-bordo shadow-soft ring-1 ring-bordo/5 placeholder:text-bordo/40 focus:outline-none focus:ring-2 focus:ring-cereja/40"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-2xl bg-white shadow-lift ring-1 ring-bordo/10 animate-scale-in">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-bordo/50">Nenhum cliente encontrado.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((r) => (
                <li key={r.name}>
                  <button onClick={() => go(r.name)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-creme-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-bordo">{r.name}</p>
                      <p className="text-xs text-bordo/50">
                        {r.count} pedido(s){r.phone ? ` · ${fmtPhone(r.phone)}` : ''} · último {fmtDate(r.last)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-cereja">{brl(r.total)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Alerts() {
  const { orders } = useData();
  const { ingredients } = useStock();
  const { openOrderForm, openPayment } = useUI();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  const alerts = useMemo(() => buildAlerts(orders, ingredients), [orders, ingredients]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-xl bg-white p-2.5 text-bordo shadow-soft ring-1 ring-bordo/5 transition hover:text-cereja"
        aria-label="Alertas"
      >
        <Bell className="h-5 w-5" />
        {alerts.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-cereja px-1 text-[10px] font-bold text-white ring-2 ring-creme">
            {alerts.length > 99 ? '99+' : alerts.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl bg-white shadow-lift ring-1 ring-bordo/10 animate-scale-in">
          <div className="border-b border-bordo/5 px-4 py-3">
            <p className="font-display text-base font-semibold text-bordo">Alertas</p>
          </div>
          {alerts.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-bordo/50">Tudo em dia por aqui ✨</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-bordo/5 overflow-y-auto">
              {alerts.map((a) => {
                const Icon = a.kind === 'estoque' ? Boxes : a.kind === 'pagamento' || a.kind === 'estorno' ? Wallet : a.kind === 'atraso' ? AlertTriangle : CalendarClock;
                return (
                  <li key={a.id}>
                    <button
                      className="flex w-full gap-3 px-4 py-3 text-left hover:bg-creme-50"
                      onClick={() => {
                        setOpen(false);
                        if (a.kind === 'estoque' || !a.order) navigate('/estoque');
                        else if (a.kind === 'pagamento') openPayment(a.order.id);
                        else if (a.kind === 'estorno') openPayment(a.order.id, 'estorno');
                        else openOrderForm({ orderId: a.order.id });
                      }}
                    >
                      <span
                        className={cx(
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                          a.kind === 'atraso' ? 'bg-red-100 text-red-600' : a.kind === 'entrega' ? 'bg-amber-100 text-amber-700' : 'bg-rosa-50 text-cereja',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-bordo">{a.title}</span>
                        <span className="block text-xs text-bordo/55">{a.text}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function StockSetupBanner() {
  const { error } = useStock();
  if (!error) return null;
  const missing = /does not exist|relation|schema cache|not find/i.test(error);
  return (
    <div className="mx-auto mt-4 max-w-[1400px] px-4 sm:px-6 lg:px-8 print:hidden">
      <div className="flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          {missing ? (
            <>
              Os módulos de estoque, receitas e despesas ainda não foram ativados no banco. Rode o arquivo <b>supabase/02_estoque_custos.sql</b> no SQL
              Editor do Supabase e recarregue a página.
            </>
          ) : (
            <>Não foi possível carregar estoque e despesas: {error}</>
          )}
        </p>
      </div>
    </div>
  );
}

/** Barra de navegação inferior (celular), estilo aplicativo */
function BottomNav({ onMore }: { onMore: () => void }) {
  const { openOrderForm, setWeek } = useUI();
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const items: { label: string; icon: LucideIcon; active: boolean; go: () => void }[] = [
    { label: 'Início', icon: LayoutDashboard, active: path === '/', go: () => navigate('/') },
    {
      label: 'Entregas',
      icon: Truck,
      active: path.startsWith('/entregas'),
      go: () => {
        const n = nextDeliveryDay();
        setWeek(n.date);
        navigate(`/entregas/${n.slug}`);
      },
    },
    { label: 'Produção', icon: ChefHat, active: path === '/producao', go: () => navigate('/producao') },
    { label: 'Mais', icon: Menu, active: false, go: onMore },
  ];
  const btn = (i: (typeof items)[number]) => (
    <button
      key={i.label}
      onClick={i.go}
      className={cx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition', i.active ? 'text-cereja' : 'text-bordo/55')}
    >
      <i.icon className={cx('h-[22px] w-[22px]', i.active && 'scale-110')} />
      {i.label}
    </button>
  );
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-bordo/10 bg-white/95 backdrop-blur-md lg:hidden print:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-md items-end">
        {btn(items[0])}
        {btn(items[1])}
        <div className="flex flex-1 justify-center">
          <button
            onClick={() => openOrderForm()}
            aria-label="Novo pedido"
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-cereja text-white shadow-lift ring-4 ring-creme transition active:scale-95"
          >
            <Plus className="h-7 w-7" />
          </button>
        </div>
        {btn(items[2])}
        {btn(items[3])}
      </div>
    </nav>
  );
}
