'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import LoadingState from '@/components/LoadingState';
import { alumniService, AlumniDirectoryItem, AciClassLeaderboardItem } from '@/lib/services/alumniService';
import { Search, MapPin, Building, GraduationCap, Globe, ExternalLink, X, MessageSquare, Trophy, Crown } from 'lucide-react';

const DEPARTMENTS = [
  'All Departments',
  'Computer Engineering',
  'Information Technology',
  'Artificial Intelligence & Data Science',
  'Electronics & Telecommunication',
  'Mechanical Engineering',
  'Civil Engineering',
  'Electrical Engineering'
];

function getAciRecognition(score: number) {
  if (score >= 300) return { tier: 'Platinum Contributor', badge: '💎', range: '300+ pts' };
  if (score >= 150) return { tier: 'Gold Contributor', badge: '🥇', range: '150–299 pts' };
  if (score >= 50) return { tier: 'Silver Contributor', badge: '🥈', range: '50–149 pts' };
  return { tier: 'Bronze Contributor', badge: '🥉', range: '0–49 pts' };
}

export default function AlumniDirectoryPage() {
  const [alumni, setAlumni] = useState<AlumniDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('All Departments');
  const [sortBy, setSortBy] = useState('');
  const [selectedAlumni, setSelectedAlumni] = useState<AlumniDirectoryItem | null>(null);
  const [classLeaderboard, setClassLeaderboard] = useState<AciClassLeaderboardItem[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  const fetchAlumni = async () => {
    setLoading(true);
    try {
      const data = await alumniService.getApprovedAlumni({
        search: search || undefined,
        department: department !== 'All Departments' ? department : undefined,
        sort_by: sortBy || undefined,
      });
      setAlumni(data);
    } catch (err) {
      console.error('Failed to load alumni directory:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlumni();
  }, [department, sortBy]);

  useEffect(() => {
    let active = true;
    alumniService.getClassLeaderboard()
      .then((data) => {
        if (active) setClassLeaderboard(data.leaderboard || []);
      })
      .catch((err) => {
        if (active) setLeaderboardError(err instanceof Error ? err.message : 'Unable to load the Hall of Fame.');
      })
      .finally(() => {
        if (active) setLeaderboardLoading(false);
      });
    return () => { active = false; };
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAlumni();
  };

  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-[#6B6B6B] mb-6 uppercase tracking-wider">
        <span>Network</span>
        <span className="mx-2 text-[#DDD7D2]">/</span>
        <span className="text-[#F28C38]">Alumni Directory</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Alumni Directory</h1>
          <p className="text-xs text-slate-500 mt-1">
            Connect with verified graduates and industry professionals from our institution.
          </p>
        </div>
      </div>

      {/* Class Hall of Fame */}
      <section className="mb-8 overflow-hidden rounded-3xl border border-amber-200/70 bg-gradient-to-br from-[#FFF9F0] via-white to-[#FFF3E4] p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">
              <Crown className="h-4 w-4" /> SOET legacy
            </p>
            <h2 className="text-xl font-black text-[#4A3832] sm:text-2xl">Class Hall of Fame</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">
              Graduation classes ranked by the combined ACI points earned by their verified alumni.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-white/80 px-3 py-2 text-xs font-bold text-amber-800">
            <Trophy className="h-4 w-4" />
            {classLeaderboard.length} {classLeaderboard.length === 1 ? 'class ranked' : 'classes ranked'}
          </div>
        </div>

        {leaderboardLoading ? (
          <div className="rounded-2xl border border-amber-100 bg-white/80 p-6 text-center text-xs font-medium text-slate-500">
            Calculating class contributions…
          </div>
        ) : leaderboardError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
            {leaderboardError}
          </div>
        ) : classLeaderboard.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-200 bg-white/70 p-6 text-center text-xs text-slate-500">
            The Hall of Fame will appear once verified alumni have joined the directory.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {classLeaderboard.slice(0, 3).map((cohort) => (
                <article
                  key={cohort.graduation_year}
                  className={`rounded-2xl border p-4 shadow-sm ${cohort.rank === 1 ? 'border-amber-300 bg-white' : 'border-slate-200 bg-white/85'}`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-xl">
                        {cohort.rank === 1 ? '🏆' : cohort.rank === 2 ? '🥈' : '🥉'}
                      </span>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rank #{cohort.rank}</p>
                        <h3 className="text-base font-black text-[#4A3832]">{cohort.graduation_year === 'Unspecified' ? 'Batch not provided' : `Class of ${cohort.graduation_year}`}</h3>
                      </div>
                    </div>
                    {cohort.rank === 1 && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-amber-800">
                        Leading class
                      </span>
                    )}
                  </div>

                  <div className="flex items-end justify-between border-b border-slate-100 pb-3">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Total ACI points</p>
                      <p className="text-3xl font-black tabular-nums text-[#A75A24]">{cohort.total_aci_points.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Average / alumnus</p>
                      <p className="text-lg font-extrabold tabular-nums text-slate-700">{cohort.average_aci_points}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-slate-600">
                    <span>{cohort.alumni_count} verified {cohort.alumni_count === 1 ? 'alumnus' : 'alumni'}</span>
                    <span className="font-bold text-emerald-700">{cohort.contributing_alumni_count} active contributors</span>
                  </div>
                  {cohort.top_contributor && (
                    <p className="mt-2 truncate text-[10px] text-slate-500">
                      Top contributor: <strong className="text-slate-700">{cohort.top_contributor.name}</strong>
                      <span className="font-bold text-blue-700"> · {cohort.top_contributor.aci_score} pts</span>
                    </p>
                  )}
                </article>
              ))}
            </div>

            {classLeaderboard.length > 3 && (
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white/85">
                {classLeaderboard.slice(3).map((cohort) => (
                  <div key={cohort.graduation_year} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="w-8 text-center text-xs font-black text-slate-400">#{cohort.rank}</span>
                      <span className="text-xs font-bold text-[#4A3832]">{cohort.graduation_year === 'Unspecified' ? 'Batch not provided' : `Class of ${cohort.graduation_year}`}</span>
                      <span className="text-[10px] text-slate-400">{cohort.alumni_count} alumni</span>
                    </div>
                    <span className="text-xs font-black tabular-nums text-[#A75A24]">{cohort.total_aci_points.toLocaleString()} pts</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-amber-100 pt-3 text-[10px] text-slate-500">
          <span className="font-bold uppercase tracking-wider text-slate-400">Individual ACI tiers:</span>
          <span>🥉 Bronze 0–49</span>
          <span>🥈 Silver 50–149</span>
          <span>🥇 Gold 150–299</span>
          <span>💎 Platinum 300+</span>
        </div>
        <p className="mt-1 text-[9px] text-slate-400">
          Class rankings use combined ACI scores. Individual tier badges are recalculated directly from each alumnus’s current score.
        </p>
      </section>

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-8">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, company, skills..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Default Order</option>
              <option value="aci">Sort by ACI (Top Contributors)</option>
            </select>

            <button
              type="submit"
              className="px-5 py-2.5 bg-[#F28C38] hover:bg-[#E07D2E] text-white rounded-xl text-xs font-bold shadow-md shadow-[#F28C38]/20 transition cursor-pointer"
            >
              Search
            </button>
          </div>
        </form>
      </div>

      {/* Alumni Grid */}
      {loading ? (
        <LoadingState message="Loading alumni profiles" className="py-16" />
      ) : alumni.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm">
          <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Alumni Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            No verified alumni matched your current search filters. Try clearing or expanding your query.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {alumni.map((alum) => (
            <div
              key={alum.id}
              className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start gap-4 mb-4">
                  {alum.avatar_url ? (
                    <img
                      src={alum.avatar_url}
                      alt={alum.full_name}
                      className="w-14 h-14 rounded-2xl object-cover border border-slate-100"
                    />
                  ) : (
                    <div className="w-14 h-14 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl text-white font-bold text-lg flex items-center justify-center shadow-md shadow-blue-600/20 shrink-0">
                      {alum.full_name.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 className="font-bold text-slate-900 text-base leading-tight">{alum.full_name}</h3>
                    <p className="text-xs text-blue-600 font-semibold mt-0.5">{alum.designation || 'Alumni'}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                      <Building className="w-3 h-3 text-slate-400" /> {alum.company || 'Enterprise'}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 py-3 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{alum.department} • Class of {alum.graduation_year}</span>
                  </div>
                  {alum.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{alum.location}</span>
                    </div>
                  )}
                </div>

                {alum.skills && alum.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {alum.skills.slice(0, 3).map((s, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-semibold rounded-md">
                        {s}
                      </span>
                    ))}
                    {alum.skills.length > 3 && (
                      <span className="text-[10px] text-slate-400 font-bold self-center">
                        +{alum.skills.length - 3} more
                      </span>
                    )}
                  </div>
                )}

                {/* ACI Recognition Badge & Score */}
                {alum.aci_score !== undefined && (
                  <div className="mt-3.5 py-2 px-3 bg-slate-50/90 rounded-xl border border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base select-none">{getAciRecognition(alum.aci_score || 0).badge}</span>
                      <span className="text-xs font-bold text-slate-800">{getAciRecognition(alum.aci_score || 0).tier}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ACI:</span>
                      <span className="text-xs font-black text-blue-600">{alum.aci_score}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {alum.linkedin && (
                    <a
                      href={alum.linkedin}
                      target="_blank"
                      rel="noreferrer"
                      title="LinkedIn Profile"
                      className="p-1.5 bg-slate-50 hover:bg-blue-50 text-slate-500 hover:text-blue-600 rounded-lg transition"
                    >
                      <Globe className="w-4 h-4" />
                    </a>
                  )}
                  {alum.github && (
                    <a
                      href={alum.github}
                      target="_blank"
                      rel="noreferrer"
                      title="GitHub Profile"
                      className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-900 rounded-lg transition"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>

                <button
                  onClick={() => setSelectedAlumni(alum)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  View Profile
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Profile Modal */}
      {selectedAlumni && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative border border-slate-100 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedAlumni(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-4 mb-6">
              {selectedAlumni.avatar_url ? (
                <img
                  src={selectedAlumni.avatar_url}
                  alt={selectedAlumni.full_name}
                  className="w-16 h-16 rounded-2xl object-cover"
                />
              ) : (
                <div className="w-16 h-16 bg-blue-600 text-white font-bold text-xl rounded-2xl flex items-center justify-center">
                  {selectedAlumni.full_name.substring(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <h3 className="text-xl font-bold text-slate-900">{selectedAlumni.full_name}</h3>
                <p className="text-xs text-blue-600 font-semibold">{selectedAlumni.designation} at {selectedAlumni.company}</p>
                <p className="text-xs text-slate-500 mt-1">{selectedAlumni.department} • Batch {selectedAlumni.graduation_year}</p>
              </div>
            </div>

            {selectedAlumni.aci_score !== undefined && (
              <div className="mb-4 p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50/70 border border-blue-100 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl select-none">{getAciRecognition(selectedAlumni.aci_score || 0).badge}</span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{getAciRecognition(selectedAlumni.aci_score || 0).tier}</h4>
                    <p className="text-[11px] text-slate-500">Alumni Contribution Index</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-black text-blue-600">{selectedAlumni.aci_score} pts</div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Verified Score</div>
                </div>
              </div>
            )}

            {selectedAlumni.bio && (
              <div className="mb-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">About</h4>
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl">
                  {selectedAlumni.bio}
                </p>
              </div>
            )}

            {selectedAlumni.skills && selectedAlumni.skills.length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Skills & Expertise</h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedAlumni.skills.map((s, i) => (
                    <span key={i} className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setSelectedAlumni(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Close
              </button>
              <Link
                href={`/student/chat?userId=${selectedAlumni.id}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#F28C38] hover:bg-[#E07D2E] text-white text-xs font-bold rounded-xl shadow-md shadow-[#F28C38]/20 transition cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Send Message</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
