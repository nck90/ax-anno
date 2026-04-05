import { EDITING_RULES_PROMPT, type EditedAuction } from './editing-rules';
import { GUIDELINES_RAW } from './guidelines-text';

const AI_API_URL = process.env.AI_API_URL || '';
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'openai/gpt-4o-mini';
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 30000);
const AI_MAX_RETRIES = Number(process.env.AI_MAX_RETRIES || 2);
const GUIDELINES_MAX_CHARS = Number(process.env.AI_GUIDELINES_MAX_CHARS || 6000);
const ITEMS_TEXT_MAX_CHARS = Number(process.env.AI_ITEMS_TEXT_MAX_CHARS || 18000);
const AI_BATCH_SIZE = Number(process.env.AI_BATCH_SIZE || 18);

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function compactText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`;
}

function buildSystemPrompt(includeRawGuidelines: boolean): string {
  if (!includeRawGuidelines) {
    return EDITING_RULES_PROMPT;
  }

  return `${EDITING_RULES_PROMPT}\n\n## 원본 편집기준 전문 (RAG)\n${compactText(GUIDELINES_RAW, GUIDELINES_MAX_CHARS)}`;
}

interface PropertyPatch {
  categoryIndex: number;
  itemIndex: number;
  propertyIndex: number;
  location: string;
  remarks: string;
}

interface PropertyField extends PropertyPatch {
  caseNumber: string;
  duplicateInfo: string;
  propertyNumber: string;
  usage: string;
}

export interface AiPolishResult {
  editedData: EditedAuction;
  applied: boolean;
  mode: 'applied' | 'disabled' | 'fallback';
  reason: string;
  appliedCount: number;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extractAddressTokens(text: string): string[] {
  return normalizeWhitespace(text)
    .split(' ')
    .filter(token => /(?:시|군|구|읍|면|동|리|로|길)$/.test(token));
}

function extractNumericTokens(text: string): string[] {
  const matches = text.match(/산?\d+(?:-\d+)?(?:\.\d+)?(?:㎡)?|\d+층\d+호|\d+층|\d+호/g);
  return matches ?? [];
}

function isSkippableAddressToken(token: string): boolean {
  return /(?:도|광역시|특별시|특별자치도)$/.test(token) && token !== '세종특별자치시';
}

function hasRequiredLocationTokens(original: string, edited: string): boolean {
  const editedNormalized = normalizeWhitespace(edited);
  const requiredAddressTokens = extractAddressTokens(original)
    .filter(token => !isSkippableAddressToken(token));
  const requiredNumericTokens = extractNumericTokens(original);

  for (const token of requiredAddressTokens) {
    if (!editedNormalized.includes(token)) {
      return false;
    }
  }

  for (const token of requiredNumericTokens) {
    if (!editedNormalized.includes(token)) {
      return false;
    }
  }

  if (original.includes('동소') && !editedNormalized.includes('동소')) {
    return false;
  }

  return true;
}

function sanitizeLocation(original: string, edited: string): string {
  const candidate = normalizeWhitespace(edited);
  if (!candidate) return original;
  if (!hasRequiredLocationTokens(original, candidate)) {
    return original;
  }
  return candidate;
}

function sanitizeRemarks(original: string, edited: string): string {
  const candidate = edited.replace(/\s+/g, '').trim();
  if (!candidate) return original;
  return candidate;
}

function extractJsonPayload(content: string): string {
  const fenced = content.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1];

  const arrayMatch = content.match(/(\[[\s\S]*\])/);
  if (arrayMatch) return arrayMatch[1];

  const objectMatch = content.match(/(\{[\s\S]*\})/);
  if (objectMatch) return objectMatch[1];

  throw new Error('JSON 파싱 실패');
}

function parsePatchResponse(content: string): PropertyPatch[] {
  const payload = JSON.parse(extractJsonPayload(content)) as PropertyPatch[] | { patches?: PropertyPatch[] };
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.patches)) return payload.patches;
  throw new Error('AI 응답 형식 오류');
}

function collectFields(structured: EditedAuction): PropertyField[] {
  return structured.categories.flatMap((category, categoryIndex) =>
    category.items.flatMap((item, itemIndex) =>
      item.properties.map((property, propertyIndex) => ({
        categoryIndex,
        itemIndex,
        propertyIndex,
        caseNumber: item.caseNumber,
        duplicateInfo: item.duplicateInfo || '',
        propertyNumber: property.propertyNumber,
        usage: property.usage,
        location: property.location,
        remarks: property.remarks,
      }))
    )
  );
}

