/**
 * Parser Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseDocument,
  isPositionInRange,
  findCodeBlockAtPosition,
  findSectionAtPosition,
  findContainingSectionAtPosition,
  isInFrontmatter,
  findFrontmatterFieldAtPosition,
} from '../server/parser.js';

describe('Parser', () => {
  describe('parseDocument', () => {
    it('should parse valid markdown document', () => {
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
      expect(result.errors).toEqual([]);
      expect(result.document?.frontmatter).not.toBeNull();
      expect(result.document?.sections.length).toBe(1);
    });

    it('should parse document with code blocks', () => {
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
      expect(result.document?.codeBlocks.length).toBe(1);
      expect(result.document?.codeBlocks[0].type).toBe('experience');
    });

    it('should handle empty document', () => {
      const result = parseDocument('');

      expect(result.document).not.toBeNull();
      expect(result.document?.frontmatter).toBeNull();
      expect(result.document?.sections).toEqual([]);
    });

    it('should handle document without frontmatter', () => {
      const content = `# Summary

Test summary.
`;
      const result = parseDocument(content);

      expect(result.document).not.toBeNull();
      expect(result.document?.frontmatter).toBeNull();
      expect(result.document?.sections.length).toBe(1);
    });
  });

  describe('isPositionInRange', () => {
    const range = {
      start: { line: 5, character: 0 },
      end: { line: 10, character: 20 },
    };

    it('should return true for position inside range', () => {
      expect(isPositionInRange({ line: 7, character: 10 }, range)).toBe(true);
    });

    it('should return true for position at range start', () => {
      expect(isPositionInRange({ line: 5, character: 0 }, range)).toBe(true);
    });

    it('should return true for position at range end', () => {
      expect(isPositionInRange({ line: 10, character: 20 }, range)).toBe(true);
    });

    it('should return false for position before range', () => {
      expect(isPositionInRange({ line: 3, character: 0 }, range)).toBe(false);
    });

    it('should return false for position after range', () => {
      expect(isPositionInRange({ line: 15, character: 0 }, range)).toBe(false);
    });

    it('should return false for position on start line but before start character', () => {
      const rangeWithChar = {
        start: { line: 5, character: 10 },
        end: { line: 10, character: 20 },
      };
      expect(isPositionInRange({ line: 5, character: 5 }, rangeWithChar)).toBe(false);
    });

    it('should return false for position on end line but after end character', () => {
      expect(isPositionInRange({ line: 10, character: 25 }, range)).toBe(false);
    });
  });

  describe('findCodeBlockAtPosition', () => {
    it('should find code block at position', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Experience

\`\`\`resume:experience
- company: Test Corp
\`\`\`
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const codeBlock = findCodeBlockAtPosition(result.document!, { line: 9, character: 5 });

      expect(codeBlock).not.toBeNull();
      expect(codeBlock?.type).toBe('experience');
    });

    it('should return null when not in code block', () => {
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

      const codeBlock = findCodeBlockAtPosition(result.document!, { line: 8, character: 0 });

      expect(codeBlock).toBeNull();
    });
  });

  describe('findSectionAtPosition', () => {
    it('should find section at position', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Experience

Some content.
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const section = findSectionAtPosition(result.document!, { line: 6, character: 5 });

      expect(section).not.toBeNull();
      expect(section?.id).toBe('experience');
    });

    it('should return null when not in section', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const section = findSectionAtPosition(result.document!, { line: 2, character: 0 });

      expect(section).toBeNull();
    });
  });

  describe('findContainingSectionAtPosition', () => {
    it('should find containing section', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Experience

Some content here.

# Education

More content.
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const section = findContainingSectionAtPosition(result.document!, { line: 8, character: 0 });

      expect(section).not.toBeNull();
      expect(section?.id).toBe('experience');
    });

    it('should return last section before position', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Experience

Content.

# Education

More content.
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const section = findContainingSectionAtPosition(result.document!, { line: 12, character: 0 });

      expect(section).not.toBeNull();
      expect(section?.id).toBe('education');
    });
  });

  describe('isInFrontmatter', () => {
    it('should return true when in frontmatter', () => {
      const content = `---
name: Test User
email_address: test@example.com
---

# Summary
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      expect(isInFrontmatter(result.document!, { line: 1, character: 0 })).toBe(true);
      expect(isInFrontmatter(result.document!, { line: 2, character: 0 })).toBe(true);
    });

    it('should return false when not in frontmatter', () => {
      const content = `---
name: Test User
email_address: test@example.com
---

# Summary
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      expect(isInFrontmatter(result.document!, { line: 5, character: 0 })).toBe(false);
    });

    it('should return false when no frontmatter', () => {
      const content = `# Summary

Test summary.
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      expect(isInFrontmatter(result.document!, { line: 0, character: 0 })).toBe(false);
    });
  });

  describe('findFrontmatterFieldAtPosition', () => {
    it('should find frontmatter field at position', () => {
      const content = `---
name: Test User
email_address: test@example.com
---
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const field = findFrontmatterFieldAtPosition(result.document!, { line: 1, character: 2 });

      expect(field).not.toBeNull();
      expect(field?.key).toBe('name');
      expect(field?.value).toBe('Test User');
    });

    it('should return null when not on a field', () => {
      const content = `---
name: Test User
email_address: test@example.com
---
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const field = findFrontmatterFieldAtPosition(result.document!, { line: 0, character: 0 });

      expect(field).toBeNull();
    });

    it('should return null when no frontmatter', () => {
      const content = `# Summary

Test summary.
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const field = findFrontmatterFieldAtPosition(result.document!, { line: 0, character: 0 });

      expect(field).toBeNull();
    });
  });
});
