import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { extractText, readStructure, createEditedHwp } from '@/lib/hwpilot';
import { transformToEdited } from '@/lib/deterministic-editor';
import { polishWithAI } from '@/lib/ai-editor';
import { extractOriginalData, verifyEdited } from '@/lib/verifier';
import { createRecord, updateRecordAfterProcess } from '@/lib/db';

const OUTPUT_DIR = process.env.VERCEL ? '/tmp/outputs' : path.join(process.cwd(), 'outputs');

const UPLOAD_DIR = process.env.VERCEL ? '/tmp/uploads' : path.join(process.cwd(), 'uploads');

export async function POST(request: NextRequest) {
  try {
    const { id, filePath: clientFilePath, originalFilename } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'id가 필요합니다.' },
        { status: 400 }
      );
    }

    // 보안: 클라이언트가 보낸 경로 대신 서버에서 파일 경로 결정
    const safeId = path.basename(id);
    const uploadHwpxPath = path.join(UPLOAD_DIR, `${safeId}.hwpx`);
    const uploadHwpPath = path.join(UPLOAD_DIR, `${safeId}.hwp`);
    const { existsSync } = await import('fs');
    const filePath = existsSync(uploadHwpxPath) ? uploadHwpxPath : existsSync(uploadHwpPath) ? uploadHwpPath : clientFilePath;

    if (!filePath) {
      return NextResponse.json(
        { error: '업로드된 파일을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    await mkdir(OUTPUT_DIR, { recursive: true });

    // DB 기록 생성
    createRecord(id, originalFilename || path.basename(filePath));

    // 1단계: 원본 텍스트 + 구조 읽기
    const [rawText, doc] = await Promise.all([
      extractText(filePath),
      readStructure(filePath),
    ]);

    // 2단계: 결정론적 파서로 구조 변환
    const result = transformToEdited(doc as Parameters<typeof transformToEdited>[0]);
    const structuredData = result.editedData;
    const cellEditMap: Record<string, string> = Object.fromEntries(result.cellEditMap);

    // 3단계: AI로 텍스트 추가 축약
    let editedData = structuredData as import('@/lib/editing-rules').EditedAuction;
    let aiPolished = false;
    let aiStatus = {
      mode: 'disabled' as 'applied' | 'disabled' | 'fallback',
      reason: 'AI 축약을 실행하지 않았습니다.',
      appliedCount: 0,
    };
    try {
      const aiResult = await polishWithAI(structuredData as import('@/lib/editing-rules').EditedAuction);
      editedData = aiResult.editedData;
      aiPolished = aiResult.applied;
      aiStatus = {
        mode: aiResult.mode,
        reason: aiResult.reason,
        appliedCount: aiResult.appliedCount,
      };
    } catch (aiError) {
      console.error('AI 축약 실패, 결정론적 결과 사용:', aiError);
      aiStatus = {
        mode: 'fallback',
        reason: aiError instanceof Error ? aiError.message : String(aiError),
        appliedCount: 0,
      };
    }

    // 4단계: 1차 수정 HWP 생성 (실제 셀 텍스트 교체)
    const ext = path.extname(filePath).toLowerCase();
    const hwpPath = path.join(OUTPUT_DIR, `${id}-edited${ext}`);
    let hwpEditResult;
    try {
      hwpEditResult = await createEditedHwp(filePath, hwpPath, cellEditMap);
    } catch (hwpErr) {
      console.error('HWP 셀 편집 실패, 원본 복사:', hwpErr);
      const { copyFile } = await import('fs/promises');
      await copyFile(filePath, hwpPath);
      hwpEditResult = {
        filePath: hwpPath,
        totalCount: Object.keys(cellEditMap).length,
        successCount: 0,
        failCount: Object.keys(cellEditMap).length,
        skippedCount: 0,
        failures: [{ ref: '*', reason: hwpErr instanceof Error ? hwpErr.message : String(hwpErr) }],
        skipped: [],
      };
    }

    // 5단계: 검증
    const originalData = extractOriginalData(rawText);
    const verification = verifyEdited(originalData, editedData, rawText);

    // 수정 데이터 JSON 저장
    const editedJsonPath = path.join(OUTPUT_DIR, `${id}-edited.json`);
    await writeFile(editedJsonPath, JSON.stringify(editedData, null, 2), 'utf-8');

    // 원본 텍스트도 저장
    const originalTextPath = path.join(OUTPUT_DIR, `${id}-original.txt`);
    await writeFile(originalTextPath, rawText, 'utf-8');

    const outputs = {
      editedHwp: `/api/download?file=${id}-edited${ext}`,
      editedJson: `/api/download?file=${id}-edited.json`,
    };

    // DB 기록 업데이트
    const header = editedData.header || {};
    const cats = editedData.categories || [];
    let caseCount = 0, propertyCount = 0;
    for (const cat of cats) {
      caseCount += cat.items?.length ?? 0;
      for (const item of cat.items ?? []) propertyCount += item.properties?.length ?? 0;
    }
    updateRecordAfterProcess(id, {
      court: header.court,
      department: header.department,
      saleDate: header.saleDate,
      categoryCount: cats.length,
      caseCount,
      propertyCount,
      aiPolished,
      editedData,
      verification,
      outputs,
      hwpEdit: hwpEditResult,
    });

    return NextResponse.json({
      id,
      editedData,
      originalText: rawText,
      verification,
      aiPolished,
      aiStatus,
      outputs,
      hwpEdit: hwpEditResult,
    });
  } catch (error) {
    console.error('처리 오류:', error);
    const message = error instanceof Error ? error.message : '처리 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
