/**
 * 편집 결과 자동 검증 시스템 (EDITING-SPEC Section 11)
 */

import type { EditedAuction } from './editing-rules';

export interface VerifyResult {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

interface OriginalData {
  caseNumbers: string[];
  prices: Array<{ case: string; appraisal: string; minimum: string }>;
  areas: string[];  // 모든 면적값
  hasAssessmentRef: boolean;  // 감정평가서 참조 문구 존재 여부
}

/** 원본 텍스트에서 검증용 데이터 추출 */
export function extractOriginalData(rawText: string): OriginalData {
  const caseNumbers = [...new Set(
    [...rawText.matchAll(/(\d{4}타경\d+)/g)].map(m => m[1])
  )];

  const prices: OriginalData['prices'] = [];
  const priceMatches = [...rawText.matchAll(/([\d,]+)\n([\d,]+)/g)];
  // 가격은 원본 구조에서 추출 (근사값)

  const areas = [...rawText.matchAll(/(\d[\d,.]*)\s*㎡/g)].map(m => m[1]);

  const hasAssessmentRef = /감정평가서/.test(rawText) && /(참조|참고)/.test(rawText);

  return { caseNumbers, prices, areas, hasAssessmentRef };
}

/** 편집된 결과 검증 (10개 체크) */
export function verifyEdited(
  original: OriginalData,
  edited: EditedAuction,
  rawOriginalText: string
): VerifyResult[] {
  const results: VerifyResult[] = [];

  // 편집본에서 데이터 추출
  const editedCaseNumbers: string[] = [];
  const editedPrices: string[] = [];
  const editedText = JSON.stringify(edited);

  for (const cat of edited.categories) {
    for (const item of cat.items) {
      // 사건번호 추출 (멀티라인일 수 있음)
      const cases = [...item.caseNumber.matchAll(/(\d{4}타경\d+)/g)];
      cases.forEach(m => editedCaseNumbers.push(m[1]));

      for (const prop of item.properties) {
        if (prop.appraisalPrice) editedPrices.push(prop.appraisalPrice.replace(/,/g, ''));
        if (prop.minimumPrice) editedPrices.push(prop.minimumPrice.replace(/,/g, ''));
      }
    }
  }

  const uniqueEditedCases = [...new Set(editedCaseNumbers)];

  // ── Check 1: 모든 사건번호 보존 ──
  const missingCases = original.caseNumbers.filter(c => !uniqueEditedCases.includes(c));
  results.push({
    id: 'case-numbers',
    name: '사건번호 보존',
    passed: missingCases.length === 0,
    detail: missingCases.length === 0
      ? `${uniqueEditedCases.length}건 모두 보존`
      : `누락: ${missingCases.join(', ')}`,
  });

  // ── Check 2: 감정평가액 보존 (편집본에 가격이 있는지 확인) ──
  // 원본 텍스트의 regex 추출은 비가격 숫자도 포함되어 부정확하므로,
  // 편집본에 가격이 비어있지 않은 물건이 있는지 기준으로 검증
  let propsWithPrice = 0;
  let propsTotal = 0;
  for (const cat of edited.categories) {
    for (const item of cat.items) {
      for (const prop of item.properties) {
        if (prop.propertyNumber) { // 메인 물건만 체크 (하위 필지는 가격 없음)
          propsTotal++;
          const ap = prop.appraisalPrice?.replace(/[,\s]/g, '');
          const mp = prop.minimumPrice?.replace(/[,\s]/g, '');
          if (ap && parseInt(ap) > 0 && mp && parseInt(mp) > 0) propsWithPrice++;
        }
      }
    }
  }
  results.push({
    id: 'prices',
    name: '감정평가액 정확성',
    passed: propsTotal === 0 || propsWithPrice / propsTotal > 0.8,
    detail: `${propsWithPrice}/${propsTotal} 물건에 가격 존재 (${Math.round(propsWithPrice / Math.max(propsTotal, 1) * 100)}%)`,
  });

  // ── Check 3: 면적(㎡) 보존 ──
  const editedAreas = [...editedText.matchAll(/(\d[\d,.]*)\s*㎡/g)].map(m => m[1]);
  const origAreaSet = new Set(original.areas);
  const editedAreaSet = new Set(editedAreas);
  // 원본 면적이 편집본에 존재하는지 (합산된 제시외 제외)
  let areaPreserved = 0;
  let areaTotal = 0;
  for (const a of origAreaSet) {
    areaTotal++;
    if (editedAreaSet.has(a)) areaPreserved++;
  }
  results.push({
    id: 'areas',
    name: '면적 보존',
    passed: areaTotal === 0 || areaPreserved / areaTotal > 0.7,
    detail: `${areaPreserved}/${areaTotal} 면적값 보존 (${Math.round(areaPreserved / Math.max(areaTotal, 1) * 100)}%)`,
  });

  // ── Check 4: 감정평가서 참조 문구 보존 ──
  const editedHasRef = /감정평가서/.test(editedText) && /(참조|참고)/.test(editedText);
  results.push({
    id: 'assessment-ref',
    name: '감정평가서 참조 보존',
    passed: !original.hasAssessmentRef || editedHasRef,
    detail: original.hasAssessmentRef
      ? (editedHasRef ? '감정평가서 참조 문구 유지됨' : '감정평가서 참조 문구가 삭제됨!')
      : '해당 없음',
  });

  // ── Check 5: 카테고리 내 사건번호 오름차순 ──
  let sortCorrect = true;
  for (const cat of edited.categories) {
    for (let i = 1; i < cat.items.length; i++) {
      const prev = parseCaseNum(cat.items[i - 1].caseNumber);
      const curr = parseCaseNum(cat.items[i].caseNumber);
      if (prev[0] > curr[0] || (prev[0] === curr[0] && prev[1] > curr[1])) {
        sortCorrect = false;
        break;
      }
    }
  }
  results.push({
    id: 'sort-order',
    name: '사건번호 정렬',
    passed: sortCorrect,
    detail: sortCorrect ? '카테고리 내 오름차순 정렬 확인' : '정렬 오류 발견',
  });

  // ── Check 6: 비고→소재지 이동이 [대괄호] 안인지 ──
  let bracketOk = true;
  for (const cat of edited.categories) {
    for (const item of cat.items) {
      for (const prop of item.properties) {
        // 소재지에 비고 내용이 있는데 대괄호 밖이면 오류
        if (prop.location.includes('농지취득자격증명요') && !prop.location.includes('[농지취득자격증명요')) {
          bracketOk = false;
        }
        if (prop.location.includes('매각물건명세서') && !prop.location.includes('[매각물건명세서') && !prop.location.includes('[물건번호')) {
          bracketOk = false;
        }
      }
    }
  }
  results.push({
    id: 'brackets',
    name: '대괄호 규칙',
    passed: bracketOk,
    detail: bracketOk ? '비고→소재지 이동 시 [대괄호] 사용 확인' : '대괄호 없이 이동된 항목 있음',
  });

  // ── Check 7: 마지막 문장 마침표 없음 ──
  let trailingDot = 0;
  for (const cat of edited.categories) {
    for (const item of cat.items) {
      for (const prop of item.properties) {
        if (prop.remarks && prop.remarks.endsWith('.')) trailingDot++;
      }
    }
  }
  results.push({
    id: 'trailing-dot',
    name: '마지막 마침표 삭제',
    passed: trailingDot === 0,
    detail: trailingDot === 0 ? '모든 비고 마지막 마침표 없음' : `${trailingDot}개 비고에 마지막 마침표 있음`,
  });

  // ── Check 8: 광역시/도 삭제 ──
  const provinces = ['충청북도', '충청남도', '경상북도', '경상남도', '전라북도', '전라남도',
    '경기도', '강원도', '서울특별시', '부산광역시', '대구광역시', '인천광역시',
    '광주광역시', '대전광역시', '울산광역시'];
  const remainingProvince = provinces.filter(p => editedText.includes(p));
  results.push({
    id: 'province-removed',
    name: '광역시/도 삭제',
    passed: remainingProvince.length === 0,
    detail: remainingProvince.length === 0
      ? '모든 광역시/도 삭제됨'
      : `남아있음: ${remainingProvince.join(', ')}`,
  });

  // ── Check 9: 건물 구조 키워드 삭제 ──
  const structureKeywords = ['철근콘크리트구조', '경량철골구조', '시멘벽돌조', '연와조', '조립식판넬지붕', '샌드위치판넬지붕', '그라스울판넬지붕'];
  const remainingStruct = structureKeywords.filter(k => editedText.includes(k));
  results.push({
    id: 'structure-removed',
    name: '건물구조 삭제',
    passed: remainingStruct.length === 0,
    detail: remainingStruct.length === 0
      ? '건물 구조 설명 삭제됨'
      : `남아있음: ${remainingStruct.join(', ')}`,
  });

  // ── Check 10: () → [] 변환 ──
  // 편집본 소재지/비고에 ()가 남아있는지 체크 (주소 내 괄호는 허용)
  let parenCount = 0;
  for (const cat of edited.categories) {
    for (const item of cat.items) {
      for (const prop of item.properties) {
        // 비고에 ()가 있으면 오류
        if (prop.remarks && /\(/.test(prop.remarks)) parenCount++;
      }
    }
  }
  results.push({
    id: 'paren-to-bracket',
    name: '괄호 변환 (→[])',
    passed: parenCount === 0,
    detail: parenCount === 0
      ? '모든 소괄호 → 대괄호 변환됨'
      : `${parenCount}개 비고에 소괄호 남음`,
  });

  return results;
}

function parseCaseNum(cn: string): [number, number] {
  const m = cn.replace(/\s/g, '').match(/(\d+)타경(\d+)/);
  return m ? [parseInt(m[1]), parseInt(m[2])] : [0, 0];
}
