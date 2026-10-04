'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { adminService, UserManagementItem } from '@/lib/services/adminService';
import { GraduationCap, Search, Ban, CheckCircle2, UserCheck, Clock, XCircle, AlertCircle } from 'lucide-react';

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<UserManagementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const data = await adminService.getAllStudents();
      setStudents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const handleVerifyStudent = async (student: UserManagementItem, status: 'approved' | 'rejected' | 'suspended') => {
    if (processingId) return;
    setProcessingId(student.id);
    try {
      await adminService.updateStudentVerification(student.id, status);
      await loadStudents();
    } catch (err: any) {
      alert(err.message || 'Verification update failed.');
    } finally {
      setProcessingId(null);
    }
  };

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

  const pendingCount = students.filter(
    (s) => !s.is_verified && (s.verification_status || 'pending') === 'pending'
  ).length;

  const filtered = students.filter((s) => {
    const matchesSearch =
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase()) ||
      s.department?.toLowerCase().includes(search.toLowerCase());

    const vStatus = (s.verification_status || (s.is_verified ? 'approved' : 'pending')).toLowerCase();
    const matchesFilter =
      statusFilter === 'all' ||
      (statusFilter === 'pending' && vStatus === 'pending') ||
      (statusFilter === 'approved' && vStatus === 'approved') ||
      (statusFilter === 'rejected' && (vStatus === 'rejected' || vStatus === 'suspended'));

    return matchesSearch && matchesFilter;
  });

  const getVerificationBadge = (s: UserManagementItem) => {
    const status = (s.verification_status || (s.is_verified ? 'approved' : 'pending')).toUpperCase();
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

  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-slate-400 mb-6 uppercase tracking-wider">
        <span>Administration</span>
        <span className="mx-2 text-slate-300">/</span>
        <span className="text-blue-600">Student Verification</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Student Verification</h1>
          <p className="text-xs text-slate-500 mt-1">
            Review and approve student registration requests, verify enrollment details, and manage student accounts.
          </p>
        </div>

        {/* Quick Filter Tabs */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl self-start md:self-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              statusFilter === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({students.length})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              statusFilter === 'pending'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setStatusFilter('approved')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              statusFilter === 'approved'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Approved
          </button>
          <button
            onClick={() => setStatusFilter('rejected')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              statusFilter === 'rejected'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Rejected
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Search Header */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, department..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <span className="text-xs font-semibold text-slate-500">
            Showing: {filtered.length} Students
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading student accounts...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">No students match current filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="py-3 px-6">Student</th>
                  <th className="py-3 px-6">Department</th>
                  <th className="py-3 px-6">Course / Batch</th>
                  <th className="py-3 px-6">Verification</th>
                  <th className="py-3 px-6">Account</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map((s) => {
                  const isPending =
                    !s.is_verified &&
                    (s.verification_status || 'pending').toLowerCase() === 'pending';
                  const isBusy = processingId === s.id;

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/50 transition">
                      <td className="py-4 px-6">
                        <div className="font-bold text-slate-900">{s.full_name}</div>
                        <div className="text-[11px] text-slate-400">{s.email}</div>
                      </td>
                      <td className="py-4 px-6">{s.department || '—'}</td>
                      <td className="py-4 px-6">
                        {s.course_or_company || 'B.Tech'} ({s.graduation_year || '—'})
                      </td>
                      <td className="py-4 px-6">{getVerificationBadge(s)}</td>
                      <td className="py-4 px-6">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            s.is_active
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {s.is_active ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              disabled={isBusy}
                              onClick={() => handleVerifyStudent(s, 'approved')}
                              className="px-3 py-1.5 rounded-xl font-bold text-xs bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm"
                            >
                              {isBusy ? 'Saving...' : 'Approve'}
                            </button>
                            <button
                              disabled={isBusy}
                              onClick={() => handleVerifyStudent(s, 'rejected')}
                              className="px-3 py-1.5 rounded-xl font-bold text-xs bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 disabled:opacity-50 transition"
                            >
                              {isBusy ? 'Saving...' : 'Reject'}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              disabled={isBusy}
                              onClick={() => handleToggleActive(s)}
                              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition disabled:opacity-50 ${
                                s.is_active
                                  ? 'bg-red-50 text-red-700 hover:bg-red-100'
                                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              }`}
                            >
                              {isBusy
                                ? 'Updating...'
                                : s.is_active
                                ? 'Suspend Account'
                                : 'Reactivate'}
                            </button>
                          </div>
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
