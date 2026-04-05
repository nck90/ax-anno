/**
 * 법원경매공고 결정론적 편집기
 * - hwpilot read JSON → 구조 파싱 → 편집기준 적용 → EditedAuction + cellEditMap 출력
 * - AI 없이 규칙 기반으로 정확한 변환 수행
 * - EDITING-SPEC.md v1.0 전체 규칙 구현
 */

import type { EditedAuction, AuctionHeader, AuctionCategory, AuctionCase, AuctionProperty } from './editing-rules';

// ─── 타입 정의 ───────────────────────────────────────────────

interface HwpRun {
  text: string;
  charShapeRef?: number;
}

interface HwpParagraph {
  ref: string;
  runs: HwpRun[];
}

interface HwpCell {
  ref: string;
  paragraphs: HwpParagraph[];
  colSpan: number;
  rowSpan: number;
}

interface HwpRow {
  cells: HwpCell[];
}

interface HwpTable {
  ref: string;
  rows: HwpRow[];
}

interface HwpSection {
  index: number;
  paragraphs: unknown[];
  tables: HwpTable[];
}

interface HwpDocument {
  format: string;
  sections: HwpSection[];
}

// 파싱된 경매 물건
interface ParsedItem {
  caseNumber: string;
  duplicateInfo: string;
  propertyNumber: string;
  usageCategory: string; // 원본 용도 카테고리
  location: string;      // 원본 소재지
  detail: string;        // 원본 상세내역
  price: string;         // 감정평가액\n최저매각가격
  note: string;          // 비고
  subParcels: Array<{ location: string; detail: string; cellRef?: string; detailCellRef?: string }>;
  // 셀 ref 추적용
  locationCellRef?: string;
  detailCellRef?: string;
  noteCellRef?: string;
}

// transformToEdited 반환 타입
export interface TransformResult {
  editedData: EditedAuction;
  /** 원본 HWP 셀 ref (예: "s0.t1.r3.c3") → 편집된 텍스트 매핑 */
  cellEditMap: Map<string, string>;
}

// ─── 셀 텍스트 추출 ──────────────────────────────────────────

function cellText(cell: HwpCell): string {
  return cell.paragraphs
    .map(p => p.runs.map(r => r.text).join(''))
    .filter(t => t.trim())
    .join('\n')
    .trim();
}

// ─── 1. 원본 HWP 파싱 ───────────────────────────────────────

function isHeaderRow(cells: HwpCell[]): boolean {
  const text = cells.map(c => cellText(c)).join(' ');
  return (
    text.includes('단위') ||
    text.includes('사건번호') ||
    text.includes('매   각') ||
    (text.includes('물건') && text.includes('번호') && text.includes('용 도')) ||
    text.includes('소  재  지') ||
    text.includes('상 세  내 역')
  );
}

function isCaseNumber(text: string): boolean {
  return /^\d{4}타경\d+/.test(text.replace(/\s/g, ''));
}

/** GAP 10: 매각일시 요일 추가 및 공백 정리 */
function formatSaleDate(raw: string): string {
  const dateMatch = raw.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./);
  if (!dateMatch) return raw.replace(/\s{2,}/g, ' ');
  const [, y, m, d] = dateMatch;
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeek = dayNames[new Date(+y, +m - 1, +d).getDay()];
  // Extract time(s): ①10:00 ②10:00 or just 10:00
  const times = raw.match(/[①②③]?\s*(\d{1,2}:\d{2})/g);
  const timeStr = times ? ' ' + times.map(t => t.replace(/\s/g, '')).join(' ') : '';
  return `${y}. ${+m}. ${+d}. [${dayOfWeek}]${timeStr}`;
}

