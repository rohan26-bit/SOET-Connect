'use client';

import { useEffect, useState } from 'react';

interface PostedAtProps {
  date?: string | null;
  className?: string;
  prefix?: string;
}

/**
 * Shows when content was submitted, independently of its event date or deadline.
 * The deterministic absolute date is rendered first to avoid hydration mismatches,
 * then upgraded to a live relative label after the component mounts.
 */
function formatAbsoluteDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';

  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

function formatRelativeDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';

  const differenceSeconds = (date.getTime() - Date.now()) / 1000;
  const absoluteSeconds = Math.abs(differenceSeconds);

  if (absoluteSeconds < 60) return 'just now';

  const relative = new Intl.RelativeTimeFormat('en-IN', {
    numeric: 'always',
    style: 'long',
  });

  if (absoluteSeconds < 60 * 60) {
    return relative.format(Math.round(differenceSeconds / 60), 'minute');
  }

  if (absoluteSeconds < 24 * 60 * 60) {
    return relative.format(Math.round(differenceSeconds / (60 * 60)), 'hour');
  }

  if (absoluteSeconds < 30 * 24 * 60 * 60) {
    return relative.format(Math.round(differenceSeconds / (24 * 60 * 60)), 'day');
  }

  return formatAbsoluteDate(value);
}

export default function PostedAt({
  date,
  className = 'text-[11px] text-slate-400',
  prefix = 'Posted',
}: PostedAtProps) {
  const [label, setLabel] = useState(() => (date ? formatAbsoluteDate(date) : ''));

  useEffect(() => {
    if (!date || !formatAbsoluteDate(date)) {
      setLabel('');
      return;
    }

    const updateLabel = () => setLabel(formatRelativeDate(date));
    updateLabel();

    const intervalId = window.setInterval(updateLabel, 60_000);
    return () => window.clearInterval(intervalId);
  }, [date]);

  if (!date || !label) return null;

  const parsedDate = new Date(date);
  if (!Number.isFinite(parsedDate.getTime())) return null;

  const fullDate = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(parsedDate);

  return (
    <time
      dateTime={parsedDate.toISOString()}
      title={`Posted on ${fullDate} (IST)`}
      className={className}
    >
      {prefix} {label}
    </time>
  );
}
