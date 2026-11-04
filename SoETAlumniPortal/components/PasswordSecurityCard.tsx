'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import PasswordInput from '@/components/PasswordInput';
import { authService } from '@/lib/services/authService';

export default function PasswordSecurityCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword.length < 8) {
      setError('Your new password must contain at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new password and confirmation do not match.');
      return;
    }
    if (currentPassword === newPassword) {
      setError('Choose a new password that is different from your current password.');
      return;
    }

    setLoading(true);
    try {
      const result = await authService.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_new_password: confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(result.message || 'Your password has been updated successfully.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to change your password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputClassName =
    'block w-full rounded-xl border border-[#DDD7D2] bg-[#FBFAF8] px-3.5 py-3 text-sm text-[#4A3832] outline-none transition placeholder:text-[#A49A92] focus:border-[#F28C38] focus:bg-white focus:ring-2 focus:ring-[#F28C38]/20';

  return (
    <section className="rounded-3xl border border-[#DDD7D2] bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-6 flex items-start gap-3 border-b border-[#DDD7D2] pb-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F28C38]/10 text-[#A75A24]">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-[#4A3832]">Password & Security</h2>
          <p className="mt-1 text-xs leading-relaxed text-[#6B6B6B]">
            Change your account password securely. You must know your current password to use this form.
          </p>
        </div>
      </div>

      {success && (
        <div role="status" className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-medium text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="account-current-password" className="mb-1.5 block text-xs font-bold text-[#4A3832]">
            Current Password
          </label>
          <PasswordInput
            id="account-current-password"
            name="current_password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Enter current password"
            className={inputClassName}
          />
        </div>

        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="account-new-password" className="text-xs font-bold text-[#4A3832]">
              New Password
            </label>
            <span className="text-[11px] text-[#888888]">At least 8 characters</span>
          </div>
          <PasswordInput
            id="account-new-password"
            name="new_password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Create a new password"
            className={inputClassName}
          />
        </div>

        <div>
          <label htmlFor="account-confirm-password" className="mb-1.5 block text-xs font-bold text-[#4A3832]">
            Confirm New Password
          </label>
          <PasswordInput
            id="account-confirm-password"
            name="confirm_new_password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Re-enter new password"
            className={inputClassName}
          />
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-[#F0EBE6] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] leading-relaxed text-[#77706B]">
            Forgot your current password? Use the recovery option instead.
          </p>
          <button
            type="submit"
            disabled={loading || !currentPassword || !newPassword || !confirmPassword}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F28C38] px-5 py-3 text-xs font-bold text-white shadow-md shadow-[#F28C38]/20 transition hover:bg-[#E07D2E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F28C38] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {loading ? 'Updating password...' : 'Update Password'}
          </button>
        </div>
      </form>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#F7F4EF] p-3.5 text-xs text-[#6B6B6B]">
        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#A75A24]" />
        <p className="min-w-0 flex-1 leading-relaxed">
          You can reset a forgotten password using a one-time verification code sent to your registered email or verified phone.
          {' '}
          <Link href="/forgot-password" className="inline-flex items-center gap-1 font-bold text-[#A75A24] hover:underline">
            Reset forgotten password <ArrowRight className="h-3 w-3" />
          </Link>
        </p>
      </div>
    </section>
  );
}
