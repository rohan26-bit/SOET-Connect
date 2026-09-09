'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { alumniService, AlumniDirectoryItem } from '@/lib/services/alumniService';
import { ShieldCheck, CheckCircle2, XCircle, Ban, AlertCircle, Building, GraduationCap, Clock } from 'lucide-react';

export default function AdminVerifyPage() {
  const [pendingAlumni, setPendingAlumni] = useState<AlumniDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadPending = async () => {
    setLoading(true);
    try {
      const data = await alumniService.getPendingAlumni();
      setPendingAlumni(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPending();
  }, []);

  const handleAction = async (userId: string, status: 'approved' | 'rejected' | 'suspended') => {
    setActionLoading(userId);
    try {
      await alumniService.updateVerificationStatus(userId, status);
      await loadPending();
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-slate-400 mb-6 uppercase tracking-wider">
        <span>Administration</span>
        <span className="mx-2 text-slate-300">/</span>
        <span className="text-blue-600">Alumni Verification Queue</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Alumni Verification</h1>
          <p className="text-xs text-slate-500 mt-1">
            Review submitted graduate credentials and authorize portal access.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            Pending Queue ({pendingAlumni.length})
          </h2>
          <button
            onClick={loadPending}
            className="text-xs font-bold text-blue-600 hover:underline"
          >
            Refresh Queue
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading pending alumni...</div>
        ) : pendingAlumni.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">Queue is Clear!</h3>
            <p className="text-xs text-slate-500 mt-1">All alumni registration requests have been reviewed.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingAlumni.map((alum) => (
              <div key={alum.id} className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:bg-slate-50/50 transition">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-600 text-white font-bold rounded-2xl flex items-center justify-center text-base shrink-0 shadow-md shadow-blue-600/20">
                    {alum.full_name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 leading-tight">{alum.full_name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{alum.email}</p>
                    
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 mt-2">
                      <span className="flex items-center gap-1 font-medium">
                        <GraduationCap className="w-3.5 h-3.5 text-slate-400" /> {alum.department} • Batch {alum.graduation_year}
                      </span>
                      {alum.company && (
                        <span className="flex items-center gap-1 font-medium">
                          <Building className="w-3.5 h-3.5 text-slate-400" /> {alum.designation || 'Role'} at {alum.company}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-slate-400">
                        <Clock className="w-3.5 h-3.5" /> Registered {new Date(alum.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {alum.bio && (
                      <p className="text-xs text-slate-500 mt-2 bg-slate-100 p-2.5 rounded-xl max-w-xl">
                        "{alum.bio}"
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                  <button
                    disabled={actionLoading === alum.id}
                    onClick={() => handleAction(alum.id, 'approved')}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    disabled={actionLoading === alum.id}
                    onClick={() => handleAction(alum.id, 'rejected')}
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-bold transition disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                  <button
                    disabled={actionLoading === alum.id}
                    onClick={() => handleAction(alum.id, 'suspended')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition disabled:opacity-50"
                  >
                    <Ban className="w-3.5 h-3.5" /> Suspend
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
