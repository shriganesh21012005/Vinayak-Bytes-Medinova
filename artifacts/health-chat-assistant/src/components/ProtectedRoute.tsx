import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/contexts/RoleContext';
import { Stethoscope } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading } = useAuth();
  const { role, setRole } = useRole();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-medical border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isDoctorDashboard = location.pathname === '/doctor-dashboard';
  const isPatientMode = role === 'patient';

  return (
    <>
      {isDoctorDashboard && isPatientMode && (
        <div className="fixed top-16 md:top-20 left-0 right-0 z-40 flex items-center justify-between gap-3 px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/25 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-amber-300 text-sm">
            <Stethoscope className="w-4 h-4 shrink-0" />
            <span>You're viewing the Doctor Dashboard in Patient Mode — switch to Doctor Mode for the full clinical experience.</span>
          </div>
          <button
            onClick={() => setRole('doctor')}
            className="shrink-0 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold hover:bg-amber-500/30 transition-colors"
          >
            Switch Now
          </button>
        </div>
      )}
      {children}
    </>
  );
};

export default ProtectedRoute;
