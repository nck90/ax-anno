'use client';

import CategoryTable from './CategoryTable';

interface Header {
  court?: string;
  department?: string;
  saleDate?: string;
  saleDecisionDate?: string;
  salePlace?: string;
  judge?: string;
  publishDate?: string;
}

interface EditedAuction {
  header?: Header;
  categories?: Array<{
    name: string;
    items: Array<{
      caseNumber: string;
      duplicateInfo?: string;
      properties: Array<{
        propertyNumber: string;
        location: string;
        usage: string;
        appraisalPrice: string;
        minimumPrice: string;
        remarks: string;
      }>;
    }>;
  }>;
}

interface Outputs {
  editedHwpx?: string | null;
  editedJson?: string | null;
  finalIdml?: string | null;
  finalPdf?: string | null;
  previewHtml?: string | null;
}

interface ReviewPanelProps {
  editedData: EditedAuction;
  outputs: Outputs;
  status: 'review' | 'approving' | 'done';
  onApprove: () => void;
}

function InfoBadge({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-400 font-medium">{label}</span>
      <span className="text-sm text-gray-800">{value}</span>
    </div>
  );
}

export default function ReviewPanel({ editedData, outputs, status, onApprove }: ReviewPanelProps) {
  const header = editedData?.header;
  const categories = editedData?.categories ?? [];
  const totalItems = categories.reduce((sum, cat) => sum + (cat.items?.length ?? 0), 0);

  return (
    <div className="animate-slide-up space-y-5">
      {/* Header info card */}
      {header && Object.values(header).some(Boolean) && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">경매 기본 정보</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <InfoBadge label="법원" value={header.court} />
            <InfoBadge label="담당부" value={header.department} />
            <InfoBadge label="매각기일" value={header.saleDate} />
            <InfoBadge label="매각결정기일" value={header.saleDecisionDate} />
            <InfoBadge label="매각장소" value={header.salePlace} />
            <InfoBadge label="판사" value={header.judge} />
            <InfoBadge label="공고일자" value={header.publishDate} />
          </div>
        </div>
      )}

      {/* Summary + action bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{categories.length}개</span> 카테고리,{' '}
            <span className="font-semibold text-gray-900">{totalItems}건</span> 사건
          </p>
        </div>

        {status === 'review' && (
          <button
            onClick={onApprove}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 active:scale-95 transition-all duration-150 shadow-sm shadow-emerald-200 hover:shadow-emerald-300"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            승인 및 PDF 생성
          </button>
        )}

        {status === 'done' && (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 text-sm font-semibold rounded-xl border border-emerald-200">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            승인 완료
          </div>
        )}
      </div>

      {/* Categories */}
      <div className="space-y-3">
        {categories.map((cat, ci) => (
          <CategoryTable
            key={ci}
            name={cat.name}
            items={cat.items ?? []}
            defaultOpen={ci === 0}
          />
        ))}
      </div>
    </div>
  );
}
