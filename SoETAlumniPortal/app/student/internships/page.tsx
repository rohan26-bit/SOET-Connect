'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { jobService, JobItem } from '@/lib/services/jobService';
import { Briefcase, Building, MapPin, ArrowRight } from 'lucide-react';

export default function InternshipsPage() {
  const [internships, setInternships] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInternships() {
      try {
        const data = await jobService.getApprovedJobs({ employmentType: 'Internship' });
        setInternships(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadInternships();
  }, []);

  return (
    <DashboardLayout>
      <div className="flex items-center text-xs font-semibold text-slate-400 mb-6 uppercase tracking-wider">
        <span>Careers</span>
        <span className="mx-2 text-slate-300">/</span>
        <span className="text-blue-600">Internships</span>
      </div>

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Active Student Internships</h1>
          <p className="text-xs text-slate-500 mt-1">Verified industry internship opportunities from SOET alumni.</p>
        </div>
        <Link
          href="/student/jobs"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md transition"
        >
          View All Placements
        </Link>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm">Loading internship listings...</div>
      ) : internships.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm">
          <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Active Internships</h3>
          <p className="text-xs text-slate-500 mt-1">Check the full jobs section for general opportunities.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {internships.map((job) => (
            <div
              key={job.id}
              className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div>
                <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase rounded-md">
                  {job.employment_type}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">{job.title}</h3>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                  <span className="flex items-center gap-1"><Building className="w-3.5 h-3.5" /> {job.company}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {job.location}</span>
                  {job.salary && <span>• Stipend: {job.salary}</span>}
                </div>
              </div>

              <Link
                href="/student/jobs"
                className="px-5 py-2.5 bg-slate-900 hover:bg-blue-600 text-white text-xs font-bold rounded-xl transition text-center shrink-0"
              >
                Apply via Jobs Portal
              </Link>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
