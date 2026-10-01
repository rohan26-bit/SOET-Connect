'use client';

import React from 'react';
import Link from 'next/link';
import { GraduationCap, Users, ArrowRight } from 'lucide-react';

export default function RegisterSelectionPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40rem] h-[40rem] bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center mb-8">
        <div className="w-14 h-14 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-xl shadow-blue-500/25 border border-blue-400/20 mx-auto mb-4">
          SP
        </div>
        <h2 className="text-3xl font-extrabold text-white tracking-tight">
          Join SOET Connect
        </h2>
        <p className="mt-2 text-sm text-slate-400 font-medium">
          Select your account type to register
        </p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-xl relative z-10 px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Student Registration Card */}
          <Link
            href="/register/student"
            className="group bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-blue-500/50 p-6 rounded-3xl transition-all duration-200 shadow-xl flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-blue-600/20 text-blue-400 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <GraduationCap className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Student Account</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Current SOET students can browse the alumni network, apply for jobs & internships, and join events.
              </p>
            </div>
            <div className="flex items-center text-xs font-bold text-blue-400 group-hover:text-blue-300 gap-1.5">
              Register as Student <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Alumni Registration Card */}
          <Link
            href="/register/alumni"
            className="group bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-blue-500/50 p-6 rounded-3xl transition-all duration-200 shadow-xl flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Alumni Account</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Graduates can post job opportunities, host networking events, and connect with fellow alumni.
              </p>
            </div>
            <div className="flex items-center text-xs font-bold text-indigo-400 group-hover:text-indigo-300 gap-1.5">
              Register as Alumni <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-slate-400">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-blue-400 hover:text-blue-300 transition">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
