'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import LoadingState from '@/components/LoadingState';
import JobDetailsModal from '@/components/JobDetailsModal';
import PostedAt from '@/components/PostedAt';
import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';
import { jobService, JobItem } from '@/lib/services/jobService';
import { adminService, JobApplicantDetail } from '@/lib/services/adminService';
import {
  Briefcase,
  CheckCircle2,
  XCircle,
  Trash2,
  Building,
  MapPin,
  Plus,
  AlertCircle,
  X,
  Users,
  Eye,
  FileText,
  GraduationCap,
  Mail,
  ExternalLink,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import DocumentAttachment, { DocumentAttachmentData, DocumentAttachmentView } from '@/components/DocumentAttachment';

export default function AdminJobsPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [viewingJobDetails, setViewingJobDetails] = useState<JobItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'expired'>('all');

  // Post Job modal state
  const [showPostModal, setShowPostModal] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState<string | null>(null);

  // Edit Deadline modal state
  const [editingDeadlineJob, setEditingDeadlineJob] = useState<JobItem | null>(null);
  const [newDeadlineToSet, setNewDeadlineToSet] = useState('');
  const [updatingDeadline, setUpdatingDeadline] = useState(false);

  // Applicant counts & details modal state
  const [applicantCounts, setApplicantCounts] = useState<Record<string, number>>({});
  const [selectedJobForApplicants, setSelectedJobForApplicants] = useState<JobItem | null>(null);
  const [modalApplicants, setModalApplicants] = useState<JobApplicantDetail[]>([]);
  const [modalApplicantsLoading, setModalApplicantsLoading] = useState<boolean>(false);
  const [modalApplicantsError, setModalApplicantsError] = useState<string | null>(null);
  const [modalCoverLetter, setModalCoverLetter] = useState<{ name: string; text: string } | null>(null);
  const [modalPage, setModalPage] = useState<number>(1);
  const [modalTotalCount, setModalTotalCount] = useState<number>(0);
  const MODAL_LIMIT = 10;

  const initialJobState = {
    title: '',
    company: '',
    description: '',
    location: '',
    employment_type: 'Full-time',
    salary: '',
    skillsStr: '',
    deadline: '',
    attachment: null as DocumentAttachmentData | null,
  };

  const [newJob, setNewJob] = useState(initialJobState);

  const loadJobs = async () => {
    setLoading(true);
    try {
      const [jobsData, partData] = await Promise.all([
        jobService.getAllJobsForAdmin(),
        adminService.getJobParticipation().catch(() => null),
      ]);
      setJobs(jobsData);
      if (partData && partData.jobs) {
        const counts: Record<string, number> = {};
        partData.jobs.forEach((pj) => {
          counts[pj.id] = pj.unique_applicant_count ?? pj.application_count ?? 0;
        });
        setApplicantCounts(counts);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchModalApplicants = async (jobId: string, page: number = 1) => {
    setModalApplicantsLoading(true);
    setModalApplicantsError(null);
    try {
      const offset = Math.max(0, (page - 1) * MODAL_LIMIT);
      const res = await adminService.getJobApplicantsDetailed(jobId, {
        limit: MODAL_LIMIT,
        offset,
      });
      setModalApplicants(res.applicants || []);
      setModalTotalCount(res.total_count ?? 0);
      setModalPage(page);
    } catch (err: unknown) {
      console.error('Failed to load job applicants:', err);
      const msg = err instanceof Error ? err.message : 'Failed to load applicants.';
      setModalApplicantsError(msg);
      setModalApplicants([]);
      setModalTotalCount(0);
    } finally {
      setModalApplicantsLoading(false);
    }
  };

  const handleOpenApplicantsModal = (job: JobItem) => {
    setSelectedJobForApplicants(job);
    setModalPage(1);
    fetchModalApplicants(job.id, 1);
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const handlePostJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setPosting(true);
    setPostError(null);

    try {
      const skills = newJob.skillsStr
        ? newJob.skillsStr.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      const isoDeadline = newJob.deadline ? new Date(newJob.deadline).toISOString() : undefined;

      await jobService.createJob({
        posted_by: user.id,
        title: newJob.title,
        company: newJob.company,
        description: newJob.description,
        location: newJob.location,
        employment_type: newJob.employment_type,
        salary: newJob.salary || undefined,
        skills,
        deadline: isoDeadline,
        application_deadline: isoDeadline,
        attachment: newJob.attachment,
      });

      setShowPostModal(false);
      setNewJob(initialJobState);
      setPostSuccess('Job posted successfully! It has been automatically approved.');
      await loadJobs();
    } catch (err: any) {
      setPostError(err.message || 'Failed to post job.');
    } finally {
      setPosting(false);
    }
  };

  const handleUpdateDeadline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDeadlineJob) return;
    setUpdatingDeadline(true);
    try {
      const isoVal = newDeadlineToSet ? new Date(newDeadlineToSet).toISOString() : null;
      await jobService.updateJobDeadline(editingDeadlineJob.id, isoVal);
      setEditingDeadlineJob(null);
      setNewDeadlineToSet('');
      await loadJobs();
    } catch (err: any) {
      alert(err.message || 'Failed to update job deadline.');
    } finally {
      setUpdatingDeadline(false);
    }
  };

  const handleStatusChange = async (jobId: string, status: 'approved' | 'rejected') => {
    try {
      await jobService.updateJobStatus(jobId, status);
      loadJobs();
    } catch (err: any) {
      alert(err.message || 'Failed to update job status.');
    }
  };

  const handleDelete = async (jobId: string) => {
    if (!confirm('Are you sure you want to permanently remove this job posting?')) return;
    try {
      await jobService.deleteJob(jobId);
      loadJobs();
    } catch (err: any) {
      alert(err.message || 'Failed to delete job.');
    }
  };

  const filteredJobs = jobs.filter((j) => {
    if (filter === 'all') return true;
    if (filter === 'expired') return j.is_expired;
    return j.status === filter;
  });

  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-[#6B6B6B] mb-6 uppercase tracking-wider">
        <span>Administration</span>
        <span className="mx-2 text-[#DDD7D2]">/</span>
        <span className="text-[#F28C38]">Job Approvals & Moderation</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-[#4A3832] tracking-tight">Job Moderation Console</h1>
          <p className="text-xs text-[#6B6B6B] mt-1">
            Review, approve, or reject job and internship postings submitted by SOET alumni.
          </p>
        </div>
        <button
          onClick={() => {
            setPostError(null);
            setShowPostModal(true);
          }}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-sm font-bold transition shadow-lg shadow-blue-600/20"
        >
          <Plus className="w-4 h-4" /> Post New Job
        </button>
      </div>

      {/* Success Alert */}
      {postSuccess && (
        <div className="mb-6 bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{postSuccess}</span>
          </div>
          <button
            onClick={() => setPostSuccess(null)}
            className="text-emerald-600 hover:text-emerald-800 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(['all', 'pending', 'approved', 'rejected', 'expired'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition cursor-pointer ${
              filter === tab
                ? 'bg-[#F28C38] text-white shadow-md shadow-[#F28C38]/20'
                : 'bg-white text-slate-600 border border-[#DDD7D2] hover:bg-slate-50'
            }`}
          >
            {tab} ({
              tab === 'all'
                ? jobs.length
                : tab === 'expired'
                ? jobs.filter((j) => j.is_expired).length
                : jobs.filter((j) => j.status === tab).length
            })
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState message="Loading opportunities" className="py-16" />
      ) : filteredJobs.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm">
          <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Jobs in this Category</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-lg uppercase">
                      {job.employment_type}
                    </span>
                    <h3 className="text-base font-bold text-slate-900 mt-2">{job.title}</h3>
                    <PostedAt date={job.created_at} className="text-[11px] text-slate-400 block mt-1" />
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <Building className="w-3.5 h-3.5" /> {job.company} • <MapPin className="w-3.5 h-3.5" /> {job.location}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {job.is_expired && (
                      <span className="px-2.5 py-1 text-[10px] font-bold rounded-full uppercase bg-slate-200 text-slate-700">
                        Expired
                      </span>
                    )}
                    <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full uppercase ${
                      job.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                      job.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {job.status}
                    </span>
                  </div>
                </div>

                {/* Deadline Information */}
                <div className="my-2.5 flex items-center justify-between text-[11px] bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                  <div>
                    {job.application_deadline || job.deadline ? (
                      <span className="text-slate-600">
                        Deadline: <strong className={job.is_expired ? 'text-red-600' : 'text-slate-800'}>
                          {new Date(job.application_deadline || job.deadline!).toLocaleString()}
                        </strong>
                      </span>
                    ) : (
                      <span className="text-amber-600 font-semibold">No deadline set</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingDeadlineJob(job);
                      const currentDl = job.application_deadline || job.deadline;
                      setNewDeadlineToSet(currentDl ? new Date(currentDl).toISOString().slice(0, 16) : '');
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700 font-bold underline"
                  >
                    Edit Deadline
                  </button>
                </div>

                <p className="text-xs text-slate-600 line-clamp-3 my-3 bg-slate-50 p-3 rounded-xl leading-relaxed">
                  {job.description}
                </p>
                <button
                  type="button"
                  onClick={() => setViewingJobDetails(job)}
                  className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:text-blue-900 hover:underline"
                >
                  View Full Details <Eye className="h-3.5 w-3.5" />
                </button>

                <div className="text-[11px] text-slate-400">
                  Posted by: <span className="font-semibold text-slate-700">{job.poster_name || 'Alumni'}</span> ({job.poster_email || '—'})
                </div>

                {/* Document Attachment Display */}
                {job.attachment && job.attachment.name && (
                  <div className="mt-3">
                    <DocumentAttachmentView attachment={job.attachment} label="Job Details" />
                  </div>
                )}

                {/* Applicant Count Banner */}
                <div className="mt-3 flex items-center justify-between text-xs bg-blue-50/70 border border-blue-100 px-3.5 py-2.5 rounded-xl">
                  <div className="flex items-center gap-2 font-bold text-blue-900">
                    <Users className="w-4 h-4 text-blue-600" />
                    <span>{applicantCounts[job.id] ?? 0} Total Applicants</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenApplicantsModal(job)}
                    className="text-xs font-bold text-blue-700 hover:text-blue-900 underline flex items-center gap-1"
                  >
                    <span>View List</span>
                  </button>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                <button
                  onClick={() => handleDelete(job.id)}
                  className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-bold"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleOpenApplicantsModal(job)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F28C38] hover:bg-[#E07D2E] text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>View Applicants</span>
                  </button>

                  {job.status !== 'approved' && (
                    <button
                      onClick={() => handleStatusChange(job.id, 'approved')}
                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-sm"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </button>
                  )}
                  {job.status !== 'rejected' && (
                    <button
                      onClick={() => handleStatusChange(job.id, 'rejected')}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-bold transition"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Post Job Modal */}
      {showPostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <button
              onClick={() => {
                setShowPostModal(false);
                setPostError(null);
              }}
              className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-1">Post a Job or Internship</h3>
            <p className="text-xs text-slate-500 mb-6">
              Create and publish a new job opportunity. Jobs created by administrators are automatically approved.
            </p>

            {postError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{postError}</span>
              </div>
            )}

            <form onSubmit={handlePostJob} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Job Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={newJob.title}
                    onChange={(e) => setNewJob({ ...newJob, title: e.target.value })}
                    placeholder="e.g. Associate Software Engineer"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newJob.company}
                    onChange={(e) => setNewJob({ ...newJob, company: e.target.value })}
                    placeholder="e.g. Infosys / Google"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Employment Type *
                  </label>
                  <select
                    value={newJob.employment_type}
                    onChange={(e) => setNewJob({ ...newJob, employment_type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Internship">Internship</option>
                    <option value="Remote">Remote</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Location *
                  </label>
                  <input
                    type="text"
                    required
                    value={newJob.location}
                    onChange={(e) => setNewJob({ ...newJob, location: e.target.value })}
                    placeholder="e.g. Pune, India"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Salary / Stipend
                  </label>
                  <input
                    type="text"
                    value={newJob.salary}
                    onChange={(e) => setNewJob({ ...newJob, salary: e.target.value })}
                    placeholder="e.g. ₹8-12 LPA"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Application Deadline *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    min={new Date().toISOString().slice(0, 16)}
                    value={newJob.deadline}
                    onChange={(e) => setNewJob({ ...newJob, deadline: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Required Skills
                  </label>
                  <input
                    type="text"
                    value={newJob.skillsStr}
                    onChange={(e) => setNewJob({ ...newJob, skillsStr: e.target.value })}
                    placeholder="e.g. Java, Spring Boot, MySQL (comma separated)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Job Description *
                </label>
                <textarea
                  rows={4}
                  required
                  value={newJob.description}
                  onChange={(e) => setNewJob({ ...newJob, description: e.target.value })}
                  placeholder="Describe the responsibilities, qualifications, and benefits..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Document Attachment */}
              <DocumentAttachment
                label="Job Document (Optional)"
                value={newJob.attachment}
                onChange={(attachment) => setNewJob({ ...newJob, attachment })}
              />

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPostModal(false);
                    setPostError(null);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={posting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 disabled:opacity-50 transition"
                >
                  {posting ? 'Posting...' : 'Post Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Deadline Modal */}
      {editingDeadlineJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl relative border border-slate-100">
            <button
              onClick={() => setEditingDeadlineJob(null)}
              className="absolute top-5 right-5 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-base font-bold text-slate-900 mb-1">Set or Edit Deadline</h3>
            <p className="text-xs text-slate-500 mb-4">{editingDeadlineJob.title} — {editingDeadlineJob.company}</p>
            <form onSubmit={handleUpdateDeadline} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Application Deadline (Date & Time) *
                </label>
                <input
                  type="datetime-local"
                  required
                  min={new Date().toISOString().slice(0, 16)}
                  value={newDeadlineToSet}
                  onChange={(e) => setNewDeadlineToSet(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingDeadlineJob(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingDeadline}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-md shadow-blue-600/20 disabled:opacity-50"
                >
                  {updatingDeadline ? 'Saving...' : 'Save Deadline'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* APPLICANT DETAILS MODAL */}
      {selectedJobForApplicants && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative border border-slate-200">
            <button
              onClick={() => {
                setSelectedJobForApplicants(null);
                setModalApplicants([]);
                setModalApplicantsError(null);
                setModalPage(1);
                setModalTotalCount(0);
              }}
              className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="mb-6 pr-8">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-lg uppercase">
                  {selectedJobForApplicants.employment_type || 'Job'}
                </span>
                <span className="px-3 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200">
                  {modalTotalCount} Total Applicant{modalTotalCount === 1 ? '' : 's'}
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-900">
                {selectedJobForApplicants.title}
              </h3>
              <p className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                <span className="flex items-center gap-1 font-medium text-slate-700">
                  <Building className="w-3.5 h-3.5 text-slate-400" />
                  {selectedJobForApplicants.company}
                </span>
                <span>•</span>
                <span>{selectedJobForApplicants.location || 'Location Not Specified'}</span>
              </p>
            </div>

            {/* Modal Body */}
            {modalApplicantsLoading ? (
              <div className="py-16 text-center text-xs text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-[#F28C38]" />
                Loading applicant records from Supabase...
              </div>
            ) : modalApplicantsError ? (
              <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-xs flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalApplicantsError}</span>
                </div>
                <button
                  onClick={() => fetchModalApplicants(selectedJobForApplicants.id, modalPage)}
                  className="px-3 py-1 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 text-[11px]"
                >
                  Retry
                </button>
              </div>
            ) : modalApplicants.length === 0 ? (
              <div className="p-12 text-center bg-slate-50 rounded-2xl border border-slate-200">
                <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-slate-800">No Applications Yet</h4>
                <p className="text-xs text-slate-500 mt-1">
                  No students or alumni have applied to this job posting.
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-800">
                    <thead className="bg-slate-50 text-slate-600 font-semibold text-[11px] uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Applicant</th>
                        <th className="py-3 px-4">Role & ID</th>
                        <th className="py-3 px-4">Department & Course</th>
                        <th className="py-3 px-4">Applied Date</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Materials</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {modalApplicants.map((a) => (
                        <tr key={a.application_id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                                {a.name.charAt(0) || 'A'}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900">{a.name}</div>
                                <div className="text-[11px] text-slate-500 flex items-center gap-1">
                                  <Mail className="w-3 h-3 text-slate-400" />
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
                              <div className="font-mono text-[11px] text-slate-500">
                                {a.identifier}
                              </div>
                            )}
                            {a.prn && a.prn !== a.identifier && (
                              <div className="font-mono text-[10px] text-slate-400">
                                PRN: {a.prn}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-700">
                            <div className="font-medium">{a.department || '—'}</div>
                            {(a.course || a.degree) && (
                              <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                <GraduationCap className="w-3 h-3 text-slate-400" />
                                {a.course || a.degree}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-500">
                            {a.applied_at ? new Date(a.applied_at).toLocaleDateString() : '—'}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              a.status === 'selected' ? 'bg-emerald-100 text-emerald-800' :
                              a.status === 'shortlisted' ? 'bg-purple-100 text-purple-800' :
                              a.status === 'rejected' ? 'bg-red-100 text-red-800' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {a.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {a.cover_letter && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setModalCoverLetter({
                                      name: a.name,
                                      text: a.cover_letter,
                                    })
                                  }
                                  className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
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
                                <span className="text-[11px] text-slate-300">No resume</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Modal Pagination Controls */}
                {modalTotalCount > MODAL_LIMIT && (
                  <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                    <div>
                      Showing {(modalPage - 1) * MODAL_LIMIT + 1} to{' '}
                      {Math.min(modalPage * MODAL_LIMIT, modalTotalCount)} of {modalTotalCount} applicants
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fetchModalApplicants(selectedJobForApplicants.id, modalPage - 1)}
                        disabled={modalPage <= 1 || modalApplicantsLoading}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-semibold"
                      >
                        <ChevronLeft className="w-3 h-3" /> Previous
                      </button>
                      <span className="font-semibold text-slate-800">
                        Page {modalPage} of {Math.max(1, Math.ceil(modalTotalCount / MODAL_LIMIT))}
                      </span>
                      <button
                        type="button"
                        onClick={() => fetchModalApplicants(selectedJobForApplicants.id, modalPage + 1)}
                        disabled={modalPage >= Math.ceil(modalTotalCount / MODAL_LIMIT) || modalApplicantsLoading}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-semibold"
                      >
                        Next <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Modal Footer */}
            <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-100">
              <Link
                href="/admin/participation?tab=jobs"
                className="text-xs font-bold text-[#F28C38] hover:underline flex items-center gap-1"
              >
                <span>Open in Participation Console</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => {
                  setSelectedJobForApplicants(null);
                  setModalApplicants([]);
                  setModalApplicantsError(null);
                  setModalPage(1);
                  setModalTotalCount(0);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
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
      <JobDetailsModal job={viewingJobDetails} onClose={() => setViewingJobDetails(null)} />
    </DashboardLayout>
  );
}
