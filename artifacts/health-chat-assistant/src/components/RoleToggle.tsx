import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Stethoscope, User } from 'lucide-react';
import { useRole } from '@/contexts/RoleContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';

export default function RoleToggle() {
  const { role, setRole } = useRole();
  const navigate = useNavigate();
  const location = useLocation();
  const isDoctor = role === 'doctor';

  const toggle = () => {
    const next = isDoctor ? 'patient' : 'doctor';
    setRole(next);

    if (next === 'doctor') {
      toast.success('Switched to Doctor Mode', {
        description: 'Viewing clinical dashboard',
        duration: 2500,
        icon: <Stethoscope className="w-4 h-4" />,
      });
      navigate('/doctor-dashboard');
    } else {
      toast.success('Switched to Patient Mode', {
        description: 'Back to your personal health view',
        duration: 2500,
        icon: <User className="w-4 h-4" />,
      });
      if (location.pathname === '/doctor-dashboard') {
        navigate('/');
      }
    }
  };

  return (
    <motion.button
      onClick={toggle}
      whileTap={{ scale: 0.95 }}
      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-300 cursor-pointer select-none ${
        isDoctor
          ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25'
          : 'bg-white/8 border-white/15 text-white/70 hover:bg-white/15 hover:text-white'
      }`}
      title={isDoctor ? 'Switch to Patient View' : 'Switch to Doctor View'}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDoctor ? (
          <motion.span
            key="doctor"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1.5"
          >
            <Stethoscope className="w-3.5 h-3.5" />
            Doctor View
          </motion.span>
        ) : (
          <motion.span
            key="patient"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1.5"
          >
            <User className="w-3.5 h-3.5" />
            Patient View
          </motion.span>
        )}
      </AnimatePresence>

      {/* Active indicator dot */}
      <span className={`w-1.5 h-1.5 rounded-full ${isDoctor ? 'bg-cyan-400' : 'bg-white/40'}`} />
    </motion.button>
  );
}
