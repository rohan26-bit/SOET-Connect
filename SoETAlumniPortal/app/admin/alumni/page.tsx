'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { adminService, UserManagementItem } from '@/lib/services/adminService';
import { Users, Search, Building, GraduationCap } from 'lucide-react';

export default function AdminAlumniPage() {
  const [alumni, setAlumni] = useState<UserManagementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadAlumni = async () => {
    setLoading(true);
    try {
      const data = await adminService.getAllAlumni();
      setAlumni(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlumni();
  }, []);

  const handleToggleActive = async (alum: UserManagementItem) => {
    try {
      await adminService.toggleUserActive(alum.id, alum.is_active);
      loadAlumni();
    } catch (err: any) {
      alert(err.message || 'Action failed');
    }
  };

  const filtered = alumni.filter(
    (a) =>
      a.full_name.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase()) ||
      a.course_or_company?.toLowerCase().includes(search.toLowerCase()) ||
      a.department?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-slate-400 mb-6 uppercase tracking-wider">
        <span>Administration</span>
        <span className="mx-2 text-slate-300">/</span>
        <span className="text-blue-600">Alumni Management</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Registered Alumni Directory</h1>
          <p className="text-xs text-slate-500 mt-1">
            Browse graduate profiles, corporate affiliations, and verification statuses.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Search */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search alumni, company, department..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <span className="text-xs font-semibold text-slate-500">
            Total: {filtered.length} Alumni
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading alumni records...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">No alumni records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="py-3 px-6">Alumni Member</th>
                  <th className="py-3 px-6">Department & Batch</th>
                  <th className="py-3 px-6">Current Company</th>
                  <th className="py-3 px-6">Verification</th>
                  <th className="py-3 px-6">Access</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-4 px-6">
                      <div className="font-bold text-slate-900">{a.full_name}</div>
                      <div className="text-[11px] text-slate-400">{a.email}</div>
                    </td>
                    <td className="py-4 px-6">
                      <div>{a.department}</div>
                      <div className="text-[11px] text-slate-400">Batch {a.graduation_year}</div>
                    </td>
                    <td className="py-4 px-6 font-semibold">{a.course_or_company || '—'}</td>
                    <td className="py-4 px-6">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        a.verification_status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        a.verification_status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {a.verification_status || 'Pending'}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        a.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {a.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => handleToggleActive(a)}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs transition ${
                          a.is_active
                            ? 'bg-red-50 text-red-700 hover:bg-red-100'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                      >
                        {a.is_active ? 'Suspend' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
