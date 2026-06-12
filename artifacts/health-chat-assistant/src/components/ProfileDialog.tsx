import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Upload, LogOut, Loader2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';

const ProfileDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const { toast } = useToast();
  const { user, isAuthenticated, updateProfile, logout } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (open && user) {
      setName(user.name ?? '');
      setPhone(user.phone ?? '');
      setBloodGroup(user.bloodGroup ?? '');
      setAvatar(user.avatar ?? null);
    }
  }, [open, user]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setAvatar(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateProfile({ name, phone, bloodGroup, avatar: avatar ?? undefined });
      toast({ title: "Profile updated", description: "Your profile has been saved." });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Could not save profile",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      onOpenChange(false);
      toast({ title: "Logged out", description: "See you next time!" });
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Your Account</DialogTitle>
            <DialogDescription>Sign in to access your health profile.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-4">
            <Button asChild className="bg-medical hover:bg-medical-dark">
              <Link to="/login" onClick={() => onOpenChange(false)}>Login</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/signup" onClick={() => onOpenChange(false)}>Create Account</Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Your Profile</DialogTitle>
          <DialogDescription>
            Update your profile information.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <Avatar className="w-24 h-24">
                {avatar ? (
                  <AvatarImage src={avatar} alt="Profile" />
                ) : (
                  <AvatarFallback className="bg-medical text-white text-xl">
                    {user?.name?.charAt(0).toUpperCase() ?? <User className="w-10 h-10" />}
                  </AvatarFallback>
                )}
              </Avatar>
              <label
                htmlFor="avatar-upload"
                className="absolute bottom-0 right-0 bg-medical text-white p-1.5 rounded-full cursor-pointer hover:bg-medical-dark transition-colors"
              >
                <Upload className="w-4 h-4" />
                <input id="avatar-upload" type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">Full Name</label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" required />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <Input value={user?.email ?? ''} disabled className="text-muted-foreground" />
          </div>

          <div className="space-y-2">
            <label htmlFor="phone" className="text-sm font-medium">Phone</label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 234 567 8900" />
          </div>

          <div className="space-y-2">
            <label htmlFor="bloodGroup" className="text-sm font-medium">Blood Group</label>
            <Input id="bloodGroup" value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} placeholder="A+, B-, O+..." />
          </div>

          <div className="flex justify-between items-center pt-4">
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LogOut className="h-4 w-4 mr-2" />}
              Logout
            </Button>
            <Button type="submit" className="bg-medical hover:bg-medical-dark" disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isSaving ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProfileDialog;
