/**
 * InDesign .indd 템플릿을 UXP Bridge로 직접 편집 후 PDF 내보내기
 *
 * 흐름: .indd 템플릿 복사 → InDesign에서 열기 → 카테고리별 테이블 찾기
 *       → 셀 내용 교체 → PDF 내보내기 → 닫기
 *
 * 사전 조건:
 * 1. InDesign 2024+ 실행 중
 * 2. indesign-uxp-server bridge 실행 중 (http://127.0.0.1:3000)
 */

import type { EditedAuction } from './editing-rules';
import { copyFile } from 'fs/promises';

const BRIDGE_URL = 'http://127.0.0.1:3000';
const BRIDGE_TIMEOUT = 120_000; // 2분

// ---------- Bridge 통신 ----------

async function executeInDesign(code: string): Promise<unknown> {
  const response = await fetch(`${BRIDGE_URL}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
    signal: AbortSignal.timeout(BRIDGE_TIMEOUT),
  });

  const raw = await response.text();
  let data: { error?: string; result?: unknown } = {};
  if (raw) {
    try { data = JSON.parse(raw); } catch {
      throw new Error(`Bridge returned non-JSON (${response.status})`);
    }
  }

  if (!response.ok || data.error) {
    throw new Error(data.error || `Bridge error: ${response.status}`);
  }

  return data.result;
}

export async function isInDesignAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${BRIDGE_URL}/status`, { signal: AbortSignal.timeout(2000) });
    const d = await res.json() as { connected?: boolean };
    return d.connected === true;
  } catch {
    return false;
  }
}

// ---------- 메인 함수 ----------

export interface InddEditResult {
  success: boolean;
  message: string;
  overset: boolean;          // 텍스트 오버플로 감지 여부
  categoriesEdited: number;
}

/**
 * .indd 템플릿을 복사 → 편집 → PDF 내보내기
 */
export async function editInddAndExportPdf(
  templateInddPath: string,
  data: EditedAuction,
  outputPdfPath: string,
): Promise<InddEditResult> {
  // 템플릿을 작업 복사본으로 복사
  const workingPath = outputPdfPath.replace(/\.pdf$/i, '-work.indd');
  await copyFile(templateInddPath, workingPath);

  const script = buildUxpScript(workingPath, outputPdfPath, data);
  const result = await executeInDesign(script) as Record<string, unknown> | null;

  if (!result || result.success !== true) {
    throw new Error((result?.error as string) || 'InDesign 편집 실패');
  }

  return {
    success: true,
    message: (result.message as string) || 'PDF 내보내기 완료',
    overset: (result.overset as boolean) || false,
    categoriesEdited: (result.categoriesEdited as number) || 0,
  };
}

// ---------- UXP 스크립트 생성 ----------

