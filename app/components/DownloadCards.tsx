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

interface DownloadCardsProps {
  outputs: Outputs;
}

interface FileCardProps {
  href: string;
  label: string;
  sublabel: string;
  badge: string;
  colorClass: string;
  iconBg: string;
  iconColor: string;
  isExternal?: boolean;
  icon: React.ReactNode;
}

function FileCard({ href, label, sublabel, badge, colorClass, iconBg, iconColor, isExternal, icon }: FileCardProps) {
  return (
    <a
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      download={!isExternal}
      className={[
        'group flex items-center gap-4 p-5 rounded-2xl border transition-all duration-200 hover:shadow-md hover:-translate-y-0.5',
        colorClass,
      ].join(' ')}
    >
      {/* Icon */}
      <div
        className={[
          'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm transition-transform duration-200 group-hover:scale-105',
          iconBg,
          iconColor,
        ].join(' ')}
      >
        {icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{sublabel}</p>
      </div>

      {/* Badge + arrow */}
      <div className="flex flex-col items-end gap-2">
        <span
          className={[
            'text-xs font-bold px-2 py-0.5 rounded-md font-mono',
            iconBg,
            iconColor,
          ].join(' ')}
        >
          {badge}
        </span>
        <svg
          className="w-4 h-4 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all duration-200"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          {isExternal ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          )}
        </svg>
      </div>
    </a>
  );
}

function IDMLIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
    </svg>
  );
}

function PDFIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z" />
    </svg>
  );
}

function HTMLIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" />
    </svg>
  );
}

export default function DownloadCards({ outputs }: DownloadCardsProps) {
  const cards: FileCardProps[] = [];

  if (outputs.finalIdml) {
    cards.push({
      href: outputs.finalIdml,
      label: 'InDesign 파일',
      sublabel: 'IDML 템플릿 — 텍스트 교체 완료',
      badge: 'IDML',
      colorClass: 'bg-orange-50 border-orange-100 hover:border-orange-200',
      iconBg: 'bg-orange-100',
      iconColor: 'text-orange-600',
      icon: <IDMLIcon />,
    });
  }

  if (outputs.finalPdf) {
    cards.push({
      href: outputs.finalPdf,
      label: '최종 PDF',
      sublabel: outputs.finalPdfMessage || outputs.inddTemplate || 'INDD 템플릿 기반 인쇄용 PDF',
      badge: 'PDF',
      colorClass: 'bg-red-50 border-red-100 hover:border-red-200',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      icon: <PDFIcon />,
    });
  }

  if (outputs.previewHtml) {
    cards.push({
      href: outputs.previewHtml,
      label: 'HTML 미리보기',
      sublabel: '브라우저에서 확인',
      badge: 'HTML',
      colorClass: 'bg-gray-50 border-gray-200 hover:border-gray-300',
      iconBg: 'bg-gray-100',
      iconColor: 'text-gray-600',
      icon: <HTMLIcon />,
      isExternal: true,
    });
  }

  if (cards.length === 0) return null;

  return (
    <div className="animate-slide-up space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">최종 산출물 준비 완료</h3>
          <p className="text-xs text-gray-500 mt-0.5">{cards.length}개 파일이 생성되었습니다</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((card) => (
          <FileCard key={card.badge} {...card} />
        ))}
      </div>
    </div>
  );
}
