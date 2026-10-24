'use client';

import React, { useState, useEffect } from 'react';
import {
  notificationService,
  NotificationPreferences,
  NotificationDeliveryItem,
} from '@/lib/services/notificationService';
import { authService } from '@/lib/services/authService';
import {
  Bell,
  Mail,
  Phone,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Save,
  Clock,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Send,
} from 'lucide-react';

export default function NotificationPreferencesCard() {
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    email_enabled: true,
    sms_enabled: false,
    in_app_enabled: true,
    notify_jobs: true,
    notify_events: true,
    notify_announcements: true,
    notify_applications: true,
    notify_gallery: true,
    phone: '',
    is_phone_verified: false,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Phone verification sub-flow
  const [showPhoneVerify, setShowPhoneVerify] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneStep, setPhoneStep] = useState<'input' | 'code'>('input');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneFeedback, setPhoneFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Delivery logs audit trail
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [deliveries, setDeliveries] = useState<NotificationDeliveryItem[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);

  // Load preferences
  const loadPreferences = async () => {
    try {
      setLoading(true);
      const data = await notificationService.getPreferences();
      setPrefs(data);
      if (data.phone) {
        setPhoneNumber(data.phone);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to load notification settings.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPreferences();
  }, []);

  // Save preferences
  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    // Guard: SMS cannot be enabled if phone is not verified
    if (prefs.sms_enabled && !prefs.is_phone_verified) {
      setFeedback({
        type: 'error',
        text: 'Please verify your phone number before enabling SMS notifications.',
      });
      setSaving(false);
      return;
    }

    try {
      const updated = await notificationService.updatePreferences(prefs);
      setPrefs(updated);
      setFeedback({ type: 'success', text: 'Notification preferences saved successfully!' });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to save preferences.' });
    } finally {
      setSaving(false);
    }
  };

  // Send Phone verification code
  const handleSendPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneFeedback(null);
    setPhoneLoading(true);

    try {
      const res = await authService.sendPhoneVerification(phoneNumber.trim());
      setPhoneFeedback({ type: 'success', text: res.message || 'Verification code sent to your phone.' });
      setPhoneStep('code');
    } catch (err: any) {
      setPhoneFeedback({ type: 'error', text: err.message || 'Failed to send verification SMS.' });
    } finally {
      setPhoneLoading(false);
    }
  };

  // Verify Phone code
  const handleVerifyPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneFeedback(null);
    setPhoneLoading(true);

    try {
      await authService.verifyPhoneVerification(phoneNumber.trim(), phoneCode.trim());
      setPhoneFeedback({ type: 'success', text: 'Phone number verified successfully!' });
      setPrefs((prev) => ({
        ...prev,
        phone: phoneNumber.trim(),
        is_phone_verified: true,
      }));
      setTimeout(() => {
        setShowPhoneVerify(false);
        setPhoneStep('input');
        setPhoneCode('');
        setPhoneFeedback(null);
      }, 1500);
    } catch (err: any) {
      setPhoneFeedback({ type: 'error', text: err.message || 'Invalid or expired verification code.' });
    } finally {
      setPhoneLoading(false);
    }
  };

  // Load deliveries
  const toggleDeliveries = async () => {
    if (!showDeliveries) {
      setShowDeliveries(true);
      setLoadingDeliveries(true);
      try {
        const items = await notificationService.getDeliveries(15);
        setDeliveries(items);
      } catch {
        // Safe fail
      } finally {
        setLoadingDeliveries(false);
      }
    } else {
      setShowDeliveries(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#E0DCD7] p-8 animate-pulse">
        <div className="h-6 w-48 bg-[#EAE6E1] rounded mb-4" />
        <div className="h-4 w-72 bg-[#EAE6E1] rounded mb-8" />
        <div className="space-y-4">
          <div className="h-10 bg-[#EAE6E1] rounded-xl" />
          <div className="h-10 bg-[#EAE6E1] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-[#E0DCD7] shadow-sm p-6 sm:p-8 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-[#F28C38]" />
          <h2 className="text-lg font-bold text-[#222222]">
            Notification Channels & Preferences
          </h2>
        </div>
        <p className="text-xs text-[#6B6B6B] mt-1">
          Configure how and when you receive portal updates across in-app alerts, email, and SMS.
        </p>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-2xl text-xs font-medium flex items-start gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <form onSubmit={handleSavePreferences} className="space-y-8">
        {/* Delivery Channels */}
        <div>
          <h3 className="text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-3">
            Active Delivery Channels
          </h3>
          <div className="space-y-3">
            {/* In-App Notifications */}
            <label className="flex items-start justify-between p-4 rounded-2xl border border-[#E0DCD7] bg-[#FBFAF8] cursor-pointer hover:border-[#F28C38] transition">
              <div className="flex items-start gap-3">
                <Bell className="w-4 h-4 text-[#F28C38] shrink-0 mt-1" />
                <div>
                  <span className="text-xs font-bold text-[#222222] block">
                    In-App Notification Center
                  </span>
                  <span className="text-[11px] text-[#6B6B6B]">
                    Receive instant notifications in the dashboard header and notification drawer.
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={prefs.in_app_enabled}
                onChange={(e) =>
                  setPrefs({ ...prefs, in_app_enabled: e.target.checked })
                }
                className="w-4 h-4 rounded text-[#F28C38] focus:ring-[#F28C38] cursor-pointer"
              />
            </label>

            {/* Email Notifications */}
            <label className="flex items-start justify-between p-4 rounded-2xl border border-[#E0DCD7] bg-[#FBFAF8] cursor-pointer hover:border-[#F28C38] transition">
              <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-[#80C2AF] shrink-0 mt-1" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#222222]">
                      Email Notifications
                    </span>
                    {prefs.is_email_configured === false && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-200">
                        Provider Pending
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-[#6B6B6B]">
                    Receive digests and time-critical announcements at your registered email address.
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={prefs.email_enabled}
                onChange={(e) =>
                  setPrefs({ ...prefs, email_enabled: e.target.checked })
                }
                className="w-4 h-4 rounded text-[#F28C38] focus:ring-[#F28C38] cursor-pointer"
              />
            </label>

            {/* SMS Notifications */}
            <div className="p-4 rounded-2xl border border-[#E0DCD7] bg-[#FBFAF8]">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <Phone className="w-4 h-4 text-[#F28C38] shrink-0 mt-1" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#222222]">
                        SMS Mobile Notifications
                      </span>
                      {prefs.is_phone_verified ? (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                          Verified
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-200">
                          Verification Required
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[#6B6B6B] block mt-0.5">
                      Receive immediate SMS alerts for urgent deadlines and security events.
                    </span>
                  </div>
                </div>

                <input
                  type="checkbox"
                  disabled={!prefs.is_phone_verified}
                  checked={prefs.sms_enabled}
                  onChange={(e) =>
                    setPrefs({ ...prefs, sms_enabled: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-[#F28C38] focus:ring-[#F28C38] disabled:opacity-40 cursor-pointer"
                />
              </div>

              {/* Phone status & verification CTA */}
              <div className="mt-3 pt-3 border-t border-[#DDD7D2]/60 flex items-center justify-between text-[11px]">
                <span className="text-[#6B6B6B]">
                  {prefs.phone ? (
                    <>
                      Phone:{' '}
                      <strong className="text-[#222222] font-mono">{prefs.phone}</strong>
                    </>
                  ) : (
                    'No mobile number linked yet.'
                  )}
                </span>

                <button
                  type="button"
                  onClick={() => setShowPhoneVerify(!showPhoneVerify)}
                  className="font-bold text-[#F28C38] hover:text-[#E07D2E] transition"
                >
                  {prefs.is_phone_verified ? 'Change Number' : 'Verify Mobile Number'}
                </button>
              </div>

              {/* Inline Phone Verification Flow */}
              {showPhoneVerify && (
                <div className="mt-4 p-4 rounded-xl bg-white border border-[#DDD7D2] space-y-3">
                  {phoneFeedback && (
                    <div
                      className={`p-2.5 rounded-lg text-xs font-medium flex items-center gap-2 ${
                        phoneFeedback.type === 'success'
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-red-50 text-red-800'
                      }`}
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{phoneFeedback.text}</span>
                    </div>
                  )}

                  {phoneStep === 'input' ? (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="flex-1 px-3 py-2 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#F28C38]"
                      />
                      <button
                        type="button"
                        onClick={handleSendPhoneCode}
                        disabled={phoneLoading || !phoneNumber.trim()}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#F28C38] hover:bg-[#E07D2E] transition disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                      >
                        <Send className="w-3 h-3" />
                        {phoneLoading ? 'Sending...' : 'Send SMS Code'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-[11px] text-[#6B6B6B]">
                        Enter the 6-digit code sent via SMS to {phoneNumber}:
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          maxLength={6}
                          value={phoneCode}
                          onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="123456"
                          className="w-32 tracking-widest text-center font-mono font-bold px-3 py-2 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-xs text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#F28C38]"
                        />
                        <button
                          type="button"
                          onClick={handleVerifyPhoneCode}
                          disabled={phoneLoading || phoneCode.length !== 6}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-50"
                        >
                          {phoneLoading ? 'Verifying...' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPhoneStep('input')}
                          className="px-3 py-2 text-xs font-medium text-[#6B6B6B] hover:text-[#222222]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Notification Topics */}
        <div>
          <h3 className="text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-3">
            Topic Subscriptions
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center justify-between p-3.5 rounded-xl border border-[#E0DCD7] bg-[#FBFAF8] cursor-pointer hover:border-[#F28C38] transition">
              <span className="text-xs font-medium text-[#222222]">
                Job & Internship Postings
              </span>
              <input
                type="checkbox"
                checked={prefs.notify_jobs}
                onChange={(e) => setPrefs({ ...prefs, notify_jobs: e.target.checked })}
                className="w-4 h-4 rounded text-[#F28C38] focus:ring-[#F28C38]"
              />
            </label>

            <label className="flex items-center justify-between p-3.5 rounded-xl border border-[#E0DCD7] bg-[#FBFAF8] cursor-pointer hover:border-[#F28C38] transition">
              <span className="text-xs font-medium text-[#222222]">
                Campus & Alumni Events
              </span>
              <input
                type="checkbox"
                checked={prefs.notify_events}
                onChange={(e) => setPrefs({ ...prefs, notify_events: e.target.checked })}
                className="w-4 h-4 rounded text-[#F28C38] focus:ring-[#F28C38]"
              />
            </label>

            <label className="flex items-center justify-between p-3.5 rounded-xl border border-[#E0DCD7] bg-[#FBFAF8] cursor-pointer hover:border-[#F28C38] transition">
              <span className="text-xs font-medium text-[#222222]">
                Official Announcements
              </span>
              <input
                type="checkbox"
                checked={prefs.notify_announcements}
                onChange={(e) =>
                  setPrefs({ ...prefs, notify_announcements: e.target.checked })
                }
                className="w-4 h-4 rounded text-[#F28C38] focus:ring-[#F28C38]"
              />
            </label>

            <label className="flex items-center justify-between p-3.5 rounded-xl border border-[#E0DCD7] bg-[#FBFAF8] cursor-pointer hover:border-[#F28C38] transition">
              <span className="text-xs font-medium text-[#222222]">
                Application Status Updates
              </span>
              <input
                type="checkbox"
                checked={prefs.notify_applications}
                onChange={(e) =>
                  setPrefs({ ...prefs, notify_applications: e.target.checked })
                }
                className="w-4 h-4 rounded text-[#F28C38] focus:ring-[#F28C38]"
              />
            </label>

            <label className="flex items-center justify-between p-3.5 rounded-xl border border-[#E0DCD7] bg-[#FBFAF8] cursor-pointer hover:border-[#F28C38] transition sm:col-span-2">
              <span className="text-xs font-medium text-[#222222]">
                Photo Gallery Moderation & Approvals
              </span>
              <input
                type="checkbox"
                checked={prefs.notify_gallery}
                onChange={(e) =>
                  setPrefs({ ...prefs, notify_gallery: e.target.checked })
                }
                className="w-4 h-4 rounded text-[#F28C38] focus:ring-[#F28C38]"
              />
            </label>
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-[#F28C38] hover:bg-[#E07D2E] shadow-sm shadow-[#F28C38]/25 transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving Preferences...' : 'Save Preferences'}
          </button>
        </div>
      </form>

      {/* Audit Trail: Recent Deliveries */}
      <div className="border-t border-[#E0DCD7] pt-6">
        <button
          type="button"
          onClick={toggleDeliveries}
          className="w-full flex items-center justify-between text-left group"
        >
          <div>
            <h3 className="text-xs font-semibold text-[#4A3832] uppercase tracking-wider group-hover:text-[#F28C38] transition">
              Notification Delivery Audit Log
            </h3>
            <p className="text-[11px] text-[#6B6B6B] mt-0.5">
              Review recent notification dispatches, channels, and delivery statuses.
            </p>
          </div>
          {showDeliveries ? (
            <ChevronUp className="w-4 h-4 text-[#888888]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#888888]" />
          )}
        </button>

        {showDeliveries && (
          <div className="mt-4 space-y-2">
            {loadingDeliveries ? (
              <div className="py-6 text-center text-xs text-[#888888]">
                Loading delivery history...
              </div>
            ) : deliveries.length === 0 ? (
              <div className="py-4 text-center text-xs text-[#888888]">
                No external dispatches logged yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-[#F7F4EF] text-[#4A3832]">
                    <tr>
                      <th className="p-2 rounded-l-lg">Channel</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Recipient</th>
                      <th className="p-2 rounded-r-lg">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0EBE6]">
                    {deliveries.map((item) => (
                      <tr key={item.id}>
                        <td className="p-2 uppercase font-mono font-bold text-[#4A3832]">
                          {item.channel}
                        </td>
                        <td className="p-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              item.status === 'delivered' || item.status === 'accepted' || item.status === 'sent'
                                ? 'bg-emerald-50 text-emerald-700'
                                : item.status === 'skipped' || item.status === 'pending'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-red-50 text-red-700'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="p-2 text-[#6B6B6B] font-mono">
                          {item.recipient || '—'}
                        </td>
                        <td className="p-2 text-[#888888]">
                          {new Date(item.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
