'use client';

import React, { useRef, useState } from 'react';
import {
  FileText,
  UploadCloud,
  X,
  RefreshCw,
  ExternalLink,
  Download,
  AlertCircle,
  FileSpreadsheet,
  FileCheck,
} from 'lucide-react';

export interface DocumentAttachmentData {
  name: string;
  type: string;
  size: number;
  url?: string;
  file?: File;
}

export interface DocumentAttachmentProps {
  label?: string;
  description?: string;
  helperText?: string;
  value?: DocumentAttachmentData | null;
  attachment?: DocumentAttachmentData | null;
  onChange: (attachment: DocumentAttachmentData | null) => void;
  disabled?: boolean;
  className?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx'];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export function formatFileSize(bytes: number): string {
  if (!bytes || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? `.${parts[parts.length - 1].toLowerCase()}` : '';
}

export function getFileCategory(filename: string, mimeType?: string): 'pdf' | 'doc' | 'other' {
  const ext = getFileExtension(filename);
  if (ext === '.pdf' || mimeType === 'application/pdf') return 'pdf';
  if (
    ext === '.doc' ||
    ext === '.docx' ||
    mimeType?.includes('word') ||
    mimeType?.includes('msword')
  ) {
    return 'doc';
  }
  return 'other';
}

/**
 * Reusable Document Attachment Form Component
 * Allows choosing, validating, displaying, replacing, and removing PDF/DOC/DOCX files up to 10MB.
 */
export default function DocumentAttachment({
  label = 'Details Document (Optional)',
  description,
  helperText,
  value,
  attachment: propAttachment,
  onChange,
  disabled = false,
  className = '',
}: DocumentAttachmentProps) {
  const attachment = value !== undefined ? value : propAttachment;
  const displayDescription =
    helperText ||
    description ||
    'Upload a PDF or Word document containing complete details, instructions, eligibility, schedule, or guidelines.';
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): string | null => {
    const ext = getFileExtension(file.name);
    const isExtensionAllowed = ALLOWED_EXTENSIONS.includes(ext);
    const isMimeAllowed = !file.type || ALLOWED_MIME_TYPES.includes(file.type);

    if (!isExtensionAllowed && !isMimeAllowed) {
      return 'Please upload a PDF, DOC, or DOCX file.';
    }

    if (file.size > MAX_FILE_SIZE) {
      return 'File size must be 10 MB or smaller.';
    }

    return null;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    // Create object URL for client preview/download demonstration
    const objectUrl = URL.createObjectURL(file);
    const ext = getFileExtension(file.name).replace('.', '').toUpperCase();

    onChange({
      name: file.name,
      type: ext || file.type || 'DOCUMENT',
      size: file.size,
      url: objectUrl,
      file,
    });

    if (inputRef.current) inputRef.current.value = '';
  };

  const handleRemove = () => {
    setError(null);
    if (attachment?.url && attachment.url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(attachment.url);
      } catch {
        // ignore
      }
    }
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleChooseClick = () => {
    setError(null);
    inputRef.current?.click();
  };

