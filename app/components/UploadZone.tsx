'use client';

import { useState, useCallback, useRef } from 'react';

interface UploadZoneProps {
  file: File | null;
  onFileSelect: (file: File) => void;
  onProcess: () => void;
  isDisabled: boolean;
  isLoading: boolean;
  loadingLabel: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon() {
  return (
    <svg className="w-12 h-12" viewBox="0 0 48 48" fill="none">
      <rect x="8" y="4" width="28" height="36" rx="3" fill="#DBEAFE" />
      <rect x="8" y="4" width="28" height="36" rx="3" stroke="#93C5FD" strokeWidth="1.5" />
      <path d="M28 4L36 12" stroke="#93C5FD" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="28" y="4" width="8" height="8" rx="1" fill="#BFDBFE" />
      <rect x="14" y="18" width="16" height="2" rx="1" fill="#93C5FD" />
      <rect x="14" y="23" width="20" height="2" rx="1" fill="#BFDBFE" />
      <rect x="14" y="28" width="12" height="2" rx="1" fill="#BFDBFE" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}

export default function UploadZone({
  file,
  onFileSelect,
  onProcess,
  isDisabled,
  isLoading,
  loadingLabel,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped && (dropped.name.endsWith('.hwp') || dropped.name.endsWith('.hwpx'))) {
        onFileSelect(dropped);
      }
    },
    [onFileSelect]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) onFileSelect(selected);
    },
    [onFileSelect]
  );

  return (
    <div className="animate-slide-up">
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !file && inputRef.current?.click()}
        className={[
          'relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer',
          isDragging
            ? 'border-blue-400 bg-blue-50 scale-[1.01]'
            : file
            ? 'border-blue-200 bg-blue-50/50 cursor-default'
            : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30',
        ].join(' ')}
        role="button"
        tabIndex={0}
        aria-label="HWP 파일 업로드 영역"
        onKeyDown={(e) => e.key === 'Enter' && !file && inputRef.current?.click()}
      >
        <div className="flex flex-col items-center justify-center py-12 px-6">
          {file ? (
            <>
              <FileIcon />
              <div className="mt-4 text-center">
                <p className="text-base font-semibold text-gray-900 truncate max-w-xs">{file.name}</p>
                <p className="text-sm text-gray-500 mt-1">{formatBytes(file.size)}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
                className="mt-4 text-xs text-blue-500 hover:text-blue-700 hover:underline transition-colors"
              >
                다른 파일 선택
              </button>
            </>
          ) : (
            <>
              <UploadIcon />
              <div className="mt-4 text-center">
                <p className="text-base font-medium text-gray-700">
                  파일을 드래그하거나{' '}
                  <span className="text-blue-600 font-semibold">클릭하여 선택</span>
                </p>
                <p className="text-sm text-gray-400 mt-1">HWP, HWPX 파일 지원</p>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="px-2.5 py-1 bg-gray-100 rounded-md text-xs font-mono text-gray-500">.hwp</span>
                <span className="px-2.5 py-1 bg-gray-100 rounded-md text-xs font-mono text-gray-500">.hwpx</span>
              </div>
            </>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".hwp,.hwpx"
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
        />
      </div>

      {/* Action button */}
      <div className="mt-4 flex justify-end">
        <button
          onClick={onProcess}
          disabled={isDisabled}
          className={[
            'inline-flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200',
            isDisabled
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95 shadow-sm shadow-blue-200 hover:shadow-md hover:shadow-blue-200',
          ].join(' ')}
          aria-label={isLoading ? loadingLabel : 'AI 편집 시작'}
        >
          {isLoading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              {loadingLabel}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              AI 편집 시작
            </>
          )}
        </button>
      </div>
    </div>
  );
}
