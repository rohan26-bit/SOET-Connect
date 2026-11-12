'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import NotificationPreferencesCard from '@/components/NotificationPreferencesCard';
import PasswordSecurityCard from '@/components/PasswordSecurityCard';
import { useAuth } from '@/components/AuthProvider';
import { profileService } from '@/lib/services/profileService';
import { Shield } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const [publicProfile, setPublicProfile] = useState(true);
  const [loadingVisibility, setLoadingVisibility] = useState(true);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [visibilityNotice, setVisibilityNotice] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== 'alumni') {
      setLoadingVisibility(false);
      return;
    }

    let active = true;
    profileService.getMyProfile()
      .then((profile) => {
        if (active) setPublicProfile(profile.is_public_profile !== false);
      })
      .catch((error: unknown) => {
        if (active) {
          setVisibilityError(error instanceof Error ? error.message : 'Unable to load directory visibility.');
        }
      })
      .finally(() => {
        if (active) setLoadingVisibility(false);
      });

    return () => { active = false; };
  }, [user?.id, user?.role]);

  const handleTogglePrivacy = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.checked;
    setSavingVisibility(true);
    setVisibilityError(null);
    setVisibilityNotice(null);
    try {
      const updated = await profileService.updateProfileVisibility(nextValue);
      setPublicProfile(updated.is_public_profile !== false);
      setVisibilityNotice(nextValue
        ? 'Your alumni profile is visible in the directory.'
        : 'Your alumni profile is hidden from the directory.');
    } catch (error: unknown) {
      setVisibilityError(error instanceof Error ? error.message : 'Unable to update directory visibility.');
    } finally {
      setSavingVisibility(false);
    }
  };

  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-[#6B6B6B] mb-6 uppercase tracking-wider">
        <span>Portal</span>
        <span className="mx-2 text-[#DDD7D2]">/</span>
        <span className="text-[#F28C38]">Account Preferences</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-[#4A3832] tracking-tight">Account Settings</h1>
          <p className="text-xs text-[#6B6B6B] mt-1">
            Manage your notifications, communication preferences, and network privacy settings.
          </p>
        </div>
      </div>

      <div className="max-w-3xl space-y-8">
        <PasswordSecurityCard />
        <NotificationPreferencesCard />

        {user?.role === 'alumni' && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#DDD7D2] shadow-sm">
            <div className="flex items-center gap-3 pb-5 mb-5 border-b border-[#DDD7D2]">
              <div className="w-10 h-10 rounded-2xl bg-[#4A3832]/10 text-[#4A3832] flex items-center justify-center font-bold">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#4A3832]">Alumni Directory Privacy</h2>
                <p className="text-xs text-[#6B6B6B]">Control whether other portal users can find your profile in the alumni directory.</p>
              </div>
            </div>

            {visibilityError && (
              <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {visibilityError}
              </p>
            )}
            {visibilityNotice && (
              <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {visibilityNotice}
              </p>
            )}

            <label className="flex items-start gap-3.5 cursor-pointer">
              <input
                type="checkbox"
                checked={publicProfile}
                onChange={handleTogglePrivacy}
                disabled={loadingVisibility || savingVisibility}
                className="mt-1 h-4 w-4 rounded border-[#DDD7D2] text-[#F28C38] focus:ring-[#F28C38] disabled:opacity-50"
              />
              <div>
                <span className="text-xs font-bold text-[#4A3832] block">
                  {loadingVisibility ? 'Loading directory setting…' : 'Show my profile in the alumni directory'}
                </span>
                <span className="text-xs text-[#6B6B6B] block mt-0.5">
                  When disabled, your profile will no longer appear in student and alumni directory searches. You can turn it back on at any time.
                </span>
              </div>
            </label>
            {savingVisibility && <p className="mt-3 text-xs text-slate-500" role="status">Saving privacy setting…</p>}
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
