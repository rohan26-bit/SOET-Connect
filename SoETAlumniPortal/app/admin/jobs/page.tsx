'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { jobService, JobItem } from '@/lib/services/jobService';
import { Briefcase, CheckCircle2, XCircle, Trash2, Building, MapPin, Search, Plus, X, AlertCircle } from 'lucide-react';
import DocumentAttachment, {
  DocumentAttachmentData,
  DocumentAttachmentView,
} from '@/components/DocumentAttachment';

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  // Create Job Modal (Admin)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newJob, setNewJob] = useState({
    title: '',
    company: '',
    description: '',
    location: '',
    employment_type: 'Full-time',
    experience: '',
    salary: '',
    skillsStr: '',
    application_url: '',
    deadline: '',
    attachment: null as DocumentAttachmentData | null,
  });

  const loadJobs = async () => {
    setLoading(true);
    try {
      const data = await jobService.getAllJobsForAdmin();
      const demoData = data.map((job, idx) => {
        if (!job.attachment && idx === 0) {
          return {
            ...job,
            attachment: {
              name: 'Software_Engineer_JD_Requirements.pdf',
              type: 'PDF',
              size: 1840000,
              url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            },
          };
        }
        return job;
      });
      setJobs(demoData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    try {
      const skills = newJob.skillsStr.split(',').map((s) => s.trim()).filter(Boolean);
      await jobService.createJob({
        posted_by: 'admin',
        title: newJob.title,
        company: newJob.company,
        description: newJob.description,
        location: newJob.location,
        employment_type: newJob.employment_type,
        experience: newJob.experience,
        salary: newJob.salary,
        skills,
        application_url: newJob.application_url,
        deadline: newJob.deadline || undefined,
        attachment: newJob.attachment || undefined,
      });

      setShowCreateModal(false);
      setNewJob({
        title: '',
        company: '',
        description: '',
        location: '',
        employment_type: 'Full-time',
        experience: '',
        salary: '',
        skillsStr: '',
        application_url: '',
        deadline: '',
        attachment: null,
      });
      loadJobs();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create job posting.');
    } finally {
      setCreating(false);
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

  const filteredJobs = jobs.filter((j) => (filter === 'all' ? true : j.status === filter));

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
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#F28C38] hover:bg-[#E07D2E] text-white rounded-xl text-xs font-bold shadow-lg shadow-[#F28C38]/25 transition cursor-pointer self-start md:self-auto"
        >
          <Plus className="w-4 h-4" /> Post Opportunity
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition cursor-pointer ${
              filter === tab
                ? 'bg-[#F28C38] text-white shadow-md shadow-[#F28C38]/20'
                : 'bg-white text-slate-600 border border-[#DDD7D2] hover:bg-slate-50'
            }`}
          >
            {tab} ({jobs.filter((j) => (tab === 'all' ? true : j.status === tab)).length})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm">Loading all jobs...</div>
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
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <Building className="w-3.5 h-3.5" /> {job.company} • <MapPin className="w-3.5 h-3.5" /> {job.location}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full uppercase ${
                    job.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                    job.status === 'rejected' ? 'bg-red-100 text-red-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {job.status}
                  </span>
                </div>

                <p className="text-xs text-slate-600 line-clamp-3 my-3 bg-slate-50 p-3 rounded-xl leading-relaxed">
                  {job.description}
                </p>

                {/* Job Details Document (Optional) */}
                <DocumentAttachmentView attachment={job.attachment} label="Job Details" />

                <div className="text-[11px] text-slate-400 mt-3">
                  Posted by: <span className="font-semibold text-slate-700">{job.poster_name || 'Alumni'}</span> ({job.poster_email || '—'})
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => handleDelete(job.id)}
                  className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-bold"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>

                <div className="flex items-center gap-2">
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

      {/* Create Job Modal (Admin) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl relative border border-slate-100 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-1">Create Job Opportunity</h3>
            <p className="text-xs text-slate-500 mb-6">
              Post an official job or internship notice directly to the SOET student portal.
            </p>

            {createError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateJob} className="space-y-4">
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#F28C38]"
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#F28C38]"
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:ring-2 focus:ring-[#F28C38]"
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#F28C38]"
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#F28C38]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Required Skills (comma separated)
                </label>
                <input
                  type="text"
                  value={newJob.skillsStr}
                  onChange={(e) => setNewJob({ ...newJob, skillsStr: e.target.value })}
                  placeholder="e.g. Java, Spring Boot, MySQL"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#F28C38]"
                />
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
                  placeholder="Describe responsibilities, eligibility, selection process..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#F28C38]"
                />
              </div>

              {/* Job Details Document (Optional) */}
              <DocumentAttachment
                value={newJob.attachment}
                onChange={(att) => setNewJob({ ...newJob, attachment: att })}
                label="Job Details Document (Optional)"
                helperText="Upload a PDF or Word document containing complete job description, eligibility, responsibilities, selection process, company information, etc."
              />

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 bg-[#F28C38] hover:bg-[#E07D2E] text-white text-xs font-bold rounded-xl shadow-md shadow-[#F28C38]/20 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
