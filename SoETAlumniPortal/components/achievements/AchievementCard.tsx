'use client';

import React from 'react';
import {
  Achievement,
  ACHIEVEMENT_CATEGORY_LABELS,
  AchievementCategory,
} from '@/lib/services/achievementService';
import {
  Award,
  Building2,
  Calendar,
  ExternalLink,
  Eye,
  Edit2,
  Trash2,
  FileCheck2,
} from 'lucide-react';

interface AchievementCardProps {
  achievement: Achievement;
  onView?: (achievement: Achievement) => void;
  onEdit?: (achievement: Achievement) => void;
  onDelete?: (achievement: Achievement) => void;
  isReadOnly?: boolean;
}

const CATEGORY_STYLES: Record<
  AchievementCategory,
  { bg: string; text: string; border: string }
> = {
  award: {
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
  },
  certification: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
  },
  honor: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-800',
    border: 'border-indigo-200',
  },
  project: {
    bg: 'bg-blue-50',
    text: 'text-blue-800',
    border: 'border-blue-200',
  },
  publication: {
    bg: 'bg-purple-50',
    text: 'text-purple-800',
    border: 'border-purple-200',
  },
  patent: {
    bg: 'bg-teal-50',
    text: 'text-teal-800',
    border: 'border-teal-200',
  },
  other: {
    bg: 'bg-slate-50',
    text: 'text-slate-700',
    border: 'border-slate-200',
  },
};

export default function AchievementCard({
  achievement,
  onView,
  onEdit,
  onDelete,
  isReadOnly = false,
}: AchievementCardProps) {
  const categoryStyle =
    CATEGORY_STYLES[achievement.category] || CATEGORY_STYLES.other;
  const categoryLabel =
    ACHIEVEMENT_CATEGORY_LABELS[achievement.category] || 'Achievement';

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all flex flex-col justify-between gap-5">
      <div>
        {/* Top Header: Category badge & Actions */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${categoryStyle.bg} ${categoryStyle.text} ${categoryStyle.border}`}
          >
            <Award className="w-3.5 h-3.5" />
            {categoryLabel}
          </span>

          {!isReadOnly && (
            <div className="flex items-center gap-1">
              {onView && (
                <button
                  type="button"
                  onClick={() => onView(achievement)}
                  title="View details"
                  aria-label="View achievement details"
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(achievement)}
                  title="Edit achievement"
                  aria-label="Edit achievement"
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(achievement)}
                  title="Delete achievement"
                  aria-label="Delete achievement"
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-slate-900 leading-snug mb-1">
          {achievement.title}
        </h3>

        {/* Issuing Organization & Date */}
        <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-slate-500 mb-3">
          <span className="inline-flex items-center gap-1 font-medium text-slate-700">
            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            {achievement.issuing_organization}
          </span>
          <span className="text-slate-300">•</span>
          <span className="inline-flex items-center gap-1 font-medium text-slate-500">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            {achievement.achievement_date}
          </span>
        </div>

        {/* Description */}
        <p className="text-xs text-slate-600 leading-relaxed line-clamp-3 mb-3">
          {achievement.description}
        </p>

        {/* Credential Name if present */}
        {achievement.credential_name && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-100 rounded-lg text-xs text-slate-600 mb-2">
            <FileCheck2 className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium truncate max-w-[220px]">
              {achievement.credential_name}
            </span>
          </div>
        )}
      </div>

      {/* Footer / Links */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
        {achievement.credential_url ? (
          <a
            href={achievement.credential_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
          >
            <span>Verify Credential</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
          <span className="text-[11px] text-slate-400 italic">
            Self-reported credential
          </span>
        )}

        {isReadOnly && onView && (
          <button
            type="button"
            onClick={() => onView(achievement)}
            className="px-3 py-1 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
          >
            View Details
          </button>
        )}
      </div>
    </div>
  );
}
