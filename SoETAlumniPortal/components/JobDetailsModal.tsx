'use client';

import { useAccessibleDialog } from '@/hooks/useAccessibleDialog';
import {
  Briefcase,
  Building2,
  CalendarDays,
  Clock3,
  DollarSign,
  ExternalLink,
  MapPin,
  UserRound,
  X,
} from 'lucide-react';
import { JobItem } from '@/lib/services/jobService';
import { DocumentAttachmentView } from '@/components/DocumentAttachment';

interface JobDetailsModalProps {
  job: JobItem | null;
  onClose: () => void;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}

function formatDeadline(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function safeApplicationUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function JobDetailsModal({
  job,
  onClose,
  actionLabel,
  onAction,
  actionDisabled = false,
}: JobDetailsModalProps) {
  const dialogRef = useAccessibleDialog<HTMLDivElement>(Boolean(job), onClose);

  if (!job) return null;

  const deadline = formatDeadline(job.application_deadline || job.deadline);
  const applicationUrl = safeApplicationUrl(job.application_url);
  const postedDate = new Date(job.created_at);
  const postedDateLabel = Number.isNaN(postedDate.getTime()) ? 'Date unavailable' : postedDate.toLocaleDateString();

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-details-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700">
              <Briefcase className="h-3.5 w-3.5" />
              {job.employment_type || 'Opportunity'}
            </div>
            <h2 id="job-details-title" className="break-words text-xl font-black text-slate-900 sm:text-2xl">
              {job.title}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
              <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="font-semibold">{job.company}</span>
              <span className="text-slate-300">•</span>
              <span>{job.location || 'Location not specified'}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close job details"
            className="shrink-0 rounded-xl p-2 text-slate-500 transition hover:bg-white hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-7">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <MapPin className="h-4 w-4 shrink-0 text-blue-600" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Location</p>
                <p className="break-words text-sm font-semibold text-slate-800">{job.location || 'Not specified'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <DollarSign className="h-4 w-4 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Salary / Stipend</p>
                <p className="break-words text-sm font-semibold text-slate-800">{job.salary || 'Not specified'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <Clock3 className="h-4 w-4 shrink-0 text-violet-600" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Experience</p>
                <p className="break-words text-sm font-semibold text-slate-800">{job.experience || 'Not specified'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <CalendarDays className="h-4 w-4 shrink-0 text-orange-600" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Application deadline</p>
                <p className={`break-words text-sm font-semibold ${job.is_expired ? 'text-red-600' : 'text-slate-800'}`}>
                  {deadline || 'Not specified'}
                  {job.is_expired ? ' · Closed' : ''}
                </p>
              </div>
            </div>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-extrabold text-slate-900">Full Description & Responsibilities</h3>
            <div className="whitespace-pre-wrap break-words rounded-2xl border border-slate-100 bg-white p-4 text-sm leading-7 text-slate-700">
              {job.description?.trim() || 'No additional description was provided for this opportunity.'}
            </div>
          </section>

          {job.skills && job.skills.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-extrabold text-slate-900">Skills & Requirements</h3>
              <div className="flex flex-wrap gap-2">
                {job.skills.map((skill, index) => (
                  <span key={`${skill}-${index}`} className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800">
                    {skill}
                  </span>
                ))}
              </div>
            </section>
          )}

          {job.attachment?.name && (
            <section>
              <h3 className="mb-2 text-sm font-extrabold text-slate-900">Additional Documents</h3>
              <DocumentAttachmentView attachment={job.attachment} label="Job Details Document" />
            </section>
          )}

          {applicationUrl && (
            <section>
              <h3 className="mb-2 text-sm font-extrabold text-slate-900">Application Link</h3>
              <a
                href={applicationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-2 break-all text-sm font-semibold text-blue-700 hover:underline"
              >
                {applicationUrl}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
            </section>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" />
              Posted by {job.poster_name || 'SOET Alumni'}
            </span>
            <span>Posted {postedDateLabel}</span>
          </div>
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
          >
            Close
          </button>
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              disabled={actionDisabled}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionLabel}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
