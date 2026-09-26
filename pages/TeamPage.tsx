// ============================================================================
// DineroYa — Equipo (solo admin): usuarios, roles y permisos
// ============================================================================
import React, { useEffect, useState } from 'react';
import { Users, ShieldCheck, UserCog, Power, Plus, Pencil, Trash2, LayoutGrid, KeyRound } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls, EmptyState } from '../components/ui';
import { CustomRole, PERM_LABELS, UserRole } from '../types';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  cobrador: 'Cobrador',
};

const ROLE_STYLE: Record<UserRole, string> = {
  admin: 'bg-indigo-100 text-indigo-700',
  gerente: 'bg-sky-100 text-sky-700',
  cobrador: 'bg-slate-100 text-slate-600',
};

const ROLE_HELP: Record<UserRole, string> = {
  admin: 'Acceso total: configuración, equipo, cancelaciones y auditoría.',
  gerente: 'Ve toda la cartera y la auditoría; no gestiona usuarios.',
  cobrador: 'Ve y gestiona solo los préstamos asignados a él.',
};

const SCREEN_OPTIONS: { id: string; label: string }[] = [
  { id: 'dashboard', label: 'Resumen Global' },
  { id: 'collections', label: 'Cobranza del Día' },
  { id: 'loans', label: 'Préstamos' },
  { id: 'clients', label: 'Clientes' },
  { id: 'audit', label: 'Auditoría' },
  { id: 'team', label: 'Equipo' },
  { id: 'settings', label: 'Configuración' },
];

