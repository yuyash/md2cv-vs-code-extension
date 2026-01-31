/**
 * Preview Provider for md2cv documents
 * Provides real-time HTML preview with Paged.js for accurate page break rendering
 *
 * Architecture:
 * - Uses Paged.js polyfill to render paginated content in browser
 * - Direct HTML rendering (no iframe) for better Paged.js integration
 * - Zoom/pan controls work with paginated pages
 * - PDF export uses same HTML generation for consistency
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
import { withEnvFromFile } from '../client/envLoader';
import { getMarginSettings } from '../client/cvOptions';

// Paged.js CDN URL
const PAGED_JS_URL = 'https://unpkg.com/pagedjs/dist/paged.polyfill.js';

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
    logger.debug('HtmlGenerator.generate called', {
      format: options.format,
      paperSize: options.paperSize,
    });

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

    const language = detectLanguage(cvInput);

    switch (format) {
      case 'rirekisho':
        if (language === 'en') {
          logger.debug('Rirekisho requested but language is EN, using CV format');
          return generateEnHtml(cvInput, { paperSize, marginMm: getMarginSettings() });
        }
        return generateRirekishoHTML(cvInput, {
          paperSize,
          chronologicalOrder: 'asc',
          hideMotivation: false,
          photoDataUri: photoPath ? this.loadPhoto(photoPath) : undefined,
        });

      case 'both':
        if (language === 'en') {
          logger.debug('Both requested but language is EN, using CV format');
          return generateEnHtml(cvInput, { paperSize, marginMm: getMarginSettings() });
        }
        return this.generateBothFormatsHtml(cvInput, paperSize, photoPath);

      case 'cv':
      default: {
        logger.debug('Detected language for CV', { language });
        return language === 'ja'
          ? generateJaHtml(cvInput, { paperSize, marginMm: getMarginSettings() })
          : generateEnHtml(cvInput, { paperSize, marginMm: getMarginSettings() });
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
    const shokumukeirekishoHtml = generateJaHtml(cvInput, {
      paperSize,
      marginMm: getMarginSettings(),
    });

    const cvDimensions = PAGE_SIZES[paperSize];
    const rirekishoDimensions = PAGE_SIZES_LANDSCAPE[paperSize];
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
// Paged.js Webview Builder
// ============================================================================

interface PagedWebviewOptions {
  format: OutputFormat;
  paperSize: PaperSize;
}

/**
 * Escape string for use in JavaScript template literal
 */