export function parseOriginalHwp(doc: HwpDocument): { header: AuctionHeader; items: ParsedItem[] } {
  const tables = doc.sections[0]?.tables || [];
  if (tables.length < 2) {
    throw new Error('테이블이 2개 이상 필요합니다 (헤더 + 데이터)');
  }

  // ── 헤더 테이블 (t0) 파싱 ──
  const headerTable = tables[0];
  const headerTexts = headerTable.rows.flatMap(r => r.cells.map(c => cellText(c)));
  const headerJoined = headerTexts.join('\n');

  const header: AuctionHeader = {
    court: '',
    department: '',
    saleDate: '',
    saleDecisionDate: '',
    salePlace: '',
    judge: '',
    publishDate: '',
  };

  // 담당계 파싱
  const deptMatch = headerJoined.match(/경매(\d+)계/);
  if (deptMatch) header.department = `경매${deptMatch[1]}계`;

  // 사법보좌관/보좌관 파싱 (GAP 4)
  const bojoMatch = headerJoined.match(/(?:사법)?보좌관\s*:?\s*(\S+)/);
  if (bojoMatch) header.judge = bojoMatch[1];

  // 매각일시 (GAP 10: 요일 추가, 공백 정리)
  const saleDateMatch = headerJoined.match(/매각일시\s*:\s*(.+)/);
  if (saleDateMatch) {
    header.saleDate = formatSaleDate(saleDateMatch[1].trim());
  }

  // 매각결정일시
  const decisionMatch = headerJoined.match(/매각결정일시\s*:\s*(.+)/);
  if (decisionMatch) {
    header.saleDecisionDate = decisionMatch[1].trim().replace(/\s{2,}/g, ' ');
  }

  // 법원명 추출 (GAP 4: 지원명 포함)
  const courtFullMatch = headerJoined.match(/([\S]+(?:지방)?법원)\s*([\S]*지원)?/);
  if (courtFullMatch) {
    header.court = courtFullMatch[2]
      ? `${courtFullMatch[1]} ${courtFullMatch[2]}`
      : courtFullMatch[1];
  }

  // 매각장소
  const placeMatch = headerJoined.match(/([\S]+(?:지원|법원)\s+\d+층\s*\d*호?\s*경매법정|[\S]+지원\s+경매법정|[\S]+법원\s+경매법정)/);
  if (placeMatch) header.salePlace = placeMatch[1].trim();

  // ── 데이터 테이블 파싱 ── (사건번호 패턴으로 찾기)
  const caseNumberRe = /\d{4}타경\d+/;
  let dataTable = tables[1]; // fallback
  for (let ti = 1; ti < tables.length; ti++) {
    const t = tables[ti];
    const hasCase = t.rows.some(r => r.cells.some(c => caseNumberRe.test(cellText(c))));
    if (hasCase) {
      dataTable = t;
      break;
    }
  }
  const items: ParsedItem[] = [];
  let currentCase = '';
  let currentDup = '';
  let currentItemNum = '';
  let currentUsage = '';

  // rowSpan 추적
  let caseRowsRemaining = 0;
  let itemRowsRemaining = 0;

  for (const row of dataTable.rows) {
    const cells = row.cells;
    if (isHeaderRow(cells)) continue;

    const numCells = cells.length;
    const texts = cells.map(c => cellText(c));

    if (numCells >= 7) {
      // 새 사건 + 새 물건 (모든 컬럼)
      let caseText = texts[0];
      let dupInfo = '';

      // 중복/병합 처리
      if (caseText.includes('(중복)') || caseText.includes('[중복]')) {
        dupInfo = '[중복]';
        caseText = caseText.replace(/\(중복\)|\[중복\]/g, '').trim();
      }
      if (caseText.includes('(병합)') || caseText.includes('[병합]')) {
        dupInfo = '[병합]';
        caseText = caseText.replace(/\(병합\)|\[병합\]/g, '').trim();
      }

      currentCase = caseText;
      currentDup = dupInfo;
      currentItemNum = texts[1];
      currentUsage = texts[2];
      caseRowsRemaining = cells[0].rowSpan - 1;
      itemRowsRemaining = cells[1].rowSpan - 1;

      items.push({
        caseNumber: currentCase,
        duplicateInfo: currentDup,
        propertyNumber: currentItemNum,
        usageCategory: currentUsage,
        location: texts[3],
        detail: texts[4],
        price: texts[5],
        note: texts[6],
        subParcels: [],
        locationCellRef: cells[3]?.ref,
        detailCellRef: cells[4]?.ref,
        noteCellRef: cells[6]?.ref,
      });

    } else if (numCells === 6) {
      // 같은 사건, 새 물건번호 (rowSpan 동기화 여부와 무관하게 처리)
      if (caseRowsRemaining > 0) caseRowsRemaining--;

      // texts[0]이 사건번호처럼 보이면 새 사건으로 처리
      if (!currentCase && isCaseNumber(texts[0])) {
        currentCase = texts[0];
        currentDup = '';
      }

      currentItemNum = texts[0];
      currentUsage = texts[1];
      itemRowsRemaining = cells[0].rowSpan - 1;

      items.push({
        caseNumber: currentCase,
        duplicateInfo: currentDup,
        propertyNumber: currentItemNum,
        usageCategory: currentUsage,
        location: texts[2],
        detail: texts[3],
        price: texts[4],
        note: texts[5],
        subParcels: [],
        locationCellRef: cells[2]?.ref,
        detailCellRef: cells[3]?.ref,
        noteCellRef: cells[5]?.ref,
      });

    } else if (numCells === 5) {
      // 하위 필지
      if (caseRowsRemaining > 0) caseRowsRemaining--;
      if (itemRowsRemaining > 0) itemRowsRemaining--;

      const firstText = texts[0];
      // Accept any non-empty first cell as a sub-parcel address (permissive matching)
      // Only exclude clearly non-address content (empty or header-like rows)
      const isLikelyAddress = firstText.trim().length > 0 && !isHeaderRow(cells);
      if (isLikelyAddress) {
        if (items.length > 0) {
          items[items.length - 1].subParcels.push({
            location: texts[0],
            detail: texts[1],
            cellRef: cells[0]?.ref,
            detailCellRef: cells[1]?.ref,
          });
        }
      }

    } else if (numCells === 2) {
      // 하위 필지 (소재지 + 상세내역만)
      if (caseRowsRemaining > 0) caseRowsRemaining--;
      if (itemRowsRemaining > 0) itemRowsRemaining--;

      if (items.length > 0) {
        items[items.length - 1].subParcels.push({
          location: texts[0],
          detail: texts[1],
          cellRef: cells[0]?.ref,
        });
      }

    } else if (numCells === 3 || numCells === 4) {
      // 다양한 rowspan 조합의 하위 필지
      if (caseRowsRemaining > 0) caseRowsRemaining--;
      if (itemRowsRemaining > 0) itemRowsRemaining--;

      if (items.length > 0) {
        const lastItem = items[items.length - 1];
        // Check if any cell contains a price-like value
        const priceRe = /^\d[\d,]*$/;
        const detailIdx = 1;
        let priceText = '';
        let noteText = '';

        for (let ci = 1; ci < texts.length; ci++) {
          const t = texts[ci];
          if (priceRe.test(t.replace(/\s/g, '')) && t.replace(/\s/g, '').length >= 5) {
            priceText = t;
          } else if (ci === detailIdx) {
            // keep as detail
          } else if (t.trim()) {
            noteText = t;
          }
        }

        // If price found and item has no price yet, capture it
        if (priceText && !lastItem.price) {
          lastItem.price = priceText;
        }

        // Append note content to existing note if found
        if (noteText && !lastItem.note.includes(noteText)) {
          lastItem.note = lastItem.note ? `${lastItem.note}\n${noteText}` : noteText;
        }

        lastItem.subParcels.push({
          location: texts[0],
          detail: texts.length > 1 ? texts[1] : '',
          cellRef: cells[0]?.ref,
        });
      }
    }
  }

  return { header, items };
}

// ─── 2. 편집 기준 적용 (변환 로직) ──────────────────────────

const JIMOK_LIST = '대|답|전|임야|공장용지|주유소용지|체육용지|도로|주차장|창고용지|잡종지|과수원|목장용지|광천지|염전|학교용지|종교용지|철도용지|하천|유지|구거|수도용지|공원|유원지|사적지|묘지|제방';
const JIMOK_RE = new RegExp(`^(${JIMOK_LIST})`);

// Section 2.3: 건물 구조 설명 삭제 패턴
const STRUCTURE_RE = /(철근콘크리트|일반철골|경량철골|시멘트?벽돌|시멘트블럭|시멘트블록|연와|조립식판넬|조립식|판넬|강판|시멘벽돌|콘크리트평슬래브|강파이프|칼라강판|컬러강판|샌드위치패널|샌드위치판넬|아스팔트싱글|기와형?가판|스라브|슬래브|스레이트|스레트|판넬지붕|기타지붕|썬라이트지붕|아크릴지붕|아연지붕|황토벽돌|블럭|블록|벽돌|목조|경량목구조|경량철골조|일반철골조|철골조|석조|조적조|흙벽조?|산시조?|철파이프조?|파이프조?|그라스울판넬|평지붕|지붕)구?조?\s*/g;

// Section 2.1: 광역시/도 제거
function removeProvince(text: string): string {
  return text
    .replace(/충청북도\s+/g, '').replace(/충청남도\s+/g, '')
    .replace(/경상북도\s+/g, '').replace(/경상남도\s+/g, '')
    .replace(/전라북도\s+/g, '').replace(/전라남도\s+/g, '')
    .replace(/전북특별자치도\s+/g, '')
    .replace(/경기도\s+/g, '').replace(/강원도\s+/g, '').replace(/강원특별자치도\s+/g, '')
    .replace(/제주특별자치도\s+/g, '')
    .replace(/서울특별시\s+/g, '').replace(/부산광역시\s+/g, '').replace(/대구광역시\s+/g, '')
    .replace(/인천광역시\s+/g, '').replace(/광주광역시\s+/g, '').replace(/대전광역시\s+/g, '').replace(/울산광역시\s+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Section 2.4: 건물 용도명 축약
function abbreviateUsageName(text: string): string {
  return text
    .replace(/다가구주택\(\d+가구\)/g, '다가구')
    .replace(/다가구주택/g, '다가구')
    .replace(/제1종근린생활시설\([^)]*\)/g, '근린시설')
    .replace(/제2종근린생활시설\(([^)]+)\)/g, '근린시설[$1]')
    .replace(/제[12]종근린생활시설/g, '근린시설')
    .replace(/문화및\s*집회시설/g, '문화,집회시설')
    .replace(/위험물저장\s*및\s*처리시설/g, '위험물저장및처리시설')
    .replace(/제조업소/g, '[제조업소]');
}

// Section 2.7: 괄호 변환 () → []
function convertBrackets(text: string): string {
  return text.replace(/\(/g, '[').replace(/\)/g, ']');
}

// Section 2.8: 지분 분수 역전 "N분의M" → "M/N"
function convertFraction(text: string): string {
  // "N분의 M" 또는 "N분의M" 형식
  return text.replace(/(\d+)분의\s*(\d+)/g, '$2/$1');
}

