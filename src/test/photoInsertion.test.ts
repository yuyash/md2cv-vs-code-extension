/**
 * Photo Insertion Property-Based Tests
 *
 * Feature: md2cv-vscode-extension, Property 10: 画像形式バリデーション
 * Validates: Requirements 6.4
 *
 * For any file path:
 * - png, jpg, jpeg, tiff, tif extensions return valid: true
 * - All other extensions return valid: false
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateImageFormat, SUPPORTED_IMAGE_EXTENSIONS } from '../client/photoValidation';

/**
 * Arbitrary for supported image extensions
 */
const supportedExtensionArb = fc.constantFrom(...SUPPORTED_IMAGE_EXTENSIONS);

/**
 * Arbitrary for unsupported extensions (alphanumeric strings that are not supported extensions)
 */
const unsupportedExtensionArb = fc
  .string({ minLength: 1, maxLength: 10, unit: 'grapheme-ascii' })
  .map((s) => s.replace(/[^a-z0-9]/gi, 'x').toLowerCase())
  .filter((ext) => ext.length > 0 && !SUPPORTED_IMAGE_EXTENSIONS.includes(ext));

/**
 * Arbitrary for valid file names (without extension)
 */
const fileNameArb = fc
  .string({ minLength: 1, maxLength: 50, unit: 'grapheme-ascii' })
  .map((s) => s.replace(/[^a-zA-Z0-9_-]/g, 'x'))
  .filter((s) => s.length > 0);

/**
 * Arbitrary for directory paths
 */
const directoryPathArb = fc
  .array(
    fc
      .string({ minLength: 1, maxLength: 20, unit: 'grapheme-ascii' })
      .map((s) => s.replace(/[^a-zA-Z0-9_-]/g, 'x'))
      .filter((s) => s.length > 0),
    { minLength: 0, maxLength: 5 }
  )
  .map((parts) => (parts.length > 0 ? '/' + parts.join('/') + '/' : '/'));

describe('Photo Insertion Property Tests', () => {
  /**
   * Property 10: 画像形式バリデーション
   *
   * For any file path with png, jpg, jpeg, tiff, tif extension,
   * validateImageFormat returns valid: true
   */
  it('Property 10: Supported image formats return valid: true', () => {
    fc.assert(
      fc.property(directoryPathArb, fileNameArb, supportedExtensionArb, (dir, name, ext) => {
        const filePath = `${dir}${name}.${ext}`;
        const result = validateImageFormat(filePath);

        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10: 画像形式バリデーション
   *
   * For any file path with an unsupported extension,
   * validateImageFormat returns valid: false
   */
  it('Property 10: Unsupported image formats return valid: false', () => {
    fc.assert(
      fc.property(directoryPathArb, fileNameArb, unsupportedExtensionArb, (dir, name, ext) => {
        const filePath = `${dir}${name}.${ext}`;
        const result = validateImageFormat(filePath);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('Unsupported image format');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10: 画像形式バリデーション
   *
   * Case insensitivity: Extensions should be validated regardless of case
   */
  it('Property 10: Extension validation is case-insensitive', () => {
    fc.assert(
      fc.property(
        directoryPathArb,
        fileNameArb,
        supportedExtensionArb,
        fc.boolean(),
        (dir, name, ext, useUpperCase) => {
          const caseExt = useUpperCase ? ext.toUpperCase() : ext.toLowerCase();
          const filePath = `${dir}${name}.${caseExt}`;
          const result = validateImageFormat(filePath);

          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10: 画像形式バリデーション
   *
   * Empty or whitespace-only paths should return valid: false
   */
  it('Property 10: Empty paths return valid: false', () => {
    fc.assert(
      fc.property(fc.constantFrom('', ' ', '\t', '\n', '  ', '\t\t'), (whitespace) => {
        const result = validateImageFormat(whitespace);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }),
      { numRuns: 10 }
    );
  });
});