function escapeForTemplateLiteral(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

/**
 * Build webview HTML with Paged.js for accurate page break rendering
 */
function buildPagedWebviewHtml(cvHtml: string, options: PagedWebviewOptions): string {
  const { format, paperSize } = options;

  const isRirekisho = format === 'rirekisho';
  const dimensions = isRirekisho ? PAGE_SIZES_LANDSCAPE[paperSize] : PAGE_SIZES[paperSize];
  const mmToPx = 96 / 25.4;
  const widthPx = Math.round(dimensions.width * mmToPx);
  const heightPx = Math.round(dimensions.height * mmToPx);

  logger.debug('Building paged webview HTML', { format, paperSize, widthPx, heightPx });

  // Extract content from CV HTML (between <body> tags)
  const bodyMatch = cvHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : cvHtml;

  // Extract styles from CV HTML
  const styleMatches = cvHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
  const cvStyles = styleMatches
    .map((s) => {
      const match = s.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      return match ? match[1] : '';
    })
    .join('\n');

  const escapedContent = escapeForTemplateLiteral(bodyContent);
  const escapedStyles = escapeForTemplateLiteral(cvStyles);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#525252}
#viewport{position:fixed;inset:0;overflow:auto;display:flex;flex-direction:column;align-items:center;padding:40px}
#paged-container{transform-origin:top center;display:flex;flex-direction:column;align-items:center;gap:20px}
.pagedjs_page{background:#fff;box-shadow:0 2mm 12mm rgba(0,0,0,0.5);margin-bottom:20px}
#loading{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.8);color:#fff;padding:20px 40px;border-radius:8px;font-family:system-ui;z-index:2000}
#debug-panel{position:fixed;top:10px;left:10px;background:rgba(0,0,0,0.85);color:#0f0;padding:10px 15px;border-radius:6px;font-family:'SF Mono',Monaco,monospace;font-size:11px;max-width:400px;max-height:300px;overflow:auto;z-index:1000;display:none}
#debug-panel.visible{display:block}
#debug-panel pre{margin:0;white-space:pre-wrap;word-break:break-all}
#controls{position:fixed;bottom:20px;right:20px;display:flex;gap:6px;background:#2d2d2d;padding:8px 10px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.4);border:1px solid #404040;z-index:1000}
.btn{width:28px;height:28px;border:none;background:#3c3c3c;color:#e0e0e0;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold}
.btn:hover{background:#505050}
.btn:active{background:#0078d4}
#zoom-level{min-width:48px;text-align:center;line-height:28px;color:#e0e0e0;font-size:11px;font-family:system-ui}
#paper-size-controls{position:fixed;bottom:20px;left:20px;display:flex;gap:4px;background:#2d2d2d;padding:6px 8px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.4);border:1px solid #404040;z-index:1000}
.paper-btn{padding:4px 8px;border:none;background:#3c3c3c;color:#e0e0e0;border-radius:4px;cursor:pointer;font-size:11px;font-family:system-ui}
.paper-btn:hover{background:#505050}
.paper-btn.active{background:#0078d4;color:#fff}
#page-info{position:fixed;top:20px;right:20px;background:#2d2d2d;padding:6px 12px;border-radius:6px;color:#e0e0e0;font-size:11px;font-family:system-ui;box-shadow:0 2px 8px rgba(0,0,0,0.3);z-index:1000}
</style>
</head>
<body>
<div id="loading">Rendering pages...</div>
<div id="debug-panel"><pre id="debug-log"></pre></div>
<div id="viewport"><div id="paged-container"></div></div>
<div id="page-info">Pages: <span id="page-count">-</span></div>
<div id="paper-size-controls">
<button class="paper-btn${paperSize === 'a3' ? ' active' : ''}" data-size="a3">A3</button>
<button class="paper-btn${paperSize === 'a4' ? ' active' : ''}" data-size="a4">A4</button>
<button class="paper-btn${paperSize === 'b4' ? ' active' : ''}" data-size="b4">B4</button>
<button class="paper-btn${paperSize === 'b5' ? ' active' : ''}" data-size="b5">B5</button>
<button class="paper-btn${paperSize === 'letter' ? ' active' : ''}" data-size="letter">Letter</button>
</div>
<div id="controls">
<button class="btn" id="btn-debug" title="Toggle Debug">🐛</button>
<button class="btn" id="btn-out" title="Zoom Out">−</button>
<span id="zoom-level">100%</span>
<button class="btn" id="btn-in" title="Zoom In">+</button>
<button class="btn" id="btn-reset" title="Reset">↺</button>
<button class="btn" id="btn-fit" title="Fit Width">⊡</button>
</div>
<script src="${PAGED_JS_URL}"></script>
<script>
(function(){
const vscode = acquireVsCodeApi();
const debugPanel = document.getElementById('debug-panel');
const debugLog = document.getElementById('debug-log');
let debugVisible = false;

function log(msg, data) {
  const ts = new Date().toISOString().substr(11, 12);
  let line = '[' + ts + '] ' + msg;
  if (data) line += ' ' + JSON.stringify(data);
  debugLog.textContent += line + '\\n';
  debugLog.scrollTop = debugLog.scrollHeight;
  console.log('[md2cv]', msg, data || '');
}

document.getElementById('btn-debug').onclick = () => {
  debugVisible = !debugVisible;
  debugPanel.classList.toggle('visible', debugVisible);
};

const paperWidth = ${widthPx};
const paperHeight = ${heightPx};
const format = '${format}';
const paperSize = '${paperSize}';

log('Initializing preview', { format, paperSize, paperWidth, paperHeight });

const cvStyles = \`${escapedStyles}\`;
const cvContent = \`${escapedContent}\`;

let zoom = 1;
const MIN = 0.25, MAX = 4, STEP = 0.05;

const viewport = document.getElementById('viewport');
const container = document.getElementById('paged-container');
const loading = document.getElementById('loading');
const pageCount = document.getElementById('page-count');

document.querySelectorAll('.paper-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    log('Paper size change', { size: btn.dataset.size });
    vscode.postMessage({ type: 'changePaperSize', paperSize: btn.dataset.size });
  });
});

function updateZoom() {
  container.style.transform = 'scale(' + zoom + ')';
  document.getElementById('zoom-level').textContent = Math.round(zoom * 100) + '%';
}

function setZoom(z) {
  z = Math.max(MIN, Math.min(MAX, z));
  if (z === zoom) return;
  zoom = z;
  updateZoom();
  vscode.postMessage({ type: 'zoomChanged', zoomLevel: zoom });
}

function fitWidth() {
  const pages = container.querySelectorAll('.pagedjs_page');
  if (pages.length === 0) return;
  const pageWidth = pages[0].offsetWidth || paperWidth;
  zoom = Math.max(MIN, Math.min(MAX, (viewport.clientWidth - 80) / pageWidth));
  updateZoom();
  viewport.scrollLeft = 0;
  viewport.scrollTop = 0;
  log('Fit width', { pageWidth, zoom });
}

document.getElementById('btn-in').onclick = () => setZoom(zoom + STEP);
document.getElementById('btn-out').onclick = () => setZoom(zoom - STEP);
document.getElementById('btn-reset').onclick = () => { zoom = 1; updateZoom(); };
document.getElementById('btn-fit').onclick = fitWidth;

viewport.addEventListener('wheel', e => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    setZoom(zoom + (e.deltaY > 0 ? -STEP : STEP));
  }
}, { passive: false });

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(zoom + STEP); }
    else if (e.key === '-') { e.preventDefault(); setZoom(zoom - STEP); }
    else if (e.key === '0') { e.preventDefault(); zoom = 1; updateZoom(); }
  }
});

window.addEventListener('message', e => {
  if (e.data.type === 'setZoom') { zoom = e.data.zoomLevel || 1; updateZoom(); }
});


async function renderWithPagedJs() {
  log('Starting Paged.js render');
  try {
    const styleEl = document.createElement('style');
    styleEl.textContent = cvStyles;
    document.head.appendChild(styleEl);
    
    log('Configuring Paged.js', { width: paperWidth + 'px', height: paperHeight + 'px' });
    
    const paged = new Paged.Previewer();
    const flow = await paged.preview(
      cvContent,
      [{ width: paperWidth + 'px', height: paperHeight + 'px' }],
      container
    );
    
    const pages = container.querySelectorAll('.pagedjs_page');
    log('Paged.js render complete', { pageCount: pages.length });
    
    pageCount.textContent = pages.length.toString();
    loading.style.display = 'none';
    
    setTimeout(fitWidth, 100);
  } catch (error) {
    log('Paged.js render error', { error: error.message || String(error) });
    loading.textContent = 'Render error: ' + (error.message || error);
    loading.style.background = '#d32f2f';
  }
}

renderWithPagedJs();
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
    logger.info('PreviewProvider initialized (Paged.js mode)');
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
      paperSize: this.state.paperSize,
    });

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        PreviewProvider.viewType,
        vscode.l10n.t('md2cv Preview'),
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [this.extensionUri],
        }
      );

      this.panel.onDidDispose(
        () => {
          logger.debug('Preview panel disposed');
          this.panel = undefined;
          vscode.commands.executeCommand('setContext', 'md2cv.previewActive', false);
        },
        null,
        this.disposables
      );

      this.panel.onDidChangeViewState(
        (e) => {
          vscode.commands.executeCommand(
            'setContext',
            'md2cv.previewActive',
            e.webviewPanel.active
          );
          if (e.webviewPanel.active) this.onPreviewActiveCallback?.();
        },
        null,
        this.disposables
      );

      this.panel.webview.onDidReceiveMessage(
        (msg) => this.handleMessage(msg),
        null,
        this.disposables
      );
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
      hasPhoto: !!this.state.photoPath,
    });

    try {
      const cvHtml = withEnvFromFile(document.uri.fsPath, () =>
        this.htmlGenerator.generate(document.getText(), {
          format: this.state.format,
          paperSize: this.state.paperSize,
          photoPath: this.state.photoPath,
        })
      );

      this.lastValidHtml = cvHtml;
      this.state.documentUri = document.uri.toString();

      const isBothFormatHtml =
        this.state.format === 'both' &&
        cvHtml.includes('id="cv-frame"') &&
        cvHtml.includes('id="rirekisho-frame"');

      if (isBothFormatHtml) {
        this.panel.webview.html = cvHtml;
      } else {
        this.panel.webview.html = buildPagedWebviewHtml(cvHtml, {
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
        const isBothFormatHtml =
          this.state.format === 'both' &&
          this.lastValidHtml.includes('id="cv-frame"') &&
          this.lastValidHtml.includes('id="rirekisho-frame"');
        if (isBothFormatHtml) {
          this.panel.webview.html = this.lastValidHtml;
        } else {
          this.panel.webview.html = buildPagedWebviewHtml(this.lastValidHtml, {
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
          logger.info('Paper size changed from preview', {
            from: this.state.paperSize,
            to: newSize,
          });
          this.state.paperSize = newSize;
          vscode.commands.executeCommand('md2cv.setPaperSize', newSize);
          if (this.currentDocument) {
            this.render(this.currentDocument);
          }
        }
        break;
    }
  }

  public setFormat(format: OutputFormat): void {
    logger.info('Format changed', { from: this.state.format, to: format });
    this.state.format = format;
  }

  public getFormat(): OutputFormat {
    return this.state.format;
  }

  public setPaperSize(paperSize: PaperSize): void {
    logger.info('Paper size changed', { from: this.state.paperSize, to: paperSize });
    this.state.paperSize = paperSize;
  }

  public getPaperSize(): PaperSize {
    return this.state.paperSize;
  }

  public setPhotoPath(photoPath: string): void {
    logger.debug('Photo path set', { photoPath });
    this.state.photoPath = photoPath;
  }

  public isVisible(): boolean {
    return this.panel?.visible ?? false;
  }

  public getCurrentDocument(): vscode.TextDocument | undefined {
    return this.currentDocument;
  }

  public onPreviewActive(callback: () => void): void {
    this.onPreviewActiveCallback = callback;
  }

  public getSyncScrollManager(): SyncScrollManager {
    return this.syncScrollManager;
  }

  public isSyncScrollEnabled(): boolean {
    return this.syncScrollManager.isEnabled();
  }

  public setSyncScrollEnabled(enabled: boolean): void {
    logger.debug('Sync scroll enabled changed', { enabled });
    this.syncScrollManager.setEnabled(enabled);
    this.panel?.webview.postMessage({ type: 'setSyncScrollEnabled', enabled });
  }

  public handleEditorScroll(
    visibleRanges: readonly vscode.Range[],
    document: vscode.TextDocument
  ): void {
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