/** 이중 공백 정리 + () → [] */
function cleanText(text: string): string {
  return text
    .replace(/\s{2,}/g, ' ')
    .replace(/\(/g, '[')
    .replace(/\)/g, ']')
    .replace(/\[패널\]/g, '')
    .replace(/\[\[/g, '[')
    .replace(/\]\]/g, ']')
    .replace(/\s*\[\]\s*/g, ' ')
    .trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 상세내역에서 지목 추출 */
function extractJimok(detail: string): string {
  const m = detail.trim().match(JIMOK_RE);
  return m ? m[1] : '';
}

// Section 2.5: 동일 면적 층수 합치기
// "1층 73.88㎡ 2층 73.88㎡" → "1,2층각73.88㎡"
function mergeIdenticalFloorAreas(parts: string[]): string[] {
  if (parts.length < 2) return parts;

  // 층+면적 패턴으로 파싱
  interface FloorArea { floors: number[]; usage: string; area: string; original: string }
  const parsed: Array<FloorArea | null> = parts.map(p => {
    const prefixed = p.match(/^(.+?)\s+(\d+)층각?([\d.]+㎡)$/);
    if (prefixed) {
      return { floors: [parseInt(prefixed[2])], usage: prefixed[1].trim(), area: prefixed[3], original: p };
    }
    const m = p.match(/^(\d+)층([^\d㎡]+)?([\d.]+㎡)$/);
    if (m) return { floors: [parseInt(m[1])], usage: (m[2] || '').trim(), area: m[3], original: p };
    return null;
  });

  // 연속된 동일 면적 묶기
  const result: string[] = [];
  let i = 0;
  while (i < parts.length) {
    const cur = parsed[i];
    if (!cur) {
      result.push(parts[i]);
      i++;
      continue;
    }

    // 같은 면적인 연속 층 찾기
    const group: FloorArea = { floors: [...cur.floors], usage: cur.usage, area: cur.area, original: cur.original };
    let j = i + 1;
    while (j < parts.length) {
      const next = parsed[j];
      if (next && next.area === group.area && next.usage === group.usage) {
        group.floors.push(...next.floors);
        j++;
      } else {
        break;
      }
    }

    if (group.floors.length > 1) {
      // "1,2층각73.88㎡" 형식
      result.push(group.usage ? `${group.usage} ${group.floors.join(',')}층각${group.area}` : `${group.floors.join(',')}층각${group.area}`);
    } else {
      result.push(cur.original);
    }
    i = j;
  }

  return result;
}

// Section 4.9: 연속 숫자 축약
// "목록 1,2,3" → "목록1~3"
function abbreviateConsecutiveNumbers(text: string): string {
  // 숫자 목록 패턴: "목록 N,M,K" → "목록N~K" (연속인 경우)
  return text.replace(/목록\s*(\d+(?:,\d+)+)/g, (match, nums) => {
    const arr = nums.split(',').map(Number);
    const isConsecutive = arr.every((n: number, i: number) => i === 0 || n === arr[i - 1] + 1);
    if (isConsecutive && arr.length >= 3) {
      return `목록${arr[0]}~${arr[arr.length - 1]}`;
    } else if (isConsecutive && arr.length === 2) {
      return `목록${arr[0]},${arr[1]}`;
    }
    return `목록${nums}`;
  });
}

// Section 4.9: 층 연속 숫자 축약
// "1층 24㎡ 2층 24㎡ 3층 24㎡" → "1~3층각24㎡" (mergeIdenticalFloorAreas에서 처리 + 여기서 연속범위로)
function abbreviateConsecutiveFloors(text: string): string {
  // "1,2,3층각X㎡" → "1~3층각X㎡"
  return text.replace(/(\d+(?:,\d+)+)층각/g, (match, nums) => {
    const arr = nums.split(',').map(Number);
    const isConsecutive = arr.every((n: number, i: number) => i === 0 || n === arr[i - 1] + 1);
    if (isConsecutive && arr.length >= 3) {
      return `${arr[0]}~${arr[arr.length - 1]}층각`;
    }
    return match;
  });
}

// Section 3.2: 제시외 기계기구
function parseJesioeMachinery(text: string): {식: number } | null {
  // "기계기구 셀프주유기 外 6식" → {식: 6}
  const m = text.match(/기계기구[^0-9]*(\d+)식/);
  if (m) return { 식: parseInt(m[1]) };
  return null;
}

// Section 3.3: 제시외 수목
function parseJesioeTree(text: string): string | null {
  // "수목 수목 일괄㎡" → "수목일괄"
  if (/수목\s*수목\s*일괄/.test(text)) return '수목일괄';
  // "과수목 감나무,매실 1식" → "과수목 감나무,매실1식"
  const m = text.match(/(과수목|수목)\s+(.+?)\s+(\d+)식/);
  if (m) return `${m[1]} ${m[2]}${m[3]}식`;
  return null;
}

/** Section 3.1-3.4: 제시외 텍스트 간략화 */
function simplifyJesioeText(text: string): string {
  if (!text || !text.includes('제시외')) return '';

  const jesioeIdx = text.indexOf('제시외');
  const jesioeText = text.substring(jesioeIdx);

  // 기계기구 처리 (Section 3.2)
  const machineryMatch = parseJesioeMachinery(jesioeText);

  // 수목 처리 (Section 3.3)
  const treeResult = parseJesioeTree(jesioeText);
  if (treeResult) {
    return `제시외 ${treeResult}`;
  }

  // 지하수관정/관정 식 단위 (면적 없이 식만 있는 패턴)
  const gwanjungMatch = jesioeText.match(/(지하수관정|관정)\s*(\d+)\s*식/);
  if (gwanjungMatch && !/\d+\s*㎡/.test(jesioeText.replace(gwanjungMatch[0], ''))) {
    return `제시외 ${gwanjungMatch[1]}${gwanjungMatch[2]}식`;
  }

  // 면적 추출 및 합산 (Section 3.1)
  const areas = [...jesioeText.matchAll(/(\d[\d,.]*)\s*㎡/g)];
  const totalArea = areas.reduce((sum, m) => sum + parseFloat(m[1].replace(/,/g, '')), 0);
  const roundedArea = Math.round(totalArea * 100) / 100;

  // 식(式) 단위 처리 (기계기구 등)
  const sikMatches = [...jesioeText.matchAll(/(\d+)식/g)];
  const totalSik = sikMatches.reduce((sum, m) => sum + parseInt(m[1]), 0);

  const pickShortestName = (candidates: string[], fallback: string): string => {
    let chosen = fallback;
    for (const candidate of candidates) {
      const clean = candidate.trim().replace(/^-/, '').trim();
      if (!clean) continue;
      if (clean.length < chosen.length || (clean.length === chosen.length && clean !== chosen)) {
        chosen = clean;
      }
    }
    return chosen;
  };

  if (roundedArea > 0) {
    // 대표 건물명 = 가장 짧은 항목명 (Section 3.1)
    const nameMatches = [...jesioeText.matchAll(/[-–]\s*([^\s\d㎡-][^\d㎡\s]*)\s+\d[\d,.]*㎡/g)];
    // 이름 후보들 (화장실,보일러실 → 전체로)
    const names: string[] = nameMatches.map(m => m[1].replace(/[,]$/, '').trim()).filter(n => n.length > 0);

    // 또한 "제시외 -이름 면적" 패턴에서도 추출
    const altNameMatches = [...jesioeText.matchAll(/제시외\s*건물?[㉠-㉭]?\s*-?\s*([^\s\d㎡][^\d㎡\n]{0,10}?)\s+\d/g)];
    for (const m of altNameMatches) {
      const candidate = m[1].trim().replace(/^-/, '').trim();
      if (candidate && !names.includes(candidate)) names.push(candidate);
    }

    // fallback 이름
    const fallbackMatch = jesioeText.match(/제시외\s*-?\s*(?:건물[㉠-㉭]?\s*-?\s*)?([^\s\d㎡][^\d㎡\s]{1,10}?)(?:\s|㎡|\d)/);
    const fallbackName = fallbackMatch?.[1]?.replace(/[-–]/, '').trim() || '창고';

    const shortestName = pickShortestName(names, fallbackName);

    const areaStr = roundedArea % 1 === 0 ? String(Math.round(roundedArea)) : String(roundedArea);
    const suffix = areas.length > 1 ? `${shortestName}등${areaStr}㎡` : `${shortestName}${areaStr}㎡`;

    if (totalSik > 0) {
      const sikNameCandidates = [...jesioeText.matchAll(/-\s*([^\s\d㎡-][^\d㎡\s]{0,10}?)\s+\d+식/g)]
        .map(m => m[1].trim())
        .filter(Boolean);
      const sikName = pickShortestName(sikNameCandidates, '기계기구');

      // 기계기구가 있으면 별도 표기
      if (machineryMatch) {
        return `제시외 기계기구${totalSik}식 ${suffix}`;
      }
      return `제시외 ${suffix} ${sikName}등${totalSik}식`;
    }
    return `제시외 ${suffix}`;
  }

  // 식(式)만 있는 경우
  if (totalSik > 0 && areas.length === 0) {
    const nameMatch = jesioeText.match(/제시외\s*-?\s*([^\s\d㎡][^\d㎡\s]{0,10}?)(?:\s|$)/);
    const name = nameMatch?.[1]?.replace(/[-–]/, '').trim() || '기계기구';
    return `제시외 ${name}등${totalSik}식`;
  }

  // 면적도 식도 없는 경우 (수목 일괄 등)
  const simplified = jesioeText.replace(/\s+/g, '').substring(0, 30);
  return simplified;
}

/** Section 2.2-2.5: 소재지 + 상세내역 합치기 */
function mergeLocationDetail(location: string, detail: string): { merged: string; usage: string } {
  const loc = removeProvince(location);
  const det = detail.trim();

  if (!det) return { merged: loc, usage: '' };

  const jimok = extractJimok(det);
  const lines = det.split('\n').map(l => l.trim()).filter(Boolean);

  // 단순 지목+면적 ("답 175㎡", "대 714㎡", "임야 131435㎡")
  const simpleRe = new RegExp(`^(${JIMOK_LIST})\\s+(\\d[\\d,.]*\\s*㎡)`);
  const simpleMatch = lines[0].match(simpleRe);

  if (simpleMatch && lines.length === 1) {
    return { merged: cleanText(`${loc} ${simpleMatch[2]}`), usage: simpleMatch[1] };
  }

  // 지목+면적 + 추가정보 (제시외, 지분 등)
  if (simpleMatch) {
    const firstLineArea = simpleMatch[2].trim();
    // 제시외가 뒤에 있는 경우
    const allLines = lines.slice(1);
    let suffix = '';

    for (const line of allLines) {
      if (line.includes('제시외')) {
        suffix += ' ' + simplifyJesioeText(line);
      } else if (line.match(/[（(]/) || line.match(/지분/)) {
        // 지분 정보: Section 2.8
        const converted = convertFraction(line).replace(/\s+/g, '').replace(/\(/g, '[').replace(/\)/g, ']');
        suffix += ' ' + converted;
      } else if (line.trim()) {
        const converted = convertFraction(line).replace(/\s+/g, '').replace(/\(/g, '[').replace(/\)/g, ']');
        suffix += ' ' + converted;
      }
    }

    // 제시외가 같은 라인에 있는 경우도 처리
    if (!suffix && det.includes('제시외')) {
      const afterArea = det.substring(det.indexOf(simpleMatch[2]) + simpleMatch[2].length).trim();
      if (afterArea.includes('제시외')) {
        suffix = ' ' + simplifyJesioeText(afterArea);
      }
    }

    return { merged: cleanText(`${loc} ${firstLineArea}${suffix}`), usage: jimok };
  }

  // 건물: 구조설명 제거, 층별 면적만 추출
  const floorParts: string[] = [];
  let buildingType = '';
  let hasJesioe = false;
  const jesioeLines: string[] = [];
  let pendingPrefix = '';
  let inAnnexSection = false;
  // Pending context annotation to attach to next floor part (e.g. "[사무소]")
  let pendingContextAnnotation = '';

  for (const line of lines) {
    // 제시외 처리
    if (line.includes('제시외')) {
      hasJesioe = true;
      jesioeLines.push(line);
      continue;
    }

    // 건물 용도 추출 (Section 2.4 축약 포함)
    const abbrevLine = abbreviateUsageName(line);
    const typeMatch = abbrevLine.match(/(단독주택|다가구주택|근린시설|위험물저장및처리시설|\[제조업소\]|공장|창고시설|아파트|오피스텔)/);
    if (typeMatch && !/㎡/.test(line)) {
      if (!buildingType) buildingType = typeMatch[1];
      if (/층/.test(abbrevLine)) {
        pendingPrefix = cleanText(
          abbrevLine
            .replace(STRUCTURE_RE, '')
            .replace(/\[[^\]]+\]/g, '')
            .replace(/\s+/g, '')
            .replace(/^\d+층/, '')
        );
      }
      // Capture parenthetical usage description (e.g. "(사무소)" from "1층 근린시설(사무소)")
      const parenMatch = line.match(/[（(]([^）)]{1,20})[）)]/);
      if (parenMatch) {
        pendingContextAnnotation = `[${parenMatch[1]}]`;
      }
      continue;
    }

    if (!/㎡/.test(line)) {
      const prefixSource = cleanText(abbreviateUsageName(line.replace(STRUCTURE_RE, ''))).replace(/\s+/g, '');
      if (/단층부속/.test(prefixSource)) {
        pendingPrefix = '단층부속';
        continue;
      }
      if (pendingPrefix === '단층부속' && /보일러실/.test(prefixSource)) {
        pendingPrefix = '단층부속보일러실';
        continue;
      }
    }

    // 구조설명만(면적 없음) → 건너뛰기 (Section 2.3)
    if (STRUCTURE_RE.test(line) && !/㎡/.test(line)) {
      STRUCTURE_RE.lastIndex = 0;
      continue;
    }
    STRUCTURE_RE.lastIndex = 0;

    // "부속건물" 라인
    if (/^부속건물$/.test(line)) {
      floorParts.push('부속건물');
       inAnnexSection = true;
       pendingPrefix = '';
      continue;
    }

    // 층+면적 또는 면적만 (Section 2.3 구조 설명 삭제 + 2.4 용도 축약)
    if (/㎡/.test(line)) {
      // 구조 설명 제거
      let simplified = line.replace(STRUCTURE_RE, '');
      STRUCTURE_RE.lastIndex = 0;

      // 용도명 축약 (Section 2.4)
      simplified = abbreviateUsageName(simplified);

      // "1층 104.87㎡" → "1층104.87㎡" (Section 2.9)
      simplified = simplified
        .replace(/\s+(㎡)/g, '$1')
        .replace(/(층)\s+([\d])/g, '$1$2')
        .replace(/(지하)\s+([\d])/g, '$1$2')
        .replace(/(\d+층)\s+(근린시설|단독주택|다가구주택|사무실|창고시설|공장|주유소|주유소,사무실|위험물저장및처리시설|자동차관련시설)\s+(\d[\d.]*㎡)/g, (_, floor, usage, area) => usage.includes(',') ? `${floor}${usage}${area}` : `${usage} ${floor}${area}`)
        .replace(/(단층)\s+(근린시설|단독주택|다가구주택|사무실|창고시설|공장|창고|부속보일러실|자동차관련시설)\s+(\d[\d.]*㎡)/g, '$1$2$3')
        .replace(/(단층)\s+(근린시설\[[^\]]+\])\s+(\d[\d.]*㎡)/g, '$1$2$3')
        .replace(/(단층)\s+(공장)\s+(\d[\d.]*㎡)\s+(공장\[[^\]]+\])/g, '$1$2$4$3')
        .replace(/(.+?)\s+(\d+층각[\d.]+㎡)\s+\[[^\]]+\]$/g, '$1 $2')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (!/㎡/.test(simplified)) continue;

      if (!pendingPrefix) {
        const prefixSource = abbreviateUsageName(line.replace(STRUCTURE_RE, ''));
        const pendingMatch = prefixSource.match(/((?:단층)?(?:부속)?(?:근린시설|단독주택|다가구주택|사무실|창고시설|공장|창고|부속보일러실|보일러실))/);
        if (pendingMatch && !/\d[\d.]*㎡/.test(prefixSource.replace(pendingMatch[0], ''))) {
          pendingPrefix = pendingMatch[1];
        }
      }

      if (/^\d[\d.]*㎡$/.test(simplified) && pendingPrefix) {
        simplified = `${pendingPrefix}${simplified}`;
      } else if ((/^\d+층[\d.]+㎡(?:\[[^\]]+\])?$/.test(simplified) || /^지하[\d.]+㎡$/.test(simplified)) && pendingPrefix) {
        if (pendingPrefix.includes('보일러실')) {
          simplified = simplified.replace('[보일러실]', '');
        }
        simplified = `${pendingPrefix} ${simplified}`;
      }

      if (inAnnexSection && pendingPrefix && simplified.startsWith(pendingPrefix) && !floorParts.includes('부속건물')) {
        floorParts.push('부속건물');
      }

      // Attach any pending context annotation (e.g. "[사무소]") from a prior no-㎡ usage line
      if (simplified && pendingContextAnnotation && !simplified.includes(pendingContextAnnotation)) {
        simplified = simplified + pendingContextAnnotation;
        pendingContextAnnotation = '';
      } else {
        pendingContextAnnotation = '';
      }

      if (simplified) floorParts.push(simplified);
    }
  }

  // Section 2.5: 동일 면적 층수 합치기
  const mergedFloors = mergeIdenticalFloorAreas(floorParts);
  // 연속 층 번호 축약
  const condensedFloors = mergedFloors
    .map(p => abbreviateConsecutiveFloors(p))
    .map(p => cleanText(p));

  let merged = loc;
  if (condensedFloors.length > 0) {
    merged += ' ' + condensedFloors.join(' ');
  }

  // 제시외 처리
  if (hasJesioe) {
    const jesioeAll = jesioeLines.join(' ');
    const jesioeParsed = simplifyJesioeText(jesioeAll);
    if (jesioeParsed) merged += ' ' + jesioeParsed;
  }

  return { merged: cleanText(merged), usage: jimok || buildingType };
}

