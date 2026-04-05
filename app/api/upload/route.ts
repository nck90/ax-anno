import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const UPLOAD_DIR = process.env.VERCEL ? '/tmp/uploads' : path.join(process.cwd(), 'uploads');

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    }

    const declaredExt = path.extname(file.name).toLowerCase();
    if (declaredExt !== '.hwpx' && declaredExt !== '.hwp') {
      return NextResponse.json(
        { error: 'HWP 또는 HWPX 파일만 업로드 가능합니다.' },
        { status: 400 }
      );
    }

    await mkdir(UPLOAD_DIR, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());

    // Detect actual format from magic bytes, not user-supplied extension.
    // CFB magic (D0 CF 11 E0) = HWP binary; ZIP magic (50 4B 03 04) = HWPX.
    // Mismatched extension causes Hancom Docs (web) to reject the file.
    const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
    const isZip = buffer.length >= 4 && ZIP_MAGIC.every((b, i) => buffer[i] === b);
    const ext = isZip ? '.hwpx' : '.hwp';

    const id = randomUUID();
    const filename = `${id}${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    await writeFile(filePath, buffer);

    return NextResponse.json({
      id,
      filename: file.name,
      path: filePath,
    });
  } catch (error) {
    console.error('업로드 오류:', error);
    return NextResponse.json({ error: '파일 업로드 실패' }, { status: 500 });
  }
}
