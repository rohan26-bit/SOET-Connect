'use client';

import React, { useEffect, useState } from 'react';
import { useAccessibleDialog } from '@/hooks/useAccessibleDialog';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { UserManagementItem } from '@/lib/services/adminService';

interface DeleteUserConfirmationModalProps {
  user: UserManagementItem | null;
  isDeleting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export default function DeleteUserConfirmationModal({
  user,
  isDeleting,
  error,
  onClose,
  onConfirm,
}: DeleteUserConfirmationModalProps) {
  const dialogRef = useAccessibleDialog<HTMLDivElement>(Boolean(user), () => { if (!isDeleting) onClose(); });
  const [confirmation, setConfirmation] = useState('');

  useEffect(() => {
    setConfirmation('');
  }, [user?.id]);

  if (!user) return null;

  const expectedEmail = user.email.trim().toLowerCase();
  const emailMatches = confirmation.trim().toLowerCase() === expectedEmail;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#241A17]/60 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !isDeleting) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        aria-describedby="delete-account-description"
        className="w-full max-w-lg rounded-3xl border border-rose-100 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 id="delete-account-title" className="text-lg font-black text-[#4A3832]">
                Permanently delete account?
              </h2>
              <p className="mt-1 text-xs text-[#6B6B6B]">
                This action cannot be undone.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            aria-label="Close delete confirmation"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div id="delete-account-description" className="mt-5 rounded-2xl border border-rose-100 bg-rose-50/70 p-4">
          <p className="text-sm font-bold text-[#4A3832]">{user.full_name}</p>
          <p className="mt-0.5 text-xs text-[#6B6B6B]">{user.email}</p>
          <p className="mt-3 text-xs leading-relaxed text-rose-800">
            The account and its profile will be deleted. Related records such as applications,
            event registrations, notifications, messages and achievements may also be removed
            by database cascade rules. Existing jobs, events or announcements may remain with
            the author's account link cleared.
          </p>
        </div>

        <label htmlFor="delete-account-confirmation" className="mt-5 block text-xs font-bold text-[#4A3832]">
          To confirm, type this account's email address:
        </label>
        <input
          id="delete-account-confirmation"
          type="email"
          autoComplete="off"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder={user.email}
          disabled={isDeleting}
          className="mt-2 w-full rounded-xl border border-[#DDD7D2] bg-[#FBFAF8] px-3.5 py-3 text-sm text-[#4A3832] outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100 disabled:opacity-60"
        />

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-xl border border-[#DDD7D2] px-4 py-2.5 text-xs font-bold text-[#4A3832] transition hover:bg-[#F7F4EF] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={!emailMatches || isDeleting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting account...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Delete permanently
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
