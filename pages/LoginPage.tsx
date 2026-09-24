// ============================================================================
// DineroYa — Inicio de sesión
// ============================================================================
import React, { useState } from 'react';
import { Activity, LogIn, HardDrive, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Btn, Field, inputCls } from '../components/ui';

export const LoginPage: React.FC = () => {
  const { signIn, signUp, isSupabase } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        await signUp(email, password, fullName);
        setError('Registro enviado. Si tu Supabase requiere confirmación por email, revísala y luego inicia sesión.');
      }
    } catch (err: any) {
      setError(err?.message ?? 'Error de autenticación');
    } finally {
      setBusy(false);
    }
  };

  const demoLogin = async () => {
    setBusy(true);
    try {
      await signIn('demo@finanzapro.local', 'demo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F172A] p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-4 justify-center mb-8">
          <div className="w-14 h-14 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Activity className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">FinanzaPro</h1>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Cartera de Préstamos</p>
          </div>
        </div>

        <div className="bg-white rounded-[32px] shadow-2xl p-8 lg:p-10">
          <h2 className="text-xl font-black text-slate-900 mb-1">
            {mode === 'signin' ? 'Iniciar sesión' : 'Crear cuenta'}
          </h2>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-8">
            {isSupabase ? 'Equipo de cobranza' : 'Modo local'}
          </p>

          <form onSubmit={submit} className="flex flex-col gap-5">
            {mode === 'signup' && (
              <Field label="Nombre completo">
                <input required value={fullName} onChange={e => setFullName(e.target.value)} className={inputCls} />
              </Field>
            )}
            <Field label="Email">
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Contraseña">
              <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} className={inputCls} />
            </Field>

            {error && (
              <div className="bg-rose-50 text-rose-600 text-sm font-bold p-4 rounded-2xl flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 shrink-0" /> {error}
              </div>
            )}

            <Btn type="submit" disabled={busy} className="w-full flex items-center justify-center gap-2">
              <LogIn className="w-4 h-4" /> {mode === 'signin' ? 'Entrar' : 'Registrarme'}
            </Btn>
          </form>

          <button
            onClick={() => { setMode(m => (m === 'signin' ? 'signup' : 'signin')); setError(null); }}
            className="mt-5 w-full text-xs font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-widest"
          >
            {mode === 'signin' ? '¿No tienes cuenta? Regístrate' : 'Ya tengo cuenta'}
          </button>

          {!isSupabase && (
            <div className="mt-8 pt-6 border-t border-slate-100">
              <Btn variant="secondary" onClick={demoLogin} disabled={busy} className="w-full flex items-center justify-center gap-2">
                <HardDrive className="w-4 h-4" /> Entrar en modo demo
              </Btn>
              <p className="text-[11px] text-slate-400 font-medium mt-3 text-center leading-relaxed">
                Sin Supabase configurado la app funciona en modo local con datos de demostración en este navegador.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
