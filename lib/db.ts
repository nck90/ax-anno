// In-memory store for Vercel serverless (no SQLite)
// Records are ephemeral per invocation but that's fine for this use case

const records = new Map<string, RecordRow>();

export interface RecordRow {
  id: string;
  original_filename: string;
  court: string | null;
  department: string | null;
  sale_date: string | null;
  category_count: number;
  case_count: number;
  property_count: number;
  ai_polished: number;
  status: string;
  edited_data: string | null;
  verification: string | null;
  outputs: string | null;
  created_at: string;
  updated_at: string;
}

export function createRecord(id: string, originalFilename: string): void {
  records.set(id, {
    id,
    original_filename: originalFilename,
    court: null,
    department: null,
    sale_date: null,
    category_count: 0,
    case_count: 0,
    property_count: 0,
    ai_polished: 0,
    status: 'processing',
    edited_data: null,
    verification: null,
    outputs: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

export function updateRecordAfterProcess(
  id: string,
  data: {
    court?: string;
    department?: string;
    saleDate?: string;
    categoryCount: number;
    caseCount: number;
    propertyCount: number;
    aiPolished: boolean;
    editedData: unknown;
    verification: unknown;
    outputs: unknown;
    hwpEdit?: unknown;
  }
): void {
  const rec = records.get(id);
  if (!rec) return;
  rec.court = data.court || null;
  rec.department = data.department || null;
  rec.sale_date = data.saleDate || null;
  rec.category_count = data.categoryCount;
  rec.case_count = data.caseCount;
  rec.property_count = data.propertyCount;
  rec.ai_polished = data.aiPolished ? 1 : 0;
  rec.status = 'review';
  rec.edited_data = JSON.stringify(data.editedData);
  rec.verification = JSON.stringify(data.verification);
  rec.outputs = JSON.stringify(data.outputs);
  rec.updated_at = new Date().toISOString();
}

export function updateRecordAfterApprove(id: string, outputs: unknown): void {
  const rec = records.get(id);
  if (!rec) return;
  rec.status = 'done';
  rec.outputs = JSON.stringify(outputs);
  rec.updated_at = new Date().toISOString();
}

export function getRecord(id: string): RecordRow | undefined {
  return records.get(id);
}

export function listRecords(limit = 50, offset = 0): RecordRow[] {
  const all = Array.from(records.values()).sort(
    (a, b) => b.created_at.localeCompare(a.created_at)
  );
  return all.slice(offset, offset + limit);
}

export function countRecords(): number {
  return records.size;
}
