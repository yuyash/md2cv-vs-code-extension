/**
 * Validator Tests
 */

import { describe, it, expect } from 'vitest';
import {
  validateFrontmatterFields,
  validateFrontmatterFormats,
  validateFrontmatterFieldNames,
  validateSections,
  validateCodeBlocks,
  validateDocument,
  ErrorCategory,
} from '../server/validator.js';
import { parseDocument } from '../server/parser.js';

describe('Validator', () => {
  describe('validateFrontmatterFields', () => {
    it('should return empty array when frontmatter is null', () => {
      const diagnostics = validateFrontmatterFields(null, {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      });

      expect(diagnostics).toEqual([]);
    });

    it('should warn about missing required fields', () => {
      const content = `---
name: Test User
---
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const diagnostics = validateFrontmatterFields(result.document!.frontmatter, {
        start: { line: 0, character: 0 },
        end: { line: 3, character: 0 },
      });

      // Should warn about missing email_address and phone_number
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics.some((d) => d.message.includes('email_address'))).toBe(true);
      expect(diagnostics.some((d) => d.message.includes('phone_number'))).toBe(true);
    });

    it('should not warn when all required fields are present', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const diagnostics = validateFrontmatterFields(result.document!.frontmatter, {
        start: { line: 0, character: 0 },
        end: { line: 5, character: 0 },
      });

      expect(diagnostics).toEqual([]);
    });
  });

  describe('validateFrontmatterFormats', () => {
    it('should return empty array when frontmatter is null', () => {
      const diagnostics = validateFrontmatterFormats(null);
      expect(diagnostics).toEqual([]);
    });

    it('should warn about invalid date format', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
dob: 15/01/1990
---
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const diagnostics = validateFrontmatterFormats(result.document!.frontmatter);

      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].category).toBe(ErrorCategory.DATE_FORMAT_ERROR);
    });

    it('should accept valid date format', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
dob: 1990-01-15
---
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const diagnostics = validateFrontmatterFormats(result.document!.frontmatter);

      expect(diagnostics).toEqual([]);
    });
  });

  describe('validateFrontmatterFieldNames', () => {
    it('should return empty array when frontmatter is null', () => {
      const diagnostics = validateFrontmatterFieldNames(null);
      expect(diagnostics).toEqual([]);
    });

    it('should warn about unknown field names', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
unknownfield: value
---
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const diagnostics = validateFrontmatterFieldNames(result.document!.frontmatter);

      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].category).toBe(ErrorCategory.FRONTMATTER_UNKNOWN_FIELD);
    });

    it('should suggest similar field names for typos', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
emial_address: typo@example.com
---
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const diagnostics = validateFrontmatterFieldNames(result.document!.frontmatter);

      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].message).toContain('Did you mean');
    });
  });

  describe('validateSections', () => {
    it('should error on missing required sections for CV', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Summary

Test summary.
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const diagnostics = validateSections(
        result.document!.sections,
        'cv',
        { start: { line: 9, character: 0 }, end: { line: 9, character: 0 } },
        'en'
      );

      // CV requires experience section
      expect(diagnostics.some((d) => d.category === ErrorCategory.SECTION_MISSING)).toBe(true);
    });

    it('should not error when required sections are present', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Summary

Test summary.

# Experience

\`\`\`resume:experience
- company: Test Corp
  roles:
    - title: Engineer
      start: 2020-01
      end: present
\`\`\`
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const diagnostics = validateSections(
        result.document!.sections,
        'cv',
        { start: { line: 20, character: 0 }, end: { line: 20, character: 0 } },
        'en'
      );

      const missingErrors = diagnostics.filter((d) => d.category === ErrorCategory.SECTION_MISSING);
      expect(missingErrors).toEqual([]);
    });
  });

  describe('validateCodeBlocks', () => {
    it('should error on invalid code block type', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Experience

\`\`\`resume:invalid
- company: Test Corp
\`\`\`
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const diagnostics = validateCodeBlocks(result.document!.codeBlocks);

      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].category).toBe(ErrorCategory.CODEBLOCK_INVALID_TYPE);
    });

    it('should not error on valid code block types', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Experience

\`\`\`resume:experience
- company: Test Corp
  roles:
    - title: Engineer
      start: 2020-01
      end: present
\`\`\`
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const diagnostics = validateCodeBlocks(result.document!.codeBlocks);

      expect(diagnostics).toEqual([]);
    });
  });

  describe('validateDocument', () => {
    it('should validate complete document', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Summary

Test summary.

# Experience

\`\`\`resume:experience
- company: Test Corp
  roles:
    - title: Engineer
      start: 2020-01
      end: present
\`\`\`
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const validationResult = validateDocument(result.document!, { format: 'cv' });

      expect(validationResult.hasErrors).toBe(false);
    });

    it('should return hasErrors true when there are errors', () => {
      const content = `---
name: Test User
---

# Summary

Test summary.
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const validationResult = validateDocument(result.document!, { format: 'cv' });

      // Missing required sections should cause errors
      expect(validationResult.hasErrors).toBe(true);
    });

    it('should respect validation options', () => {
      const content = `---
name: Test User
---
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const validationResult = validateDocument(result.document!, {
        format: 'cv',
        validateFrontmatter: false,
        validateSections: false,
        validateCodeBlocks: false,
      });

      expect(validationResult.diagnostics).toEqual([]);
    });
  });
});
