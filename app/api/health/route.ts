import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import path from 'path';

export async function GET() {
  const hwpilotCli = path.join(process.cwd(), 'vendor', 'hwpilot', 'dist', 'src', 'cli.js');
  const checks = {
    env: process.env.VERCEL ? 'vercel' : 'local',
    cwd: process.cwd(),
    hwpilotExists: existsSync(hwpilotCli),
    hwpilotPath: hwpilotCli,
    tmpWritable: true,
    aiConfigured: !!(process.env.AI_API_KEY && process.env.AI_API_URL),
    nodeVersion: process.version,
  };

  try {
    const { mkdir, writeFile, unlink } = await import('fs/promises');
    const tmpDir = process.env.VERCEL ? '/tmp' : path.join(process.cwd(), 'uploads');
    await mkdir(tmpDir, { recursive: true });
    const testFile = path.join(tmpDir, 'health-check.txt');
    await writeFile(testFile, 'ok');
    await unlink(testFile);
  } catch (e) {
    checks.tmpWritable = false;
  }

  return NextResponse.json(checks);
}
