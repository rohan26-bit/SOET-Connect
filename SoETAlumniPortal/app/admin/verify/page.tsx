'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { adminService, PendingAlumni } from '@/lib/services/adminService';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Ban,
  Building,
  GraduationCap,
  Clock,
  MapPin,
  Briefcase,
  Code2,
  Globe,
  Mail,
  X,
} from 'lucide-react';

export default function AdminVerifyPage() {
  const [pendingAlumni, setPendingAlumni] = useState<PendingAlumni[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedAlumni, setSelectedAlumni] =
    useState<PendingAlumni | null>(null);

  const loadPending = async () => {
    setLoading(true);

    try {
      const data = await adminService.getPendingAlumni();
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

  const handleAction = async (
    userId: string,
    status: 'approved' | 'rejected' | 'suspended'
  ) => {
    setActionLoading(userId);

    try {
      await adminService.updateAlumniVerification(userId, status);
      setSelectedAlumni(null);
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

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Alumni Verification
          </h1>

          <p className="text-xs text-slate-500 mt-1">
            Review submitted graduate credentials and authorize portal access.
          </p>
        </div>
      </div>

      {/* Verification Queue */}
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
          <div className="p-12 text-center text-xs text-slate-400">
            Loading pending alumni...
          </div>
        ) : pendingAlumni.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />

            <h3 className="text-base font-bold text-slate-800">
              Queue is Clear!
            </h3>

            <p className="text-xs text-slate-500 mt-1">
              All alumni registration requests have been reviewed.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingAlumni.map((alum) => (
              <div
                key={alum.id}
                className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:bg-slate-50/50 transition"
              >
                {/* Alumni Summary */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-600 text-white font-bold rounded-2xl flex items-center justify-center text-base shrink-0 shadow-md shadow-blue-600/20">
                    {alum.full_name.substring(0, 2).toUpperCase()}
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900 leading-tight">
                      {alum.full_name}
                    </h3>

                    <p className="text-xs text-slate-500 mt-0.5">
                      {alum.email}
                    </p>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 mt-2">
                      <span className="flex items-center gap-1 font-medium">
                        <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                        {alum.department} • Batch {alum.graduation_year}
                      </span>

                      {alum.company && (
                        <span className="flex items-center gap-1 font-medium">
                          <Building className="w-3.5 h-3.5 text-slate-400" />
                          {alum.designation || 'Role'} at {alum.company}
                        </span>
                      )}

                      <span className="flex items-center gap-1 text-slate-400">
                        <Clock className="w-3.5 h-3.5" />
                        Registered{' '}
                        {alum.created_at
                          ? new Date(alum.created_at).toLocaleDateString()
                          : '—'}
                      </span>
                    </div>

                    {alum.bio && (
                      <p className="text-xs text-slate-500 mt-2 bg-slate-100 p-2.5 rounded-xl max-w-xl">
                        "{alum.bio}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                  <button
                    disabled={actionLoading === alum.id}
                    onClick={() => setSelectedAlumni(alum)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition disabled:opacity-50"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    View Details
                  </button>

                  <button
                    disabled={actionLoading === alum.id}
                    onClick={() => handleAction(alum.id, 'approved')}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Approve
                  </button>

                  <button
                    disabled={actionLoading === alum.id}
                    onClick={() => handleAction(alum.id, 'rejected')}
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-bold transition disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Reject
                  </button>

                  <button
                    disabled={actionLoading === alum.id}
                    onClick={() => handleAction(alum.id, 'suspended')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition disabled:opacity-50"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    Suspend
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Alumni Details Modal */}
      {selectedAlumni && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={() => setSelectedAlumni(null)}
        >
          <div
            className="bg-white w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                  Verification Review
                </p>

                <h2 className="text-xl font-black text-slate-900 mt-1">
                  Alumni Profile
                </h2>
              </div>

              <button
                onClick={() => setSelectedAlumni(null)}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[65vh]">
              {/* Profile Header */}
              <div className="flex items-center gap-4 p-5 bg-slate-50 rounded-2xl mb-6">
                <div className="w-16 h-16 bg-blue-600 text-white font-black rounded-2xl flex items-center justify-center text-xl shadow-md shadow-blue-600/20">
                  {selectedAlumni.full_name
                    .substring(0, 2)
                    .toUpperCase()}
                </div>

                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    {selectedAlumni.full_name}
                  </h3>

                  <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-1">
                    <Mail className="w-4 h-4" />
                    {selectedAlumni.email}
                  </div>
                </div>
              </div>

              {/* Academic Information */}
              <div className="mb-6">
                <h3 className="text-sm font-black text-slate-900 mb-3">
                  Academic Information
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl border border-slate-200">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                      Department
                    </p>
                    <p className="text-sm font-bold text-slate-800 mt-1">
                      {selectedAlumni.department || 'Not provided'}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl border border-slate-200">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                      Degree
                    </p>
                    <p className="text-sm font-bold text-slate-800 mt-1">
                      {selectedAlumni.degree || 'Not provided'}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl border border-slate-200">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                      Graduation Year
                    </p>
                    <p className="text-sm font-bold text-slate-800 mt-1">
                      {selectedAlumni.graduation_year || 'Not provided'}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl border border-slate-200">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                      Registration Date
                    </p>
                    <p className="text-sm font-bold text-slate-800 mt-1">
                      {selectedAlumni.created_at
                        ? new Date(selectedAlumni.created_at).toLocaleDateString()
                        : 'Not provided'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Professional Information */}
              <div className="mb-6">
                <h3 className="text-sm font-black text-slate-900 mb-3">
                  Professional Information
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl border border-slate-200">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-slate-400" />
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                        Company
                      </p>
                    </div>

                    <p className="text-sm font-bold text-slate-800 mt-2">
                      {selectedAlumni.company || 'Not provided'}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl border border-slate-200">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-slate-400" />
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                        Designation
                      </p>
                    </div>

                    <p className="text-sm font-bold text-slate-800 mt-2">
                      {selectedAlumni.designation || 'Not provided'}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl border border-slate-200">
                    <div className="flex items-center gap-2">
                      <Building className="w-4 h-4 text-slate-400" />
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                        Industry
                      </p>
                    </div>

                    <p className="text-sm font-bold text-slate-800 mt-2">
                      {selectedAlumni.industry || 'Not provided'}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl border border-slate-200">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-slate-400" />
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                        Location
                      </p>
                    </div>

                    <p className="text-sm font-bold text-slate-800 mt-2">
                      {selectedAlumni.location || 'Not provided'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Skills */}
              <div className="mb-6">
                <h3 className="text-sm font-black text-slate-900 mb-3">
                  Skills
                </h3>

                {selectedAlumni.skills &&
                selectedAlumni.skills.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedAlumni.skills.map((skill, index) => (
                      <span
                        key={`${skill}-${index}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold"
                      >
                        <Code2 className="w-3.5 h-3.5" />
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    No skills provided.
                  </p>
                )}
              </div>

              {/* Bio */}
              <div className="mb-6">
                <h3 className="text-sm font-black text-slate-900 mb-3">
                  Professional Bio
                </h3>

                <div className="p-4 bg-slate-50 rounded-2xl">
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {selectedAlumni.bio || 'No bio provided.'}
                  </p>
                </div>
              </div>

              {/* Online Profiles */}
              <div>
                <h3 className="text-sm font-black text-slate-900 mb-3">
                  Online Profiles
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* LinkedIn */}
                  <div className="p-4 rounded-2xl border border-slate-200">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Code2 className="w-4 h-4" />
                      <span className="text-xs font-bold">LinkedIn</span>
                    </div>

                    <p className="text-xs text-slate-600 mt-2 break-all">
                      {selectedAlumni.linkedin || 'Not provided'}
                    </p>
                  </div>

                  {/* GitHub */}
                  <div className="p-4 rounded-2xl border border-slate-200">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Code2 className="w-4 h-4" />
                      <span className="text-xs font-bold">GitHub</span>
                    </div>

                    <p className="text-xs text-slate-600 mt-2 break-all">
                      {selectedAlumni.github || 'Not provided'}
                    </p>
                  </div>

                  {/* Website */}
                  <div className="p-4 rounded-2xl border border-slate-200">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Globe className="w-4 h-4" />
                      <span className="text-xs font-bold">Website</span>
                    </div>

                    <p className="text-xs text-slate-600 mt-2 break-all">
                      {selectedAlumni.website || 'Not provided'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-5 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between gap-3">
              <button
                onClick={() => setSelectedAlumni(null)}
                className="px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition"
              >
                Close
              </button>

              <div className="flex flex-wrap gap-2">
                <button
                  disabled={actionLoading === selectedAlumni.id}
                  onClick={() =>
                    handleAction(selectedAlumni.id, 'rejected')
                  }
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-bold transition disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Reject
                </button>

                <button
                  disabled={actionLoading === selectedAlumni.id}
                  onClick={() =>
                    handleAction(selectedAlumni.id, 'suspended')
                  }
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition disabled:opacity-50"
                >
                  <Ban className="w-3.5 h-3.5" />
                  Suspend
                </button>

                <button
                  disabled={actionLoading === selectedAlumni.id}
                  onClick={() =>
                    handleAction(selectedAlumni.id, 'approved')
                  }
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Approve Alumni
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}