'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/components/AuthProvider';
import { authService } from '@/lib/services/authService';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Laptop,
  LogOut,
  AlertTriangle,
  History,
} from 'lucide-react';

interface AuthSession {
  id: string;
  device_label: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  is_current: boolean;
}

interface SecurityEvent {
  id: string;
  event_type: string;
  device_label: string;
  created_at: string;
  signals: string[];
}

function securityEventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    sign_in: 'Sign-in',
    unfamiliar_sign_in: 'Unfamiliar sign-in',
    password_changed: 'Password changed',
    password_reset: 'Password reset',
    signed_out: 'Signed out',
    sessions_revoked: 'Other session(s) signed out',
  };
  return labels[eventType] || 'Account security activity';
}

function formatDate(value?: string): string {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function ActiveSessionsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadSessions = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const result = await authService.getActiveSessions();
      setSessions(result.sessions || []);
      try {
        const activity = await authService.getSecurityEvents();
        setSecurityEvents(activity.events || []);
      } catch (activityError) {
        // Keep session controls available even if the audit history is temporarily unavailable.
        console.warn('Recent security activity could not be loaded:', activityError);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load your active sessions.';
      setError(message);
      if (/session.*(expired|revoked)|sign in again/i.test(message)) {
        router.replace('/login?expired=1');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
      return;
    }
    if (user) loadSessions();
  }, [authLoading, user, router, loadSessions]);

  const handleRevokeSession = async (session: AuthSession) => {
    if (session.is_current || revokingId) return;
    setRevokingId(session.id);
    setError(null);
    setSuccess(null);
    try {
      const result = await authService.revokeSession(session.id);
      setSuccess(result.message || 'The selected device has been signed out.');
      await loadSessions(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to sign out that device.';
      setError(message);
      if (/session.*(expired|revoked)|sign in again/i.test(message)) {
        router.replace('/login?expired=1');
      }
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeOthers = async () => {
    if (revokingOthers) return;
    setRevokingOthers(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await authService.revokeOtherSessions();
      setSuccess(result.message || 'All other active devices have been signed out.');
      await loadSessions(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to sign out other devices.';
      setError(message);
      if (/session.*(expired|revoked)|sign in again/i.test(message)) {
        router.replace('/login?expired=1');
      }
    } finally {
      setRevokingOthers(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadSessions(true);
  };

  const otherSessionCount = sessions.filter((session) => !session.is_current).length;

  return (
    <DashboardLayout>
      <div className="mb-6 flex items-center text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">
        <span>Account</span>
        <span className="mx-2 text-[#DDD7D2]">/</span>
        <span>Security</span>
        <span className="mx-2 text-[#DDD7D2]">/</span>
        <span className="text-[#F28C38]">Active Sessions</span>
      </div>

      <div className="mx-auto max-w-4xl">
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#4A3832]">Active Sessions</h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#6B6B6B]">
              Review the browsers and devices signed in to your SOET Connect account. You can sign out a device without affecting the others.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading || refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#DDD7D2] bg-white px-4 py-2.5 text-xs font-bold text-[#4A3832] transition hover:border-[#F28C38] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div role="status" className="mb-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <section className="overflow-hidden rounded-3xl border border-[#DDD7D2] bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-[#F0EBE6] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F28C38]/10 text-[#A75A24]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#4A3832]">Signed-in devices</h2>
                <p className="mt-0.5 text-xs text-[#77706B]">
                  {loading ? 'Checking active sessions…' : `${sessions.length} active ${sessions.length === 1 ? 'session' : 'sessions'}`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRevokeOthers}
              disabled={loading || revokingOthers || otherSessionCount === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {revokingOthers ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Sign out all other devices
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 p-12 text-xs text-[#77706B]">
              <Loader2 className="h-5 w-5 animate-spin text-[#F28C38]" />
              Loading your sessions…
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-10 text-center">
              <MonitorSmartphone className="mx-auto h-9 w-9 text-[#A49A92]" />
              <p className="mt-3 text-sm font-bold text-[#4A3832]">No active sessions found</p>
              <p className="mt-1 text-xs text-[#77706B]">Sign in again to create a device session for this account.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#F0EBE6]">
              {sessions.map((session) => (
                <div key={session.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                  <div className="flex min-w-0 items-start gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F7F4EF] text-[#6B5147]">
                      {session.device_label.toLowerCase().includes('android') || session.device_label.toLowerCase().includes('ios')
                        ? <Smartphone className="h-5 w-5" />
                        : <Laptop className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-bold text-[#4A3832]">{session.device_label}</p>
                        {session.is_current && (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                            This device
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-[#77706B]">Last active: {formatDate(session.last_seen_at)}</p>
                      <p className="mt-0.5 text-[11px] text-[#A49A92]">Signed in: {formatDate(session.created_at)}</p>
                    </div>
                  </div>

                  {session.is_current ? (
                    <span className="shrink-0 text-[11px] font-semibold text-emerald-700">Currently in use</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRevokeSession(session)}
                      disabled={revokingId !== null || revokingOthers}
                      className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50 sm:self-center"
                    >
                      {revokingId === session.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                      Sign out
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl border border-[#DDD7D2] bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-[#F0EBE6] p-5 sm:p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F7F4EF] text-[#6B5147]">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#4A3832]">Recent security activity</h2>
              <p className="mt-0.5 text-xs text-[#77706B]">Recent sign-ins and important account security changes</p>
            </div>
          </div>
          {securityEvents.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#77706B]">
              No recent security activity has been recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-[#F0EBE6]">
              {securityEvents.map((event) => (
                <div key={event.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    {event.event_type === 'unfamiliar_sign_in' ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    ) : (
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#8A786E]" />
                    )}
                    <div className="min-w-0">
                      <p className={`text-xs font-bold ${event.event_type === 'unfamiliar_sign_in' ? 'text-amber-700' : 'text-[#4A3832]'}`}>
                        {securityEventLabel(event.event_type)}
                      </p>
                      <p className="mt-1 text-[11px] text-[#77706B]">{event.device_label}</p>
                      {event.signals?.length > 0 && (
                        <p className="mt-1 text-[11px] text-amber-700">
                          {event.signals.map((signal) => signal === 'new_network' ? 'New network' : 'New browser/platform').join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <time className="shrink-0 pl-7 text-[11px] text-[#A49A92] sm:pl-0">{formatDate(event.created_at)}</time>
                </div>
              ))}
            </div>
          )}
          <p className="border-t border-[#F0EBE6] bg-[#FBFAF8] px-5 py-3 text-[11px] leading-relaxed text-[#77706B]">
            An unfamiliar sign-in means the browser/platform type or network differs from the recent sign-in history. VPNs and changing mobile networks can cause a review flag; no raw IP address is shown or stored in this history.
          </p>
        </section>

        <div className="mt-5 rounded-2xl border border-[#DDD7D2] bg-[#FBFAF8] p-4 text-xs leading-relaxed text-[#6B6B6B]">
          <p className="font-bold text-[#4A3832]">How device sessions work</p>
          <p className="mt-1">
            Signing out a device revokes its access token on the server. The next request from that device will require a fresh sign-in. Password changes and password resets also sign out all existing devices.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
