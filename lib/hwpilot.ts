import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile } from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const HWPILOT_DIR = path.resolve(process.cwd(), '../hwpilot');
const HWPILOT_CLI = path.join(HWPILOT_DIR, 'src/cli.ts');

async function runHwpilot(args: string[]): Promise<string> {
  // Resolve only file paths (containing / or \) to absolute before changing cwd
  const resolvedArgs = args.map((arg, i) => {
    if (i > 0 && !arg.startsWith('-') && !arg.startsWith('{') && (arg.includes('/') || arg.includes('\\'))) {
      return path.resolve(arg);
    }
    return arg;
  });
  const { stdout } = await execFileAsync('npx', ['tsx', HWPILOT_CLI, ...resolvedArgs], {
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
    cwd: HWPILOT_DIR,
    env: { ...process.env, HWPILOT_NO_DAEMON: '1' },
  });
  return stdout;
}

export async function extractText(filePath: string): Promise<string> {
  const result = await runHwpilot(['text', filePath]);
  const parsed = JSON.parse(result);
  return parsed.text;
}

export async function readStructure(filePath: string): Promise<unknown> {
  const result = await runHwpilot(['read', filePath]);
  return JSON.parse(result);
}

function collectCellRefs(node: unknown, refs: Set<string>): void {
  if (!node || typeof node !== 'object') return;

  if ('ref' in node && typeof node.ref === 'string' && /\.t\d+\.r\d+\.c\d+/.test(node.ref)) {
    refs.add(node.ref);
  }

  if (Array.isArray(node)) {
    for (const item of node) collectCellRefs(item, refs);
    return;
  }

  for (const value of Object.values(node)) {
    collectCellRefs(value, refs);
  }
}

async function getExistingCellRefs(filePath: string): Promise<Set<string>> {
  const doc = await readStructure(filePath);
  const refs = new Set<string>();
  collectCellRefs(doc, refs);
  return refs;
}

export async function findText(filePath: string, query: string): Promise<Array<{ ref: string; text: string }>> {
  try {
    const result = await runHwpilot(['find', filePath, query]);
    return JSON.parse(result).results || [];
  } catch {
    return [];
  }
}

export async function editText(filePath: string, ref: string, newText: string): Promise<void> {
  // 테이블 셀 참조 (s0.t1.r2.c3 형태)는 'table edit' 명령 사용
  const isTableCellRef = /\.t\d+\.r\d+\.c\d+/.test(ref);
  if (isTableCellRef) {
    await runHwpilot(['table', 'edit', filePath, ref, newText]);
  } else {
    await runHwpilot(['edit', 'text', filePath, ref, newText]);
  }
}

export async function copyHwpx(srcPath: string, destPath: string): Promise<void> {
  await copyFile(srcPath, destPath);
}

export interface HwpEditIssue {
  ref: string;
  reason: string;
}

export interface HwpEditResult {
  filePath: string;
  totalCount: number;
  successCount: number;
  failCount: number;
  skippedCount: number;
  failures: HwpEditIssue[];
  skipped: HwpEditIssue[];
}

/**
 * 원본 HWP를 복사한 뒤 cellEditMap의 모든 셀 텍스트를 교체
 * @returns 편집된 HWP 파일 경로
 */
export async function createEditedHwp(
  srcPath: string,
  destPath: string,
  cellEdits: Record<string, string>
): Promise<HwpEditResult> {
  // 1. 원본 복사
  await copyFile(srcPath, destPath);

  // 2. 실제 문서에 존재하는 셀 ref만 편집 대상으로 사용
  const existingRefs = await getExistingCellRefs(destPath);

  // 3. 각 셀 텍스트 교체
  const refs = Object.keys(cellEdits);
  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;
  const failures: HwpEditIssue[] = [];
  const skipped: HwpEditIssue[] = [];

  for (const ref of refs) {
    const newText = cellEdits[ref];
    if (!newText && newText !== '') continue;

    if (!existingRefs.has(ref)) {
      skippedCount++;
      const reason = 'ref not found in copied document';
      skipped.push({ ref, reason });
      console.warn(`Cell edit skipped [${ref}]: ${reason}`);
      continue;
    }

    try {
      await editText(destPath, ref, newText);
      successCount++;
    } catch (err) {
      failCount++;
      const reason = err instanceof Error ? err.message : String(err);
      failures.push({ ref, reason });
      // 개별 셀 편집 실패는 무시하고 계속 진행
      console.warn(`Cell edit failed [${ref}]: ${reason}`);
    }
  }

  console.log(`HWP edit complete: ${successCount} success, ${failCount} failed, ${skippedCount} skipped out of ${refs.length}`);
  return {
    filePath: destPath,
    totalCount: refs.length,
    successCount,
    failCount,
    skippedCount,
    failures,
    skipped,
  };
}
