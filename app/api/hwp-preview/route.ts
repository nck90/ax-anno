import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { access } from 'fs/promises';
import { readStructure } from '@/lib/hwpilot';
import { renderHwpToHtml } from '@/lib/hwp-renderer';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const OUTPUT_DIR = path.join(process.cwd(), 'outputs');

export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get('file');
  const type = request.nextUrl.searchParams.get('type') ?? 'original';

  if (!file) {
    return NextResponse.json({ error: 'file 파라미터가 필요합니다.' }, { status: 400 });
  }

  // 경로 순회 방지
  const safeName = path.basename(file);
  const dir = type === 'edited' ? OUTPUT_DIR : UPLOAD_DIR;
  const filePath = path.join(dir, safeName);

  try {
    await access(filePath);
  } catch {
    return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
  }

  try {
    const doc = await readStructure(filePath);
    const html = renderHwpToHtml(doc as Parameters<typeof renderHwpToHtml>[0]);

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('HWP 미리보기 오류:', error);
    const message = error instanceof Error ? error.message : 'HWP 렌더링 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
