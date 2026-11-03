'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { adminService, AdminMetrics } from '@/lib/services/adminService';
import { 
  Users, GraduationCap, Briefcase, Calendar,
  ArrowRight, ShieldCheck, FileCheck
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadMetrics() {
      try {
        const data = await adminService.getDashboardMetrics();
        if (isMounted) setMetrics(data);
      } catch (err) {
        console.error('Failed to load admin metrics:', err);
      } finally {
        if (isMounted) setLoading(false);
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
            Platform metrics, verification queue, and moderations.
          </p>
        </div>
      </div>

      {/* Dynamic Statistics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        
        {/* Total Students */}
        <div className="bg-white p-6 rounded-3xl border border-[#DDD7D2] shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Total Students</span>
            <div className="w-10 h-10 bg-[#F28C38]/10 text-[#F28C38] rounded-xl flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-[#4A3832]">{metrics.totalStudents}</div>
            <p className="text-[11px] text-blue-600 font-bold mt-1">
              {approvedStudents} Verified • {pendingStudents} Pending
            </p>
          </div>
        </div>

        {/* Total Alumni */}
        <div className="bg-white p-6 rounded-3xl border border-[#DDD7D2] shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Total Alumni</span>
            <div className="w-10 h-10 bg-[#4A3832]/10 text-[#4A3832] rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-[#4A3832]">{metrics.totalAlumni}</div>
            <p className="text-[11px] text-emerald-600 font-bold mt-1">
              {metrics.verifiedAlumni} Verified • {metrics.pendingAlumni} Pending
            </p>
          </div>
        </div>

        {/* Jobs Posted */}
        <div className="bg-white p-6 rounded-3xl border border-[#DDD7D2] shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Jobs & Internships</span>
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <Briefcase className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-[#4A3832]">{metrics.totalJobs}</div>
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
        <div className="bg-white p-6 rounded-3xl border border-[#DDD7D2] shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Campus Events</span>
            <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-[#4A3832]">{metrics.totalEvents}</div>
            <p className="text-[11px] text-[#6B6B6B] mt-1">{metrics.totalRegistrations} total registrations</p>
          </div>
        </div>

      </div>

      {/* Consolidated Pending Approvals */}
      {(() => {
        const pendingApprovalItems = [
          {
            title: 'Alumni Verification',
            description: 'Review newly registered alumni and verify their credentials.',
            count: metrics.pendingAlumni || 0,
            href: '/admin/verify',
            icon: ShieldCheck,
            iconStyle: 'bg-[#F28C38]/10 text-[#F28C38]',
          },
          {
            title: 'Student Verification',
            description: 'Review student registration and enrollment requests.',
            count: pendingStudents,
            href: '/admin/students',
            icon: GraduationCap,
            iconStyle: 'bg-[#4A3832]/10 text-[#4A3832]',
          },
          {
            title: 'Job Approvals',
            description: 'Review career opportunities submitted by alumni.',
            count: metrics.pendingJobs || 0,
            href: '/admin/jobs',
            icon: FileCheck,
            iconStyle: 'bg-emerald-50 text-emerald-600',
          },
        ];
        const totalPendingApprovals = pendingApprovalItems.reduce(
          (total, item) => total + item.count,
          0
        );

        return (
          <section
            aria-labelledby="pending-approvals-heading"
            className="bg-white p-6 md:p-7 rounded-3xl border border-[#DDD7D2] shadow-sm"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <h2 id="pending-approvals-heading" className="text-base font-bold text-[#4A3832]">
                  Pending Approvals
                </h2>
                <p className="text-xs text-[#6B6B6B] mt-1">
                  A single view of requests that need administrator attention.
                </p>
              </div>
              <span
                className={`inline-flex items-center self-start sm:self-auto rounded-full px-3 py-1.5 text-xs font-bold ${
                  loading
                    ? 'bg-gray-100 text-gray-600'
                    : totalPendingApprovals > 0
                    ? 'bg-orange-50 text-[#D97706]'
                    : 'bg-emerald-50 text-emerald-700'
                }`}
                aria-live="polite"
              >
                {loading
                  ? 'Checking queues…'
                  : totalPendingApprovals > 0
                  ? `${totalPendingApprovals} awaiting review`
                  : 'All caught up'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {pendingApprovalItems.map((item) => {
                const ItemIcon = item.icon;

                return (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="group rounded-2xl border border-[#EAE5E1] p-4 hover:border-[#F28C38]/50 hover:shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F28C38] focus-visible:ring-offset-2"
                    aria-label={`${item.title}: ${loading ? 'loading' : `${item.count} pending`}. Open queue`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.iconStyle}`}>
                        <ItemIcon className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <span className={`text-2xl font-black tabular-nums ${
                        loading
                          ? 'text-gray-300'
                          : item.count > 0
                          ? 'text-[#D97706]'
                          : 'text-[#4A3832]'
                      }`}>
                        {loading ? '—' : item.count}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-[#4A3832] mt-4">{item.title}</h3>
                    <p className="text-xs text-[#6B6B6B] leading-relaxed mt-1 min-h-[2.5rem]">
                      {item.description}
                    </p>
                    <div className="mt-4 flex items-center justify-between gap-2 text-xs font-bold">
                      <span className={item.count > 0 && !loading ? 'text-[#D97706]' : 'text-emerald-700'}>
                        {loading
                          ? 'Loading status'
                          : item.count > 0
                          ? `${item.count} pending review`
                          : 'No pending requests'}
                      </span>
                      <ArrowRight className="w-4 h-4 text-[#F28C38] group-hover:translate-x-1 transition-transform" aria-hidden="true" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })()}
    </DashboardLayout>
  );
}
