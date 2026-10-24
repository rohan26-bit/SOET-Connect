'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  bugReportService,
  BugReportCategory,
  BugReportSeverity,
} from '@/lib/services/bugReportService';
import { ButtonSpinner } from '@/components/LoadingState';
import {
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Send,
} from 'lucide-react';

interface ReportIssueFormProps {
  initialRoute?: string;
  onSuccess?: () => void;
  className?: string;
}

const CATEGORY_OPTIONS: { value: BugReportCategory; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'ui_issue', label: 'UI / Design Issue' },
  { value: 'auth_issue', label: 'Login / Authentication' },
  { value: 'data_issue', label: 'Data / Record Issue' },
  { value: 'performance', label: 'Performance' },
  { value: 'other', label: 'Other' },
];

const SEVERITY_OPTIONS: {
  value: BugReportSeverity;
  label: string;
  badgeClass: string;
}[] = [
  { value: 'low', label: 'Low', badgeClass: 'text-blue-700 bg-blue-50 border-blue-200' },
  { value: 'medium', label: 'Medium', badgeClass: 'text-amber-700 bg-amber-50 border-amber-200' },
  { value: 'high', label: 'High', badgeClass: 'text-orange-700 bg-orange-50 border-orange-200' },
  { value: 'critical', label: 'Critical', badgeClass: 'text-red-700 bg-red-50 border-red-200' },
];

export default function ReportIssueForm({
  initialRoute,
  onSuccess,
  className = '',
}: ReportIssueFormProps) {
  const pathname = usePathname();

  const [category, setCategory] = useState<BugReportCategory>('bug');
  const [severity, setSeverity] = useState<BugReportSeverity>('medium');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [pageRoute, setPageRoute] = useState(initialRoute || pathname || '');
  const [reproductionSteps, setReproductionSteps] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanSubject = subject.trim();
    const cleanDescription = description.trim();

    if (cleanSubject.length < 3) {
      setError('Please provide a subject of at least 3 characters.');
      return;
    }
    if (cleanDescription.length < 5) {
      setError('Please provide a description of at least 5 characters.');
      return;
    }

    setSubmitting(true);
    try {
      await bugReportService.submitReport({
        category,
        severity,
        subject: cleanSubject,
        description: cleanDescription,
        page_route: pageRoute.trim() || undefined,
        reproduction_steps: reproductionSteps.trim() || undefined,
      });

      setSuccess(true);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit bug report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setCategory('bug');
    setSeverity('medium');
    setSubject('');
    setDescription('');
    setPageRoute(pathname || '');
    setReproductionSteps('');
    setSuccess(false);
    setError(null);
  };

  if (success) {
    return (
      <div className={`p-8 bg-[#FBFAF8] rounded-2xl border border-[#DDD7D2] text-center ${className}`}>
        <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-100">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-[#4A3832] mb-1">
          Report Submitted Successfully
        </h3>
        <p className="text-xs text-[#6B6B6B] max-w-md mx-auto mb-6 leading-relaxed">
          Thank you for letting us know! Your report has been logged and queued for administrative review.
        </p>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 border border-[#DDD7D2] text-[#4A3832] text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 text-[#F28C38]" />
          Submit Another Report
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`space-y-5 ${className}`}>
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium leading-relaxed">{error}</div>
        </div>
      )}

      {/* Row: Issue Type & Severity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-[#4A3832] mb-1.5">
            Issue Type <span className="text-red-500">*</span>
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as BugReportCategory)}
            className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#4A3832] font-medium outline-none focus:ring-2 focus:ring-[#F28C38] focus:bg-white transition"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-[#4A3832] mb-1.5">
            Severity <span className="text-red-500">*</span>
          </label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as BugReportSeverity)}
            className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#4A3832] font-medium outline-none focus:ring-2 focus:ring-[#F28C38] focus:bg-white transition"
          >
            {SEVERITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} Severity
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Subject */}
      <div>
        <label className="block text-xs font-bold text-[#4A3832] mb-1.5">
          Subject <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Brief summary of the issue (e.g. Button unresponsive on job apply)"
          className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#4A3832] placeholder-[#888888] outline-none focus:ring-2 focus:ring-[#F28C38] focus:bg-white transition"
        />
      </div>

      {/* Page / Route */}
      <div>
        <label className="block text-xs font-bold text-[#4A3832] mb-1.5">
          Page / Route <span className="text-slate-400 font-normal">(where issue occurred)</span>
        </label>
        <input
          type="text"
          value={pageRoute}
          onChange={(e) => setPageRoute(e.target.value)}
          placeholder="e.g. /student/jobs or /admin/verify"
          className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#4A3832] placeholder-[#888888] outline-none focus:ring-2 focus:ring-[#F28C38] focus:bg-white font-mono transition"
        />
      </div>

      {/* Description */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <label className="block text-xs font-bold text-[#4A3832]">
            Description <span className="text-red-500">*</span>
          </label>
          <span className="text-[11px] text-[#888888]">
            Please describe what happened and how to reproduce it.
          </span>
        </div>
        <textarea
          required
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Explain the unexpected behavior, error messages seen, or visual flaws observed..."
          className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#4A3832] placeholder-[#888888] outline-none focus:ring-2 focus:ring-[#F28C38] focus:bg-white transition leading-relaxed"
        />
      </div>

      {/* Optional Reproduction Steps */}
      <div>
        <label className="block text-xs font-bold text-[#4A3832] mb-1.5">
          Steps to Reproduce <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <textarea
          rows={3}
          value={reproductionSteps}
          onChange={(e) => setReproductionSteps(e.target.value)}
          placeholder="1. Navigate to /student/jobs&#10;2. Click on 'Apply Now'&#10;3. See modal freeze"
          className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#4A3832] placeholder-[#888888] outline-none focus:ring-2 focus:ring-[#F28C38] focus:bg-white transition leading-relaxed font-mono text-[11px]"
        />
      </div>

      {/* Submit Button */}
      <div className="pt-2 flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-[#F28C38] hover:bg-[#E07D2E] focus:ring-2 focus:ring-[#F28C38] shadow-md shadow-[#F28C38]/20 transition disabled:opacity-50 cursor-pointer"
        >
          {submitting ? (
            <>
              <ButtonSpinner className="text-white" />
              <span>Submitting report...</span>
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              <span>Submit Report</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
