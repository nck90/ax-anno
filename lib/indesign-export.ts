/**
 * InDesign UXP Bridge를 통한 IDML → PDF 내보내기
 * indesign-uxp-server의 bridge (http://127.0.0.1:3000)를 직접 호출
 *
 * 사전 조건:
 * 1. InDesign 2024+ 실행 중
 * 2. UXP 플러그인 설치 및 연결됨
 * 3. bridge/server.js 실행 중 (cd bridge && node server.js)
 */

const BRIDGE_URL = 'http://127.0.0.1:3000';
const BRIDGE_TIMEOUT = 60000; // 60초 (큰 IDML 파일 처리 시간)

async function executeInDesign(code: string): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(`${BRIDGE_URL}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(BRIDGE_TIMEOUT),
    });
  } catch (error) {
    throw new Error(`Bridge request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const raw = await response.text();
  let data: { error?: string; result?: unknown } = {};
  if (raw) {
    try {
      data = JSON.parse(raw) as { error?: string; result?: unknown };
    } catch {
      throw new Error(`Bridge returned non-JSON response (${response.status})`);
    }
  }

  if (!response.ok) {
    throw new Error(data.error || `Bridge error: ${response.status}`);
  }

  return data.result;
}

/**
 * InDesign bridge가 사용 가능한지 확인
 */
export async function isInDesignAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${BRIDGE_URL}/status`, {
      signal: AbortSignal.timeout(2000),
    });
    const data = await response.json();
    return data.connected === true;
  } catch {
    return false;
  }
}

/**
 * IDML 파일을 InDesign에서 열고 PDF로 내보내기
 * @param idmlPath IDML 파일 절대 경로
 * @param pdfPath 출력 PDF 파일 절대 경로
 * @param preset PDF 프리셋 (기본: 'High Quality Print')
 */
export async function exportIdmlToPdf(
  idmlPath: string,
  pdfPath: string,
  preset: string = 'High Quality Print'
): Promise<{ success: boolean; message: string }> {
  const exportCode = `
    try {
      const { ExportFormat, SaveOptions } = require('indesign');
      const doc = await app.open(${JSON.stringify(idmlPath)});
      try {
        await doc.exportFile(ExportFormat.pdfType, ${JSON.stringify(pdfPath)}, false, ${JSON.stringify(preset)});
        return { success: true, message: 'PDF exported to ${pdfPath}' };
      } finally {
        doc.close(SaveOptions.NO);
      }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  `;

  const exportResult = await executeInDesign(exportCode);
  if (!isSuccessfulBridgeResult(exportResult)) {
    throw new Error(`PDF 내보내기 실패: ${getBridgeError(exportResult)}`);
  }

  return { success: true, message: exportResult.message };
}

function isSuccessfulBridgeResult(
  value: unknown
): value is { success: true; message: string } {
  return typeof value === 'object' && value !== null && 'success' in value && value.success === true && 'message' in value;
}

function getBridgeError(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string') {
    return value.error;
  }

  return 'unknown error';
}
