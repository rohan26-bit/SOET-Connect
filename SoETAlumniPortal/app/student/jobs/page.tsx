'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/components/AuthProvider';
import { jobService, JobItem, JobApplicationItem } from '@/lib/services/jobService';
import { 
  Briefcase, MapPin, Building, Search, Plus, 
  Clock, DollarSign, CheckCircle2, AlertCircle, FileText, X, Send 
} from 'lucide-react';

export default function JobsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'browse' | 'my_applications' | 'my_posted_jobs'>('browse');
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [myApplications, setMyApplications] = useState<JobApplicationItem[]>([]);
  const [myPostedJobs, setMyPostedJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  // Application Modal state
  const [selectedJob, setSelectedJob] = useState<JobItem | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [applying, setApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Post Job Modal state (For Alumni & Admin)
  const [showPostModal, setShowPostModal] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
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
  });

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'browse') {
        const data = await jobService.getApprovedJobs({
          search: search || undefined,
          employmentType: typeFilter !== 'all' ? typeFilter : undefined,
        });
        setJobs(data);
      } else if (activeTab === 'my_applications' && user) {
        const apps = await jobService.getMyApplications(user.id);
        setMyApplications(apps);
      } else if (activeTab === 'my_posted_jobs' && user) {
        const posted = await jobService.getMyPostedJobs(user.id);
        setMyPostedJobs(posted);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab, typeFilter]);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob || !user) return;
    setApplying(true);
    setApplyError(null);

    try {
      await jobService.applyForJob({
        job_id: selectedJob.id,
        student_id: user.id,
        resume_file: resumeFile || undefined,
        cover_letter: coverLetter || undefined,
      });
      setApplySuccess(true);
      setTimeout(() => {
        setApplySuccess(false);
        setSelectedJob(null);
        setResumeFile(null);
        setCoverLetter('');
      }, 2000);
    } catch (err: any) {
      setApplyError(err.message || 'Application submission failed.');
    } finally {
      setApplying(false);
    }
  };

  const handlePostJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setPosting(true);
    setPostError(null);

    try {
      const skills = newJob.skillsStr.split(',').map((s) => s.trim()).filter(Boolean);
      await jobService.createJob({
        posted_by: user.id,
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
      });

      setShowPostModal(false);
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
      });
      alert('Job posting submitted! It is now pending admin approval.');
      if (activeTab === 'my_posted_jobs') loadData();
    } catch (err: any) {
      setPostError(err.message || 'Failed to post job.');
    } finally {
      setPosting(false);
    }
  };

  const isAlumniOrAdmin = user?.role === 'alumni' || user?.role === 'admin';

  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-slate-400 mb-6 uppercase tracking-wider">
        <span>Careers</span>
        <span className="mx-2 text-slate-300">/</span>
        <span className="text-blue-600">Jobs & Internships</span>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Opportunities & Placements</h1>
          <p className="text-xs text-slate-500 mt-1">
            Discover corporate roles, startups, and internships verified by SOET Alumni.
          </p>
        </div>

        {isAlumniOrAdmin && (
          <button
            onClick={() => setShowPostModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/25 transition cursor-pointer self-start md:self-auto"
          >
            <Plus className="w-4 h-4" /> Post New Job
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6">
        <button
          onClick={() => setActiveTab('browse')}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition ${
            activeTab === 'browse'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Browse Opportunities
        </button>

        {user?.role === 'student' && (
          <button
            onClick={() => setActiveTab('my_applications')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition ${
              activeTab === 'my_applications'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            My Applications
          </button>
        )}

        {isAlumniOrAdmin && (
          <button
            onClick={() => setActiveTab('my_posted_jobs')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition ${
              activeTab === 'my_posted_jobs'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            My Posted Jobs
          </button>
        )}
      </div>

      {/* Browse Tab */}
      {activeTab === 'browse' && (
        <>
          {/* Filters */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search job title, skills, or company..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="all">All Employment Types</option>
              <option value="Full-time">Full-time</option>
              <option value="Part-time">Part-time</option>
              <option value="Internship">Internship</option>
              <option value="Remote">Remote</option>
            </select>
            <button
              onClick={loadData}
              className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
            >
              Filter
            </button>
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-400 text-sm">Loading job opportunities...</div>
          ) : jobs.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm">
              <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800">No Job Postings Found</h3>
              <p className="text-xs text-slate-500 mt-1">Check back later or try adjusting your filter options.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className="inline-block px-2.5 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase rounded-lg mb-2">
                          {job.employment_type}
                        </span>
                        <h3 className="text-base font-bold text-slate-900 leading-snug">{job.title}</h3>
                        <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 mt-1">
                          <Building className="w-3.5 h-3.5 text-slate-400" /> {job.company}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-y-2 gap-x-4 text-xs text-slate-500 my-3 py-2 border-y border-slate-100">
                      <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400" /> {job.location}</span>
                      {job.salary && <span className="flex items-center gap-1 font-semibold text-emerald-600"><DollarSign className="w-3.5 h-3.5" /> {job.salary}</span>}
                      {job.experience && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-slate-400" /> {job.experience} exp</span>}
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed mb-4">
                      {job.description}
                    </p>

                    {job.skills && job.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {job.skills.map((s, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-semibold rounded-md">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      Posted by {job.poster_name || 'Alumni'}
                    </span>

                    {user?.role === 'student' ? (
                      <button
                        onClick={() => setSelectedJob(job)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 transition cursor-pointer"
                      >
                        Apply Now
                      </button>
                    ) : (
                      <span className="text-xs font-bold text-slate-400">Student Portal Only</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* My Applications Tab (Students) */}
      {activeTab === 'my_applications' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-4">Your Application History</h2>
          {myApplications.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              You haven't submitted any job applications yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {myApplications.map((app) => (
                <div key={app.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{app.job?.title || 'Job Position'}</h3>
                    <p className="text-xs text-slate-500">{app.job?.company} • Applied on {new Date(app.created_at).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <span className={`px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider ${
                      app.status === 'selected' ? 'bg-emerald-100 text-emerald-700' :
                      app.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      app.status === 'interview' ? 'bg-purple-100 text-purple-700' :
                      app.status === 'shortlisted' ? 'bg-blue-100 text-blue-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {app.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* My Posted Jobs Tab (Alumni / Admin) */}
      {activeTab === 'my_posted_jobs' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-4">Jobs Posted By You</h2>
          {myPostedJobs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              You haven't posted any jobs yet. Click "Post New Job" above to submit one.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {myPostedJobs.map((j) => (
                <div key={j.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{j.title}</h3>
                    <p className="text-xs text-slate-500">{j.company} • {j.location} • {j.employment_type}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider ${
                      j.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                      j.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {j.status}
                    </span>
                    <button
                      onClick={async () => {
                        if (confirm('Are you sure you want to delete this job posting?')) {
                          await jobService.deleteJob(j.id);
                          loadData();
                        }
                      }}
                      className="text-xs font-bold text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Application Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative border border-slate-100">
            <button
              onClick={() => setSelectedJob(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-1">Apply for {selectedJob.title}</h3>
            <p className="text-xs text-slate-500 mb-6">{selectedJob.company} • {selectedJob.location}</p>

            {applyError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{applyError}</span>
              </div>
            )}

            {applySuccess ? (
              <div className="text-center py-6">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
                <h4 className="font-bold text-slate-900 text-sm">Application Sent!</h4>
                <p className="text-xs text-slate-500">Your profile and resume were shared with the recruiter.</p>
              </div>
            ) : (
              <form onSubmit={handleApply} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Upload Resume / CV (PDF)
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Cover Note / Message
                  </label>
                  <textarea
                    rows={4}
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    placeholder="Briefly state your suitability and interest for this position..."
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedJob(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={applying}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {applying ? 'Submitting...' : 'Submit Application'}
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Post Job Modal */}
      {showPostModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl relative border border-slate-100 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowPostModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-1">Post a Job or Internship</h3>
            <p className="text-xs text-slate-500 mb-6">
              Submitted jobs are reviewed by administrators before being made visible to students.
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

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Required Skills (comma separated)
                </label>
                <input
                  type="text"
                  value={newJob.skillsStr}
                  onChange={(e) => setNewJob({ ...newJob, skillsStr: e.target.value })}
                  placeholder="e.g. Java, Spring Boot, MySQL"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500"
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
                  placeholder="Describe the responsibilities, qualifications, and benefits..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPostModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={posting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 disabled:opacity-50"
                >
                  {posting ? 'Submitting...' : 'Submit for Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
