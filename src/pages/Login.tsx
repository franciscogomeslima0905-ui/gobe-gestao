import { Eye, EyeOff, Lock, Mail, type LucideIcon } from 'lucide-react';
import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import Logo from '../components/Logo';
import { Button } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function Login() {
  const { signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'reset'>('login');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    if (mode === 'login') {
      const err = await signIn(email, password);
      if (err) setError(err);
    } else {
      const err = await resetPassword(email);
      if (err) setError(err);
      else setInfo('Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.');
    }
    setLoading(false);
  };

  return (
    <AuthShell>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-bordo">{mode === 'login' ? 'Que bom te ver!' : 'Recuperar senha'}</h1>
          <p className="mt-1 text-sm text-bordo/60">
            {mode === 'login' ? 'Entre para acessar o painel de pedidos da GOBÊ.' : 'Informe seu e-mail para receber o link de redefinição.'}
          </p>
        </div>

        <IconInput icon={Mail} type="email" placeholder="seu@email.com" value={email} onChange={setEmail} autoComplete="email" required />

        {mode === 'login' && (
          <div className="relative">
            <IconInput
              icon={Lock}
              type={show ? 'text' : 'password'}
              placeholder="Sua senha"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-bordo/40 hover:text-bordo"
              aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        )}

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">{error}</p>}
        {info && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-100">{info}</p>}

        <Button type="submit" loading={loading} className="w-full py-3">
          {mode === 'login' ? 'Entrar' : 'Enviar link'}
        </Button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'reset' : 'login');
            setError(null);
            setInfo(null);
          }}
          className="w-full text-center text-sm font-semibold text-cereja hover:underline"
        >
          {mode === 'login' ? 'Esqueci minha senha' : 'Voltar para o login'}
        </button>
      </form>
    </AuthShell>
  );
}

export function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres.');
    if (password !== confirmPwd) return setError('As senhas não conferem.');
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) setError(error.message);
    else window.location.assign('/');
  };

  return (
    <AuthShell>
      <form onSubmit={submit} className="space-y-4">
        <h1 className="font-display text-3xl font-semibold text-bordo">Nova senha</h1>
        <IconInput icon={Lock} type="password" placeholder="Nova senha" value={password} onChange={setPassword} autoComplete="new-password" required />
        <IconInput icon={Lock} type="password" placeholder="Repita a nova senha" value={confirmPwd} onChange={setConfirmPwd} autoComplete="new-password" required />
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <Button type="submit" loading={loading} className="w-full py-3">
          Salvar nova senha
        </Button>
      </form>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-creme lg:grid-cols-2">
      {/* Lado da marca */}
      <div className="relative hidden overflow-hidden bg-bordo lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-cereja/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-rosa/20 blur-3xl" />
        <svg className="absolute inset-0 h-full w-full opacity-[.06]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="2" fill="#F3B4D0" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)" />
        </svg>
        <div className="relative">
          <Logo light className="h-14 w-14" />
        </div>
        <div className="relative max-w-md">
          <p className="font-display text-5xl font-semibold leading-tight text-creme">
            Feito à mão,
            <br />
            <span className="italic text-rosa">organizado com carinho.</span>
          </p>
          <p className="mt-4 text-creme/70">Pedidos, produção, entregas e financeiro da confeitaria em um só lugar.</p>
        </div>
        <p className="relative text-xs text-creme/40">© {new Date().getFullYear()} GB GOBÊ – Confeitaria Artesanal · Uso interno</p>
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo className="h-14 w-14" />
          </div>
          <div className="rounded-3xl bg-white p-7 shadow-lift ring-1 ring-bordo/5">{children}</div>
          <p className="mt-6 text-center text-xs text-bordo/40">Acesso restrito à equipe autorizada.</p>
        </div>
      </div>
    </div>
  );
}

function IconInput({
  icon: Icon,
  onChange,
  ...p
}: { icon: LucideIcon; onChange: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'>) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-bordo/40" />
      <input
        {...p}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border-0 bg-creme-50 py-3 pl-10 pr-10 text-sm text-bordo ring-1 ring-bordo/10 placeholder:text-bordo/35 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cereja/50"
      />
    </div>
  );
}