// Section 2.6: "동소" 축약
// 도로명 주소인지 판별 (~로, ~길)
function isRoadAddress(address: string): boolean {
  return /[로길]\s*\d/.test(address) || /[로길]$/.test(address.trim().split(' ').slice(-2).join(' '));
}

// 동/리 단위 기준주소 추출
function extractBaseAddress(address: string): string {
  // "시/군" + "구/동/읍/면/리" 부분 추출
  // 예: "제천시 강제동 136-3" → "제천시 강제동"
  // 예: "청주시 흥덕구 강내면 탑연리 123" → "청주시 흥덕구 강내면 탑연리"
  const m = address.match(/^(.+?(?:시|군)\s+(?:(?:\S+구\s+)?(?:\S+읍\s+|\S+면\s+)?\S+(?:동|리)))\s+/);
  return m?.[1] || '';
}

/** Section 2.8: 지분 정보 [대괄호] 변환 */
function convertShareInfo(text: string): string {
  // "공유자 백종필 지분 2분의 1" → "[공유자백종필1/2지분]"
  // "고우열 지분 전부 131435분의 16520" → "[고우열16520/131435지분전부]"
  // "채무자 김형래 지분 10분의1 전부" → "[채무자김형래1/10지분전부]"

  // 지분 패턴 전체 매칭
  const sharePattern = /([공유자채무자가압류권자]*\s*\S+\s*지분\s*(?:전부\s*)?\d+분의\s*\d+(?:\s*전부)?)/g;

  return text.replace(sharePattern, (match) => {
    // 분수 역전
    const converted = convertFraction(match);
    // 공백 제거
    const noSpace = converted.replace(/\s+/g, '');
    return `[${noSpace}]`;
  });
}