function chunkFields(fields: PropertyField[]): PropertyField[][] {
  const chunks: PropertyField[][] = [];
  for (let i = 0; i < fields.length; i += AI_BATCH_SIZE) {
    chunks.push(fields.slice(i, i + AI_BATCH_SIZE));
  }
  return chunks;
}

function buildPatchPrompt(fields: PropertyField[], batchIndex: number, totalBatches: number): string {
  const compactedFields = compactText(JSON.stringify(fields, null, 2), ITEMS_TEXT_MAX_CHARS);

  return `사람 편집자의 결과물에 최대한 가깝게 location과 remarks만 다시 다듬으세요.

## 현재 배치
- ${batchIndex + 1}/${totalBatches} 배치
- 이번 배치 항목 수: ${fields.length}

## 절대 규칙
- categoryIndex, itemIndex, propertyIndex는 절대 바꾸지 마세요.
- location과 remarks만 반환하세요. 다른 필드는 반환하지 마세요.
- 주소 고유명사와 번지, 동/층/호, 면적 숫자는 절대 삭제하거나 바꾸지 마세요.
- 광역시/도는 삭제 가능하지만 시/군/구/읍/면/동/리/로/길은 유지하세요.
- 건물 구조 표현(철근콘크리트조, 경량철골조, 시멘트블럭조, 패널, 지붕 등)은 삭제하고 용도+층+면적 중심으로 재배열하세요.
- remarks는 조사와 불필요한 띄어쓰기를 제거해 붙여쓰세요.
- 사람이 만든 신문 편집본처럼 줄 수를 줄이기 위해 긴 안내문은 location 끝의 [대괄호]로 이동할 수 있습니다.
- 값이 불확실하면 원문을 유지하세요.

## 사람 편집본 패턴
- "제천시 동명로2다길 3 근린시설 1,2층각73.88㎡ 부속건물 단층근린시설24.84㎡ 제시외 비가림막등32.4㎡"
- "제천시 청풍호로2길8-3 1층104.87㎡2층95.04㎡지하9.99㎡ 부속건물 단층부속보일러실 1,2층각3.69㎡[2층보일러실] 제시외창고등38.2㎡"
- "제천시 봉양읍 연박리 365 175㎡ [농지취득자격증명요[소관행정기관에발급여부사전문의후입찰요]]" / remarks: "현황일부휴경지,구거[천]이용중"
- "제천시 고명동 464 887㎡ 제시외 수목일괄 [제시외수목매각포함.을구5번지상권자옥천군산림조합으로부터'최고가매수인이소유권이전등기촉탁신청시지상권말소동의'지상권말소동의서제출됨.현황전이용중]"

## 입력 필드
${compactedFields}

## 출력 형식
JSON 배열만 반환하세요.
\`\`\`json
[
  {
    "categoryIndex": 0,
    "itemIndex": 0,
    "propertyIndex": 0,
    "location": "수정된 소재지 및 면적",
    "remarks": "수정된 비고"
  }
  ]
\`\`\``;
}

function extractContentText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  if (content && typeof content === 'object' && 'text' in content && typeof content.text === 'string') {
    return content.text;
  }

  return '';
}

function extractAiText(data: unknown): string {
  if (!data || typeof data !== 'object') {
    return '';
  }

  if ('content' in data) {
    const text = extractContentText(data.content);
    if (text) return text;
  }

  if ('choices' in data && Array.isArray(data.choices)) {
    for (const choice of data.choices) {
      if (!choice || typeof choice !== 'object') continue;
      if ('message' in choice && choice.message && typeof choice.message === 'object') {
        const message = choice.message as { content?: unknown };
        const text = extractContentText(message.content);
        if (text) return text;
      }
      if ('text' in choice && typeof choice.text === 'string') {
        return choice.text;
      }
    }
  }

  return '';
}

