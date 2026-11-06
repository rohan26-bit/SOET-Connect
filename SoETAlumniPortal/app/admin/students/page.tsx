'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import LoadingState from '@/components/LoadingState';
import { adminService, UserManagementItem } from '@/lib/services/adminService';
import { GraduationCap, Search, Clock, Eye, Trash2 } from 'lucide-react';
import UserDetailsModal from '@/components/admin/UserDetailsModal';
import DeleteUserConfirmationModal from '@/components/admin/DeleteUserConfirmationModal';

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<UserManagementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<UserManagementItem | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserManagementItem | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const data = await adminService.getPendingStudents();
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

  const handleVerifyStudent = async (student: UserManagementItem, status: 'approved' | 'rejected') => {
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


  const handleDeleteStudent = async () => {
    if (!userToDelete || deletingUser) return;

    const target = userToDelete;
    setDeletingUser(true);
    setDeleteError(null);

    try {
      await adminService.deleteUserAccount(target.id);
      setStudents((current) => current.filter((item) => item.id !== target.id));
      setSelectedStudent((current) => current?.id === target.id ? null : current);
      setUserToDelete(null);
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete this account.');
    } finally {
      setDeletingUser(false);
    }
  };

  const filtered = students.filter((s) => {
    const term = search.trim().toLowerCase();
    return (
      s.full_name.toLowerCase().includes(term) ||
      s.email.toLowerCase().includes(term) ||
      (s.department || '').toLowerCase().includes(term)
    );
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
      <div className="flex items-center text-xs font-semibold text-[#6B6B6B] mb-6 uppercase tracking-wider">
        <span>Administration</span>
        <span className="mx-2 text-[#DDD7D2]">/</span>
        <span className="text-[#F28C38]">Student Verification</span>
      </div>

      {/* Export error alert */}
      {exportError && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-3 text-rose-800 text-xs font-medium">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{exportError}</span>
          </div>
          <button onClick={() => setExportError(null)} className="text-rose-600 hover:text-rose-800 p-1 rounded-lg hover:bg-rose-100 transition">✕</button>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-[#4A3832] tracking-tight">Student Verification</h1>
          <p className="text-xs text-[#6B6B6B] mt-1">
            Review new student registration requests. Approved and rejected accounts move to Student Management.
          </p>
        </div>
        <div className="rounded-xl bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800">
          Pending requests: {students.length}
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
            Showing: {filtered.length} pending requests
          </span>
        </div>

        {loading ? (
          <LoadingState message="Loading student records" className="p-16" />
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">No pending student requests. New registrations will appear here.</div>
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
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedStudent(s)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View Details
                          </button>
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
                          <button
                            type="button"
                            disabled={deletingUser || isBusy}
                            onClick={() => {
                              setDeleteError(null);
                              setUserToDelete(s);
                            }}
                            title={`Delete ${s.full_name} account permanently`}
                            aria-label={`Delete ${s.full_name} account permanently`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <UserDetailsModal
        user={selectedStudent}
        onClose={() => setSelectedStudent(null)}
      />
      <DeleteUserConfirmationModal
        user={userToDelete}
        isDeleting={deletingUser}
        error={deleteError}
        onClose={() => {
          if (!deletingUser) {
            setUserToDelete(null);
            setDeleteError(null);
          }
        }}
        onConfirm={handleDeleteStudent}
      />
    </DashboardLayout>
  );
}
