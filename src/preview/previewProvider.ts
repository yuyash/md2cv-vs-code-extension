/**
 * Preview Provider for md2cv documents
 * Provides real-time HTML preview with Paged.js for accurate page break rendering
 *
 * Architecture:
 * - Uses Paged.js polyfill to render paginated content in browser
 * - Direct HTML rendering (no iframe) for better Paged.js integration
 * - Zoom/pan controls work with paginated pages
 * - PDF export uses same HTML generation for consistency
 * - Incremental content updates preserve scroll position
 * - Sync scroll synchronizes editor and preview scroll positions
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

// ============================================================================
// Content Update Message Types
// ============================================================================

/**
 * Message to update preview content without full HTML replacement
 * This preserves scroll position during content updates
 */
export interface ContentUpdateMessage {
  type: 'updateContent';
  /** The new CV body content (inner HTML) */
  bodyContent: string;
  /** CSS class for the body element */
  bodyClass: string;
  /** CV styles to apply */
  cvStyles: string;
  /** Page configuration CSS */
  pageConfig: string;
}

// ============================================================================
// Types
// ============================================================================

export interface PreviewState {
  documentUri: string;
  format: OutputFormat;
  paperSize: PaperSize;
  photoPath?: string;
  zoomLevel: number;
  /** Whether the webview has been initialized with full HTML */
  initialized: boolean;
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
 * Extracted CV content for incremental updates
 */
export interface ExtractedCvContent {
  bodyContent: string;
  bodyClass: string;
  cvStyles: string;
}

/**
 * Extract content components from CV HTML for incremental updates
 */
export function extractCvContent(cvHtml: string): ExtractedCvContent {
  // Extract body class from CV HTML
  const bodyClassMatch = cvHtml.match(/<body[^>]*class="([^"]*)"[^>]*>/i);
  const bodyClass = bodyClassMatch ? bodyClassMatch[1] : '';

  // Extract content from CV HTML (between <body> tags)
  const bodyMatch = cvHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : cvHtml;

  // Extract styles from CV HTML, but remove @page and body width/padding rules
  const styleMatches = cvHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
  let cvStyles = styleMatches
    .map((s) => {
      const match = s.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      return match ? match[1] : '';
    })
    .join('\n');

  // Remove @page rules and body sizing from CV styles (Paged.js handles this)
  cvStyles = cvStyles
    .replace(/@page\s*\{[^}]*\}/g, '')
    .replace(/body\s*\{[^}]*width:[^}]*\}/g, (match) => {
      return match
        .replace(/width:\s*[^;]+;?/g, '')
        .replace(/min-height:\s*[^;]+;?/g, '')
        .replace(/padding:\s*[^;]+;?/g, '')
        .replace(/margin:\s*0\s*auto;?/g, '');
    });

  return { bodyContent, bodyClass, cvStyles };
}

/**
 * Generate page configuration CSS for Paged.js
 */
export function generatePageConfig(paperSize: PaperSize, format: OutputFormat): string {
  const isRirekisho = format === 'rirekisho';
  const dimensions = isRirekisho ? PAGE_SIZES_LANDSCAPE[paperSize] : PAGE_SIZES[paperSize];
  const mmToPx = 96 / 25.4;
  const widthPx = Math.round(dimensions.width * mmToPx);
  const heightPx = Math.round(dimensions.height * mmToPx);

  // Rirekisho handles its own margins internally via .spread class
  // So we set page margins to 0 for rirekisho format
  if (isRirekisho) {
    return `@page {
  size: ${widthPx}px ${heightPx}px;
  margin: 0;
}`;
  }

  const margins = getMarginSettings();
  return `@page {
  size: ${widthPx}px ${heightPx}px;
  margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;
}`;
}

/**
 * Build webview HTML with Paged.js for accurate page break rendering
 *
 * Strategy: Use Paged.js "renderTo" approach instead of polyfill.
 * - CV content goes in a hidden container
 * - Paged.js renders into a visible container
 * - UI elements are in the HTML from the start (not dynamically created)
 * - This avoids timing issues with the polyfill approach
 */
