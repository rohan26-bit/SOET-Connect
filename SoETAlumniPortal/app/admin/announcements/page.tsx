'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import LoadingState from '@/components/LoadingState';
import PostedAt from '@/components/PostedAt';
import AnnouncementDetailsModal from '@/components/AnnouncementDetailsModal';
import { useAuth } from '@/components/AuthProvider';
import { announcementService, AnnouncementItem } from '@/lib/services/announcementService';
import { Megaphone, Plus, Trash2, Users, GraduationCap, Globe, AlertCircle, X } from 'lucide-react';
import DocumentAttachment, {
  DocumentAttachmentData,
  DocumentAttachmentView,
} from '@/components/DocumentAttachment';

export default function AdminAnnouncementsPage() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [viewingAnnouncement, setViewingAnnouncement] = useState<AnnouncementItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expiry edit modal state
  const [editingExpiryAnn, setEditingExpiryAnn] = useState<AnnouncementItem | null>(null);
  const [newExpiryToSet, setNewExpiryToSet] = useState('');
  const [updatingExpiry, setUpdatingExpiry] = useState(false);

  const [newAnnouncement, setNewAnnouncement] = useState({
    title: '',
    content: '',
    target_audience: 'all' as 'all' | 'students' | 'alumni',
    expires_at: '',
    attachment: null as DocumentAttachmentData | null,
  });

  const loadAnnouncements = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await announcementService.getAnnouncements();
      setAnnouncements(data);
    } catch (err) {
      console.error(err);
      setLoadError(err instanceof Error ? err.message : 'Unable to load announcements.');
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
      const isoExpiresAt = newAnnouncement.expires_at
        ? new Date(newAnnouncement.expires_at).toISOString()
        : null;

      await announcementService.createAnnouncement({
        created_by: user.id,
        title: newAnnouncement.title,
        content: newAnnouncement.content,
        target_audience: newAnnouncement.target_audience,
        expires_at: isoExpiresAt,
        attachment: newAnnouncement.attachment,
      });

      setShowModal(false);
      setNewAnnouncement({ title: '', content: '', target_audience: 'all', expires_at: '', attachment: null });
      await loadAnnouncements();
    } catch (err: any) {
      setError(err.message || 'Failed to create announcement.');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateExpiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpiryAnn) return;
    setUpdatingExpiry(true);
    setActionError(null);
    try {
      const isoVal = newExpiryToSet ? new Date(newExpiryToSet).toISOString() : null;
      await announcementService.updateAnnouncement(editingExpiryAnn.id, {
        expires_at: isoVal,
      });
      setEditingExpiryAnn(null);
      setNewExpiryToSet('');
      await loadAnnouncements();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update announcement expiration.');
    } finally {
      setUpdatingExpiry(false);
    }
  };

  const handleDelete = (id: string) => {
    setActionError(null);
    setDeleteConfirmationId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmationId || deletingId) return;
    const id = deleteConfirmationId;
    setDeletingId(id);
    setActionError(null);
    try {
      await announcementService.deleteAnnouncement(id);
      setDeleteConfirmationId(null);
      await loadAnnouncements();
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete announcement.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-[#6B6B6B] mb-6 uppercase tracking-wider">
        <span>Administration</span>
        <span className="mx-2 text-[#DDD7D2]">/</span>
        <span className="text-[#F28C38]">Broadcasts & Announcements</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-[#4A3832] tracking-tight">University Announcements</h1>
          <p className="text-xs text-[#6B6B6B] mt-1">
            Broadcast urgent news, placement drives, and campus alerts to targeted portal users.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#F28C38] hover:bg-[#E07D2E] text-white rounded-xl text-xs font-bold shadow-lg shadow-[#F28C38]/25 transition cursor-pointer self-start md:self-auto"
        >
          <Plus className="w-4 h-4" /> New Announcement
        </button>
      </div>

      {actionError && (
        <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="shrink-0 font-bold underline">Dismiss</button>
        </div>
      )}

      {loading ? (
        <LoadingState message="Loading announcements" className="py-16" />
      ) : loadError ? (
        <div role="alert" className="rounded-3xl border border-rose-200 bg-rose-50 p-10 text-center">
          <h3 className="text-base font-bold text-rose-800">Unable to load announcements</h3>
          <p className="mt-2 text-xs text-rose-700">{loadError}</p>
          <button type="button" onClick={() => void loadAnnouncements()} className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white">Retry</button>
        </div>
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
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {a.is_expired && (
                      <span className="px-2.5 py-1 text-[10px] font-bold rounded-lg uppercase bg-slate-200 text-slate-700">
                        Expired
                      </span>
                    )}
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
                </div>

                {/* Expiry Details */}
                <div className="my-2.5 flex items-center justify-between text-[11px] bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                  <div>
                    {a.expires_at ? (
                      <span className="text-slate-600">
                        Expires on: <strong className={a.is_expired ? 'text-red-600' : 'text-slate-800'}>
                          {new Date(a.expires_at).toLocaleString()}
                        </strong>
                      </span>
                    ) : (
                      <span className="text-amber-600 font-semibold">No expiry set (Indefinite)</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingExpiryAnn(a);
                      setNewExpiryToSet(a.expires_at ? new Date(a.expires_at).toISOString().slice(0, 16) : '');
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700 font-bold underline"
                  >
                    {a.is_expired ? 'Reactivate / Edit Expiry' : 'Edit Expiry'}
                  </button>
                </div>

                <h3 className="text-base font-bold text-slate-900 mb-2">{a.title}</h3>
                <div className="mb-4 rounded-2xl bg-slate-50 p-3.5">
                  <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                    {a.content}
                  </p>
                  <button
                    type="button"
                    onClick={() => setViewingAnnouncement(a)}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900 hover:underline"
                  >
                    View Full Announcement
                  </button>
                </div>

                {/* Document Attachment Display */}
                {a.attachment && a.attachment.name && (
                  <div className="mb-3">
                    <DocumentAttachmentView attachment={a.attachment} label="Attached Document" />
                  </div>
                )}
              </div>

              {deleteConfirmationId === a.id && (
                <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <p className="text-xs font-semibold text-rose-800">Delete this announcement permanently? It will no longer be available to portal users.</p>
                  <div className="mt-3 flex justify-end gap-2">
                    <button type="button" onClick={() => setDeleteConfirmationId(null)} disabled={deletingId === a.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">Cancel</button>
                    <button type="button" onClick={() => void confirmDelete()} disabled={deletingId === a.id} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{deletingId === a.id ? 'Deleting…' : 'Confirm delete'}</button>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <PostedAt date={a.created_at} className="text-[11px] text-slate-400" />
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

      <AnnouncementDetailsModal announcement={viewingAnnouncement} onClose={() => setViewingAnnouncement(null)} />

      {/* Create Announcement Modal */}
      {editingExpiryAnn && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="edit-announcement-expiry-title" className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl">
            <h3 id="edit-announcement-expiry-title" className="text-lg font-bold text-slate-900">Edit Announcement Expiry</h3>
            <p className="mt-1 text-xs text-slate-500">Set an expiry date or clear it to keep this announcement active indefinitely.</p>
            {actionError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{actionError}</p>}
            <form onSubmit={handleUpdateExpiry} className="mt-5 space-y-4">
              <div>
                <label htmlFor="announcement-expiry" className="mb-1 block text-xs font-semibold text-slate-700">Expiry date and time</label>
                <input id="announcement-expiry" type="datetime-local" value={newExpiryToSet} onChange={(event) => setNewExpiryToSet(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="mt-1 text-[11px] text-slate-500">Leave blank to remove the expiry date.</p>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setEditingExpiryAnn(null); setNewExpiryToSet(''); setActionError(null); }} disabled={updatingExpiry} className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={updatingExpiry} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{updatingExpiry ? 'Saving…' : 'Save expiry'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

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

              {/* Document Attachment */}
              <DocumentAttachment
                label="Announcement Document (Optional)"
                value={newAnnouncement.attachment}
                onChange={(attachment) => setNewAnnouncement({ ...newAnnouncement, attachment })}
              />

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
