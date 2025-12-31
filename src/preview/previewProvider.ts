/**
 * Preview Provider for md2cv documents
 * Provides real-time HTML preview with zoom/pan functionality
 */

import * as vscode from 'vscode';
import {
  parseMarkdown,
  generateEnHtml,
  generateJaHtml,
  generateRirekishoHTML,
  detectLanguage,
  readPhotoAsDataUri,
  escapeHtml,
  PAGE_SIZES,
  PAGE_SIZES_LANDSCAPE,
  type ParsedCV,
  type PaperSize,
  type OutputFormat,
  type ParseError,
} from 'md2cv';
import {
  SyncScrollManager,
  type ScrollSyncMessage,
  type WebviewScrollMessage,
} from '../client/syncScroll';
import { logger } from '../client/logger';

// ============================================================================
// Types
// ============================================================================

export interface PreviewState {
  documentUri: string;
  format: OutputFormat;
  paperSize: PaperSize;
  photoPath?: string;
  zoomLevel: number;
}

// ============================================================================
// HTML Generator
// ============================================================================

interface HtmlGeneratorOptions {
  format: OutputFormat;
  paperSize: PaperSize;
  photoPath?: string;
}

class HtmlGenerator {
  generate(content: string, options: HtmlGeneratorOptions): string {
    logger.debug('HtmlGenerator.generate called', { format: options.format, paperSize: options.paperSize });
    
    const parseResult = parseMarkdown(content);

    if (!parseResult.ok) {
      logger.warn('Parse error in markdown content', parseResult.error);
      return this.generateErrorHtml(parseResult.error);
    }

    return this.generateFormatHtml(parseResult.value, options);
  }

  private generateErrorHtml(errors: ParseError[]): string {
    const errorList = errors.map((e) => `<li>${escapeHtml(e.message)}</li>`).join('');
    return `<!DOCTYPE html>
<html><head>
<style>body{font-family:system-ui,sans-serif;padding:20px}.error{color:#d32f2f}</style>
</head><body>
<h2 class="error">${vscode.l10n.t('Parse Error')}</h2>
<ul>${errorList}</ul>
</body></html>`;
  }

  private generateFormatHtml(parsedCV: ParsedCV, options: HtmlGeneratorOptions): string {
    const cvInput = { metadata: parsedCV.metadata, sections: parsedCV.sections };
    const { format, paperSize, photoPath } = options;

    logger.debug('Generating HTML for format', { format, paperSize });

    // Detect language for format decisions
    const language = detectLanguage(cvInput);

    switch (format) {
      case 'rirekisho':
        // Rirekisho is only for Japanese - fall back to CV for English
        if (language === 'en') {
          logger.debug('Rirekisho requested but language is EN, using CV format');
          return generateEnHtml(cvInput, { paperSize });
        }
        return generateRirekishoHTML(cvInput, {
          paperSize,
          chronologicalOrder: 'asc',
          hideMotivation: false,
          photoDataUri: photoPath ? this.loadPhoto(photoPath) : undefined,
        });

      case 'both':
        // Both is only for Japanese - fall back to CV for English
        if (language === 'en') {
          logger.debug('Both requested but language is EN, using CV format');
          return generateEnHtml(cvInput, { paperSize });
        }
        return this.generateBothFormatsHtml(cvInput, paperSize, photoPath);

      case 'cv':
      default: {
        logger.debug('Detected language for CV', { language });
        return language === 'ja'
          ? generateJaHtml(cvInput, { paperSize })
          : generateEnHtml(cvInput, { paperSize });
      }
    }
  }

