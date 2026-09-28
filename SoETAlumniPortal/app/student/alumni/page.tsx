'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { alumniService, AlumniDirectoryItem } from '@/lib/services/alumniService';
import { Search, MapPin, Building, GraduationCap, Globe, ExternalLink, Filter, Mail, X } from 'lucide-react';

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

export default function AlumniDirectoryPage() {
  const [alumni, setAlumni] = useState<AlumniDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('All Departments');
  const [selectedAlumni, setSelectedAlumni] = useState<AlumniDirectoryItem | null>(null);

  const fetchAlumni = async () => {
    setLoading(true);
    try {
      const data = await alumniService.getApprovedAlumni({
        search: search || undefined,
        department: department !== 'All Departments' ? department : undefined,
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
  }, [department]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAlumni();
  };

  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-slate-400 mb-6 uppercase tracking-wider">
        <span>Network</span>
        <span className="mx-2 text-slate-300">/</span>
        <span className="text-blue-600">Alumni Directory</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">SOET Connect Directory</h1>
          <p className="text-xs text-slate-500 mt-1">
            Connect with verified graduates and industry professionals from our institution.
          </p>
        </div>
      </div>

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

          <div className="flex items-center gap-2">
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition cursor-pointer"
            >
              Search
            </button>
          </div>
        </form>
      </div>

      {/* Alumni Grid */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm">
          Searching verified alumni network...
        </div>
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

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedAlumni(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
