import { Database, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Logo from './components/Logo';
import { Button, Spinner } from './components/ui';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';
import { StockProvider, useStock } from './context/StockContext';
import { SettingsProvider } from './context/SettingsContext';
import { UIProvider } from './context/UIContext';
import { isSupabaseConfigured } from './lib/supabase';
import Dashboard from './pages/Dashboard';
import Deliveries from './pages/Deliveries';
import Finance from './pages/Finance';
import HistoryPage from './pages/History';
import Login, { ResetPassword } from './pages/Login';
import NewOrder from './pages/NewOrder';
import Production from './pages/Production';
import SettingsPage from './pages/Settings';
import Expenses from './pages/Expenses';
import Profitability from './pages/Profitability';
import Recipes from './pages/Recipes';
import ScanReceipt from './pages/ScanReceipt';
import ShoppingList from './pages/ShoppingList';
import Stock from './pages/Stock';
import PublicOrder from './pages/PublicOrder';

export default function App() {
  // Página pública de pedidos para clientes (não precisa de login)
  if (window.location.pathname.startsWith('/pedir')) return <PublicOrder />;
  if (!isSupabaseConfigured) return <SetupNeeded />;
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

function Gate() {
  const { session, loading, authorized, signOut } = useAuth();

  if (loading) return <FullScreen><Spinner /></FullScreen>;

  if (!session)
    return (
      <Routes>
        <Route path="/redefinir-senha" element={<ResetPassword />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );

  if (window.location.pathname === '/redefinir-senha') return <ResetPassword />;

  if (authorized === null) return <FullScreen><Spinner label="Verificando acesso…" /></FullScreen>;

  if (authorized === false)
    return (
      <FullScreen>
        <div className="max-w-md rounded-3xl bg-white p-8 text-center shadow-soft">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-cereja" />
          <h1 className="font-display text-2xl font-semibold text-bordo">Acesso não liberado</h1>
          <p className="mt-2 text-sm text-bordo/60">
            Seu login funcionou, mas este usuário ainda não foi autorizado na equipe da GB GOBÊ. Peça para a administração liberar seu acesso.
          </p>
          <Button className="mt-6" variant="secondary" onClick={signOut}>
            Sair
          </Button>
        </div>
      </FullScreen>
    );

  return (
    <DataProvider>
      <StockProvider>
      <SettingsProvider>
      <UIProvider>
        <DataGate>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="novo-pedido" element={<NewOrder />} />
              <Route path="entregas/:dia" element={<Deliveries />} />
              <Route path="producao" element={<Production />} />
              <Route path="financeiro" element={<Finance />} />
              <Route path="historico" element={<HistoryPage />} />
              <Route path="configuracoes" element={<SettingsPage />} />
              <Route path="estoque" element={<Stock />} />
              <Route path="lista-de-compras" element={<ShoppingList />} />
              <Route path="escanear" element={<ScanReceipt />} />
              <Route path="receitas" element={<Recipes />} />
              <Route path="despesas" element={<Expenses />} />
              <Route path="rentabilidade" element={<Profitability />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </DataGate>
      </UIProvider>
      </SettingsProvider>
      </StockProvider>
    </DataProvider>
  );
}

function DataGate({ children }: { children: ReactNode }) {
  const { loading, error, reload } = useData();
  const stock = useStock();
  if (loading || stock.loading) return <FullScreen><Spinner label="Carregando pedidos…" /></FullScreen>;
  if (error)
    return (
      <FullScreen>
        <div className="max-w-md rounded-3xl bg-white p-8 text-center shadow-soft">
          <Database className="mx-auto mb-3 h-10 w-10 text-cereja" />
          <h1 className="font-display text-2xl font-semibold text-bordo">Não foi possível carregar</h1>
          <p className="mt-2 text-sm text-bordo/60">{error}</p>
          <Button className="mt-6" onClick={reload}>
            Tentar novamente
          </Button>
        </div>
      </FullScreen>
    );
  return <>{children}</>;
}

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-creme p-6">
      <Logo />
      {children}
    </div>
  );
}

function SetupNeeded() {
  return (
    <FullScreen>
      <div className="max-w-lg rounded-3xl bg-white p-8 shadow-soft">
        <h1 className="font-display text-2xl font-semibold text-bordo">Configuração pendente</h1>
        <p className="mt-2 text-sm text-bordo/70">
          Defina as variáveis <code className="rounded bg-creme px-1">VITE_SUPABASE_URL</code> e{' '}
          <code className="rounded bg-creme px-1">VITE_SUPABASE_ANON_KEY</code> no arquivo <code className="rounded bg-creme px-1">.env</code> (no computador) ou
          em <b>Site configuration › Environment variables</b> (na Netlify) e publique novamente.
        </p>
      </div>
    </FullScreen>
  );
}
