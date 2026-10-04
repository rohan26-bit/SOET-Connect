'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/services/authService';
import { Shield, GraduationCap, Users, AlertCircle, ArrowRight, Lock, Mail } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<'student' | 'alumni' | 'admin'>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { profile } = await authService.signIn(email.trim(), password, role);
      
      // Role-based routing
      if (profile.role === 'admin') {
        router.push('/admin');
      } else if (profile.role === 'alumni') {
        router.push('/alumni');
      } else {
        router.push('/student');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F4EF] flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
      {/* Subtle Warm Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] bg-[#F28C38]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40rem] h-[40rem] bg-[#4A3832]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center p-2 shadow-md shadow-[#4A3832]/5 border border-[#DDD7D2]">
            <img
              src="/mgm-university-logo.svg"
              alt="MGM University Logo"
              className="w-full h-full object-contain"
            />
          </div>
        </div>
        <h2 className="mt-5 text-center text-3xl font-extrabold text-[#4A3832] tracking-tight">
          SOET Connect
        </h2>
        <p className="mt-2 text-center text-sm text-[#6B6B6B] font-medium">
          Sign in to access your enterprise dashboard
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
        <div className="bg-white py-8 px-6 shadow-xl shadow-[#4A3832]/5 border border-[#DDD7D2] rounded-3xl sm:px-10">
          
          {/* Step 1: Role Selector */}
          <div className="mb-6">
            <label className="block text-xs font-semibold text-[#6B5147] uppercase tracking-wider mb-2">
              Select Your Role
            </label>
            <div className="grid grid-cols-3 gap-2 bg-[#FBFAF8] p-1.5 rounded-2xl border border-[#DDD7D2]">
              <button
                type="button"
                onClick={() => setRole('student')}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  role === 'student'
                    ? 'bg-[#F28C38] text-white shadow-md shadow-[#F28C38]/25'
                    : 'text-[#6B6B6B] hover:text-[#4A3832] hover:bg-[#F7F4EF]'
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5" />
                Student
              </button>
              <button
                type="button"
                onClick={() => setRole('alumni')}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  role === 'alumni'
                    ? 'bg-[#F28C38] text-white shadow-md shadow-[#F28C38]/25'
                    : 'text-[#6B6B6B] hover:text-[#4A3832] hover:bg-[#F7F4EF]'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Alumni
              </button>
              <button
                type="button"
                onClick={() => setRole('admin')}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  role === 'admin'
                    ? 'bg-[#F28C38] text-white shadow-md shadow-[#F28C38]/25'
                    : 'text-[#6B6B6B] hover:text-[#4A3832] hover:bg-[#F7F4EF]'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                Admin
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-red-700 text-xs font-medium animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleLogin}>
            <div>
              <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#888888] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@university.edu"
                  className="block w-full pl-10 pr-4 py-3 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-[#222222] placeholder-[#888888] text-sm focus:outline-none focus:ring-2 focus:ring-[#F28C38] focus:border-[#F28C38] focus:bg-white transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#888888] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-4 py-3 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-[#222222] placeholder-[#888888] text-sm focus:outline-none focus:ring-2 focus:ring-[#F28C38] focus:border-[#F28C38] focus:bg-white transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-[#F28C38] hover:bg-[#E07D2E] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#F28C38] shadow-lg shadow-[#F28C38]/25 transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Authenticating...' : `Sign in as ${role.charAt(0).toUpperCase() + role.slice(1)}`}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="mt-6 text-center border-t border-[#DDD7D2] pt-5">
            <p className="text-xs text-[#6B6B6B]">
              {role === 'admin' ? (
                <>
                  Admin access is restricted to designated administrators.{' '}
                  <Link
                    href="/register/admin"
                    className="font-semibold text-[#F28C38] hover:text-[#E07D2E] transition"
                  >
                    Set up admin account
                  </Link>
                </>
              ) : (
                <>
                  {"Don't have an account? "}
                  <Link
                    href={role === 'student' ? '/register/student' : '/register/alumni'}
                    className="font-semibold text-[#F28C38] hover:text-[#E07D2E] transition"
                  >
                    Register as {role}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
