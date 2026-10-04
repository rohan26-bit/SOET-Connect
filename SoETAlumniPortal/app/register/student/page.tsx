'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { authService } from '@/lib/services/authService';
import { GraduationCap, AlertCircle, ArrowRight, ShieldAlert } from 'lucide-react';

const DEPARTMENTS = [
  'Computer Engineering',
  'Information Technology',
  'Artificial Intelligence & Data Science',
  'Electronics & Telecommunication',
  'Mechanical Engineering',
  'Civil Engineering',
  'Electrical Engineering'
];

export default function StudentRegisterPage() {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    studentId: '',
    department: 'Computer Engineering',
    course: 'B.Tech',
    academicYear: '3rd Year',
    graduationYear: '2026',
    phone: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

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
      await authService.registerStudent({
        ...formData,
        fullName: trimmedName,
      });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F4EF] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans relative overflow-hidden">
      <div className="sm:mx-auto sm:w-full sm:max-w-xl relative z-10">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 bg-[#F28C38]/15 border border-[#F28C38]/30 rounded-2xl flex items-center justify-center text-[#F28C38]">
            <GraduationCap className="w-6 h-6" />
          </div>
        </div>
        <h2 className="text-center text-3xl font-extrabold text-[#4A3832] tracking-tight">
          Student Registration
        </h2>
        <p className="mt-2 text-center text-sm text-[#6B6B6B]">
          Create your SOET student profile to connect with alumni and job opportunities
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl relative z-10 px-4">
        <div className="bg-white py-8 px-6 shadow-xl shadow-[#4A3832]/5 border border-[#DDD7D2] rounded-3xl sm:px-10">
          
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-red-700 text-xs font-medium">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {submitted ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-amber-500/10 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-[#4A3832] mb-2">Registration Submitted for Verification</h3>
              <p className="text-sm text-[#6B6B6B] max-w-md mx-auto mb-6 leading-relaxed">
                Thank you for registering! Your student account is currently <span className="text-amber-600 font-bold">Pending Admin Verification</span>. Once verified by the department administrator, you will be able to sign in and access the SOET Connect portal.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#F28C38] hover:bg-[#E07D2E] text-white text-sm font-bold rounded-xl shadow-lg shadow-[#F28C38]/25 transition"
              >
                Return to Sign In <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-1.5">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-[#222222] text-sm focus:ring-2 focus:ring-[#F28C38] focus:border-[#F28C38] focus:bg-white outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-1.5">
                    Student ID / PRN *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.studentId}
                    onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                    placeholder="e.g. SOET2023001"
                    className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-[#222222] text-sm focus:ring-2 focus:ring-[#F28C38] focus:border-[#F28C38] focus:bg-white outline-none transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-1.5">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="student@university.edu"
                    className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-[#222222] text-sm focus:ring-2 focus:ring-[#F28C38] focus:border-[#F28C38] focus:bg-white outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-1.5">
                    Password *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Min 8 characters"
                    className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-[#222222] text-sm focus:ring-2 focus:ring-[#F28C38] focus:border-[#F28C38] focus:bg-white outline-none transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-1.5">
                    Department *
                  </label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-[#222222] text-sm focus:ring-2 focus:ring-[#F28C38] focus:border-[#F28C38] focus:bg-white outline-none transition"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-1.5">
                    Course *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.course}
                    onChange={(e) => setFormData({ ...formData, course: e.target.value })}
                    placeholder="e.g. B.Tech"
                    className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-[#222222] text-sm focus:ring-2 focus:ring-[#F28C38] focus:border-[#F28C38] focus:bg-white outline-none transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-1.5">
                    Academic Year
                  </label>
                  <select
                    value={formData.academicYear}
                    onChange={(e) => setFormData({ ...formData, academicYear: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-[#222222] text-sm focus:ring-2 focus:ring-[#F28C38] focus:border-[#F28C38] focus:bg-white outline-none transition"
                  >
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-1.5">
                    Graduation Year *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.graduationYear}
                    onChange={(e) => setFormData({ ...formData, graduationYear: e.target.value })}
                    placeholder="e.g. 2026"
                    className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-[#222222] text-sm focus:ring-2 focus:ring-[#F28C38] focus:border-[#F28C38] focus:bg-white outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-1.5">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+91 9876543210"
                    className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-[#222222] text-sm focus:ring-2 focus:ring-[#F28C38] focus:border-[#F28C38] focus:bg-white outline-none transition"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-[#F28C38] hover:bg-[#E07D2E] focus:ring-2 focus:ring-[#F28C38] shadow-lg shadow-[#F28C38]/25 transition disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Creating Student Account...' : 'Complete Student Registration'}
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 text-center border-t border-[#DDD7D2] pt-5">
            <p className="text-xs text-[#6B6B6B]">
              Already have an account?{' '}
              <Link href="/login" className="font-semibold text-[#F28C38] hover:text-[#E07D2E] transition">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