export const TeamPage: React.FC = () => {
  const { profiles, roles, updateProfileRole, toggleProfileActive, saveRole, deleteRole } = useData();
  const { user } = useAuth();
  const [roleModal, setRoleModal] = useState<{ userId: string } | null>(null);
  const [editRole, setEditRole] = useState<CustomRole | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (msg) { const t = setTimeout(() => setMsg(null), 3000); return () => clearTimeout(t); }
  }, [msg]);

  const roleIdOf = (p: { roleId?: string; role: UserRole }) => p.roleId ?? p.role;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Equipo"
        subtitle="Usuarios, roles personalizados y permisos por pantalla"
        actions={
          <Btn onClick={() => setEditRole('new')} className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Nuevo rol
          </Btn>
        }
      />

      {msg && (
        <div className="bg-emerald-50 text-emerald-700 text-sm font-bold p-4 rounded-2xl">{msg}</div>
      )}

      {/* ------- Roles ------- */}
      <section>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <KeyRound className="w-4 h-4" /> Roles y permisos
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {roles.map(r => (
            <Card key={r.id} className="p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-black text-slate-900">{r.name}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {r.isSystem ? 'Rol del sistema' : 'Rol personalizado'} · {r.screens.length} pantallas
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditRole(r)}
                    className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
                    title="Editar rol"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {!r.isSystem && (
                    <button
                      onClick={async () => {
                        if (!confirm(`¿Eliminar el rol "${r.name}"? Los usuarios con este rol quedarán como cobradores.`)) return;
                        setBusy(true);
                        try {
                          await deleteRole(r.id);
                          const affected = profiles.filter(p => p.roleId === r.id);
                          for (const p of affected) await updateProfileRole(p.id, 'cobrador');
                          setMsg('Rol eliminado.');
                        } catch (e: any) { setMsg(e.message ?? 'Error'); }
                        finally { setBusy(false); }
                      }}
                      disabled={busy}
                      className="p-2 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100"
                      title="Eliminar rol"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.screens.map(s => (
                  <span key={s} className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600">
                    {SCREEN_OPTIONS.find(o => o.id === s)?.label ?? s}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 font-bold mt-2">
                {Object.entries(r.perms).filter(([, v]) => v).length} permisos de movimiento
              </p>
            </Card>
          ))}
          {roles.length === 0 && (
            <p className="text-slate-400 italic text-sm">Los roles del sistema se cargan al conectar con Supabase.</p>
          )}
        </div>
      </section>

      {/* ------- Usuarios ------- */}
      <section>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" /> Usuarios
        </h3>
        {profiles.length === 0 ? (
          <EmptyState icon={Users} title="Sin usuarios" hint="Los usuarios aparecen al registrarse en el sistema." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {profiles.map(p => {
              const myRole = roles.find(r => r.id === roleIdOf(p));
              return (
                <Card key={p.id} className={`p-6 ${!p.active ? 'opacity-60' : ''}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 bg-indigo-50 rounded-2xl flex items-center justify-center font-black text-indigo-600 text-sm shrink-0">
                        {p.fullName.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('')}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-black text-slate-900 truncate">{p.fullName}</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{p.email ?? p.id.slice(0, 8)}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg tracking-wider shrink-0 ${myRole ? 'bg-indigo-100 text-indigo-700' : ROLE_STYLE[p.role]}`}>
                      {myRole?.name ?? ROLE_LABELS[p.role]}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 font-medium mb-5 leading-relaxed">
                    {myRole
                      ? `${myRole.screens.length} pantallas · ${Object.entries(myRole.perms).filter(([, v]) => v).length} permisos`
                      : ROLE_HELP[p.role]}
                  </p>

                  <div className="flex gap-2">
                    <Btn
                      variant="secondary"
                      onClick={() => setRoleModal({ userId: p.id })}
                      disabled={p.id === user?.id}
                      className="flex-1 flex items-center justify-center gap-1.5"
                      title={p.id === user?.id ? 'No puedes cambiar tu propio rol' : 'Cambiar rol'}
                    >
                      <UserCog className="w-3.5 h-3.5" /> Rol
                    </Btn>
                    <Btn
                      variant={p.active ? 'danger' : 'success'}
                      onClick={async () => { setBusy(true); try { await toggleProfileActive(p.id, !p.active); } finally { setBusy(false); } }}
                      disabled={p.id === user?.id || busy}
                      className="flex-1 flex items-center justify-center gap-1.5"
                      title={p.id === user?.id ? 'No puedes desactivarte' : p.active ? 'Desactivar acceso' : 'Reactivar'}
                    >
                      <Power className="w-3.5 h-3.5" /> {p.active ? 'Desactivar' : 'Activar'}
                    </Btn>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal: asignar rol a usuario */}
      {roleModal && (
        <AssignRoleModal
          roles={roles}
          currentRoleId={roleIdOf(profiles.find(p => p.id === roleModal.userId) ?? { roleId: undefined, role: 'cobrador' })}
          onSave={async (roleId) => {
            setBusy(true);
            try {
              await updateProfileRole(roleModal.userId, (roleId as UserRole) ?? 'cobrador');
              setRoleModal(null);
              setMsg('Rol actualizado.');
            } finally { setBusy(false); }
          }}
          onClose={() => setRoleModal(null)}
          busy={busy}
        />
      )}

      {/* Modal: crear/editar rol */}
      {editRole && (
        <RoleEditor
          role={editRole === 'new' ? null : editRole}
          onSave={async (r) => {
            setBusy(true);
            try { await saveRole(r); setEditRole(null); setMsg('Rol guardado.'); }
            catch (e: any) { setMsg(e.message ?? 'Error'); }
            finally { setBusy(false); }
          }}
          onClose={() => setEditRole(null)}
          busy={busy}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
const AssignRoleModal: React.FC<{
  roles: CustomRole[]; currentRoleId: string; onSave: (roleId: string) => void; onClose: () => void; busy: boolean;
}> = ({ roles, currentRoleId, onSave, onClose, busy }) => {
  const [roleId, setRoleId] = useState(currentRoleId);
  const selected = roles.find(r => r.id === roleId);
  return (
    <Modal title="Asignar rol" subtitle={selected ? `${selected.screens.length} pantallas · ${Object.entries(selected.perms).filter(([, v]) => v).length} permisos` : undefined} onClose={onClose}>
      <div className="flex flex-col gap-5">
        <Field label="Rol del usuario">
          <select value={roleId} onChange={e => setRoleId(e.target.value)} className={inputCls}>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}{r.isSystem ? '' : ' (personalizado)'}</option>)}
          </select>
        </Field>
        {selected && (
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <LayoutGrid className="w-3 h-3" /> Pantallas
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {selected.screens.map(s => (
                <span key={s} className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600">
                  {s}
                </span>
              ))}
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3" /> Movimientos permitidos
            </p>
            <ul className="text-xs text-slate-600 font-bold space-y-1">
              {Object.entries(selected.perms).filter(([, v]) => v).map(([k]) => (
                <li key={k}>• {PERM_LABELS[k] ?? k}</li>
              ))}
              {Object.entries(selected.perms).filter(([, v]) => v).length === 0 && <li className="text-slate-400">Solo lectura</li>}
            </ul>
          </div>
        )}
        <div className="flex gap-3">
          <Btn variant="secondary" onClick={onClose} className="flex-1">Cancelar</Btn>
          <Btn onClick={() => onSave(roleId)} disabled={busy || roleId === currentRoleId} className="flex-1">Guardar</Btn>
        </div>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
const RoleEditor: React.FC<{
  role: CustomRole | null; onSave: (r: CustomRole) => void; onClose: () => void; busy: boolean;
}> = ({ role, onSave, onClose, busy }) => {
  const [name, setName] = useState(role?.name ?? '');
  const [screens, setScreens] = useState<string[]>(role?.screens ?? ['dashboard', 'collections', 'loans', 'clients']);
  const [perms, setPerms] = useState<Record<string, boolean>>(role?.perms ?? { payments: true, activities: true });
  const isNew = !role;

  const toggleScreen = (id: string) =>
    setScreens(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const togglePerm = (k: string) =>
    setPerms(p => ({ ...p, [k]: !p[k] }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: role?.id ?? `custom_${Date.now().toString(36)}`,
      name: name.trim(),
      screens,
      perms,
      isSystem: role?.isSystem ?? false,
    });
  };

  return (
    <Modal
      title={isNew ? 'Nuevo rol' : `Editar rol: ${role!.name}`}
      subtitle="Define qué pantallas ve y qué movimientos puede realizar"
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="flex flex-col gap-6">
        <Field label="Nombre del rol">
          <input value={name} onChange={e => setName(e.target.value)} required className={inputCls} placeholder="Ej: Supervisor de ruta" />
        </Field>

        <div>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <LayoutGrid className="w-3.5 h-3.5" /> Pantallas visibles
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {SCREEN_OPTIONS.map(o => (
              <label key={o.id} className={`flex items-center gap-2 p-3 rounded-2xl border cursor-pointer text-xs font-bold transition ${screens.includes(o.id) ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-100 text-slate-500'}`}>
                <input type="checkbox" checked={screens.includes(o.id)} onChange={() => toggleScreen(o.id)} className="accent-indigo-600" />
                {o.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Movimientos permitidos
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Object.entries(PERM_LABELS).map(([k, label]) => (
              <label key={k} className={`flex items-center gap-2 p-3 rounded-2xl border cursor-pointer text-xs font-bold transition ${perms[k] ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-100 text-slate-500'}`}>
                <input type="checkbox" checked={!!perms[k]} onChange={() => togglePerm(k)} className="accent-emerald-600" />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <Btn variant="secondary" onClick={onClose} className="flex-1" type="button">Cancelar</Btn>
          <Btn type="submit" disabled={busy || !name.trim()} className="flex-1">{isNew ? 'Crear rol' : 'Guardar cambios'}</Btn>
        </div>
      </form>
    </Modal>
  );
};
