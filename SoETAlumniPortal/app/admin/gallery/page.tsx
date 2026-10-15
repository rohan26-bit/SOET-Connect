'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import {
  galleryService,
  GalleryPhoto,
} from '@/lib/services/galleryService';
import {
  Image as ImageIcon,
  Check,
  X,
  Trash2,
  AlertCircle,
  Eye,
  Clock,
  Filter,
  CheckCircle2,
  XCircle,
  Calendar,
  User,
} from 'lucide-react';

export default function AdminGalleryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'pending' | 'all' | 'approved' | 'rejected'>('pending');
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Preview modal
  const [previewPhoto, setPreviewPhoto] = useState<GalleryPhoto | null>(null);

  // Reject modal state
  const [rejectingPhoto, setRejectingPhoto] = useState<GalleryPhoto | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Redirect non-admins
  useEffect(() => {
    if (!authLoading && user && user.role !== 'admin') {
      router.push('/student');
    }
  }, [user, authLoading, router]);

  // Load photos
  const loadPhotos = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await galleryService.getAdminPhotos(activeTab);
      setPhotos(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load gallery photos for moderation.');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (user?.role === 'admin') {
      loadPhotos();
    }
  }, [user, loadPhotos]);

  // Handle Approve
  const handleApprove = async (photoId: string) => {
    setActionLoading(true);
    try {
      await galleryService.updatePhotoStatus(photoId, 'approved');
      setPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, status: 'approved' } : p))
      );
      if (activeTab === 'pending') {
        setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      }
    } catch (err: any) {
      alert(err.message || 'Failed to approve photo.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Reject Submit
  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingPhoto) return;

    setActionLoading(true);
    try {
      await galleryService.updatePhotoStatus(
        rejectingPhoto.id,
        'rejected',
        rejectionReason.trim() || undefined
      );

      setPhotos((prev) =>
        prev.map((p) =>
          p.id === rejectingPhoto.id
            ? { ...p, status: 'rejected', rejection_reason: rejectionReason }
            : p
        )
      );

      if (activeTab === 'pending') {
        setPhotos((prev) => prev.filter((p) => p.id !== rejectingPhoto.id));
      }

      setRejectingPhoto(null);
      setRejectionReason('');
    } catch (err: any) {
      alert(err.message || 'Failed to reject photo.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Delete
  const handleDelete = async (photoId: string) => {
    if (!confirm('Are you sure you want to permanently delete this photo?')) {
      return;
    }

    setActionLoading(true);
    try {
      await galleryService.deletePhoto(photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      if (previewPhoto?.id === photoId) {
        setPreviewPhoto(null);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete photo.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-[#222222] tracking-tight">
              Gallery Moderation
            </h1>
            <p className="text-sm text-[#6B6B6B] mt-1">
              Review and moderate alumni photo submissions to ensure compliance with community standards.
            </p>
          </div>
        </div>

        {/* Status Tab Switcher */}
        <div className="flex gap-2 border-b border-[#E0DCD7] pb-2">
          {[
            { key: 'pending', label: 'Pending Review' },
            { key: 'all', label: 'All Submissions' },
            { key: 'approved', label: 'Approved' },
            { key: 'rejected', label: 'Rejected' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === tab.key
                  ? 'bg-[#F28C38] text-white shadow-sm'
                  : 'text-[#6B6B6B] hover:text-[#222222] hover:bg-[#F7F4EF]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Error notification */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-red-700 text-xs font-medium">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Content list */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="h-72 bg-[#EAE6E1] animate-pulse rounded-2xl border border-[#DDD7D2]"
              />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="bg-white rounded-3xl border border-[#E0DCD7] p-12 text-center">
            <div className="w-12 h-12 mx-auto mb-3 bg-[#F7F4EF] text-[#888888] rounded-2xl flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            </div>
            <h3 className="text-sm font-bold text-[#222222]">
              {activeTab === 'pending'
                ? 'No pending photos for review'
                : `No ${activeTab} photos found`}
            </h3>
            <p className="text-xs text-[#6B6B6B] mt-1 max-w-sm mx-auto">
              All submissions in this queue have been processed.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {photos.map((photo) => {
              const imageUrl = galleryService.getImageUrl(photo.id);

              return (
                <div
                  key={photo.id}
                  className="bg-white rounded-2xl border border-[#E0DCD7] overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Derivative image preview */}
                    <div
                      onClick={() => setPreviewPhoto(photo)}
                      className="relative aspect-[16/10] bg-[#F7F4EF] cursor-pointer group select-none"
                    >
                      <img
                        src={imageUrl}
                        alt={photo.title}
                        loading="lazy"
                        onContextMenu={(e) => e.preventDefault()}
                        className="w-full h-full object-cover pointer-events-none"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold gap-1.5">
                        <Eye className="w-4 h-4" />
                        Preview Derivative
                      </div>

                      {/* Status badge */}
                      <span
                        className={`absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          photo.status === 'approved'
                            ? 'bg-emerald-500 text-white'
                            : photo.status === 'rejected'
                            ? 'bg-red-500 text-white'
                            : 'bg-amber-500 text-white'
                        }`}
                      >
                        {photo.status}
                      </span>
                    </div>

                    {/* Metadata */}
                    <div className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-xs font-bold text-[#222222] line-clamp-1">
                          {photo.title}
                        </h3>
                        {photo.category && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EAE6E1] text-[#4A3832] uppercase shrink-0">
                            {photo.category}
                          </span>
                        )}
                      </div>

                      {photo.description && (
                        <p className="text-[11px] text-[#6B6B6B] line-clamp-2">
                          {photo.description}
                        </p>
                      )}

                      <div className="pt-2 border-t border-[#F0EBE6] text-[11px] text-[#888888] space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 font-medium text-[#4A3832]">
                            <User className="w-3.5 h-3.5" />
                            {photo.user_name || 'Alumnus'}
                          </span>
                          {photo.batch_year && (
                            <span>Batch {photo.batch_year}</span>
                          )}
                        </div>
                        {photo.event_name && (
                          <p className="text-[#6B6B6B] truncate">
                            Event: {photo.event_name}
                          </p>
                        )}
                        <p className="text-[10px] text-[#888888]">
                          Submitted {new Date(photo.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      {photo.status === 'rejected' && photo.rejection_reason && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-xl text-[10px] text-red-700">
                          Rejection Reason: {photo.rejection_reason}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="p-3 bg-[#FBFAF8] border-t border-[#E0DCD7] flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleDelete(photo.id)}
                      disabled={actionLoading}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition"
                      title="Delete photo permanently"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-2">
                      {photo.status !== 'rejected' && (
                        <button
                          onClick={() => {
                            setRejectingPhoto(photo);
                            setRejectionReason('');
                          }}
                          disabled={actionLoading}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 transition"
                        >
                          <X className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      )}

                      {photo.status !== 'approved' && (
                        <button
                          onClick={() => handleApprove(photo.id)}
                          disabled={actionLoading}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Approve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* PREVIEW MODAL */}
        {previewPhoto && (
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setPreviewPhoto(null)}
          >
            <div
              className="bg-white rounded-3xl max-w-4xl w-full overflow-hidden shadow-2xl border border-white/20 animate-fadeIn"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 flex items-center justify-between border-b border-[#E0DCD7]">
                <h3 className="text-base font-bold text-[#222222]">
                  {previewPhoto.title}
                </h3>
                <button
                  onClick={() => setPreviewPhoto(null)}
                  className="p-1.5 text-[#6B6B6B] hover:bg-[#F7F4EF] rounded-xl transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="relative bg-[#111111] max-h-[65vh] flex items-center justify-center overflow-hidden select-none">
                <img
                  src={galleryService.getImageUrl(previewPhoto.id)}
                  alt={previewPhoto.title}
                  onContextMenu={(e) => e.preventDefault()}
                  className="max-h-[65vh] w-auto max-w-full object-contain pointer-events-none select-none"
                />
              </div>

              <div className="p-4 bg-[#FBFAF8] border-t border-[#E0DCD7] flex justify-between items-center text-xs text-[#6B6B6B]">
                <span>Shared by {previewPhoto.user_name || 'Alumnus'}</span>
                <span className="capitalize font-semibold">{previewPhoto.status}</span>
              </div>
            </div>
          </div>
        )}

        {/* REJECT MODAL */}
        {rejectingPhoto && (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => !actionLoading && setRejectingPhoto(null)}
          >
            <div
              className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-[#E0DCD7] animate-fadeIn"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 flex items-center justify-between border-b border-[#E0DCD7]">
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-500" />
                  <h3 className="text-base font-bold text-[#222222]">
                    Reject Submission
                  </h3>
                </div>
                <button
                  disabled={actionLoading}
                  onClick={() => setRejectingPhoto(null)}
                  className="p-1.5 text-[#6B6B6B] hover:bg-[#F7F4EF] rounded-xl transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleRejectSubmit} className="p-6 space-y-4">
                <p className="text-xs text-[#6B6B6B]">
                  Provide an optional reason for rejecting &quot;{rejectingPhoto.title}&quot;. The submitter will be notified with this feedback.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-2">
                    Rejection Reason (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="e.g. Photo resolution is too low, or content is not university/alumni related..."
                    className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#F28C38]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => setRejectingPhoto(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-[#6B6B6B] hover:bg-[#F7F4EF] transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition"
                  >
                    {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