  private generateBothFormatsHtml(
    cvInput: { metadata: ParsedCV['metadata']; sections: ParsedCV['sections'] },
    paperSize: PaperSize,
    photoPath?: string
  ): string {
    const rirekishoHtml = generateRirekishoHTML(cvInput, {
      paperSize,
      chronologicalOrder: 'asc',
      hideMotivation: false,
      photoDataUri: photoPath ? this.loadPhoto(photoPath) : undefined,
    });
    const shokumukeirekishoHtml = generateJaHtml(cvInput, { paperSize });

    // Get paper dimensions for each format
    const cvDimensions = PAGE_SIZES[paperSize];
    const rirekishoDimensions = PAGE_SIZES_LANDSCAPE[paperSize];
    
    // Convert mm to pixels (96 DPI, 1 inch = 25.4mm)
    const mmToPx = 96 / 25.4;
    const cvWidthPx = Math.round(cvDimensions.width * mmToPx);
    const cvHeightPx = Math.round(cvDimensions.height * mmToPx);
    const rirekishoWidthPx = Math.round(rirekishoDimensions.width * mmToPx);
    const rirekishoHeightPx = Math.round(rirekishoDimensions.height * mmToPx);

    return `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8">
<style>
body{margin:0;padding:20px;font-family:system-ui,sans-serif;background:#525252}
.section{border:1px solid #ccc;border-radius:8px;overflow:hidden;margin-bottom:40px;background:#e0e0e0}
.header{background:#d0d0d0;padding:10px 20px;font-weight:bold;border-bottom:1px solid #bbb}
.content{padding:20px;display:flex;justify-content:center}
iframe{border:none;box-shadow:0 2mm 8mm rgba(0,0,0,0.3);background:#fff}
</style>
</head><body>
<div class="section">
<div class="header">職務経歴書</div>
<div class="content"><iframe id="cv-frame" srcdoc="${escapeHtml(shokumukeirekishoHtml)}" style="width:${cvWidthPx}px;height:${cvHeightPx}px"></iframe></div>
</div>
<div class="section">
<div class="header">履歴書</div>
<div class="content"><iframe id="rirekisho-frame" srcdoc="${escapeHtml(rirekishoHtml)}" style="width:${rirekishoWidthPx}px;height:${rirekishoHeightPx}px"></iframe></div>
</div>
<script>
(function(){
  // Adjust CV iframe size based on content
  const cvFrame = document.getElementById('cv-frame');
  cvFrame.onload = function() {
    const doc = cvFrame.contentDocument;
    if (doc && doc.body) {
      doc.body.style.width = '${cvWidthPx}px';
      doc.body.style.minWidth = '${cvWidthPx}px';
      doc.body.style.maxWidth = '${cvWidthPx}px';
      doc.body.style.margin = '0';
      doc.body.style.boxSizing = 'border-box';
      // Adjust height if content is taller
      const contentHeight = doc.body.scrollHeight;
      if (contentHeight > ${cvHeightPx}) {
        cvFrame.style.height = contentHeight + 'px';
      }
    }
  };
  
  // Adjust Rirekisho iframe size based on spread element
  const rirekishoFrame = document.getElementById('rirekisho-frame');
  rirekishoFrame.onload = function() {
    const doc = rirekishoFrame.contentDocument;
    if (doc) {
      const spread = doc.querySelector('.spread');
      if (spread) {
        const rect = spread.getBoundingClientRect();
        rirekishoFrame.style.width = Math.ceil(rect.width) + 'px';
        rirekishoFrame.style.height = Math.ceil(rect.height) + 'px';
        if (doc.body) {
          doc.body.style.width = Math.ceil(rect.width) + 'px';
          doc.body.style.height = Math.ceil(rect.height) + 'px';
          doc.body.style.overflow = 'hidden';
          doc.body.style.margin = '0';
          doc.body.style.padding = '0';
        }
      }
    }
  };
})();
</script>
</body></html>`;
  }

  private loadPhoto(photoPath: string): string | undefined {
    try {
      return readPhotoAsDataUri(photoPath);
    } catch (error) {
      logger.warn('Failed to load photo', { photoPath, error });
      return undefined;
    }
  }
}

// ============================================================================
// Webview HTML Builder
// ============================================================================

/**
 * Options for building webview HTML
 */
interface WebviewHtmlOptions {
  format: OutputFormat;
  paperSize: PaperSize;
}

/**
 * Paper dimensions type (from md2cv PAGE_SIZES)
 */
type PaperDimensions = { width: number; height: number };

/**
 * Get paper dimensions based on format and paper size
 * CV uses portrait, Rirekisho uses landscape
 */
function getPaperDimensions(format: OutputFormat, paperSize: PaperSize): PaperDimensions {
  if (format === 'rirekisho') {
    return PAGE_SIZES_LANDSCAPE[paperSize];
  }
  // CV uses portrait orientation
  return PAGE_SIZES[paperSize];
}

