'use client';

import { useState, useRef, useCallback } from 'react';
import EditableField from './EditableField';

// ─── Types ──────────────────────────────────────────────────

interface Header {
  court?: string;
  department?: string;
  saleDate?: string;
  saleDecisionDate?: string;
  salePlace?: string;
  judge?: string;
  publishDate?: string;
}

interface Property {
  propertyNumber: string;
  location: string;
  usage: string;
  appraisalPrice: string;
  minimumPrice: string;
  remarks: string;
}

interface AuctionItem {
  caseNumber: string;
  duplicateInfo?: string;
  properties: Property[];
}

interface Category {
  name: string;
  items: AuctionItem[];
}

interface EditedAuction {
  header?: Header;
  categories?: Category[];
}

interface Outputs {
  editedHwp?: string | null;
  editedJson?: string | null;
  finalIdml?: string | null;
  finalPdf?: string | null;
  previewHtml?: string | null;
  finalPdfMode?: string | null;
  finalPdfMessage?: string | null;
  inddTemplate?: string | null;
}

interface AiStatus {
  mode: 'applied' | 'disabled' | 'fallback';
  reason: string;
  appliedCount: number;
}

interface VerificationCheck {
  id?: string;
  name: string;
  passed: boolean;
  detail?: string;
  message?: string;
}

interface HwpWorkspaceProps {
  originalText: string;
  editedData: EditedAuction;
  onEditedDataChange: (data: EditedAuction) => void;
  outputs: Outputs;
  status: 'review' | 'approving' | 'done';
  onApprove: () => void;
  onBack: () => void;
  fileName?: string;
  originalFile?: string;
  editedFile?: string;
  verification?: VerificationCheck[];
  aiPolished?: boolean;
  aiStatus?: AiStatus;
}

type ViewMode = 'compare' | 'edited' | 'original';

// ─── Helper ─────────────────────────────────────────────────

function countItems(data: EditedAuction): { categories: number; cases: number; properties: number } {
  const cats = data.categories ?? [];
  let cases = 0;
  let properties = 0;
  for (const cat of cats) {
    cases += cat.items?.length ?? 0;
    for (const item of cat.items ?? []) {
      properties += item.properties?.length ?? 0;
    }
  }
  return { categories: cats.length, cases, properties };
}

// ─── Toolbar ────────────────────────────────────────────────

function WorkspaceToolbar({
  viewMode,
  onViewModeChange,
  stats,
  editCount,
  outputs,
  status,
  onApprove,
  onBack,
}: {
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  stats: { categories: number; cases: number; properties: number };
  editCount: number;
  outputs: Outputs;
  status: string;
  onApprove: () => void;
  onBack: () => void;
}) {
  const modes: { key: ViewMode; label: string }[] = [
    { key: 'compare', label: '비교' },
    { key: 'edited', label: '편집본' },
    { key: 'original', label: '원본' },
  ];

  return (
    <div className="h-11 bg-[var(--ws-surface)] border-b border-[var(--ws-border)] flex items-center justify-between px-4 flex-shrink-0">
      {/* Left: back + stats */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-[var(--ws-text-muted)] hover:text-[var(--ws-text)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          돌아가기
        </button>

        <div className="h-5 w-px bg-[var(--ws-border)]" />

        <div className="flex items-center gap-3 text-xs text-[var(--ws-text-muted)]">
          <span>
            <span className="font-semibold text-[var(--ws-text)]">{stats.categories}</span> 카테고리
          </span>
          <span>
            <span className="font-semibold text-[var(--ws-text)]">{stats.cases}</span> 사건
          </span>
          <span>
            <span className="font-semibold text-[var(--ws-text)]">{stats.properties}</span> 물건
          </span>
          {editCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 border border-amber-800 font-medium">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
              수정 {editCount}건
            </span>
          )}
        </div>
      </div>

      {/* Center: view mode tabs */}
      <div className="flex items-center bg-[var(--ws-bg)] rounded-md border border-[var(--ws-border)] p-0.5">
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => onViewModeChange(m.key)}
            className={[
              'px-3.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150',
              viewMode === m.key
                ? 'bg-[var(--ws-surface-raised)] text-white shadow-sm'
                : 'text-[var(--ws-text-muted)] hover:text-[var(--ws-text)]',
            ].join(' ')}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2.5">
        {status === 'review' && (
          <button
            onClick={onApprove}
            className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 active:scale-95 transition-all shadow-lg shadow-emerald-900/30"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            승인 및 PDF 생성
          </button>
        )}

        {status === 'done' && (
          <>
            {outputs.finalPdf && (
              <a
                href={outputs.finalPdf}
                download
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 bg-red-900/30 border border-red-800 rounded-lg hover:bg-red-900/50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                PDF 다운로드
              </a>
            )}
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/40 text-emerald-400 text-xs font-semibold rounded-lg border border-emerald-800">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              승인 완료
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── HWP Document Preview Panel (iframe) ────────────────────

function HwpPreviewPanel({ file, type, label }: { file?: string; type: 'original' | 'edited'; label: string }) {
  if (!file) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--ws-bg)] text-[var(--ws-text-muted)] text-sm">
        {label} 파일을 불러올 수 없습니다.
      </div>
    );
  }

  const src = `/api/hwp-preview?file=${encodeURIComponent(file)}&type=${type}`;

  return (
    <div className="h-full bg-[var(--doc-bg)]">
      <iframe
        src={src}
        className="w-full h-full border-0"
        title={label}
        sandbox="allow-same-origin"
      />
    </div>
  );
}

