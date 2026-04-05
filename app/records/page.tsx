'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

interface EditRecord {
  id: string;
  original_filename: string;
  court: string | null;
  sale_date: string | null;
  category_count: number;
  case_count: number;
  property_count: number;
  ai_polished: number;
  status: string;
  outputs: {
    editedHwp?: string | null;
    finalPdf?: string | null;
    finalIdml?: string | null;
    finalPdfMode?: string | null;
    finalPdfMessage?: string | null;
    inddTemplate?: string | null;
  } | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  processing: { label: '처리 중', color: 'bg-blue-100 text-blue-700' },
  review: { label: '검토 대기', color: 'bg-amber-100 text-amber-700' },
  done: { label: '완료', color: 'bg-emerald-100 text-emerald-700' },
};

export default function RecordsPage() {
  const [records, setRecords] = useState<EditRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/records')
      .then((res) => res.json())
      .then((data) => {
        setRecords(data.records || []);
        setTotal(data.total || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      {/* Nav */}
      <nav className="h-14 bg-white border-b border-[var(--border)] flex items-center px-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <h1 className="text-sm font-bold text-gray-900 tracking-tight">경매공고 에디터</h1>
          </Link>
        </div>
        <div className="ml-8 flex items-center gap-6 text-sm">
          <Link href="/" className="text-gray-500 hover:text-gray-900 transition-colors">새 편집</Link>
          <Link href="/records" className="text-gray-900 font-semibold border-b-2 border-gray-900 pb-0.5">편집 기록</Link>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">편집 기록</h2>
            <p className="text-sm text-gray-500 mt-1">AI가 편집한 문서를 조회하고 다운로드할 수 있습니다</p>
          </div>
          <span className="text-sm text-gray-400">{total}건</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <svg className="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            불러오는 중...
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-20">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className="text-gray-500">아직 편집 기록이 없습니다</p>
            <Link href="/" className="inline-block mt-4 text-sm text-blue-600 hover:text-blue-800 font-medium">
              첫 번째 문서 편집하기
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">파일명</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">법원</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">사건/물건</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">AI</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">상태</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">생성일</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">다운로드</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map((r) => {
                  const st = STATUS_LABELS[r.status] || { label: r.status, color: 'bg-gray-100 text-gray-600' };
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]" title={r.original_filename}>
                          {r.original_filename}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {r.court || '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm text-gray-700 font-mono">
                          {r.case_count}/{r.property_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.ai_polished ? (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                            </svg>
                            적용
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600">미적용</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(r.created_at).toLocaleDateString('ko-KR', {
                          year: 'numeric', month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {r.outputs?.editedHwp && (
                            <a
                              href={r.outputs.editedHwp}
                              download
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                            >
                              HWP
                            </a>
                          )}
                          {r.outputs?.finalPdf && (
                            <a
                              href={r.outputs.finalPdf}
                              download
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 bg-red-50 rounded hover:bg-red-100 transition-colors"
                              title={r.outputs.finalPdfMessage || r.outputs.inddTemplate || ''}
                            >
                              PDF
                            </a>
                          )}
                          {r.outputs?.finalIdml && (
                            <a
                              href={r.outputs.finalIdml}
                              download
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-orange-600 bg-orange-50 rounded hover:bg-orange-100 transition-colors"
                            >
                              IDML
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
