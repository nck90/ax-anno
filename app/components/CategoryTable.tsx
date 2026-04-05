'use client';

import { useState } from 'react';

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

interface CategoryTableProps {
  name: string;
  items: AuctionItem[];
  defaultOpen?: boolean;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={['w-4 h-4 text-gray-400 transition-transform duration-200', open ? 'rotate-180' : ''].join(' ')}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function formatPrice(price: string): string {
  if (!price) return '-';
  // Clean and return as-is if already formatted
  return price;
}

export default function CategoryTable({ name, items, defaultOpen = true }: CategoryTableProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const totalProperties = items.reduce((sum, item) => sum + (item.properties?.length ?? 0), 0);

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
      {/* Category header */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors duration-150 text-left"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 text-xs font-medium">
              {items.length}건
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-200 text-gray-600 text-xs font-medium">
              물건 {totalProperties}개
            </span>
          </div>
        </div>
        <ChevronIcon open={isOpen} />
      </button>

      {/* Table body */}
      {isOpen && (
        <div className="divide-y divide-gray-100">
          {items.map((item, ii) => (
            <div key={ii} className="px-5 py-4">
              {/* Case number row */}
              <div className="flex items-center gap-2 mb-3">
                <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">
                  {item.caseNumber}
                </span>
                {item.duplicateInfo && (
                  <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100 font-medium">
                    {item.duplicateInfo}
                  </span>
                )}
              </div>

              {/* Properties table */}
              {item.properties && item.properties.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-3 py-2 text-gray-500 font-medium w-8">No.</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium">소재지</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium w-20">용도</th>
                        <th className="text-right px-3 py-2 text-gray-500 font-medium w-28">감정가</th>
                        <th className="text-right px-3 py-2 text-gray-500 font-medium w-28">최저가</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium w-32">비고</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {item.properties.map((p, pi) => (
                        <tr key={pi} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-3 py-2 text-gray-400 font-mono">{p.propertyNumber || pi + 1}</td>
                          <td className="px-3 py-2 text-gray-800 leading-snug max-w-xs">{p.location}</td>
                          <td className="px-3 py-2">
                            <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">
                              {p.usage || '-'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-gray-700">
                            {formatPrice(p.appraisalPrice)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700">
                            {formatPrice(p.minimumPrice)}
                          </td>
                          <td className="px-3 py-2 text-gray-500 leading-snug">{p.remarks || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
