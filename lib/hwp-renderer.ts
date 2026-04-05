/**
 * HWP 문서 구조를 한컴독스 수준으로 HTML 렌더링
 * hwpilot read 결과(JSON) → 원본 문서와 동일한 외형의 HTML
 * Google Fonts 웹폰트로 HWP 폰트 매핑
 */

// ─── Types ──────────────────────────────────────────────────

interface CharShape {
  id: number;
  fontRef?: number;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
}

interface ParaShape {
  id: number;
  align?: string;
  headingLevel?: number;
}

interface Font {
  id: number;
  name: string;
}

interface Run {
  text: string;
  charShapeRef?: number;
}

interface Paragraph {
  ref: string;
  runs: Run[];
  paraShapeRef?: number;
  styleRef?: number;
}

interface TableCell {
  ref: string;
  paragraphs: Paragraph[];
  colSpan: number;
  rowSpan: number;
}

interface TableRow {
  cells: TableCell[];
}

interface Table {
  ref: string;
  rows: TableRow[];
}

interface Section {
  index: number;
  paragraphs: Paragraph[];
  tables: Table[];
}

interface HwpHeader {
  charShapes?: CharShape[];
  paraShapes?: ParaShape[];
  fonts?: Font[];
  styles?: unknown[];
}

interface HwpDocument {
  format: string;
  sections: Section[];
  header?: HwpHeader;
}

// ─── Font Mapping ───────────────────────────────────────────
// HWP 내장 폰트명 → Google Fonts 웹폰트 매핑

const FONT_MAP: Record<string, string> = {
  // 명조체 계열 → Noto Serif KR
  '판결서체': "'Noto Serif KR', serif",
  '한양신명조': "'Noto Serif KR', serif",
  '바탕': "'Noto Serif KR', serif",
  '바탕체': "'Noto Serif KR', serif",
  '신명조': "'Noto Serif KR', serif",
  '중명조': "'Noto Serif KR', serif",
  '함초롬바탕': "'Noto Serif KR', serif",

  // 고딕체 계열 → Noto Sans KR
  '굴림': "'Noto Sans KR', sans-serif",
  '굴림체': "'Noto Sans KR', sans-serif",
  '돋움': "'Noto Sans KR', sans-serif",
  '돋움체': "'Noto Sans KR', sans-serif",
  '휴먼고딕': "'Noto Sans KR', sans-serif",
  '맑은 고딕': "'Noto Sans KR', sans-serif",
  '함초롬돋움': "'Noto Sans KR', sans-serif",

  // 기타
  'Noto': "'Noto Sans KR', sans-serif",
};

function mapFont(hwpFontName?: string): string {
  if (!hwpFontName) return "'Noto Serif KR', serif";
  return FONT_MAP[hwpFontName] ?? `'${hwpFontName}', 'Noto Serif KR', serif`;
}

// ─── Style Lookup ───────────────────────────────────────────

class StyleLookup {
  private charShapes: Map<number, CharShape> = new Map();
  private paraShapes: Map<number, ParaShape> = new Map();
  private fonts: Map<number, Font> = new Map();

  constructor(header?: HwpHeader) {
    if (!header) return;
    for (const cs of header.charShapes ?? []) this.charShapes.set(cs.id, cs);
    for (const ps of header.paraShapes ?? []) this.paraShapes.set(ps.id, ps);
    for (const f of header.fonts ?? []) this.fonts.set(f.id, f);
  }

  getCharShape(ref?: number): CharShape | undefined {
    return ref != null ? this.charShapes.get(ref) : undefined;
  }

  getParaShape(ref?: number): ParaShape | undefined {
    return ref != null ? this.paraShapes.get(ref) : undefined;
  }

  getFontName(fontRef?: number): string | undefined {
    if (fontRef == null) return undefined;
    return this.fonts.get(fontRef)?.name;
  }

  getRunStyle(charShapeRef?: number): string {
    const cs = this.getCharShape(charShapeRef);
    if (!cs) return '';

    const parts: string[] = [];
    if (cs.fontSize) parts.push(`font-size:${cs.fontSize}pt`);
    if (cs.bold) parts.push('font-weight:700');
    // 한글 폰트는 italic 무시 (HWP 메타데이터에서 잘못 설정되는 경우가 많음)
    const fontName = this.getFontName(cs.fontRef);
    const isKoreanFont = fontName && /[가-힣]/.test(fontName);
    if (cs.italic && !isKoreanFont) parts.push('font-style:italic');
    if (cs.underline) parts.push('text-decoration:underline');
    if (cs.color && cs.color !== '#000000') parts.push(`color:${cs.color}`);

    parts.push(`font-family:${mapFont(fontName)}`);

    return parts.length > 0 ? ` style="${parts.join(';')}"` : '';
  }

  getParaStyle(paraShapeRef?: number): string {
    const ps = this.getParaShape(paraShapeRef);
    if (!ps) return '';

    const parts: string[] = [];
    if (ps.align === 'center') parts.push('text-align:center');
    else if (ps.align === 'right') parts.push('text-align:right');
    else if (ps.align === 'justify') parts.push('text-align:justify');

    return parts.length > 0 ? ` style="${parts.join(';')}"` : '';
  }
}

// ─── HTML Rendering ─────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');
}

