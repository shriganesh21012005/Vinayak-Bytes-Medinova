import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  bloodGroup: string | null;
  preferredLanguage: string;
  avatar: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<Pick<AuthUser, 'name' | 'phone' | 'bloodGroup' | 'preferredLanguage' | 'avatar'>>) => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_BASE = '/api';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback((token: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(async () => {
      await refreshAccessToken();
    }, 13 * 60 * 1000);
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        setUser(null);
        setAccessToken(null);
        return null;
      }
      const data = await res.json() as { accessToken: string };
      setAccessToken(data.accessToken);
      scheduleRefresh(data.accessToken);
      return data.accessToken;
    } catch {
      setUser(null);
      setAccessToken(null);
      return null;
    }
  }, [scheduleRefresh]);

  useEffect(() => {
    const init = async () => {
      const newToken = await refreshAccessToken();
      if (newToken) {
        try {
          const res = await fetch(`${API_BASE}/auth/me`, {
            headers: { Authorization: `Bearer ${newToken}` },
            credentials: 'include',
          });
          if (res.ok) {
            const userData = await res.json() as AuthUser;
            setUser(userData);
          }
        } catch {
          setUser(null);
        }
      }
      setIsLoading(false);
    };
    init();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json() as { error: string };
      throw new Error(err.error ?? 'Login failed');
    }

    const data = await res.json() as { accessToken: string; user: AuthUser };
    setAccessToken(data.accessToken);
    setUser(data.user);
    scheduleRefresh(data.accessToken);
  }, [scheduleRefresh]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, email, password }),
    });

    if (!res.ok) {
      const err = await res.json() as { error: string };
      throw new Error(err.error ?? 'Registration failed');
    }

    const data = await res.json() as { accessToken: string; user: AuthUser };
    setAccessToken(data.accessToken);
    setUser(data.user);
    scheduleRefresh(data.accessToken);
  }, [scheduleRefresh]);

  const logout = useCallback(async () => {
    try {
      if (accessToken) {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: 'include',
        });
      }
    } catch {
    } finally {
      setUser(null);
      setAccessToken(null);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    }
  }, [accessToken]);

  const updateProfile = useCallback(async (data: Partial<Pick<AuthUser, 'name' | 'phone' | 'bloodGroup' | 'preferredLanguage' | 'avatar'>>) => {
    const token = accessToken ?? await refreshAccessToken();
    if (!token) throw new Error('Not authenticated');

    const res = await fetch(`${API_BASE}/auth/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json() as { error: string };
      throw new Error(err.error ?? 'Profile update failed');
    }

    const updated = await res.json() as AuthUser;
    setUser(updated);
  }, [accessToken, refreshAccessToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        isAuthenticated: !!user && !!accessToken,
        login,
        register,
        logout,
        updateProfile,
        refreshAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
