'use client';

import React, { useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  leadingIcon?: ReactNode;
  wrapperClassName?: string;
}

/**
 * Password field that remains masked by default and can be temporarily revealed.
 * The toggle is keyboard accessible and never submits the surrounding form.
 */
export default function PasswordInput({
  leadingIcon,
  wrapperClassName = '',
  className = '',
  ...inputProps
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className={`relative ${wrapperClassName}`.trim()}>
      {leadingIcon}
      <input
        {...inputProps}
        type={isVisible ? 'text' : 'password'}
        className={`${className} pr-11`.trim()}
      />
      <button
        type="button"
        onClick={() => setIsVisible((visible) => !visible)}
        aria-label={isVisible ? 'Hide password' : 'Show password'}
        aria-pressed={isVisible}
        title={isVisible ? 'Hide password' : 'Show password'}
        className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#888888] transition hover:bg-[#F1ECE7] hover:text-[#4A3832] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F28C38] focus-visible:ring-offset-1"
      >
        {isVisible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}
