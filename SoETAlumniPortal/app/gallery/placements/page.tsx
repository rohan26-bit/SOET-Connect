'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import PostedAt from '@/components/PostedAt';
import { useAuth } from '@/components/AuthProvider';
import { placementService, PlacementCelebration } from '@/lib/services/placementService';
import { Award, ArrowLeft, ArrowRight, Search, Sparkles } from 'lucide-react';

const PAGE_SIZE = 12;

export default function PlacementCelebrationsPage() {
  const { user } = useAuth();
  const [placements, setPlacements] = useState<PlacementCelebration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;

    const loadPlacements = async () => {
      setLoading(true);
      setError(null);
      try {
        const items = await placementService.getPublished(100);
        if (active) {
          setPlacements(items.sort((a, b) => (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )));
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load placement celebrations.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadPlacements();
    return () => { active = false; };
  }, []);

  const filteredPlacements = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return placements;
    return placements.filter((item) => [
      item.alumni_name,
      item.company_name,
      item.designation,
      item.department,
      item.batch_year,
      item.message,
    ].some((value) => value?.toLowerCase().includes(term)));
  }, [placements, search]);

  const pageCount = Math.max(1, Math.ceil(filteredPlacements.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visiblePlacements = filteredPlacements.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const firstVisible = filteredPlacements.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastVisible = Math.min(currentPage * PAGE_SIZE, filteredPlacements.length);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#8C8178]">
              <Link href="/gallery" className="hover:text-[#C56A25]">Gallery</Link>
              <span>/</span>
              <span className="text-[#C56A25]">Placement Celebrations</span>
            </div>
            <p className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#C56A25]">
              <Sparkles className="h-3.5 w-3.5" /> Proud moments
            </p>
            <h1 className="text-2xl font-black text-[#4A3832] sm:text-3xl">Placement Celebrations</h1>
            <p className="mt-1 max-w-2xl text-sm text-[#6B6B6B]">
              Celebrate the career milestones and achievements of SOET alumni. Newest stories appear first.
            </p>
          </div>
          {user?.role === 'admin' && (
            <Link
              href="/admin/placements"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#F28C38] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#E07D2E]"
            >
              <Award className="h-4 w-4" /> Manage Celebrations
            </Link>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-[#E7DED6] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C8178]" />
            <input
              type="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Search by alumnus, company, role or batch..."
              className="w-full rounded-xl border border-[#DDD7D2] bg-[#FBFAF8] py-2.5 pl-10 pr-4 text-xs text-[#4A3832] outline-none transition focus:border-[#F28C38] focus:ring-2 focus:ring-[#F28C38]/20"
            />
          </div>
          {!loading && !error && (
            <p className="text-xs font-semibold text-[#83766D]">
              {filteredPlacements.length} {filteredPlacements.length === 1 ? 'celebration' : 'celebrations'}
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            {error}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="ml-2 font-bold underline"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="overflow-hidden rounded-2xl border border-[#E7DED6] bg-white">
                <div className="aspect-[16/10] animate-pulse bg-[#F1EAE3]" />
                <div className="space-y-2 p-4">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-[#F1EAE3]" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-[#F1EAE3]" />
                </div>
              </div>
            ))}
          </div>
        ) : !error && visiblePlacements.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#D9C9BB] bg-white px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FBF1E8] text-[#C56A25]">
              <Award className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-extrabold text-[#4A3832]">
              {search ? 'No matching celebrations found' : 'No placement stories yet'}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#83766D]">
              {search
                ? 'Try another name, company, designation or batch year.'
                : 'Published SOET alumni placement stories will appear here.'}
            </p>
          </div>
        ) : !error && (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {visiblePlacements.map((placement) => (
                <article
                  key={placement.id}
                  className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#E7DED6] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-[#F7E8D9] to-[#EBD3BD]">
                    {placement.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={placement.photo_url}
                        alt={placement.alumni_name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[#B77A4C]">
                        <Award className="h-12 w-12" />
                      </div>
                    )}
                    <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#A75A24] shadow-sm">
                      Placed successfully
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h2 className="truncate text-base font-extrabold text-[#4A3832]">{placement.alumni_name}</h2>
                    <p className="mt-1 truncate text-sm font-bold text-[#A75A24]">{placement.company_name}</p>
                    {placement.designation && (
                      <p className="mt-1 text-xs text-[#6B6B6B]">{placement.designation}</p>
                    )}
                    <p className="mt-2 text-[11px] text-[#83766D]">
                      {[placement.department, placement.batch_year ? `Batch ${placement.batch_year}` : ''].filter(Boolean).join(' · ') || 'SOET Alumni'}
                    </p>
                    {placement.message && (
                      <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-[#6B6B6B]">{placement.message}</p>
                    )}
                    <div className="mt-auto border-t border-[#F0EBE6] pt-3">
                      <PostedAt date={placement.created_at} className="block text-[10px] text-[#8C8178]" />
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {pageCount > 1 && (
              <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-[#E7DED6] bg-white px-4 py-3 sm:flex-row">
                <p className="text-xs text-[#83766D]">
                  Showing <span className="font-bold text-[#4A3832]">{firstVisible}–{lastVisible}</span> of{' '}
                  <span className="font-bold text-[#4A3832]">{filteredPlacements.length}</span> celebrations
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#DDD7D2] px-3 py-2 text-xs font-bold text-[#4A3832] transition hover:bg-[#FBF7F2] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Previous
                  </button>
                  <span className="px-2 text-xs font-semibold tabular-nums text-[#6B6B6B]">
                    {currentPage} / {pageCount}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage === pageCount}
                    onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#DDD7D2] px-3 py-2 text-xs font-bold text-[#4A3832] transition hover:bg-[#FBF7F2] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
