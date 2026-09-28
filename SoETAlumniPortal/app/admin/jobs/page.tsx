'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { jobService, JobItem } from '@/lib/services/jobService';
import { Briefcase, CheckCircle2, XCircle, Trash2, Building, MapPin, Search } from 'lucide-react';

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const loadJobs = async () => {
    setLoading(true);
    try {
      const data = await jobService.getAllJobsForAdmin();
      setJobs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

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
      <div className="flex items-center text-xs font-semibold text-slate-400 mb-6 uppercase tracking-wider">
        <span>Administration</span>
        <span className="mx-2 text-slate-300">/</span>
        <span className="text-blue-600">Job Approvals & Moderation</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Job Moderation Console</h1>
          <p className="text-xs text-slate-500 mt-1">
            Review, approve, or reject job and internship postings submitted by SOET alumni.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition ${
              filter === tab
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
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

                <div className="text-[11px] text-slate-400">
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
    </DashboardLayout>
  );
}