/**
 * Build the webview HTML that wraps md2cv output with zoom/pan controls
 * 
 * Design: md2cv's HTML is displayed in an iframe, and the outer document
 * provides zoom/pan functionality. This keeps md2cv's CSS isolated.
 * 
 * The iframe size is set based on the document format and paper size:
 * - CV: Portrait orientation (e.g., A4 = 210mm x 297mm)
 * - Rirekisho: Landscape orientation (e.g., A4 = 297mm x 210mm)
 */
function buildWebviewHtml(cvHtml: string, options: WebviewHtmlOptions): string {
  const { format, paperSize } = options;
  const dimensions = getPaperDimensions(format, paperSize);
  
  logger.debug('Building webview HTML', { 
    format, 
    paperSize, 
    dimensions,
    isLandscape: format === 'rirekisho'
  });

  // Escape HTML for embedding in JavaScript template literal
  const escapedHtml = cvHtml
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');

  // Convert mm to pixels (assuming 96 DPI, 1 inch = 25.4mm)
  // 1mm = 96 / 25.4 ≈ 3.78 pixels
  const mmToPx = 96 / 25.4;
  const widthPx = Math.round(dimensions.width * mmToPx);
  const heightPx = Math.round(dimensions.height * mmToPx);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden}
#viewport{position:fixed;inset:0;overflow:auto;background:#525252}
#container{display:inline-block;padding:40px;transform-origin:0 0}
#frame{display:block;border:none;box-shadow:0 2mm 12mm rgba(0,0,0,0.5);background:#fff}
#controls{position:fixed;bottom:20px;right:20px;display:flex;gap:6px;background:#2d2d2d;padding:8px 10px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.4);border:1px solid #404040;z-index:1000}
.btn{width:28px;height:28px;border:none;background:#3c3c3c;color:#e0e0e0;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold}
.btn:hover{background:#505050}
.btn:active{background:#0078d4}
#zoom-level{min-width:48px;text-align:center;line-height:28px;color:#e0e0e0;font-size:11px;font-family:system-ui}
#paper-size-controls{position:fixed;bottom:20px;left:20px;display:flex;gap:4px;background:#2d2d2d;padding:6px 8px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.4);border:1px solid #404040;z-index:1000}
.paper-btn{padding:4px 8px;border:none;background:#3c3c3c;color:#e0e0e0;border-radius:4px;cursor:pointer;font-size:11px;font-family:system-ui}
.paper-btn:hover{background:#505050}
.paper-btn.active{background:#0078d4;color:#fff}
#debug-info{position:fixed;top:10px;left:10px;background:rgba(0,0,0,0.7);color:#fff;padding:8px 12px;border-radius:4px;font-size:11px;font-family:monospace;z-index:1000;display:none}
</style>
</head>
<body>
<div id="viewport">
<div id="container">
<iframe id="frame"></iframe>
</div>
</div>
<div id="paper-size-controls">
<button class="paper-btn${paperSize === 'a3' ? ' active' : ''}" data-size="a3">A3</button>
<button class="paper-btn${paperSize === 'a4' ? ' active' : ''}" data-size="a4">A4</button>
<button class="paper-btn${paperSize === 'b4' ? ' active' : ''}" data-size="b4">B4</button>
<button class="paper-btn${paperSize === 'b5' ? ' active' : ''}" data-size="b5">B5</button>
<button class="paper-btn${paperSize === 'letter' ? ' active' : ''}" data-size="letter">Letter</button>
</div>
<div id="controls">
<button class="btn" id="btn-out" title="Zoom Out">−</button>
<span id="zoom-level">100%</span>
<button class="btn" id="btn-in" title="Zoom In">+</button>
<button class="btn" id="btn-reset" title="Reset">↺</button>
<button class="btn" id="btn-fit" title="Fit Width">⊡</button>
</div>
<div id="debug-info"></div>
<script>
(function(){
const vscode = acquireVsCodeApi();
const cvHtml = \`${escapedHtml}\`;

// Paper dimensions from extension
const paperWidth = ${widthPx};
const paperHeight = ${heightPx};
const format = '${format}';
const paperSize = '${paperSize}';
const isRirekisho = format === 'rirekisho';

const viewport = document.getElementById('viewport');
const container = document.getElementById('container');
const frame = document.getElementById('frame');
const debugInfo = document.getElementById('debug-info');

// Paper size button handlers
document.querySelectorAll('.paper-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const size = btn.dataset.size;
    vscode.postMessage({ type: 'changePaperSize', paperSize: size });
  });
});

let zoom = 1;
const MIN = 0.25, MAX = 4, STEP = 0.05;

// Write CV HTML to iframe
const doc = frame.contentDocument;
doc.open();
doc.write(cvHtml);
doc.close();

// Update debug info
function updateDebugInfo(msg) {
  debugInfo.textContent = msg;
}

// Adjust iframe size based on format and paper size
function adjustSize() {
  const body = doc.body;
  if (!body) {
    updateDebugInfo('No body found');
    return;
  }
  
  let w, h;
  
  if (isRirekisho) {
    // For rirekisho, use .spread element which has explicit dimensions
    const spread = doc.querySelector('.spread');
    if (spread) {
      const rect = spread.getBoundingClientRect();
      w = Math.ceil(rect.width);
      h = Math.ceil(rect.height);
      
      // Constrain body to spread size
      body.style.width = w + 'px';
      body.style.height = h + 'px';
      body.style.overflow = 'hidden';
      body.style.margin = '0';
      body.style.padding = '0';
    } else {
      // Fallback to paper dimensions
      w = paperWidth;
      h = paperHeight;
    }
  } else {
    // For CV, use paper dimensions (portrait)
    // Force the body width to match paper width to ensure portrait orientation
    w = paperWidth;
    
    // Force body width in pixels to override the mm-based width from md2cv
    body.style.width = w + 'px';
    body.style.minWidth = w + 'px';
    body.style.maxWidth = w + 'px';
    body.style.margin = '0';
    body.style.boxSizing = 'border-box';
    
    // Wait for reflow and get actual content height
    h = paperHeight;
    const contentHeight = body.scrollHeight;
    if (contentHeight > h) {
      h = contentHeight;
    }
  }
  
  frame.style.width = w + 'px';
  frame.style.height = h + 'px';
  
  updateDebugInfo('Format: ' + format + ', Paper: ' + paperSize + ', Size: ' + w + 'x' + h + 'px, Body: ' + body.style.width);
  updateZoom();
}

function updateZoom() {
  container.style.transform = 'scale(' + zoom + ')';
  document.getElementById('zoom-level').textContent = Math.round(zoom * 100) + '%';
}

function setZoom(z, cx, cy) {
  z = Math.max(MIN, Math.min(MAX, z));
  if (z === zoom) return;
  
  // Calculate scroll adjustment for cursor-centered zoom
  const rect = container.getBoundingClientRect();
  const px = (viewport.scrollLeft + cx - rect.left) / zoom;
  const py = (viewport.scrollTop + cy - rect.top) / zoom;
  
  zoom = z;
  updateZoom();
  
  // Adjust scroll to keep point under cursor
  const newRect = container.getBoundingClientRect();
  viewport.scrollLeft = px * zoom + newRect.left - cx;
  viewport.scrollTop = py * zoom + newRect.top - cy;
  
  vscode.postMessage({ type: 'zoomChanged', zoomLevel: zoom });
}

function fitWidth() {
  const fw = parseFloat(frame.style.width) || paperWidth;
  zoom = Math.max(MIN, Math.min(MAX, (viewport.clientWidth - 80) / fw));
  updateZoom();
  viewport.scrollLeft = 0;
  viewport.scrollTop = 0;
}

// Event handlers
document.getElementById('btn-in').onclick = () => setZoom(zoom + STEP, viewport.clientWidth/2, viewport.clientHeight/2);
document.getElementById('btn-out').onclick = () => setZoom(zoom - STEP, viewport.clientWidth/2, viewport.clientHeight/2);
document.getElementById('btn-reset').onclick = () => { zoom = 1; updateZoom(); };
document.getElementById('btn-fit').onclick = fitWidth;

viewport.addEventListener('wheel', e => {
  // Pinch-to-zoom on trackpad sends wheel events with ctrlKey=true
  // Also handle metaKey for keyboard shortcuts
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    e.stopPropagation();
    setZoom(zoom + (e.deltaY > 0 ? -STEP : STEP), e.clientX, e.clientY);
  }
}, { passive: false, capture: true });

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(zoom + STEP, viewport.clientWidth/2, viewport.clientHeight/2); }
    else if (e.key === '-') { e.preventDefault(); setZoom(zoom - STEP, viewport.clientWidth/2, viewport.clientHeight/2); }
    else if (e.key === '0') { e.preventDefault(); zoom = 1; updateZoom(); }
  }
});

// Pinch-to-zoom (Safari)
let gestureZoom = 1, gestureX = 0, gestureY = 0;
viewport.addEventListener('gesturestart', e => { e.preventDefault(); gestureZoom = zoom; gestureX = e.clientX; gestureY = e.clientY; });
viewport.addEventListener('gesturechange', e => { e.preventDefault(); setZoom(gestureZoom * e.scale, gestureX, gestureY); });
viewport.addEventListener('gestureend', e => e.preventDefault());

// Also capture wheel events at document level for pinch-to-zoom
document.addEventListener('wheel', e => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    e.stopPropagation();
    setZoom(zoom + (e.deltaY > 0 ? -STEP : STEP), e.clientX, e.clientY);
  }
}, { passive: false, capture: true });

// Messages from extension
window.addEventListener('message', e => {
  if (e.data.type === 'setZoom') { zoom = e.data.zoomLevel || 1; updateZoom(); }
});

// Initialize
frame.onload = () => { adjustSize(); setTimeout(fitWidth, 50); };
setTimeout(adjustSize, 100);
setTimeout(adjustSize, 300);
window.addEventListener('resize', () => setTimeout(fitWidth, 100));
})();
</script>
</body>
</html>`;
}

// ============================================================================
// Preview Provider Class
// ============================================================================

export class PreviewProvider implements vscode.Disposable {
  public static readonly viewType = 'md2cv.preview';

  private panel: vscode.WebviewPanel | undefined;
  private state: PreviewState = {
    documentUri: '',
    format: 'cv',
    paperSize: 'a4',
    zoomLevel: 1,
  };
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private disposables: vscode.Disposable[] = [];
  private lastValidHtml: string = '';
  private syncScrollManager: SyncScrollManager;
  private currentDocument: vscode.TextDocument | undefined;
  private onPreviewActiveCallback: (() => void) | undefined;
  private htmlGenerator = new HtmlGenerator();

  constructor(private readonly extensionUri: vscode.Uri) {
    logger.info('PreviewProvider initialized');
    this.syncScrollManager = new SyncScrollManager();

    this.syncScrollManager.onScrollToPreview((message: ScrollSyncMessage) => {
      this.panel?.webview.postMessage(message);
    });

    this.syncScrollManager.onScrollToEditor((line: number) => {
      this.scrollEditorToLine(line);
    });
  }

  private scrollEditorToLine(line: number): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') return;

    const pos = new vscode.Position(line, 0);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.AtTop);
  }

  public show(document: vscode.TextDocument): void {
    logger.info('Opening preview', { 
      uri: document.uri.toString(),
      format: this.state.format,
      paperSize: this.state.paperSize
    });

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        PreviewProvider.viewType,
        vscode.l10n.t('md2cv Preview'),
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [this.extensionUri] }
      );

      this.panel.onDidDispose(() => {
        logger.debug('Preview panel disposed');
        this.panel = undefined;
        vscode.commands.executeCommand('setContext', 'md2cv.previewActive', false);
      }, null, this.disposables);

      this.panel.onDidChangeViewState((e) => {
        vscode.commands.executeCommand('setContext', 'md2cv.previewActive', e.webviewPanel.active);
        if (e.webviewPanel.active) this.onPreviewActiveCallback?.();
      }, null, this.disposables);

      this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg), null, this.disposables);
    }

    this.currentDocument = document;
    this.syncScrollManager.updateSectionPositions(document.getText());
    this.render(document);
  }

  public updatePreview(document: vscode.TextDocument): void {
    if (!this.panel) return;

    this.currentDocument = document;

    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    const delay = vscode.workspace.getConfiguration('md2cv').get<number>('previewUpdateDelay', 300);
    this.debounceTimer = setTimeout(() => {
      logger.debug('Updating preview after debounce');
      this.syncScrollManager.updateSectionPositions(document.getText());
      this.render(document);
      this.panel?.webview.postMessage({ type: 'updateSections' });
    }, delay);
  }

  private render(document: vscode.TextDocument): void {
    if (!this.panel) return;

    logger.debug('Rendering preview', {
      format: this.state.format,
      paperSize: this.state.paperSize,
      hasPhoto: !!this.state.photoPath
    });

    try {
      const cvHtml = this.htmlGenerator.generate(document.getText(), {
        format: this.state.format,
        paperSize: this.state.paperSize,
        photoPath: this.state.photoPath,
      });

      this.lastValidHtml = cvHtml;
      this.state.documentUri = document.uri.toString();
      
      // For 'both' format with Japanese content, the HTML is already complete with its own layout
      // Don't wrap it in buildWebviewHtml which adds another iframe layer
      // Check if the HTML contains the 'both' format markers (職務経歴書 and 履歴書 sections)
      const isBothFormatHtml = this.state.format === 'both' && cvHtml.includes('id="cv-frame"') && cvHtml.includes('id="rirekisho-frame"');
      
      if (isBothFormatHtml) {
        this.panel.webview.html = cvHtml;
      } else {
        this.panel.webview.html = buildWebviewHtml(cvHtml, {
          format: this.state.format === 'both' ? 'cv' : this.state.format,
          paperSize: this.state.paperSize,
        });
      }
      
      logger.debug('Preview rendered successfully');
    } catch (error) {
      logger.error('Preview render failed', error);
      const msg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(vscode.l10n.t('Preview update failed: {0}', msg));

      if (this.lastValidHtml) {
        const isBothFormatHtml = this.state.format === 'both' && this.lastValidHtml.includes('id="cv-frame"') && this.lastValidHtml.includes('id="rirekisho-frame"');
        if (isBothFormatHtml) {
          this.panel.webview.html = this.lastValidHtml;
        } else {
          this.panel.webview.html = buildWebviewHtml(this.lastValidHtml, {
            format: this.state.format === 'both' ? 'cv' : this.state.format,
            paperSize: this.state.paperSize,
          });
        }
      }
    }
  }

  private handleMessage(message: { type: string; [key: string]: unknown }): void {
    switch (message.type) {
      case 'scroll':
        this.syncScrollManager.handleWebviewScroll(message as WebviewScrollMessage);
        break;
      case 'zoomChanged':
        if (typeof message.zoomLevel === 'number') {
          this.state.zoomLevel = message.zoomLevel;
          logger.debug('Zoom level changed', { zoomLevel: message.zoomLevel });
        }
        break;
      case 'changePaperSize':
        if (typeof message.paperSize === 'string') {
          const newSize = message.paperSize as PaperSize;
          logger.info('Paper size changed from preview', { from: this.state.paperSize, to: newSize });
          this.state.paperSize = newSize;
          // Trigger the VS Code command to update configuration and status bar
          vscode.commands.executeCommand('md2cv.setPaperSize', newSize);
          // Re-render with new paper size
          if (this.currentDocument) {
            this.render(this.currentDocument);
          }
        }
        break;
    }
  }

  // Public API
  public setFormat(format: OutputFormat): void {
    logger.info('Format changed', { from: this.state.format, to: format });
    this.state.format = format;
  }
  
  public getFormat(): OutputFormat { return this.state.format; }
  
  public setPaperSize(paperSize: PaperSize): void {
    logger.info('Paper size changed', { from: this.state.paperSize, to: paperSize });
    this.state.paperSize = paperSize;
  }
  
  public getPaperSize(): PaperSize { return this.state.paperSize; }
  
  public setPhotoPath(photoPath: string): void {
    logger.debug('Photo path set', { photoPath });
    this.state.photoPath = photoPath;
  }
  
  public isVisible(): boolean { return this.panel?.visible ?? false; }
  public getCurrentDocument(): vscode.TextDocument | undefined { return this.currentDocument; }
  public onPreviewActive(callback: () => void): void { this.onPreviewActiveCallback = callback; }
  public getSyncScrollManager(): SyncScrollManager { return this.syncScrollManager; }
  public isSyncScrollEnabled(): boolean { return this.syncScrollManager.isEnabled(); }

  public setSyncScrollEnabled(enabled: boolean): void {
    logger.debug('Sync scroll enabled changed', { enabled });
    this.syncScrollManager.setEnabled(enabled);
    this.panel?.webview.postMessage({ type: 'setSyncScrollEnabled', enabled });
  }

  public handleEditorScroll(visibleRanges: readonly vscode.Range[], document: vscode.TextDocument): void {
    if (!this.panel || !this.isVisible()) return;
    this.syncScrollManager.handleEditorScroll(visibleRanges, document);
  }

  public dispose(): void {
    logger.info('PreviewProvider disposing');
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.syncScrollManager.dispose();
    this.panel?.dispose();
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}
