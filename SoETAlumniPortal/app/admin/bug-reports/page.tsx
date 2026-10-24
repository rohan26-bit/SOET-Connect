'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import LoadingState, { ButtonSpinner } from '@/components/LoadingState';
import {
  bugReportService,
  BugReport,
  BugReportStatus,
  BugReportSeverity,
  BugReportCategory,
} from '@/lib/services/bugReportService';
import {
  Bug,
  Search,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  X,
} from 'lucide-react';

const CATEGORY_LABELS: Record<BugReportCategory, string> = {
  bug: 'Bug',
  ui_issue: 'UI / Design',
  auth_issue: 'Authentication',
  data_issue: 'Data / Record',
  performance: 'Performance',
  other: 'Other',
};

const SEVERITY_COLORS: Record<BugReportSeverity, { badge: string; dot: string }> = {
  low: { badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  medium: { badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  high: { badge: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  critical: { badge: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
};

const STATUS_COLORS: Record<BugReportStatus, string> = {
  open: 'bg-amber-50 text-amber-700 border-amber-200',
  in_review: 'bg-blue-50 text-blue-700 border-blue-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-slate-100 text-slate-700 border-slate-200',
};

export default function AdminBugReportsPage() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | BugReportStatus>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | BugReportSeverity>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected report for review modal
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);
  const [newStatus, setNewStatus] = useState<BugReportStatus>('open');
  const [adminNotes, setAdminNotes] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await bugReportService.getReports();
      setReports(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load bug reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    bugReportService
      .getReports()
      .then((data) => {
        if (active) {
          setReports(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load bug reports.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const openReviewModal = (report: BugReport) => {
    setSelectedReport(report);
    setNewStatus(report.status);
    setAdminNotes(report.admin_notes || '');
    setModalSuccess(null);
    setModalError(null);
  };

  const closeReviewModal = () => {
    setSelectedReport(null);
    setModalSuccess(null);
    setModalError(null);
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReport) return;

    setUpdatingStatus(true);
    setModalError(null);
    setModalSuccess(null);

    try {
      const result = await bugReportService.updateStatus(
        selectedReport.id,
        newStatus,
        adminNotes.trim() || undefined
      );

      // Update in local state
      setReports((prev) =>
        prev.map((r) => (r.id === selectedReport.id ? result.report : r))
      );
      setSelectedReport(result.report);
      setModalSuccess('Report status updated successfully.');
      setTimeout(() => {
        setModalSuccess(null);
      }, 3000);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Failed to update report status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Category counts
  const totalCount = reports.length;
  const openCount = reports.filter((r) => r.status === 'open').length;
  const inReviewCount = reports.filter((r) => r.status === 'in_review').length;
  const resolvedCount = reports.filter((r) => r.status === 'resolved').length;
  const closedCount = reports.filter((r) => r.status === 'closed').length;

  // Filtered reports
  const filteredReports = reports.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (severityFilter !== 'all' && r.severity !== severityFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSubject = r.subject.toLowerCase().includes(q);
      const matchDesc = r.description.toLowerCase().includes(q);
      const matchRoute = (r.page_route || '').toLowerCase().includes(q);
      const matchReporter = (r.reporter?.name || '').toLowerCase().includes(q);
      if (!matchSubject && !matchDesc && !matchRoute && !matchReporter) {
        return false;
      }
    }
    return true;
  });

  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-[#6B6B6B] mb-6 uppercase tracking-wider">
        <span>Administration</span>
        <span className="mx-2 text-[#DDD7D2]">/</span>
        <Link href="/admin/settings" className="hover:text-[#4A3832]">Settings</Link>
        <span className="mx-2 text-[#DDD7D2]">/</span>
        <span className="text-[#F28C38]">Issue Reports</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-[#4A3832] tracking-tight">System Issue Reports</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#F28C38]/10 text-[#F28C38]">
              {totalCount} Total
            </span>
          </div>
          <p className="text-xs text-[#6B6B6B] mt-1">
            Track, prioritize, and resolve user-reported technical glitches, UI defects, and platform feedback.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadReports}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 border border-[#DDD7D2] text-[#4A3832] text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#F28C38] ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            href="/admin/settings"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#F28C38] hover:bg-[#E07D2E] text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
          >
            <Bug className="w-3.5 h-3.5" />
            Report New Bug
          </Link>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadReports}
            className="inline-flex items-center gap-1 font-bold text-red-700 hover:text-red-900 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )}

      {/* Filter Tabs Bar */}
      <div className="bg-white rounded-3xl border border-[#DDD7D2] shadow-sm mb-8 overflow-hidden">
        {/* Status Filter Tabs */}
        <div className="p-4 border-b border-[#DDD7D2]/60 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-[#4A3832] text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#4A3832] hover:bg-slate-100'
            }`}
          >
            All Reports ({totalCount})
          </button>

          <button
            onClick={() => setStatusFilter('open')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              statusFilter === 'open'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#4A3832] hover:bg-slate-100'
            }`}
          >
            Open ({openCount})
          </button>

          <button
            onClick={() => setStatusFilter('in_review')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              statusFilter === 'in_review'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#4A3832] hover:bg-slate-100'
            }`}
          >
            In Review ({inReviewCount})
          </button>

          <button
            onClick={() => setStatusFilter('resolved')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              statusFilter === 'resolved'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#4A3832] hover:bg-slate-100'
            }`}
          >
            Resolved ({resolvedCount})
          </button>

          <button
            onClick={() => setStatusFilter('closed')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              statusFilter === 'closed'
                ? 'bg-slate-600 text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#4A3832] hover:bg-slate-100'
            }`}
          >
            Closed ({closedCount})
          </button>
        </div>

        {/* Search & Severity Filter Bar */}
        <div className="p-4 bg-[#FBFAF8] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#888888]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by subject, description, reporter, or route..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-[#DDD7D2] rounded-xl text-xs text-[#4A3832] placeholder-[#888888] outline-none focus:ring-2 focus:ring-[#F28C38] transition"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#6B6B6B]">Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as 'all' | BugReportSeverity)}
              className="px-3 py-1.5 bg-white border border-[#DDD7D2] rounded-xl text-xs text-[#4A3832] font-semibold outline-none focus:ring-2 focus:ring-[#F28C38]"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <span className="text-xs font-semibold text-[#888888] ml-2">
              Showing {filteredReports.length}
            </span>
          </div>
        </div>

        {/* Table / List */}
        {loading ? (
          <LoadingState message="Loading issue reports" className="p-16" />
        ) : filteredReports.length === 0 ? (
          <div className="p-16 text-center text-xs text-[#6B6B6B]">
            <Bug className="w-10 h-10 text-[#DDD7D2] mx-auto mb-3" />
            <div className="font-bold text-sm text-[#4A3832]">No issue reports found</div>
            <p className="text-xs text-[#888888] mt-1">
              {searchQuery || statusFilter !== 'all' || severityFilter !== 'all'
                ? 'Try adjusting your search criteria or filter options.'
                : 'No technical issues or bug reports logged yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FBFAF8] text-[#6B6B6B] font-bold uppercase tracking-wider border-b border-[#DDD7D2]/60">
                <tr>
                  <th className="py-3.5 px-6">Issue Summary</th>
                  <th className="py-3.5 px-6">Category</th>
                  <th className="py-3.5 px-6">Severity</th>
                  <th className="py-3.5 px-6">Reporter</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDD7D2]/40 text-[#4A3832]">
                {filteredReports.map((report) => {
                  const severityStyle = SEVERITY_COLORS[report.severity] || SEVERITY_COLORS.medium;
                  const statusStyle = STATUS_COLORS[report.status] || STATUS_COLORS.open;

                  return (
                    <tr key={report.id} className="hover:bg-[#FBFAF8] transition">
                      {/* Summary */}
                      <td className="py-4 px-6 max-w-xs">
                        <div className="font-bold text-[#4A3832] truncate">{report.subject}</div>
                        <p className="text-[11px] text-[#6B6B6B] line-clamp-1 mt-0.5">
                          {report.description}
                        </p>
                        {report.page_route && (
                          <span className="inline-block text-[10px] text-[#F28C38] font-mono mt-1">
                            {report.page_route}
                          </span>
                        )}
                      </td>

                      {/* Category */}
                      <td className="py-4 px-6">
                        <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700">
                          {CATEGORY_LABELS[report.category] || report.category}
                        </span>
                      </td>

                      {/* Severity */}
                      <td className="py-4 px-6">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${severityStyle.badge}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${severityStyle.dot}`} />
                          {report.severity}
                        </span>
                      </td>

                      {/* Reporter */}
                      <td className="py-4 px-6">
                        <div className="font-bold text-[#4A3832]">
                          {report.reporter?.name || 'User'}
                        </div>
                        <div className="text-[11px] text-[#6B6B6B]">
                          {report.reporter?.email || ''}
                        </div>
                        <span className="text-[10px] text-[#888888] capitalize">
                          {report.reporter?.role || 'user'} • {new Date(report.created_at).toLocaleDateString()}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-6">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusStyle}`}
                        >
                          {report.status.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => openReviewModal(report)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#4A3832] hover:bg-[#3D2E28] text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
                        >
                          <span>Review</span>
                          <ArrowRight className="w-3 h-3 text-[#F28C38]" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review & Status Update Modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#DDD7D2] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="p-6 border-b border-[#DDD7D2]/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#F28C38]/10 text-[#F28C38] flex items-center justify-center font-bold">
                  <Bug className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#4A3832]">Review Bug Report</h3>
                  <span className="text-[11px] text-[#888888] font-mono">ID: {selectedReport.id}</span>
                </div>
              </div>
              <button
                onClick={closeReviewModal}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {modalSuccess && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-xs text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{modalSuccess}</span>
                </div>
              )}

              {modalError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Meta Pills */}
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase border ${
                    SEVERITY_COLORS[selectedReport.severity]?.badge || 'bg-slate-100 text-slate-700'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      SEVERITY_COLORS[selectedReport.severity]?.dot || 'bg-slate-400'
                    }`}
                  />
                  Severity: {selectedReport.severity}
                </span>

                <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  Category: {CATEGORY_LABELS[selectedReport.category] || selectedReport.category}
                </span>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${
                    STATUS_COLORS[selectedReport.status] || 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Status: {selectedReport.status.replace('_', ' ')}
                </span>
              </div>

              {/* Subject */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B6B6B] block mb-1">
                  Subject
                </span>
                <div className="p-3.5 bg-[#FBFAF8] rounded-xl border border-[#DDD7D2] text-xs font-bold text-[#4A3832]">
                  {selectedReport.subject}
                </div>
              </div>

              {/* Reporter & Route */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B6B6B] block mb-1">
                    Reporter
                  </span>
                  <div className="p-3 bg-[#FBFAF8] rounded-xl border border-[#DDD7D2] text-xs">
                    <div className="font-bold text-[#4A3832]">{selectedReport.reporter?.name || 'User'}</div>
                    <div className="text-[11px] text-[#6B6B6B]">{selectedReport.reporter?.email || 'N/A'}</div>
                    <div className="text-[10px] text-[#F28C38] capitalize mt-0.5">
                      Role: {selectedReport.reporter?.role || 'user'}
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B6B6B] block mb-1">
                    Page / Route
                  </span>
                  <div className="p-3 bg-[#FBFAF8] rounded-xl border border-[#DDD7D2] text-xs font-mono text-[#4A3832]">
                    {selectedReport.page_route || 'Not specified'}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B6B6B] block mb-1">
                  Description
                </span>
                <div className="p-4 bg-[#FBFAF8] rounded-xl border border-[#DDD7D2] text-xs text-[#4A3832] leading-relaxed whitespace-pre-wrap">
                  {selectedReport.description}
                </div>
              </div>

              {/* Reproduction Steps */}
              {selectedReport.reproduction_steps && (
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B6B6B] block mb-1">
                    Steps to Reproduce
                  </span>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono text-slate-800 leading-relaxed whitespace-pre-wrap">
                    {selectedReport.reproduction_steps}
                  </div>
                </div>
              )}

              {/* Form: Update Status & Admin Notes */}
              <form onSubmit={handleUpdateStatus} className="pt-4 border-t border-[#DDD7D2]/60 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#4A3832] mb-1.5">
                      Update Status
                    </label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value as BugReportStatus)}
                      className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs font-bold text-[#4A3832] outline-none focus:ring-2 focus:ring-[#F28C38]"
                    >
                      <option value="open">Open</option>
                      <option value="in_review">In Review</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>

                  <div>
                    <span className="block text-xs font-bold text-[#4A3832] mb-1.5">
                      Logged At
                    </span>
                    <div className="px-3.5 py-2.5 bg-slate-100 rounded-xl text-xs text-slate-600 font-mono">
                      {new Date(selectedReport.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#4A3832] mb-1.5">
                    Resolution / Administrator Notes
                  </label>
                  <textarea
                    rows={3}
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Document diagnosis, fix commits, or resolution rationale..."
                    className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#4A3832] outline-none focus:ring-2 focus:ring-[#F28C38] leading-relaxed"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeReviewModal}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={updatingStatus}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-[#F28C38] hover:bg-[#E07D2E] focus:ring-2 focus:ring-[#F28C38] shadow-md shadow-[#F28C38]/20 transition disabled:opacity-50 cursor-pointer"
                  >
                    {updatingStatus ? (
                      <>
                        <ButtonSpinner className="text-white" />
                        <span>Updating status...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Save Status Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
