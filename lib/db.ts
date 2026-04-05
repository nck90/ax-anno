import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'records.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    // Ensure data directory exists
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        original_filename TEXT NOT NULL,
        court TEXT,
        department TEXT,
        sale_date TEXT,
        category_count INTEGER DEFAULT 0,
        case_count INTEGER DEFAULT 0,
        property_count INTEGER DEFAULT 0,
        ai_polished INTEGER DEFAULT 0,
        status TEXT DEFAULT 'processing',
        edited_data TEXT,
        verification TEXT,
        outputs TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `);
  }
  return _db;
}

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
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO records (id, original_filename, status)
    VALUES (?, ?, 'processing')
  `).run(id, originalFilename);
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
  const db = getDb();
  db.prepare(`
    UPDATE records SET
      court = ?,
      department = ?,
      sale_date = ?,
      category_count = ?,
      case_count = ?,
      property_count = ?,
      ai_polished = ?,
      status = 'review',
      edited_data = ?,
      verification = ?,
      outputs = ?,
      updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(
    data.court || null,
    data.department || null,
    data.saleDate || null,
    data.categoryCount,
    data.caseCount,
    data.propertyCount,
    data.aiPolished ? 1 : 0,
    JSON.stringify(data.editedData),
    JSON.stringify(data.verification),
    JSON.stringify(data.outputs),
    id
  );
}

export function updateRecordAfterApprove(id: string, outputs: unknown): void {
  const db = getDb();
  db.prepare(`
    UPDATE records SET
      status = 'done',
      outputs = ?,
      updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(JSON.stringify(outputs), id);
}

export function getRecord(id: string): RecordRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM records WHERE id = ?').get(id) as RecordRow | undefined;
}

export function listRecords(limit = 50, offset = 0): RecordRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM records ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset) as RecordRow[];
}

export function countRecords(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as cnt FROM records').get() as { cnt: number };
  return row.cnt;
}
