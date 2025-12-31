import * as path from 'path';
import { SUPPORTED_IMAGE_EXTENSIONS } from 'md2cv/generator';

// Re-export for convenience
export { SUPPORTED_IMAGE_EXTENSIONS };

/**
 * Result of photo validation
 */
export interface PhotoValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate if a file path points to a supported image format
 * This is a pure function that can be tested without VS Code
 * @param filePath - Path to the image file
 * @returns Validation result with valid flag and optional error message
 */
export function validateImageFormat(filePath: string): PhotoValidationResult {
  if (!filePath || filePath.trim() === '') {
    return {
      valid: false,
      error: 'No file path provided',
    };
  }

  const extension = path.extname(filePath).toLowerCase().replace('.', '');

  if (!SUPPORTED_IMAGE_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `Unsupported image format. Supported formats: ${SUPPORTED_IMAGE_EXTENSIONS.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Check if a file extension is a supported image format
 * @param extension - File extension (with or without leading dot)
 * @returns true if supported, false otherwise
 */
export function isSupportedImageExtension(extension: string): boolean {
  const normalizedExt = extension.toLowerCase().replace('.', '');
  return SUPPORTED_IMAGE_EXTENSIONS.includes(normalizedExt);
}
