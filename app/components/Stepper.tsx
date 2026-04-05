'use client';

type StepStatus = 'completed' | 'active' | 'pending';

interface Step {
  n: number;
  label: string;
  sublabel: string;
}

const STEPS: Step[] = [
  { n: 1, label: '업로드 & AI 편집', sublabel: 'HWP 파일 업로드' },
  { n: 2, label: '1차 수정본 검토', sublabel: '내용 확인 및 검토' },
  { n: 3, label: 'PDF / IDML 생성', sublabel: '최종 산출물 다운로드' },
];

function getStepStatus(stepN: number, currentStep: number): StepStatus {
  if (stepN < currentStep) return 'completed';
  if (stepN === currentStep) return 'active';
  return 'pending';
}

interface StepperProps {
  currentStep: number; // 1 | 2 | 3
}

export default function Stepper({ currentStep }: StepperProps) {
  return (
    <div className="w-full bg-white border-b border-gray-200">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="relative flex items-start justify-between">
          {/* Background connector line */}
          <div className="absolute top-5 left-0 right-0 h-px bg-gray-200 mx-12" aria-hidden="true" />

          {/* Active progress fill */}
          <div
            className="absolute top-5 left-0 h-px bg-blue-600 mx-12 transition-all duration-700 ease-out"
            style={{ width: currentStep === 1 ? '0%' : currentStep === 2 ? '50%' : '100%' }}
            aria-hidden="true"
          />

          {STEPS.map(({ n, label, sublabel }) => {
            const status = getStepStatus(n, currentStep);
            return (
              <div key={n} className="relative flex flex-col items-center flex-1">
                {/* Circle */}
                <div
                  className={[
                    'w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold z-10 transition-all duration-300',
                    status === 'completed'
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                      : status === 'active'
                      ? 'bg-white border-2 border-blue-600 text-blue-600 shadow-md shadow-blue-100'
                      : 'bg-white border-2 border-gray-200 text-gray-400',
                  ].join(' ')}
                  aria-label={`${n}단계: ${label} - ${status === 'completed' ? '완료' : status === 'active' ? '진행 중' : '대기 중'}`}
                >
                  {status === 'completed' ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    n
                  )}
                </div>

                {/* Labels */}
                <div className="mt-3 text-center">
                  <p
                    className={[
                      'text-sm font-semibold leading-tight transition-colors duration-300',
                      status === 'active' ? 'text-blue-600' : status === 'completed' ? 'text-gray-900' : 'text-gray-400',
                    ].join(' ')}
                  >
                    {label}
                  </p>
                  <p
                    className={[
                      'text-xs mt-0.5 transition-colors duration-300',
                      status === 'active' ? 'text-blue-400' : status === 'completed' ? 'text-gray-500' : 'text-gray-300',
                    ].join(' ')}
                  >
                    {sublabel}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
