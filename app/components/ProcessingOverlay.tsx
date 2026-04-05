'use client';

import { useState, useEffect } from 'react';

interface ProcessingOverlayProps {
  status: 'uploading' | 'processing' | 'approving';
}

interface StepInfo {
  label: string;
  detail: string;
  duration: number; // approximate ms
}

const UPLOAD_STEPS: StepInfo[] = [
  { label: '파일 전송', detail: 'HWP 파일을 서버에 업로드하고 있습니다', duration: 2000 },
];

const PROCESS_STEPS: StepInfo[] = [
  { label: '문서 구조 분석', detail: 'HWP 파일의 테이블, 셀, 단락 구조를 파싱합니다', duration: 3000 },
  { label: '텍스트 추출', detail: '사건번호, 소재지, 감정가 등 원본 데이터를 추출합니다', duration: 2000 },
  { label: '편집기준 적용', detail: '건물구조 삭제, 동소 축약, 제시외 합산 등 규칙을 적용합니다', duration: 4000 },
  { label: 'AI 텍스트 축약', detail: 'AI가 소재지와 비고란을 추가로 축약합니다', duration: 8000 },
  { label: 'HWP 셀 편집', detail: '편집된 텍스트를 원본 HWP 셀에 반영합니다', duration: 5000 },
  { label: '검증 수행', detail: '사건번호, 가격, 면적 등 10개 항목을 교차 검증합니다', duration: 2000 },
];

const APPROVE_STEPS: StepInfo[] = [
  { label: 'IDML 템플릿 로드', detail: 'InDesign 템플릿 파일을 불러옵니다', duration: 2000 },
  { label: '텍스트 프레임 교체', detail: '편집 데이터를 IDML 텍스트 프레임에 삽입합니다', duration: 4000 },
  { label: 'PDF 렌더링', detail: '3단 레이아웃 PDF를 생성합니다', duration: 6000 },
  { label: '파일 저장', detail: '최종 산출물을 저장합니다', duration: 1000 },
];

function getSteps(status: string): StepInfo[] {
  if (status === 'uploading') return UPLOAD_STEPS;
  if (status === 'approving') return APPROVE_STEPS;
  return PROCESS_STEPS;
}

export default function ProcessingOverlay({ status }: ProcessingOverlayProps) {
  const steps = getSteps(status);
  const totalDuration = steps.reduce((s, st) => s + st.duration, 0);
  const [elapsed, setElapsed] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 100;
        // Determine current step
        let acc = 0;
        for (let i = 0; i < steps.length; i++) {
          acc += steps[i].duration;
          if (next < acc) {
            setCurrentStep(i);
            break;
          }
          if (i === steps.length - 1) {
            setCurrentStep(steps.length - 1);
          }
        }
        // Slow down near the end (never reach 100%)
        if (next > totalDuration * 0.9) {
          return prev + 20;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [steps, totalDuration]);

  const rawPercent = Math.min((elapsed / totalDuration) * 100, 95);
  const percent = Math.round(rawPercent);
  const isApprove = status === 'approving';

  return (
    <div className="animate-fade-in w-full max-w-lg mx-auto">
      <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-out ${
              isApprove ? 'bg-emerald-500' : 'bg-blue-500'
            }`}
            style={{ width: `${rawPercent}%` }}
          />
        </div>

        <div className="p-8">
          {/* Percentage */}
          <div className="text-center mb-6">
            <div className={`text-5xl font-bold tracking-tight ${
              isApprove ? 'text-emerald-600' : 'text-blue-600'
            }`}>
              {percent}<span className="text-2xl font-medium">%</span>
            </div>
            <p className="text-sm font-semibold text-gray-900 mt-2">
              {status === 'uploading' ? '파일 업로드 중' : status === 'approving' ? 'PDF/IDML 생성 중' : 'AI 편집 진행 중'}
            </p>
          </div>

          {/* Step list */}
          <div className="space-y-1">
            {steps.map((s, i) => {
              const isDone = i < currentStep;
              const isActive = i === currentStep;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 ${
                    isActive ? 'bg-gray-50' : ''
                  }`}
                >
                  {/* Step indicator */}
                  <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                    {isDone ? (
                      <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : isActive ? (
                      <div className={`w-2 h-2 rounded-full animate-pulse ${
                        isApprove ? 'bg-emerald-500' : 'bg-blue-500'
                      }`} />
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                    )}
                  </div>

                  {/* Step text */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium transition-colors duration-300 ${
                      isDone ? 'text-gray-400' : isActive ? 'text-gray-900' : 'text-gray-300'
                    }`}>
                      {s.label}
                    </div>
                    {isActive && (
                      <div className="text-xs text-gray-500 mt-0.5 animate-fade-in">
                        {s.detail}
                      </div>
                    )}
                  </div>

                  {/* Step number */}
                  <span className={`text-xs font-mono flex-shrink-0 ${
                    isDone ? 'text-gray-300' : isActive ? 'text-gray-400' : 'text-gray-200'
                  }`}>
                    {i + 1}/{steps.length}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
