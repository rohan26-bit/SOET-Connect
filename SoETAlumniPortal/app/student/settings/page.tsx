'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import ReportIssueForm from '@/components/ReportIssueForm';
import NotificationPreferencesCard from '@/components/NotificationPreferencesCard';
import { Shield } from 'lucide-react';

export default function SettingsPage() {
  const [publicProfile, setPublicProfile] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('soet_user_public_profile');
      if (stored !== null) {
        setPublicProfile(stored === 'true');
      }
    } catch {
      // Use defaults if parse fails
    }
  }, []);

  const handleTogglePrivacy = () => {
    const nextVal = !publicProfile;
    setPublicProfile(nextVal);
    try {
      localStorage.setItem('soet_user_public_profile', String(nextVal));
    } catch {
      // ignore
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
        <NotificationPreferencesCard />

        {/* Privacy & Profile Visibility */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#DDD7D2] shadow-sm">
          <div className="flex items-center gap-3 pb-5 mb-5 border-b border-[#DDD7D2]">
            <div className="w-10 h-10 rounded-2xl bg-[#4A3832]/10 text-[#4A3832] flex items-center justify-center font-bold">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#4A3832]">Privacy & Visibility</h2>
              <p className="text-xs text-[#6B6B6B]">Control how your academic profile is displayed to others</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-start gap-3.5 cursor-pointer">
              <input
                type="checkbox"
                checked={publicProfile}
                onChange={handleTogglePrivacy}
                className="mt-1 h-4 w-4 rounded border-[#DDD7D2] text-[#F28C38] focus:ring-[#F28C38]"
              />
              <div>
                <span className="text-xs font-bold text-[#4A3832] block">Show Profile in Directory</span>
                <span className="text-xs text-[#6B6B6B] block mt-0.5">
                  Allow alumni, students, and faculty mentors to find and view your profile in directory searches.
                </span>
              </div>
            </label>
          </div>
        </div>

        <div className="pt-8 border-t border-[#DDD7D2]">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-[#4A3832]">Support & Report an Issue</h2>
            <p className="text-xs text-[#6B6B6B] mt-0.5">Found a bug or having trouble? Let the technical team know.</p>
          </div>
          <ReportIssueForm initialRoute="/student/settings" />
        </div>
      </div>
    </DashboardLayout>
  );
}
