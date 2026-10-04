'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/services/authService';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { ButtonSpinner } from '@/components/LoadingState';

export default function AdminRegisterPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    adminSecret: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = formData.fullName.trim();
    if (trimmedName.length < 2) {
      setError('Full name must be at least 2 characters long.');
      return;
    }

    setLoading(true);

    try {
      await authService.registerAdmin({
        fullName: trimmedName,
        email: formData.email,
        password: formData.password,
        adminSecret: formData.adminSecret,
      });

      setSuccess(true);

      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Admin registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F4EF] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] bg-[#F28C38]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40rem] h-[40rem] bg-[#4A3832]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center mb-4">
          <div className="w-[72px] h-[72px] bg-white rounded-2xl flex items-center justify-center p-2 shadow-md shadow-[#4A3832]/5 border border-[#DDD7D2]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/mgm-university-logo.svg"
              alt="MGM University Logo"
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        <h2 className="text-center text-3xl font-extrabold text-[#4A3832] tracking-tight">
          Admin Registration
        </h2>

        <p className="mt-2 text-center text-sm text-[#6B6B6B] font-medium">
          Create an administrator account with the secret key
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
        <div className="bg-white py-8 px-6 shadow-xl shadow-[#4A3832]/5 border border-[#DDD7D2] rounded-3xl sm:px-10">

          {success ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />

              <h3 className="text-lg font-bold text-[#4A3832] mb-1">
                Admin Account Created!
              </h3>

              <p className="text-sm text-[#6B6B6B]">
                Redirecting to login...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">

              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />

                  <p className="text-xs text-red-700 font-medium">
                    {error}
                  </p>
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-1.5">
                  Full Name *
                </label>

                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      fullName: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-sm text-[#222222] placeholder:text-[#888888] focus:ring-2 focus:ring-[#F28C38] focus:border-[#F28C38] focus:bg-white transition"
                  placeholder="Admin Name"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-1.5">
                  Email Address *
                </label>

                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      email: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-sm text-[#222222] placeholder:text-[#888888] focus:ring-2 focus:ring-[#F28C38] focus:border-[#F28C38] focus:bg-white transition"
                  placeholder="admin@soet.edu"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-1.5">
                  Password *
                </label>

                <input
                  type="password"
                  required
                  minLength={8}
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      password: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-sm text-[#222222] placeholder:text-[#888888] focus:ring-2 focus:ring-[#F28C38] focus:border-[#F28C38] focus:bg-white transition"
                  placeholder="••••••••"
                />
              </div>

              {/* Admin Secret */}
              <div>
                <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-1.5">
                  Admin Secret *
                </label>

                <input
                  type="password"
                  required
                  value={formData.adminSecret}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      adminSecret: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-sm text-[#222222] placeholder:text-[#888888] focus:ring-2 focus:ring-[#F28C38] focus:border-[#F28C38] focus:bg-white transition"
                  placeholder="Enter administrator secret"
                  autoComplete="off"
                />

                <p className="mt-1.5 text-[11px] text-[#6B6B6B]">
                  Required to authorize administrator account creation.
                </p>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl text-sm font-bold text-white bg-[#F28C38] hover:bg-[#E07D2E] focus:ring-2 focus:ring-[#F28C38] transition-all shadow-lg shadow-[#F28C38]/25 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <ButtonSpinner className="text-white" />
                    <span>Creating Admin Account...</span>
                  </>
                ) : (
                  <>
                    <span>Create Admin Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

            </form>
          )}

          <div className="mt-6 text-center border-t border-[#DDD7D2] pt-5">
            <p className="text-xs text-[#6B6B6B]">
              Already have an account?{' '}

              <Link
                href="/login"
                className="font-semibold text-[#F28C38] hover:text-[#E07D2E] transition"
              >
                Sign in
              </Link>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}