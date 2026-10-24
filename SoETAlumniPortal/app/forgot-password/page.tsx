'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Mail,
  Phone,
  Lock,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Shield,
  Clock,
} from 'lucide-react';
import { authService } from '@/lib/services/authService';

export default function ForgotPasswordPage() {
  const router = useRouter();

  // Wizard state: 1 = Request, 2 = Verify Code, 3 = Reset Password, 4 = Success
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form states
  const [identifier, setIdentifier] = useState('');
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Constants for timers
  const CODE_VALIDITY_SECONDS = 600; // 10 minutes OTP validity
  const RESEND_COOLDOWN_SECONDS = 20; // 20 seconds resend cooldown

  // 10-minute OTP validity timer (separate from resend cooldown)
  const [validityTimeLeft, setValidityTimeLeft] = useState<number>(CODE_VALIDITY_SECONDS);
  // 20-second resend cooldown timer (separate from 10-minute validity)
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  useEffect(() => {
    if (step !== 2) return;

    const interval = setInterval(() => {
      setValidityTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [step]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Core request logic – reusable for first request and resend
  const doRequestCode = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await authService.requestPasswordReset(identifier.trim(), channel);
      setSuccessMessage(res.message || 'Verification code sent successfully.');
      // 1. Keep OTP validity at 10 minutes (600s)
      setValidityTimeLeft(res.expires_in || CODE_VALIDITY_SECONDS);
      // 2. Make Resend Code button available 20 seconds after a successful request
      setResendCooldown(res.cooldown_seconds || RESEND_COOLDOWN_SECONDS);
      setCode('');
      setStep(2);
    } catch (err: any) {
      setError(err.message || 'Failed to send recovery code. Please try again.');
      // 4. When delivery or request fails, allow immediate retry without waiting for cooldown
      setResendCooldown(0);
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Request Code (form submit)
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    await doRequestCode();
  };

  // Step 2: Verify Code
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCode = code.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setError('Please enter a valid 6-digit numeric verification code.');
      return;
    }

    setLoading(true);
    try {
      const res = await authService.verifyResetCode(identifier.trim(), cleanCode);
      setResetToken(res.reset_token);
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'The verification code is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Set New Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);
    try {
      await authService.resetPassword(resetToken, newPassword);
      setStep(4);
    } catch (err: any) {
      setError(err.message || 'Failed to update password. Your reset session may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand header */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-block group">
            <h1 className="text-2xl font-black tracking-tight text-[#222222]">
              SOET <span className="text-[#F28C38]">Connect</span>
            </h1>
            <p className="text-xs font-semibold text-[#888888] tracking-widest uppercase mt-0.5">
              Alumni Portal
            </p>
          </Link>
        </div>

        {/* Progress indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                s === step
                  ? 'w-10 bg-[#F28C38]'
                  : s < step
                  ? 'w-4 bg-[#80C2AF]'
                  : 'w-4 bg-[#E0DCD7]'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 sm:px-10 border border-[#E0DCD7] rounded-3xl shadow-sm">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-red-700 text-xs font-medium">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: IDENTIFIER & CHANNEL SELECTION */}
          {step === 1 && (
            <div>
              <div className="mb-6 text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-[#F28C38]/10 text-[#F28C38] rounded-2xl flex items-center justify-center">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-[#222222]">Reset your password</h2>
                <p className="text-xs text-[#6B6B6B] mt-1">
                  Enter your registered email address or verified phone number to receive a secure recovery code.
                </p>
              </div>

              {/* Delivery Channel Switcher */}
              <div className="mb-5">
                <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-2">
                  Delivery Method
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-[#F7F4EF] rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setChannel('email')}
                    className={`flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all ${
                      channel === 'email'
                        ? 'bg-white text-[#222222] shadow-sm'
                        : 'text-[#6B6B6B] hover:text-[#222222]'
                    }`}
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Email
                  </button>
                  <button
                    type="button"
                    onClick={() => setChannel('sms')}
                    className={`flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all ${
                      channel === 'sms'
                        ? 'bg-white text-[#222222] shadow-sm'
                        : 'text-[#6B6B6B] hover:text-[#222222]'
                    }`}
                  >
                    <Phone className="w-3.5 h-3.5" />
                    SMS
                  </button>
                </div>
              </div>

              <form onSubmit={handleRequestCode} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-2">
                    {channel === 'email' ? 'Registered Email Address' : 'Verified Phone Number'}
                  </label>
                  <div className="relative">
                    {channel === 'email' ? (
                      <Mail className="w-4 h-4 text-[#888888] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    ) : (
                      <Phone className="w-4 h-4 text-[#888888] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    )}
                    <input
                      type={channel === 'email' ? 'email' : 'tel'}
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={channel === 'email' ? 'name@university.edu' : '+91 98765 43210'}
                      className="block w-full pl-10 pr-4 py-3 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-[#222222] placeholder-[#888888] text-sm focus:outline-none focus:ring-2 focus:ring-[#F28C38] focus:border-[#F28C38] focus:bg-white transition"
                    />
                  </div>
                  {channel === 'sms' && (
                    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 space-y-1">
                      <p className="font-semibold flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        Notice regarding SMS recovery:
                      </p>
                      <p>SMS recovery requires a verified phone number and an upgraded SMS gateway. Trial Twilio accounts restrict custom message bodies. Please use <strong>Email</strong> recovery if SMS is unavailable.</p>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !identifier.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-[#F28C38] hover:bg-[#E07D2E] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#F28C38] shadow-lg shadow-[#F28C38]/25 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Sending Code...' : 'Send Verification Code'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* STEP 2: VERIFY 6-DIGIT CODE */}
          {step === 2 && (
            <div>
              <div className="mb-6 text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-[#80C2AF]/20 text-[#2D6A5D] rounded-2xl flex items-center justify-center">
                  <Shield className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-[#222222]">Enter 6-digit code</h2>
                <p className="text-xs text-[#6B6B6B] mt-1">
                  We sent a single-use code to{' '}
                  <span className="font-semibold text-[#222222]">{identifier}</span> via{' '}
                  {channel.toUpperCase()}.
                </p>
              </div>

              {/* Success notification banner on resend */}
              {successMessage && !error && (
                <div className="mb-5 bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-emerald-800 text-xs font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{successMessage}</span>
                </div>
              )}

              <form onSubmit={handleVerifyCode} className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider">
                      Verification Code
                    </label>
                    <div className="flex items-center gap-1.5 text-xs text-[#888888]">
                      <Clock className="w-3.5 h-3.5" />
                      <span className={validityTimeLeft < 60 ? 'text-red-500 font-semibold' : 'text-[#6B6B6B]'}>
                        {validityTimeLeft > 0 ? `Expires in ${formatTimer(validityTimeLeft)}` : 'Expired'}
                      </span>
                    </div>
                  </div>
                  <input
                    type="text"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="block w-full py-3 px-4 text-center tracking-[0.5em] font-mono text-xl font-bold bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-[#222222] placeholder-[#CCCCCC] focus:outline-none focus:ring-2 focus:ring-[#F28C38] focus:border-[#F28C38] focus:bg-white transition"
                  />
                  <p className="text-[11px] text-[#888888] mt-1.5 text-center">
                    Codes remain valid for 10 minutes and expire after 5 incorrect attempts.
                  </p>
                </div>

                {/* Timer expired: show clear recovery path */}
                {validityTimeLeft === 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                    <p className="text-xs font-semibold text-amber-800 mb-2">
                      Your verification code has expired.
                    </p>
                    <button
                      type="button"
                      onClick={doRequestCode}
                      disabled={loading || resendCooldown > 0}
                      className="text-xs font-bold text-[#F28C38] hover:text-[#E07D2E] disabled:opacity-50 transition"
                    >
                      {loading
                        ? 'Sending...'
                        : resendCooldown > 0
                        ? `Request a new code (${resendCooldown}s)`
                        : 'Request a new code'}
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || code.trim().length !== 6 || validityTimeLeft === 0}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-[#F28C38] hover:bg-[#E07D2E] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#F28C38] shadow-lg shadow-[#F28C38]/25 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Verifying...' : 'Verify Code'}
                  <ArrowRight className="w-4 h-4" />
                </button>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setCode('');
                      setError(null);
                      setSuccessMessage(null);
                      setResendCooldown(0);
                    }}
                    className="flex items-center gap-1 text-xs font-semibold text-[#6B6B6B] hover:text-[#222222] transition"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Change destination
                  </button>

                  <button
                    type="button"
                    onClick={doRequestCode}
                    disabled={loading || resendCooldown > 0}
                    className="text-xs font-semibold text-[#F28C38] hover:text-[#E07D2E] disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    {loading
                      ? 'Sending...'
                      : resendCooldown > 0
                      ? `Resend code (${resendCooldown}s)`
                      : 'Resend code'}
                  </button>
                </div>

                {/* Didn't receive guidance: show once initial 20s cooldown elapses */}
                {validityTimeLeft > 0 && resendCooldown === 0 && (
                  <div className="bg-[#F7F4EF] rounded-xl p-3 space-y-1.5">
                    <p className="text-[11px] font-semibold text-[#4A3832] flex items-center gap-1.5">
                      <AlertCircle className="w-3 h-3 text-[#888888] shrink-0" />
                      {"Didn't receive the code?"}
                    </p>
                    <ul className="text-[11px] text-[#6B6B6B] list-disc pl-5 space-y-0.5">
                      <li>Check your spam / junk folder</li>
                      <li>Make sure you entered the correct {channel === 'email' ? 'email address' : 'phone number'}</li>
                      <li>
                        <button
                          type="button"
                          onClick={() => {
                            setStep(1);
                            setCode('');
                            setError(null);
                            setSuccessMessage(null);
                            setResendCooldown(0);
                          }}
                          className="text-[#F28C38] font-semibold hover:underline"
                        >
                          Go back
                        </button>{' '}
                        to try a different recovery method
                      </li>
                    </ul>
                  </div>
                )}
              </form>
            </div>
          )}

          {/* STEP 3: NEW PASSWORD */}
          {step === 3 && (
            <div>
              <div className="mb-6 text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-[#F28C38]/10 text-[#F28C38] rounded-2xl flex items-center justify-center">
                  <Lock className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-[#222222]">Create new password</h2>
                <p className="text-xs text-[#6B6B6B] mt-1">
                  Choose a strong password with at least 8 characters.
                </p>
              </div>

              <form onSubmit={handleResetPassword} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-2">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#888888] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="block w-full pl-10 pr-4 py-3 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-[#222222] placeholder-[#888888] text-sm focus:outline-none focus:ring-2 focus:ring-[#F28C38] focus:border-[#F28C38] focus:bg-white transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#4A3832] uppercase tracking-wider mb-2">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#888888] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="block w-full pl-10 pr-4 py-3 bg-[#FBFAF8] border border-[#DDD7D2] rounded-xl text-[#222222] placeholder-[#888888] text-sm focus:outline-none focus:ring-2 focus:ring-[#F28C38] focus:border-[#F28C38] focus:bg-white transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !newPassword || !confirmPassword}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-[#F28C38] hover:bg-[#E07D2E] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#F28C38] shadow-lg shadow-[#F28C38]/25 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Updating Password...' : 'Reset Password'}
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* STEP 4: SUCCESS */}
          {step === 4 && (
            <div className="text-center py-4">
              <div className="w-14 h-14 mx-auto mb-4 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-[#222222]">Password updated!</h2>
              <p className="text-xs text-[#6B6B6B] mt-2 mb-6">
                Your password has been reset securely. Any unverified account verification status has been preserved. You can now sign in with your new credentials.
              </p>

              <Link
                href="/login"
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-[#F28C38] hover:bg-[#E07D2E] shadow-lg shadow-[#F28C38]/25 transition"
              >
                Sign in to SOET Connect
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}

          {/* Return to Login link */}
          {step !== 4 && (
            <div className="mt-6 text-center border-t border-[#DDD7D2] pt-5">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B6B6B] hover:text-[#222222] transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