async function requestAI(prompt: string): Promise<Response> {
  let lastError: unknown;
  let includeRawGuidelines = true;

  for (let attempt = 1; attempt <= AI_MAX_RETRIES + 1; attempt++) {
    try {
      const response = await fetch(AI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_API_KEY}`,
          'HTTP-Referer': process.env.AI_SITE_URL || 'http://localhost:3005',
          'X-Title': process.env.AI_APP_NAME || 'auction-editor',
        },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: 4000,
          temperature: 0.1,
          messages: [
            { role: 'system', content: buildSystemPrompt(includeRawGuidelines) },
            { role: 'user', content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });

      if (response.ok || attempt > AI_MAX_RETRIES) {
        return response;
      }

      const shouldRetry = response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500;
      if (!shouldRetry) {
        return response;
      }

      lastError = new Error(`AI API ${response.status}: ${await response.text()}`);
    } catch (error) {
      lastError = error;
      // 타임아웃이면 재시도 없이 즉시 포기
      if (error instanceof DOMException && error.name === 'AbortError' ||
          error instanceof Error && error.name === 'TimeoutError') {
        console.error(`AI polish 타임아웃 (${AI_TIMEOUT_MS}ms), 재시도 없이 폴백`);
        break;
      }
    }

    if (attempt > AI_MAX_RETRIES) break;
    if (attempt === 1) includeRawGuidelines = false;
    await delay(attempt * 1000);
  }

  throw lastError;
}

/**
 * 하이브리드 방식: 결정론적 파서 결과를 AI가 텍스트 축약
 * - 구조(카테고리, 사건번호, 정렬)는 그대로 유지
 * - location, remarks 텍스트만 AI가 추가 축약
 */
export async function polishWithAI(structured: EditedAuction): Promise<AiPolishResult> {
  if (!AI_API_URL || !AI_API_KEY) {
    console.warn('AI API 미설정, 결정론적 결과 반환');
    return {
      editedData: structured,
      applied: false,
      mode: 'disabled',
      reason: 'AI_API_URL 또는 AI_API_KEY가 설정되지 않았습니다.',
      appliedCount: 0,
    };
  }

  const fields = collectFields(structured);
  if (fields.length === 0) {
    return {
      editedData: structured,
      applied: false,
      mode: 'fallback',
      reason: 'AI 축약 대상 항목이 없습니다.',
      appliedCount: 0,
    };
  }

  const batches = chunkFields(fields);
  const polished = structured.categories.map(category => ({
    ...category,
    items: category.items.map(item => ({
      ...item,
      properties: item.properties.map(property => ({ ...property })),
    })),
  }));

  try {
    let appliedCount = 0;
    let successfulBatches = 0;
    const batchErrors: string[] = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const prompt = buildPatchPrompt(batches[batchIndex], batchIndex, batches.length);
      try {
        const response = await requestAI(prompt);

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`AI API ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const content = extractAiText(data);
        if (!content) {
          throw new Error('AI 응답 비어있음');
        }

        const patches = parsePatchResponse(content);

        for (const patch of patches) {
          const category = polished[patch.categoryIndex];
          const item = category?.items[patch.itemIndex];
          const property = item?.properties[patch.propertyIndex];

          if (!property) {
            continue;
          }

          const nextLocation = sanitizeLocation(property.location, patch.location);
          const nextRemarks = sanitizeRemarks(property.remarks, patch.remarks);
          const changed = nextLocation !== property.location || nextRemarks !== property.remarks;

          property.location = nextLocation;
          property.remarks = nextRemarks;

          if (changed) {
            appliedCount++;
          }
        }

        successfulBatches++;
      } catch (batchError) {
        const message = batchError instanceof Error ? batchError.message : String(batchError);
        console.error(`AI batch ${batchIndex + 1} 실패: ${message}`);
        batchErrors.push(`${batchIndex + 1}번 배치: ${message}`);
      }
    }

    if (successfulBatches === 0) {
      return {
        editedData: structured,
        applied: false,
        mode: 'fallback',
        reason: batchErrors[0] || '모든 AI 배치 요청이 실패했습니다.',
        appliedCount: 0,
      };
    }

    if (appliedCount === 0) {
      return {
        editedData: structured,
        applied: false,
        mode: 'fallback',
        reason: batchErrors.length > 0
          ? `AI 응답은 받았지만 실제 반영된 축약이 없습니다. ${batchErrors.join(' | ')}`
          : 'AI 응답은 받았지만 실제 반영된 축약이 없습니다.',
        appliedCount: 0,
      };
    }

    return {
      editedData: {
        ...structured,
        categories: polished,
      },
      applied: true,
      mode: 'applied',
      reason: batchErrors.length > 0
        ? `${appliedCount}개 항목에 AI 축약을 적용했습니다. 일부 배치는 실패했습니다: ${batchErrors.join(' | ')}`
        : `${appliedCount}개 항목에 AI 축약을 적용했습니다.`,
      appliedCount,
    };
  } catch (err) {
    if (err instanceof Error) {
      console.error(`AI polish 실패: ${err.name}: ${err.message}`);
      return {
        editedData: structured,
        applied: false,
        mode: 'fallback',
        reason: `${err.name}: ${err.message}`,
        appliedCount: 0,
      };
    } else {
      console.error('AI polish 실패:', err);
      return {
        editedData: structured,
        applied: false,
        mode: 'fallback',
        reason: 'AI 응답 처리 중 알 수 없는 오류가 발생했습니다.',
        appliedCount: 0,
      };
    }
  }
}