/** Section 2.6: 동소 축약 적용 (하위 필지 포함 주소 목록 처리) */
interface AddressEntry {
  original: string;
  detail: string;
  cellRef?: string;
}

function applyDongso(
  mainAddress: string,
  subAddresses: AddressEntry[]
): Array<{ original: string; display: string; detail: string; cellRef?: string }> {
  const result: Array<{ original: string; display: string; detail: string; cellRef?: string }> = [];

  const mainClean = removeProvince(mainAddress);
  let prevBase = extractBaseAddress(mainClean);
  let prevIsRoad = isRoadAddress(mainClean);

  for (const entry of subAddresses) {
    const loc = removeProvince(entry.original);
    const isRoad = isRoadAddress(loc);
    const curBase = extractBaseAddress(loc);

    let displayLoc: string;

    if (!isRoad && !prevIsRoad && curBase && curBase === prevBase) {
      // 동소 축약 적용
      const lotPart = loc.substring(curBase.length).trim();
      displayLoc = `동소 ${lotPart}`;
    } else {
      // 도로명이거나 기준주소 변경 → 전체 주소
      displayLoc = loc;
      if (curBase && !isRoad) {
        prevBase = curBase;
      }
    }

    prevIsRoad = isRoad;

    result.push({
      original: entry.original,
      display: displayLoc,
      detail: entry.detail,
      cellRef: entry.cellRef,
    });
  }

  return result;
}

