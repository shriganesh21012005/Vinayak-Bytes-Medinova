import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Phone, Home, Users, Hospital, Ambulance, Heart, HeartPulse, Brain } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import ProfileButton from '@/components/ProfileButton';

const navLinks = [
  { name: 'Home', path: '/', icon: Home },
  { name: 'Doctors', path: '/doctors', icon: Users },
  { name: 'Hospital', path: '/hospital', icon: Hospital },
  { name: 'Ambulance', path: '/ambulance', icon: Ambulance },
  { name: 'PharmCare', path: '/medicare', icon: HeartPulse },
  { name: 'PathoCare', path: '/pathocare', icon: Heart },
  { name: 'My Health', path: '/health-memory', icon: Brain },
  { name: 'Support For Them', path: '/support', icon: Users },
];

const NavigationHeader = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 10;
      if (isScrolled !== scrolled) {
        setScrolled(isScrolled);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [scrolled]);

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled 
          ? 'bg-background/90 backdrop-blur-xl shadow-md border-b border-white/10' 
          : 'bg-gradient-to-b from-black/70 to-transparent backdrop-blur-sm'
      }`}
    >
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-16 md:h-20">
          <Link to="/" className="flex items-center space-x-2">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {/* Logo */}
              <div className="flex items-center">
                <img 
                  src="/lovable-uploads/bd581a3b-d5d7-4a97-a9f6-f1428048cecc.png" 
                  alt="Medi Nova Logo" 
                  className="h-12 mr-2" 
                />
              </div>
            </motion.div>
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => (
              <motion.div
                key={link.name}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Link
                  to={link.path}
                  className="px-3 py-2 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors flex items-center"
                >
                  <link.icon className="w-4 h-4 mr-1" />
                  {link.name}
                </Link>
              </motion.div>
            ))}
            
            {/* Profile Button */}
            <div className="ml-2">
              <ProfileButton />
            </div>
            
            {/* Theme Toggle */}
            <motion.div className="ml-2">
              <ThemeToggle />
            </motion.div>
            
            {/* Helpline Button - Changed from blue to primary color */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="ml-2"
              id="helpline-button"
            >
              <Button className="bg-primary hover:bg-primary/90 flex items-center">
                <a href="tel:+1234567890" className="flex items-center">
                  <Phone className="w-4 h-4 mr-2" />
                  24/7 Helpline
                </a>
              </Button>
            </motion.div>
          </nav>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center gap-2">
            <ProfileButton />
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-white"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile navigation */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-background/95 backdrop-blur-lg shadow-lg"
          >
            <div className="container mx-auto px-6 py-4 space-y-2">
              {navLinks.map((link) => (
                <motion.div
                  key={link.name}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * navLinks.indexOf(link) }}
                >
                  <Link
                    to={link.path}
                    className="block py-3 text-foreground hover:text-medical transition-colors flex items-center"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <link.icon className="w-4 h-4 mr-2" />
                    {link.name}
                  </Link>
                </motion.div>
              ))}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
                className="pt-2"
                id="mobile-helpline-button"
              >
                {/* Mobile helpline button - changed to primary color */}
                <Button className="w-full bg-primary hover:bg-primary/90 flex items-center justify-center">
                  <a href="tel:+1234567890" className="flex items-center justify-center w-full">
                    <Phone className="w-4 h-4 mr-2" />
                    24/7 Helpline
                  </a>
                </Button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
};

export default NavigationHeader;
