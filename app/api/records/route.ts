import { NextRequest, NextResponse } from 'next/server';
import { listRecords, getRecord, countRecords } from '@/lib/db';

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');

  // 단일 레코드 조회
  if (id) {
    const record = getRecord(id);
    if (!record) {
      return NextResponse.json({ error: '기록을 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({
      ...record,
      edited_data: record.edited_data ? JSON.parse(record.edited_data) : null,
      verification: record.verification ? JSON.parse(record.verification) : null,
      outputs: record.outputs ? JSON.parse(record.outputs) : null,
    });
  }

  // 목록 조회
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');
  const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0');
  const records = listRecords(limit, offset);
  const total = countRecords();

  return NextResponse.json({
    records: records.map((r) => ({
      ...r,
      // 목록에서는 edited_data 제외 (용량 절약)
      edited_data: undefined,
      outputs: r.outputs ? JSON.parse(r.outputs) : null,
    })),
    total,
    limit,
    offset,
  });
}
