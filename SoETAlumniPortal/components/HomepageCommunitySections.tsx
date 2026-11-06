'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Award, Image as ImageIcon, Sparkles } from 'lucide-react';
import { placementService, PlacementCelebration } from '@/lib/services/placementService';
import { GalleryPhoto } from '@/lib/services/galleryService';
import PostedAt from '@/components/PostedAt';
import PlacementDetailsModal from '@/components/PlacementDetailsModal';

export default function HomepageCommunitySections() {
  const [placements, setPlacements] = useState<PlacementCelebration[]>([]);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingPlacement, setViewingPlacement] = useState<PlacementCelebration | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      placementService.getPublished(4).catch(() => []),
      fetch('/api/gallery?limit=6', { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) return [];
          const data = await response.json();
          return Array.isArray(data.photos) ? data.photos : [];
        })
        .catch(() => []),
    ]).then(([placementData, photoData]) => {
      if (!active) return;
      setPlacements(placementData);
      setPhotos(photoData as GalleryPhoto[]);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return (
    <div className="bg-[#F7F4EF]">
      <section className="max-w-6xl mx-auto px-6 sm:px-8 py-14 sm:py-16">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-7">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#C56A25] mb-2">Proud moments</p>
            <h2 className="text-2xl sm:text-3xl font-black text-[#4A3832]">Placement Celebrations</h2>
            <p className="text-sm text-[#6B6B6B] mt-2">Celebrating SOET alumni as they take the next step in their careers.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[#A75A24]">
              <Sparkles className="w-4 h-4" /> Alumni achievements
            </div>
            <Link
              href="/gallery/placements"
              className="inline-flex items-center gap-2 text-sm font-bold text-[#A75A24] transition hover:text-[#7C3E16]"
            >
              Explore all celebrations <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-[#E4DCD4] bg-white p-8 text-center text-sm text-[#8B8178]">Loading placement celebrations…</div>
        ) : placements.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D9C9BB] bg-white/80 p-8 text-center">
            <Award className="w-8 h-8 mx-auto text-[#D18A50] mb-3" />
            <p className="font-bold text-[#4A3832]">Every success story starts somewhere.</p>
            <p className="text-xs text-[#83766D] mt-1">New placement celebrations will appear here when published by SOET administrators.</p>
          </div>
        ) : (
          <>
            <div className="placement-marquee-shell rounded-2xl bg-[#4A3832] text-white py-3 mb-6 overflow-hidden">
              <div className="placement-marquee-track">
                {[...placements, ...placements].map((placement, index) => (
                  <span className="inline-flex items-center gap-2 px-5 whitespace-nowrap text-sm" key={`${placement.id}-ticker-${index}`}>
                    <Sparkles className="w-3.5 h-3.5 text-[#F6A15A]" />
                    <strong>Congratulations, {placement.alumni_name}!</strong>
                    <span className="text-[#F6D7BE]">Placed at {placement.company_name}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {placements.map((placement) => (
                <article key={placement.id} className="overflow-hidden rounded-2xl bg-white border border-[#E7DED6] shadow-sm">
                  <div className="h-48 bg-gradient-to-br from-[#F7E8D9] to-[#EBD3BD] overflow-hidden">
                    {placement.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={placement.photo_url} alt={placement.alumni_name} className="w-full h-full object-cover object-center" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#B77A4C]"><Award className="w-12 h-12" /></div>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-[10px] uppercase font-bold tracking-[0.16em] text-[#C56A25] mb-1">Placed successfully</p>
                    <h3 className="font-extrabold text-[#4A3832]">{placement.alumni_name}</h3>
                    <p className="text-sm font-bold text-[#A75A24] mt-1">{placement.company_name}</p>
                    {placement.designation && <p className="text-xs text-[#6B6B6B] mt-1">{placement.designation}</p>}
                    <p className="text-[11px] text-[#8C8178] mt-2">
                      {[placement.department, placement.batch_year ? `Batch ${placement.batch_year}` : ''].filter(Boolean).join(' · ') || 'SOET Alumni'}
                    </p>
                    <PostedAt date={placement.created_at} className="text-[10px] text-[#8C8178] block mt-1" />
                    {placement.message && <p className="text-xs text-[#6B6B6B] mt-3 line-clamp-3 whitespace-pre-wrap">{placement.message}</p>}
                    <button
                      type="button"
                      onClick={() => setViewingPlacement(placement)}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#A75A24] hover:text-[#7C3E16] hover:underline"
                    >
                      Read Full Story <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="bg-white border-y border-[#E5DDD5]">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-14 sm:py-16">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-7">
            <div>
              <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#C56A25] mb-2">Life at SOET</p>
              <h2 className="text-2xl sm:text-3xl font-black text-[#4A3832]">Alumni Photo Gallery</h2>
              <p className="text-sm text-[#6B6B6B] mt-2">Campus memories, reunions, events and convocation moments shared by our community.</p>
            </div>
            <Link href="/gallery" className="inline-flex items-center gap-2 text-sm font-bold text-[#A75A24] hover:text-[#7C3E16] transition">
              Explore full gallery <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-[#F8F5F1] p-8 text-center text-sm text-[#8B8178]">Loading recent memories…</div>
          ) : photos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#D9C9BB] bg-[#FBF9F6] p-8 text-center">
              <ImageIcon className="w-8 h-8 mx-auto text-[#B7A89B] mb-3" />
              <p className="font-bold text-[#4A3832]">The gallery is waiting for its next memory.</p>
              <p className="text-xs text-[#83766D] mt-1">Approved alumni photos will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {photos.slice(0, 6).map((photo) => (
                <Link href="/gallery" key={photo.id} className="group relative aspect-[4/3] rounded-xl overflow-hidden bg-[#F0E8E0]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.image_url || `/api/gallery/${photo.id}/image`} alt={photo.title || 'SOET alumni memory'} loading="lazy" className="w-full h-full object-cover transition duration-500 group-hover:scale-105" />
                  <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/75 to-transparent text-white">
                    <p className="text-xs sm:text-sm font-bold truncate">{photo.title || photo.event_name || 'SOET Memory'}</p>
                    <p className="text-[10px] text-white/80 truncate">{photo.event_name || photo.user_name || 'SOET Community'}</p>
                    <PostedAt date={photo.created_at} className="text-[10px] text-white/80 block mt-1" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
      <PlacementDetailsModal placement={viewingPlacement} onClose={() => setViewingPlacement(null)} />
      <style jsx global>{`
        @keyframes soet-placement-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .placement-marquee-track {
          display: flex;
          width: max-content;
          animation: soet-placement-marquee 38s linear infinite;
        }
        .placement-marquee-shell:hover .placement-marquee-track {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .placement-marquee-track { animation: none; flex-wrap: wrap; width: auto; }
        }
      `}</style>
    </div>
  );
}
