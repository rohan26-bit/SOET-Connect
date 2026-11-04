'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Award, ArrowRight, Sparkles } from 'lucide-react';
import { placementService, PlacementCelebration } from '@/lib/services/placementService';
import { useAuth } from '@/components/AuthProvider';
import LoadingState from '@/components/LoadingState';
import PostedAt from '@/components/PostedAt';

export default function DashboardPlacementCelebrations() {
  const { user } = useAuth();
  const [placements, setPlacements] = useState<PlacementCelebration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    placementService.getPublished(100)
      .then((items) => { if (active) setPlacements(items); })
      .catch((error) => console.error('Failed to load placement celebrations:', error))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <section className="mb-8 rounded-3xl border border-[#E7DED6] bg-white p-5 sm:p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#C56A25]">
            <Sparkles className="h-3.5 w-3.5" /> Proud moments
          </p>
          <h2 className="text-xl font-black text-[#4A3832]">Placement Celebrations</h2>
          <p className="mt-1 text-xs text-[#6B6B6B]">Celebrating SOET alumni and their career achievements.</p>
        </div>
        {user?.role === 'admin' && (
          <Link href="/admin/placements" className="inline-flex items-center gap-1 text-xs font-bold text-[#A75A24] hover:underline">
            Manage celebrations <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {loading ? (
        <LoadingState message="Loading placement celebrations" className="py-6" />
      ) : placements.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D9C9BB] bg-[#FBF9F6] px-5 py-7 text-center">
          <Award className="mx-auto mb-2 h-7 w-7 text-[#D18A50]" />
          <p className="text-sm font-bold text-[#4A3832]">New success stories are on their way.</p>
          <p className="mt-1 text-xs text-[#83766D]">Published placement celebrations will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {placements.slice(0, 6).map((placement) => (
            <article key={placement.id} className="flex min-w-0 overflow-hidden rounded-2xl border border-[#E7DED6] bg-[#FBFAF8]">
              <div className="h-32 w-28 shrink-0 overflow-hidden bg-gradient-to-br from-[#F7E8D9] to-[#EBD3BD] sm:w-32">
                {placement.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={placement.photo_url} alt={placement.alumni_name} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[#B77A4C]"><Award className="h-9 w-9" /></div>
                )}
              </div>
              <div className="min-w-0 flex-1 p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-[#C56A25]">Placed successfully</p>
                <h3 className="mt-1 truncate text-sm font-extrabold text-[#4A3832]">{placement.alumni_name}</h3>
                <p className="mt-1 truncate text-xs font-bold text-[#A75A24]">{placement.company_name}</p>
                {placement.designation && <p className="mt-1 line-clamp-1 text-[11px] text-[#6B6B6B]">{placement.designation}</p>}
                <p className="mt-1 text-[10px] text-[#83766D]">
                  {[placement.department, placement.batch_year ? `Batch ${placement.batch_year}` : ''].filter(Boolean).join(' · ') || 'SOET Alumni'}
                </p>
                <PostedAt date={placement.created_at} className="mt-2 block text-[10px] text-[#8C8178]" />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
