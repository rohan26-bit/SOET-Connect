'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import LoadingState from '@/components/LoadingState';
import { adminService, UserManagementItem } from '@/lib/services/adminService';
import { 
  GraduationCap, Search, Ban, CheckCircle2, 
  Clock, XCircle, AlertCircle, ArrowRight, RefreshCw
} from 'lucide-react';

export default function AdminStudentManagementPage() {
  const [students, setStudents] = useState<UserManagementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending' | 'rejected' | 'suspended'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminService.getAllStudents();
      setStudents(data);
    } catch (err: any) {
      console.error('Failed to load students:', err);
      setError(err.message || 'Failed to load students list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const handleToggleActive = async (student: UserManagementItem) => {
    if (processingId) return;
    setProcessingId(student.id);
    try {
      await adminService.toggleUserActive(student.id, student.is_active);
      await loadStudents();
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setProcessingId(null);
    }
  };

  const getVerificationBadge = (s: UserManagementItem) => {
    const status = (s.verification_status || 'pending').toUpperCase();
    if (status === 'APPROVED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" />
          APPROVED
        </span>
      );
    }
    if (status === 'REJECTED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-100 text-rose-800 border border-rose-200">
          <XCircle className="w-3 h-3" />
          REJECTED
        </span>
      );
    }
    if (status === 'SUSPENDED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-100 text-purple-800 border border-purple-200">
          <Ban className="w-3 h-3" />
          SUSPENDED
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200">
        <Clock className="w-3 h-3" />
        PENDING
      </span>
    );
  };

  // Counts for filter tabs
  const pendingCount = students.filter(
    (s) => (s.verification_status || 'pending').toLowerCase() === 'pending'
  ).length;

  const approvedCount = students.filter(
    (s) => (s.verification_status || '').toLowerCase() === 'approved'
  ).length;

  const rejectedCount = students.filter(
    (s) => (s.verification_status || '').toLowerCase() === 'rejected'
  ).length;

  const suspendedCount = students.filter(
    (s) => (s.verification_status || '').toLowerCase() === 'suspended'
  ).length;

  const filtered = students.filter((s) => {
    const term = search.toLowerCase().trim();
    const studentId = ((s as any).student_id || (s as any).prn || s.id || '').toLowerCase();
    const department = (s.department || '').toLowerCase();
    const course = (s.course_or_company || s.degree || '').toLowerCase();

    const matchesSearch =
      !term ||
      s.full_name.toLowerCase().includes(term) ||
      s.email.toLowerCase().includes(term) ||
      studentId.includes(term) ||
      department.includes(term) ||
      course.includes(term);

    const vStatus = (s.verification_status || 'pending').toLowerCase();
    const matchesFilter =
      statusFilter === 'all' || vStatus === statusFilter;

    return matchesSearch && matchesFilter;
  });

  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-[#6B6B6B] mb-6 uppercase tracking-wider">
        <span>Administration</span>
        <span className="mx-2 text-[#DDD7D2]">/</span>
        <span className="text-[#F28C38]">Student Management</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-[#4A3832] tracking-tight">Student Management</h1>
          <p className="text-xs text-[#6B6B6B] mt-1">
            Manage registered students, review account status, and control portal access.
          </p>
        </div>

        {/* Quick Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-[#EFECE6] p-1.5 rounded-2xl self-start md:self-auto flex-wrap">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-white text-[#4A3832] shadow-sm'
                : 'text-[#6B6B6B] hover:text-[#4A3832]'
            }`}
          >
            All ({students.length})
          </button>
          <button
            onClick={() => setStatusFilter('approved')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              statusFilter === 'approved'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-[#6B6B6B] hover:text-[#4A3832]'
            }`}
          >
            Approved ({approvedCount})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              statusFilter === 'pending'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-[#6B6B6B] hover:text-[#4A3832]'
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setStatusFilter('rejected')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              statusFilter === 'rejected'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-[#6B6B6B] hover:text-[#4A3832]'
            }`}
          >
            Rejected ({rejectedCount})
          </button>
          <button
            onClick={() => setStatusFilter('suspended')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              statusFilter === 'suspended'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-[#6B6B6B] hover:text-[#4A3832]'
            }`}
          >
            Suspended ({suspendedCount})
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between text-xs text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadStudents}
            className="inline-flex items-center gap-1 font-bold text-red-700 hover:text-red-900 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )}

      {/* Students Table Card */}
      <div className="bg-white rounded-3xl border border-[#DDD7D2] shadow-sm overflow-hidden">
        {/* Search Header */}
        <div className="p-4 border-b border-[#DDD7D2]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B6B6B]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, student ID, department, course..."
              className="w-full pl-10 pr-4 py-2 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs outline-none focus:ring-2 focus:ring-[#F28C38] focus:bg-white text-[#4A3832] transition"
            />
          </div>
          <span className="text-xs font-semibold text-[#6B6B6B]">
            Showing: {filtered.length} Students
          </span>
        </div>

        {loading ? (
          <LoadingState message="Loading student records" className="p-16" />
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center text-xs text-[#6B6B6B]">
            <GraduationCap className="w-8 h-8 text-[#DDD7D2] mx-auto mb-2" />
            No students found matching your criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FBFAF8] text-[#6B6B6B] font-bold uppercase tracking-wider border-b border-[#DDD7D2]/60">
                <tr>
                  <th className="py-3 px-6">Student Details</th>
                  <th className="py-3 px-6">Department</th>
                  <th className="py-3 px-6">Course / Batch</th>
                  <th className="py-3 px-6">Verification</th>
                  <th className="py-3 px-6">Account Status</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDD7D2]/40 text-[#4A3832]">
                {filtered.map((s) => {
                  const isPending =
                    (s.verification_status || 'pending').toLowerCase() === 'pending';
                  const isBusy = processingId === s.id;
                  const studentId = (s as any).student_id || (s as any).prn;

                  return (
                    <tr key={s.id} className="hover:bg-[#FBFAF8] transition">
                      <td className="py-4 px-6">
                        <div className="font-bold text-[#4A3832]">{s.full_name}</div>
                        <div className="text-[11px] text-[#6B6B6B]">{s.email}</div>
                        {studentId && (
                          <div className="text-[10px] text-[#F28C38] font-mono mt-0.5">
                            ID: {studentId}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-6 text-[#6B6B6B]">{s.department || '—'}</td>
                      <td className="py-4 px-6 text-[#6B6B6B]">
                        <span className="font-semibold text-[#4A3832]">
                          {s.course_or_company || s.degree || 'B.Tech'}
                        </span>
                        {s.graduation_year && (
                          <span className="block text-[11px] text-[#6B6B6B]">
                            Grad: {s.graduation_year}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6">{getVerificationBadge(s)}</td>
                      <td className="py-4 px-6">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            s.is_active
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {s.is_active ? 'ACTIVE' : 'SUSPENDED'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        {isPending ? (
                          <Link
                            href="/admin/students"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-amber-500 hover:bg-amber-600 text-white transition shadow-sm"
                          >
                            Review Verification <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        ) : (
                          <button
                            disabled={isBusy}
                            onClick={() => handleToggleActive(s)}
                            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition disabled:opacity-50 cursor-pointer ${
                              s.is_active
                                ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                            }`}
                          >
                            {isBusy
                              ? 'Updating...'
                              : s.is_active
                              ? 'Suspend Account'
                              : 'Reactivate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

