'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/components/AuthProvider';
import { jobService, JobItem } from '@/lib/services/jobService';
import { eventService, EventItem } from '@/lib/services/eventService';
import { announcementService, AnnouncementItem } from '@/lib/services/announcementService';
import { 
  Briefcase, Calendar, Megaphone, Plus, 
  ShieldCheck, ShieldAlert, ArrowRight, Building, MapPin, Clock 
} from 'lucide-react';

export default function AlumniDashboard() {
  const { user } = useAuth();
  const [myJobs, setMyJobs] = useState<JobItem[]>([]);
  const [myEvents, setMyEvents] = useState<EventItem[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
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
      <div className="flex items-center text-xs font-semibold text-slate-400 mb-6 uppercase tracking-wider">
        <span>Portal</span>
        <span className="mx-2 text-slate-300">/</span>
        <span className="text-blue-600">Alumni Enterprise Dashboard</span>
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
      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-black text-slate-900">{userName}</h1>
            {verificationStatus === 'approved' && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold uppercase tracking-wider">
                <ShieldCheck className="w-3 h-3 text-emerald-600" /> Verified
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {designation} at <span className="font-semibold text-slate-700">{company}</span> • Class of {batch}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/student/jobs"
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/25 transition"
          >
            <Plus className="w-4 h-4" /> Post Job / Internship
          </Link>
          <Link
            href="/student/events"
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-md transition"
          >
            <Plus className="w-4 h-4" /> Host Event
          </Link>
        </div>
      </div>

      {/* Real Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-bold">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{myJobs.length}</div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Jobs Posted By You</div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-bold">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{myEvents.length}</div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Events Created</div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-bold">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-900 capitalize">{verificationStatus}</div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Verification Status</div>
          </div>
        </div>
      </div>

      {/* 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Your Posted Opportunities */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">Your Job Postings</h2>
              <p className="text-xs text-slate-500">Track candidates and moderation status</p>
            </div>
            <Link href="/student/jobs" className="text-xs font-bold text-blue-600 hover:underline">
              Manage All →
            </Link>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading your jobs...</div>
          ) : myJobs.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              You haven't posted any jobs or internships yet.
            </div>
          ) : (
            <div className="space-y-3">
              {myJobs.slice(0, 4).map((j) => (
                <div key={j.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">{j.title}</h3>
                    <p className="text-[11px] text-slate-500">{j.company} • {j.location}</p>
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
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">SOET Campus Broadcasts</h2>
              <p className="text-xs text-slate-500">Official updates from administration</p>
            </div>
          </div>

          {announcements.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">No active announcements.</div>
          ) : (
            <div className="space-y-4">
              {announcements.slice(0, 3).map((a) => (
                <div key={a.id} className="p-4 bg-blue-50/40 rounded-2xl border border-blue-100">
                  <h3 className="text-xs font-bold text-slate-900">{a.title}</h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{a.content}</p>
                  <span className="text-[10px] text-slate-400 mt-2 block font-medium">
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