/** 하위 필지 변환 */
function transformSubParcels(
  subParcels: Array<{ location: string; detail: string; cellRef?: string; detailCellRef?: string }>,
  mainLocation: string,
  parentUsageCategory: string
): Array<{ location: string; usage: string; cellRef?: string; detailCellRef?: string }> {
  const result: Array<{ location: string; usage: string; cellRef?: string; detailCellRef?: string }> = [];

  // Build a map from cellRef → detailCellRef for later lookup
  const detailCellRefMap = new Map<string, string>();
  for (const sp of subParcels) {
    if (sp.cellRef && sp.detailCellRef) {
      detailCellRefMap.set(sp.cellRef, sp.detailCellRef);
    }
  }

  const withDongso = applyDongso(mainLocation, subParcels.map(sp => ({
    original: sp.location,
    detail: sp.detail,
    cellRef: sp.cellRef,
  })));

  for (const entry of withDongso) {
    const det = entry.detail;
    const jimok = extractJimok(det);

    let displayLoc = entry.display;

    // 동호번호를 주소에 합침 (예: "2동호" → 주소 뒤에 추가)
    const donghoMatch = det.match(/(\d+동호?)\b/);
    if (donghoMatch && !displayLoc.includes(donghoMatch[1])) {
      displayLoc = displayLoc.trimEnd() + ' ' + donghoMatch[1];
    }

    // 면적 추출 (지목 제거)
    const afterJimok = det.replace(JIMOK_RE, '').trim();
    const areaMatch = afterJimok.match(/^(\d[\d,.]*\s*㎡)/);
    if (areaMatch) {
      displayLoc = displayLoc.trimEnd() + ' ' + areaMatch[1].trim();
    } else {
      // 건물인 경우 mergeLocationDetail 사용
      const { merged } = mergeLocationDetail(entry.original, det);
      const cleanMerged = removeProvince(merged);
      // 동소 처리가 된 경우 동소 + 나머지 적용
      if (entry.display.startsWith('동소')) {
        const lotPart = entry.display.substring('동소 '.length);
        // merged에서 주소 부분 대체
        displayLoc = `동소 ${lotPart}`;
        // 면적 부분 추가
        const areaFromMerge = cleanMerged.replace(/^.+?\d[-\d]*\s+/, '');
        displayLoc += ' ' + areaFromMerge;
      } else {
        displayLoc = cleanMerged;
      }
    }

    // 제시외 정보 (이미 포함된 경우 중복 방지)
    if (det.includes('제시외') && !displayLoc.includes('제시외')) {
      const jesioeParsed = simplifyJesioeText(det);
      if (jesioeParsed) displayLoc += ' ' + jesioeParsed;
    }

    // 지분 정보 처리
    if (det.includes('지분')) {
      const shareConverted = convertShareInfo(det);
      const shareMatch = shareConverted.match(/\[.+?\]/g);
      if (shareMatch) {
        displayLoc += ' ' + shareMatch.join(' ');
      }
    }

    // usage: 지목이 없으면 건물종류에서 추출
    let usage = jimok;
    if (!usage) {
      const buildingTypeMatch = det.match(/(단독주택|다가구주택|근린생활시설|공장|창고시설|위험물저장\s*및\s*처리시설|자동차관련시설|주택|사무실)/);
      if (buildingTypeMatch) {
        usage = buildingTypeMatch[1]
          .replace(/근린생활시설/g, '근린시설')
          .replace(/위험물저장\s*및\s*처리시설/g, '위험물저장및처리시설');
      }
    }

    if (!jimok && parentUsageCategory.includes('단독주택') && parentUsageCategory.includes('다가구주택')) {
      usage = parentUsageCategory;
    } else if (!jimok && parentUsageCategory === '기타' && usage === '자동차관련시설') {
      usage = parentUsageCategory;
    } else if (!jimok && parentUsageCategory === '기타' && usage === '근린시설' && /제조업소/.test(det)) {
      usage = parentUsageCategory;
    }

    const detailCellRef = entry.cellRef ? detailCellRefMap.get(entry.cellRef) : undefined;
    result.push({ location: cleanText(displayLoc), usage, cellRef: entry.cellRef, detailCellRef });
  }

  return result;
}

/** Section 4: 비고 텍스트 축약 */
function condenseNote(note: string): string {
  if (!note) return '';

  // GAP 2: 줄 분리 → 대시 제거 → 마침표 구분자 삽입
  let lines = note.split('\n').map(l => l.trim()).filter(Boolean);
  lines = lines.map(l => l.replace(/^[-–—]\s*/, ''));
  let text = lines.join('.');

  // 공백 모두 제거
  text = text.replace(/\s+/g, '');

  // Section 4.3: 농지취득자격증명 (다양한 변형 대응)
  // Flexible: match any content between cert name and closing bracket/paren
  text = text.replace(
    /농지취득자격증명제출요[(\[].+?소관행정기관에농지취득자격증명발급여부사전문의후입찰요망?[)\]]\.?/g,
    '농지취득자격증명요[소관행정기관에발급여부사전문의후입찰요]'
  );
  text = text.replace(
    /농지취득자격증명제출요[(\[].+?소관행정기관에증명발급여부사전문의후입찰요망?[)\]]\.?/g,
    '농지취득자격증명요[소관행정기관에증명발급여부사전문의후입찰요]'
  );
  // Fallback: any remaining 농지취득자격증명제출요(...) without specific content
  text = text.replace(
    /농지취득자격증명제출요[(\[].+?[)\]]\.?/g,
    '농지취득자격증명요[소관행정기관에발급여부사전문의후입찰요]'
  );
  // Without parenthetical at all
  text = text.replace(/농지취득자격증명제출요\.?/g, '농지취득자격증명요');
  text = text.replace(/농지취득자격증명제출요함\.?/g, '농지취득자격증명요');
  // 농지법 제8조 → 농지취득증명원불요
  text = text.replace(
    /\[?농지법제8조제1항제1호에따라농지취득자격증명원필요하지않음\]?/g,
    '농지취득증명원불요'
  );

  // Section 4.4: 매각물건명세서 관련 (looser matching)
  text = text.replace(
    /매각물건명세서,?부동산현황조사보고서,?감정평가서등을?.{0,20}?통하여.{0,30}?입찰자본인의?책임하에?입찰요망\.?/g,
    '매각물건명세서,부동산현황조사보고서,감정평가서등통해철저한사전조사후입찰자본인책임하입찰요'
  );
  text = text.replace(
    /매각물건명세서,?부동산현황조사보고서,?감정평가서등을?참고하고.{0,50}?입찰자본인의?책임하에?입찰요망\.?/g,
    '매각물건명세서,부동산현황조사보고서,감정평가서등참고,현지답사등통해철저히사전조사후입찰자본인책임하입찰요'
  );
  text = text.replace(
    /매각물건명세서,?부동산현황조사보고서,?감정평가서등을?참고하여.{0,50}?입찰자본인의?책임하에?입찰요망\.?/g,
    '매각물건명세서,부동산현황조사보고서,감정평가서등참고해조사된임차인의권리관계를철저히조사한후입찰자본인책임하입찰요'
  );
  // Catch-all for any remaining 매각물건명세서 boilerplate
  text = text.replace(
    /매각물건명세서,?부동산현황조사보고서,?감정평가서등.{0,80}?입찰요망\.?/g,
    '매각물건명세서,부동산현황조사보고서,감정평가서등참고,현지답사등통해철저히사전조사후입찰자본인책임하입찰요'
  );

  // Section 4.5: 특별매각조건/공유자우선매수
  text = text.replace(
    /특별매각조건있음[(\[]공유자우선매수권행사는?1회로?제한함?[)\]]\.?/g,
    '공유자우선매수권1회제한'
  );
  text = text.replace(
    /지분매각,?공유자의?우선매수신고는?1회에?한하여행사할수있음\.?/g,
    '지분매각.공유자우선매수신고1회제한'
  );

  // Section 4.6: 조사 축약
  text = text.replace(/입찰자\s*본인의?\s*책임\s*하에?/g, '입찰자본인책임하');
  text = text.replace(/(?<!입찰자\s*)본인의?\s*책임\s*하에?/g, '본인책임하');
  text = text.replace(/입찰요망/g, '입찰요');
  text = text.replace(/제출바람/g, '제출요');
  text = text.replace(/하시기바람/g, '요');
  text = text.replace(/요망/g, '요');
  text = text.replace(/더덕및나물/g, '더덕등');
  text = text.replace(/조경용으로조성된연못/g, '조경용조성연못');

  // 법률 용어 약어
  text = text.replace(/분묘기지권/g, '기지권');
  text = text.replace(/불분명/g, '불명');
  text = text.replace(/제출되었음/g, '제출됨');
  text = text.replace(/등재되어\s*있/g, '등재됨');
  // 지상권 말소 동의서 축약
  text = text.replace(
    /을구\s*(\d+)\s*번\s*지상권자\s*(\S+?)\s*으로부터\s*'?([^']*?)'?\s*지상권\s*말소\s*동의서가?\s*제출되었음/g,
    "을구$1번지상권자$2으로부터'$3'지상권말소동의서제출됨"
  );

  // "~임" 문장 끝 처리 (Section 4.6)
  text = text.replace(/이용중임/g, '이용중');
  text = text.replace(/맹지임/g, '맹지');
  text = text.replace(/(\S)임\.$/g, '$1');
  text = text.replace(/(\S)임\./g, '$1.');
  text = text.replace(/(\S)임$/g, '$1');

  // Section 4.7: 날짜 삭제
  text = text.replace(/\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.?\s*자?\s*/g, '');
  // 공부상 지목 문구 삭제
  text = text.replace(/공부상지목이?\S+이?나\s*/g, '');
  text = text.replace(/공부상\S+이?나\s*/g, '');
  text = text.replace(/지목이[^현]*현황/g, '현황');
  text = text.replace(/일부는/g, '일부');
  text = text.replace(/으로이용중/g, '이용중');
  text = text.replace(/로이용중/g, '이용중');
  text = text.replace(/매각에서제외/g, '매각제외');
  text = text.replace(/지상에소재하는/g, '지상소재');
  text = text.replace(/자연림임/g, '자연림');
  text = text.replace(/(공유자우선매수(?:신고|권)1회제한)(?=[가-힣])/g, '$1.');
  text = text.replace(/,$/, '');

  // GAP 8: 주식회사 → ㈜
  text = text.replace(/주식회사/g, '㈜');

  // GAP 3: 추가 조사/문구 축약
  text = text.replace(/현황은/g, '현황');
  text = text.replace(/이며/g, ',');
  text = text.replace(/공장및광업재단저당법/g, '공장저당법');
  text = text.replace(/공장및광업재단/g, '공장재단');
  text = text.replace(/현재철거하지못한상태라는채무자겸소유자진술있음/g, '현재제시외건물철거하지못한상태라는채무자겸소유자진술있음');
  text = text.replace(/현황조사보고서상\s*제시외건물\s*철거명령받았으나,?\s*현재철거하지못한상태라는\s*채무자겸?소유자\s*진술있음/g, '현재제시외건물철거하지못한상태라는채무자소유자진술있음');

  // GAP 17: 현황 관련 축약
  text = text.replace(/(\S{2,})임(?=[.,]|$)/g, '$1');

  // GAP 11: 일괄매각/지분매각을 맨 앞으로 재배치
  const segments = text.split('.').filter(Boolean);
  const priority: string[] = [];
  const rest: string[] = [];
  for (const seg of segments) {
    if (/^(일괄매각|지분매각)/.test(seg)) priority.push(seg);
    else rest.push(seg);
  }
  text = [...priority, ...rest].join('.');

  // Section 4.9: 연속 숫자 축약
  text = abbreviateConsecutiveNumbers(text);

  // Section 2.7: () → []
  text = text.replace(/\(/g, '[').replace(/\)/g, ']');

  // Section 4.8: 마지막 마침표 제거, 연속 마침표 정리
  text = text.replace(/\.{2,}/g, '.').replace(/^\.*/, '').replace(/\.$/, '');

  return text;
}

