'use client';

import { useEffect } from 'react';
import { CalendarClock, Megaphone, Users, GraduationCap, X } from 'lucide-react';
import { AnnouncementItem } from '@/lib/services/announcementService';
import { DocumentAttachmentView } from '@/components/DocumentAttachment';

interface AnnouncementDetailsModalProps {
  announcement: AnnouncementItem | null;
  onClose: () => void;
}

function formatDate(value?: string): string {
  if (!value) return 'Not specified';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Not specified'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AnnouncementDetailsModal({
  announcement,
  onClose,
}: AnnouncementDetailsModalProps) {
  useEffect(() => {
    if (!announcement) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [announcement, onClose]);

  if (!announcement) return null;

  const audience = announcement.target_audience || 'all';
  const AudienceIcon = audience === 'students' ? GraduationCap : audience === 'alumni' ? Users : Megaphone;

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-details-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
              <AudienceIcon className="h-3.5 w-3.5" />
              Audience: {audience}
            </span>
            <h2 id="announcement-details-title" className="break-words text-xl font-black text-slate-900 sm:text-2xl">
              {announcement.title}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close announcement details" className="shrink-0 rounded-xl p-2 text-slate-500 transition hover:bg-white hover:text-slate-900">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-7">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <CalendarClock className="h-4 w-4 shrink-0 text-blue-600" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Published</p>
                <p className="break-words text-sm font-semibold text-slate-800">{formatDate(announcement.created_at)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <CalendarClock className="h-4 w-4 shrink-0 text-orange-600" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expiry</p>
                <p className={`break-words text-sm font-semibold ${announcement.is_expired ? 'text-red-600' : 'text-slate-800'}`}>
                  {announcement.expires_at ? formatDate(announcement.expires_at) : 'No expiry set'}
                  {announcement.is_expired ? ' · Expired' : ''}
                </p>
              </div>
            </div>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-extrabold text-slate-900">Full Announcement</h3>
            <div className="whitespace-pre-wrap break-words rounded-2xl border border-slate-100 bg-white p-4 text-sm leading-7 text-slate-700">
              {announcement.content?.trim() || 'No announcement content was provided.'}
            </div>
          </section>

          {announcement.attachment?.name && (
            <section>
              <h3 className="mb-2 text-sm font-extrabold text-slate-900">Attached Document</h3>
              <DocumentAttachmentView attachment={announcement.attachment} label="Announcement Attachment" />
            </section>
          )}

          <div className="border-t border-slate-100 pt-4 text-xs text-slate-500">
            Published by {announcement.creator_name || 'SOET Administration'}
          </div>
        </div>

        <footer className="flex justify-end border-t border-slate-100 bg-slate-50 px-5 py-4 sm:px-7">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100">
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}
