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

  const [sessionError, setSessionError] = useState<string | null>(null);

  const fetchProfile = async () => {
    setSessionError(null);
    let profile: UserProfile | null = null;

    try {
      profile = await authService.getCurrentUserProfile();
      setUser(profile);
    } catch {
      // A network or server failure does not prove the session is invalid.
      // Preserve any previously loaded user and keep protected content gated
      // behind a retry screen instead of redirecting to the login page.
      setSessionError('We could not verify your session because the server is temporarily unavailable. Your sign-in has not been cleared. Check your connection and retry.');
      setLoading(false);
      return;
    }

    setLoading(false);

    // getCurrentUserProfile returns null only for an explicit 401 response.
    // Keep the normal redirect for genuinely expired or missing sessions.
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
      {sessionError && getProtectedRouteRedirect(pathname, null) ? (
        <main className="flex min-h-screen items-center justify-center bg-[#F7F4EF] px-4 py-10">
          <section role="alert" className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-7 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
              <span aria-hidden="true" className="text-2xl">!</span>
            </div>
            <h1 className="text-lg font-black text-[#4A3832]">Unable to verify your session</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{sessionError}</p>
            <button
              type="button"
              onClick={() => { setLoading(true); void fetchProfile(); }}
              disabled={loading}
              className="mt-6 w-full rounded-xl bg-[#F28C38] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#E07D2E] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Checking session…' : 'Retry'}
            </button>
            <button
              type="button"
              onClick={() => { void logout(); }}
              className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Sign out
            </button>
          </section>
        </main>
      ) : children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