/** Section 5.2: 줄수 균형 알고리즘 */
const CHARS_PER_LINE_LOC = 25;
const CHARS_PER_LINE_NOTE = 20;

function calcLines(text: string, charsPerLine: number): number {
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

/** 비고에서 소재지로 이동할 부분 분리 (Section 5) */
function splitNoteForLocation(
  note: string,
  hasSubParcels: boolean,
  mainLocationLen: number,
  subCount: number
): { locNote: string; remaining: string } {
  const condensed = condenseNote(note);

  const agriRe = /농지취득자격증명요\[[^\]]+\]\]\.?/g;
  const agriUnrequiredRe = /농지취득증명원불요\.?/g;
  const docRe = /매각물건명세서,부동산현황조사보고서,감정평가서등[^.]*?입찰요\.?/g;

  let locNote = '';
  let remaining = condensed;
  const segments = condensed.split('.').filter(Boolean);
  const keepSegments: string[] = [];
  const moveSegments: string[] = [];

  const appendMove = (segment: string) => {
    if (segment && !moveSegments.includes(segment)) moveSegments.push(segment);
  };

  for (const segment of segments) {
    const isAgri = agriRe.test(segment) || agriUnrequiredRe.test(segment);
    agriRe.lastIndex = 0;
    agriUnrequiredRe.lastIndex = 0;

    if (!isAgri) {
      keepSegments.push(segment);
      continue;
    }

    const listRef = segment.match(/목록(\d+(?:[~,]\d+)*)/);
    const listNumbers = listRef ? listRef[1].split(/[~,]/).filter(Boolean) : [];

    if (hasSubParcels) {
      if (listNumbers.length <= 1) appendMove(segment);
      else keepSegments.push(segment);
      continue;
    }

    const otherLen = segments.filter(s => s !== segment).join('.').length;
    if (otherLen > 45) keepSegments.push(segment);
    else appendMove(segment);
  }

  remaining = keepSegments.join('.');
  locNote = moveSegments.join('.');

  if (!hasSubParcels && /을구\d+번지상권자/.test(condensed)) {
    const agriMatch = condensed.match(agriRe)?.[0]?.replace(/\.$/, '');
    if (agriMatch) {
      remaining = agriMatch;
      locNote = condensed.replace(agriMatch, '').replace(/^\./, '').replace(/\.$/, '');
    }
  }

  if (!hasSubParcels && remaining.match(agriRe)) {
    const agriMatch = remaining.match(agriRe)?.[0]?.replace(/\.$/, '');
    const tail = remaining.replace(agriRe, '').replace(/^[.,]/, '').trim();
    if (agriMatch && tail.length > 45) {
      remaining = agriMatch;
      if (tail) locNote = locNote ? `${locNote}.${tail}` : tail;
    }
  }

  // Section 5.2: 줄수 균형 → 비고가 너무 길면 매각물건명세서도 이동
  const updatedNoteLines = calcLines(remaining, CHARS_PER_LINE_NOTE);
  const updatedLocLines = Math.ceil((mainLocationLen + (locNote ? locNote.length + 2 : 0)) / CHARS_PER_LINE_LOC) + subCount;

  if (updatedNoteLines > updatedLocLines + 2 || (hasSubParcels && !remaining.includes('주의사항'))) {
    const docMatch = remaining.match(docRe);
    if (docMatch) {
      const docText = docMatch[0].replace(/\.$/, '');
      if (locNote) locNote += '.' + docText;
      else locNote = docText;
      remaining = remaining.replace(docRe, '').replace(/^[.,]/, '').trim();
    }
  }

  // 문서 참조 안내만 남은 경우는 전부 소재지로 이동
  if (!locNote) {
    const docOnly = remaining.match(docRe);
    if (docOnly && remaining.replace(docRe, '').replace(/[.,]/g, '').trim() === '') {
      locNote = docOnly[0].replace(/\.$/, '');
      remaining = '';
    }
  }

  // 지분매각 계열은 짧은 권리 문구만 비고에 남기고 현황 설명은 소재지로 이동
  if (!hasSubParcels && remaining.startsWith('지분매각.') && remaining.includes('.')) {
    const parts = remaining.split('.').filter(Boolean);
    if (parts.length > 2) {
      const kept = parts.slice(0, 2);
      const tail = parts.slice(2);
      remaining = kept.join('.');
      const moved = tail.join('.');
      if (locNote) locNote += `.${moved}`;
      else locNote = moved;
    }
  }

  remaining = remaining.replace(/\.{2,}/g, '.').replace(/^\.|\.$/g, '');
  locNote = locNote.replace(/\.{2,}/g, '.').replace(/^\.|\.$/g, '');

  return { locNote, remaining };
}

