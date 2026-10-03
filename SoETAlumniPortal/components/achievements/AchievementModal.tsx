'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Achievement,
  AchievementCategory,
  ACHIEVEMENT_CATEGORY_LABELS,
  CreateAchievementInput,
} from '@/lib/services/achievementService';
import {
  X,
  Award,
  Calendar,
  Building2,
  ExternalLink,
  AlertCircle,
  FileCheck2,
  Trash2,
  Info,
  ShieldAlert,
} from 'lucide-react';

export type AchievementModalMode = 'add' | 'edit' | 'view' | 'delete';

interface AchievementModalProps {
  isOpen: boolean;
  mode: AchievementModalMode;
  achievement?: Achievement | null;
  onClose: () => void;
  onSubmitAttempt?: (data: CreateAchievementInput) => void;
  onDeleteAttempt?: (id: string) => void;
}

interface FormErrors {
  title?: string;
  category?: string;
  achievement_date?: string;
  issuing_organization?: string;
  description?: string;
  credential_url?: string;
  image_url?: string;
}

const CATEGORIES: AchievementCategory[] = [
  'award',
  'certification',
  'honor',
  'project',
  'publication',
  'patent',
  'other',
];

function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function AchievementModal({
  isOpen,
  mode,
  achievement,
  onClose,
  onSubmitAttempt,
  onDeleteAttempt,
}: AchievementModalProps) {
  // Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<AchievementCategory>('award');
  const [achievementDate, setAchievementDate] = useState('');
  const [issuingOrg, setIssuingOrg] = useState('');
  const [credentialName, setCredentialName] = useState('');
  const [credentialUrl, setCredentialUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  // Feedback banner state for honest API unavailability notice
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  // Populate form on mode / achievement change
  useEffect(() => {
    if (achievement && (mode === 'edit' || mode === 'view' || mode === 'delete')) {
      setTitle(achievement.title || '');
      setCategory(achievement.category || 'award');
      setAchievementDate(achievement.achievement_date || '');
      setIssuingOrg(achievement.issuing_organization || '');
      setCredentialName(achievement.credential_name || '');
      setCredentialUrl(achievement.credential_url || '');
      setImageUrl(achievement.image_url || '');
      setDescription(achievement.description || '');
    } else {
      setTitle('');
      setCategory('award');
      setAchievementDate('');
      setIssuingOrg('');
      setCredentialName('');
      setCredentialUrl('');
      setImageUrl('');
      setDescription('');
    }
    setErrors({});
    setNoticeMessage(null);
  }, [achievement, mode, isOpen]);

  // Keyboard accessibility: Escape key listener
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!title.trim()) {
      newErrors.title = 'Achievement title is required.';
    } else if (title.trim().length > 120) {
      newErrors.title = 'Title must not exceed 120 characters.';
    }

    if (!category) {
      newErrors.category = 'Please select a category.';
    }

    if (!issuingOrg.trim()) {
      newErrors.issuing_organization = 'Issuing organization or institution is required.';
    } else if (issuingOrg.trim().length > 120) {
      newErrors.issuing_organization = 'Organization must not exceed 120 characters.';
    }

    if (!achievementDate.trim()) {
      newErrors.achievement_date = 'Date or year of achievement is required.';
    }

    if (!description.trim()) {
      newErrors.description = 'Description is required.';
    } else if (description.trim().length > 600) {
      newErrors.description = 'Description must not exceed 600 characters.';
    }

    if (credentialUrl.trim() && !isValidUrl(credentialUrl.trim())) {
      newErrors.credential_url = 'Credential URL must be a valid HTTP or HTTPS address.';
    }

    if (imageUrl.trim() && !isValidUrl(imageUrl.trim())) {
      newErrors.image_url = 'Document/image URL must be a valid HTTP or HTTPS address.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const payload: CreateAchievementInput = {
      title: title.trim(),
      category,
      achievement_date: achievementDate.trim(),
      issuing_organization: issuingOrg.trim(),
      credential_name: credentialName.trim() || undefined,
      credential_url: credentialUrl.trim() || undefined,
      image_url: imageUrl.trim() || undefined,
      description: description.trim(),
    };

    if (onSubmitAttempt) {
      onSubmitAttempt(payload);
    }

    // Explicitly communicate that persistence is unavailable
    setNoticeMessage(
      'Achievement saving is currently unavailable because the backend achievement API has not been implemented yet.'
    );
  };

  const handleDeleteConfirm = () => {
    if (achievement && onDeleteAttempt) {
      onDeleteAttempt(achievement.id);
    }

    // Explicitly communicate that deletion is unavailable
    setNoticeMessage(
      'Achievement deletion is currently unavailable because the backend achievement API has not been implemented yet.'
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl relative border border-slate-100 max-h-[90vh] overflow-y-auto my-8">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-6 right-6 text-slate-400 hover:text-slate-700 p-1 rounded-xl transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6 pr-8">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
              mode === 'delete'
                ? 'bg-red-100 text-red-700'
                : 'bg-blue-100 text-blue-700'
            }`}
          >
            {mode === 'delete' ? (
              <Trash2 className="w-5 h-5" />
            ) : (
              <Award className="w-5 h-5" />
            )}
          </div>
          <div>
            <h2 id="modal-title" className="text-xl font-bold text-slate-900 leading-tight">
              {mode === 'add' && 'Add New Achievement'}
              {mode === 'edit' && 'Edit Achievement'}
              {mode === 'view' && 'Achievement Details'}
              {mode === 'delete' && 'Delete Achievement'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {mode === 'add' && 'Record a professional recognition, award, or certification.'}
              {mode === 'edit' && 'Update your achievement entry.'}
              {mode === 'view' && 'Review complete recognition details.'}
              {mode === 'delete' && 'Confirm deletion of this recognition record.'}
            </p>
          </div>
        </div>

        {/* Honest API Availability Alert */}
        {noticeMessage && (
          <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl mb-6 text-xs flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-950 mb-0.5">Backend Persistence Notice</p>
              <p className="text-amber-800 leading-relaxed">{noticeMessage}</p>
            </div>
          </div>
        )}

        {/* ============================================================
            MODE: DELETE CONFIRMATION
            ============================================================ */}
        {mode === 'delete' ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-700 leading-relaxed">
              Are you sure you want to delete{' '}
              <strong className="text-slate-900 font-bold">
                "{achievement?.title}"
              </strong>
              ? This action cannot be undone.
            </p>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600">
              <span className="font-bold block text-slate-800 mb-1">
                {achievement?.issuing_organization}
              </span>
              <span>{achievement?.achievement_date}</span>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        ) : mode === 'view' ? (
          /* ============================================================
              MODE: VIEW DETAILS
              ============================================================ */
          <div className="space-y-5 text-xs text-slate-700">
            {/* Category & Title */}
            <div>
              <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 mb-2">
                {achievement
                  ? ACHIEVEMENT_CATEGORY_LABELS[achievement.category]
                  : category}
              </span>
              <h3 className="text-lg font-bold text-slate-900 leading-snug">
                {achievement?.title}
              </h3>
            </div>

            {/* Issuer & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block">
                  Issuing Organization
                </span>
                <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                  {achievement?.issuing_organization}
                </span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block">
                  Date / Year
                </span>
                <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                  {achievement?.achievement_date}
                </span>
              </div>
            </div>

            {/* Description */}
            <div>
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Description
              </h4>
              <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100 whitespace-pre-line">
                {achievement?.description}
              </p>
            </div>

            {/* Credential Name / URL */}
            {(achievement?.credential_name || achievement?.credential_url) && (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                {achievement.credential_name && (
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block">
                      Credential Name / ID
                    </span>
                    <span className="font-bold text-slate-800 text-xs">
                      {achievement.credential_name}
                    </span>
                  </div>
                )}
                {achievement.credential_url && (
                  <div className="pt-2">
                    <a
                      href={achievement.credential_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition shadow-sm"
                    >
                      <span>Open External Credential</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          /* ============================================================
              MODE: ADD / EDIT FORM
              ============================================================ */
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Title */}
            <div>
              <label
                htmlFor="ach-title"
                className="block font-bold text-slate-700 mb-1"
              >
                Achievement Title <span className="text-red-500">*</span>
              </label>
              <input
                id="ach-title"
                type="text"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Winner - National Hackathon 2025"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.title && (
                <p className="text-red-600 text-[11px] mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {errors.title}
                </p>
              )}
            </div>

            {/* Category & Date/Year Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="ach-category"
                  className="block font-bold text-slate-700 mb-1"
                >
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  id="ach-category"
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as AchievementCategory)
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {ACHIEVEMENT_CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
                {errors.category && (
                  <p className="text-red-600 text-[11px] mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {errors.category}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="ach-date"
                  className="block font-bold text-slate-700 mb-1"
                >
                  Date / Year <span className="text-red-500">*</span>
                </label>
                <input
                  id="ach-date"
                  type="text"
                  value={achievementDate}
                  onChange={(e) => setAchievementDate(e.target.value)}
                  placeholder="e.g. 2024 or Nov 2024"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.achievement_date && (
                  <p className="text-red-600 text-[11px] mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {errors.achievement_date}
                  </p>
                )}
              </div>
            </div>

            {/* Issuing Organization */}
            <div>
              <label
                htmlFor="ach-org"
                className="block font-bold text-slate-700 mb-1"
              >
                Issuing Organization / Entity <span className="text-red-500">*</span>
              </label>
              <input
                id="ach-org"
                type="text"
                value={issuingOrg}
                maxLength={120}
                onChange={(e) => setIssuingOrg(e.target.value)}
                placeholder="e.g. IEEE, AWS, University of Pune, Google"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.issuing_organization && (
                <p className="text-red-600 text-[11px] mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {errors.issuing_organization}
                </p>
              )}
            </div>

            {/* Credential Name / ID (Optional) */}
            <div>
              <label
                htmlFor="ach-cred-name"
                className="block font-bold text-slate-700 mb-1"
              >
                Credential / License Name <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                id="ach-cred-name"
                type="text"
                value={credentialName}
                maxLength={120}
                onChange={(e) => setCredentialName(e.target.value)}
                placeholder="e.g. Certificate ID #AWS-59281"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Credential URL (Optional) */}
            <div>
              <label
                htmlFor="ach-cred-url"
                className="block font-bold text-slate-700 mb-1"
              >
                Credential Verification URL <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                id="ach-cred-url"
                type="url"
                value={credentialUrl}
                onChange={(e) => setCredentialUrl(e.target.value)}
                placeholder="https://credly.com/your-badge-url"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.credential_url && (
                <p className="text-red-600 text-[11px] mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {errors.credential_url}
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="ach-desc"
                className="block font-bold text-slate-700 mb-1"
              >
                Description & Summary <span className="text-red-500">*</span>
              </label>
              <textarea
                id="ach-desc"
                rows={3}
                value={description}
                maxLength={600}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Briefly describe the significance, competition scope, or milestone..."
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex justify-between items-center mt-1">
                {errors.description ? (
                  <p className="text-red-600 text-[11px] flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {errors.description}
                  </p>
                ) : (
                  <span />
                )}
                <span className="text-[10px] text-slate-400">
                  {description.length} / 600
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 transition cursor-pointer"
              >
                {mode === 'add' ? 'Save Achievement' : 'Update Achievement'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