function buildPagedWebviewHtml(cvHtml: string, options: PagedWebviewOptions): string {
  const { format, paperSize } = options;

  const isRirekisho = format === 'rirekisho';
  const dimensions = isRirekisho ? PAGE_SIZES_LANDSCAPE[paperSize] : PAGE_SIZES[paperSize];
  const mmToPx = 96 / 25.4;
  const widthPx = Math.round(dimensions.width * mmToPx);
  const heightPx = Math.round(dimensions.height * mmToPx);

  // Rirekisho handles its own margins internally via .spread class
  // So we set page margins to 0 for rirekisho format
  const margins = isRirekisho ? { top: 0, right: 0, bottom: 0, left: 0 } : getMarginSettings();

  logger.debug('Building paged webview HTML', { format, paperSize, widthPx, heightPx, margins });

  // Extract body class from CV HTML
  const bodyClassMatch = cvHtml.match(/<body[^>]*class="([^"]*)"[^>]*>/i);
  const bodyClass = bodyClassMatch ? bodyClassMatch[1] : '';

  // Extract content from CV HTML (between <body> tags)
  const bodyMatch = cvHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : cvHtml;

  // Extract styles from CV HTML, but remove @page and body width/padding rules
  const styleMatches = cvHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
  let cvStyles = styleMatches
    .map((s) => {
      const match = s.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      return match ? match[1] : '';
    })
    .join('\n');

  // Remove @page rules and body sizing from CV styles (Paged.js handles this)
  cvStyles = cvStyles
    .replace(/@page\s*\{[^}]*\}/g, '')
    .replace(/body\s*\{[^}]*width:[^}]*\}/g, (match) => {
      return match
        .replace(/width:\s*[^;]+;?/g, '')
        .replace(/min-height:\s*[^;]+;?/g, '')
        .replace(/padding:\s*[^;]+;?/g, '')
        .replace(/margin:\s*0\s*auto;?/g, '');
    });

  // Generate active class for paper size buttons
  const paperBtnClass = (size: string) => (paperSize === size ? 'paper-btn active' : 'paper-btn');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style id="cv-styles">${cvStyles}</style>
