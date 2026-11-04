'use client';

import { useEffect } from 'react';
import {
  CalendarDays,
  Clock3,
  MapPin,
  Users,
  UserRound,
  Tag,
  X,
} from 'lucide-react';
import { EventItem } from '@/lib/services/eventService';
import { DocumentAttachmentView } from '@/components/DocumentAttachment';

interface EventDetailsModalProps {
  event: EventItem | null;
  onClose: () => void;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  actionVariant?: 'primary' | 'danger';
}

function parseEventDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T00:00:00' : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatEventDate(value?: string): string {
  const date = parseEventDate(value);
  return date
    ? date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : 'Not specified';
}

function formatEventDateTime(value?: string): string {
  const date = parseEventDate(value);
  if (!date) return 'Not specified';
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function getSafeImageUrl(value?: string): string | null {
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function EventDetailsModal({
  event,
  onClose,
  actionLabel,
  onAction,
  actionDisabled = false,
  actionVariant = 'primary',
}: EventDetailsModalProps) {
  useEffect(() => {
    if (!event) return;
    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [event, onClose]);

  if (!event) return null;

  const imageUrl = getSafeImageUrl(event.image_url);
  const dateRange = event.end_date && event.end_date !== event.event_date
    ? `${formatEventDate(event.event_date)} – ${formatEventDate(event.end_date)}`
    : formatEventDate(event.event_date);
  const timeRange = [event.start_time, event.end_time].filter(Boolean).join(' – ');
  const actionClass = actionVariant === 'danger'
    ? 'bg-red-600 hover:bg-red-700'
    : 'bg-blue-600 hover:bg-blue-700';
  const postedDate = parseEventDate(event.created_at);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5"
      onMouseDown={(mouseEvent) => {
        if (mouseEvent.target === mouseEvent.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-details-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {event.event_type && (
                <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                  {event.event_type}
                </span>
              )}
              {event.status && (
                <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                  event.status === 'approved'
                    ? 'bg-emerald-50 text-emerald-700'
                    : event.status === 'rejected'
                      ? 'bg-red-50 text-red-700'
                      : event.status === 'cancelled'
                        ? 'bg-slate-200 text-slate-700'
                        : 'bg-amber-50 text-amber-700'
                }`}>
                  {event.status}
                </span>
              )}
              {event.is_past && (
                <span className="rounded-full bg-slate-200 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                  Past event
                </span>
              )}
              {event.is_registration_closed && !event.is_past && (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                  Registration closed
                </span>
              )}
            </div>
            <h2 id="event-details-title" className="break-words text-xl font-black text-slate-900 sm:text-2xl">
              {event.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close event details"
            className="shrink-0 rounded-xl p-2 text-slate-500 transition hover:bg-white hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-7">
          {imageUrl ? (
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
              <img
                src={imageUrl}
                alt={event.title}
                className="max-h-72 w-full object-cover"
              />
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <CalendarDays className="h-4 w-4 shrink-0 text-blue-600" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Event date</p>
                <p className="break-words text-sm font-semibold text-slate-800">{dateRange}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <Clock3 className="h-4 w-4 shrink-0 text-violet-600" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Event time</p>
                <p className="break-words text-sm font-semibold text-slate-800">{timeRange || 'Not specified'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 sm:col-span-2">
              <MapPin className="h-4 w-4 shrink-0 text-rose-600" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Venue / Platform</p>
                <p className="break-words text-sm font-semibold text-slate-800">{event.location || 'Not specified'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <CalendarDays className="h-4 w-4 shrink-0 text-orange-600" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Registration deadline</p>
                <p className="break-words text-sm font-semibold text-slate-800">
                  {event.registration_deadline ? formatEventDateTime(event.registration_deadline) : 'Not specified'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <Users className="h-4 w-4 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Registrations</p>
                <p className="break-words text-sm font-semibold text-slate-800">{event.registration_count ?? 0} registered</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <Users className="h-4 w-4 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Your registration</p>
                <p className={`break-words text-sm font-semibold ${event.is_registered ? 'text-emerald-700' : 'text-slate-800'}`}>
                  {event.is_registered ? 'You are registered' : 'Not registered'}
                </p>
              </div>
            </div>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-extrabold text-slate-900">Full Event Description & Agenda</h3>
            <div className="whitespace-pre-wrap break-words rounded-2xl border border-slate-100 bg-white p-4 text-sm leading-7 text-slate-700">
              {event.description?.trim() || 'No additional description was provided for this event.'}
            </div>
          </section>

          {event.tags && event.tags.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-extrabold text-slate-900">Topics & Tags</h3>
              <div className="flex flex-wrap gap-2">
                {event.tags.map((tag, index) => (
                  <span key={`${tag}-${index}`} className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800">
                    <Tag className="h-3 w-3" /> {tag}
                  </span>
                ))}
              </div>
            </section>
          )}

          {event.attachment?.name && (
            <section>
              <h3 className="mb-2 text-sm font-extrabold text-slate-900">Event Documents</h3>
              <DocumentAttachmentView attachment={event.attachment} label="Event Details Document" />
            </section>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" />
              Organized by {event.creator_name || 'SOET Connect'}
            </span>
            <span>{postedDate ? `Posted ${postedDate.toLocaleDateString()}` : ''}</span>
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
              className={`rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${actionClass}`}
            >
              {actionLabel}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
