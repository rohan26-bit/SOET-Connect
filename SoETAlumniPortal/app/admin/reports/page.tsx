'use client';

import React, { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { adminService, AdminMetrics } from '@/lib/services/adminService';
import {
  Users,
  Briefcase,
  Calendar,
  GraduationCap,
  Clock,
  ShieldAlert,
  CheckCircle2,
  FileText,
  RefreshCw,
  AlertCircle,
  Info,
} from 'lucide-react';

function UnavailableMetricCard({
  title,
  icon: Icon,
  description,
}: {
  title: string;
  icon: React.ElementType;
  description: string;
}) {
  return (
    <div className="p-6 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {title}
          </span>
          <div className="w-8 h-8 bg-slate-100 text-slate-400 rounded-lg flex items-center justify-center">
            <Icon className="w-4 h-4" />
          </div>
        </div>
        <div className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-500">
          Unavailable
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-3 leading-relaxed">{description}</p>
    </div>
  );
}

export default function AdminReportsPage() {
  const [data, setData] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await adminService.getDashboardMetrics();
      setData(result);
    } catch (err: any) {
      console.error('Failed to load admin reports metrics:', err);
      setError(
        err?.message || 'Unable to retrieve real-time metrics from FastAPI server.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  // Safely computed rates for visualizations (guarded against division by zero)
  const verifiedRate =
    data && data.totalAlumni > 0
      ? Math.round((data.verifiedAlumni / data.totalAlumni) * 100)
      : 0;
  const pendingRate =
    data && data.totalAlumni > 0 ? 100 - verifiedRate : 0;

  const nonPendingJobs =
    data ? Math.max(0, data.totalJobs - data.pendingJobs) : 0;
  const pendingJobsRate =
    data && data.totalJobs > 0
      ? Math.round((data.pendingJobs / data.totalJobs) * 100)
      : 0;
  const nonPendingJobsRate =
    data && data.totalJobs > 0 ? 100 - pendingJobsRate : 0;

  return (
    <DashboardLayout>
      {/* SECTION 1: PAGE HEADER & BREADCRUMBS */}
      <div className="flex items-center text-sm text-gray-500 mb-6">
        <span>Admin</span>
        <span className="mx-2">/</span>
        <span className="font-medium text-gray-900">Reports & Analytics</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Reports & Analytics</h1>
          <p className="text-gray-500">
            System overview summarizing currently available platform data.
          </p>
        </div>

        <button
          onClick={loadMetrics}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-sm transition disabled:opacity-50 self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Metrics
        </button>
      </div>

      {/* ERROR STATE */}
      {error && (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl mb-8">
          <div className="flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-red-900 mb-1">
                Failed to Retrieve Analytics
              </h3>
              <p className="text-xs text-red-700 mb-4">{error}</p>
              <button
                onClick={loadMetrics}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl shadow-sm transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOADING SKELETON */}
      {loading && !data && (
        <div className="space-y-8">
          {/* User Overview Skeleton */}
          <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
            <div className="h-6 w-40 bg-slate-200 rounded animate-pulse mb-2" />
            <div className="h-4 w-72 bg-slate-100 rounded animate-pulse mb-6" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-6 bg-slate-50 rounded-xl border border-slate-100 animate-pulse">
                  <div className="h-4 w-28 bg-slate-200 rounded mb-4" />
                  <div className="h-9 w-20 bg-slate-200 rounded mb-2" />
                  <div className="h-3 w-36 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Verification Skeleton */}
          <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
            <div className="h-6 w-48 bg-slate-200 rounded animate-pulse mb-2" />
            <div className="h-4 w-64 bg-slate-100 rounded animate-pulse mb-6" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-5 bg-slate-50 rounded-xl border border-slate-100 animate-pulse">
                  <div className="h-3 w-24 bg-slate-200 rounded mb-2" />
                  <div className="h-7 w-16 bg-slate-200 rounded mb-1" />
                  <div className="h-3 w-28 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
            <div className="h-3.5 w-full bg-slate-100 rounded-full animate-pulse" />
          </div>

          {/* Jobs Skeleton */}
          <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
            <div className="h-6 w-48 bg-slate-200 rounded animate-pulse mb-2" />
            <div className="h-4 w-72 bg-slate-100 rounded animate-pulse mb-6" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-6 bg-slate-50 rounded-xl border border-slate-100 animate-pulse">
                  <div className="h-4 w-28 bg-slate-200 rounded mb-4" />
                  <div className="h-9 w-20 bg-slate-200 rounded mb-2" />
                  <div className="h-3 w-36 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
            <div className="h-3.5 w-full bg-slate-100 rounded-full animate-pulse" />
          </div>

          {/* Events Skeleton */}
          <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
            <div className="h-6 w-36 bg-slate-200 rounded animate-pulse mb-2" />
            <div className="h-4 w-60 bg-slate-100 rounded animate-pulse mb-6" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-6 bg-slate-50 rounded-xl border border-slate-100 animate-pulse">
                  <div className="h-4 w-28 bg-slate-200 rounded mb-4" />
                  <div className="h-9 w-20 bg-slate-200 rounded mb-2" />
                  <div className="h-3 w-36 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD CONTENT */}
      {data && (
        <div className="space-y-8">
          {/* SECTION 2: USER OVERVIEW */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <h2 className="text-xl font-bold text-slate-900">User Overview</h2>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 self-start sm:self-auto">
                Active Directory & Registry
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-6">
              Overview of alumni network members and student portal accounts.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* 1. Total Alumni */}
              <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Total Alumni
                    </span>
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center">
                      <Users className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-3xl font-black text-slate-900">
                    {data.totalAlumni}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  Derived total (Verified + Pending)
                </p>
              </div>

              {/* 2. Verified Alumni */}
              <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Verified Alumni
                    </span>
                    <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-3xl font-black text-slate-900">
                    {data.verifiedAlumni}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  Live directory verified records
                </p>
              </div>

              {/* 3. Pending Alumni */}
              <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Pending Alumni
                    </span>
                    <div className="w-8 h-8 bg-amber-100 text-amber-700 rounded-lg flex items-center justify-center">
                      <ShieldAlert className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-3xl font-black text-slate-900">
                    {data.pendingAlumni}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  {data.pendingAlumni > 0 ? (
                    <span className="text-amber-600 font-semibold">
                      Awaiting verification review
                    </span>
                  ) : (
                    'Verification queue is clear'
                  )}
                </p>
              </div>

              {/* 4. Total Students */}
              {data.totalStudents !== null ? (
                <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Total Students
                      </span>
                      <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center">
                        <GraduationCap className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="text-3xl font-black text-slate-900">
                      {data.totalStudents}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    Active student portal accounts
                  </p>
                </div>
              ) : (
                <UnavailableMetricCard
                  title="Total Students"
                  icon={GraduationCap}
                  description="FastAPI student endpoint does not provide student totals."
                />
              )}
            </div>
          </div>

          {/* SECTION 3: ALUMNI VERIFICATION */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <h2 className="text-xl font-bold text-slate-900">Alumni Verification</h2>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 self-start sm:self-auto">
                Real-time Verification Ratio
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-6">
              Verification status breakdown of registered alumni records.
            </p>

            {/* Metric Summaries */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
              <div className="p-5 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Total Alumni
                </div>
                <div className="text-2xl font-black text-slate-900">
                  {data.totalAlumni}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Combined directory & pending
                </div>
              </div>

              <div className="p-5 bg-emerald-50/50 rounded-xl border border-emerald-100">
                <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">
                  Verified Alumni
                </div>
                <div className="text-2xl font-black text-emerald-700">
                  {data.verifiedAlumni}
                </div>
                <div className="text-xs text-emerald-600 mt-1">
                  {data.totalAlumni > 0 ? `${verifiedRate}% of total alumni` : '0% of total'}
                </div>
              </div>

              <div className="p-5 bg-amber-50/50 rounded-xl border border-amber-100">
                <div className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">
                  Pending Alumni
                </div>
                <div className="text-2xl font-black text-amber-700">
                  {data.pendingAlumni}
                </div>
                <div className="text-xs text-amber-600 mt-1">
                  {data.totalAlumni > 0 ? `${pendingRate}% of total alumni` : '0% of total'}
                </div>
              </div>
            </div>

            {/* Segmented Horizontal Progress Bar */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between text-xs font-semibold text-slate-600 gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shrink-0" />
                  <span>Verified: {data.verifiedAlumni} ({verifiedRate}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shrink-0" />
                  <span>Pending: {data.pendingAlumni} ({pendingRate}%)</span>
                </div>
              </div>

              <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden flex">
                {data.totalAlumni === 0 ? (
                  <div className="w-full h-full bg-slate-200" title="No alumni records" />
                ) : (
                  <>
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${verifiedRate}%` }}
                      title={`Verified: ${data.verifiedAlumni} (${verifiedRate}%)`}
                    />
                    <div
                      className="h-full bg-amber-500 transition-all duration-300"
                      style={{ width: `${pendingRate}%` }}
                      title={`Pending: ${data.pendingAlumni} (${pendingRate}%)`}
                    />
                  </>
                )}
              </div>

              <p className="text-[11px] text-slate-400">
                {data.totalAlumni === 0
                  ? 'No alumni records have been registered in the system yet.'
                  : `Visual ratio computed dynamically from ${data.totalAlumni} real alumni records.`}
              </p>
            </div>
          </div>

          {/* SECTION 4: JOBS & APPLICATIONS */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <h2 className="text-xl font-bold text-slate-900">Jobs & Applications</h2>
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200 self-start sm:self-auto">
                Opportunities Distribution
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-6">
              Career opportunities moderation status and application tracking.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              {/* Total Jobs */}
              <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Total Jobs
                    </span>
                    <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center">
                      <Briefcase className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-3xl font-black text-slate-900">
                    {data.totalJobs}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  All posted job & internship opportunities
                </p>
              </div>

              {/* Pending Jobs */}
              <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Pending Jobs
                    </span>
                    <div className="w-8 h-8 bg-amber-100 text-amber-700 rounded-lg flex items-center justify-center">
                      <Clock className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-3xl font-black text-slate-900">{data.pendingJobs}</div>
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  {data.pendingJobs > 0 ? (
                    <span className="text-amber-600 font-semibold">
                      Awaiting admin moderation
                    </span>
                  ) : (
                    'All job postings reviewed'
                  )}
                </p>
              </div>

              {/* Total Applications */}
              {data.totalApplications !== null ? (
                <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Total Applications
                      </span>
                      <div className="w-8 h-8 bg-purple-100 text-purple-700 rounded-lg flex items-center justify-center">
                        <FileText className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="text-3xl font-black text-slate-900">
                      {data.totalApplications}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    Student applications submitted
                  </p>
                </div>
              ) : (
                <UnavailableMetricCard
                  title="Total Applications"
                  icon={FileText}
                  description="FastAPI job application data endpoint is not connected."
                />
              )}
            </div>

            {/* Segmented Horizontal Progress Bar for Jobs */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap items-center justify-between text-xs font-semibold text-slate-600 gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block shrink-0" />
                  <span>Non-pending Jobs: {nonPendingJobs} ({nonPendingJobsRate}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shrink-0" />
                  <span>Pending Jobs: {data.pendingJobs} ({pendingJobsRate}%)</span>
                </div>
              </div>

              <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden flex">
                {data.totalJobs === 0 ? (
                  <div className="w-full h-full bg-slate-200" title="No jobs posted yet" />
                ) : (
                  <>
                    <div
                      className="h-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${nonPendingJobsRate}%` }}
                      title={`Non-pending: ${nonPendingJobs} (${nonPendingJobsRate}%)`}
                    />
                    <div
                      className="h-full bg-amber-500 transition-all duration-300"
                      style={{ width: `${pendingJobsRate}%` }}
                      title={`Pending: ${data.pendingJobs} (${pendingJobsRate}%)`}
                    />
                  </>
                )}
              </div>

              <p className="text-[11px] text-slate-400">
                {data.totalJobs === 0
                  ? 'No jobs or internships have been posted yet.'
                  : `Calculated from ${data.totalJobs} total job postings. Non-pending includes approved and rejected records.`}
              </p>
            </div>
          </div>

          {/* SECTION 5: EVENTS */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <h2 className="text-xl font-bold text-slate-900">Events</h2>
              {data.totalEvents !== null ? (
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 self-start sm:self-auto">
                  Live Event Metrics
                </span>
              ) : (
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200 self-start sm:self-auto">
                  Pending Integration
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-6">
              Campus events, workshop tracking, and attendance participation records.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {data.totalEvents !== null ? (
                <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Total Events
                      </span>
                      <div className="w-8 h-8 bg-purple-100 text-purple-700 rounded-lg flex items-center justify-center">
                        <Calendar className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="text-3xl font-black text-slate-900">
                      {data.totalEvents}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    Scheduled campus and virtual events
                  </p>
                </div>
              ) : (
                <UnavailableMetricCard
                  title="Total Events"
                  icon={Calendar}
                  description="FastAPI events router is not connected to the current API service."
                />
              )}

              {data.pendingEvents !== null ? (
                <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Pending Events
                      </span>
                      <div className="w-8 h-8 bg-amber-100 text-amber-700 rounded-lg flex items-center justify-center">
                        <Clock className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="text-3xl font-black text-slate-900">
                      {data.pendingEvents}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    {data.pendingEvents > 0 ? (
                      <span className="text-amber-600 font-semibold">
                        Awaiting administrator authorization
                      </span>
                    ) : (
                      'All event proposals approved'
                    )}
                  </p>
                </div>
              ) : (
                <UnavailableMetricCard
                  title="Pending Events"
                  icon={Clock}
                  description="FastAPI events moderation endpoint is not connected."
                />
              )}

              {data.totalRegistrations !== null ? (
                <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Total Registrations
                      </span>
                      <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center">
                        <Users className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="text-3xl font-black text-slate-900">
                      {data.totalRegistrations}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    Total event RSVPs submitted
                  </p>
                </div>
              ) : (
                <UnavailableMetricCard
                  title="Total Registrations"
                  icon={Users}
                  description="FastAPI event registration endpoint is not connected."
                />
              )}
            </div>
          </div>

          {/* SECTION 6: DATA AVAILABILITY / LIMITATIONS */}
          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-xl bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 mt-0.5">
                <Info className="w-4 h-4" />
              </div>
              <div className="flex-1 text-xs text-slate-600">
                <h3 className="font-bold text-slate-800 text-sm mb-1">
                  Data Availability & System Scope
                </h3>
                <p className="leading-relaxed mb-3">
                  This dashboard presents live data connected directly to active FastAPI backend endpoints via the unified <code className="px-1.5 py-0.5 bg-slate-200/60 rounded text-slate-800 font-mono text-[11px]">/admin/metrics</code> service.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                    <span className="font-semibold text-slate-700 block mb-0.5">Live Executive Metrics</span>
                    <span className="text-slate-500">Student enrollment, alumni verification, jobs, events, and applications are connected via /admin/metrics.</span>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                    <span className="font-semibold text-slate-700 block mb-0.5">Historical Time Series</span>
                    <span className="text-slate-500">Longitudinal analytics, monthly registration trends, and exportable reports are pending future API modules.</span>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                    <span className="font-semibold text-slate-700 block mb-0.5">Data Freshness</span>
                    <span className="text-slate-500">All displayed counts reflect real-time operational database states refreshed on demand.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
