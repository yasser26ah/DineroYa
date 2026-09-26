// ============================================================================
// DineroYa — Inicio de sesión
// ============================================================================
import React, { useState } from 'react';
import { Activity, LogIn, HardDrive, Info, MailCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Btn, Field, inputCls } from '../components/ui';

export const LoginPage: React.FC = () => {
  const { signIn, signUp, resetPassword, isSupabase } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else if (mode === 'signup') {
        await signUp(email, password, fullName);
        setError('Registro enviado. Si tu Supabase requiere confirmación por email, revísala y luego inicia sesión.');
      } else {
        await resetPassword(email);
        setInfo('Si el email existe, te enviamos un enlace para crear una contraseña nueva. Revisa tu bandeja (y spam).');
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

  const toggleMode = () => {
    setMode(m => (m === 'signin' ? 'signup' : 'signin'));
    setError(null);
    setInfo(null);
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
            {mode === 'signin' ? 'Iniciar sesión' : mode === 'signup' ? 'Crear cuenta' : 'Recuperar contraseña'}
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
            {mode !== 'signup' && (
              <Field label="Email">
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
              </Field>
            )}
            {mode === 'signin' && (
              <Field label="Contraseña">
                <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} className={inputCls} />
              </Field>
            )}

            {error && (
              <div className="bg-rose-50 text-rose-600 text-sm font-bold p-4 rounded-2xl flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 shrink-0" /> {error}
              </div>
            )}

            {info && (
              <div className="bg-emerald-50 text-emerald-700 text-sm font-bold p-4 rounded-2xl flex items-start gap-2">
                <MailCheck className="w-4 h-4 mt-0.5 shrink-0" /> {info}
              </div>
            )}

            <Btn type="submit" disabled={busy} className="w-full flex items-center justify-center gap-2">
              <LogIn className="w-4 h-4" /> {mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Registrarme' : 'Enviar enlace'}
            </Btn>
          </form>

          {mode === 'signin' && isSupabase && (
            <button
              onClick={() => { setMode('forgot'); setError(null); setInfo(null); }}
              className="mt-4 w-full text-xs font-bold text-slate-500 hover:text-indigo-600 uppercase tracking-widest"
            >
              ¿Olvidaste tu contraseña?
            </button>
          )}

          {mode !== 'forgot' && (
            <button
              onClick={toggleMode}
              className="mt-5 w-full text-xs font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-widest"
            >
              {mode === 'signin' ? '¿No tienes cuenta? Regístrate' : 'Ya tengo cuenta'}
            </button>
          )}

          {mode === 'forgot' && (
            <button
              onClick={() => { setMode('signin'); setError(null); setInfo(null); }}
              className="mt-5 w-full text-xs font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-widest"
            >
              Volver a iniciar sesión
            </button>
          )}

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
