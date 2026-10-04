'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/components/AuthProvider';
import { jobService, JobItem } from '@/lib/services/jobService';
import { eventService, EventItem } from '@/lib/services/eventService';
import { announcementService, AnnouncementItem } from '@/lib/services/announcementService';
import { alumniService, AlumniAciResponse } from '@/lib/services/alumniService';
import { 
  Briefcase, Calendar, Megaphone, Plus, 
  ShieldCheck, ShieldAlert, ArrowRight, Building, MapPin, Clock, Award, CheckCircle2
} from 'lucide-react';
import LoadingState from '@/components/LoadingState';

export default function AlumniDashboard() {
  const { user } = useAuth();
  const [myJobs, setMyJobs] = useState<JobItem[]>([]);
  const [myEvents, setMyEvents] = useState<EventItem[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [aciData, setAciData] = useState<AlumniAciResponse | null>(null);
  const [aciLoading, setAciLoading] = useState(true);
  const [aciError, setAciError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!user) return;
      try {
        const [jobsData, eventsData, announcementsData] = await Promise.all([
          jobService.getMyPostedJobs(user.id),
          eventService.getMyEvents(user.id),
          announcementService.getAnnouncements(),
        ]);
        setMyJobs(jobsData);
        setMyEvents(eventsData);
        setAnnouncements(announcementsData);
      } catch (err) {
        console.error('Error loading alumni dashboard data:', err);
      } finally {
        setLoading(false);
      }

      // Fetch ACI metrics dynamically from FastAPI
      try {
        const aci = await alumniService.getMyAci();
        setAciData(aci);
      } catch (err: any) {
        // Handle unverified or network error gracefully
        console.warn('ACI metrics unavailable:', err.message);
        setAciError(err.message || 'Contribution metrics unavailable');
      } finally {
        setAciLoading(false);
      }
    }
    loadData();
  }, [user]);

  const userName = user?.full_name || 'Alumni Member';
  const company = user?.alumni_profile?.company || 'Enterprise';
  const designation = user?.alumni_profile?.designation || 'Alumni';
  const batch = user?.alumni_profile?.graduation_year || 'SOET';
  const verificationStatus = user?.is_verified ? 'approved' : 'pending';

  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-[#6B6B6B] mb-6 uppercase tracking-wider">
        <span>Portal</span>
        <span className="mx-2 text-[#DDD7D2]">/</span>
        <span className="text-[#F28C38]">Alumni Enterprise Dashboard</span>
      </div>

      {/* Verification Notice Banner if Pending */}
      {verificationStatus === 'pending' && (
        <div className="mb-8 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3.5 text-amber-900">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800">Verification Pending</h4>
            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
              Your profile is currently under review by the SOET department administrator. Once verified, all your posted jobs and networking events will become publicly visible to students.
            </p>
          </div>
        </div>
      )}

      {/* Header Profile Summary */}
      <div className="bg-white rounded-3xl p-8 border border-[#DDD7D2] shadow-sm mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-black text-[#4A3832]">{userName}</h1>
            {verificationStatus === 'approved' && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold uppercase tracking-wider border border-emerald-200">
                <ShieldCheck className="w-3 h-3 text-emerald-600" /> Verified
              </span>
            )}
          </div>
          <p className="text-xs text-[#6B6B6B]">
            {designation} at <span className="font-semibold text-[#4A3832]">{company}</span> • Class of {batch}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/student/jobs"
            className="flex items-center gap-2 px-5 py-2.5 bg-[#F28C38] hover:bg-[#E07D2E] text-white rounded-xl text-xs font-bold shadow-lg shadow-[#F28C38]/25 transition"
          >
            <Plus className="w-4 h-4" /> Post Job / Internship
          </Link>
          <Link
            href="/student/events"
            className="flex items-center gap-2 px-5 py-2.5 bg-[#4A3832] hover:bg-[#3D2E28] text-white rounded-xl text-xs font-bold shadow-md transition"
          >
            <Plus className="w-4 h-4" /> Host Event
          </Link>
        </div>
      </div>

      {/* Alumni Contribution Index (ACI) Card */}
      <div className="bg-[#4A3832] rounded-3xl p-6 sm:p-8 text-white shadow-xl mb-8 border border-[#6B5147]">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-[#6B5147]">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] uppercase tracking-wider font-extrabold text-[#F6A15A] bg-[#F28C38]/20 px-3 py-1 rounded-full border border-[#F28C38]/30">
                Official Recognition Index
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <Award className="w-6 h-6 text-[#F6A15A] shrink-0" />
              <span>Alumni Contribution Index</span>
            </h2>
            <p className="text-xs text-[#DDD7D2] mt-1 max-w-xl leading-relaxed">
              Transparent institutional metric measuring active giving back through approved jobs posted, campus events hosted, and event attendance.
            </p>
          </div>

          {/* Current Tier & Score Highlights */}
          {aciLoading ? (
            <div className="text-xs text-[#DDD7D2] animate-pulse bg-[#3D2E28] px-5 py-4 rounded-2xl border border-[#6B5147]">
              Calculating ACI score...
            </div>
          ) : aciData ? (
            <div className="flex items-center gap-4 bg-[#3D2E28] px-6 py-4 rounded-2xl border border-[#6B5147] self-stretch sm:self-auto justify-between sm:justify-start">
              <div className="text-4xl select-none" title={aciData.tier}>{aciData.badge}</div>
              <div>
                <div className="text-xs font-bold text-[#F6A15A]">{aciData.tier}</div>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-3xl font-black text-white">{aciData.score}</span>
                  <span className="text-xs font-bold text-[#DDD7D2]/80 uppercase tracking-wider">ACI Points</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-[#DDD7D2] bg-[#3D2E28] px-5 py-4 rounded-2xl border border-[#6B5147] max-w-xs">
              {verificationStatus === 'pending'
                ? 'Verification Pending — your ACI activates automatically upon administrator authorization.'
                : (aciError || 'Contribution score unavailable.')}
            </div>
          )}
        </div>

        {/* Breakdown & Verified Activities */}
        {aciData && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            {/* Points Breakdown */}
            <div className="bg-[#3D2E28]/80 rounded-2xl p-5 border border-[#6B5147]">
              <div className="text-xs font-bold uppercase tracking-wider text-[#DDD7D2] mb-3 flex items-center justify-between">
                <span>Points Breakdown</span>
                <span className="text-[11px] text-[#F6A15A] font-extrabold">{aciData.score} Total Pts</span>
              </div>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between py-1.5 border-b border-[#6B5147]/60">
                  <span className="flex items-center gap-2 text-[#DDD7D2]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Account Verification
                  </span>
                  <span className="font-bold text-emerald-400">+{aciData.breakdown.verification} pts</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-[#6B5147]/60">
                  <span className="flex items-center gap-2 text-[#DDD7D2]">
                    <Briefcase className="w-3.5 h-3.5 text-[#F6A15A]" /> Approved Jobs (+50 each)
                  </span>
                  <span className="font-bold text-[#F6A15A]">+{aciData.breakdown.jobs} pts</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-[#6B5147]/60">
                  <span className="flex items-center gap-2 text-[#DDD7D2]">
                    <Calendar className="w-3.5 h-3.5 text-[#F28C38]" /> Campus Events Hosted (+40 each)
                  </span>
                  <span className="font-bold text-[#F28C38]">+{aciData.breakdown.events} pts</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="flex items-center gap-2 text-[#DDD7D2]">
                    <Clock className="w-3.5 h-3.5 text-amber-400" /> Event Registrations (Capped at 100)
                  </span>
                  <span className="font-bold text-amber-400">+{aciData.breakdown.registrations} pts</span>
                </div>
              </div>
            </div>

            {/* Verified Activity Counts */}
            <div className="bg-[#3D2E28]/80 rounded-2xl p-5 border border-[#6B5147] flex flex-col justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-[#DDD7D2] mb-3">
                <span>Verified Activity Summary</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center my-auto">
                <div className="bg-[#4A3832] p-3 rounded-xl border border-[#6B5147]">
                  <div className="text-2xl font-black text-white">{aciData.activity_counts.approved_jobs}</div>
                  <div className="text-[10px] text-[#DDD7D2]/80 font-bold uppercase tracking-wider mt-1">Approved Jobs</div>
                </div>
                <div className="bg-[#4A3832] p-3 rounded-xl border border-[#6B5147]">
                  <div className="text-2xl font-black text-white">{aciData.activity_counts.approved_events}</div>
                  <div className="text-[10px] text-[#DDD7D2]/80 font-bold uppercase tracking-wider mt-1">Events Hosted</div>
                </div>
                <div className="bg-[#4A3832] p-3 rounded-xl border border-[#6B5147]">
                  <div className="text-2xl font-black text-white">{aciData.activity_counts.valid_registrations}</div>
                  <div className="text-[10px] text-[#DDD7D2]/80 font-bold uppercase tracking-wider mt-1">Registrations</div>
                </div>
              </div>
              <div className="text-[11px] text-[#DDD7D2]/80 mt-3 pt-2.5 border-t border-[#6B5147]/60 flex items-center justify-between">
                <span>Tier Milestone:</span>
                <span className="font-semibold text-[#F6A15A]">
                  {aciData.score < 50 ? 'Next: Silver (50 pts)' :
                   aciData.score < 150 ? 'Next: Gold (150 pts)' :
                   aciData.score < 300 ? 'Next: Platinum (300 pts)' :
                   'Top Tier: Platinum Achieved 💎'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Real Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-3xl p-6 border border-[#DDD7D2] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-[#F28C38]/10 text-[#F28C38] rounded-2xl flex items-center justify-center font-bold">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-[#4A3832]">{myJobs.length}</div>
            <div className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wider">Jobs Posted By You</div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-[#DDD7D2] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-[#4A3832]/10 text-[#4A3832] rounded-2xl flex items-center justify-center font-bold">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-[#4A3832]">{myEvents.length}</div>
            <div className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wider">Events Created</div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-[#DDD7D2] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-bold">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-lg font-bold text-[#4A3832] capitalize">{verificationStatus}</div>
            <div className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wider">Verification Status</div>
          </div>
        </div>
      </div>

      {/* 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Your Posted Opportunities */}
        <div className="bg-white rounded-3xl p-6 border border-[#DDD7D2] shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-base font-bold text-[#4A3832]">Your Job Postings</h2>
              <p className="text-xs text-[#6B6B6B]">Track candidates and moderation status</p>
            </div>
            <Link href="/student/jobs" className="text-xs font-bold text-[#F28C38] hover:underline">
              Manage All →
            </Link>
          </div>

          {loading ? (
            <LoadingState message="Loading opportunities" className="py-8" />
          ) : myJobs.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#888888]">
              You haven't posted any jobs or internships yet.
            </div>
          ) : (
            <div className="space-y-3">
              {myJobs.slice(0, 4).map((j) => (
                <div key={j.id} className="p-4 bg-[#FBFAF8] rounded-2xl border border-[#DDD7D2]/80 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-[#4A3832]">{j.title}</h3>
                    <p className="text-[11px] text-[#6B6B6B]">{j.company} • {j.location}</p>
                  </div>
                  <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full uppercase ${
                    j.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                    j.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {j.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* University Announcements */}
        <div className="bg-white rounded-3xl p-6 border border-[#DDD7D2] shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-base font-bold text-[#4A3832]">SOET Campus Broadcasts</h2>
              <p className="text-xs text-[#6B6B6B]">Official updates from administration</p>
            </div>
          </div>

          {loading ? (
            <LoadingState message="Loading announcements" className="py-8" />
          ) : announcements.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#888888]">No active announcements.</div>
          ) : (
            <div className="space-y-4">
              {announcements.slice(0, 3).map((a) => (
                <div key={a.id} className="p-4 bg-[#FBFAF8] rounded-2xl border border-[#DDD7D2]/80">
                  <h3 className="text-xs font-bold text-[#4A3832]">{a.title}</h3>
                  <p className="text-xs text-[#6B6B6B] mt-1 leading-relaxed">{a.content}</p>
                  <span className="text-[10px] text-[#888888] mt-2 block font-medium">
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}
