'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { authService, UserProfile } from '@/lib/services/authService';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
  refreshProfile: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const fetchProfile = async () => {
    try {
      const profile = await authService.getCurrentUserProfile();
      setUser(profile);

      // Route protection check
      if (!profile) {
        if (
          pathname.startsWith('/student') ||
          pathname.startsWith('/alumni') ||
          pathname.startsWith('/admin')
        ) {
          router.push('/login');
        }
      } else {
        // Enforce role isolation
        if (pathname.startsWith('/admin') && profile.role !== 'admin') {
          router.push(profile.role === 'alumni' ? '/alumni' : '/student');
        } else if (pathname.startsWith('/alumni') && profile.role !== 'alumni' && profile.role !== 'admin') {
          router.push('/student');
        }
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [pathname]);

  const logout = async () => {
    await authService.signOut();
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, refreshProfile: fetchProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
