'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/components/AuthProvider';
import {
  galleryService,
  GalleryPhoto,
  GalleryUploadPayload,
} from '@/lib/services/galleryService';
import {
  Image as ImageIcon,
  UploadCloud,
  Search,
  Filter,
  Calendar,
  User,
  X,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Eye,
  Clock,
  Sparkles,
} from 'lucide-react';

const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'reunion', label: 'Reunion' },
  { value: 'campus', label: 'Campus Life' },
  { value: 'convocation', label: 'Convocation' },
  { value: 'sports', label: 'Sports' },
  { value: 'cultural', label: 'Cultural' },
  { value: 'other', label: 'Other' },
];

export default function GalleryPage() {
  const { user } = useAuth();
  const isAlumni = user?.role === 'alumni';
  const isAdmin = user?.role === 'admin';
  const canUpload = isAlumni || isAdmin;

  // View state: 'explore' | 'mine'
  const [activeTab, setActiveTab] = useState<'explore' | 'mine'>('explore');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedBatch, setSelectedBatch] = useState('all');

  // Photo list state
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [myPhotos, setMyPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected photo modal (viewing derivative)
  const [selectedPhoto, setSelectedPhoto] = useState<GalleryPhoto | null>(null);

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadCategory, setUploadCategory] = useState('campus');
  const [uploadEventName, setUploadEventName] = useState('');
  const [uploadBatchYear, setUploadBatchYear] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Fetch approved photos
  const loadApprovedPhotos = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await galleryService.getApprovedPhotos({
        category: selectedCategory,
        batch_year: selectedBatch,
        search: searchQuery.trim() || undefined,
      });
      setPhotos(res.photos);
    } catch (err: any) {
      setError(err.message || 'Failed to load gallery photos.');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, selectedBatch, searchQuery]);

  // Fetch user's own submissions
  const loadMyPhotos = useCallback(async () => {
    if (!canUpload) return;
    try {
      setLoading(true);
      setError(null);
      const res = await galleryService.getMyPhotos();
      setMyPhotos(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load your submissions.');
    } finally {
      setLoading(false);
    }
  }, [canUpload]);

  useEffect(() => {
    if (activeTab === 'explore') {
      loadApprovedPhotos();
    } else {
      loadMyPhotos();
    }
  }, [activeTab, loadApprovedPhotos, loadMyPhotos]);

  // Handle file select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadError('Invalid image format. Supported formats: JPG, PNG, WebP.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setUploadError('File is too large. Maximum allowed size is 8MB.');
      return;
    }

    setUploadError(null);
    setUploadFile(file);
    const objectUrl = URL.createObjectURL(file);
    setUploadPreview(objectUrl);
  };

  // Submit upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError('Please select an image file to upload.');
      return;
    }

    setUploadLoading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const payload: GalleryUploadPayload = {
        title: uploadTitle.trim(),
        description: uploadDescription.trim() || undefined,
        category: uploadCategory,
        event_name: uploadEventName.trim() || undefined,
        batch_year: uploadBatchYear.trim() || undefined,
        file: uploadFile,
      };

      const result = await galleryService.uploadPhoto(payload);

      setUploadSuccess(
        result.status === 'approved'
          ? 'Photo published successfully!'
          : 'Photo submitted successfully! It will appear in the gallery once approved by an administrator.'
      );

      // Reset form
      setUploadTitle('');
      setUploadDescription('');
      setUploadEventName('');
      setUploadBatchYear('');
      setUploadFile(null);
      if (uploadPreview) URL.revokeObjectURL(uploadPreview);
      setUploadPreview(null);

      // Refresh data
      if (activeTab === 'mine') {
        loadMyPhotos();
      } else {
        loadApprovedPhotos();
      }

      setTimeout(() => {
        setIsUploadOpen(false);
        setUploadSuccess(null);
      }, 2000);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload photo.');
    } finally {
      setUploadLoading(false);
    }
  };

  // Delete photo
  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm('Are you sure you want to delete this photo? This action cannot be undone.')) {
      return;
    }

    try {
      await galleryService.deletePhoto(photoId);
      if (selectedPhoto?.id === photoId) {
        setSelectedPhoto(null);
      }
      if (activeTab === 'mine') {
        setMyPhotos((prev) => prev.filter((p) => p.id !== photoId));
      } else {
        setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete photo.');
    }
  };

  const displayedList = activeTab === 'explore' ? photos : myPhotos;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-[#222222] tracking-tight">
              Alumni Photo Gallery
            </h1>
            <p className="text-sm text-[#6B6B6B] mt-1">
              Explore memories, events, reunions, and campus moments shared by SOET alumni.
            </p>
          </div>

          {canUpload && (
            <button
              onClick={() => {
                setUploadError(null);
                setUploadSuccess(null);
                setIsUploadOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#F28C38] hover:bg-[#E07D2E] shadow-sm shadow-[#F28C38]/20 transition"
            >
              <UploadCloud className="w-4 h-4" />
              Upload Memory
            </button>
          )}
        </div>

        {/* Tab Switcher (if alumni or admin) */}
        {canUpload && (
          <div className="flex gap-2 border-b border-[#E0DCD7] pb-2">
            <button
              onClick={() => setActiveTab('explore')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'explore'
                  ? 'bg-[#F28C38] text-white shadow-sm'
                  : 'text-[#6B6B6B] hover:text-[#222222] hover:bg-[#F7F4EF]'
              }`}
            >
              Explore Gallery
            </button>
            <button
              onClick={() => setActiveTab('mine')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'mine'
                  ? 'bg-[#F28C38] text-white shadow-sm'
                  : 'text-[#6B6B6B] hover:text-[#222222] hover:bg-[#F7F4EF]'
              }`}
            >
              My Submissions
            </button>
          </div>
        )}

        {/* Filter & Search Bar (only in Explore tab) */}
        {activeTab === 'explore' && (
          <div className="bg-white p-4 rounded-2xl border border-[#E0DCD7] shadow-sm flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#888888] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search photos by title, event, or keyword..."
                className="w-full pl-10 pr-4 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#222222] placeholder-[#888888] focus:outline-none focus:ring-2 focus:ring-[#F28C38] focus:border-[#F28C38]"
              />
            </div>

            <div className="flex gap-2">
              <div className="relative">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#222222] font-semibold focus:outline-none focus:ring-2 focus:ring-[#F28C38]"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
                <Filter className="w-3.5 h-3.5 text-[#888888] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>
        )}

        {/* Error notice */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-red-700 text-xs font-medium">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Photos Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div
                key={n}
                className="aspect-[4/3] bg-[#EAE6E1] animate-pulse rounded-2xl border border-[#DDD7D2]"
              />
            ))}
          </div>
        ) : displayedList.length === 0 ? (
          <div className="bg-white rounded-3xl border border-[#E0DCD7] p-12 text-center">
            <div className="w-12 h-12 mx-auto mb-3 bg-[#F7F4EF] text-[#888888] rounded-2xl flex items-center justify-center">
              <ImageIcon className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-[#222222]">
              {activeTab === 'explore' ? 'No photos found' : 'No photos submitted yet'}
            </h3>
            <p className="text-xs text-[#6B6B6B] mt-1 max-w-sm mx-auto">
              {activeTab === 'explore'
                ? 'Try adjusting your search filters or check back later for new memories.'
                : 'Share campus memories, reunions, or convocation photos with the SOET alumni community.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {displayedList.map((photo) => {
              const isOwner = photo.user_id === user?.id;
              const imageUrl = galleryService.getImageUrl(photo.id);

              return (
                <div
                  key={photo.id}
                  onClick={() => setSelectedPhoto(photo)}
                  className="group bg-white rounded-2xl border border-[#E0DCD7] overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col"
                >
                  {/* Photo container with anti-copy style */}
                  <div className="relative aspect-[4/3] bg-[#F7F4EF] overflow-hidden select-none">
                    <img
                      src={imageUrl}
                      alt={photo.title}
                      loading="lazy"
                      onContextMenu={(e) => e.preventDefault()}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                    />

                    {/* Category tag */}
                    {photo.category && (
                      <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-black/60 text-white backdrop-blur-xs">
                        {photo.category}
                      </span>
                    )}

                    {/* Status badge in 'mine' tab */}
                    {activeTab === 'mine' && (
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
                    )}
                  </div>

                  {/* Card Info */}
                  <div className="p-3.5 flex flex-col flex-1 justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-[#222222] line-clamp-1 group-hover:text-[#F28C38] transition">
                        {photo.title}
                      </h3>
                      {photo.event_name && (
                        <p className="text-[11px] text-[#6B6B6B] line-clamp-1 mt-0.5">
                          {photo.event_name}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 mt-2 border-t border-[#F0EBE6] text-[11px] text-[#888888]">
                      <span>{photo.user_name || 'Alumnus'}</span>
                      {photo.batch_year && <span>Class of {photo.batch_year}</span>}
                    </div>

                    {photo.status === 'rejected' && photo.rejection_reason && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-xl text-[10px] text-red-700">
                        Reason: {photo.rejection_reason}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* LIGHTBOX VIEW MODAL */}
        {selectedPhoto && (
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setSelectedPhoto(null)}
          >
            <div
              className="bg-white rounded-3xl max-w-4xl w-full overflow-hidden shadow-2xl border border-white/20 animate-fadeIn"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Top Bar */}
              <div className="px-6 py-4 flex items-center justify-between border-b border-[#E0DCD7]">
                <div>
                  <h3 className="text-base font-bold text-[#222222]">
                    {selectedPhoto.title}
                  </h3>
                  {selectedPhoto.event_name && (
                    <p className="text-xs text-[#6B6B6B]">{selectedPhoto.event_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {(selectedPhoto.user_id === user?.id || isAdmin) && (
                    <button
                      onClick={() => handleDeletePhoto(selectedPhoto.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition"
                      title="Delete photo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedPhoto(null)}
                    className="p-2 text-[#6B6B6B] hover:bg-[#F7F4EF] rounded-xl transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Watermarked Derivative Display with Right-Click Deterrent */}
              <div className="relative bg-[#111111] max-h-[65vh] flex items-center justify-center overflow-hidden select-none">
                <img
                  src={galleryService.getImageUrl(selectedPhoto.id)}
                  alt={selectedPhoto.title}
                  onContextMenu={(e) => e.preventDefault()}
                  className="max-h-[65vh] w-auto max-w-full object-contain pointer-events-none select-none"
                />
              </div>

              {/* Modal Metadata Footer */}
              <div className="p-6 bg-[#FBFAF8] border-t border-[#E0DCD7] flex flex-col sm:flex-row justify-between gap-4">
                <div className="space-y-1">
                  {selectedPhoto.description && (
                    <p className="text-xs text-[#4A3832] max-w-xl">
                      {selectedPhoto.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[#888888] pt-1">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      Shared by {selectedPhoto.user_name || 'Alumnus'}
                    </span>
                    {selectedPhoto.batch_year && (
                      <span>• Batch {selectedPhoto.batch_year}</span>
                    )}
                    {selectedPhoto.created_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(selectedPhoto.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#EAE6E1] text-[#4A3832] capitalize">
                    {selectedPhoto.category || 'Memory'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* UPLOAD MEMORY MODAL */}
        {isUploadOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => !uploadLoading && setIsUploadOpen(false)}
          >
            <div
              className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-[#E0DCD7] animate-fadeIn"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 flex items-center justify-between border-b border-[#E0DCD7]">
                <div className="flex items-center gap-2">
                  <UploadCloud className="w-5 h-5 text-[#F28C38]" />
                  <h3 className="text-base font-bold text-[#222222]">
                    Share a Campus Memory
                  </h3>
                </div>
                <button
                  disabled={uploadLoading}
                  onClick={() => setIsUploadOpen(false)}
                  className="p-1.5 text-[#6B6B6B] hover:bg-[#F7F4EF] rounded-xl transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleUploadSubmit} className="p-6 space-y-4">
                {uploadError && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-start gap-2 text-red-700 text-xs font-medium">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <span>{uploadError}</span>
                  </div>
                )}

                {uploadSuccess && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-start gap-2 text-emerald-700 text-xs font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{uploadSuccess}</span>
                  </div>
                )}

                {/* File input */}
                <div>
                  <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-2">
                    Photo File (Max 8MB)
                  </label>
                  <div className="border-2 border-dashed border-[#DDD7D2] hover:border-[#F28C38] rounded-2xl p-4 text-center cursor-pointer transition">
                    <input
                      type="file"
                      id="photo-upload"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <label htmlFor="photo-upload" className="cursor-pointer block">
                      {uploadPreview ? (
                        <div className="relative aspect-[16/9] max-h-40 mx-auto rounded-xl overflow-hidden bg-black/5">
                          <img
                            src={uploadPreview}
                            alt="Preview"
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="py-4">
                          <ImageIcon className="w-8 h-8 text-[#888888] mx-auto mb-2" />
                          <p className="text-xs font-bold text-[#222222]">
                            Click to select an image
                          </p>
                          <p className="text-[11px] text-[#888888] mt-0.5">
                            JPG, PNG, or WebP up to 8MB
                          </p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-1.5">
                    Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="e.g. Annual Alumni Meet 2024"
                    className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#F28C38]"
                  />
                </div>

                {/* Category & Batch Year */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-1.5">
                      Category *
                    </label>
                    <select
                      value={uploadCategory}
                      onChange={(e) => setUploadCategory(e.target.value)}
                      className="w-full px-3 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#222222] font-semibold focus:outline-none focus:ring-2 focus:ring-[#F28C38]"
                    >
                      <option value="reunion">Reunion</option>
                      <option value="campus">Campus Life</option>
                      <option value="convocation">Convocation</option>
                      <option value="sports">Sports</option>
                      <option value="cultural">Cultural</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-1.5">
                      Batch Year
                    </label>
                    <input
                      type="text"
                      value={uploadBatchYear}
                      onChange={(e) => setUploadBatchYear(e.target.value)}
                      placeholder="e.g. 2022"
                      className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#F28C38]"
                    />
                  </div>
                </div>

                {/* Event Name */}
                <div>
                  <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-1.5">
                    Associated Event (Optional)
                  </label>
                  <input
                    type="text"
                    value={uploadEventName}
                    onChange={(e) => setUploadEventName(e.target.value)}
                    placeholder="e.g. TechFest 2023 or Grand Reunion"
                    className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#F28C38]"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-1.5">
                    Caption / Memory Note
                  </label>
                  <textarea
                    rows={2}
                    value={uploadDescription}
                    onChange={(e) => setUploadDescription(e.target.value)}
                    placeholder="Add context or fond memories about this moment..."
                    className="w-full px-3.5 py-2 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#F28C38]"
                  />
                </div>

                <p className="text-[11px] text-[#888888]">
                  {isAlumni
                    ? 'Submissions are moderated by administrators before public display. Watermarks are automatically applied to preserve derivative integrity.'
                    : 'Admin uploads are published directly to the public gallery.'}
                </p>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={uploadLoading}
                    onClick={() => setIsUploadOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-[#6B6B6B] hover:bg-[#F7F4EF] transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploadLoading || !uploadFile || !uploadTitle.trim()}
                    className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#F28C38] hover:bg-[#E07D2E] shadow-sm shadow-[#F28C38]/20 transition disabled:opacity-50"
                  >
                    {uploadLoading ? 'Uploading...' : 'Submit Photo'}
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
