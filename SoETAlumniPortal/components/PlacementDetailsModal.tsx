'use client';

import { useEffect } from 'react';
import { Award, CalendarDays, GraduationCap, Building2, X } from 'lucide-react';
import { PlacementCelebration } from '@/lib/services/placementService';
import PostedAt from '@/components/PostedAt';
import { getSafePlacementPhotoUrl } from '@/lib/utils/placementPhotoUrl';

interface PlacementDetailsModalProps {
  placement: PlacementCelebration | null;
  onClose: () => void;
  showPublishingStatus?: boolean;
}

export default function PlacementDetailsModal({
  placement,
  onClose,
  showPublishingStatus = false,
}: PlacementDetailsModalProps) {
  useEffect(() => {
    if (!placement) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [placement, onClose]);

  if (!placement) return null;

  const photoUrl = getSafePlacementPhotoUrl(placement.photo_url);

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="placement-details-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[#E7DED6] bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#E7DED6] bg-[#FBF8F4] px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[#FBEBDD] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#A75A24]">
              <Award className="h-3.5 w-3.5" /> Placement celebration
            </span>
            <h2 id="placement-details-title" className="break-words text-xl font-black text-[#4A3832] sm:text-2xl">
              {placement.alumni_name}
            </h2>
            <p className="mt-1 break-words text-sm font-bold text-[#A75A24]">{placement.company_name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close placement details" className="shrink-0 rounded-xl p-2 text-[#83766D] transition hover:bg-white hover:text-[#4A3832]">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-7">
          {photoUrl && (
            <div className="overflow-hidden rounded-2xl border border-[#E7DED6] bg-[#F7F0E9]">
              <img src={photoUrl} alt={placement.alumni_name} className="max-h-80 w-full object-contain" />
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-2xl border border-[#E7DED6] bg-[#FBF8F4] p-3">
              <Building2 className="h-4 w-4 shrink-0 text-[#A75A24]" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#8C8178]">Designation</p>
                <p className="break-words text-sm font-semibold text-[#4A3832]">{placement.designation || 'Not specified'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-[#E7DED6] bg-[#FBF8F4] p-3">
              <GraduationCap className="h-4 w-4 shrink-0 text-[#A75A24]" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#8C8178]">Department & Batch</p>
                <p className="break-words text-sm font-semibold text-[#4A3832]">
                  {[placement.department, placement.batch_year ? `Batch ${placement.batch_year}` : ''].filter(Boolean).join(' · ') || 'SOET Alumni'}
                </p>
              </div>
            </div>
          </div>

          {placement.message && (
            <section>
              <h3 className="mb-2 text-sm font-extrabold text-[#4A3832]">Full Congratulations Message</h3>
              <div className="whitespace-pre-wrap break-words rounded-2xl border border-[#E7DED6] bg-white p-4 text-sm leading-7 text-[#5D5048]">
                {placement.message}
              </div>
            </section>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E7DED6] pt-4 text-xs text-[#83766D]">
            <span>Shared with permission by SOET Alumni</span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              <PostedAt date={placement.created_at} className="text-xs text-[#83766D]" />
            </span>
          </div>

          {showPublishingStatus && (
            <p className={`text-xs font-bold ${placement.is_published ? 'text-emerald-700' : 'text-slate-600'}`}>
              {placement.is_published ? 'Published' : 'Draft'}
            </p>
          )}
        </div>

        <footer className="flex justify-end border-t border-[#E7DED6] bg-[#FBF8F4] px-5 py-4 sm:px-7">
          <button type="button" onClick={onClose} className="rounded-xl border border-[#DDD7D2] bg-white px-5 py-2.5 text-xs font-bold text-[#4A3832] transition hover:bg-[#F5EFE8]">
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}
