'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Settings, Shield, Bell, CheckCircle2, Save, Database, Sliders } from 'lucide-react';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState({
    requireAlumniApproval: true,
    requireStudentApproval: false,
    notifyOnNewRegistration: true,
    notifyOnNewJobPosting: true,
    notifyOnEventCreation: true,
    autoExpireJobsDays: '60',
    maintenanceMode: false,
  });

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleToggle = (key: keyof typeof settings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: typeof prev[key] === 'boolean' ? !prev[key] : prev[key],
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);

    // Save preferences in localStorage
    try {
      localStorage.setItem('soet_admin_settings', JSON.stringify(settings));
      setTimeout(() => {
        setSaving(false);
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      }, 500);
    } catch {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-[#6B6B6B] mb-6 uppercase tracking-wider">
        <span>Administration</span>
        <span className="mx-2 text-[#DDD7D2]">/</span>
        <span className="text-[#F28C38]">Settings & Configurations</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-[#4A3832] tracking-tight">System Settings</h1>
          <p className="text-xs text-[#6B6B6B] mt-1">
            Configure moderation policies, automated verification workflows, and system notifications.
          </p>
        </div>
      </div>

      {savedSuccess && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-800 text-xs font-bold animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>System configuration saved successfully.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="max-w-3xl space-y-6">
        {/* Verification & Moderation Policies */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#DDD7D2] shadow-sm">
          <div className="flex items-center gap-3 pb-5 mb-5 border-b border-[#DDD7D2]">
            <div className="w-10 h-10 rounded-2xl bg-[#F28C38]/10 text-[#F28C38] flex items-center justify-center font-bold">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#4A3832]">Account Verification Policies</h2>
              <p className="text-xs text-[#6B6B6B]">Control how new members gain portal privileges</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-start gap-3.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.requireAlumniApproval}
                onChange={() => handleToggle('requireAlumniApproval')}
                className="mt-1 h-4 w-4 rounded border-[#DDD7D2] text-[#F28C38] focus:ring-[#F28C38]"
              />
              <div>
                <span className="text-xs font-bold text-[#4A3832] block">Require Admin Verification for Alumni</span>
                <span className="text-xs text-[#6B6B6B] block mt-0.5">
                  When enabled, registered alumni remain pending until approved in the Verification Queue.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3.5 cursor-pointer pt-3 border-t border-[#DDD7D2]/60">
              <input
                type="checkbox"
                checked={settings.requireStudentApproval}
                onChange={() => handleToggle('requireStudentApproval')}
                className="mt-1 h-4 w-4 rounded border-[#DDD7D2] text-[#F28C38] focus:ring-[#F28C38]"
              />
              <div>
                <span className="text-xs font-bold text-[#4A3832] block">Require Approval for Student Registrations</span>
                <span className="text-xs text-[#6B6B6B] block mt-0.5">
                  If enabled, students cannot access jobs or events until verified against university records.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Automated System Notifications */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#DDD7D2] shadow-sm">
          <div className="flex items-center gap-3 pb-5 mb-5 border-b border-[#DDD7D2]">
            <div className="w-10 h-10 rounded-2xl bg-[#4A3832]/10 text-[#4A3832] flex items-center justify-center font-bold">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#4A3832]">Admin Alert Triggers</h2>
              <p className="text-xs text-[#6B6B6B]">Select which activities trigger administrative notices</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-start gap-3.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notifyOnNewRegistration}
                onChange={() => handleToggle('notifyOnNewRegistration')}
                className="mt-1 h-4 w-4 rounded border-[#DDD7D2] text-[#F28C38] focus:ring-[#F28C38]"
              />
              <div>
                <span className="text-xs font-bold text-[#4A3832] block">New Alumni Registration</span>
                <span className="text-xs text-[#6B6B6B] block mt-0.5">
                  Receive an alert whenever a new graduate registers and awaits verification.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3.5 cursor-pointer pt-3 border-t border-[#DDD7D2]/60">
              <input
                type="checkbox"
                checked={settings.notifyOnNewJobPosting}
                onChange={() => handleToggle('notifyOnNewJobPosting')}
                className="mt-1 h-4 w-4 rounded border-[#DDD7D2] text-[#F28C38] focus:ring-[#F28C38]"
              />
              <div>
                <span className="text-xs font-bold text-[#4A3832] block">New Job / Internship Submission</span>
                <span className="text-xs text-[#6B6B6B] block mt-0.5">
                  Receive an alert when an alumni member submits a job posting for moderation.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3.5 cursor-pointer pt-3 border-t border-[#DDD7D2]/60">
              <input
                type="checkbox"
                checked={settings.notifyOnEventCreation}
                onChange={() => handleToggle('notifyOnEventCreation')}
                className="mt-1 h-4 w-4 rounded border-[#DDD7D2] text-[#F28C38] focus:ring-[#F28C38]"
              />
              <div>
                <span className="text-xs font-bold text-[#4A3832] block">New Campus Event Proposals</span>
                <span className="text-xs text-[#6B6B6B] block mt-0.5">
                  Trigger moderation review when an event is proposed.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Content Expiration & Maintenance */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#DDD7D2] shadow-sm">
          <div className="flex items-center gap-3 pb-5 mb-5 border-b border-[#DDD7D2]">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#4A3832]">Content Lifecycle & Maintenance</h2>
              <p className="text-xs text-[#6B6B6B]">Configure job expiry windows and system state</p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-2">
                Automatic Job Archive Window
              </label>
              <select
                value={settings.autoExpireJobsDays}
                onChange={(e) => setSettings({ ...settings, autoExpireJobsDays: e.target.value })}
                className="w-full sm:w-64 px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs font-semibold text-[#4A3832] focus:ring-2 focus:ring-[#F28C38] outline-none"
              >
                <option value="30">30 days after posting</option>
                <option value="60">60 days after posting</option>
                <option value="90">90 days after posting</option>
                <option value="never">Do not auto-expire</option>
              </select>
            </div>

            <div className="pt-4 border-t border-[#DDD7D2]/60">
              <label className="flex items-start gap-3.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.maintenanceMode}
                  onChange={() => handleToggle('maintenanceMode')}
                  className="mt-1 h-4 w-4 rounded border-[#DDD7D2] text-[#F28C38] focus:ring-[#F28C38]"
                />
                <div>
                  <span className="text-xs font-bold text-red-600 block">System Maintenance Mode</span>
                  <span className="text-xs text-[#6B6B6B] block mt-0.5">
                    If active, non-admin visitors will see a scheduled maintenance notice.
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-7 py-3 bg-[#F28C38] hover:bg-[#E07D2E] text-white rounded-xl text-xs font-bold shadow-lg shadow-[#F28C38]/25 transition cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving Preferences...' : 'Save Configuration'}</span>
          </button>
        </div>
      </form>
    </DashboardLayout>
  );
}