<style id="paged-config">
@page {
  size: ${widthPx}px ${heightPx}px;
  margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;
}
</style>
<style id="layout-styles">
html { background: #525252 !important; }
body { margin: 0; padding: 0; background: transparent !important; }
#cv-source { display: none; }
#paged-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 40px;
  background: #525252;
  min-height: 100vh;
}
.pagedjs_pages {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}
.pagedjs_page {
  background: #fff !important;
  box-shadow: 0 2mm 12mm rgba(0,0,0,0.5) !important;
}
</style>
<style id="ui-styles">
#ui-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 10000; }
#ui-overlay > * { pointer-events: auto; }
#loading { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); background: rgba(0,0,0,0.8); color: #fff; padding: 20px 40px; border-radius: 8px; font-family: system-ui; z-index: 10001; }
#loading.hidden { display: none; }
#controls { position: fixed; bottom: 20px; right: 20px; display: flex; gap: 6px; background: #2d2d2d; padding: 8px 10px; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.4); border: 1px solid #404040; z-index: 10000; }
.btn { width: 28px; height: 28px; border: none; background: #3c3c3c; color: #e0e0e0; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; }
.btn:hover { background: #505050; }
.btn:active { background: #0078d4; }
#zoom-level { min-width: 48px; text-align: center; line-height: 28px; color: #e0e0e0; font-size: 11px; font-family: system-ui; }
#paper-size-controls { position: fixed; bottom: 20px; left: 20px; display: flex; gap: 4px; background: #2d2d2d; padding: 6px 8px; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.4); border: 1px solid #404040; z-index: 10000; }
.paper-btn { padding: 4px 8px; border: none; background: #3c3c3c; color: #e0e0e0; border-radius: 4px; cursor: pointer; font-size: 11px; font-family: system-ui; }
.paper-btn:hover { background: #505050; }
.paper-btn.active { background: #0078d4; color: #fff; }
#page-info { position: fixed; top: 20px; right: 20px; background: #2d2d2d; padding: 6px 12px; border-radius: 6px; color: #e0e0e0; font-size: 11px; font-family: system-ui; box-shadow: 0 2px 8px rgba(0,0,0,0.3); z-index: 10000; }
</style>
</head>
<body>
<!-- UI Overlay - always visible, high z-index -->
<div id="ui-overlay">
  <div id="loading">Rendering pages...</div>
  <div id="page-info">Page: <span id="current-page">1</span> / <span id="page-count">-</span></div>
  <div id="paper-size-controls">
    <button class="${paperBtnClass('a3')}" data-size="a3">A3</button>
    <button class="${paperBtnClass('a4')}" data-size="a4">A4</button>
    <button class="${paperBtnClass('b4')}" data-size="b4">B4</button>
    <button class="${paperBtnClass('b5')}" data-size="b5">B5</button>
    <button class="${paperBtnClass('letter')}" data-size="letter">Letter</button>
  </div>
  <div id="controls">
    <button class="btn" id="btn-out" title="Zoom Out">−</button>
    <span id="zoom-level">100%</span>
    <button class="btn" id="btn-in" title="Zoom In">+</button>
    <button class="btn" id="btn-reset" title="Reset">↺</button>
    <button class="btn" id="btn-fit" title="Fit Width">⊡</button>
  </div>
</div>

<!-- Hidden source content for Paged.js -->
<div id="cv-source" class="${bodyClass}">
${bodyContent}
</div>

<!-- Paged.js renders here -->
<div id="paged-container"></div>

<!-- Use paged.min.js (NOT polyfill) for manual control -->
<script>
// Track if Paged.js loaded successfully
window.pagedJsLoaded = false;
window.pagedJsError = null;
</script>
<script src="https://unpkg.com/pagedjs/dist/paged.min.js" onload="window.pagedJsLoaded=true" onerror="window.pagedJsError='Failed to load script'"></script>
<script>
(function() {
  const vscode = acquireVsCodeApi();
  console.log('[md2cv] Script starting...');

  const paperWidth = ${widthPx};
  const paperHeight = ${heightPx};
  const marginTop = ${margins.top};
  const marginRight = ${margins.right};
  const marginBottom = ${margins.bottom};
  const marginLeft = ${margins.left};
  let zoom = 1;
  const MIN = 0.25, MAX = 4, STEP = 0.05;

  function updateZoom() {
    const container = document.getElementById('paged-container');
    if (container) {
      container.style.transform = 'scale(' + zoom + ')';
      container.style.transformOrigin = 'top center';
    }
    const zoomEl = document.getElementById('zoom-level');
    if (zoomEl) zoomEl.textContent = Math.round(zoom * 100) + '%';
  }

  function setZoom(z) {
    z = Math.max(MIN, Math.min(MAX, z));
    if (z === zoom) return;
    zoom = z;
    updateZoom();
    vscode.postMessage({ type: 'zoomChanged', zoomLevel: zoom });
  }

  function fitWidth() {
    const page = document.querySelector('.pagedjs_page');
    if (!page) {
      console.log('[md2cv] fitWidth: no page found');
      return;
    }
    const pageWidth = page.offsetWidth || paperWidth;
    zoom = Math.max(MIN, Math.min(MAX, (window.innerWidth - 80) / pageWidth));
    updateZoom();
    window.scrollTo(0, 0);
    console.log('[md2cv] fitWidth:', { pageWidth, zoom });
  }

  // Track current page based on scroll position
  let totalPages = 0;
  function updateCurrentPage() {
    if (totalPages === 0) return;
    const pages = document.querySelectorAll('.pagedjs_page');
    if (pages.length === 0) return;
    
    const viewportCenter = window.scrollY + window.innerHeight / 2;
    let currentPage = 1;
    
    pages.forEach((page, index) => {
      const rect = page.getBoundingClientRect();
      const pageTop = rect.top + window.scrollY;
      const pageBottom = pageTop + rect.height;
      if (viewportCenter >= pageTop && viewportCenter <= pageBottom) {
        currentPage = index + 1;
      }
    });
    
    const currentPageEl = document.getElementById('current-page');
    if (currentPageEl) currentPageEl.textContent = currentPage.toString();
  }

  // Throttled scroll handler
  let scrollTimeout;
  
  // Scroll position preservation for content updates
  let savedScrollPosition = { x: 0, y: 0 };
  let isUpdatingContent = false;

  function saveScrollPosition() {
    savedScrollPosition = { x: window.scrollX, y: window.scrollY };
    console.log('[md2cv] Saved scroll position:', savedScrollPosition);
  }

  function restoreScrollPosition() {
    if (savedScrollPosition.y > 0 || savedScrollPosition.x > 0) {
      console.log('[md2cv] Restoring scroll position:', savedScrollPosition);
      window.scrollTo(savedScrollPosition.x, savedScrollPosition.y);
    }
  }

  // Sync scroll state
  let syncScrollEnabled = true;
  let isScrollingFromEditor = false;
  let syncScrollTimeout = null;
  // Map of section ID to { element, top, bottom } for scroll sync
  let sectionElements = {};
  // Ordered list of section IDs for position calculation
  let sectionOrder = [];

  function initSectionElements() {
    sectionElements = {};
    sectionOrder = [];
    
    // After Paged.js renders, content is inside .pagedjs_page_content
    // Look for .cv-section elements with class pattern cv-section--{id}
    // The HTML structure is: <section class="cv-section cv-section--summary">
    const container = document.getElementById('paged-container');
    if (!container) {
      console.log('[md2cv] No paged-container found');
      return;
    }

    // Find all cv-section elements in the rendered content
    const sections = container.querySelectorAll('.cv-section');
    console.log('[md2cv] Found cv-section elements:', sections.length);
    
    sections.forEach(section => {
      // Extract section ID from class name (e.g., cv-section--summary -> summary)
      const classList = Array.from(section.classList);
      const sectionClass = classList.find(c => c.startsWith('cv-section--'));
      if (sectionClass) {
        const id = sectionClass.replace('cv-section--', '');
        // Store element reference - positions will be calculated on demand
        sectionElements[id] = { element: section };
        sectionOrder.push(id);
      }
    });

    // Also look for h2 elements as fallback (they contain section titles)
    if (Object.keys(sectionElements).length === 0) {
      container.querySelectorAll('h2').forEach(h2 => {
        const text = h2.textContent?.trim();
        if (text) {
          // Convert title to ID format (lowercase, replace spaces with hyphens)
          const id = text.toLowerCase().replace(/\\s+/g, '-');
          sectionElements[id] = { element: h2 };
          sectionOrder.push(id);
        }
      });
    }

    console.log('[md2cv] Initialized section elements:', Object.keys(sectionElements));
  }

  // Get current position of a section element (recalculates from DOM)
  function getSectionPosition(sectionData) {
    if (!sectionData || !sectionData.element) return null;
    const rect = sectionData.element.getBoundingClientRect();
    return {
      top: rect.top + window.scrollY,
      bottom: rect.bottom + window.scrollY
    };
  }

  function scrollToSection(sectionId, positionInSection) {
    const sectionData = sectionElements[sectionId];
    const pos = getSectionPosition(sectionData);
    if (pos) {
      isScrollingFromEditor = true;
      
      let targetY = pos.top;
      
      // Calculate position within section if provided
      if (typeof positionInSection === 'number' && positionInSection > 0) {
        const sectionHeight = pos.bottom - pos.top;
        targetY += sectionHeight * positionInSection;
      }
      
      window.scrollTo({
        top: Math.max(0, targetY - 20),
        behavior: 'smooth'
      });
      
      setTimeout(() => {
        isScrollingFromEditor = false;
      }, 500);
    } else {
      // Fallback to percentage-based scrolling if section not found
      console.log('[md2cv] Section not found, using position fallback:', sectionId);
      if (typeof positionInSection === 'number') {
        scrollToPosition(positionInSection);
      }
    }
  }

  function scrollToPosition(position) {
    isScrollingFromEditor = true;
    
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const targetY = maxScroll * Math.max(0, Math.min(1, position));
    
    window.scrollTo({
      top: targetY,
      behavior: 'smooth'
    });
    
    setTimeout(() => {
      isScrollingFromEditor = false;
    }, 500);
  }

  function handlePreviewScroll() {
    if (!syncScrollEnabled || isScrollingFromEditor || isUpdatingContent) {
      return;
    }

    if (syncScrollTimeout) {
      clearTimeout(syncScrollTimeout);
    }

    syncScrollTimeout = setTimeout(() => {
      const viewportTop = window.scrollY + 50;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPosition = maxScroll > 0 ? window.scrollY / maxScroll : 0;

      // Find the section that contains the current viewport position
      let visibleSection = null;
      let positionInSection = 0;

      for (const id of sectionOrder) {
        const sectionData = sectionElements[id];
        const pos = getSectionPosition(sectionData);
        if (pos && pos.top <= viewportTop) {
          visibleSection = id;
          // Calculate position within section
          const sectionHeight = pos.bottom - pos.top;
          if (sectionHeight > 0) {
            positionInSection = Math.max(0, Math.min(1, (viewportTop - pos.top) / sectionHeight));
          }
        }
      }

      vscode.postMessage({
        type: 'scroll',
        sectionId: visibleSection,
        position: scrollPosition,
        positionInSection: positionInSection
      });
    }, 100);
  }

  window.addEventListener('scroll', () => {
    // Update current page indicator
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(() => {
      scrollTimeout = null;
      updateCurrentPage();
    }, 50);

    // Handle sync scroll (preview → editor)
    handlePreviewScroll();
  }, { passive: true });

  // Setup UI event listeners
  document.querySelectorAll('.paper-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      console.log('[md2cv] Paper size change:', btn.dataset.size);
      vscode.postMessage({ type: 'changePaperSize', paperSize: btn.dataset.size });
    });
  });

  document.getElementById('btn-in').onclick = () => setZoom(zoom + STEP);
  document.getElementById('btn-out').onclick = () => setZoom(zoom - STEP);
  document.getElementById('btn-reset').onclick = () => { zoom = 1; updateZoom(); };
  document.getElementById('btn-fit').onclick = fitWidth;

  document.addEventListener('wheel', e => {
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
    const message = e.data;
    switch (message.type) {
      case 'setZoom':
        zoom = message.zoomLevel || 1;
        updateZoom();
        break;

      case 'updateContent':
        // Incremental content update - preserves scroll position
        console.log('[md2cv] Received content update');
        isUpdatingContent = true;
        saveScrollPosition();
        
        // Update styles
        const cvStylesEl = document.getElementById('cv-styles');
        if (cvStylesEl && message.cvStyles) {
          cvStylesEl.textContent = message.cvStyles;
        }
        
        const pagedConfigEl = document.getElementById('paged-config');
        if (pagedConfigEl && message.pageConfig) {
          pagedConfigEl.textContent = message.pageConfig;
        }
        
        // Update source content
        const source = document.getElementById('cv-source');
        if (source) {
          source.className = message.bodyClass || '';
          source.innerHTML = message.bodyContent;
        }
        
        // Re-render with Paged.js
        renderWithPagedJs().then(() => {
          restoreScrollPosition();
          initSectionElements();
          isUpdatingContent = false;
        });
        break;

      case 'scrollToSection':
        scrollToSection(message.sectionId, message.position);
        break;

      case 'scrollToPosition':
        scrollToPosition(message.position);
        break;

      case 'scrollToLine':
        scrollToPosition(message.line / (document.body.scrollHeight || 1));
        break;

      case 'setSyncScrollEnabled':
        syncScrollEnabled = message.enabled;
        console.log('[md2cv] Sync scroll enabled:', syncScrollEnabled);
        break;

      case 'updateSections':
        initSectionElements();
        break;
    }
  });

  // Use Paged.js Previewer API for manual control
  async function renderWithPagedJs() {
    console.log('[md2cv] Starting Paged.js render...', { paperWidth, paperHeight });
    
    const source = document.getElementById('cv-source');
    const container = document.getElementById('paged-container');
    
    if (!source || !container) {
      console.error('[md2cv] Missing source or container');
      return;
    }

    // Clear previous render
    container.innerHTML = '';
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.classList.remove('hidden');

    try {
      // Use Paged.js Previewer
      const Previewer = window.Paged?.Previewer;
      if (!Previewer) {
        console.error('[md2cv] Paged.js Previewer not found');
        if (loadingEl) loadingEl.textContent = 'Paged.js not loaded';
        return;
      }

      // Get styles from document
      const cvStyles = document.getElementById('cv-styles');
      const pagedConfig = document.getElementById('paged-config');
      
      // Build stylesheets array for Paged.js
      // Inline styles must be passed as objects: { [url]: cssText }
      const stylesheets = [];
      const baseUrl = window.location.href;
      
      if (cvStyles && cvStyles.textContent) {
        const obj = {};
        obj[baseUrl + '#cv-styles'] = cvStyles.textContent;
        stylesheets.push(obj);
      }
      
      if (pagedConfig && pagedConfig.textContent) {
        const obj = {};
        obj[baseUrl + '#paged-config'] = pagedConfig.textContent;
        stylesheets.push(obj);
        console.log('[md2cv] Page CSS:', pagedConfig.textContent);
      }

      const paged = new Previewer();
      
      // Listen for size event to verify @page rules are processed
      paged.on('size', (size) => {
        console.log('[md2cv] Paged.js size event:', size);
      });
      
      const flow = await paged.preview(source.innerHTML, stylesheets, container);
      
      // Debug: check actual rendered page size and flow size
      console.log('[md2cv] Flow size from Paged.js:', flow.size);
      
      setTimeout(() => {
        const page = document.querySelector('.pagedjs_page');
        if (page) {
          const style = window.getComputedStyle(page);
          console.log('[md2cv] Rendered page size:', { 
            offsetWidth: page.offsetWidth, 
            offsetHeight: page.offsetHeight,
            computedWidth: style.width,
            computedHeight: style.height
          });
        }
      }, 50);
      
      const pageCount = flow.total || document.querySelectorAll('.pagedjs_page').length;
      console.log('[md2cv] Paged.js complete:', { pages: pageCount });
      
      totalPages = pageCount;
      document.getElementById('page-count').textContent = pageCount.toString();
      document.getElementById('loading').classList.add('hidden');
      
      // Initialize section elements after render for sync scroll
      initSectionElements();
      
      return flow;
    } catch (err) {
      console.error('[md2cv] Paged.js error:', err);
      document.getElementById('loading').textContent = 'Render error: ' + err.message;
    }
  }

  // Wait for Paged.js to load, then render
  function waitForPagedJs() {
    console.log('[md2cv] Checking Paged.js...', { 
      loaded: window.pagedJsLoaded, 
      error: window.pagedJsError,
      Paged: typeof window.Paged,
      PagedModule: typeof window.PagedModule
    });
    
    if (window.pagedJsError) {
      console.error('[md2cv] Paged.js load error:', window.pagedJsError);
      document.getElementById('loading').textContent = 'Failed to load Paged.js';
      return;
    }
    
    // Check various ways Paged.js might expose itself
    const PagedLib = window.Paged || window.PagedModule || window.pagedjs;
    if (PagedLib && PagedLib.Previewer) {
      window.Paged = PagedLib; // Normalize
      renderWithPagedJs().then(() => {
        setTimeout(() => {
          fitWidth();
          updateCurrentPage();
        }, 100);
      });
    } else if (window.pagedJsLoaded) {
      // Script loaded but Paged not found - check what's available
      console.log('[md2cv] Script loaded, checking globals:', Object.keys(window).filter(k => k.toLowerCase().includes('paged')));
      document.getElementById('loading').textContent = 'Paged.js API not found';
    } else {
      setTimeout(waitForPagedJs, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForPagedJs);
  } else {
    waitForPagedJs();
  }
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
    initialized: false,
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
          this.state.initialized = false;
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
      initialized: this.state.initialized,
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
        // Both format uses iframes, always do full HTML replacement
        this.panel.webview.html = cvHtml;
        this.state.initialized = false;
      } else if (this.state.initialized) {
        // Use incremental update to preserve scroll position
        const extracted = extractCvContent(cvHtml);
        const pageConfig = generatePageConfig(
          this.state.paperSize,
          this.state.format === 'both' ? 'cv' : this.state.format
        );

        this.panel.webview.postMessage({
          type: 'updateContent',
          bodyContent: extracted.bodyContent,
          bodyClass: extracted.bodyClass,
          cvStyles: extracted.cvStyles,
          pageConfig: pageConfig,
        });
      } else {
        // Initial render - full HTML
        this.panel.webview.html = buildPagedWebviewHtml(cvHtml, {
          format: this.state.format === 'both' ? 'cv' : this.state.format,
          paperSize: this.state.paperSize,
        });
        this.state.initialized = true;
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
    if (this.state.format !== format) {
      this.state.format = format;
      // Reset initialized state to force full re-render with new format
      this.state.initialized = false;
    }
  }

  public getFormat(): OutputFormat {
    return this.state.format;
  }

  public setPaperSize(paperSize: PaperSize): void {
    logger.info('Paper size changed', { from: this.state.paperSize, to: paperSize });
    if (this.state.paperSize !== paperSize) {
      this.state.paperSize = paperSize;
      // Reset initialized state to force full re-render with new paper size
      this.state.initialized = false;
    }
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
