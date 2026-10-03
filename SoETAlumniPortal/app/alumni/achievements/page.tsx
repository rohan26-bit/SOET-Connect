'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import {
  Achievement,
  AchievementCategory,
  achievementService,
  AchievementApiUnavailableError,
  ACHIEVEMENT_CATEGORY_LABELS,
  CreateAchievementInput,
} from '@/lib/services/achievementService';
import AchievementCard from '@/components/achievements/AchievementCard';
import AchievementModal, {
  AchievementModalMode,
} from '@/components/achievements/AchievementModal';
import {
  Award,
  Plus,
  RefreshCw,
  Info,
  AlertCircle,
  Filter,
  Search,
} from 'lucide-react';

const CATEGORY_TABS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All Achievements' },
  { id: 'award', label: 'Awards' },
  { id: 'certification', label: 'Certifications' },
  { id: 'honor', label: 'Honors' },
  { id: 'project', label: 'Projects' },
  { id: 'publication', label: 'Publications' },
  { id: 'patent', label: 'Patents' },
];

export default function AlumniAchievementsPage() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const [unexpectedError, setUnexpectedError] = useState<string | null>(null);

  // Filter & Search State
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<AchievementModalMode>('add');
  const [selectedAchievement, setSelectedAchievement] =
    useState<Achievement | null>(null);

  // Fetch Achievements
  const loadAchievements = useCallback(async () => {
    setLoading(true);
    setUnexpectedError(null);
    setApiUnavailable(false);

    try {
      const data = await achievementService.getMyAchievements();
      setAchievements(data);
    } catch (err: unknown) {
      if (err instanceof AchievementApiUnavailableError) {
        // Backend API is not implemented yet; mark as unavailable cleanly
        setApiUnavailable(true);
        setAchievements([]);
      } else {
        const message =
          err instanceof Error
            ? err.message
            : 'An unexpected error occurred while loading achievements.';
        setUnexpectedError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAchievements();
  }, [loadAchievements]);

  // Modal Action Triggers
  const handleOpenAdd = () => {
    setSelectedAchievement(null);
    setModalMode('add');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: Achievement) => {
    setSelectedAchievement(item);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleOpenView = (item: Achievement) => {
    setSelectedAchievement(item);
    setModalMode('view');
    setIsModalOpen(true);
  };

  const handleOpenDelete = (item: Achievement) => {
    setSelectedAchievement(item);
    setModalMode('delete');
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedAchievement(null);
  };

  // Submit attempts (handles backend unavailability honestly)
  const handleSubmitAttempt = async (_input: CreateAchievementInput) => {
    try {
      if (modalMode === 'edit' && selectedAchievement) {
        await achievementService.updateAchievement(selectedAchievement.id, _input);
      } else {
        await achievementService.createAchievement(_input);
      }
    } catch (err: unknown) {
      // The modal's internal notice displays the honest unavailability message.
      // We log cleanly here without pretending the record was persisted.
      console.warn('Achievement persistence attempt intercepted:', err);
    }
  };

  const handleDeleteAttempt = async (_id: string) => {
    try {
      await achievementService.deleteAchievement(_id);
    } catch (err: unknown) {
      console.warn('Achievement deletion attempt intercepted:', err);
    }
  };

  // Filtered achievements (ready for future real records)
  const filteredAchievements = achievements.filter((item) => {
    const matchesCategory =
      selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch =
      searchQuery.trim() === '' ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.issuing_organization
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <DashboardLayout>
      {/* SECTION 1: BREADCRUMBS */}
      <div className="flex items-center text-xs font-semibold text-slate-400 mb-6 uppercase tracking-wider">
        <span>Portal</span>
        <span className="mx-2 text-slate-300">/</span>
        <span>Alumni</span>
        <span className="mx-2 text-slate-300">/</span>
        <span className="text-blue-600">Achievements & Recognition</span>
      </div>

      {/* SECTION 2: PAGE HEADER */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center font-bold">
              <Award className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Achievements & Recognition
            </h1>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            Showcase verified honors, professional certifications, patents, publications,
            and distinguished milestones earned across your career.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={loadAchievements}
            disabled={loading}
            aria-label="Refresh achievements"
            className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl transition cursor-pointer disabled:opacity-50"
            title="Refresh achievements"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
            />
          </button>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Achievement</span>
          </button>
        </div>
      </div>

      {/* SECTION 3: BACKEND AVAILABILITY NOTICE */}
      {apiUnavailable && (
        <div className="mb-8 p-6 bg-blue-50/70 border border-blue-200 rounded-3xl text-xs text-blue-900 flex items-start gap-4 shadow-sm">
          <div className="w-9 h-9 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
            <Info className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-sm text-blue-950 mb-1">
              Backend Integration Notice
            </h3>
            <p className="text-blue-800 leading-relaxed mb-2">
              Achievement management is ready in the frontend, but persistence is currently
              unavailable because the backend achievement API has not yet been implemented.
            </p>
            <p className="text-[11px] text-blue-600 leading-relaxed">
              You can explore the interface and test the input validation in the modal above.
              Records will automatically persist once the corresponding FastAPI endpoints are
              connected.
            </p>
          </div>
        </div>
      )}

      {/* SECTION 4: UNEXPECTED ERROR BANNER */}
      {unexpectedError && (
        <div className="mb-8 p-6 bg-red-50 border border-red-200 rounded-3xl text-xs text-red-900 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-bold text-sm text-red-950 mb-1">
              Failed to Load Achievements
            </h3>
            <p className="text-red-700 mb-3">{unexpectedError}</p>
            <button
              type="button"
              onClick={loadAchievements}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        </div>
      )}

      {/* SECTION 5: FILTER BAR & SEARCH (Shown when not loading) */}
      {!loading && !unexpectedError && (
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm mb-8 space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search achievements by title, issuer, or keyword..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Category Filter Pills (Scrollable on mobile) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              <Filter className="w-3.5 h-3.5 text-slate-400 ml-1 mr-0.5 shrink-0 hidden sm:inline" />
              {CATEGORY_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedCategory(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                    selectedCategory === tab.id
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 6: CONTENT STATE */}
      {loading ? (
        /* LOADING SKELETON */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm animate-pulse space-y-4"
            >
              <div className="flex justify-between items-center">
                <div className="h-5 w-24 bg-slate-200 rounded-full" />
                <div className="h-5 w-12 bg-slate-100 rounded" />
              </div>
              <div className="h-5 w-3/4 bg-slate-200 rounded" />
              <div className="h-4 w-1/2 bg-slate-100 rounded" />
              <div className="space-y-2 pt-2">
                <div className="h-3 w-full bg-slate-100 rounded" />
                <div className="h-3 w-5/6 bg-slate-100 rounded" />
              </div>
              <div className="pt-4 border-t border-slate-100 flex justify-between">
                <div className="h-4 w-24 bg-slate-200 rounded" />
                <div className="h-4 w-16 bg-slate-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredAchievements.length === 0 ? (
        /* POLISHED EMPTY STATE */
        <div className="bg-white rounded-3xl p-12 sm:p-16 text-center border border-slate-200 shadow-sm max-w-2xl mx-auto my-6">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-amber-100">
            <Award className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">
            No achievements to display yet
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed mb-6">
            Your achievement records will appear here once achievement data is available.
            You can record milestones such as industry awards, technical certifications,
            patents, and distinguished honors.
          </p>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add First Achievement</span>
          </button>
        </div>
      ) : (
        /* REAL ACHIEVEMENT GRID (Ready for future records) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAchievements.map((item) => (
            <AchievementCard
              key={item.id}
              achievement={item}
              onView={handleOpenView}
              onEdit={handleOpenEdit}
              onDelete={handleOpenDelete}
            />
          ))}
        </div>
      )}

      {/* SECTION 7: REUSABLE MODAL (Add / Edit / View / Delete) */}
      <AchievementModal
        isOpen={isModalOpen}
        mode={modalMode}
        achievement={selectedAchievement}
        onClose={handleModalClose}
        onSubmitAttempt={handleSubmitAttempt}
        onDeleteAttempt={handleDeleteAttempt}
      />
    </DashboardLayout>
  );
}
