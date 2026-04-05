import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, unlink, stat, mkdir } from 'fs/promises';
import path from 'path';
import { updateRecordAfterApprove } from '@/lib/db';

const OUTPUT_DIR = process.env.VERCEL ? '/tmp/outputs' : path.join(process.cwd(), 'outputs');

async function removeIfExists(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // ignore
  }
}

export async function POST(request: NextRequest) {
  try {
    const { id, editedData } = await request.json() as { id?: string; editedData?: unknown };

    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
    }

    await mkdir(OUTPUT_DIR, { recursive: true });

    const jsonPath = path.join(OUTPUT_DIR, `${id}-edited.json`);
    if (editedData) {
      await writeFile(jsonPath, JSON.stringify(editedData, null, 2), 'utf-8');
    }

    const jsonData = await readFile(jsonPath, 'utf-8');
    const data = JSON.parse(jsonData);
    const generationVersion = Date.now().toString();

    // 1. HTML 생성
    const { generateHTML } = await import('@/lib/pdf-generator');
    const html = generateHTML(data as Parameters<typeof generateHTML>[0]);
    const htmlPath = path.join(OUTPUT_DIR, `${id}-preview.html`);
    await removeIfExists(htmlPath);
    await writeFile(htmlPath, html, 'utf-8');

    // 2. PDF 생성 (puppeteer-core + @sparticuz/chromium for Vercel)
    const pdfPath = path.join(OUTPUT_DIR, `${id}-final.pdf`);
    await removeIfExists(pdfPath);

    try {
      let browser;
      if (process.env.VERCEL) {
        const chromium = (await import('@sparticuz/chromium')).default;
        const puppeteer = await import('puppeteer-core');
        browser = await puppeteer.default.launch({
          args: chromium.args,
          defaultViewport: { width: 1280, height: 720 },
          executablePath: await chromium.executablePath(),
          headless: true,
        });
      } else {
        const puppeteer = await import('puppeteer');
        browser = await puppeteer.default.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
      }

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
      });
      await browser.close();

      const pdfStat = await stat(pdfPath);
      if (!pdfStat.isFile() || pdfStat.size === 0) {
        throw new Error('PDF 파일이 생성되지 않았습니다.');
      }
    } catch (pdfErr) {
      console.error('PDF 생성 실패:', pdfErr);
      return NextResponse.json({
        error: pdfErr instanceof Error ? pdfErr.message : 'PDF 생성 실패',
      }, { status: 500 });
    }

    const finalOutputs = {
      finalPdf: `/api/download?file=${id}-final.pdf&v=${generationVersion}`,
      previewHtml: `/api/download?file=${id}-preview.html&v=${generationVersion}`,
      finalPdfMode: 'puppeteer',
      finalPdfMessage: 'PDF 생성 완료',
    };

    updateRecordAfterApprove(id, finalOutputs);

    return NextResponse.json({ id, outputs: finalOutputs });
  } catch (error) {
    console.error('승인 처리 오류:', error);
    const message = error instanceof Error ? error.message : '처리 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
