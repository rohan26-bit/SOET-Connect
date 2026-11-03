'use client';

import React, { useEffect } from 'react';
import {
  BriefcaseBusiness,
  Code2,
  ExternalLink,
  GraduationCap,
  Mail,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import { UserManagementItem } from '@/lib/services/adminService';

interface UserDetailsModalProps {
  user: UserManagementItem | null;
  onClose: () => void;
}

function formatDate(value?: string): string {
  if (!value) return 'Not provided';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Not provided';

  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

function displayValue(value?: string | number | null): string {
  if (value === null || value === undefined || String(value).trim() === '') {
    return 'Not provided';
  }
  return String(value);
}

function safeExternalUrl(value?: string): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  // Do not allow javascript:, data:, or other non-web URL schemes.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function DetailField({
  label,
  value,
  wide = false,
}: {
  label: string;
  value?: string | number | null;
  wide?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-[#EAE4DE] bg-white px-4 py-3 min-w-0 ${wide ? 'sm:col-span-2' : ''}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#9A8E85]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#4A3832] break-words whitespace-pre-wrap">
        {displayValue(value)}
      </p>
    </div>
  );
}

function ProfileLink({ label, value }: { label: string; value?: string }) {
  const href = safeExternalUrl(value);

  return (
    <div className="rounded-xl border border-[#EAE4DE] bg-white px-4 py-3 min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#9A8E85]">{label}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex max-w-full items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900 break-all"
        >
          <span>{value}</span>
          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
        </a>
      ) : (
        <p className="mt-1 text-sm font-semibold text-[#4A3832] break-words">
          {displayValue(value)}
        </p>
      )}
    </div>
  );
}