function buildUxpScript(
  inddPath: string,
  pdfPath: string,
  data: EditedAuction,
): string {
  // 데이터를 스크립트에 삽입할 수 있도록 직렬화
  // \n → \r 변환 (InDesign은 \r을 단락 구분으로 사용)
  const serialized = JSON.stringify(data);

  return `
try {
  const { ExportFormat, SaveOptions } = require('indesign');
  const data = ${serialized};

  const doc = await app.open(${JSON.stringify(inddPath)});

  try {
    function replaceStoryText(story, replacements) {
      if (!story || !story.isValid) return;
      try {
        for (const [from, to] of replacements) {
          if (!from || !to) continue;
          app.findTextPreferences = NothingEnum.nothing;
          app.changeTextPreferences = NothingEnum.nothing;
          app.findTextPreferences.findWhat = from;
          app.changeTextPreferences.changeTo = to;
          story.changeText();
        }
      } catch (e) { /* 무시 */ }
      finally {
        try {
          app.findTextPreferences = NothingEnum.nothing;
          app.changeTextPreferences = NothingEnum.nothing;
        } catch (e) { /* 무시 */ }
      }
    }

    // ============================================================
    // 1. 카테고리별 테이블 찾기
    //    InDesign UXP 컬렉션은 .item(i) 사용
    // ============================================================
    const KNOWN_CATS = ['아파트', '연립주택/다세대/빌라', '단독주택,다가구주택', '대지/임야/전답', '상가,오피스텔,근린시설', '기타'];
    const FALLBACK_CAT_ALIASES = {
      '연립주택/다세대/빌라': ['연립주택/다세대/빌라'],
      '상가,오피스텔,근린시설': ['상가,오피스텔,근린시설'],
      '단독주택,다가구주택': ['단독주택,다가구주택'],
      '대지/임야/전답': ['대지/임야/전답'],
      '아파트': ['아파트'],
      '기타': ['기타']
    };
    const catTableMap = {};
    const storyCount = doc.stories.length;

    for (let si = 0; si < storyCount; si++) {
      let story;
      try { story = doc.stories.item(si); } catch { continue; }
      if (!story || !story.isValid) continue;
      if (story.tables.length === 0) continue;

      let fullText = '';
      try { fullText = story.contents || ''; } catch { continue; }

      for (const catName of KNOWN_CATS) {
        if (catTableMap[catName]) continue;
        const aliases = FALLBACK_CAT_ALIASES[catName] || [catName];
        if (aliases.some(alias => fullText.indexOf('[' + alias + ']') !== -1 || fullText.indexOf(alias) !== -1)) {
          catTableMap[catName] = story.tables.item(0);
        }
      }
    }

    // ============================================================
    // 1-1. 헤더/풋터 텍스트 치환
    // ============================================================
    const header = data.header || {};
    const replacements = [
      ['경매2계', header.department || ''],
      ['경매 2계', (header.department || '').replace(/경매(\\d+)계/, '경매 $1계')],
      ['청주지방법원 제천지원', header.court || ''],
      ['매각기일 : 2025. 2. 9.(일) 10:00', header.saleDate ? '매각기일 : ' + header.saleDate : ''],
      ['매각결정기일 : 2025. 2. 16.(일) 10:00', header.saleDecisionDate ? '매각결정기일 : ' + header.saleDecisionDate : ''],
      ['매각장소 : 제천지원 경매법정', header.salePlace ? '매각장소 : ' + header.salePlace : ''],
      ['2025. 2. 9.', header.publishDate || ''],
      ['사법보좌관', header.judge ? '사법보좌관 ' + header.judge : ''],
    ];

    for (let si = 0; si < storyCount; si++) {
      let story;
      try { story = doc.stories.item(si); } catch { continue; }
      if (!story || !story.isValid) continue;
      replaceStoryText(story, replacements);
    }

    // 폴백: 미발견 카테고리는 남은 테이블에 순서대로 할당
    const unmapped = KNOWN_CATS.filter(c => !catTableMap[c]);
    if (unmapped.length > 0) {
      const spareTables = [];
      for (let si = 0; si < storyCount; si++) {
        let story;
        try { story = doc.stories.item(si); } catch { continue; }
        if (!story || !story.isValid || story.tables.length === 0) continue;
        for (let ti = 0; ti < story.tables.length; ti++) {
          const tbl = story.tables.item(ti);
          const used = Object.values(catTableMap).some(t => t === tbl);
          if (!used) spareTables.push(tbl);
        }
      }
      for (let i = 0; i < unmapped.length && i < spareTables.length; i++) {
        catTableMap[unmapped[i]] = spareTables[i];
      }
    }

    let categoriesEdited = 0;

    // ============================================================
    // 2. 각 카테고리 테이블 편집
    // ============================================================
    for (const cat of data.categories) {
      const normalizedName = cat.name === '연립주택/다세대/빌라'
        ? '연립주택/다세대/빌라'
        : cat.name === '상가,오피스텔,근린시설'
          ? '상가,오피스텔,근린시설'
          : cat.name;
      const table = catTableMap[normalizedName];
      if (!table || !table.isValid) continue;

      // --- 데이터 행 빌드 ---
      const dataRows = [];
      for (const item of cat.items) {
        const props = item.properties || [];
        for (let pi = 0; pi < props.length; pi++) {
          const prop = props[pi];
          let caseText = '';
          if (pi === 0) {
            caseText = item.caseNumber || '';
            if (item.duplicateInfo) caseText += '\\r' + item.duplicateInfo;
          }
          dataRows.push({
            caseText,
            rowspan: pi === 0 ? props.length : 0,
            propNum: prop.propertyNumber || '',
            location: prop.location || '',
            usage: prop.usage || '',
            price: (prop.appraisalPrice || '') + '\\r' + (prop.minimumPrice || ''),
            remarks: prop.remarks || '',
          });
        }
      }
      if (dataRows.length === 0) continue;

      // --- 기존 병합 해제 ---
      try {
        for (let ci = table.cells.length - 1; ci >= 0; ci--) {
          const cell = table.cells.item(ci);
          if (cell && cell.isValid && (cell.rowSpan > 1 || cell.columnSpan > 1)) {
            cell.unmerge();
          }
        }
      } catch (e) { /* 무시 */ }

      // --- 행 수 조정 ---
      const hdrRows = table.headerRowCount || 0;
      const needed = dataRows.length;

      while (table.bodyRowCount > needed && table.bodyRowCount > 1) {
        try { table.rows.item(table.rows.length - 1).remove(); } catch { break; }
      }
      while (table.bodyRowCount < needed) {
        try { table.rows.add(); } catch { break; }
      }

      // --- 셀 내용 채우기 ---
      for (let r = 0; r < dataRows.length; r++) {
        const ri = hdrRows + r;
        if (ri >= table.rows.length) break;
        const rd = dataRows[r];
        const row = table.rows.item(ri);
        if (!row || !row.isValid || row.cells.length < 6) continue;

        row.cells.item(0).contents = rd.caseText;
        row.cells.item(1).contents = rd.propNum;
        row.cells.item(2).contents = rd.location;
        row.cells.item(3).contents = rd.usage;
        row.cells.item(4).contents = rd.price;
        row.cells.item(5).contents = rd.remarks;
      }

      // --- 사건번호 셀 병합 (rowspan) ---
      for (let r = 0; r < dataRows.length; r++) {
        if (dataRows[r].rowspan > 1) {
          const startRI = hdrRows + r;
          const endRI = hdrRows + r + dataRows[r].rowspan - 1;
          if (endRI < table.rows.length) {
            try {
              const startCell = table.rows.item(startRI).cells.item(0);
              const endCell = table.rows.item(endRI).cells.item(0);
              if (startCell && startCell.isValid && endCell && endCell.isValid) {
                startCell.merge(endCell);
              }
            } catch (e) { /* 병합 실패 허용 */ }
          }
        }
      }

      categoriesEdited++;
    }

    // ============================================================
    // 3. 오버플로 감지
    // ============================================================
    let overset = false;
    for (let fi = 0; fi < doc.textFrames.length; fi++) {
      try {
        if (doc.textFrames.item(fi).overflows) { overset = true; break; }
      } catch { /* 무시 */ }
    }

    // ============================================================
    // 4. PDF 내보내기
    // ============================================================
    await doc.exportFile(ExportFormat.pdfType, ${JSON.stringify(pdfPath)}, false);

    return {
      success: true,
      message: 'INDD template exported',
      overset,
      categoriesEdited,
    };
  } finally {
    doc.close(SaveOptions.NO);
  }
} catch (e) {
  return { success: false, error: e instanceof Error ? e.message : String(e) };
}
`;
}
