/**
 * Sync Scroll Module
 * Provides synchronized scrolling between editor and preview
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */

import * as vscode from 'vscode';
import { parseMarkdownWithPositions } from 'md2cv/parser/lsp';

/**
 * Section position information for scroll synchronization
 */
export interface SectionPosition {
  /** Section ID (e.g., 'summary', 'experience') */
  id: string;
  /** Section title */
  title: string;
  /** Start line in the editor (0-based) */
  startLine: number;
  /** End line in the editor (0-based) */
  endLine: number;
}

/**
 * Scroll sync message types for webview communication
 */
export interface ScrollSyncMessage {
  type: 'scrollToSection' | 'scrollToLine' | 'scrollToPosition';
  /** Section ID to scroll to (legacy) */
  sectionId?: string;
  /** Line number to scroll to (0-based) */
  line?: number;
  /** Scroll position as percentage (0-1) */
  position?: number;
}

/**
 * Message from webview for reverse sync (preview → editor)
 */
export interface WebviewScrollMessage {
  type: 'scroll';
  /** Source line number (0-based) */
  line?: number;
  /** Section start line (0-based) */
  sectionStartLine?: number;
  /** Section end line (0-based) */
  sectionEndLine?: number;
  /** Position within the current section (0-1) */
  positionInSection?: number;
  /** Scroll position as percentage (0-1) - fallback */
  position?: number;
}

/**
 * Extract section positions from a markdown document
 * Uses md2cv's LSP parser to get accurate position information
 *
 * @param content The markdown document content
 * @returns Array of section positions
 */
export function extractSectionPositions(content: string): SectionPosition[] {
  const result = parseMarkdownWithPositions(content);

  if (!result.ok) {
    return [];
  }

  const document = result.value;
  const positions: SectionPosition[] = [];

  // Add frontmatter as a section if present
  if (document.frontmatter) {
    positions.push({
      id: 'frontmatter',
      title: 'Frontmatter',
      startLine: document.frontmatter.range.start.line,
      endLine: document.frontmatter.range.end.line,
    });
  }

  // Add each section
  for (const section of document.sections) {
    positions.push({
      id: section.id,
      title: section.title,
      startLine: section.range.start.line,
      endLine: section.range.end.line,
    });
  }

  return positions;
}

/**
 * Find the section at a given line number
 *
 * @param sections Array of section positions
 * @param line The line number (0-based)
 * @returns The section at the line, or null if not found
 */
export function findSectionAtLine(
  sections: SectionPosition[],
  line: number
): SectionPosition | null {
  // Find the section that contains this line
  for (const section of sections) {
    if (line >= section.startLine && line <= section.endLine) {
      return section;
    }
  }

  // If no exact match, find the closest section before this line
  let closestSection: SectionPosition | null = null;
  for (const section of sections) {
    if (section.startLine <= line) {
      if (!closestSection || section.startLine > closestSection.startLine) {
        closestSection = section;
      }
    }
  }

  return closestSection;
}

/**
 * Calculate scroll position within a section
 * Returns a value between 0 and 1 representing the position within the section
 *
 * @param section The section
 * @param line The current line
 * @returns Position within section (0-1)
 */
export function calculatePositionInSection(section: SectionPosition, line: number): number {
  const sectionLength = section.endLine - section.startLine;
  if (sectionLength === 0) {
    return 0;
  }

  const positionInSection = line - section.startLine;
  return Math.max(0, Math.min(1, positionInSection / sectionLength));
}

/**
 * Calculate the overall scroll percentage based on line position
 *
 * @param line Current line number (0-based)
 * @param totalLines Total number of lines in the document
 * @returns Scroll percentage (0-1)
 */
export function calculateScrollPercentage(line: number, totalLines: number): number {
  if (totalLines <= 1) {
    return 0;
  }
  return Math.max(0, Math.min(1, line / (totalLines - 1)));
}

/**
 * Find the line number for a given section ID
 *
 * @param sections Array of section positions
 * @param sectionId The section ID to find
 * @returns The start line of the section, or null if not found
 */
export function findLineForSection(sections: SectionPosition[], sectionId: string): number | null {
  const section = sections.find((s) => s.id === sectionId);
  return section ? section.startLine : null;
}

/**
 * SyncScrollManager class
 * Manages synchronized scrolling between editor and preview
 */
