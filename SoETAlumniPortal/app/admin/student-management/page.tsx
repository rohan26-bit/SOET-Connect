'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import LoadingState from '@/components/LoadingState';
import { adminService, UserManagementItem } from '@/lib/services/adminService';
import UserDetailsModal from '@/components/admin/UserDetailsModal';
import DeleteUserConfirmationModal from '@/components/admin/DeleteUserConfirmationModal';
import { 
  GraduationCap, Search, Ban, CheckCircle2, 
  Clock, XCircle, AlertCircle, RefreshCw, Download, Eye, Trash2
} from 'lucide-react';

export default function AdminStudentManagementPage() {
  const [students, setStudents] = useState<UserManagementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'rejected' | 'suspended'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<UserManagementItem | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserManagementItem | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleExportStudents = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await adminService.exportStudentsCsv({
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
    } catch (err: any) {
      console.error('Failed to export students:', err);
      setExportError(err?.message || 'Failed to export students to CSV.');
    } finally {
      setExporting(false);
    }
  };

  const loadStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminService.getAllStudents();
      setStudents(data.filter((student) =>
        (student.verification_status || (student.is_verified ? 'approved' : 'pending')).toLowerCase() !== 'pending'
      ));
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

  const handleDeleteStudent = async () => {
    if (!userToDelete || deletingUser) return;
    const target = userToDelete;
    setDeletingUser(true);
    setDeleteError(null);
    try {
      await adminService.deleteUserAccount(target.id);
      setStudents((current) => current.filter((item) => item.id !== target.id));
      setUserToDelete(null);
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete this account.');
    } finally {
      setDeletingUser(false);
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
    const studentId = (s.student_id || '').toLowerCase();
    const department = (s.department || '').toLowerCase();
    const course = (s.course_or_company || s.degree || '').toLowerCase();

    const matchesSearch =
      !term ||
      s.full_name.toLowerCase().includes(term) ||
      s.email.toLowerCase().includes(term) ||
      studentId.includes(term) ||
      (s.academic_year || '').toLowerCase().includes(term) ||
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
            Manage reviewed student accounts, view verification outcomes, and control portal access.
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

      {/* Export Error Banner */}
      {exportError && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-xs text-rose-800 font-medium">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{exportError}</span>
          </div>
          <button
            onClick={() => setExportError(null)}
            className="text-rose-600 hover:text-rose-800 p-1 rounded-lg hover:bg-rose-100 transition"
          >
            ✕
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
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-[#6B6B6B]">
              Showing: {filtered.length} reviewed students
            </span>
            <button
              type="button"
              onClick={handleExportStudents}
              disabled={exporting || students.length === 0}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#F28C38] hover:bg-[#E07D2E] text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50 cursor-pointer"
              title={statusFilter !== 'all' || search.trim() ? `Export ${filtered.length} filtered students` : `Export all ${students.length} students`}
            >
              <Download className={`w-3.5 h-3.5 ${exporting ? 'animate-bounce' : ''}`} />
              <span>
                {exporting
                  ? 'Preparing CSV...'
                  : (statusFilter !== 'all' || search.trim())
                  ? `Export CSV (${filtered.length})`
                  : `Export All CSV`}
              </span>
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingState message="Loading student records" className="p-16" />
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center text-xs text-[#6B6B6B]">
            <GraduationCap className="w-8 h-8 text-[#DDD7D2] mx-auto mb-2" />
            No reviewed student accounts found matching your criteria.
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
                  const isBusy = processingId === s.id;
                  const studentId = s.student_id;

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
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedStudent(s)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#DDD7D2] bg-white px-3 py-1.5 text-xs font-bold text-[#4A3832] transition hover:bg-[#F7F4EF]"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View Details
                          </button>
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
                          <button
                            type="button"
                            disabled={deletingUser}
                            onClick={() => {
                              setDeleteError(null);
                              setUserToDelete(s);
                            }}
                            title={`Delete ${s.full_name} account permanently`}
                            aria-label={`Delete ${s.full_name} account permanently`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
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

