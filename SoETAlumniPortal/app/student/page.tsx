'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import LoadingState from '@/components/LoadingState';
import { useAuth } from '@/components/AuthProvider';
import { jobService, JobItem } from '@/lib/services/jobService';
import { eventService, EventItem } from '@/lib/services/eventService';
import { announcementService, AnnouncementItem } from '@/lib/services/announcementService';
import { Briefcase, Calendar, Megaphone, ArrowRight, MapPin, Building, Clock } from 'lucide-react';

export default function StudentDashboard() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [jobsData, eventsData, announcementsData] = await Promise.all([
          jobService.getApprovedJobs(),
          eventService.getApprovedEvents(user?.id),
          announcementService.getAnnouncements(),
        ]);
        setJobs(jobsData);
        setEvents(eventsData);
        setAnnouncements(announcementsData);
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user]);

  const firstName = user?.full_name?.trim().split(' ')[0] || 'Student';
  const department = user?.student_profile?.department || 'Engineering';
  const batch = user?.student_profile?.graduation_year || '2026';

  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-[#6B6B6B] mb-6 uppercase tracking-wider">
        <span>Home</span>
        <span className="mx-2 text-[#DDD7D2]">/</span>
        <span className="text-[#F28C38]">Student Dashboard</span>
      </div>

      {/* Hero Welcome */}
      <div className="bg-gradient-to-r from-[#4A3832] to-[#6B5147] rounded-3xl p-8 text-white shadow-xl shadow-[#4A3832]/20 mb-8 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-block px-3 py-1 bg-[#F28C38]/20 border border-[#F28C38]/40 rounded-full text-xs font-bold text-[#F6A15A] mb-3">
            Academic Year • SOET Connect
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">
            Welcome back, {firstName}!
          </h1>
          <p className="text-[#DDD7D2] text-sm leading-relaxed">
            {department} • Class of {batch}. Explore alumni networks, discover open career opportunities, and register for university events.
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-[#DDD7D2] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-[#F28C38]/10 text-[#F28C38] rounded-2xl flex items-center justify-center font-bold">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-[#4A3832]">{jobs.length}</div>
            <div className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wider">Available Jobs</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#DDD7D2] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-[#4A3832]/10 text-[#4A3832] rounded-2xl flex items-center justify-center font-bold">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-[#4A3832]">{events.length}</div>
            <div className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wider">Upcoming Events</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#DDD7D2] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-bold">
            <Megaphone className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-[#4A3832]">{announcements.length}</div>
            <div className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wider">Announcements</div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Cols: Recent Jobs */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-3xl border border-[#DDD7D2] p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-bold text-[#4A3832]">Recommended Jobs & Internships</h2>
                <p className="text-xs text-[#6B6B6B]">Verified postings by SOET Connect</p>
              </div>
              <Link href="/student/jobs" className="text-xs font-bold text-[#F28C38] hover:text-[#E07D2E] flex items-center gap-1 transition">
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {loading ? (
              <LoadingState message="Loading opportunities" className="py-8" />
            ) : jobs.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#888888]">No active job postings available yet.</div>
            ) : (
              <div className="space-y-4">
                {jobs.slice(0, 3).map((job) => (
                  <div key={job.id} className="p-4 rounded-2xl border border-[#DDD7D2]/80 hover:border-[#F28C38]/40 hover:shadow-sm transition bg-[#FBFAF8] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-[#4A3832] text-sm">{job.title}</h3>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-[#6B6B6B] mt-1">
                        <span className="flex items-center gap-1"><Building className="w-3.5 h-3.5" /> {job.company}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {job.location}</span>
                        <span className="px-2 py-0.5 bg-[#F28C38]/10 text-[#F28C38] font-bold rounded-md uppercase text-[10px]">
                          {job.employment_type}
                        </span>
                      </div>
                    </div>
                    <Link
                      href="/student/jobs"
                      className="px-4 py-2 bg-white hover:bg-[#F28C38] hover:text-white border border-[#DDD7D2] text-[#4A3832] text-xs font-bold rounded-xl transition text-center shrink-0"
                    >
                      View & Apply
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Announcements */}
          <div className="bg-white rounded-3xl border border-[#DDD7D2] p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#4A3832] mb-4 flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-[#F28C38]" /> University Announcements
            </h2>
            {announcements.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#888888]">No announcements at this time.</div>
            ) : (
              <div className="space-y-4">
                {announcements.slice(0, 2).map((a) => (
                  <div key={a.id} className="p-4 bg-[#FBFAF8] rounded-2xl border border-[#DDD7D2]/80">
                    <h3 className="font-bold text-[#4A3832] text-sm">{a.title}</h3>
                    <p className="text-xs text-[#6B6B6B] mt-1 leading-relaxed">{a.content}</p>
                    <span className="text-[10px] text-[#888888] mt-2 block font-medium">
                      Posted by {a.creator_name || 'Admin'} • {new Date(a.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Col: Upcoming Events */}
        <div className="space-y-8">
          <div className="bg-white rounded-3xl border border-[#DDD7D2] p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-[#4A3832]">Upcoming Events</h2>
              <Link href="/student/events" className="text-xs font-bold text-[#F28C38] hover:text-[#E07D2E] flex items-center gap-1 transition">
                All <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {loading ? (
              <LoadingState message="Loading events" className="py-8" />
            ) : events.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#888888]">No upcoming events scheduled.</div>
            ) : (
              <div className="space-y-4">
                {events.slice(0, 3).map((event) => (
                  <div key={event.id} className="p-4 rounded-2xl bg-[#FBFAF8] border border-[#DDD7D2]/80">
                    <h3 className="font-bold text-[#4A3832] text-sm">{event.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-[#6B6B6B] mt-1">
                      <Clock className="w-3.5 h-3.5 text-[#F28C38]" />
                      <span>{new Date(event.event_date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#6B6B6B] mt-1">
                      <MapPin className="w-3.5 h-3.5 text-[#888888]" />
                      <span className="truncate">{event.location}</span>
                    </div>
                    <div className="mt-3 flex justify-between items-center">
                      <span className="text-[11px] text-[#888888] font-semibold">{event.registration_count} registered</span>
                      <Link href="/student/events" className="text-xs font-bold text-[#F28C38] hover:underline">
                        Details →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