  const category = attachment ? getFileCategory(attachment.name, attachment.type) : 'other';

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleFileSelect}
        disabled={disabled}
        className="hidden"
        id="document-attachment-input"
        aria-label={label}
      />

      <div className="flex items-center justify-between">
        <label
          htmlFor="document-attachment-input"
          className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
        >
          {label}
        </label>
        <span className="text-[11px] font-medium text-slate-400">PDF / DOC / DOCX • Max 10 MB</span>
      </div>

      {!attachment ? (
        /* Empty / Upload State */
        <div
          onClick={disabled ? undefined : handleChooseClick}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
              e.preventDefault();
              handleChooseClick();
            }
          }}
          role="button"
          tabIndex={disabled ? -1 : 0}
          className={`group border-2 border-dashed border-[#DDD7D2] hover:border-[#F28C38] rounded-2xl p-5 text-center transition cursor-pointer bg-[#FBFAF8] hover:bg-orange-50/20 focus:outline-none focus:ring-2 focus:ring-[#F28C38] ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          <div className="flex flex-col items-center justify-center">
            <div className="w-10 h-10 rounded-xl bg-orange-100/60 text-[#F28C38] flex items-center justify-center mb-2.5 group-hover:scale-105 transition">
              <UploadCloud className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-[#4A3832]">
              Click to choose a document, or drag and drop
            </p>
            <p className="text-[11px] text-[#6B6B6B] mt-1 max-w-sm">{displayDescription}</p>
            <div className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-[#DDD7D2] group-hover:border-[#F28C38] text-slate-700 group-hover:text-[#F28C38] rounded-xl text-xs font-bold shadow-xs transition">
              <FileText className="w-3.5 h-3.5" />
              <span>Choose File</span>
            </div>
          </div>
        </div>
      ) : (
        /* Attached Document State */
        <div className="bg-white border border-[#DDD7D2] rounded-2xl p-4 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center font-bold text-xs ${
                category === 'pdf'
                  ? 'bg-red-50 text-red-600 border border-red-100'
                  : 'bg-blue-50 text-blue-600 border border-blue-100'
              }`}
            >
              {category === 'pdf' ? (
                <FileText className="w-5 h-5" />
              ) : (
                <FileSpreadsheet className="w-5 h-5" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p
                className="text-xs font-bold text-[#4A3832] truncate"
                title={attachment.name}
              >
                {attachment.name}
              </p>
              <p className="text-[11px] text-[#6B6B6B] flex items-center gap-2 mt-0.5">
                <span className="font-semibold uppercase tracking-wider">
                  {attachment.type || getFileExtension(attachment.name).replace('.', '').toUpperCase()}
                </span>
                <span>•</span>
                <span>{formatFileSize(attachment.size)}</span>
                <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                  <FileCheck className="w-3 h-3" /> Ready
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleChooseClick}
              disabled={disabled}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Replace document"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Replace</span>
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition cursor-pointer disabled:opacity-50"
              title="Remove document"
              aria-label="Remove document"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Inline Validation Error */}
      {error && (
        <div
          className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl mt-1 animate-fadeIn"
          role="alert"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Reusable Document Attachment Display Badge / View Component
 * Renders on student/admin/alumni cards when an attachment exists.
 */
export function DocumentAttachmentView({
  attachment,
  label = 'Details Document',
  className = '',
}: {
  attachment?: DocumentAttachmentData | null;
  label?: string;
  className?: string;
}) {
  if (!attachment || !attachment.name) {
    return null;
  }

  const category = getFileCategory(attachment.name, attachment.type);
  const isPdf = category === 'pdf';

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (attachment.url) {
      const a = document.createElement('a');
      a.href = attachment.url;
      a.download = attachment.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      alert(`Downloading document: ${attachment.name}`);
    }
  };

  const handleView = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (attachment.url) {
      window.open(attachment.url, '_blank', 'noopener,noreferrer');
    } else {
      alert(`Opening document preview for: ${attachment.name}`);
    }
  };

  return (
    <div
      className={`bg-slate-50 border border-slate-200/80 hover:border-slate-300 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${className}`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center font-bold text-xs ${
            isPdf
              ? 'bg-red-100 text-red-700'
              : 'bg-blue-100 text-blue-700'
          }`}
        >
          <FileText className="w-4 h-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-[#F28C38] uppercase tracking-wider">
              {label}
            </span>
          </div>
          <p
            className="text-xs font-bold text-slate-800 truncate"
            title={attachment.name}
          >
            {attachment.name}
          </p>
          {(attachment.type || attachment.size > 0) && (
            <p className="text-[10px] text-slate-500 mt-0.5">
              {attachment.type ? attachment.type.toUpperCase() : ''}
              {attachment.size > 0 ? ` • ${formatFileSize(attachment.size)}` : ''}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
        {isPdf && attachment.url && (
          <button
            type="button"
            onClick={handleView}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
            title="View in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
            <span>View</span>
          </button>
        )}
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
          title="Download file"
        >
          <Download className="w-3.5 h-3.5 text-[#F28C38]" />
          <span>Download</span>
        </button>
      </div>
    </div>
  );
}
