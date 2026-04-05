'use client';

interface Outputs {
  editedHwpx?: string | null;
  editedJson?: string | null;
  finalIdml?: string | null;
  finalPdf?: string | null;
  previewHtml?: string | null;
  finalPdfMode?: string | null;
  finalPdfMessage?: string | null;
  inddTemplate?: string | null;
}

interface VerificationBadgesProps {
  outputs: Outputs;
  status: string;
}

interface BadgeItem {
  key: keyof Outputs;
  label: string;
  color: 'green' | 'orange' | 'red' | 'blue' | 'gray';
}

const BADGES: BadgeItem[] = [
  { key: 'editedHwpx', label: '1차 수정 HWP', color: 'blue' },
  { key: 'editedJson', label: '편집 데이터 JSON', color: 'gray' },
  { key: 'finalIdml', label: 'IDML 생성', color: 'orange' },
  { key: 'finalPdf', label: 'PDF 생성', color: 'red' },
];

const COLOR_MAP = {
  green: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  red: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
  gray: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', dot: 'bg-gray-400' },
};

export default function VerificationBadges({ outputs, status }: VerificationBadgesProps) {
  if (status !== 'review' && status !== 'done' && status !== 'approving') return null;

  const availableBadges = BADGES.filter((b) => outputs[b.key]);
  if (availableBadges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {availableBadges.map((badge) => {
        const colors = COLOR_MAP[badge.color];
        return (
          <div
            key={badge.key}
            className={[
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium',
              colors.bg,
              colors.text,
              colors.border,
            ].join(' ')}
          >
            <span className={['w-1.5 h-1.5 rounded-full flex-shrink-0', colors.dot].join(' ')} />
            {badge.label}
          </div>
        );
      })}
    </div>
  );
}
