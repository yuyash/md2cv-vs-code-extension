import * as vscode from 'vscode';
import type { OutputFormat, PaperSize } from 'md2cv';

/**
 * Status bar item identifiers
 */
const STATUS_BAR_FORMAT_ID = 'md2cv.format';
const STATUS_BAR_LANGUAGE_ID = 'md2cv.language';

/**
 * Status bar item priority (higher = more to the left)
 */
const STATUS_BAR_PRIORITY = 100;

/**
 * Format display labels for status bar
 */
const FORMAT_LABELS: Record<OutputFormat, string> = {
  cv: 'CV',
  rirekisho: '履歴書',
  both: '両方',
  cover_letter: 'Cover Letter',
};

/**
 * Language display labels for status bar
 */
const LANGUAGE_LABELS: Record<string, string> = {
  en: 'EN',
  ja: 'JA',
};

/**
 * Status Bar Manager for md2cv extension
 * Displays current document format and language in the status bar
 * Paper size is now shown in the preview panel
 */
export class StatusBarManager implements vscode.Disposable {
  private _formatItem: vscode.StatusBarItem;
  private _languageItem: vscode.StatusBarItem;
  private _disposables: vscode.Disposable[] = [];
  private _currentFormat: OutputFormat = 'cv';
  private _currentPaperSize: PaperSize = 'a4';
  private _currentLanguage: 'en' | 'ja' | null = null;
  private _isJapaneseCV: boolean = false;

  constructor() {
    // Create language status bar item (leftmost)
    this._languageItem = vscode.window.createStatusBarItem(
      STATUS_BAR_LANGUAGE_ID,
      vscode.StatusBarAlignment.Right,
      STATUS_BAR_PRIORITY + 1
    );
    this._languageItem.command = 'md2cv.switchLanguage';
    this._languageItem.tooltip = vscode.l10n.t('Click to switch CV language');
    this._disposables.push(this._languageItem);

    // Create format status bar item
    this._formatItem = vscode.window.createStatusBarItem(
      STATUS_BAR_FORMAT_ID,
      vscode.StatusBarAlignment.Right,
      STATUS_BAR_PRIORITY
    );
    this._formatItem.command = 'md2cv.changeFormat';
    this._formatItem.tooltip = vscode.l10n.t('Click to change document format');
    this._disposables.push(this._formatItem);

    // Initialize display
    this._updateFormatDisplay();
    this._updateLanguageDisplay();
  }

  /**
   * Update the format status bar item display
   */
  private _updateFormatDisplay(): void {
    const label = FORMAT_LABELS[this._currentFormat];
    this._formatItem.text = `$(file-text) ${label}`;
  }

  /**
   * Update the language status bar item display
   */
  private _updateLanguageDisplay(): void {
    if (this._currentLanguage) {
      const label = LANGUAGE_LABELS[this._currentLanguage] ?? this._currentLanguage.toUpperCase();
      this._languageItem.text = `$(globe) ${label}`;
    } else {
      this._languageItem.text = `$(globe) --`;
    }
  }

  /**
   * Update the current document format
   * @param format The new document format
   */
  public updateFormat(format: OutputFormat): void {
    this._currentFormat = format;
    this._updateFormatDisplay();
  }

  /**
   * Update the current paper size (kept for internal state tracking)
   * @param paperSize The new paper size
   */
  public updatePaperSize(paperSize: PaperSize): void {
    this._currentPaperSize = paperSize;
  }

  /**
   * Update the current language
   * @param language The detected language or null
   */
  public updateLanguage(language: 'en' | 'ja' | null): void {
    this._currentLanguage = language;
    this._updateLanguageDisplay();
  }

  /**
   * Set whether the current document is a Japanese CV
   * This affects whether the format item is shown
   * @param isJapanese Whether the document is a Japanese CV
   */
  public setIsJapaneseCV(isJapanese: boolean): void {
    this._isJapaneseCV = isJapanese;
    // Format switching is only available for Japanese CVs
    if (this._isJapaneseCV) {
      this._formatItem.show();
    } else {
      this._formatItem.hide();
    }
  }

  /**
   * Get the current document format
   */
  public getFormat(): OutputFormat {
    return this._currentFormat;
  }

  /**
   * Get the current paper size
   */
  public getPaperSize(): PaperSize {
    return this._currentPaperSize;
  }

  /**
   * Get the current language
   */
  public getLanguage(): 'en' | 'ja' | null {
    return this._currentLanguage;
  }

  /**
   * Show status bar items
   * Called when a markdown file is active
   */
  public show(): void {
    // Always show language item for markdown files
    this._languageItem.show();
    // Always show format item (cover letter is available for all languages)
    this._formatItem.show();
  }

  /**
   * Hide status bar items
   * Called when no markdown file is active
   */
  public hide(): void {
    this._languageItem.hide();
    this._formatItem.hide();
  }

  /**
   * Dispose of status bar items
   */
  public dispose(): void {
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