export class SyncScrollManager implements vscode.Disposable {
  private _disposables: vscode.Disposable[] = [];
  private _enabled: boolean = true;
  private _sectionPositions: SectionPosition[] = [];
  private _lastScrollLine: number = -1;
  private _scrollThrottleTimer: ReturnType<typeof setTimeout> | undefined;
  private _onScrollToPreview: ((message: ScrollSyncMessage) => void) | undefined;
  private _onScrollToEditor: ((line: number) => void) | undefined;
  private _isUpdating: boolean = false;
  private _updateTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Load initial enabled state from configuration
    this._loadEnabledState();
  }

  /**
   * Load the enabled state from configuration
   */
  private _loadEnabledState(): void {
    const config = vscode.workspace.getConfiguration('md2cv');
    this._enabled = config.get<boolean>('enableSyncScroll', true);
  }

  /**
   * Check if sync scroll is enabled
   */
  public isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Enable or disable sync scroll
   */
  public setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * Update section positions from document content
   */
  public updateSectionPositions(content: string): void {
    this._sectionPositions = extractSectionPositions(content);
  }

  /**
   * Mark the start of a content update
   * This prevents scroll sync during the update
   */
  public beginUpdate(): void {
    this._isUpdating = true;
    if (this._updateTimer) {
      clearTimeout(this._updateTimer);
    }
  }

  /**
   * Mark the end of a content update
   * Scroll sync is re-enabled after a delay to allow preview to settle
   */
  public endUpdate(): void {
    // Clear updating flag after a delay to allow preview to settle
    this._updateTimer = setTimeout(() => {
      this._isUpdating = false;
    }, 500);
  }

  /**
   * Check if currently updating (prevents scroll sync)
   */
  public isUpdating(): boolean {
    return this._isUpdating;
  }

  /**
   * Get current section positions
   */
  public getSectionPositions(): SectionPosition[] {
    return [...this._sectionPositions];
  }

  /**
   * Set callback for scroll to preview events
   */
  public onScrollToPreview(callback: (message: ScrollSyncMessage) => void): void {
    this._onScrollToPreview = callback;
  }

  /**
   * Set callback for scroll to editor events
   */
  public onScrollToEditor(callback: (line: number) => void): void {
    this._onScrollToEditor = callback;
  }

  /**
   * Handle editor scroll event
   * Called when the editor visible range changes
   *
   * Requirements: 13.1, 13.4
   */
  public handleEditorScroll(
    visibleRanges: readonly vscode.Range[],
    _document: vscode.TextDocument
  ): void {
    if (!this._enabled || !this._onScrollToPreview || this._isUpdating) {
      return;
    }

    if (visibleRanges.length === 0) {
      return;
    }

    const firstVisibleLine = visibleRanges[0].start.line;

    // If line 0 is visible, scroll preview to the very top
    if (firstVisibleLine === 0) {
      if (this._scrollThrottleTimer) {
        clearTimeout(this._scrollThrottleTimer);
      }
      this._lastScrollLine = 0;
      this._onScrollToPreview?.({ type: 'scrollToPosition', position: 0 });
      return;
    }

    // Use a line a few rows below the top of the visible range
    // to avoid being pulled to the previous section when its tail is barely visible
    const targetLine = firstVisibleLine + 5;

    // Throttle scroll events to avoid excessive updates
    if (this._scrollThrottleTimer) {
      clearTimeout(this._scrollThrottleTimer);
    }

    this._scrollThrottleTimer = setTimeout(() => {
      // Skip if updating or if the line hasn't changed significantly
      if (this._isUpdating || Math.abs(targetLine - this._lastScrollLine) < 2) {
        return;
      }

      this._lastScrollLine = targetLine;

      // Send line-based scroll message directly
      this._onScrollToPreview?.({
        type: 'scrollToLine',
        line: targetLine,
      });
    }, 50); // 50ms throttle
  }

  /**
   * Handle editor cursor (selection) change
   * Scrolls preview to the element closest above the cursor line
   */
  public handleCursorChange(cursorLine: number): void {
    if (!this._enabled || !this._onScrollToPreview || this._isUpdating) {
      return;
    }

    if (this._scrollThrottleTimer) {
      clearTimeout(this._scrollThrottleTimer);
    }

    this._scrollThrottleTimer = setTimeout(() => {
      if (this._isUpdating) {
        return;
      }

      this._lastScrollLine = cursorLine;

      this._onScrollToPreview?.({
        type: 'scrollToLine',
        line: cursorLine,
      });
    }, 50);
  }

  /**
   * Handle scroll message from webview (preview → editor)
   *
   * Requirements: 13.2
   */
  public handleWebviewScroll(message: WebviewScrollMessage): void {
    if (!this._enabled || !this._onScrollToEditor || this._isUpdating) {
      return;
    }

    // Use line-based scrolling if available
    if (typeof message.line === 'number') {
      this._onScrollToEditor(message.line);
      return;
    }

    // Fall back to percentage-based scrolling
    if (typeof message.position === 'number' && this._sectionPositions.length > 0) {
      const lastSection = this._sectionPositions[this._sectionPositions.length - 1];
      const totalLines = lastSection.endLine;
      if (totalLines > 0) {
        const targetLine = Math.floor(totalLines * message.position);
        this._onScrollToEditor(targetLine);
      }
    }
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    if (this._scrollThrottleTimer) {
      clearTimeout(this._scrollThrottleTimer);
    }
    if (this._updateTimer) {
      clearTimeout(this._updateTimer);
    }

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
