/**
 * CV Generation Options Model
 * Centralized configuration for HTML/PDF generation
 * Ensures consistency between preview and export
 */

import * as vscode from 'vscode';
import type { PaperSize, OutputFormat, PageMargins } from 'md2cv';

/**
 * Default page margins in mm (matches md2cv library default)
 */
export const DEFAULT_MARGINS: PageMargins = {
  top: 25,
  right: 25,
  bottom: 25,
  left: 25,
};

/**
 * Get margin settings from VS Code configuration
 * Accepts either a single number (applied to all sides) or an object with top/right/bottom/left
 * Falls back to DEFAULT_MARGINS if not configured
 */
export function getMarginSettings(): PageMargins {
  const config = vscode.workspace.getConfiguration('md2cv');
  const marginConfig = config.get<number | Partial<PageMargins>>('marginMm');

  if (marginConfig === undefined || marginConfig === null) {
    return DEFAULT_MARGINS;
  }

  // Single number: apply to all sides
  if (typeof marginConfig === 'number') {
    return {
      top: marginConfig,
      right: marginConfig,
      bottom: marginConfig,
      left: marginConfig,
    };
  }

  // Object: merge with defaults
  return {
    top: marginConfig.top ?? DEFAULT_MARGINS.top,
    right: marginConfig.right ?? DEFAULT_MARGINS.right,
    bottom: marginConfig.bottom ?? DEFAULT_MARGINS.bottom,
    left: marginConfig.left ?? DEFAULT_MARGINS.left,
  };
}

/**
 * Options for CV generation (preview and export)
 */
export interface CVGenerationOptions {
  readonly format: OutputFormat;
  readonly paperSize: PaperSize;
  readonly marginMm: PageMargins;
  readonly photoPath?: string;
  readonly customStylesheet?: string;
}

/**
 * Create default CV generation options
 */
export function createDefaultOptions(
  format: OutputFormat = 'cv',
  paperSize: PaperSize = 'a4'
): CVGenerationOptions {
  return {
    format,
    paperSize,
    marginMm: getMarginSettings(),
  };
}

/**
 * Merge partial options with defaults
 */
export function mergeOptions(partial: Partial<CVGenerationOptions>): CVGenerationOptions {
  return {
    format: partial.format ?? 'cv',
    paperSize: partial.paperSize ?? 'a4',
    marginMm: partial.marginMm ?? getMarginSettings(),
    ...(partial.photoPath && { photoPath: partial.photoPath }),
    ...(partial.customStylesheet && { customStylesheet: partial.customStylesheet }),
  };
}