export default function UserDetailsModal({ user, onClose }: UserDetailsModalProps) {
  useEffect(() => {
    if (!user) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user, onClose]);

  if (!user) return null;

  const isAlumni = user.role === 'alumni';
  const verificationStatus = user.verification_status || (user.is_verified ? 'approved' : 'pending');
  const isActive = user.is_active !== false;
  const initials = (user.full_name || 'U')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#211814]/65 backdrop-blur-sm p-3 sm:p-6"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-details-title"
        className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-[#FBFAF8] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-[#EAE4DE] bg-white px-5 py-4 sm:px-7">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#F28C38]">
              Administrator • Complete Record
            </p>
            <h2 id="user-details-title" className="mt-1 text-xl font-black text-[#4A3832]">
              {isAlumni ? 'Alumni Details' : 'Student Details'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile details"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F2EEE9] text-[#6B5A50] transition hover:bg-[#E8E0D9]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-[#EAE4DE] bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex min-w-0 items-center gap-4">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.full_name}
                  className="h-16 w-16 shrink-0 rounded-2xl border border-[#EAE4DE] object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#F28C38] text-lg font-black text-white">
                  {initials || <UserRound className="h-6 w-6" />}
                </div>
              )}
              <div className="min-w-0">
                <h3 className="truncate text-lg font-black text-[#4A3832]">{user.full_name}</h3>
                <p className="mt-1 flex items-center gap-1.5 break-all text-xs text-[#776B63]">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  {user.email}
                </p>
                <p className="mt-1 text-[11px] text-[#9A8E85]">
                  {isAlumni ? 'Alumni account' : 'Student account'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 sm:justify-end">
              <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${verificationStatus.toLowerCase() === 'approved' ? 'bg-emerald-100 text-emerald-800' : verificationStatus.toLowerCase() === 'rejected' ? 'bg-rose-100 text-rose-800' : verificationStatus.toLowerCase() === 'suspended' ? 'bg-purple-100 text-purple-800' : 'bg-amber-100 text-amber-800'}`}>
                {verificationStatus}
              </span>
              <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {isActive ? 'Active account' : 'Suspended account'}
              </span>
            </div>
          </div>

          <section className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <UserRound className="h-4 w-4 text-[#F28C38]" />
              <h3 className="text-sm font-black text-[#4A3832]">Personal & Contact Information</h3>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DetailField label="Full Name" value={user.full_name} />
              <DetailField label="Email Address" value={user.email} />
              <DetailField label="Phone Number" value={user.phone} />
              <DetailField label="Phone Verification" value={user.phone ? (user.is_phone_verified ? 'Verified' : 'Not verified') : 'Not provided'} />
            </div>
          </section>

          <section className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-[#F28C38]" />
              <h3 className="text-sm font-black text-[#4A3832]">Academic Information</h3>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DetailField label={isAlumni ? 'Alumni ID / PRN' : 'Student ID / PRN'} value={isAlumni ? user.alumni_id : user.student_id} />
              <DetailField label="Department" value={user.department} />
              {isAlumni ? (
                <DetailField label="Degree" value={user.degree} />
              ) : (
                <>
                  <DetailField label="Course" value={user.course || user.course_or_company} />
                  <DetailField label="Current Academic Year" value={user.academic_year} />
                </>
              )}
              <DetailField label="Graduation Year" value={user.graduation_year} />
            </div>
          </section>

          {isAlumni && (
            <>
              <section className="mb-6">
                <div className="mb-3 flex items-center gap-2">
                  <BriefcaseBusiness className="h-4 w-4 text-[#F28C38]" />
                  <h3 className="text-sm font-black text-[#4A3832]">Professional Information</h3>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <DetailField label="Company" value={user.company} />
                  <DetailField label="Designation" value={user.designation} />
                  <DetailField label="Industry" value={user.industry} />
                  <DetailField label="Work Location" value={user.location} />
                </div>
              </section>

              <section className="mb-6">
                <div className="mb-3 flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-[#F28C38]" />
                  <h3 className="text-sm font-black text-[#4A3832]">Skills</h3>
                </div>
                {user.skills?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {user.skills.map((skill, index) => (
                      <span key={`${skill}-${index}`} className="rounded-lg bg-[#F3EEE8] px-3 py-1.5 text-xs font-semibold text-[#665348]">
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#9A8E85]">No skills provided.</p>
                )}
              </section>

              <section className="mb-6">
                <h3 className="mb-3 text-sm font-black text-[#4A3832]">Professional Bio</h3>
                <div className="rounded-xl border border-[#EAE4DE] bg-white px-4 py-3">
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#5E5149]">
                    {user.bio || 'No bio provided.'}
                  </p>
                </div>
              </section>

              <section className="mb-6">
                <div className="mb-3 flex items-center gap-2">
                  <ExternalLink className="h-4 w-4 text-[#F28C38]" />
                  <h3 className="text-sm font-black text-[#4A3832]">Online Profiles</h3>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <ProfileLink label="LinkedIn" value={user.linkedin} />
                  <ProfileLink label="GitHub" value={user.github} />
                  <ProfileLink label="Personal Website" value={user.website} />
                </div>
              </section>
            </>
          )}

          <section>
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#F28C38]" />
              <h3 className="text-sm font-black text-[#4A3832]">Account & Verification Record</h3>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DetailField label="Account Role" value={user.role} />
              <DetailField label="Verification Status" value={verificationStatus} />
              <DetailField label="Account Access" value={isActive ? 'Active' : 'Suspended'} />
              <DetailField label="Verified" value={user.is_verified ? 'Yes' : 'No'} />
              <DetailField label="Registration Date" value={formatDate(user.created_at)} />
              <DetailField label="Last Updated" value={formatDate(user.updated_at)} />
              <DetailField label="System User ID" value={user.id} wide />
            </div>
          </section>
        </div>

        <footer className="flex justify-end border-t border-[#EAE4DE] bg-white px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[#4A3832] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#5A453D]"
          >
            Close Details
          </button>
        </footer>
      </section>
    </div>
  );
}
