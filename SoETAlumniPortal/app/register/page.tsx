'use client';

import React from 'react';
import Link from 'next/link';
import { GraduationCap, Users, ArrowRight } from 'lucide-react';

export default function RegisterSelectionPage() {
  return (
    <div className="min-h-screen bg-[#F7F4EF] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] bg-[#F28C38]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40rem] h-[40rem] bg-[#4A3832]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center mb-8">
        <div className="w-[72px] h-[72px] bg-white rounded-2xl flex items-center justify-center p-2 shadow-md shadow-[#4A3832]/5 border border-[#DDD7D2] mx-auto mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mgm-university-logo.svg"
            alt="MGM University Logo"
            className="w-full h-full object-contain"
          />
        </div>
        <h2 className="text-3xl font-extrabold text-[#4A3832] tracking-tight">
          Join SOET Connect
        </h2>
        <p className="mt-2 text-sm text-[#6B6B6B] font-medium">
          Select your account type to register
        </p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-xl relative z-10 px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Student Registration Card */}
          <Link
            href="/register/student"
            className="group bg-white hover:bg-[#FBFAF8] border border-[#DDD7D2] hover:border-[#F28C38]/50 p-6 rounded-3xl transition-all duration-200 shadow-lg shadow-[#4A3832]/5 flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-[#F28C38]/15 text-[#F28C38] rounded-2xl flex items-center justify-center mb-4 group-hover:bg-[#F28C38] group-hover:text-white transition-colors">
                <GraduationCap className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#4A3832] mb-2">Student Account</h3>
              <p className="text-xs text-[#6B6B6B] leading-relaxed mb-6">
                Current SOET students can browse the alumni network, apply for jobs & internships, and join events.
              </p>
            </div>
            <div className="flex items-center text-xs font-bold text-[#F28C38] group-hover:text-[#E07D2E] gap-1.5">
              Register as Student <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Alumni Registration Card */}
          <Link
            href="/register/alumni"
            className="group bg-white hover:bg-[#FBFAF8] border border-[#DDD7D2] hover:border-[#F28C38]/50 p-6 rounded-3xl transition-all duration-200 shadow-lg shadow-[#4A3832]/5 flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-[#4A3832]/10 text-[#4A3832] rounded-2xl flex items-center justify-center mb-4 group-hover:bg-[#4A3832] group-hover:text-white transition-colors">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#4A3832] mb-2">Alumni Account</h3>
              <p className="text-xs text-[#6B6B6B] leading-relaxed mb-6">
                Graduates can post job opportunities, host networking events, and connect with fellow alumni.
              </p>
            </div>
            <div className="flex items-center text-xs font-bold text-[#F28C38] group-hover:text-[#E07D2E] gap-1.5">
              Register as Alumni <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-[#6B6B6B]">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-[#F28C38] hover:text-[#E07D2E] transition">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
