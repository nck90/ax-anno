import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = process.env.VERCEL ? '/tmp/outputs' : path.join(process.cwd(), 'outputs');

export async function GET(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get('file');

  if (!filename) {
    return NextResponse.json({ error: '파일명이 필요합니다.' }, { status: 400 });
  }

  // 경로 순회 방지
  const safeName = path.basename(filename);
  const filePath = path.join(OUTPUT_DIR, safeName);

  try {
    const buffer = await readFile(filePath);
    const ext = path.extname(safeName).toLowerCase();

    const contentTypes: Record<string, string> = {
      '.json': 'application/json',
      '.html': 'text/html; charset=utf-8',
      '.pdf': 'application/pdf',
      '.idml': 'application/vnd.adobe.indesign-idml-package',
      '.hwp': 'application/x-hwp',
      '.hwpx': 'application/x-hwpx',
    };

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentTypes[ext] || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(safeName)}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch {
    return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
  }
}
