// ============================================================================
// DineroYa — Equipo (solo admin): usuarios y roles
// ============================================================================
import React, { useState } from 'react';
import { Users, ShieldCheck, UserCog, Power } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls, EmptyState } from '../components/ui';
import { UserRole } from '../types';

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

export const TeamPage: React.FC = () => {
  const { profiles, updateProfileRole, toggleProfileActive } = useData();
  const { user } = useAuth();
  const [roleModal, setRoleModal] = useState<{ userId: string; current: UserRole } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Equipo"
        subtitle="Usuarios del sistema y sus roles de acceso"
      />

      {profiles.length === 0 ? (
        <EmptyState icon={Users} title="Sin usuarios" hint="Los usuarios aparecen al registrarse en el sistema." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {profiles.map(p => (
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
                <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg tracking-wider shrink-0 ${ROLE_STYLE[p.role]}`}>
                  {ROLE_LABELS[p.role]}
                </span>
              </div>

              <p className="text-xs text-slate-500 font-medium mb-5 leading-relaxed">{ROLE_HELP[p.role]}</p>

              <div className="flex gap-2">
                <Btn
                  variant="secondary"
                  onClick={() => setRoleModal({ userId: p.id, current: p.role })}
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
          ))}
        </div>
      )}

      {roleModal && (
        <RoleModal
          current={roleModal.current}
          onSave={async (role) => { setBusy(true); try { await updateProfileRole(roleModal.userId, role); setRoleModal(null); } finally { setBusy(false); } }}
          onClose={() => setRoleModal(null)}
          busy={busy}
        />
      )}
    </div>
  );
};

const RoleModal: React.FC<{
  current: UserRole; onSave: (r: UserRole) => void; onClose: () => void; busy: boolean;
}> = ({ current, onSave, onClose, busy }) => {
  const [role, setRole] = useState<UserRole>(current);
  return (
    <Modal title="Cambiar rol" subtitle={ROLE_HELP[role]} onClose={onClose}>
      <div className="flex flex-col gap-5">
        <Field label="Nuevo rol">
          <select value={role} onChange={e => setRole(e.target.value as UserRole)} className={inputCls}>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <div className="bg-slate-50 rounded-2xl p-4 flex items-start gap-3 border border-slate-100">
          <ShieldCheck className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500 font-medium">{ROLE_HELP[role]}</p>
        </div>
        <div className="flex gap-3">
          <Btn variant="secondary" onClick={onClose} className="flex-1">Cancelar</Btn>
          <Btn onClick={() => onSave(role)} disabled={busy || role === current} className="flex-1">Guardar</Btn>
        </div>
      </div>
    </Modal>
  );
};
