'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingStateProps {
  /** The descriptive loading message (e.g. "Loading student records") */
  message?: string;
  /** Custom wrapper class names for spacing/padding */
  className?: string;
  /** Whether this is a full-page screen loader */
  fullPage?: boolean;
}

/**
 * Animated 3 dots using the SOET orange accent with staggered pulsing.
 */
export function LoadingDots() {
  return (
    <span
      className="inline-flex tracking-wider text-[#F28C38] ml-0.5 font-bold select-none"
      aria-hidden="true"
    >
      <span className="loading-dot-1">.</span>
      <span className="loading-dot-2">.</span>
      <span className="loading-dot-3">.</span>
    </span>
  );
}

/**
 * Compact rotating spinner for active button states.
 */
export function ButtonSpinner({
  className = 'w-3.5 h-3.5 animate-spin',
}: {
  className?: string;
}) {
  return <Loader2 className={className} aria-hidden="true" />;
}

/**
 * Global SOET Connect Loading Component.
 * Displays centered, theme-consistent text with animated orange dots.
 */
export default function LoadingState({
  message = 'Loading',
  className = 'py-16',
  fullPage = false,
}: LoadingStateProps) {
  // Strip trailing periods if caller passed "Loading..."
  const cleanMessage = message.replace(/\.+$/, '').trim();

  const content = (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center text-xs font-semibold text-[#6B6B6B]"
    >
      <span>{cleanMessage}</span>
      <LoadingDots />
      <span className="sr-only">Loading...</span>
    </div>
  );

  if (fullPage) {
    return (
      <div className={`min-h-screen flex items-center justify-center bg-[#F7F4EF] ${className}`}>
        {content}
      </div>
    );
  }

  return (
    <div className={`w-full flex items-center justify-center text-center ${className}`}>
      {content}
    </div>
  );
}
