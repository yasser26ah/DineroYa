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
  const [accountType, setAccountType] = useState<'cliente' | 'equipo'>('cliente');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [document, setDocument] = useState('');
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
        await signUp(email, password, fullName, {
          role: accountType === 'cliente' ? 'cliente' : 'cobrador',
          phone: phone.trim() || undefined,
          document: document.trim() || undefined,
        });
        setInfo(
          isSupabase
            ? 'Cuenta creada. Revisa tu correo y confirma la dirección para poder iniciar sesión. Si no llega en unos minutos, revisa spam o pide al administrador que active tu cuenta.'
            : 'Cuenta creada. Ya puedes iniciar sesión.',
        );
        setMode('signin');
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
      await signIn('demo@dineroya.local', 'demo');
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
            <h1 className="text-3xl font-black text-white tracking-tight">DineroYa</h1>
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
              <>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Tipo de cuenta</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAccountType('cliente')}
                      className={`py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-widest transition border ${
                        accountType === 'cliente'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'
                      }`}
                    >
                      Soy cliente
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccountType('equipo')}
                      className={`py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-widest transition border ${
                        accountType === 'equipo'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'
                      }`}
                    >
                      Soy del equipo
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium mt-2">
                    {accountType === 'cliente'
                      ? 'Tendrás tu propio portal para ver préstamos, cuotas y solicitar créditos.'
                      : 'El primer usuario registrado queda como administrador. Los demás entran como cobradores hasta que un admin cambie su rol.'}
                  </p>
                </div>
                <Field label="Nombre completo">
                  <input required value={fullName} onChange={e => setFullName(e.target.value)} className={inputCls} />
                </Field>
                {accountType === 'cliente' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Teléfono">
                      <input value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} placeholder="Ej: 3001234567" />
                    </Field>
                    <Field label="Documento">
                      <input value={document} onChange={e => setDocument(e.target.value)} className={inputCls} placeholder="Ej: CC 1023456" />
                    </Field>
                  </div>
                )}
              </>
            )}
            <Field label="Email">
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
            </Field>
            {mode !== 'forgot' && (
              <Field label="Contraseña">
                <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} className={inputCls} placeholder="Mínimo 6 caracteres" />
              </Field>
            )}

            {mode === 'signin' && (
              <div className="flex flex-col gap-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    className="mt-0.5 w-4 h-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <p className="text-sm font-bold text-slate-800 leading-relaxed">Declaro ser mayor de edad (18 años como mínimo) y tener capacidad legal para usar esta plataforma.</p>
                    <p className="text-[11px] text-slate-500 mt-1">Esta declaración es una medida técnica de recopilación de edad; no sustituye la evaluación legal del producto.</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    className="mt-0.5 w-4 h-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <p className="text-sm font-bold text-slate-800 leading-relaxed">He leído y acepto los Términos de Uso y la Política de Privacidad.</p>
                    <p className="text-[11px] text-slate-500 mt-1">Acepto el tratamiento de mis datos personales y, si corresponda, la comunicación de avisos necesarios para mi cuenta o crédito.</p>
                  </div>
                </label>

                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 underline underline-offset-2">
                  Leer Términos de uso y Privacidad
                </a>
              </div>
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

          <div className="mt-6 flex flex-col gap-3">
            <div className="flex flex-wrap gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
              <a href="/terms" className="inline-flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl px-3 py-1.5 text-slate-600 transition-colors">
                Términos de uso
              </a>
              <a href="/privacy" className="inline-flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl px-3 py-1.5 text-slate-600 transition-colors">
                Privacidad y datos
              </a>
            </div>
            <p className="text-[11px] text-slate-400 font-medium text-center leading-relaxed">
              Lea los documentos legales antes de usar el servicio. Puede consultarlos cuando quiera desde el menú del producto.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