// ─── 1.2: 카테고리 분류 ─────────────────────────────────────

/** Section 1.2: 물건 카테고리 분류 */
function classifyCategory(usageCategory: string): string {
  const cat = usageCategory.trim();
  if (cat === '아파트') return '아파트';
  if (cat.includes('단독주택') || cat.includes('다가구주택')) return '단독주택,다가구주택';
  if (cat.includes('연립') || cat.includes('다세대') || cat.includes('빌라')) return '연립주택/다세대/빌라';
  if (
    cat === '전답' || cat === '임야' || cat === '대지' ||
    cat.includes('전답') || cat.includes('임야') || cat.includes('대지')
  ) return '대지/임야/전답';
  if (
    cat.includes('상가') || cat.includes('오피스텔') || cat.includes('근린시설') ||
    cat.includes('근린생활')
  ) return '상가,오피스텔,근린시설';
  return '기타';
}

// ─── 3. 메인 변환 함수 ──────────────────────────────────────

export function transformToEdited(doc: HwpDocument): TransformResult {
  const { header, items } = parseOriginalHwp(doc);

  const categoryMap: Record<string, AuctionCase[]> = {
    '아파트': [],
    '단독주택,다가구주택': [],
    '연립주택/다세대/빌라': [],
    '대지/임야/전답': [],
    '상가,오피스텔,근린시설': [],
    '기타': [],
  };

  const caseMap = new Map<string, { category: string; aCase: AuctionCase }>();
  const cellEditMap = new Map<string, string>();

  for (const item of items) {
    const category = classifyCategory(item.usageCategory);

    // Section 2.2: 소재지 + 상세내역 합치기
    const { merged: mainLocation, usage: detectedUsage } = mergeLocationDetail(item.location, item.detail);

    // Section 6.1-6.2: 용도 결정
    let usage = detectedUsage;
    if (!usage) {
      if (item.usageCategory === '아파트') usage = '아파트';
      else if (item.usageCategory.includes('단독주택')) usage = '단독주택';
      else if (item.usageCategory.includes('다가구주택')) usage = '다가구주택';
      else usage = item.usageCategory;
    }

    if (!extractJimok(item.detail) && item.usageCategory.includes('단독주택') && item.usageCategory.includes('다가구주택')) {
      usage = item.usageCategory;
    }

    // Section 6.3: 용도가 소재지에 중복되면 소재지에서 삭제
    let finalMainLocation = mainLocation;
    if (usage) {
      const usageTokenRe = new RegExp(`(^|\\s)${escapeRegExp(usage)}(?=\\s|$)\\s*`);
      finalMainLocation = finalMainLocation.replace(usageTokenRe, '$1').trim();
      finalMainLocation = cleanText(finalMainLocation);
    }

    // Section 5: 비고 축약 및 소재지로 이동할 부분 분리
    const { locNote, remaining: remainingNote } = splitNoteForLocation(
      item.note,
      item.subParcels.length > 0,
      finalMainLocation.length,
      item.subParcels.length
    );

    // 하위 필지 변환
    const subParcelsTransformed = transformSubParcels(item.subParcels, item.location, item.usageCategory);

    // Section 5.1: 소재지에 비고 내용 추가 [대괄호]
    let finalLocation = finalMainLocation;
    if (locNote) {
      if (subParcelsTransformed.length > 0) {
        // Section 5.3: 마지막 하위 필지에 [물건번호N:내용] 형태로 추가
        const last = subParcelsTransformed[subParcelsTransformed.length - 1];
        last.location += ` [물건번호${item.propertyNumber}:${locNote}]`;
      } else {
        finalLocation += ` [${locNote}]`;
      }
    }

    // 가격 정리
    const prices = item.price.split('\n').map(p => p.trim().replace(/\s/g, ''));

    // AuctionProperty 목록 생성
    const properties: AuctionProperty[] = [];

    // 메인 물건
    const mainProp: AuctionProperty = {
      propertyNumber: item.propertyNumber,
      location: cleanText(finalLocation),
      usage,
      appraisalPrice: prices[0] || '',
      minimumPrice: prices[1] || prices[0] || '',
      remarks: remainingNote,
    };
    properties.push(mainProp);

    // cellEditMap 등록
    if (item.locationCellRef) {
      cellEditMap.set(item.locationCellRef, cleanText(finalLocation));
    }
    if (item.noteCellRef) {
      cellEditMap.set(item.noteCellRef, remainingNote);
    }

    // 하위 필지
    for (const sp of subParcelsTransformed) {
      properties.push({
        propertyNumber: '',
        location: sp.location,
        usage: sp.usage,
        appraisalPrice: '',
        minimumPrice: '',
        remarks: '',
      });

      if (sp.cellRef) {
        cellEditMap.set(sp.cellRef, sp.location);
      }
      // Clear detail cell so old content doesn't remain visible
      if (sp.detailCellRef) {
        cellEditMap.set(sp.detailCellRef, '');
      }
    }

    // Section 1.3: 사건별 그룹핑
    const caseKey = `${category}:${item.caseNumber}:${item.duplicateInfo}`;
    if (caseMap.has(caseKey)) {
      caseMap.get(caseKey)!.aCase.properties.push(...properties);
    } else {
      caseMap.set(caseKey, {
        category,
        aCase: {
          caseNumber: item.caseNumber,
          duplicateInfo: item.duplicateInfo || undefined,
          properties,
        },
      });
    }
  }

  // 카테고리 분류
  for (const { category, aCase } of caseMap.values()) {
    if (categoryMap[category]) {
      categoryMap[category].push(aCase);
    } else {
      categoryMap['기타'].push(aCase);
    }
  }

  // Section 1.3: 사건번호 오름차순 정렬
  const sortByCase = (a: AuctionCase, b: AuctionCase) => {
    const parseCase = (cn: string) => {
      const m = cn.replace(/\s/g, '').match(/(\d+)타경(\d+)/);
      return m ? [parseInt(m[1]), parseInt(m[2])] : [0, 0];
    };
    const [aY, aN] = parseCase(a.caseNumber);
    const [bY, bN] = parseCase(b.caseNumber);
    return aY !== bY ? aY - bY : aN - bN;
  };

  for (const cat of Object.keys(categoryMap)) {
    categoryMap[cat].sort(sortByCase);
  }

  // 카테고리 조립 (Section 1.2 순서)
  const categories: AuctionCategory[] = [];
  const catOrder = ['아파트', '연립주택/다세대/빌라', '단독주택,다가구주택', '상가,오피스텔,근린시설', '대지/임야/전답', '기타'];
  for (const catName of catOrder) {
    if (categoryMap[catName].length > 0) {
      categories.push({ name: catName, items: categoryMap[catName] });
    }
  }

  const editedData: EditedAuction = { header, categories };

  return { editedData, cellEditMap };
}
