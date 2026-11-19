// ==============================================================================
// DineroYa — Completar perfil del cliente (primer acceso)
// Pantalla dedicada que el cliente con rol 'cliente' ve antes de poder usar el
// portal. No es una tab del menú: se renderiza como gate de onboarding cuando el
// usuario es cliente y aún no tiene una ficha completa.
// ============================================================================
import React, { useMemo, useState } from 'react';
import { UserCog, CheckCircle2, AlertTriangle, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { Btn, Card, Field, inputCls } from '../components/ui';

export const CompleteProfilePage: React.FC = () => {
  const { user, signOut } = useAuth();
  const { clients, createClient, updateClient, linkClientToProfile } = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Si el usuario actual ya tiene un cliente vinculado, usamos ese como punto de partida.
  const existingClient = useMemo(() => {
    if (!user?.clientId) return undefined;
    return clients.find(c => c.id === user.clientId);
  }, [clients, user]);

  // Completo = tiene cliente vinculado y ese cliente tiene nombre + documento + celular.
  const complete = useMemo(() => {
    const c = existingClient ?? clients.find(
      c => c.email && c.email.toLowerCase() === (user?.email ?? '').toLowerCase(),
    );
    if (!c) return false;
    return Boolean(c.name && c.document && c.phone);
  }, [existingClient, clients, user]);

  // El formulario empieza con lo que ya existe del cliente (vinculado o por email).
  const initialName = useMemo(() => {
    if (existingClient) return existingClient.name;
    const byEmail = clients.find(
      c => c.email && c.email.toLowerCase() === (user?.email ?? '').toLowerCase(),
    );
    if (byEmail) return byEmail.name;
    return user?.fullName ?? '';
  }, [existingClient, clients, user]);

  const initialDocument = useMemo(() => {
    if (existingClient) return existingClient.document ?? '';
    const byEmail = clients.find(
      c => c.email && c.email.toLowerCase() === (user?.email ?? '').toLowerCase(),
    );
    if (byEmail) return byEmail.document ?? '';
    return '';
  }, [existingClient, clients, user]);

  const initialPhone = useMemo(() => {
    if (existingClient) return existingClient.phone;
    const byEmail = clients.find(
      c => c.email && c.email.toLowerCase() === (user?.email ?? '').toLowerCase(),
    );
    if (byEmail) return byEmail.phone;
    return '';
  }, [existingClient, clients, user]);

  const initialEmail = useMemo(() => {
    if (existingClient) return existingClient.email ?? '';
    const byEmail = clients.find(
      c => c.email && c.email.toLowerCase() === (user?.email ?? '').toLowerCase(),
    );
    if (byEmail) return byEmail.email ?? '';
    return user?.email ?? '';
  }, [existingClient, clients, user]);

  React.useEffect(() => { setName(initialName); }, [initialName]);
  React.useEffect(() => { setDocument(initialDocument); }, [initialDocument]);
  React.useEffect(() => { setPhone(initialPhone); }, [initialPhone]);
  React.useEffect(() => { setEmail(initialEmail); }, [initialEmail]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const rawName = name.trim();
    const rawDocument = document.trim();
    const rawPhone = phone.trim();
    const rawEmail = email.trim();

    if (!rawName) { setError('Ingresa tu nombre completo.'); return; }
    if (!rawDocument) { setError('Ingresa tu documento de identidad.'); return; }
    if (!rawPhone) { setError('Ingresa tu número de celular.'); return; }

    setBusy(true);
    setError(null);
    try {
      let clientId: string;

      if (existingClient) {
        // Actualizar ficha existente.
        await updateClient(existingClient.id, {
          name: rawName,
          document: rawDocument || undefined,
          phone: rawPhone,
          email: rawEmail || undefined,
        });
        clientId = existingClient.id;
      } else {
        // Nuevo cliente: crear + vincular al usuario.
        const created = await createClient({
          name: rawName,
          document: rawDocument || undefined,
          phone: rawPhone,
          email: rawEmail || undefined,
        });
        clientId = created.id;
      }

      // Único vínculo usuario ↔ ficha, tanto si la ficha se actualizó como si se creó.
      await linkClientToProfile(user.id, clientId);

      // Volver a leer el cliente recién guardado para confirmación visual.
      const finalClient = clients.find(c => c.id === clientId);
      setSuccess(finalClient);
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo guardar tu perfil.');
    } finally {
      setBusy(false);
    }
  };

  const [success, setSuccess] = useState<{
    name: string;
    document: string;
    phone: string;
    email?: string;
  } | null>(null);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F172A] p-6">
        <Card className="w-full max-w-md p-8">
          <p className="text-sm font-bold text-slate-600">No hay sesión activa.</p>
          <Btn onClick={signOut} className="mt-4 w-full">Volver al inicio</Btn>
        </Card>
      </div>
    );
  }

  if (complete && success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-6">
        <Card className="w-full max-w-md p-8 lg:p-10 text-center">
          <div className="p-5 bg-emerald-50 rounded-full mx-auto mb-5">
            <CheckCircle2 className="w-9 h-9 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">Tu perfil está listo</h2>
          <p className="text-slate-500 text-sm font-medium mb-6">
            Bienvenido a DineroYa, {success.name.split(' ')[0]}.
          </p>
          <div className="grid grid-cols-1 gap-2 text-left bg-slate-50 rounded-2xl p-4 mb-6 text-sm font-medium text-slate-700">
            <div className="flex justify-between gap-3">
              <span className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Nombre</span>
              <span className="font-black text-slate-900">{success.name}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Documento</span>
              <span className="font-black text-slate-900">{success.document}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Celular</span>
              <span className="font-black text-slate-900">{success.phone}</span>
            </div>
            {success.email && (
              <div className="flex justify-between gap-3">
                <span className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Email</span>
                <span className="font-black text-slate-900 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" /> {success.email}
                </span>
              </div>
            )}
          </div>
          <Btn onClick={() => window.location.hash = '/portal'} className="w-full">
            Entrar al portal
          </Btn>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4">
            Si vuelves a esta pantalla, usaremos estos datos como tu ficha oficial de cliente.
          </p>
        </Card>
      </div>
    );
  }

  if (complete) {
    // Estado transitorio: se marcó completo pero aún no se resolvió la confirmación.
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="p-4 bg-indigo-50 rounded-full mx-auto mb-4">
            <UserCog className="w-7 h-7 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">Completa tu perfil</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Antes de continuar, completa tus datos personales.
          </p>
        </div>

        <Card className="p-6 lg:p-8">
          {error && (
            <div className="mb-5 bg-rose-50 text-rose-600 text-sm font-bold p-4 rounded-2xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
            </div>
          )}

          <form onSubmit={submit} className="flex flex-col gap-5">
            <Field label="Nombre completo">
              <input
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className={inputCls}
                placeholder="Ej: María González"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Documento">
                <input
                  required
                  value={document}
                  onChange={e => setDocument(e.target.value)}
                  className={inputCls}
                  placeholder="Ej: CC 1023456"
                />
              </Field>
              <Field label="Celular">
                <input
                  required
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className={inputCls}
                  placeholder="Ej: 3001234567"
                />
              </Field>
            </div>

            <Field label="Email (opcional)">
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className={`${inputCls} pl-10`}
                  placeholder="Ej: maria@ejemplo.com"
                />
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                No obligatorio. Si lo dejás vacío, usamos tu email de acceso.
              </p>
            </Field>

            <div className="bg-slate-50 rounded-2xl p-4 text-xs font-medium text-slate-500 leading-relaxed">
              Estos datos son tu ficha oficial como cliente: nombre, documento y celular son obligatorios.
              El email es opcional.
            </div>

            <Btn type="submit" disabled={busy} className="w-full flex items-center justify-center gap-2">
              {busy ? 'Guardando...' : 'Guardar y continuar'}
            </Btn>
          </form>
        </Card>

        <p className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4">
          DineroYa · Tus datos se guardan en tu ficha de cliente.
        </p>
      </div>
    </div>
  );
};
