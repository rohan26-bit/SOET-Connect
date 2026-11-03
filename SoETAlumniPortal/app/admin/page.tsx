'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { adminService, AdminMetrics } from '@/lib/services/adminService';
import {
  Users, GraduationCap, Briefcase, Calendar,
} from 'lucide-react';

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<AdminMetrics>({
    totalStudents: 0,
    pendingStudents: 0,
    totalAlumni: 0,
    verifiedAlumni: 0,
    pendingAlumni: 0,
    totalJobs: 0,
    pendingJobs: 0,
    totalEvents: 0,
    pendingEvents: 0,
    totalApplications: 0,
    totalRegistrations: 0,
  });
  useEffect(() => {
    let isMounted = true;
    async function loadMetrics() {
      try {
        const data = await adminService.getDashboardMetrics();
        if (isMounted) setMetrics(data);
      } catch (err) {
        console.error('Failed to load admin metrics:', err);
      }
    }
    loadMetrics();
    return () => {
      isMounted = false;
    };
  }, []);

  const approvedStudents = (metrics.totalStudents || 0) - (metrics.pendingStudents || 0);
  const pendingStudents = metrics.pendingStudents || 0;

  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-[#6B6B6B] mb-6 uppercase tracking-wider">
        <span>SOET Connect - Alumni Portal</span>
        <span className="mx-2 text-[#DDD7D2]">/</span>
        <span className="text-[#F28C38]">Admin Dashboard</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-[#4A3832] tracking-tight">Admin Console</h1>
          <p className="text-xs text-[#6B6B6B] mt-1">
            A snapshot of platform activity and growth.
          </p>
        </div>
      </div>

      {/* Dynamic Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 mb-8">
        
        {/* Total Students */}
        <div className="bg-white p-7 md:p-8 min-h-[220px] rounded-3xl border border-[#DDD7D2] shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Total Students</span>
            <div className="w-12 h-12 bg-[#F28C38]/10 text-[#F28C38] rounded-xl flex items-center justify-center">
              <GraduationCap className="w-6 h-6" />
            </div>
          </div>
          <div>
            <div className="text-4xl font-black text-[#4A3832]">{metrics.totalStudents}</div>
            <p className="text-[11px] text-blue-600 font-bold mt-1">
              {approvedStudents} Verified • {pendingStudents} Pending
            </p>
          </div>
        </div>

        {/* Total Alumni */}
        <div className="bg-white p-7 md:p-8 min-h-[220px] rounded-3xl border border-[#DDD7D2] shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Total Alumni</span>
            <div className="w-12 h-12 bg-[#4A3832]/10 text-[#4A3832] rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
          </div>
          <div>
            <div className="text-4xl font-black text-[#4A3832]">{metrics.totalAlumni}</div>
            <p className="text-[11px] text-emerald-600 font-bold mt-1">
              {metrics.verifiedAlumni} Verified • {metrics.pendingAlumni} Pending
            </p>
          </div>
        </div>

        {/* Jobs Posted */}
        <div className="bg-white p-7 md:p-8 min-h-[220px] rounded-3xl border border-[#DDD7D2] shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Jobs & Internships</span>
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <Briefcase className="w-6 h-6" />
            </div>
          </div>
          <div>
            <div className="text-4xl font-black text-[#4A3832]">{metrics.totalJobs}</div>
            <p className="text-[11px] text-[#6B6B6B] mt-1">
              {metrics.pendingJobs > 0 ? (
                <span className="text-amber-600 font-bold">{metrics.pendingJobs} Pending Approval</span>
              ) : (
                'All approved'
              )}
            </p>
          </div>
        </div>

        {/* Events */}
        <div className="bg-white p-7 md:p-8 min-h-[220px] rounded-3xl border border-[#DDD7D2] shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Campus Events</span>
            <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
              <Calendar className="w-6 h-6" />
            </div>
          </div>
          <div>
            <div className="text-4xl font-black text-[#4A3832]">{metrics.totalEvents}</div>
            <p className="text-[11px] text-[#6B6B6B] mt-1">{metrics.totalRegistrations} total registrations</p>
          </div>
        </div>

      </div>

    </DashboardLayout>
  );
}
