'use client';

import Link from 'next/link';
import { useState } from 'react';
import UploadZone from './components/UploadZone';
import ProcessingOverlay from './components/ProcessingOverlay';
import HwpWorkspace from './components/HwpWorkspace';

type Status = 'idle' | 'uploading' | 'processing' | 'review' | 'approving' | 'done' | 'error';

interface Outputs {
  editedHwpx?: string | null;
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

interface ProcessedAuction {
  header?: {
    court?: string;
    department?: string;
    saleDate?: string;
    saleDecisionDate?: string;
    salePlace?: string;
    judge?: string;
    publishDate?: string;
  };
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

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [outputs, setOutputs] = useState<Outputs>({});
  const [editedData, setEditedData] = useState<ProcessedAuction | null>(null);
  const [originalText, setOriginalText] = useState('');
  const [fileId, setFileId] = useState('');
  const [originalFile, setOriginalFile] = useState('');
  const [editedFile, setEditedFile] = useState('');
  const [verification, setVerification] = useState<VerificationCheck[]>([]);
  const [aiPolished, setAiPolished] = useState(true);
  const [aiStatus, setAiStatus] = useState<AiStatus>({
    mode: 'disabled',
    reason: 'AI 축약을 실행하지 않았습니다.',
    appliedCount: 0,
  });

  const handleFileSelect = (selected: File) => {
    setFile(selected);
    setStatus('idle');
    setError('');
    setOutputs({});
    setEditedData(null);
    setOriginalText('');
    setOriginalFile('');
    setEditedFile('');
    setVerification([]);
    setAiPolished(true);
    setAiStatus({
      mode: 'disabled',
      reason: 'AI 축약을 실행하지 않았습니다.',
      appliedCount: 0,
    });
  };

  const handleProcess = async () => {
    if (!file) return;
    try {
      setStatus('uploading');
      setError('');

      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!uploadRes.ok) throw new Error((await uploadRes.json()).error || '업로드 실패');
      const { id, path: filePath } = await uploadRes.json();
      setFileId(id);
      // 서버가 매직바이트로 결정한 실제 확장자 사용
      const serverExt = filePath.endsWith('.hwp') ? '.hwp' : '.hwpx';
      setOriginalFile(`${id}${serverExt}`);

      setStatus('processing');
      const processRes = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, filePath, originalFilename: file.name }),
      });
      if (!processRes.ok) throw new Error((await processRes.json()).error || '처리 실패');

      const result = await processRes.json();
      setEditedData(result.editedData);
      setOriginalText(result.originalText || '');
      setOutputs(result.outputs);
      setVerification(result.verification ?? []);
      setAiPolished(result.aiPolished ?? false);
      setAiStatus(result.aiStatus ?? {
        mode: result.aiPolished ? 'applied' : 'fallback',
        reason: result.aiPolished ? 'AI 축약 적용' : 'AI 축약 미적용',
        appliedCount: 0,
      });
      if (result.outputs?.editedHwp) {
        const hwpUrl = result.outputs.editedHwp as string;
        const match = hwpUrl.match(/file=([^&]+)/);
        if (match) setEditedFile(match[1]);
      }
      setStatus('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류 발생');
      setStatus('error');
    }
  };

  const handleApprove = async () => {
    try {
      setStatus('approving');
      setError('');

      const res = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fileId, editedData }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '승인 처리 실패');

      const result = await res.json();
      setOutputs((prev) => ({ ...prev, ...result.outputs }));
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류 발생');
      setStatus('error');
    }
  };

  const handleBackFromWorkspace = () => {
    setStatus('idle');
    setEditedData(null);
    setOriginalText('');
    setOutputs({});
    setOriginalFile('');
    setEditedFile('');
    setVerification([]);
    setAiPolished(true);
    setAiStatus({
      mode: 'disabled',
      reason: 'AI 축약을 실행하지 않았습니다.',
      appliedCount: 0,
    });
  };

  const isProcessingActive = status === 'uploading' || status === 'processing';
  const showWorkspace = status === 'review' || status === 'approving' || status === 'done';

  // ─── Workspace mode ───
  if (showWorkspace && editedData) {
    if (status === 'approving') {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ws-bg)]">
          <ProcessingOverlay key={status} status="approving" />
        </div>
      );
    }

    return (
      <HwpWorkspace
        originalText={originalText}
        editedData={editedData}
        onEditedDataChange={setEditedData}
        outputs={outputs}
        status={status as 'review' | 'done'}
        onApprove={handleApprove}
        onBack={handleBackFromWorkspace}
        fileName={file?.name}
        originalFile={originalFile}
        editedFile={editedFile}
        verification={verification}
        aiPolished={aiPolished}
        aiStatus={aiStatus}
      />
    );
  }

  // ─── Platform home ───
  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      {/* Navigation bar */}
      <nav className="h-14 bg-white border-b border-[var(--border)] flex items-center px-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900 tracking-tight">경매공고 에디터</h1>
          </div>
        </div>
        <div className="ml-8 flex items-center gap-6 text-sm">
          <Link href="/" className="text-gray-900 font-semibold border-b-2 border-gray-900 pb-0.5">새 편집</Link>
          <Link href="/records" className="text-gray-500 hover:text-gray-900 transition-colors">편집 기록</Link>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-xl">
          {/* Error banner */}
          {status === 'error' && (
            <div className="mb-6 animate-fade-in flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-800">오류가 발생했습니다</p>
                <p className="text-sm text-red-600 mt-0.5 break-words">{error}</p>
              </div>
              <button
                onClick={() => setStatus('idle')}
                className="text-red-400 hover:text-red-600 transition-colors flex-shrink-0 p-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Processing state replaces upload */}
          {isProcessingActive ? (
            <ProcessingOverlay key={status} status={status as 'uploading' | 'processing'} />
          ) : (
            <div className="animate-slide-up">
              {/* Hero text */}
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
                  법원경매공고 원고 편집
                </h2>
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                  HWP 파일을 업로드하면 편집기준에 따라 자동으로 편집합니다
                </p>
              </div>

              {/* Upload card */}
              <div className="bg-white rounded-2xl border border-[var(--border)] shadow-sm p-6">
                <UploadZone
                  file={file}
                  onFileSelect={handleFileSelect}
                  onProcess={handleProcess}
                  isDisabled={!file || isProcessingActive}
                  isLoading={isProcessingActive}
                  loadingLabel=""
                />
              </div>

              {/* Info footer */}
              <div className="mt-6 flex items-center justify-center gap-6 text-xs text-gray-400">
                <div className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  파일은 서버에서만 처리됩니다
                </div>
                <div className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                  평균 처리 시간 15~30초
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
