'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { authService, UserProfile } from '@/lib/services/authService';
import { getProtectedRouteRedirect } from '@/lib/authRouteAccess.mjs';

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
    let profile: UserProfile | null = null;

    try {
      profile = await authService.getCurrentUserProfile();
      setUser(profile);
    } catch {
      // Treat an unavailable profile service as unauthenticated for protected
      // dashboard routes. Backend authorization remains the authoritative gate.
      setUser(null);
    } finally {
      setLoading(false);
    }

    const redirect = getProtectedRouteRedirect(pathname, profile);
    if (redirect) {
      router.replace(redirect);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [pathname]);

  const logout = async () => {
    await authService.signOut();
    setUser(null);

    // Return every role to the public homepage after clearing the session.
    // Replace the protected route so browser back does not immediately reopen it.
    router.replace('/');
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, refreshProfile: fetchProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
