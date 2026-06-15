import React, { createContext, useContext, useState, useCallback } from 'react';

export type AppRole = 'patient' | 'doctor';

interface RoleContextValue {
  role: AppRole;
  setRole: (role: AppRole) => void;
  isDoctor: boolean;
}

const STORAGE_KEY = 'medinova_role';

function getSavedRole(): AppRole {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'doctor' || saved === 'patient') return saved;
  } catch {}
  return 'patient';
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<AppRole>(getSavedRole);

  const setRole = useCallback((newRole: AppRole) => {
    setRoleState(newRole);
    try {
      localStorage.setItem(STORAGE_KEY, newRole);
    } catch {}
  }, []);

  return (
    <RoleContext.Provider value={{ role, setRole, isDoctor: role === 'doctor' }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within RoleProvider');
  return ctx;
}
