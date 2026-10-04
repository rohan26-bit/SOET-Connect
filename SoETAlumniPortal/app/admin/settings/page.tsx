'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/components/AuthProvider';
import { profileService } from '@/lib/services/profileService';
import { authService, UserProfile } from '@/lib/services/authService';
import { systemStatusService, SystemStatus } from '@/lib/services/systemStatusService';
import { ButtonSpinner } from '@/components/LoadingState';
import ReportIssueForm from '@/components/ReportIssueForm';
import {
  Shield,
  User,
  Lock,
  Bell,
  Sun,
  Moon,
  Monitor,
  Activity,
  CheckCircle2,
  AlertCircle,
  Camera,
  Save,
  Key,
  RefreshCw,
  Bug,
  Eye,
  EyeOff,
  Server,
  Database,
} from 'lucide-react';

interface NotificationPrefs {
  alumniVerification: boolean;
  studentVerification: boolean;
  jobApprovals: boolean;
  eventModeration: boolean;
  platformAlerts: boolean;
}

const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  alumniVerification: true,
  studentVerification: true,
  jobApprovals: true,
  eventModeration: true,
  platformAlerts: true,
};

function AdminProfileTab({
  user,
  refreshProfile,
}: {
  user: UserProfile | null;
  refreshProfile: () => Promise<void>;
}) {
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Handle Profile Update
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(false);

    const cleanName = fullName.trim();
    if (!cleanName) {
      setProfileError('Full name cannot be empty.');
      return;
    }

    setSavingProfile(true);
    try {
      await profileService.updateAdminProfile({ fullName: cleanName });
      await refreshProfile();
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3500);
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  // Handle Avatar Upload
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingAvatar(true);
    setProfileError(null);
    try {
      const url = await profileService.uploadAvatar(user.id, file);
      setAvatarUrl(url);
      await refreshProfile();
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3500);
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : 'Failed to upload photo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <div className="max-w-2xl bg-white rounded-3xl border border-[#DDD7D2] p-6 sm:p-8 shadow-sm">
      <div className="mb-6 pb-6 border-b border-[#DDD7D2]/60">
        <h2 className="text-base font-bold text-[#4A3832]">Administrator Profile</h2>
        <p className="text-xs text-[#6B6B6B] mt-1">
          Update your administrative profile details and display avatar.
        </p>
      </div>

      {profileSuccess && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Profile updated successfully.</span>
        </div>
      )}

      {profileError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{profileError}</span>
        </div>
      )}

      {/* Avatar Section */}
      <div className="flex items-center gap-6 mb-8">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-[#4A3832] text-white flex items-center justify-center font-bold text-2xl overflow-hidden border-2 border-[#DDD7D2] shadow-sm">
            {avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={avatarUrl} alt="Admin avatar" className="w-full h-full object-cover" />
            ) : (
              <span>{(fullName || 'Admin').charAt(0).toUpperCase()}</span>
            )}
          </div>
          <label
            htmlFor="avatar-upload"
            className="absolute -bottom-2 -right-2 p-2 bg-[#F28C38] hover:bg-[#E07D2E] text-white rounded-xl shadow-md cursor-pointer transition"
            title="Change photo"
          >
            <Camera className="w-3.5 h-3.5" />
            <input
              id="avatar-upload"
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              disabled={uploadingAvatar}
              className="hidden"
            />
          </label>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[#4A3832]">{fullName || 'Administrator'}</h3>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#4A3832] text-white uppercase tracking-wider">
              <Shield className="w-2.5 h-2.5 text-[#F28C38]" /> Administrator
            </span>
          </div>
          <p className="text-xs text-[#6B6B6B] mt-1">
            {uploadingAvatar ? 'Uploading photo...' : 'Click the camera button to upload a custom profile image.'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSaveProfile} className="space-y-5">
        <div>
          <label className="block text-xs font-bold text-[#4A3832] mb-1.5">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Enter administrator full name"
            className="w-full px-3.5 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#4A3832] font-medium outline-none focus:ring-2 focus:ring-[#F28C38] focus:bg-white transition"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="block text-xs font-bold text-[#4A3832]">
              Email Address
            </label>
            <span className="text-[11px] text-[#888888]">Managed by administrator provisioning</span>
          </div>
          <input
            type="email"
            disabled
            value={user?.email || ''}
            className="w-full px-3.5 py-2.5 bg-slate-100/80 border border-[#DDD7D2] rounded-xl text-xs text-[#6B6B6B] font-mono cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-[#4A3832] mb-1.5">
            System Role
          </label>
          <div className="px-3.5 py-2.5 bg-slate-100/80 border border-[#DDD7D2] rounded-xl text-xs text-[#4A3832] font-semibold flex items-center justify-between">
            <span>Administrator (Superuser / Full Access)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
        </div>

        <div className="pt-3 flex justify-end">
          <button
            type="submit"
            disabled={savingProfile}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-[#F28C38] hover:bg-[#E07D2E] focus:ring-2 focus:ring-[#F28C38] shadow-md shadow-[#F28C38]/20 transition disabled:opacity-50 cursor-pointer"
          >
            {savingProfile ? (
              <>
                <ButtonSpinner className="text-white" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Profile Changes</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminSettingsPage() {
  const { user, refreshProfile } = useAuth();

  // Tab navigation
  const [activeTab, setActiveTab] = useState<
    'profile' | 'appearance' | 'notifications' | 'security' | 'status' | 'bug_report'
  >('profile');

  // Appearance state with lazy localStorage initializer
  const [themePref, setThemePref] = useState<'light' | 'dark' | 'system'>(() => {
    if (typeof window === 'undefined') return 'light';
    try {
      const storedTheme = localStorage.getItem('soet_theme_preference');
      if (storedTheme === 'dark' || storedTheme === 'system' || storedTheme === 'light') {
        return storedTheme;
      }
    } catch {
      // Ignore storage errors
    }
    return 'light';
  });
  const [appearanceSaved, setAppearanceSaved] = useState(false);

  // Notifications state with lazy localStorage initializer
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(() => {
    if (typeof window === 'undefined') return DEFAULT_NOTIF_PREFS;
    try {
      const storedNotifs = localStorage.getItem('soet_admin_notification_preferences');
      if (storedNotifs) {
        return { ...DEFAULT_NOTIF_PREFS, ...JSON.parse(storedNotifs) };
      }
    } catch {
      // Ignore storage errors
    }
    return DEFAULT_NOTIF_PREFS;
  });
  const [notifSaved, setNotifSaved] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // System status state
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  // Load system status on mount
  useEffect(() => {
    let active = true;
    systemStatusService
      .getStatus()
      .then((status) => {
        if (active) setSystemStatus(status);
      })
      .catch(() => {
        if (active) {
          setSystemStatus({
            api: 'unavailable',
            database: 'disconnected',
            environment: 'unknown',
            checkedAt: new Date().toISOString(),
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Refresh system status handler
  const loadSystemStatus = async () => {
    setCheckingStatus(true);
    try {
      const status = await systemStatusService.getStatus();
      setSystemStatus(status);
    } catch {
      setSystemStatus({
        api: 'unavailable',
        database: 'disconnected',
        environment: 'unknown',
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setCheckingStatus(false);
    }
  };

  // Handle Appearance Save
  const handleSelectTheme = (theme: 'light' | 'dark' | 'system') => {
    setThemePref(theme);
    try {
      localStorage.setItem('soet_theme_preference', theme);
      setAppearanceSaved(true);
      setTimeout(() => setAppearanceSaved(false), 3000);
    } catch {
      // Ignore storage errors
    }
  };

  // Handle Notification Save
  const handleSaveNotifications = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem('soet_admin_notification_preferences', JSON.stringify(notifPrefs));
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 3000);
    } catch {
      // Ignore storage errors
    }
  };

  // Handle Password Change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError('New password cannot be the same as your current password.');
      return;
    }

    setSavingPassword(true);
    try {
      await authService.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_new_password: confirmPassword,
      });

      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 4000);
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password.');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-[#6B6B6B] mb-6 uppercase tracking-wider">
        <span>Administration</span>
        <span className="mx-2 text-[#DDD7D2]">/</span>
        <span className="text-[#F28C38]">Settings & System</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-[#4A3832] tracking-tight">Admin Settings</h1>
          <p className="text-xs text-[#6B6B6B] mt-1">
            Configure administrative preferences, account security, operational health, and issue reporting.
          </p>
        </div>

        <Link
          href="/admin/bug-reports"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#4A3832] hover:bg-[#3D2E28] text-white text-xs font-bold rounded-xl shadow-xs transition self-start sm:self-auto cursor-pointer"
        >
          <Bug className="w-3.5 h-3.5 text-[#F28C38]" />
          View Issue Reports Queue →
        </Link>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-[#DDD7D2] mb-8 scrollbar-none">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
            activeTab === 'profile'
              ? 'bg-[#4A3832] text-white shadow-sm'
              : 'text-[#6B6B6B] hover:text-[#4A3832] hover:bg-slate-100'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>Admin Profile</span>
        </button>

        <button
          onClick={() => setActiveTab('appearance')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
            activeTab === 'appearance'
              ? 'bg-[#4A3832] text-white shadow-sm'
              : 'text-[#6B6B6B] hover:text-[#4A3832] hover:bg-slate-100'
          }`}
        >
          <Sun className="w-3.5 h-3.5" />
          <span>Appearance</span>
        </button>

        <button
          onClick={() => setActiveTab('notifications')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
            activeTab === 'notifications'
              ? 'bg-[#4A3832] text-white shadow-sm'
              : 'text-[#6B6B6B] hover:text-[#4A3832] hover:bg-slate-100'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>Notifications</span>
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
            activeTab === 'security'
              ? 'bg-[#4A3832] text-white shadow-sm'
              : 'text-[#6B6B6B] hover:text-[#4A3832] hover:bg-slate-100'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Security</span>
        </button>

        <button
          onClick={() => setActiveTab('status')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
            activeTab === 'status'
              ? 'bg-[#4A3832] text-white shadow-sm'
              : 'text-[#6B6B6B] hover:text-[#4A3832] hover:bg-slate-100'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>System Status</span>
        </button>

        <button
          onClick={() => setActiveTab('bug_report')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
            activeTab === 'bug_report'
              ? 'bg-[#F28C38] text-white shadow-sm'
              : 'text-[#6B6B6B] hover:text-[#4A3832] hover:bg-slate-100'
          }`}
        >
          <Bug className="w-3.5 h-3.5" />
          <span>Report a Bug</span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* TAB A: ADMIN PROFILE */}
      {/* ============================================================ */}
      {activeTab === 'profile' && (
        <AdminProfileTab key={user?.id || 'admin-profile'} user={user} refreshProfile={refreshProfile} />
      )}

      {/* ============================================================ */}
      {/* TAB B: APPEARANCE */}
      {/* ============================================================ */}
      {activeTab === 'appearance' && (
        <div className="max-w-2xl bg-white rounded-3xl border border-[#DDD7D2] p-6 sm:p-8 shadow-sm">
          <div className="mb-6 pb-6 border-b border-[#DDD7D2]/60">
            <h2 className="text-base font-bold text-[#4A3832]">Display Appearance</h2>
            <p className="text-xs text-[#6B6B6B] mt-1">
              Select your interface theme. Stored in your current browser session.
            </p>
          </div>

          {appearanceSaved && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Theme preference saved.</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div
              onClick={() => handleSelectTheme('light')}
              className={`p-5 rounded-2xl border-2 transition cursor-pointer flex flex-col items-center text-center gap-3 ${
                themePref === 'light'
                  ? 'border-[#F28C38] bg-[#F28C38]/5 shadow-xs'
                  : 'border-[#DDD7D2] bg-[#FBFAF8] hover:border-slate-300'
              }`}
            >
              <div className={`p-3 rounded-xl ${themePref === 'light' ? 'bg-[#F28C38] text-white' : 'bg-white text-slate-600 border border-[#DDD7D2]'}`}>
                <Sun className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#4A3832]">Light Mode</div>
                <p className="text-[11px] text-[#6B6B6B] mt-0.5">Classic SOET warm ivory palette</p>
              </div>
              {themePref === 'light' && (
                <span className="text-[10px] font-bold text-[#F28C38] uppercase tracking-wider">Active</span>
              )}
            </div>

            <div
              onClick={() => handleSelectTheme('dark')}
              className={`p-5 rounded-2xl border-2 transition cursor-pointer flex flex-col items-center text-center gap-3 ${
                themePref === 'dark'
                  ? 'border-[#F28C38] bg-[#F28C38]/5 shadow-xs'
                  : 'border-[#DDD7D2] bg-[#FBFAF8] hover:border-slate-300'
              }`}
            >
              <div className={`p-3 rounded-xl ${themePref === 'dark' ? 'bg-[#F28C38] text-white' : 'bg-white text-slate-600 border border-[#DDD7D2]'}`}>
                <Moon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#4A3832]">Dark Mode</div>
                <p className="text-[11px] text-[#6B6B6B] mt-0.5">High-contrast dark surface</p>
              </div>
              {themePref === 'dark' && (
                <span className="text-[10px] font-bold text-[#F28C38] uppercase tracking-wider">Active</span>
              )}
            </div>

            <div
              onClick={() => handleSelectTheme('system')}
              className={`p-5 rounded-2xl border-2 transition cursor-pointer flex flex-col items-center text-center gap-3 ${
                themePref === 'system'
                  ? 'border-[#F28C38] bg-[#F28C38]/5 shadow-xs'
                  : 'border-[#DDD7D2] bg-[#FBFAF8] hover:border-slate-300'
              }`}
            >
              <div className={`p-3 rounded-xl ${themePref === 'system' ? 'bg-[#F28C38] text-white' : 'bg-white text-slate-600 border border-[#DDD7D2]'}`}>
                <Monitor className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#4A3832]">System Default</div>
                <p className="text-[11px] text-[#6B6B6B] mt-0.5">Follow device system settings</p>
              </div>
              {themePref === 'system' && (
                <span className="text-[10px] font-bold text-[#F28C38] uppercase tracking-wider">Active</span>
              )}
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 leading-relaxed">
            Note: Theme preference is stored locally in your browser. The SOET Connect design guidelines preserve brand contrast standards across all views.
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB C: ADMIN NOTIFICATIONS */}
      {/* ============================================================ */}
      {activeTab === 'notifications' && (
        <div className="max-w-2xl bg-white rounded-3xl border border-[#DDD7D2] p-6 sm:p-8 shadow-sm">
          <div className="mb-6 pb-6 border-b border-[#DDD7D2]/60 flex justify-between items-start">
            <div>
              <h2 className="text-base font-bold text-[#4A3832]">Administrative Alerts</h2>
              <p className="text-xs text-[#6B6B6B] mt-1">
                Customize operational notifications triggered by platform activity.
              </p>
            </div>
            <span className="text-[10px] font-bold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg uppercase tracking-wider">
              Local Preference
            </span>
          </div>

          {notifSaved && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Notification preferences saved.</span>
            </div>
          )}

          <form onSubmit={handleSaveNotifications} className="space-y-4">
            <label className="flex items-start gap-3 p-4 bg-[#FBFAF8] rounded-2xl border border-[#DDD7D2]/80 hover:bg-white transition cursor-pointer">
              <input
                type="checkbox"
                checked={notifPrefs.studentVerification}
                onChange={(e) =>
                  setNotifPrefs({ ...notifPrefs, studentVerification: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#F28C38] focus:ring-[#F28C38]"
              />
              <div className="flex-1">
                <div className="text-xs font-bold text-[#4A3832]">New Student Registrations</div>
                <p className="text-[11px] text-[#6B6B6B] mt-0.5">
                  Receive alerts when newly registered students require verification and authorization.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 bg-[#FBFAF8] rounded-2xl border border-[#DDD7D2]/80 hover:bg-white transition cursor-pointer">
              <input
                type="checkbox"
                checked={notifPrefs.alumniVerification}
                onChange={(e) =>
                  setNotifPrefs({ ...notifPrefs, alumniVerification: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#F28C38] focus:ring-[#F28C38]"
              />
              <div className="flex-1">
                <div className="text-xs font-bold text-[#4A3832]">New Alumni Verification Requests</div>
                <p className="text-[11px] text-[#6B6B6B] mt-0.5">
                  Alerts when graduating alumni register and await degree verification.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 bg-[#FBFAF8] rounded-2xl border border-[#DDD7D2]/80 hover:bg-white transition cursor-pointer">
              <input
                type="checkbox"
                checked={notifPrefs.jobApprovals}
                onChange={(e) =>
                  setNotifPrefs({ ...notifPrefs, jobApprovals: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#F28C38] focus:ring-[#F28C38]"
              />
              <div className="flex-1">
                <div className="text-xs font-bold text-[#4A3832]">Career Opportunities Awaiting Moderation</div>
                <p className="text-[11px] text-[#6B6B6B] mt-0.5">
                  Alerts when alumni submit new job or internship vacancies for review.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 bg-[#FBFAF8] rounded-2xl border border-[#DDD7D2]/80 hover:bg-white transition cursor-pointer">
              <input
                type="checkbox"
                checked={notifPrefs.eventModeration}
                onChange={(e) =>
                  setNotifPrefs({ ...notifPrefs, eventModeration: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#F28C38] focus:ring-[#F28C38]"
              />
              <div className="flex-1">
                <div className="text-xs font-bold text-[#4A3832]">Event Submissions & Registrations</div>
                <p className="text-[11px] text-[#6B6B6B] mt-0.5">
                  Alerts for campus event scheduling and milestone attendance thresholds.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 bg-[#FBFAF8] rounded-2xl border border-[#DDD7D2]/80 hover:bg-white transition cursor-pointer">
              <input
                type="checkbox"
                checked={notifPrefs.platformAlerts}
                onChange={(e) =>
                  setNotifPrefs({ ...notifPrefs, platformAlerts: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#F28C38] focus:ring-[#F28C38]"
              />
              <div className="flex-1">
                <div className="text-xs font-bold text-[#4A3832]">System & Security Warnings</div>
                <p className="text-[11px] text-[#6B6B6B] mt-0.5">
                  Critical alerts regarding bug reports, failed syncs, or database events.
                </p>
              </div>
            </label>

            <div className="pt-3 flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-[#F28C38] hover:bg-[#E07D2E] focus:ring-2 focus:ring-[#F28C38] shadow-md shadow-[#F28C38]/20 transition cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Notification Preferences</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB D: SECURITY (CHANGE PASSWORD) */}
      {/* ============================================================ */}
      {activeTab === 'security' && (
        <div className="max-w-2xl bg-white rounded-3xl border border-[#DDD7D2] p-6 sm:p-8 shadow-sm">
          <div className="mb-6 pb-6 border-b border-[#DDD7D2]/60">
            <h2 className="text-base font-bold text-[#4A3832]">Change Password</h2>
            <p className="text-xs text-[#6B6B6B] mt-1">
              Ensure your administrative account is secured with a strong passphrase.
            </p>
          </div>

          {passwordSuccess && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Password changed successfully. Your new credentials are now active.</span>
            </div>
          )}

          {passwordError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{passwordError}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-5">
            {/* Current Password */}
            <div>
              <label className="block text-xs font-bold text-[#4A3832] mb-1.5">
                Current Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showCurrentPw ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-3.5 pr-10 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#4A3832] outline-none focus:ring-2 focus:ring-[#F28C38] focus:bg-white transition"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPw(!showCurrentPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold text-[#4A3832]">
                  New Password <span className="text-red-500">*</span>
                </label>
                <span className="text-[11px] text-[#888888]">Minimum 8 characters</span>
              </div>
              <div className="relative">
                <input
                  type={showNewPw ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-3.5 pr-10 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#4A3832] outline-none focus:ring-2 focus:ring-[#F28C38] focus:bg-white transition"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="block text-xs font-bold text-[#4A3832] mb-1.5">
                Confirm New Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirmPw ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-3.5 pr-10 py-2.5 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#4A3832] outline-none focus:ring-2 focus:ring-[#F28C38] focus:bg-white transition"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPw(!showConfirmPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-3 flex justify-end">
              <button
                type="submit"
                disabled={savingPassword}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-[#F28C38] hover:bg-[#E07D2E] focus:ring-2 focus:ring-[#F28C38] shadow-md shadow-[#F28C38]/20 transition disabled:opacity-50 cursor-pointer"
              >
                {savingPassword ? (
                  <>
                    <ButtonSpinner className="text-white" />
                    <span>Changing password...</span>
                  </>
                ) : (
                  <>
                    <Key className="w-3.5 h-3.5" />
                    <span>Update Password</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB E: SYSTEM STATUS */}
      {/* ============================================================ */}
      {activeTab === 'status' && (
        <div className="max-w-3xl space-y-6">
          <div className="bg-white rounded-3xl border border-[#DDD7D2] p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-[#DDD7D2]/60">
              <div>
                <h2 className="text-base font-bold text-[#4A3832]">System Operational Status</h2>
                <p className="text-xs text-[#6B6B6B] mt-1">
                  Live connectivity verification with the FastAPI backend and Supabase PostgreSQL.
                </p>
              </div>

              <button
                type="button"
                onClick={loadSystemStatus}
                disabled={checkingStatus}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50 self-start sm:self-auto"
              >
                {checkingStatus ? (
                  <>
                    <ButtonSpinner className="text-slate-600" />
                    <span>Checking status...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-[#F28C38]" />
                    <span>Refresh Status</span>
                  </>
                )}
              </button>
            </div>

            {/* Status Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {/* API Backend Card */}
              <div className="p-5 rounded-2xl bg-[#FBFAF8] border border-[#DDD7D2] flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#4A3832]">FastAPI Backend</div>
                    <div className="text-[11px] text-[#6B6B6B]">Core REST APIs</div>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                    systemStatus?.api === 'healthy'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      systemStatus?.api === 'healthy' ? 'bg-emerald-500' : 'bg-red-500'
                    }`}
                  />
                  {systemStatus?.api === 'healthy' ? 'Operational' : 'Unavailable'}
                </span>
              </div>

              {/* Database Card */}
              <div className="p-5 rounded-2xl bg-[#FBFAF8] border border-[#DDD7D2] flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#4A3832]">Supabase PostgreSQL</div>
                    <div className="text-[11px] text-[#6B6B6B]">Relational Database</div>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                    systemStatus?.database === 'connected'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      systemStatus?.database === 'connected' ? 'bg-emerald-500' : 'bg-red-500'
                    }`}
                  />
                  {systemStatus?.database === 'connected' ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>

            {/* Metadata Table */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-2">
              <div className="flex justify-between items-center text-slate-600">
                <span>Active Environment:</span>
                <span className="font-bold text-[#4A3832] font-mono capitalize">
                  {systemStatus?.environment || 'Production'}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Current Session Role:</span>
                <span className="font-bold text-[#4A3832]">Administrator (Authorized)</span>
              </div>
              {systemStatus?.checkedAt && (
                <div className="flex justify-between items-center text-slate-500 text-[11px] pt-2 border-t border-slate-200">
                  <span>Last Checked:</span>
                  <span>{new Date(systemStatus.checkedAt).toLocaleTimeString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB F: REPORT A BUG / ISSUE */}
      {/* ============================================================ */}
      {activeTab === 'bug_report' && (
        <div className="max-w-3xl space-y-6">
          <div className="bg-white rounded-3xl border border-[#DDD7D2] p-6 sm:p-8 shadow-sm">
            <div className="mb-6 pb-6 border-b border-[#DDD7D2]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-[#4A3832]">Submit Bug or Issue Report</h2>
                <p className="text-xs text-[#6B6B6B] mt-1">
                  Report glitches, UI flaws, or data discrepancies directly to the technical team.
                </p>
              </div>

              <Link
                href="/admin/bug-reports"
                className="text-xs font-bold text-[#F28C38] hover:text-[#E07D2E] inline-flex items-center gap-1"
              >
                Open Bug Reports Queue →
              </Link>
            </div>

            <ReportIssueForm initialRoute="/admin/settings" />
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
