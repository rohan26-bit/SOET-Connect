'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { adminService, AdminMetrics } from '@/lib/services/adminService';
import { 
  Users, GraduationCap, ShieldAlert, Briefcase, 
  Calendar, ArrowRight, ShieldCheck, FileCheck, UserCheck 
} from 'lucide-react';

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<AdminMetrics>({
    totalStudents: 0,
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMetrics() {
      try {
        const data = await adminService.getDashboardMetrics();
        setMetrics(data);
      } catch (err) {
        console.error('Failed to load admin metrics:', err);
      } finally {
        setLoading(false);
      }
    }
    loadMetrics();
  }, []);

  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-slate-400 mb-6 uppercase tracking-wider">
        <span>Administration</span>
        <span className="mx-2 text-slate-300">/</span>
        <span className="text-blue-600">Executive Overview</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">SOET Connect Admin Console</h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time platform metrics, verification queue, and moderations.
          </p>
        </div>
      </div>

      {/* Action Banners */}
      {metrics.pendingAlumni > 0 && (
        <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-amber-900">
                {metrics.pendingAlumni} Alumni Pending Verification
              </h4>
              <p className="text-xs text-amber-700">New graduate registrations awaiting your authorization.</p>
            </div>
          </div>
          <Link
            href="/admin/verify"
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl shadow-md transition self-start sm:self-auto"
          >
            Review Queue →
          </Link>
        </div>
      )}

      {/* Dynamic Statistics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        
        {/* Total Students */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Students</span>
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">{metrics.totalStudents}</div>
            <p className="text-[11px] text-slate-500 mt-1">Enrolled & registered</p>
          </div>
        </div>

        {/* Total Alumni */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Alumni</span>
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">{metrics.totalAlumni}</div>
            <p className="text-[11px] text-emerald-600 font-bold mt-1">
              {metrics.verifiedAlumni} Verified • {metrics.pendingAlumni} Pending
            </p>
          </div>
        </div>

        {/* Jobs Posted */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Jobs & Internships</span>
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <Briefcase className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">{metrics.totalJobs}</div>
            <p className="text-[11px] text-slate-500 mt-1">
              {metrics.pendingJobs > 0 ? (
                <span className="text-amber-600 font-bold">{metrics.pendingJobs} Pending Approval</span>
              ) : (
                'All approved'
              )}
            </p>
          </div>
        </div>

        {/* Events */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Campus Events</span>
            <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">{metrics.totalEvents}</div>
            <p className="text-[11px] text-slate-500 mt-1">{metrics.totalRegistrations} total registrations</p>
          </div>
        </div>

      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        <Link
          href="/admin/verify"
          className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-300 transition group flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center mb-4">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Alumni Verification</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Verify credentials, batch graduation records, and authorize newly registered alumni.
            </p>
          </div>
          <div className="mt-4 flex items-center text-xs font-bold text-blue-600 group-hover:translate-x-1 transition-transform">
            Open Queue →
          </div>
        </Link>

        <Link
          href="/admin/students"
          className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-300 transition group flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center mb-4">
              <UserCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Students Management</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Browse student directory, check department enrollments, and manage account statuses.
            </p>
          </div>
          <div className="mt-4 flex items-center text-xs font-bold text-blue-600 group-hover:translate-x-1 transition-transform">
            View Students →
          </div>
        </Link>

        <Link
          href="/admin/jobs"
          className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-300 transition group flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center mb-4">
              <FileCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Job Approvals</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Moderate and approve career opportunities posted by alumni before they go live.
            </p>
          </div>
          <div className="mt-4 flex items-center text-xs font-bold text-blue-600 group-hover:translate-x-1 transition-transform">
            Review Jobs →
          </div>
        </Link>

      </div>
    </DashboardLayout>
  );
}