// ─── Original Document Panel (fallback for plain text) ──────

function OriginalPanel({ text }: { text: string }) {
  return (
    <div className="workspace-panel-scroll h-full overflow-auto bg-gray-100 p-6">
      <div className="workspace-paper max-w-2xl mx-auto">
        <div className="p-8">
          <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-200">
            <div className="w-6 h-6 rounded bg-gray-200 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">원본 문서</span>
          </div>
          <pre className="text-xs leading-[1.8] text-gray-700 whitespace-pre-wrap break-words font-[inherit]">
            {text}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ─── Edited Document Panel ──────────────────────────────────

function HeaderField({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-gray-400 font-medium w-16 flex-shrink-0">{label}</span>
      <EditableField value={value} onChange={onChange} className="text-xs text-gray-800" />
    </div>
  );
}

function EditedPanel({
  data,
  onChange,
}: {
  data: EditedAuction;
  onChange: (data: EditedAuction) => void;
}) {
  const header = data.header;
  const categories = data.categories ?? [];

  const updateHeader = (field: keyof Header, value: string) => {
    const next = structuredClone(data);
    if (!next.header) next.header = {};
    (next.header as Record<string, string>)[field] = value;
    onChange(next);
  };

  const updateProperty = (ci: number, ii: number, pi: number, field: keyof Property, value: string) => {
    const next = structuredClone(data);
    next.categories![ci].items[ii].properties[pi][field] = value;
    onChange(next);
  };

  const updateCaseNumber = (ci: number, ii: number, value: string) => {
    const next = structuredClone(data);
    next.categories![ci].items[ii].caseNumber = value;
    onChange(next);
  };

  const updateDuplicateInfo = (ci: number, ii: number, value: string) => {
    const next = structuredClone(data);
    next.categories![ci].items[ii].duplicateInfo = value;
    onChange(next);
  };

  return (
    <div className="workspace-panel-scroll h-full overflow-auto bg-gray-100 p-6">
      <div className="workspace-paper max-w-3xl mx-auto">
        <div className="p-8">
          {/* Document badge */}
          <div className="flex items-center gap-2 mb-6 pb-4 border-b border-blue-100">
            <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <span className="text-xs font-medium text-blue-600 uppercase tracking-wider">편집본</span>
            <span className="text-xs text-gray-400 ml-auto">클릭하여 수정</span>
          </div>

          {/* Header section */}
          {header && Object.values(header).some(Boolean) && (
            <div className="mb-8">
              <div className="text-center mb-4">
                {header.court && (
                  <h2 className="text-base font-bold text-gray-900 mb-1">
                    <EditableField
                      value={header.court}
                      onChange={(v) => updateHeader('court', v)}
                    />
                  </h2>
                )}
                {header.department && (
                  <p className="text-sm text-gray-600">
                    <EditableField
                      value={header.department}
                      onChange={(v) => updateHeader('department', v)}
                    />
                  </p>
                )}
              </div>
              <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-2">
                <HeaderField label="매각기일" value={header.saleDate} onChange={(v) => updateHeader('saleDate', v)} />
                <HeaderField label="매각결정" value={header.saleDecisionDate} onChange={(v) => updateHeader('saleDecisionDate', v)} />
                <HeaderField label="매각장소" value={header.salePlace} onChange={(v) => updateHeader('salePlace', v)} />
                <HeaderField label="판사" value={header.judge} onChange={(v) => updateHeader('judge', v)} />
                <HeaderField label="공고일자" value={header.publishDate} onChange={(v) => updateHeader('publishDate', v)} />
              </div>
            </div>
          )}

          {/* Categories + Tables */}
          <div className="space-y-6">
            {categories.map((cat, ci) => (
              <div key={ci}>
                {/* Category header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-bold text-gray-900 bg-gray-100 px-3 py-1 rounded-md border border-gray-200">
                    {cat.name}
                  </span>
                  <span className="text-xs text-gray-400">
                    {cat.items.length}건
                  </span>
                </div>

                {/* Items */}
                <div className="space-y-4">
                  {cat.items.map((item, ii) => (
                    <div key={ii} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* Case number bar */}
                      <div className="bg-gray-50 px-4 py-2 flex items-center gap-2 border-b border-gray-200">
                        <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          <EditableField
                            value={item.caseNumber}
                            onChange={(v) => updateCaseNumber(ci, ii, v)}
                          />
                        </span>
                        {item.duplicateInfo && (
                          <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                            <EditableField
                              value={item.duplicateInfo}
                              onChange={(v) => updateDuplicateInfo(ci, ii, v)}
                            />
                          </span>
                        )}
                      </div>

                      {/* Properties table */}
                      {item.properties.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50/80 border-b border-gray-100">
                                <th className="text-left px-3 py-2 text-gray-500 font-medium w-8">No.</th>
                                <th className="text-left px-3 py-2 text-gray-500 font-medium min-w-[200px]">소재지 및 면적</th>
                                <th className="text-left px-3 py-2 text-gray-500 font-medium w-16">용도</th>
                                <th className="text-right px-3 py-2 text-gray-500 font-medium w-24">감정가</th>
                                <th className="text-right px-3 py-2 text-gray-500 font-medium w-24">최저가</th>
                                <th className="text-left px-3 py-2 text-gray-500 font-medium min-w-[120px]">비고</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {item.properties.map((p, pi) => (
                                <tr key={pi} className="hover:bg-blue-50/30 transition-colors">
                                  <td className="px-3 py-2 text-gray-400 font-mono">
                                    {p.propertyNumber || pi + 1}
                                  </td>
                                  <td className="px-3 py-2 text-gray-800 leading-snug">
                                    <EditableField
                                      value={p.location}
                                      onChange={(v) => updateProperty(ci, ii, pi, 'location', v)}
                                      multiline
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">
                                      <EditableField
                                        value={p.usage || '-'}
                                        onChange={(v) => updateProperty(ci, ii, pi, 'usage', v)}
                                      />
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono text-gray-700">
                                    <EditableField
                                      value={p.appraisalPrice}
                                      onChange={(v) => updateProperty(ci, ii, pi, 'appraisalPrice', v)}
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700">
                                    <EditableField
                                      value={p.minimumPrice}
                                      onChange={(v) => updateProperty(ci, ii, pi, 'minimumPrice', v)}
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-gray-600 leading-snug">
                                    <EditableField
                                      value={p.remarks || '-'}
                                      onChange={(v) => updateProperty(ci, ii, pi, 'remarks', v)}
                                      multiline
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Resizable Divider ──────────────────────────────────────

function useDragResize(initialRatio: number) {
  const [ratio, setRatio] = useState(initialRatio);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const newRatio = Math.min(0.8, Math.max(0.2, x / rect.width));
      setRatio(newRatio);
    };

    const handleMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, []);

  return { ratio, containerRef, handleMouseDown };
}

// ─── Main Workspace ─────────────────────────────────────────

// ─── Verification & Status Bar ─────────────────────────────

function StatusBar({
  verification,
  aiPolished,
  aiStatus,
  outputs,
}: {
  verification?: VerificationCheck[];
  aiPolished?: boolean;
  aiStatus?: AiStatus;
  outputs: Outputs;
}) {
  const checks = verification ?? [];
  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.filter((c) => !c.passed).length;
  const total = checks.length;

  if (total === 0 && aiPolished !== false && !outputs.finalPdfMode) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-[var(--ws-surface)] border-b border-[var(--ws-border)] flex-shrink-0">
      {/* AI status */}
      {aiPolished === false && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-900/40 text-amber-300 border border-amber-800">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          AI 축약 미적용
        </span>
      )}
      {aiPolished === true && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-900/40 text-blue-300 border border-blue-800">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          AI 축약 적용
        </span>
      )}
      {aiStatus?.reason && (
        <span className="text-xs text-[var(--ws-text-muted)] truncate max-w-[420px]" title={aiStatus.reason}>
          {aiStatus.reason}
        </span>
      )}

      {outputs.finalPdfMode && (
        <>
          <div className="h-4 w-px bg-[var(--ws-border)]" />
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-900/40 text-red-300 border border-red-800">
            템플릿 PDF
          </span>
          <span className="text-xs text-[var(--ws-text-muted)] truncate max-w-[360px]" title={outputs.finalPdfMessage || outputs.inddTemplate || ''}>
            {outputs.finalPdfMessage || outputs.inddTemplate}
          </span>
        </>
      )}

      {/* Verification */}
      {total > 0 && (
        <>
          <div className="h-4 w-px bg-[var(--ws-border)]" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--ws-text-muted)] font-medium">검증</span>
            {passed > 0 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-900/40 text-emerald-400 border border-emerald-800">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {passed}
              </span>
            )}
            {failed > 0 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-red-900/40 text-red-400 border border-red-800">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                {failed}
              </span>
            )}
          </div>
          {/* Failed check details */}
          {failed > 0 && (
            <div className="flex items-center gap-1.5 ml-1">
              {checks.filter((c) => !c.passed).slice(0, 3).map((c, i) => (
                <span key={i} className="text-xs text-red-400" title={c.detail || c.message}>
                  {c.name}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function HwpWorkspace({
  originalText,
  editedData,
  onEditedDataChange,
  outputs,
  status,
  onApprove,
  onBack,
  fileName,
  originalFile,
  editedFile,
  verification,
  aiPolished,
  aiStatus,
}: HwpWorkspaceProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('compare');
  const [editCount, setEditCount] = useState(0);
  const { ratio, containerRef, handleMouseDown } = useDragResize(0.45);

  const stats = countItems(editedData);

  const handleEditedChange = useCallback(
    (data: EditedAuction) => {
      setEditCount((c) => c + 1);
      onEditedDataChange(data);
    },
    [onEditedDataChange]
  );

  const showOriginal = viewMode === 'compare' || viewMode === 'original';
  const showEdited = viewMode === 'compare' || viewMode === 'edited';

  return (
    <div className="fixed inset-0 z-50 flex flex-col workspace-root animate-scale-in">
      {/* Header */}
      <div className="h-10 bg-[var(--ws-bg)] border-b border-[var(--ws-border)] flex items-center px-4 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div>
            <span className="text-xs text-[var(--ws-text-muted)]">법원경매공고</span>
            <span className="text-xs text-[var(--ws-text-muted)] mx-1">/</span>
            <span className="text-xs font-semibold text-[var(--ws-text)]">
              {fileName || '문서'}
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <WorkspaceToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        stats={stats}
        editCount={editCount}
        outputs={outputs}
        status={status}
        onApprove={onApprove}
        onBack={onBack}
      />

      {/* Status bar: verification + AI */}
      <StatusBar verification={verification} aiPolished={aiPolished} aiStatus={aiStatus} outputs={outputs} />

      {/* Panel headers */}
      <div className="flex flex-shrink-0 border-b border-[var(--ws-border)] bg-[var(--ws-surface)]">
        {showOriginal && (
          <div
            className="flex items-center gap-2 px-4 py-2.5 border-r border-[var(--ws-border)]"
            style={{ width: viewMode === 'compare' ? `${ratio * 100}%` : '100%' }}
          >
            <div className="w-2.5 h-2.5 rounded-sm bg-[var(--doc-original-tint)] border border-[var(--border-strong)]" />
            <span className="text-xs font-medium text-[var(--ws-text-muted)]">원본 한글 문서</span>
          </div>
        )}
        {showEdited && (
          <div
            className="flex items-center gap-2 px-4 py-2.5"
            style={{ width: viewMode === 'compare' ? `${(1 - ratio) * 100}%` : '100%' }}
          >
            <div className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
            <span className="text-xs font-semibold text-[var(--ws-text)]">편집 한글 문서</span>
          </div>
        )}
      </div>

      {/* Split panels */}
      <div ref={containerRef} className="flex flex-1 min-h-0">
        {showOriginal && (
          <div
            className="h-full overflow-hidden"
            style={{ width: viewMode === 'compare' ? `${ratio * 100}%` : '100%' }}
          >
            {originalFile ? (
              <HwpPreviewPanel file={originalFile} type="original" label="원본 한글 문서" />
            ) : (
              <OriginalPanel text={originalText} />
            )}
          </div>
        )}

        {/* Drag handle */}
        {viewMode === 'compare' && (
          <div
            onMouseDown={handleMouseDown}
            className="w-1.5 bg-[var(--ws-border)] hover:bg-blue-500 active:bg-blue-600 cursor-col-resize transition-colors relative flex-shrink-0 group"
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-6 bg-[var(--ws-text-muted)] group-hover:bg-blue-400 rounded-full opacity-0 group-hover:opacity-100 transition-all" />
          </div>
        )}

        {showEdited && (
          <div
            className="h-full overflow-hidden"
            style={{ width: viewMode === 'compare' ? `${(1 - ratio) * 100}%` : '100%' }}
          >
            <EditedPanel data={editedData} onChange={handleEditedChange} />
          </div>
        )}
      </div>
    </div>
  );
}
