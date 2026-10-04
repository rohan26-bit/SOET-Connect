'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Bell, Shield, CheckCircle2, Save, Mail, Eye } from 'lucide-react';

interface UserSettings {
  jobAlerts: boolean;
  alumniMessages: boolean;
  eventReminders: boolean;
  publicProfile: boolean;
  emailDigest: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  jobAlerts: true,
  alumniMessages: true,
  eventReminders: true,
  publicProfile: true,
  emailDigest: false,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('soet_user_settings');
      if (stored) {
        setSettings(JSON.parse(stored));
      }
    } catch {
      // Use defaults if parse fails
    }
  }, []);

  const handleToggle = (key: keyof UserSettings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);

    try {
      localStorage.setItem('soet_user_settings', JSON.stringify(settings));
      setTimeout(() => {
        setSaving(false);
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      }, 400);
    } catch {
      setSaving(false);
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

      {savedSuccess && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-800 text-xs font-bold animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>Your preferences have been saved successfully!</span>
        </div>
      )}

      <form onSubmit={handleSave} className="max-w-3xl space-y-6">
        {/* Email & Notification Preferences */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#DDD7D2] shadow-sm">
          <div className="flex items-center gap-3 pb-5 mb-5 border-b border-[#DDD7D2]">
            <div className="w-10 h-10 rounded-2xl bg-[#F28C38]/10 text-[#F28C38] flex items-center justify-center font-bold">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#4A3832]">Notifications & Alerts</h2>
              <p className="text-xs text-[#6B6B6B]">Choose which portal updates send notifications to your inbox</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-start gap-3.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.jobAlerts}
                onChange={() => handleToggle('jobAlerts')}
                className="mt-1 h-4 w-4 rounded border-[#DDD7D2] text-[#F28C38] focus:ring-[#F28C38]"
              />
              <div>
                <span className="text-xs font-bold text-[#4A3832] block">Job & Internship Recommendations</span>
                <span className="text-xs text-[#6B6B6B] block mt-0.5">
                  Receive alerts when verified alumni post new job openings matching your branch or skills.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3.5 cursor-pointer pt-3 border-t border-[#DDD7D2]/60">
              <input
                type="checkbox"
                checked={settings.alumniMessages}
                onChange={() => handleToggle('alumniMessages')}
                className="mt-1 h-4 w-4 rounded border-[#DDD7D2] text-[#F28C38] focus:ring-[#F28C38]"
              />
              <div>
                <span className="text-xs font-bold text-[#4A3832] block">Direct Messages & Chat</span>
                <span className="text-xs text-[#6B6B6B] block mt-0.5">
                  Get notified whenever an alumnus or peer initiates a conversation with you.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3.5 cursor-pointer pt-3 border-t border-[#DDD7D2]/60">
              <input
                type="checkbox"
                checked={settings.eventReminders}
                onChange={() => handleToggle('eventReminders')}
                className="mt-1 h-4 w-4 rounded border-[#DDD7D2] text-[#F28C38] focus:ring-[#F28C38]"
              />
              <div>
                <span className="text-xs font-bold text-[#4A3832] block">Campus Events & Workshops</span>
                <span className="text-xs text-[#6B6B6B] block mt-0.5">
                  Receive reminders for university meetups, webinars, and annual reunions.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3.5 cursor-pointer pt-3 border-t border-[#DDD7D2]/60">
              <input
                type="checkbox"
                checked={settings.emailDigest}
                onChange={() => handleToggle('emailDigest')}
                className="mt-1 h-4 w-4 rounded border-[#DDD7D2] text-[#F28C38] focus:ring-[#F28C38]"
              />
              <div>
                <span className="text-xs font-bold text-[#4A3832] block">Weekly Digest Email</span>
                <span className="text-xs text-[#6B6B6B] block mt-0.5">
                  A weekly summary of trending discussions, top alumni achievements, and upcoming events.
                </span>
              </div>
            </label>
          </div>
        </div>

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
                checked={settings.publicProfile}
                onChange={() => handleToggle('publicProfile')}
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

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-7 py-3 bg-[#F28C38] hover:bg-[#E07D2E] text-white rounded-xl text-xs font-bold shadow-lg shadow-[#F28C38]/25 transition cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>
    </DashboardLayout>
  );
}
