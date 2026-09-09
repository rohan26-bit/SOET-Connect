'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/components/AuthProvider';
import { announcementService, AnnouncementItem } from '@/lib/services/announcementService';
import { Megaphone, Plus, Trash2, Users, GraduationCap, Globe, AlertCircle, X } from 'lucide-react';

export default function AdminAnnouncementsPage() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newAnnouncement, setNewAnnouncement] = useState({
    title: '',
    content: '',
    target_audience: 'all' as 'all' | 'students' | 'alumni',
  });

  const loadAnnouncements = async () => {
    setLoading(true);
    try {
      const data = await announcementService.getAnnouncements();
      setAnnouncements(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreating(true);
    setError(null);

    try {
      await announcementService.createAnnouncement({
        created_by: user.id,
        title: newAnnouncement.title,
        content: newAnnouncement.content,
        target_audience: newAnnouncement.target_audience,
      });

      setShowModal(false);
      setNewAnnouncement({ title: '', content: '', target_audience: 'all' });
      loadAnnouncements();
    } catch (err: any) {
      setError(err.message || 'Failed to create announcement.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;
    try {
      await announcementService.deleteAnnouncement(id);
      loadAnnouncements();
    } catch (err: any) {
      alert(err.message || 'Failed to delete');
    }
  };

  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-slate-400 mb-6 uppercase tracking-wider">
        <span>Administration</span>
        <span className="mx-2 text-slate-300">/</span>
        <span className="text-blue-600">Broadcasts & Announcements</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">University Announcements</h1>
          <p className="text-xs text-slate-500 mt-1">
            Broadcast urgent news, placement drives, and campus alerts to targeted portal users.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/25 transition cursor-pointer self-start md:self-auto"
        >
          <Plus className="w-4 h-4" /> New Announcement
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm">Loading broadcasts...</div>
      ) : announcements.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm">
          <Megaphone className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Active Announcements</h3>
          <p className="text-xs text-slate-500 mt-1">Click "New Announcement" to publish your first broadcast.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {announcements.map((a) => (
            <div
              key={a.id}
              className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span className={`px-2.5 py-1 text-[10px] font-bold rounded-lg uppercase flex items-center gap-1 ${
                    a.target_audience === 'students' ? 'bg-blue-50 text-blue-700' :
                    a.target_audience === 'alumni' ? 'bg-indigo-50 text-indigo-700' :
                    'bg-emerald-50 text-emerald-700'
                  }`}>
                    {a.target_audience === 'students' && <GraduationCap className="w-3 h-3" />}
                    {a.target_audience === 'alumni' && <Users className="w-3 h-3" />}
                    {a.target_audience === 'all' && <Globe className="w-3 h-3" />}
                    Audience: {a.target_audience}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900 mb-2">{a.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-2xl mb-4">
                  {a.content}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>Published on {new Date(a.created_at).toLocaleDateString()}</span>
                <button
                  onClick={() => handleDelete(a.id)}
                  className="text-red-600 hover:text-red-700 font-bold flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Announcement Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative border border-slate-100">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-1">Create Announcement</h3>
            <p className="text-xs text-slate-500 mb-6">Target this message to specific portal roles.</p>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Announcement Title *
                </label>
                <input
                  type="text"
                  required
                  value={newAnnouncement.title}
                  onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
                  placeholder="e.g. Annual Convocation 2026 Registration"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Target Audience *
                </label>
                <select
                  value={newAnnouncement.target_audience}
                  onChange={(e) => setNewAnnouncement({ ...newAnnouncement, target_audience: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Portal Users (Students & Alumni)</option>
                  <option value="students">Students Only</option>
                  <option value="alumni">Alumni Only</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Announcement Content *
                </label>
                <textarea
                  rows={4}
                  required
                  value={newAnnouncement.content}
                  onChange={(e) => setNewAnnouncement({ ...newAnnouncement, content: e.target.value })}
                  placeholder="Type the message details here..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 disabled:opacity-50"
                >
                  {creating ? 'Publishing...' : 'Publish Announcement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
