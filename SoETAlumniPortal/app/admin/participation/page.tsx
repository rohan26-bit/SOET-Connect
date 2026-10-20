'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import LoadingState from '@/components/LoadingState';
import { useAuth } from '@/components/AuthProvider';
import {
  adminService,
  EventParticipationOverview,
  EventParticipationItem,
  EventParticipantDetail,
  JobParticipationOverview,
  JobParticipationItem,
  JobApplicantDetail,
} from '@/lib/services/adminService';
import {
  Calendar,
  Briefcase,
  Users,
  UserCheck,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  MapPin,
  Clock,
  GraduationCap,
  FileText,
  CheckCircle2,
  XCircle,
  Clock3,
  Building,
  Mail,
  Eye,
  X,
} from 'lucide-react';

export default function AdminParticipationPage() {
  const { user } = useAuth();

  // Active top-level tab: 'events' or 'jobs'
  const [activeTab, setActiveTab] = useState<'events' | 'jobs'>('events');

  // Overall loading & error states
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Events participation data
  const [eventData, setEventData] = useState<EventParticipationOverview | null>(null);
  const [eventSearch, setEventSearch] = useState<string>('');
  const [eventStatusFilter, setEventStatusFilter] = useState<string>('all');
  const [selectedEvent, setSelectedEvent] = useState<EventParticipationItem | null>(null);

  // Event participants detail state
  const [participantsLoading, setParticipantsLoading] = useState<boolean>(false);
  const [participantsList, setParticipantsList] = useState<EventParticipantDetail[]>([]);
  const [participantSearch, setParticipantSearch] = useState<string>('');
  const [participantRoleFilter, setParticipantRoleFilter] = useState<string>('all');

  // Jobs participation data
  const [jobData, setJobData] = useState<JobParticipationOverview | null>(null);
  const [jobSearch, setJobSearch] = useState<string>('');
  const [jobStatusFilter, setJobStatusFilter] = useState<string>('all');
  const [selectedJob, setSelectedJob] = useState<JobParticipationItem | null>(null);

  // Job applicants detail state
  const [applicantsLoading, setApplicantsLoading] = useState<boolean>(false);
  const [applicantsList, setApplicantsList] = useState<JobApplicantDetail[]>([]);
  const [applicantSearch, setApplicantSearch] = useState<string>('');
  const [applicantStatusFilter, setApplicantStatusFilter] = useState<string>('all');

  // Cover letter modal
  const [modalCoverLetter, setModalCoverLetter] = useState<{ name: string; text: string } | null>(null);

  // Fetch event participation overview
  const fetchEventParticipation = useCallback(async () => {
    try {
      const data = await adminService.getEventParticipation();
      setEventData(data);
    } catch (err: any) {
      console.error('Failed to load event participation data:', err);
      throw err;
    }
  }, []);

  // Fetch job participation overview
  const fetchJobParticipation = useCallback(async () => {
    try {
      const data = await adminService.getJobParticipation();
      setJobData(data);
    } catch (err: any) {
      console.error('Failed to load job participation data:', err);
      throw err;
    }
  }, []);

  // Initial load
  const loadAllData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      await Promise.all([fetchEventParticipation(), fetchJobParticipation()]);
    } catch (err: any) {
      setError(err?.message || 'Failed to load participation data from the server.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchEventParticipation, fetchJobParticipation]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Load participants for selected event
  const loadEventParticipants = useCallback(async (eventId: string) => {
    setParticipantsLoading(true);
    try {
      const res = await adminService.getEventParticipants(eventId, { limit: 100 });
      setParticipantsList(res.participants || []);
    } catch (err: any) {
      console.error('Failed to load event participants:', err);
      setParticipantsList([]);
    } finally {
      setParticipantsLoading(false);
    }
  }, []);

  // Load applicants for selected job
  const loadJobApplicants = useCallback(async (jobId: string) => {
    setApplicantsLoading(true);
    try {
      const res = await adminService.getJobApplicantsDetailed(jobId, { limit: 100 });
      setApplicantsList(res.applicants || []);
    } catch (err: any) {
      console.error('Failed to load job applicants:', err);
      setApplicantsList([]);
    } finally {
      setApplicantsLoading(false);
    }
  }, []);

  // Handler when selecting an event to view participants
  const handleSelectEvent = (event: EventParticipationItem) => {
    setSelectedEvent(event);
    setParticipantSearch('');
    setParticipantRoleFilter('all');
    loadEventParticipants(event.id);
  };

  // Handler when selecting a job to view applicants
  const handleSelectJob = (job: JobParticipationItem) => {
    setSelectedJob(job);
    setApplicantSearch('');
    setApplicantStatusFilter('all');
    loadJobApplicants(job.id);
  };

  // Filtered Events list
  const filteredEvents = useMemo(() => {
    if (!eventData?.events) return [];
    return eventData.events.filter((ev) => {
      const matchesSearch =
        !eventSearch ||
        ev.title.toLowerCase().includes(eventSearch.toLowerCase()) ||
        ev.location.toLowerCase().includes(eventSearch.toLowerCase()) ||
        ev.event_type.toLowerCase().includes(eventSearch.toLowerCase());
      const matchesStatus =
        eventStatusFilter === 'all' || ev.status.toLowerCase() === eventStatusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });
  }, [eventData, eventSearch, eventStatusFilter]);

  // Filtered Participants list
  const filteredParticipants = useMemo(() => {
    return participantsList.filter((p) => {
      const q = participantSearch.toLowerCase();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.identifier.toLowerCase().includes(q) ||
        p.department.toLowerCase().includes(q);
      const matchesRole =
        participantRoleFilter === 'all' || p.role.toLowerCase() === participantRoleFilter.toLowerCase();
      return matchesSearch && matchesRole;
    });
  }, [participantsList, participantSearch, participantRoleFilter]);

  // Filtered Jobs list
  const filteredJobs = useMemo(() => {
    if (!jobData?.jobs) return [];
    return jobData.jobs.filter((j) => {
      const matchesSearch =
        !jobSearch ||
        j.title.toLowerCase().includes(jobSearch.toLowerCase()) ||
        j.company.toLowerCase().includes(jobSearch.toLowerCase()) ||
        j.location.toLowerCase().includes(jobSearch.toLowerCase());
      const matchesStatus =
        jobStatusFilter === 'all' || j.status.toLowerCase() === jobStatusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });
  }, [jobData, jobSearch, jobStatusFilter]);

  // Filtered Applicants list
  const filteredApplicants = useMemo(() => {
    return applicantsList.filter((a) => {
      const q = applicantSearch.toLowerCase();
      const matchesSearch =
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.identifier.toLowerCase().includes(q) ||
        a.department.toLowerCase().includes(q);
      const matchesStatus =
        applicantStatusFilter === 'all' ||
        a.status.toLowerCase() === applicantStatusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });
  }, [applicantsList, applicantSearch, applicantStatusFilter]);

  // Status badge styling helpers
  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'approved' || s === 'active' || s === 'selected' || s === 'registered') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" />
          {status}
        </span>
      );
    }
    if (s === 'pending' || s === 'under_review' || s === 'applied') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock3 className="w-3 h-3" />
          {status}
        </span>
      );
    }
    if (s === 'shortlisted' || s === 'interview') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <UserCheck className="w-3 h-3" />
          {status}
        </span>
      );
    }
    if (s === 'rejected' || s === 'cancelled' || s === 'closed') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <XCircle className="w-3 h-3" />
          {status}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
        {status}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6 pb-12">
        {/* BREADCRUMB & HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center text-xs font-medium text-[#888888] mb-1">
              <span>Admin</span>
              <span className="mx-2">/</span>
              <span className="text-[#222222] font-semibold">Participation & Registrations</span>
            </div>
            <h1 className="text-2xl font-black text-[#222222] tracking-tight">
              Participation & Registrations
            </h1>
            <p className="text-xs text-[#6B6B6B] mt-0.5">
              Live database counts of event registrations and job application engagement.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadAllData(true)}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#4A3832] bg-white border border-[#DDD7D2] rounded-xl hover:bg-[#FBFAF8] active:bg-[#F0EDE8] transition disabled:opacity-50 shadow-sm"
              title="Refresh real-time data from database"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh Data'}</span>
            </button>
          </div>
        </div>

        {/* ERROR ALERT */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-800 text-xs font-medium">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Failed to load live participation metrics</p>
              <p className="text-rose-700 mt-0.5">{error}</p>
            </div>
            <button
              onClick={() => loadAllData(true)}
              className="px-3 py-1 bg-white border border-rose-200 rounded-lg text-rose-700 hover:bg-rose-50 text-xs font-bold"
            >
              Retry
            </button>
          </div>
        )}

        {/* TOP SUMMARY STATS CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Total Event Registrations */}
          <div className="p-4 sm:p-5 bg-white border border-[#DDD7D2] rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-[#888888] uppercase tracking-wider">
                Event Registrations
              </span>
              <div className="w-8 h-8 rounded-xl bg-[#F28C38]/10 text-[#F28C38] flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#222222]">
              {loading ? '—' : eventData?.total_registrations ?? 0}
            </div>
            <p className="text-[11px] text-[#6B6B6B] mt-1">Total registration sign-ups</p>
          </div>

          {/* Unique Event Participants */}
          <div className="p-4 sm:p-5 bg-white border border-[#DDD7D2] rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-[#888888] uppercase tracking-wider">
                Unique Participants
              </span>
              <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#222222]">
              {loading ? '—' : eventData?.unique_participants ?? 0}
            </div>
            <p className="text-[11px] text-[#6B6B6B] mt-1">Distinct attendees across events</p>
          </div>

          {/* Total Job Applications */}
          <div className="p-4 sm:p-5 bg-white border border-[#DDD7D2] rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-[#888888] uppercase tracking-wider">
                Job Applications
              </span>
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                <Briefcase className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#222222]">
              {loading ? '—' : jobData?.total_applications ?? 0}
            </div>
            <p className="text-[11px] text-[#6B6B6B] mt-1">Applications across all postings</p>
          </div>

          {/* Unique Job Applicants */}
          <div className="p-4 sm:p-5 bg-white border border-[#DDD7D2] rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-[#888888] uppercase tracking-wider">
                Unique Applicants
              </span>
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
                <UserCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#222222]">
              {loading ? '—' : jobData?.unique_applicants ?? 0}
            </div>
            <p className="text-[11px] text-[#6B6B6B] mt-1">Distinct candidates applied</p>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="flex items-center border-b border-[#DDD7D2]">
          <button
            onClick={() => {
              setActiveTab('events');
              setSelectedJob(null);
            }}
            className={`inline-flex items-center gap-2 py-3 px-5 text-xs font-bold transition border-b-2 ${
              activeTab === 'events'
                ? 'border-[#F28C38] text-[#F28C38]'
                : 'border-transparent text-[#6B6B6B] hover:text-[#222222]'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Event Registrations</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#F28C38]/10 text-[#F28C38]">
              {eventData?.total_events ?? 0}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('jobs');
              setSelectedEvent(null);
            }}
            className={`inline-flex items-center gap-2 py-3 px-5 text-xs font-bold transition border-b-2 ${
              activeTab === 'jobs'
                ? 'border-[#F28C38] text-[#F28C38]'
                : 'border-transparent text-[#6B6B6B] hover:text-[#222222]'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>Job Applications</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700">
              {jobData?.total_jobs ?? 0}
            </span>
          </button>
        </div>

        {/* LOADING STATE */}
        {loading && <LoadingState message="Loading participation & registration metrics..." />}

        {/* ============================================================ */}
        {/* TAB 1: EVENT REGISTRATIONS                                  */}
        {/* ============================================================ */}
        {!loading && activeTab === 'events' && (
          <div className="space-y-4">
            {/* VIEW A: EVENT PARTICIPANTS DETAILS VIEW */}
            {selectedEvent ? (
              <div className="space-y-4">
                {/* Back button & Event header */}
                <div className="p-5 bg-white border border-[#DDD7D2] rounded-2xl shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 pb-4 border-b border-[#F0EDE8]">
                    <button
                      onClick={() => setSelectedEvent(null)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B6B6B] hover:text-[#222222] transition"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back to all events
                    </button>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#888888]">Event Status:</span>
                      {getStatusBadge(selectedEvent.status)}
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-[#222222]">{selectedEvent.title}</h2>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6B6B6B] mt-1.5">
                        {selectedEvent.event_date && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-[#888888]" />
                            {formatDate(selectedEvent.event_date)}
                          </span>
                        )}
                        {selectedEvent.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-[#888888]" />
                            {selectedEvent.location}
                          </span>
                        )}
                        {selectedEvent.event_type && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#FBFAF8] border border-[#DDD7D2] text-[#4A3832]">
                            {selectedEvent.event_type}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 bg-[#FBFAF8] p-3 rounded-xl border border-[#DDD7D2]">
                      <div className="text-center px-3 border-r border-[#DDD7D2]">
                        <div className="text-lg font-black text-[#222222]">
                          {selectedEvent.registration_count}
                        </div>
                        <div className="text-[10px] font-bold text-[#888888] uppercase">
                          Registrations
                        </div>
                      </div>
                      <div className="text-center px-3">
                        <div className="text-lg font-black text-teal-700">
                          {selectedEvent.unique_participant_count}
                        </div>
                        <div className="text-[10px] font-bold text-[#888888] uppercase">
                          Unique Attendees
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Filters for participants */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-[#888888] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={participantSearch}
                      onChange={(e) => setParticipantSearch(e.target.value)}
                      placeholder="Search participants by name, email, student ID, department..."
                      className="w-full pl-9 pr-4 py-2 bg-white border border-[#DDD7D2] rounded-xl text-xs text-[#222222] placeholder-[#888888] focus:outline-none focus:ring-2 focus:ring-[#F28C38]"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-[#888888]" />
                    <select
                      value={participantRoleFilter}
                      onChange={(e) => setParticipantRoleFilter(e.target.value)}
                      className="py-2 px-3 bg-white border border-[#DDD7D2] rounded-xl text-xs text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#F28C38]"
                    >
                      <option value="all">All Roles</option>
                      <option value="student">Students Only</option>
                      <option value="alumni">Alumni Only</option>
                    </select>
                  </div>
                </div>

                {/* Participants table */}
                <div className="bg-white border border-[#DDD7D2] rounded-2xl shadow-sm overflow-hidden">
                  {participantsLoading ? (
                    <div className="p-8 text-center text-xs text-[#888888]">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#F28C38]" />
                      Loading participants...
                    </div>
                  ) : filteredParticipants.length === 0 ? (
                    <div className="p-12 text-center">
                      <Users className="w-8 h-8 text-[#CCCCCC] mx-auto mb-2" />
                      <p className="text-sm font-semibold text-[#4A3832]">No participants found</p>
                      <p className="text-xs text-[#888888] mt-1">
                        {participantsList.length === 0
                          ? 'No registrations have been recorded for this event yet.'
                          : 'No participants matched your current search filters.'}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-[#222222]">
                        <thead className="bg-[#FBFAF8] text-[#888888] font-semibold text-[11px] uppercase tracking-wider border-b border-[#DDD7D2]">
                          <tr>
                            <th className="py-3 px-4">Participant</th>
                            <th className="py-3 px-4">Role</th>
                            <th className="py-3 px-4">ID / Department</th>
                            <th className="py-3 px-4">Registration Date</th>
                            <th className="py-3 px-4 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0EDE8]">
                          {filteredParticipants.map((p) => (
                            <tr key={p.registration_id} className="hover:bg-[#FBFAF8] transition">
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-[#F28C38]/10 text-[#F28C38] flex items-center justify-center font-bold text-xs uppercase shrink-0">
                                    {p.name.charAt(0) || 'U'}
                                  </div>
                                  <div>
                                    <div className="font-bold text-[#222222]">{p.name}</div>
                                    <div className="text-[11px] text-[#6B6B6B] flex items-center gap-1">
                                      <Mail className="w-3 h-3 text-[#888888]" />
                                      {p.email || 'No email registered'}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3.5 px-4">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    p.role === 'alumni'
                                      ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                      : p.role === 'admin'
                                      ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                                  }`}
                                >
                                  {p.role}
                                </span>
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="font-semibold text-[#222222]">
                                  {p.identifier || '—'}
                                </div>
                                <div className="text-[11px] text-[#888888]">
                                  {p.department || '—'}
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-[#6B6B6B]">
                                {formatDate(p.registration_date)}
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                {getStatusBadge(p.status)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* VIEW B: EVENTS OVERVIEW LIST */
              <div className="space-y-4">
                {/* Search & Filter Bar */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-[#888888] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={eventSearch}
                      onChange={(e) => setEventSearch(e.target.value)}
                      placeholder="Search events by title, location, type..."
                      className="w-full pl-9 pr-4 py-2 bg-white border border-[#DDD7D2] rounded-xl text-xs text-[#222222] placeholder-[#888888] focus:outline-none focus:ring-2 focus:ring-[#F28C38]"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-[#888888]" />
                    <select
                      value={eventStatusFilter}
                      onChange={(e) => setEventStatusFilter(e.target.value)}
                      className="py-2 px-3 bg-white border border-[#DDD7D2] rounded-xl text-xs text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#F28C38]"
                    >
                      <option value="all">All Statuses</option>
                      <option value="approved">Approved</option>
                      <option value="pending">Pending</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>

                {/* Events Table */}
                <div className="bg-white border border-[#DDD7D2] rounded-2xl shadow-sm overflow-hidden">
                  {filteredEvents.length === 0 ? (
                    <div className="p-12 text-center">
                      <Calendar className="w-8 h-8 text-[#CCCCCC] mx-auto mb-2" />
                      <p className="text-sm font-semibold text-[#4A3832]">No events found</p>
                      <p className="text-xs text-[#888888] mt-1">
                        Try adjusting your search criteria or status filter.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-[#222222]">
                        <thead className="bg-[#FBFAF8] text-[#888888] font-semibold text-[11px] uppercase tracking-wider border-b border-[#DDD7D2]">
                          <tr>
                            <th className="py-3 px-4">Event Title</th>
                            <th className="py-3 px-4">Date & Location</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4 text-center">Registrations</th>
                            <th className="py-3 px-4 text-center">Unique Attendees</th>
                            <th className="py-3 px-4 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0EDE8]">
                          {filteredEvents.map((ev) => (
                            <tr key={ev.id} className="hover:bg-[#FBFAF8] transition">
                              <td className="py-3.5 px-4 font-semibold text-[#222222]">
                                <div>{ev.title}</div>
                                {ev.event_type && (
                                  <span className="text-[10px] text-[#888888] uppercase tracking-wider">
                                    {ev.event_type}
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-[#6B6B6B]">
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-[#888888]" />
                                  {formatDate(ev.event_date)}
                                </div>
                                {ev.location && (
                                  <div className="flex items-center gap-1 text-[11px] text-[#888888] mt-0.5">
                                    <MapPin className="w-3 h-3 text-[#888888]" />
                                    {ev.location}
                                  </div>
                                )}
                              </td>
                              <td className="py-3.5 px-4">{getStatusBadge(ev.status)}</td>
                              <td className="py-3.5 px-4 text-center">
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-[#F28C38]/10 text-[#F28C38]">
                                  {ev.registration_count}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-teal-50 text-teal-700">
                                  {ev.unique_participant_count}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <button
                                  onClick={() => handleSelectEvent(ev)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-[#F28C38] hover:text-[#E07D2E] bg-[#F28C38]/5 hover:bg-[#F28C38]/15 rounded-xl transition"
                                >
                                  <span>View Participants</span>
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: JOB APPLICATIONS                                     */}
        {/* ============================================================ */}
        {!loading && activeTab === 'jobs' && (
          <div className="space-y-4">
            {/* VIEW A: JOB APPLICANTS DETAILS VIEW */}
            {selectedJob ? (
              <div className="space-y-4">
                {/* Back button & Job header */}
                <div className="p-5 bg-white border border-[#DDD7D2] rounded-2xl shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 pb-4 border-b border-[#F0EDE8]">
                    <button
                      onClick={() => setSelectedJob(null)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B6B6B] hover:text-[#222222] transition"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back to all jobs
                    </button>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#888888]">Posting Status:</span>
                      {getStatusBadge(selectedJob.status)}
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-[#222222]">{selectedJob.title}</h2>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6B6B6B] mt-1.5">
                        {selectedJob.company && (
                          <span className="inline-flex items-center gap-1 font-semibold text-[#4A3832]">
                            <Building className="w-3.5 h-3.5 text-[#888888]" />
                            {selectedJob.company}
                          </span>
                        )}
                        {selectedJob.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-[#888888]" />
                            {selectedJob.location}
                          </span>
                        )}
                        {selectedJob.job_type && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#FBFAF8] border border-[#DDD7D2] text-[#4A3832]">
                            {selectedJob.job_type}
                          </span>
                        )}
                        {selectedJob.deadline && (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            Deadline: {formatDate(selectedJob.deadline)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 bg-[#FBFAF8] p-3 rounded-xl border border-[#DDD7D2]">
                      <div className="text-center px-3 border-r border-[#DDD7D2]">
                        <div className="text-lg font-black text-blue-700">
                          {selectedJob.application_count}
                        </div>
                        <div className="text-[10px] font-bold text-[#888888] uppercase">
                          Applications
                        </div>
                      </div>
                      <div className="text-center px-3">
                        <div className="text-lg font-black text-purple-700">
                          {selectedJob.unique_applicant_count}
                        </div>
                        <div className="text-[10px] font-bold text-[#888888] uppercase">
                          Unique Candidates
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Filters for applicants */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-[#888888] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={applicantSearch}
                      onChange={(e) => setApplicantSearch(e.target.value)}
                      placeholder="Search applicants by name, email, student ID, department..."
                      className="w-full pl-9 pr-4 py-2 bg-white border border-[#DDD7D2] rounded-xl text-xs text-[#222222] placeholder-[#888888] focus:outline-none focus:ring-2 focus:ring-[#F28C38]"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-[#888888]" />
                    <select
                      value={applicantStatusFilter}
                      onChange={(e) => setApplicantStatusFilter(e.target.value)}
                      className="py-2 px-3 bg-white border border-[#DDD7D2] rounded-xl text-xs text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#F28C38]"
                    >
                      <option value="all">All Application Statuses</option>
                      <option value="applied">Applied</option>
                      <option value="under_review">Under Review</option>
                      <option value="shortlisted">Shortlisted</option>
                      <option value="selected">Selected</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                </div>

                {/* Applicants table */}
                <div className="bg-white border border-[#DDD7D2] rounded-2xl shadow-sm overflow-hidden">
                  {applicantsLoading ? (
                    <div className="p-8 text-center text-xs text-[#888888]">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#F28C38]" />
                      Loading applicants...
                    </div>
                  ) : filteredApplicants.length === 0 ? (
                    <div className="p-12 text-center">
                      <Briefcase className="w-8 h-8 text-[#CCCCCC] mx-auto mb-2" />
                      <p className="text-sm font-semibold text-[#4A3832]">No applicants found</p>
                      <p className="text-xs text-[#888888] mt-1">
                        {applicantsList.length === 0
                          ? 'No applications have been submitted for this job yet.'
                          : 'No applicants matched your current search filters.'}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-[#222222]">
                        <thead className="bg-[#FBFAF8] text-[#888888] font-semibold text-[11px] uppercase tracking-wider border-b border-[#DDD7D2]">
                          <tr>
                            <th className="py-3 px-4">Applicant</th>
                            <th className="py-3 px-4">Role & ID</th>
                            <th className="py-3 px-4">Department</th>
                            <th className="py-3 px-4">Applied Date</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4 text-right">Materials</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0EDE8]">
                          {filteredApplicants.map((a) => (
                            <tr key={a.application_id} className="hover:bg-[#FBFAF8] transition">
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                                    {a.name.charAt(0) || 'A'}
                                  </div>
                                  <div>
                                    <div className="font-bold text-[#222222]">{a.name}</div>
                                    <div className="text-[11px] text-[#6B6B6B] flex items-center gap-1">
                                      <Mail className="w-3 h-3 text-[#888888]" />
                                      {a.email || 'No email registered'}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3.5 px-4">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 mb-0.5">
                                  {a.role}
                                </span>
                                {a.identifier && (
                                  <div className="font-mono text-[11px] text-[#6B6B6B]">
                                    {a.identifier}
                                  </div>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-[#4A3832]">
                                {a.department || '—'}
                              </td>
                              <td className="py-3.5 px-4 text-[#6B6B6B]">
                                {formatDate(a.applied_at)}
                              </td>
                              <td className="py-3.5 px-4">{getStatusBadge(a.status)}</td>
                              <td className="py-3.5 px-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {a.cover_letter && (
                                    <button
                                      onClick={() =>
                                        setModalCoverLetter({
                                          name: a.name,
                                          text: a.cover_letter,
                                        })
                                      }
                                      className="p-1.5 text-[#6B6B6B] hover:text-[#222222] hover:bg-[#F0EDE8] rounded-lg transition"
                                      title="View cover letter"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {a.resume_url ? (
                                    <a
                                      href={a.resume_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-[#F28C38] hover:text-[#E07D2E] bg-[#F28C38]/10 hover:bg-[#F28C38]/20 rounded-lg transition"
                                    >
                                      <FileText className="w-3 h-3" />
                                      Resume
                                    </a>
                                  ) : (
                                    <span className="text-[11px] text-[#CCCCCC]">No resume</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* VIEW B: JOBS OVERVIEW LIST */
              <div className="space-y-4">
                {/* Search & Filter Bar */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-[#888888] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={jobSearch}
                      onChange={(e) => setJobSearch(e.target.value)}
                      placeholder="Search jobs by title, company, location..."
                      className="w-full pl-9 pr-4 py-2 bg-white border border-[#DDD7D2] rounded-xl text-xs text-[#222222] placeholder-[#888888] focus:outline-none focus:ring-2 focus:ring-[#F28C38]"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-[#888888]" />
                    <select
                      value={jobStatusFilter}
                      onChange={(e) => setJobStatusFilter(e.target.value)}
                      className="py-2 px-3 bg-white border border-[#DDD7D2] rounded-xl text-xs text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#F28C38]"
                    >
                      <option value="all">All Posting Statuses</option>
                      <option value="approved">Approved / Active</option>
                      <option value="pending">Pending</option>
                      <option value="closed">Closed / Expired</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                </div>

                {/* Jobs Table */}
                <div className="bg-white border border-[#DDD7D2] rounded-2xl shadow-sm overflow-hidden">
                  {filteredJobs.length === 0 ? (
                    <div className="p-12 text-center">
                      <Briefcase className="w-8 h-8 text-[#CCCCCC] mx-auto mb-2" />
                      <p className="text-sm font-semibold text-[#4A3832]">No jobs found</p>
                      <p className="text-xs text-[#888888] mt-1">
                        Try adjusting your search criteria or status filter.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-[#222222]">
                        <thead className="bg-[#FBFAF8] text-[#888888] font-semibold text-[11px] uppercase tracking-wider border-b border-[#DDD7D2]">
                          <tr>
                            <th className="py-3 px-4">Job Title & Company</th>
                            <th className="py-3 px-4">Type & Location</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4 text-center">Applications</th>
                            <th className="py-3 px-4 text-center">Unique Candidates</th>
                            <th className="py-3 px-4 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0EDE8]">
                          {filteredJobs.map((j) => (
                            <tr key={j.id} className="hover:bg-[#FBFAF8] transition">
                              <td className="py-3.5 px-4 font-semibold text-[#222222]">
                                <div>{j.title}</div>
                                {j.company && (
                                  <div className="text-[11px] text-[#6B6B6B] flex items-center gap-1 font-normal">
                                    <Building className="w-3 h-3 text-[#888888]" />
                                    {j.company}
                                  </div>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-[#6B6B6B]">
                                <div className="font-medium text-[#4A3832]">{j.job_type || '—'}</div>
                                {j.location && (
                                  <div className="text-[11px] text-[#888888] flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-[#888888]" />
                                    {j.location}
                                  </div>
                                )}
                              </td>
                              <td className="py-3.5 px-4">{getStatusBadge(j.status)}</td>
                              <td className="py-3.5 px-4 text-center">
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700">
                                  {j.application_count}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700">
                                  {j.unique_applicant_count}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <button
                                  onClick={() => handleSelectJob(j)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-[#F28C38] hover:text-[#E07D2E] bg-[#F28C38]/5 hover:bg-[#F28C38]/15 rounded-xl transition"
                                >
                                  <span>View Applicants</span>
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* COVER LETTER PREVIEW MODAL */}
        {modalCoverLetter && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-[#DDD7D2] relative">
              <button
                onClick={() => setModalCoverLetter(null)}
                className="absolute right-4 top-4 text-[#888888] hover:text-[#222222] p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="text-base font-bold text-[#222222] mb-1">
                Cover Letter — {modalCoverLetter.name}
              </h3>
              <p className="text-xs text-[#888888] mb-4">
                Submitted application statement from candidate
              </p>
              <div className="max-h-80 overflow-y-auto p-4 bg-[#FBFAF8] rounded-xl border border-[#DDD7D2] text-xs text-[#4A3832] whitespace-pre-wrap leading-relaxed">
                {modalCoverLetter.text}
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setModalCoverLetter(null)}
                  className="px-4 py-2 bg-[#F28C38] text-white text-xs font-bold rounded-xl hover:bg-[#E07D2E] transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