function renderRun(run: Run, styles: StyleLookup): string {
  const style = styles.getRunStyle(run.charShapeRef);
  const text = escapeHtml(run.text);
  return style ? `<span${style}>${text}</span>` : text;
}

function renderParagraph(p: Paragraph, styles: StyleLookup): string {
  if (!p.runs || p.runs.length === 0) return '';
  return p.runs.map((r) => renderRun(r, styles)).join('');
}

function renderCell(cell: TableCell, styles: StyleLookup): string {
  const paragraphs = cell.paragraphs
    .map((p) => {
      const content = renderParagraph(p, styles);
      if (!content) return '';
      const paraStyle = styles.getParaStyle(p.paraShapeRef);
      return paraStyle ? `<div${paraStyle}>${content}</div>` : content;
    })
    .filter(Boolean);

  const content = paragraphs.join('<br/>');

  const attrs: string[] = [];
  if (cell.colSpan > 1) attrs.push(`colspan="${cell.colSpan}"`);
  if (cell.rowSpan > 1) attrs.push(`rowspan="${cell.rowSpan}"`);

  return `<td ${attrs.join(' ')}>${content || '&nbsp;'}</td>`;
}

function isHeaderRow(row: TableRow): boolean {
  const headerKeywords = ['사건번호', '물건', '번호', '용 도', '소재지', '소  재  지', '감정', '최저', '비고', '비     고', '매   각', '상 세', '단위'];
  for (const cell of row.cells) {
    for (const p of cell.paragraphs) {
      const text = p.runs.map((r) => r.text).join('');
      if (headerKeywords.some((kw) => text.includes(kw))) return true;
    }
  }
  return false;
}

function renderTable(table: Table, tableIndex: number, styles: StyleLookup): string {
  const rows = table.rows
    .map((row) => {
      const isHdr = isHeaderRow(row);
      const cls = isHdr ? ' class="hdr"' : '';
      return `<tr${cls}>${row.cells.map((cell) => renderCell(cell, styles)).join('')}</tr>`;
    })
    .join('\n');

  const firstCellText = table.rows[0]?.cells[0]?.paragraphs[0]?.runs[0]?.text ?? '';
  const isInfoHeader = tableIndex === 0 && table.rows.length <= 3 && !firstCellText.includes('단위');
  const cls = isInfoHeader ? 'info' : 'data';

  return `<table class="${cls}">\n${rows}\n</table>`;
}

function renderSection(section: Section, styles: StyleLookup): string {
  type Element = { type: 'p'; data: Paragraph } | { type: 't'; data: Table; index: number };
  const elements: Element[] = [];

  for (const p of section.paragraphs) {
    elements.push({ type: 'p', data: p });
  }

  let tableIdx = 0;
  for (const t of section.tables) {
    elements.push({ type: 't', data: t, index: tableIdx++ });
  }

  elements.sort((a, b) => {
    const refA = a.type === 'p' ? a.data.ref : a.data.ref;
    const refB = b.type === 'p' ? b.data.ref : b.data.ref;
    return refA.localeCompare(refB, undefined, { numeric: true });
  });

  const parts: string[] = [];
  for (const el of elements) {
    if (el.type === 'p') {
      const text = renderParagraph(el.data, styles);
      if (text.trim()) {
        const paraStyle = styles.getParaStyle(el.data.paraShapeRef);
        parts.push(`<p class="para"${paraStyle}>${text}</p>`);
      }
    } else {
      parts.push(renderTable(el.data, el.index, styles));
    }
  }

  return parts.join('\n');
}

// ─── Main Export ─────────────────────────────────────────────

export function renderHwpToHtml(doc: HwpDocument): string {
  const styles = new StyleLookup(doc.header);
  const body = doc.sections.map((s) => renderSection(s, styles)).join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&family=Noto+Serif+KR:wght@400;700&display=swap" rel="stylesheet"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Noto Serif KR', serif;
    font-size: 10pt;
    line-height: 1.6;
    color: #000;
    background: #fff;
    padding: 24px 28px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  .para {
    margin: 2px 0;
    white-space: pre-wrap;
  }

  /* ─── 공통 테이블 ─── */
  table {
    border-collapse: collapse;
    width: 100%;
    table-layout: fixed;
  }

  td {
    border: 0.5pt solid #222;
    padding: 3px 5px;
    vertical-align: top;
    font-size: 9pt;
    line-height: 1.4;
    word-break: break-all;
    overflow-wrap: break-word;
  }

  /* ─── 상단 정보 테이블 ─── */
  table.info {
    margin-bottom: 0;
  }

  table.info td {
    padding: 6px 10px;
    vertical-align: middle;
    font-size: 10pt;
    line-height: 1.6;
    border-width: 1pt;
    border-color: #000;
  }

  /* ─── 메인 데이터 테이블 ─── */
  table.data {
    margin-top: -0.5pt;
  }

  table.data td {
    font-size: 8.5pt;
    line-height: 1.35;
    padding: 2.5px 4px;
    border-color: #333;
  }

  /* ─── 헤더 행 ─── */
  tr.hdr td {
    text-align: center;
    font-weight: 700;
    background: #f7f7f7;
    vertical-align: middle;
    font-size: 9pt;
    border-color: #000;
    padding: 4px 4px;
  }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
