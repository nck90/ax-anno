'use client';

import { useState, useRef, useEffect } from 'react';

interface EditableFieldProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  multiline?: boolean;
  placeholder?: string;
}

export default function EditableField({
  value,
  onChange,
  className = '',
  multiline = false,
  placeholder = '비어있음',
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleStart = () => {
    setDraft(value);
    setEditing(true);
  };

  const handleSave = () => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  };

  const handleCancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  if (editing) {
    const baseClass =
      'w-full px-1.5 py-1 border border-blue-400 rounded bg-white text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-500 shadow-sm';

    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className={`${baseClass} resize-y min-h-[3em] ${className}`}
          rows={3}
        />
      );
    }
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`${baseClass} ${className}`}
      />
    );
  }

  return (
    <span
      onClick={handleStart}
      className={[
        'cursor-text rounded px-0.5 py-0.5 transition-all duration-150 inline-block min-w-[1em]',
        'hover:bg-amber-50 hover:outline hover:outline-1 hover:outline-amber-300',
        'group/editable relative',
        className,
      ].join(' ')}
      title="클릭하여 수정"
    >
      {value || <span className="text-gray-300 italic text-xs">{placeholder}</span>}
      <svg
        className="inline-block w-2.5 h-2.5 ml-0.5 text-gray-300 opacity-0 group-hover/editable:opacity-100 transition-opacity"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"
        />
      </svg>
    </span>
  );
}
