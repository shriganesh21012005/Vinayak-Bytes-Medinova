import React, { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ProfileDialog from './ProfileDialog';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';

const ProfileButton = () => {
  const [profileOpen, setProfileOpen] = useState(false);
  const { user } = useAuth();

  return (
    <>
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Button
          onClick={() => setProfileOpen(true)}
          variant="ghost"
          className="p-1 h-10 w-10 rounded-full"
        >
          <Avatar className="h-9 w-9">
            {user?.avatar ? (
              <AvatarImage src={user.avatar} alt={user.name} />
            ) : (
              <AvatarFallback className="bg-medical text-white">
                {user?.name ? (
                  <span className="text-sm font-semibold">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <User className="h-5 w-5" />
                )}
              </AvatarFallback>
            )}
          </Avatar>
        </Button>
      </motion.div>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
};

export default ProfileButton;
