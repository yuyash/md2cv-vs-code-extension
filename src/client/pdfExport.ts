/**
 * PDF Export Module for md2cv VS Code Extension
 * Handles PDF generation using md2cv library with Puppeteer
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import puppeteer from 'puppeteer';
import {
  parseMarkdown,
  generateEnHtml,
  generateJaHtml,
  generateRirekishoHTML,
  detectLanguage,
  readPhotoAsDataUri,
  PAGE_SIZES,
  PAGE_SIZES_LANDSCAPE,
  type ParsedCV,
  type PaperSize,
  type OutputFormat,
} from 'md2cv';
import { logger } from './logger';

/**
 * PDF Export Options
 */
export interface PdfExportOptions {
  format: OutputFormat;
  paperSize: PaperSize;
  photoPath?: string;
}

/**
 * PDF Export Result
 */
export interface PdfExportResult {
  success: boolean;
  outputPaths: string[];
  error?: string;
}

/**
 * Generate HTML for PDF export based on format
 */
function generateHtmlForFormat(
  parsedCV: ParsedCV,
  format: OutputFormat,
  paperSize: PaperSize,
  photoPath?: string
): { html: string; formatName: string }[] {
  const cvInput = {
    metadata: parsedCV.metadata,
    sections: parsedCV.sections,
  };

  const language = detectLanguage(cvInput);
  const isJapanese = language === 'ja';
  const results: { html: string; formatName: string }[] = [];

  // Load photo as data URI if provided
  let photoDataUri: string | undefined;
  if (photoPath) {
    try {
      photoDataUri = readPhotoAsDataUri(photoPath);
    } catch {
      // Ignore photo loading errors
    }
  }

  switch (format) {
    case 'rirekisho':
      results.push({
        html: generateRirekishoHTML(cvInput, {
          paperSize,
          chronologicalOrder: 'asc',
          hideMotivation: false,
          photoDataUri,
        }),
        formatName: 'rirekisho',
      });
      break;

    case 'both':
      // Generate both Japanese formats (CV-JA and Rirekisho)
      results.push({
        html: generateJaHtml(cvInput, { paperSize }),
        formatName: 'cv',
      });
      results.push({
        html: generateRirekishoHTML(cvInput, {
          paperSize,
          chronologicalOrder: 'asc',
          hideMotivation: false,
          photoDataUri,
        }),
        formatName: 'rirekisho',
      });
      break;

    case 'cv':
    default:
      if (isJapanese) {
        results.push({
          html: generateJaHtml(cvInput, { paperSize }),
          formatName: 'cv',
        });
      } else {
        results.push({
          html: generateEnHtml(cvInput, { paperSize }),
          formatName: 'cv',
        });
      }
      break;
  }

  return results;
}

/**
 * Generate PDF from HTML using Puppeteer
 */
async function generatePdfFromHtml(
  html: string,
  paperSize: PaperSize,
  isRirekisho: boolean
): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: ['load', 'networkidle0'] });

    const size = PAGE_SIZES[paperSize];

    let pdfOptions: Parameters<typeof page.pdf>[0];

    if (isRirekisho) {
      // Rirekisho uses landscape orientation
      const rirekishoSize = PAGE_SIZES_LANDSCAPE[paperSize];
      await page.setViewport({
        width: Math.round(rirekishoSize.width * 3.78),
        height: Math.round(rirekishoSize.height * 3.78),
        deviceScaleFactor: 2,
      });

      pdfOptions = {
        width: `${rirekishoSize.width}mm`,
        height: `${rirekishoSize.height}mm`,
        printBackground: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        preferCSSPageSize: false,
        scale: 1,
      };
    } else {
      pdfOptions = {
        width: `${size.width}mm`,
        height: `${size.height}mm`,
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
        preferCSSPageSize: true,
      };
    }

    const pdfUint8Array = await page.pdf(pdfOptions);
    return Buffer.from(pdfUint8Array);
  } finally {
    await browser.close();
  }
}

/**
 * Export document to PDF
 */
