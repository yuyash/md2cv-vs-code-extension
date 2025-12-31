import * as vscode from 'vscode';
import * as fs from 'fs';
import {
  validateImageFormat as validateImageFormatPure,
  SUPPORTED_IMAGE_EXTENSIONS,
  type PhotoValidationResult,
} from './photoValidation';

// Re-export for convenience
export { SUPPORTED_IMAGE_EXTENSIONS, type PhotoValidationResult };
export { validateImageFormat as validateImageFormatPure } from './photoValidation';

/**
 * Validate if a file path points to a supported image format
 * Uses VS Code l10n for localized error messages
 * @param filePath - Path to the image file
 * @returns Validation result with valid flag and optional error message
 */
export function validateImageFormat(filePath: string): PhotoValidationResult {
  const result = validateImageFormatPure(filePath);

  if (!result.valid && result.error) {
    // Localize the error message
    if (result.error === 'No file path provided') {
      return {
        valid: false,
        error: vscode.l10n.t('No file path provided'),
      };
    }
    if (result.error.includes('Unsupported image format')) {
      return {
        valid: false,
        error: vscode.l10n.t(
          'Unsupported image format. Supported formats: {0}',
          SUPPORTED_IMAGE_EXTENSIONS.join(', ')
        ),
      };
    }
  }

  return result;
}

/**
 * Check if a file exists at the given path
 * @param filePath - Path to check
 * @returns true if file exists, false otherwise
 */
export function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * Show file selection dialog for photo insertion
 * @returns Selected file URI or undefined if cancelled
 */
export async function showPhotoSelectionDialog(): Promise<vscode.Uri | undefined> {
  const options: vscode.OpenDialogOptions = {
    canSelectMany: false,
    openLabel: vscode.l10n.t('Select Photo'),
    filters: {
      [vscode.l10n.t('Images')]: SUPPORTED_IMAGE_EXTENSIONS,
    },
    title: vscode.l10n.t('Select Photo for Rirekisho'),
  };

  const fileUris = await vscode.window.showOpenDialog(options);
  return fileUris?.[0];
}

/**
 * Save photo path to workspace configuration
 * @param photoPath - Path to the photo file
 * @returns Promise that resolves when configuration is saved
 */
export async function savePhotoPathToConfig(photoPath: string): Promise<void> {
  const config = vscode.workspace.getConfiguration('md2cv');
  await config.update('photoPath', photoPath, vscode.ConfigurationTarget.Workspace);
}

/**
 * Get photo path from configuration
 * @returns Photo path from configuration or empty string if not set
 */
export function getPhotoPathFromConfig(): string {
  const config = vscode.workspace.getConfiguration('md2cv');
  return config.get<string>('photoPath', '');
}

/**
 * Clear photo path from configuration
 * @returns Promise that resolves when configuration is cleared
 */
export async function clearPhotoPath(): Promise<void> {
  const config = vscode.workspace.getConfiguration('md2cv');
  await config.update('photoPath', undefined, vscode.ConfigurationTarget.Workspace);
}

/**
 * Result of photo insertion operation
 */
export interface PhotoInsertionResult {
  success: boolean;
  photoPath?: string;
  error?: string;
}

/**
 * Execute the photo insertion workflow
 * Shows file dialog, validates selection, and saves to configuration
 * @returns Result of the photo insertion operation
 */
export async function insertPhoto(): Promise<PhotoInsertionResult> {
  // Show file selection dialog
  const fileUri = await showPhotoSelectionDialog();

  if (!fileUri) {
    // User cancelled the dialog
    return { success: false };
  }

  const photoPath = fileUri.fsPath;

  // Validate image format
  const validation = validateImageFormat(photoPath);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  // Check if file exists
  if (!fileExists(photoPath)) {
    return {
      success: false,
      error: vscode.l10n.t('File not found: {0}', photoPath),
    };
  }

  // Save to configuration
  await savePhotoPathToConfig(photoPath);

  return {
    success: true,
    photoPath,
  };
}