export async function exportToPdf(
  document: vscode.TextDocument,
  options: PdfExportOptions
): Promise<PdfExportResult> {
  logger.info('Starting PDF export', { format: options.format, paperSize: options.paperSize });
  
  const content = document.getText();

  // Parse markdown
  const parseResult = parseMarkdown(content);
  if (!parseResult.ok) {
    const errorMessages = parseResult.error.map((e) => e.message).join(', ');
    logger.error('PDF export failed: parse error', { errors: errorMessages });
    return {
      success: false,
      outputPaths: [],
      error: vscode.l10n.t('Parse error: {0}', errorMessages),
    };
  }

  const parsedCV = parseResult.value;
  const paperSize = options.paperSize;

  // Generate HTML for each format
  const htmlResults = generateHtmlForFormat(parsedCV, options.format, paperSize, options.photoPath);
  logger.debug('Generated HTML for formats', { formatCount: htmlResults.length });

  // Determine default output directory and base name
  const documentPath = document.uri.fsPath;
  const outputDir = path.dirname(documentPath);
  const baseName = path.basename(documentPath, path.extname(documentPath));

  const outputPaths: string[] = [];

  try {
    // Generate PDF for each format
    for (const { html, formatName } of htmlResults) {
      const isRirekisho = formatName === 'rirekisho';
      const suffix = htmlResults.length > 1 ? `_${formatName}` : '';
      const defaultFileName = `${baseName}${suffix}.pdf`;

      logger.debug('Generating PDF', { formatName, isRirekisho, paperSize });

      // Show save dialog
      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(outputDir, defaultFileName)),
        filters: {
          PDF: ['pdf'],
        },
        title: vscode.l10n.t('Save PDF'),
      });

      if (!saveUri) {
        // User cancelled
        if (outputPaths.length === 0) {
          logger.info('PDF export cancelled by user');
          return {
            success: false,
            outputPaths: [],
            error: vscode.l10n.t('Export cancelled'),
          };
        }
        // If some files were already saved, continue
        continue;
      }

      const outputPath = saveUri.fsPath;
      const pdfBuffer = await generatePdfFromHtml(html, paperSize, isRirekisho);
      fs.writeFileSync(outputPath, pdfBuffer);
      outputPaths.push(outputPath);
      logger.info('PDF saved', { outputPath });
    }

    logger.info('PDF export completed', { outputCount: outputPaths.length });
    return {
      success: true,
      outputPaths,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('PDF export failed', { error: errorMessage });
    return {
      success: false,
      outputPaths: [],
      error: errorMessage,
    };
  }
}

/**
 * Show PDF export completion notification with options
 */
export async function showExportCompletionNotification(outputPaths: string[]): Promise<void> {
  const message =
    outputPaths.length === 1
      ? vscode.l10n.t('PDF exported: {0}', path.basename(outputPaths[0]))
      : vscode.l10n.t('PDFs exported: {0} files', outputPaths.length);

  const openAction = vscode.l10n.t('Open');
  const openFolderAction = vscode.l10n.t('Open Folder');

  const selection = await vscode.window.showInformationMessage(
    message,
    openAction,
    openFolderAction
  );

  if (selection === openAction) {
    // Open the first PDF file
    const uri = vscode.Uri.file(outputPaths[0]);
    await vscode.env.openExternal(uri);
  } else if (selection === openFolderAction) {
    // Open the folder containing the PDF
    const folderUri = vscode.Uri.file(path.dirname(outputPaths[0]));
    await vscode.commands.executeCommand('revealFileInOS', folderUri);
  }
}

/**
 * Show PDF export error notification with details
 */
export function showExportErrorNotification(error: string): void {
  const detailsAction = vscode.l10n.t('Show Details');

  vscode.window
    .showErrorMessage(vscode.l10n.t('PDF export failed'), detailsAction)
    .then((selection) => {
      if (selection === detailsAction) {
        // Show error details in output channel
        const outputChannel = vscode.window.createOutputChannel('md2cv PDF Export');
        outputChannel.appendLine(vscode.l10n.t('PDF Export Error:'));
        outputChannel.appendLine(error);
        outputChannel.appendLine('');
        outputChannel.appendLine(vscode.l10n.t('Possible solutions:'));
        outputChannel.appendLine(vscode.l10n.t('- Ensure the markdown file is valid md2cv format'));
        outputChannel.appendLine(vscode.l10n.t('- Check that all required fields are present'));
        outputChannel.appendLine(
          vscode.l10n.t('- Verify you have write permissions to the output directory')
        );
        outputChannel.show();
      }
    });
}
